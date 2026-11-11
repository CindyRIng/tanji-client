/**
 * 本地 REST 传输层（node:http，无框架依赖）
 * - 仅监听 127.0.0.1（由 config.host 控制）
 * - Bearer token 鉴权
 * - 按 operations.ts 自动路由 + zod 校验
 * - 统一 envelope 响应
 */
import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { OPERATIONS, type OperationDef } from '../../api/operations.js';
import { invoke } from '../../api/dispatch.js';
import { asTanjiError, TanjiError, ERROR_CATALOG, ErrorCodeSchema, type ErrorCode } from '../../errors/catalog.js';
import { failureEnvelope, successEnvelope } from '../../schemas/envelope.js';
import type { App } from '../../app.js';
import { docsJsonResponse, readMcpToolsJson, readOpenApiJson, renderDocsHtml } from './docs.js';

const MAX_BODY_BYTES = 1024 * 1024;

interface CompiledRoute {
  op: OperationDef;
  regex: RegExp;
  paramNames: string[];
}

function compileRoutes(): CompiledRoute[] {
  const routes: CompiledRoute[] = [];
  for (const op of OPERATIONS) {
    const { path } = op.rest;
    const paramNames: string[] = [];
    const pattern = path
      .split('/')
      .map((seg) => {
        const m = /^\{(.+)\}$/.exec(seg);
        if (m) {
          paramNames.push(m[1]!);
          return '([^/]+)';
        }
        return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('/');
    routes.push({ op, regex: new RegExp(`^${pattern}$`), paramNames });
  }
  return routes;
}

const ROUTES = compileRoutes();

function requestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(body);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > MAX_BODY_BYTES) throw new TanjiError('BAD_REQUEST', 'request body too large');
    chunks.push(buf);
  }
  if (chunks.length === 0) return undefined;
  const text = Buffer.concat(chunks).toString('utf-8');
  try {
    return JSON.parse(text);
  } catch {
    throw new TanjiError('BAD_REQUEST', 'invalid JSON body');
  }
}

function queryObject(url: URL): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) out[k] = v;
  return out;
}

function bearerToken(req: IncomingMessage): string | undefined {
  const auth = req.headers.authorization;
  if (!auth) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  return m?.[1];
}

export function createRestServer(app: App): http.Server {
  return http.createServer(async (req, res) => {
    const rid = requestId();
    const started = Date.now();
    const method = (req.method ?? 'GET').toUpperCase();
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);

    // 文档端点（无需鉴权，仅本机）
    if (method === 'GET' && (url.pathname === '/docs' || url.pathname === '/docs/')) {
      try {
        if (url.searchParams.get('format') === 'json') {
          sendJson(res, 200, { ok: true, data: docsJsonResponse(), meta: { requestId: rid, timestamp: new Date().toISOString(), tookMs: Date.now() - started, schemaVersion: '1.0', cached: false, warnings: [] }, error: null });
        } else {
          const html = renderDocsHtml();
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          res.end(html);
        }
      } catch (err) {
        sendJson(res, 500, failureEnvelope({ code: 'INTERNAL', message: String(err), retryable: false }, { requestId: rid, tookMs: Date.now() - started }));
      }
      return;
    }
    if (method === 'GET' && url.pathname === '/openapi.json') {
      try {
        sendJson(res, 200, readOpenApiJson());
      } catch (err) {
        sendJson(res, 404, failureEnvelope({ code: 'NOT_FOUND', message: String(err), retryable: false }, { requestId: rid, tookMs: Date.now() - started }));
      }
      return;
    }
    if (method === 'GET' && url.pathname === '/mcp-tools.json') {
      try {
        sendJson(res, 200, readMcpToolsJson());
      } catch (err) {
        sendJson(res, 404, failureEnvelope({ code: 'NOT_FOUND', message: String(err), retryable: false }, { requestId: rid, tookMs: Date.now() - started }));
      }
      return;
    }
    if (method === 'GET' && url.pathname === '/') {
      res.writeHead(302, { location: '/docs' });
      res.end();
      return;
    }

    const matches = ROUTES.map((r) => {
      const m = r.regex.exec(url.pathname);
      return m ? { route: r, match: m } : null;
    }).filter((x): x is { route: CompiledRoute; match: RegExpExecArray } => x !== null);

    if (matches.length === 0) {
      sendJson(
        res,
        404,
        failureEnvelope(
          { code: 'NOT_FOUND', message: `no route for ${method} ${url.pathname}`, retryable: false },
          { requestId: rid, tookMs: Date.now() - started },
        ),
      );
      return;
    }
    const byMethod = matches.find((m) => m.route.op.rest.method === method);
    if (!byMethod) {
      const allowed = [...new Set(matches.map((m) => m.route.op.rest.method))].join(', ');
      res.setHeader('allow', allowed);
      sendJson(
        res,
        405,
        failureEnvelope(
          { code: 'METHOD_NOT_ALLOWED', message: `${method} not allowed`, retryable: false },
          { requestId: rid, tookMs: Date.now() - started },
        ),
      );
      return;
    }

    const { route, match } = byMethod;
    const op = route.op;
    try {
      // 鉴权
      if (op.auth === 'bearer' && bearerToken(req) !== app.config.apiToken) {
        throw new TanjiError('UNAUTHORIZED', 'invalid or missing bearer token');
      }

      const pathParams: Record<string, string> = {};
      route.paramNames.forEach((name, i) => {
        pathParams[name] = decodeURIComponent(match[i + 1] ?? '');
      });
      if (op.rest.pathParams) op.rest.pathParams.parse(pathParams);

      const rawQuery = queryObject(url);
      const query = op.rest.query ? (op.rest.query.parse(rawQuery) as Record<string, unknown>) : rawQuery;

      let body: unknown = undefined;
      if (op.rest.body) {
        body = await readBody(req);
        const parsed = op.rest.body.safeParse(body);
        if (!parsed.success) throw parsed.error;
        body = parsed.data;
      }

      const result = await invoke(app.service, op.id, { pathParams, query, body });
      const tookMs = Date.now() - started;
      sendJson(
        res,
        200,
        successEnvelope(result.data, {
          requestId: rid,
          tookMs,
          cached: result.cached ?? false,
          ...(result.pagination ? { pagination: result.pagination } : {}),
        }),
      );
      logAccess(app, op, rid, 200, tookMs, url.pathname);
    } catch (err) {
      const e = asTanjiError(err);
      sendJson(
        res,
        e.httpStatus,
        failureEnvelope(e.toJSON(), { requestId: rid, tookMs: Date.now() - started }),
      );
      logAccess(app, op, rid, e.httpStatus, Date.now() - started, url.pathname, e.code);
    }
  });
}

function logAccess(app: App, op: OperationDef, rid: string, status: number, tookMs: number, path: string, code?: ErrorCode): void {
  const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
  const fields = {
    op: op.id,
    requestId: rid,
    method: op.rest.method,
    path,
    status,
    tookMs,
    ...(code ? { code } : {}),
  };
  app.logger[level]('http.access', fields);
}

export async function startRestServer(app: App): Promise<{ server: http.Server; close: () => Promise<void> }> {
  const server = createRestServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(app.config.port, app.config.host, () => resolve());
  });
  return {
    server,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

export const ERROR_STATUS: Record<ErrorCode, number> = Object.fromEntries(
  Object.entries(ERROR_CATALOG).map(([code, meta]) => [code, meta.http]),
) as Record<ErrorCode, number>;

export { ErrorCodeSchema, z };
