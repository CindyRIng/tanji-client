/**
 * 远程 REST 客户端：CLI/MCP 代理到常驻服务，避免与 owner 进程争抢 profile 锁。
 */
import type { Config } from '../config/schema.js';
import type { InvocationInput, InvocationResult } from '../api/dispatch.js';
import { getOperation } from '../api/operations.js';
import { TanjiError, type ErrorCode } from '../errors/catalog.js';

export interface RemoteEnvelope {
  ok: boolean;
  data?: unknown;
  meta?: {
    requestId?: string;
    tookMs?: number;
    cached?: boolean;
    pagination?: unknown;
    [key: string]: unknown;
  };
  error?: {
    code?: ErrorCode;
    message?: string;
    retryAfterMs?: number;
    details?: Record<string, unknown>;
  };
}

/** 解析服务地址：显式参数 > TANJI_CLIENT_URL > 配置文件 host/port */
export function serviceBaseUrl(config: Config, explicit?: string): string {
  const raw = explicit ?? process.env.TANJI_CLIENT_URL ?? `http://${config.host}:${config.port}`;
  return raw.replace(/\/+$/, '');
}

function queryValue(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (Array.isArray(v)) return v.map(String).join(',');
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

export class RemoteTanjiClient {
  readonly baseUrl: string;

  constructor(
    private readonly cfg: Config,
    baseUrl?: string,
  ) {
    this.baseUrl = serviceBaseUrl(cfg, baseUrl);
  }

  buildRequest(operationId: string, input: InvocationInput): { url: string; init: RequestInit } {
    const op = getOperation(operationId);
    const pathParams = input.pathParams ?? {};
    const path = op.rest.path.replace(/\{([^}]+)\}/g, (_m, key: string) =>
      encodeURIComponent(String(pathParams[key] ?? '')),
    );
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(input.query ?? {})) {
      const text = queryValue(value);
      if (text !== undefined) qs.set(key, text);
    }
    const url = `${this.baseUrl}${path}${[...qs.keys()].length ? `?${qs.toString()}` : ''}`;
    const headers: Record<string, string> = { authorization: `Bearer ${this.cfg.apiToken}` };
    const init: RequestInit = { method: op.rest.method, headers };
    if (op.rest.body && input.body !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(input.body);
    }
    init.signal = AbortSignal.timeout(this.cfg.session.requestTimeoutMs + 30_000);
    return { url, init };
  }

  /** 返回服务端原始 envelope（包括 ok=false），网络/协议异常抛错 */
  async callEnvelope(operationId: string, input: InvocationInput): Promise<RemoteEnvelope> {
    const { url, init } = this.buildRequest(operationId, input);
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (err) {
      throw new TanjiError(
        'SERVICE_UNAVAILABLE',
        `无法连接 tanji-client 常驻服务：${this.baseUrl}（请先运行 tanji serve，或使用 tanji mcp --local）`,
        { details: { baseUrl: this.baseUrl }, cause: err },
      );
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch (err) {
      throw new TanjiError('UPSTREAM_CHANGED', `常驻服务返回非 JSON（HTTP ${response.status}）`, {
        details: { status: response.status },
        cause: err,
      });
    }
    if (!payload || typeof payload !== 'object' || typeof (payload as { ok?: unknown }).ok !== 'boolean') {
      throw new TanjiError('UPSTREAM_CHANGED', '常驻服务返回的 envelope 结构不正确', {
        details: { status: response.status },
      });
    }
    return payload as RemoteEnvelope;
  }

  async invoke(operationId: string, input: InvocationInput): Promise<InvocationResult> {
    const envelope = await this.callEnvelope(operationId, input);
    if (!envelope.ok) {
      throw new TanjiError(envelope.error?.code ?? 'INTERNAL', envelope.error?.message ?? '常驻服务返回错误', {
        ...(envelope.error?.retryAfterMs !== undefined ? { retryAfterMs: envelope.error.retryAfterMs } : {}),
        ...(envelope.error?.details ? { details: envelope.error.details } : {}),
      });
    }
    const meta = envelope.meta;
    return {
      data: envelope.data,
      ...(meta?.pagination ? { pagination: meta.pagination as never } : {}),
      cached: meta?.cached ?? false,
    };
  }
}
