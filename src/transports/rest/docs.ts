/**
 * REST 交互文档（/docs）与 OpenAPI（/openapi.json）
 * 自包含 HTML，不依赖外部 CDN；内容由 operations 注册表实时生成。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OPERATIONS, type OperationDef } from '../../api/operations.js';
import { ERROR_CATALOG } from '../../errors/catalog.js';
import { toJsonSchema, type JsonSchema } from '../../generators/json-schema.js';
import { VERSION } from '../../service.js';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function typeOf(schema: JsonSchema | undefined): string {
  if (!schema) return 'unknown';
  if (typeof schema.$ref === 'string') return schema.$ref.split('/').pop() ?? 'ref';
  if (Array.isArray(schema.enum)) return `enum(${(schema.enum as unknown[]).join(' | ')})`;
  if (Array.isArray(schema.oneOf)) return (schema.oneOf as JsonSchema[]).map(typeOf).join(' | ');
  if (schema.type === 'array') return `array&lt;${typeOf(schema.items as JsonSchema)}&gt;`;
  return esc(String(schema.type ?? 'object'));
}

interface Row {
  name: string;
  in: string;
  type: string;
  required: boolean;
  description: string;
  defaultValue?: unknown;
}

function rowsOf(op: OperationDef): Row[] {
  const out: Row[] = [];
  const add = (schema: unknown, where: string) => {
    if (!schema) return;
    const j = toJsonSchema(schema as never) as JsonSchema;
    const required = (j.required as string[]) ?? [];
    for (const [name, s] of Object.entries((j.properties as Record<string, JsonSchema>) ?? {})) {
      out.push({
        name,
        in: where,
        type: typeOf(s),
        required: required.includes(name),
        description: (s.description as string | undefined) ?? '',
        ...(s.default !== undefined ? { defaultValue: s.default } : {}),
      });
    }
  };
  add(op.rest.pathParams, 'path');
  add(op.rest.query, 'query');
  add(op.rest.body, 'body');
  return out;
}

function curlExample(op: OperationDef): string {
  const headers = ["-H 'content-type: application/json'"];
  if (op.auth === 'bearer') headers.push("-H 'Authorization: Bearer $TANJI_API_TOKEN'");
  const body = op.rest.body
    ? ` \\\n  -d '${JSON.stringify(exampleBody(op), null, 2).replace(/\n/g, '\n  ')}'`
    : '';
  return `curl -s -X ${op.rest.method} 'http://127.0.0.1:8787${op.rest.path}' \\\n  ${headers.join(' \\\n  ')}${body}`;
}

function exampleBody(op: OperationDef): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (op.rest.body) {
    const j = toJsonSchema(op.rest.body) as JsonSchema;
    for (const [k, s] of Object.entries((j.properties as Record<string, JsonSchema>) ?? {})) {
      if (s.default !== undefined) out[k] = s.default;
      else if (s.type === 'string') out[k] = 'string';
      else if (s.type === 'number' || s.type === 'integer') out[k] = 0;
      else if (s.type === 'boolean') out[k] = true;
      else out[k] = {};
    }
  }
  return out;
}

function responseSchemaJson(op: OperationDef): string {
  try {
    return JSON.stringify(toJsonSchema(op.response), null, 2);
  } catch {
    return '{}';
  }
}

function docsJson(): unknown {
  return {
    schemaVersion: '1.0',
    clientVersion: VERSION,
    server: 'http://127.0.0.1:8787',
    operations: OPERATIONS.map((op) => ({
      id: op.id,
      summary: op.summary,
      description: op.description,
      auth: op.auth,
      sideEffects: op.sideEffects,
      rest: { method: op.rest.method, path: op.rest.path },
      mcp: op.mcp ? { tool: op.mcp.tool, description: op.mcp.description } : null,
      cli: op.cli ?? null,
      requestFields: rowsOf(op),
      errors: op.errors,
    })),
    errorCatalog: Object.entries(ERROR_CATALOG).map(([code, meta]) => ({ code, ...meta })),
    links: { openapi: '/openapi.json', docsJson: '/docs?format=json', mcpTools: '/mcp-tools.json' },
  };
}

function errorTable(): string {
  const rows = Object.entries(ERROR_CATALOG)
    .map(
      ([code, m]) =>
        `<tr><td><code>${code}</code></td><td>${m.http}</td><td>${m.retryable ? '是' : '否'}</td><td>${esc(m.description)}</td></tr>`,
    )
    .join('');
  return `<table><thead><tr><th>code</th><th>HTTP</th><th>retryable</th><th>说明</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function operationSection(op: OperationDef): string {
  const rows = rowsOf(op);
  const fields = rows.length
    ? `<table><thead><tr><th>字段</th><th>位置</th><th>类型</th><th>必填</th><th>说明</th><th>默认</th></tr></thead><tbody>${rows
        .map(
          (r) =>
            `<tr><td><code>${esc(r.name)}</code></td><td>${r.in}</td><td><code>${r.type}</code></td><td>${r.required ? '是' : '否'}</td><td>${esc(r.description)}</td><td>${r.defaultValue !== undefined ? `<code>${esc(JSON.stringify(r.defaultValue))}</code>` : '—'}</td></tr>`,
        )
        .join('')}</tbody></table>`
    : '<p class="muted">无参数</p>';
  const errors = op.errors.map((code) => `<code>${code}</code>`).join(' ');
  const mcp = op.mcp ? `<code>${op.mcp.tool}</code>` : '—';
  const cli = op.cli ? `<code>tanji ${op.cli.command}</code>` : '—';
  const auth = op.auth === 'bearer' ? 'Bearer token' : '无需鉴权';
  const side = op.sideEffects === 'quota' ? '<strong class="warn">消耗额度</strong>' : op.sideEffects === 'session' ? '会话' : '无';
  return `
  <section id="${esc(op.id)}" class="op">
    <h3><span class="method ${op.rest.method.toLowerCase()}">${op.rest.method}</span> <code>${esc(op.rest.path)}</code></h3>
    <p>${esc(op.summary)}${op.description ? `<br><span class="muted">${esc(op.description)}</span>` : ''}</p>
    <p class="meta">操作 ID: <code>${esc(op.id)}</code> · 鉴权: ${auth} · 副作用: ${side} · MCP: ${mcp} · CLI: ${cli}</p>
    ${fields}
    <details><summary>响应 schema（data）</summary><pre>${esc(responseSchemaJson(op))}</pre></details>
    <details><summary>cURL 示例</summary><pre>${esc(curlExample(op))}</pre></details>
    <p class="meta">可能错误: ${errors}</p>
  </section>`;
}

export function renderDocsHtml(): string {
  const nav = OPERATIONS.map((op) => `<li><a href="#${esc(op.id)}"><span class="method ${op.rest.method.toLowerCase()}">${op.rest.method}</span> <code>${esc(op.rest.path)}</code></a></li>`).join('');
  const sections = OPERATIONS.map(operationSection).join('\n');
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>tanji-client API v1.0 · 交互文档</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin:0; font: 14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans SC",sans-serif; color:#1f2328; background:#fff; }
  header { position:sticky; top:0; background:#fff; border-bottom:1px solid #d0d7de; padding:14px 24px; z-index:10; }
  header h1 { font-size:18px; margin:0 0 4px; }
  header .links a { margin-right:14px; color:#0969da; text-decoration:none; }
  .layout { display:flex; align-items:flex-start; }
  nav { width:320px; flex:0 0 320px; position:sticky; top:70px; max-height:calc(100vh - 70px); overflow:auto; border-right:1px solid #d0d7de; padding:14px 12px; }
  nav ul { list-style:none; margin:0; padding:0; }
  nav li { margin:4px 0; }
  nav a { color:#1f2328; text-decoration:none; display:block; padding:4px 6px; border-radius:6px; font-size:12px; }
  nav a:hover { background:#f6f8fa; }
  main { flex:1; padding:18px 28px 80px; max-width:1100px; }
  h2 { margin-top:28px; border-bottom:1px solid #d0d7de; padding-bottom:6px; }
  h3 { margin:22px 0 6px; }
  code { background:#f6f8fa; padding:1px 5px; border-radius:4px; font-family: ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; }
  pre { background:#f6f8fa; padding:12px; border-radius:8px; overflow:auto; font-size:12px; }
  table { border-collapse:collapse; width:100%; margin:8px 0 14px; font-size:13px; }
  th,td { border:1px solid #d0d7de; padding:6px 8px; text-align:left; vertical-align:top; }
  th { background:#f6f8fa; }
  .muted { color:#59636e; }
  .meta { font-size:12px; color:#59636e; }
  .op { border-top:1px dashed #d0d7de; padding-top:8px; }
  .method { display:inline-block; min-width:52px; text-align:center; padding:1px 6px; border-radius:4px; color:#fff; font-size:11px; font-weight:600; }
  .method.get { background:#1a7f37; } .method.post { background:#0969da; } .method.delete { background:#cf222e; } .method.put { background:#9a6700; }
  .warn { color:#cf222e; }
  .note { background:#fff8c5; border:1px solid #d4a72c; border-radius:8px; padding:10px 14px; }
  details { margin:8px 0; }
  summary { cursor:pointer; color:#0969da; }
</style>
</head>
<body>
<header>
  <h1>tanji-client API <span class="muted">v1.0</span></h1>
  <div class="links">
    <a href="/openapi.json">OpenAPI 3.1</a>
    <a href="/docs?format=json">文档 JSON</a>
    <a href="/mcp-tools.json">MCP tools</a>
    <a href="/v1/health">Health</a>
  </div>
</header>
<div class="layout">
<nav><strong>操作（${OPERATIONS.length}）</strong><ul>${nav}</ul></nav>
<main>
  <h2>通用约定</h2>
  <p class="note">REST 仅监听 <code>127.0.0.1</code>；除 <code>/v1/health</code> 与文档页外，均需 <code>Authorization: Bearer &lt;TANJI_API_TOKEN&gt;</code>。所有响应为统一 envelope：<code>{ ok, data, meta, error }</code>，<code>meta.schemaVersion = "1.0"</code>。分页字段见 <code>meta.pagination</code>。解锁类操作会消耗额度。</p>
  <h3>错误码</h3>
  ${errorTable()}
  <h3>操作</h3>
  ${sections}
</main>
</div>
</body>
</html>`;
}

export function readOpenApiJson(): unknown {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, '..', '..', '..', 'spec', 'openapi.json'),
    path.join(process.cwd(), 'spec', 'openapi.json'),
  ];
  const file = candidates.find((p) => fs.existsSync(p));
  if (!file) throw new Error('spec/openapi.json not found; run `npm run gen`');
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as unknown;
}

export function readMcpToolsJson(): unknown {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, '..', '..', '..', 'spec', 'mcp-tools.json'),
    path.join(process.cwd(), 'spec', 'mcp-tools.json'),
  ];
  const file = candidates.find((p) => fs.existsSync(p));
  if (!file) throw new Error('spec/mcp-tools.json not found; run `npm run gen`');
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as unknown;
}

export function docsJsonResponse(): unknown {
  return docsJson();
}
