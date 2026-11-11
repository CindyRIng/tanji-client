/**
 * 操作注册表：REST / MCP / CLI / OpenAPI 的单一事实源
 * 每个操作定义请求校验、响应 schema、错误码、副作用与各传输层绑定。
 */
import { z } from 'zod';
import { ErrorCodeSchema, type ErrorCode } from '../errors/catalog.js';
import { HealthResponseSchema, LoginRequestSchema, StatusSchema } from '../domain/status.js';
import { CompanyDetailSchema } from '../domain/company.js';
import { ContactListSchema, UnlockRequestSchema, UnlockResultSchema } from '../domain/contact.js';
import {
  CompaniesDetailRequestSchema,
  CompaniesListRequestSchema,
  QueryIdSchema,
  ContactsListRequestSchema,
  SearchAdvanceRequestSchema,
  SearchNameRequestSchema,
  SearchResultSchema,
} from '../domain/search.js';
import { FilterRegistrySchema } from '../domain/filters.js';
import { AccountsResponseSchema } from '../domain/accounts.js';
import {
  CacheClearRequestSchema,
  CacheClearResultSchema,
  CacheStatsSchema,
} from '../schemas/cache.js';
import { CompanyIdSchema, PageSchema, PageSizeSchema } from '../domain/common.js';

export type HttpMethod = 'GET' | 'POST' | 'DELETE';
export type SideEffect = 'none' | 'quota' | 'session';

export interface RestBinding {
  method: HttpMethod;
  /** OpenAPI 路径模板，如 /v1/companies/{id} */
  path: string;
  pathParams?: z.ZodObject;
  query?: z.ZodObject;
  body?: z.ZodTypeAny;
}

export interface McpBinding {
  tool: string;
  description: string;
  input: z.ZodTypeAny;
}

export interface CliBinding {
  /** CLI 命令，如 "search name" */
  command: string;
  description: string;
  example?: string;
}

export interface OperationDef {
  id: string;
  summary: string;
  description?: string;
  auth: 'bearer' | 'none';
  sideEffects: SideEffect;
  idempotent?: boolean;
  rest: RestBinding;
  mcp?: McpBinding;
  cli?: CliBinding;
  response: z.ZodTypeAny;
  errors: ErrorCode[];
}

const authErrors: ErrorCode[] = ['BAD_REQUEST', 'VALIDATION_FAILED', 'INTERNAL'];

export const OPERATIONS: OperationDef[] = [
  {
    id: 'health.get',
    summary: '存活探针',
    description: '不校验登录态，用于进程/容器健康检查。',
    auth: 'none',
    sideEffects: 'none',
    idempotent: true,
    rest: { method: 'GET', path: '/v1/health' },
    mcp: { tool: 'tanji_health', description: '查看 tanji-client 进程、浏览器、缓存健康状态', input: z.object({}) },
    cli: { command: 'health', description: '健康检查', example: 'tanji health' },
    response: HealthResponseSchema,
    errors: ['INTERNAL'],
  },
  {
    id: 'status.get',
    summary: '登录态 + 额度聚合状态',
    description: '对应原图 check status + credit session；返回登录态、健康度、个人日/月额度、企业月额度、结算日。',
    auth: 'bearer',
    sideEffects: 'none',
    idempotent: true,
    rest: { method: 'GET', path: '/v1/status' },
    mcp: { tool: 'tanji_status', description: '查看登录态与剩余日/月额度；调用搜索/解锁前应先检查', input: z.object({}) },
    cli: { command: 'status', description: '查看登录态与额度', example: 'tanji status' },
    response: StatusSchema,
    errors: [...authErrors, 'AUTH_REQUIRED', 'LOGIN_FAILED', 'CAPTCHA_REQUIRED', 'TIMEOUT', 'UPSTREAM_UNAVAILABLE'],
  },
  {
    id: 'session.login',
    summary: '登录探迹',
    description: '先用保存的手机号+密码自动登录；interactive=true 时启动可见浏览器供人工完成验证码。',
    auth: 'bearer',
    sideEffects: 'session',
    rest: { method: 'POST', path: '/v1/session/login', body: LoginRequestSchema },
    mcp: { tool: 'tanji_session_login', description: '启动浏览器并登录探迹（可能触发验证码，需人工）', input: LoginRequestSchema },
    cli: { command: 'login', description: '登录探迹（--interactive 人工处理验证码）', example: 'tanji login --interactive' },
    response: StatusSchema,
    errors: [...authErrors, 'LOGIN_FAILED', 'CAPTCHA_REQUIRED', 'TIMEOUT', 'UPSTREAM_UNAVAILABLE'],
  },
  {
    id: 'search.name',
    summary: '按名称/人名/地址/统一码/联系方式搜索企业',
    description: '映射企业查询接口 /api/enterprises/search；返回企业摘要列表与 queryId（供翻页）。',
    auth: 'bearer',
    sideEffects: 'none',
    rest: { method: 'POST', path: '/v1/search/name', body: SearchNameRequestSchema },
    mcp: {
      tool: 'tanji_search_name',
      description: '企业查询：按关键词搜索，field 指定命中范围（name/legalRepresentative/address/socialCreditCode/contact）',
      input: SearchNameRequestSchema,
    },
    cli: { command: 'search name', description: '名称搜索', example: 'tanji search name --name 团车 --field name' },
    response: SearchResultSchema,
    errors: [...authErrors, 'AUTH_REQUIRED', 'RATE_LIMITED', 'TIMEOUT', 'UPSTREAM_CHANGED', 'UPSTREAM_UNAVAILABLE'],
  },
  {
    id: 'search.advance',
    summary: '高级筛选搜索',
    description: '映射 /api/advance-search-v2；filters 使用 FilterGroup（见 /v1/filters/registry 的 345 个条件 key）。',
    auth: 'bearer',
    sideEffects: 'none',
    rest: { method: 'POST', path: '/v1/search/advance', body: SearchAdvanceRequestSchema },
    mcp: {
      tool: 'tanji_search_advance',
      description: '高级筛选：多条件（行业/地区/注册资本/风险等）搜索企业',
      input: SearchAdvanceRequestSchema,
    },
    cli: {
      command: 'search advance',
      description: '高级筛选（--filter <json> 或 --filter-file <path>）',
      example: `tanji search advance --filter '{"relation":"all","conditions":[{"key":"industriesV2","op":"anyOf","value":["制造业"]}]}'`,
    },
    response: SearchResultSchema,
    errors: [...authErrors, 'AUTH_REQUIRED', 'RATE_LIMITED', 'TIMEOUT', 'UPSTREAM_CHANGED', 'UPSTREAM_UNAVAILABLE'],
  },
  {
    id: 'companies.list',
    summary: '按 queryId 翻页',
    description: '复用 search.name / search.advance 生成的 queryId 翻页；最多 pageSize 100。',
    auth: 'bearer',
    sideEffects: 'none',
    idempotent: true,
    rest: {
      method: 'GET',
      path: '/v1/companies',
      query: z.object({
        queryId: QueryIdSchema,
        page: PageSchema,
        pageSize: PageSizeSchema,
        refresh: z.enum(['true', 'false']).optional(),
      }),
    },
    mcp: { tool: 'tanji_list_companies', description: '按 queryId 翻页获取企业列表', input: CompaniesListRequestSchema },
    cli: { command: 'companies list', description: '按 queryId 翻页', example: 'tanji companies list --query-id q_20261109_ab12cd --page 2' },
    response: SearchResultSchema,
    errors: [...authErrors, 'NOT_FOUND', 'AUTH_REQUIRED', 'RATE_LIMITED', 'TIMEOUT', 'UPSTREAM_CHANGED'],
  },
  {
    id: 'companies.detail',
    summary: '企业详情',
    description: '返回工商信息、股东、主要人员、分支、办公地址等；默认走缓存（TTL 7 天）。',
    auth: 'bearer',
    sideEffects: 'none',
    idempotent: true,
    rest: {
      method: 'GET',
      path: '/v1/companies/{id}',
      pathParams: z.object({ id: CompanyIdSchema }),
      query: z.object({
        refresh: z.enum(['true', 'false']).optional(),
        sections: z.string().optional().meta({ description: '逗号分隔：basic,detail,holders,members,invests,branches,alterations；空=完整' }),
      }),
    },
    mcp: { tool: 'tanji_company_detail', description: '企业详情（工商/股东/人员/地址等）', input: CompaniesDetailRequestSchema },
    cli: { command: 'companies detail', description: '企业详情', example: 'tanji companies detail --id 37623000277f335b' },
    response: CompanyDetailSchema,
    errors: [...authErrors, 'NOT_FOUND', 'AUTH_REQUIRED', 'TIMEOUT', 'UPSTREAM_CHANGED', 'NOT_IMPLEMENTED'],
  },
  {
    id: 'contacts.list',
    summary: '企业联系人',
    description: '未解锁时返回空列表；解锁后返回明文手机/固话/邮箱（contactName 仍可能脱敏）。',
    auth: 'bearer',
    sideEffects: 'none',
    idempotent: true,
    rest: {
      method: 'GET',
      path: '/v1/companies/{id}/contacts',
      pathParams: z.object({ id: CompanyIdSchema }),
      query: z.object({
        refresh: z.enum(['true', 'false']).optional(),
        types: z.string().optional().meta({ description: '逗号分隔：mobile,phone,email' }),
      }),
    },
    mcp: { tool: 'tanji_list_contacts', description: '企业联系人列表（未解锁为空）', input: ContactsListRequestSchema },
    cli: { command: 'contacts', description: '企业联系人', example: 'tanji contacts --id 37623000277f335b' },
    response: ContactListSchema,
    errors: [...authErrors, 'NOT_FOUND', 'AUTH_REQUIRED', 'TIMEOUT', 'UPSTREAM_CHANGED'],
  },
  {
    id: 'companies.unlock',
    summary: '解锁企业（消耗 1 个额度点）',
    description: '调用 PUT /api/lead/unlock；默认只打 1 个上游调用并走 priority 通道（可插队）。必须显式 confirm=true。quota/contacts=true 时额外查询额度/联系人（各多 1 次上游调用）。',
    auth: 'bearer',
    sideEffects: 'quota',
    idempotent: true,
    rest: {
      method: 'POST',
      path: '/v1/companies/{id}/unlock',
      pathParams: z.object({ id: CompanyIdSchema }),
      body: UnlockRequestSchema,
    },
    mcp: {
      tool: 'tanji_unlock_company',
      description: '解锁企业（扣 1 额度；必须 confirm=true；可选 quota/contacts 额外查询）',
      input: z.object({
        id: CompanyIdSchema,
        confirm: z.literal(true),
        idempotencyKey: z.string().optional(),
        quota: z.boolean().optional(),
        contacts: z.boolean().optional(),
      }),
    },
    cli: { command: 'unlock', description: '解锁企业（--confirm）', example: 'tanji unlock --id 37623000277f335b --confirm [--with-contacts] [--with-quota]' },
    response: UnlockResultSchema,
    errors: [
      ...authErrors,
      'AUTH_REQUIRED',
      'LOGIN_FAILED',
      'CAPTCHA_REQUIRED',
      'QUOTA_EXHAUSTED',
      'CONFLICT',
      'RATE_LIMITED',
      'TIMEOUT',
      'UPSTREAM_CHANGED',
    ],
  },
  {
    id: 'accounts.list',
    summary: '账号列表与运行状态',
    description: '列出配置中的账号（多账号时每个账号独立 profile/cache/端口/进程）。',
    auth: 'bearer',
    sideEffects: 'none',
    idempotent: true,
    rest: { method: 'GET', path: '/v1/accounts' },
    mcp: { tool: 'tanji_accounts', description: '列出账号及其运行状态', input: z.object({}) },
    cli: { command: 'accounts list', description: '账号列表与运行状态', example: 'tanji accounts list' },
    response: AccountsResponseSchema,
    errors: [...authErrors],
  },
  {
    id: 'cache.stats',
    summary: '缓存统计',
    auth: 'bearer',
    sideEffects: 'none',
    idempotent: true,
    rest: { method: 'GET', path: '/v1/cache/stats' },
    mcp: { tool: 'tanji_cache_stats', description: '查看本地缓存统计', input: z.object({}) },
    cli: { command: 'cache stats', description: '缓存统计', example: 'tanji cache stats' },
    response: CacheStatsSchema,
    errors: [...authErrors, 'CACHE_ERROR'],
  },
  {
    id: 'cache.clear',
    summary: '清理缓存',
    auth: 'bearer',
    sideEffects: 'none',
    rest: { method: 'DELETE', path: '/v1/cache', body: CacheClearRequestSchema },
    mcp: { tool: 'tanji_cache_clear', description: '清空或按前缀清理缓存', input: CacheClearRequestSchema },
    cli: { command: 'cache clear', description: '清缓存', example: 'tanji cache clear --all' },
    response: CacheClearResultSchema,
    errors: [...authErrors, 'CACHE_ERROR'],
  },
  {
    id: 'filters.registry',
    summary: '筛选条件注册表',
    description: '返回探迹高级筛选全量条件（12 类 / 345 个 UI 可见条件，含字段 key、控件、候选值来源）。',
    auth: 'bearer',
    sideEffects: 'none',
    idempotent: true,
    rest: { method: 'GET', path: '/v1/filters/registry' },
    mcp: {
      tool: 'tanji_filter_registry',
      description: '查询高级筛选可用条件（key/label/控件/类别）',
      input: z.object({ category: z.string().optional(), keyword: z.string().optional() }),
    },
    cli: { command: 'filters registry', description: '筛选条件注册表', example: 'tanji filters registry' },
    response: FilterRegistrySchema,
    errors: [...authErrors, 'NOT_FOUND'],
  },
];

export const OPERATION_MAP: ReadonlyMap<string, OperationDef> = new Map(OPERATIONS.map((o) => [o.id, o]));

export function getOperation(id: string): OperationDef {
  const op = OPERATION_MAP.get(id);
  if (!op) throw new Error(`unknown operation: ${id}`);
  return op;
}

export function mcpTools(): Array<{ name: string; description: string; input: z.ZodTypeAny; operationId: string }> {
  return OPERATIONS.filter((o) => o.mcp).map((o) => ({
    name: o.mcp!.tool,
    description: o.mcp!.description,
    input: o.mcp!.input,
    operationId: o.id,
  }));
}

export { ErrorCodeSchema };
