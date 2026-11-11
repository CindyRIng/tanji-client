/**
 * CLI 详细帮助：直接由 operations 注册表 + zod schema 生成，保证与接口一致
 */
import { OPERATIONS, getOperation, type OperationDef } from '../../api/operations.js';
import { ERROR_CATALOG } from '../../errors/catalog.js';
import { toJsonSchema, type JsonSchema } from '../../generators/json-schema.js';
import { VERSION } from '../../service.js';

function typeOf(schema: JsonSchema | undefined): string {
  if (!schema) return 'unknown';
  if (typeof schema.$ref === 'string') return schema.$ref.split('/').pop() ?? 'ref';
  if (Array.isArray(schema.enum)) return `enum(${(schema.enum as unknown[]).join(' | ')})`;
  if (schema.const !== undefined) return `const(${JSON.stringify(schema.const)})`;
  if (Array.isArray(schema.oneOf)) return (schema.oneOf as JsonSchema[]).map(typeOf).join(' | ');
  if (Array.isArray(schema.anyOf)) return (schema.anyOf as JsonSchema[]).map(typeOf).join(' | ');
  if (schema.type === 'array') return `array<${typeOf(schema.items as JsonSchema)}>`;
  if (schema.type === 'object' && schema.properties) return 'object';
  return String(schema.type ?? 'object');
}

interface FieldRow {
  name: string;
  type: string;
  required: boolean;
  description: string;
  defaultValue?: unknown;
}

function collectFields(schema: JsonSchema | undefined, required: string[]): FieldRow[] {
  if (!schema || !schema.properties) return [];
  const props = schema.properties as Record<string, JsonSchema>;
  return Object.entries(props).map(([name, s]) => ({
    name,
    type: typeOf(s),
    required: required.includes(name),
    description: (s.description as string | undefined) ?? '',
    ...(s.default !== undefined ? { defaultValue: s.default } : {}),
  }));
}

function fieldsFor(op: OperationDef): FieldRow[] {
  const rows: FieldRow[] = [];
  if (op.rest.pathParams) {
    const j = toJsonSchema(op.rest.pathParams) as JsonSchema;
    rows.push(...collectFields(j, (j.required as string[]) ?? []).map((r) => ({ ...r, name: `${r.name} (path)` })));
  }
  if (op.rest.query) {
    const j = toJsonSchema(op.rest.query) as JsonSchema;
    rows.push(...collectFields(j, (j.required as string[]) ?? []).map((r) => ({ ...r, name: `${r.name} (query)` })));
  }
  if (op.rest.body) {
    const j = toJsonSchema(op.rest.body) as JsonSchema;
    rows.push(...collectFields(j, (j.required as string[]) ?? []).map((r) => ({ ...r, name: `${r.name} (body)` })));
  }
  // 去重（MCP 入参见 body/query）
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true)));
}

function formatField(r: FieldRow): string {
  const req = r.required ? '必填' : '可选';
  const def = r.defaultValue !== undefined ? `，默认 ${JSON.stringify(r.defaultValue)}` : '';
  return `    - ${r.name.padEnd(26)} ${r.type.padEnd(28)} ${req}${def}\n        ${r.description || '（无说明）'}`;
}

function responseFields(op: OperationDef): FieldRow[] {
  try {
    const j = toJsonSchema(op.response) as JsonSchema;
    return collectFields(j, (j.required as string[]) ?? []);
  } catch {
    return [];
  }
}

function errorLines(op: OperationDef): string[] {
  return op.errors.map((code) => {
    const meta = ERROR_CATALOG[code];
    return `    - ${code.padEnd(22)} HTTP ${String(meta.http).padEnd(4)} retryable=${meta.retryable ? 'yes' : 'no '}  ${meta.description}`;
  });
}

export function operationHelpText(operationId: string): string {
  const op = getOperation(operationId);
  const fields = fieldsFor(op);
  const resp = responseFields(op);
  const mcp = op.mcp ? `${op.mcp.tool}（${op.mcp.description}）` : '—';
  const side = op.sideEffects === 'quota' ? '消耗额度（解锁 1 家 = 1 额度点）' : op.sideEffects === 'session' ? '启动/切换浏览器会话' : '无';
  return [
    '',
    `命令:    tanji ${op.cli?.command ?? op.id}`,
    `操作 ID: ${op.id}    ${op.summary}`,
    ...(op.description ? [`说明:    ${op.description}`] : []),
    '',
    `REST:    ${op.rest.method} ${op.rest.path}`,
    `MCP:     ${mcp}`,
    `鉴权:    ${op.auth === 'bearer' ? 'Authorization: Bearer <TANJI_API_TOKEN>' : '无需鉴权'}`,
    `副作用:  ${side}${op.idempotent ? '（幂等）' : ''}`,
    '',
    fields.length ? '请求字段:' : '请求字段: 无',
    ...fields.map(formatField),
    '',
    `响应: 统一 envelope，data 为 ${typeOf(toJsonSchema(op.response) as JsonSchema)}`,
    ...(resp.length ? ['  data 字段:', ...resp.map(formatField)] : []),
    '',
    '可能错误:',
    ...errorLines(op),
    '',
    ...(op.cli?.example ? ['示例:', `    ${op.cli.example}`, ''] : []),
    '另见:',
    '    tanji docs ' + op.id + '                              # 本操作完整说明',
    '    tanji docs                                           # 全部操作索引',
    '    GET http://127.0.0.1:8787/docs                       # REST 交互文档',
    '    GET http://127.0.0.1:8787/openapi.json              # OpenAPI 3.1',
  ].join('\n');
}

export function rootHelpText(): string {
  return `
Env（优先级：CLI 参数 > 环境变量 > ~/.tanji-client/config.json > 默认值）
    TANJI_API_TOKEN          REST/MCP 鉴权 token（默认 change-me，必须修改）
    TANJI_PHONE / TANJI_PASSWORD  探迹登录凭据
    TANJI_PROFILE_DIR        cloak 浏览器 profile（默认 ~/.tanji-client/profile）
    TANJI_HEADLESS           是否无头（默认 true；首次登录/验证码建议 false）
    TANJI_PORT / TANJI_HOST  REST 监听（默认 8787 / 127.0.0.1）
    TANJI_CACHE_DB           SQLite 缓存路径（默认 ~/.tanji-client/cache.db）
    TANJI_RATE_PER_MIN       上游限频（默认 20 次/分）
    TANJI_MAX_PAGES          单次任务翻页上限（默认 5）
    TANJI_ACCOUNT            默认账号 id（多账号配置时）
    TANJI_LOG_FILE           日志文件（默认 ~/.tanji-client/logs/tanji.log）
    TANJI_LOG_MAX_BYTES      单个日志文件大小上限（默认 10MB）
    TANJI_LOG_KEEP           保留历史日志个数（默认 5）
    TANJI_LOG_STDOUT         是否同时输出到 stdout（默认 true）

多账号配置
    ~/.tanji-client/config.json 的 accounts: [{id, phone, password, profileDir?, cacheDb?, port?}]
    每个账号独立 profile/cache/端口；CLI/MCP 用 --account <id> 选择；
    REST 每个账号对应独立端口（用 tanji accounts list 可查），互不影响。

常用示例
    tanji health                                              # 健康检查（不需要登录）
    tanji login --interactive                                 # 首次登录（可见浏览器过验证码）
    tanji status                                              # 登录态 + 日/月额度
    tanji search name --name 团车 --field name                # 按名称搜索
    tanji search advance --filter-file ./filters.json         # 高级筛选（条件组 JSON）
    tanji companies list --query-id q_20261109_ab12cd --page 2
    tanji companies detail --id 37623000277f335b
    tanji contacts --id 37623000277f335b --types mobile,email
    tanji unlock --id 37623000277f335b --confirm              # 解锁（扣 1 额度）
    tanji filters registry --category 风险信息                # 345 个筛选条件
    tanji cache stats / tanji cache clear --all
    tanji serve --port 8787 [--start-browser]                 # REST + /docs（--start-browser 立刻拉起会话）
    tanji mcp [--account main]                                # MCP stdio server
    tanji accounts list                                       # 多账号与运行状态
    tanji accounts start main                                 # 后台常驻（单账号）
    tanji accounts start --all                                # 多账号全部常驻（每个账号独立进程/端口/profile）
    tanji accounts stop --all
    tanji service install|status|stop|uninstall               # systemd user 服务（开机自启+崩溃重启）

输出与退出码
    所有命令默认输出统一 envelope JSON：{ok, data, meta, error}
    成功退出码 0；参数错误 2；未登录/需人工 3；额度不足 4；上游改版 5；限流 6；不存在 7；未实现 8

错误码（节选）
    AUTH_REQUIRED      登录态失效（可重试，先 tanji login）
    CAPTCHA_REQUIRED   需要人工过验证码（tanji login --interactive）
    QUOTA_EXHAUSTED    额度不足（先 tanji status）
    RATE_LIMITED       触发限频（按 retryAfterMs 退避）
    UPSTREAM_CHANGED   探迹改版/字段变化（停止重试并反馈）
    NOT_IMPLEMENTED    当前版本未实现

更多文档
    tanji docs                         # 全部操作索引（参数/错误码/示例）
    tanji help <command>               # 任意命令的详细帮助
    docs/06-api-spec.md             # 接口规范（仓库内）
    http://127.0.0.1:8787/docs         # REST 交互文档（tanji serve 后）
    http://127.0.0.1:8787/openapi.json # OpenAPI 3.1
`;
}

export function operationsIndexText(): string {
  const rows = OPERATIONS.map((op) => {
    const cli = `tanji ${op.cli?.command ?? op.id}`;
    const rest = `${op.rest.method} ${op.rest.path}`;
    const mcp = op.mcp?.tool ?? '—';
    return [op.id.padEnd(20), rest.padEnd(38), mcp.padEnd(26), cli].join('  ');
  });
  return [
    `tanji-client v${VERSION} — 操作索引（${OPERATIONS.length} 个）`,
    '',
    ['操作 ID'.padEnd(20), 'REST'.padEnd(38), 'MCP tool'.padEnd(26), 'CLI'].join('  '),
    ...rows,
    '',
    '查看某个操作的完整说明：tanji docs <operationId>',
    '示例：tanji docs search.advance',
  ].join('\n');
}

export function cliDangerNote(operationId: string): string | undefined {
  const op = getOperation(operationId);
  if (op.sideEffects === 'quota') return '⚠️ 该操作会消耗 1 个额度点，必须先确认企业并检查额度。';
  if (op.sideEffects === 'session') return '⚠️ 该操作会启动/切换浏览器会话，可能需要人工处理验证码。';
  return undefined;
}
