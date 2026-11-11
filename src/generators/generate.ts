/**
 * 生成器：由 zod schema + operations 注册表生成
 *  - data/filter-registry.json           （345 个筛选条件的机器可读注册表）
 *  - spec/openapi.json                   （OpenAPI 3.1）
 *  - spec/mcp-tools.json                 （MCP 工具清单）
 *  - spec/cli-commands.json              （CLI 命令清单）
 *  - spec/schemas/*.json                 （领域模型 JSON Schema）
 *  - spec/operations/<id>.request.json / .response.json
 *
 * 用法：npm run gen           生成/覆盖
 *       npm run gen:check     检查是否与代码一致（CI 用）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { OPERATIONS, mcpTools } from '../api/operations.js';
import { envelopeSchemaFor, ResponseMetaSchema, ApiErrorSchema } from '../schemas/envelope.js';
import {
  FilterRegistrySchema,
  FilterCategoryNameSchema,
  FilterControlSchema,
  FilterRegistryEntrySchema,
  type FilterControl,
} from '../domain/filters.js';
import { CompanySummarySchema, CompanyDetailSchema } from '../domain/company.js';
import { ContactItemSchema, ContactListSchema, UnlockRequestSchema, UnlockResultSchema } from '../domain/contact.js';
import { HealthResponseSchema, LoginRequestSchema, StatusSchema } from '../domain/status.js';
import {
  CompaniesDetailRequestSchema,
  CompaniesListRequestSchema,
  ContactsListRequestSchema,
  SearchAdvanceRequestSchema,
  SearchNameRequestSchema,
  SearchResultSchema,
} from '../domain/search.js';
import { CacheClearRequestSchema, CacheClearResultSchema, CacheStatsSchema } from '../schemas/cache.js';
import { toJsonSchema, type JsonSchema } from './json-schema.js';
import { ERROR_CATALOG } from '../errors/catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPEC_DIR = path.join(ROOT, 'spec');
const DATA_DIR = path.join(ROOT, 'data');
const SOURCE_INDEX = path.join(ROOT, 'exploration', 'configs', 'filter-index.json');

interface IndexRow {
  grp: string;
  label: string;
  key: string;
  ctrl: string;
  unit: string;
  opts: string;
  hint: string;
}

interface FilterIndex {
  rows: Record<string, IndexRow[]>;
  hidden: Record<string, IndexRow[]>;
  extras: Array<{ key: string; label: string; ctrl: string }>;
}

function controlOf(ctrl: string): FilterControl {
  if (ctrl.includes('树形')) return 'tree';
  if (ctrl.includes('数值区间')) return 'numberRange';
  if (ctrl.includes('日期区间')) return 'dateRange';
  if (ctrl.includes('关键词')) return 'keyword';
  if (ctrl.includes('预设')) return 'preset';
  if (ctrl.includes('关联')) return 'relation';
  if (ctrl.includes('档位')) return 'tier';
  if (ctrl.includes('是/否')) return 'toggle';
  if (ctrl.includes('多选')) return 'multiSelect';
  if (ctrl.includes('单选') || ctrl.includes('下拉')) return 'select';
  return 'keyword';
}

function parseOptions(opts: string): { source?: string; count?: number } {
  const m = /`([^`]+)`\s*(\d+)?\s*项/.exec(opts);
  if (!m) return {};
  return { source: m[1], ...(m[2] ? { count: Number(m[2]) } : {}) };
}

interface UpstreamMeta {
  actionType?: number;
  inputType?: number | null;
  optionsSource?: string;
}

function loadUpstreamMeta(): Map<string, UpstreamMeta> {
  const file = path.join(ROOT, 'exploration', 'configs', 'lightweight-configs.json');
  const map = new Map<string, UpstreamMeta>();
  if (!fs.existsSync(file)) return map;
  const cfg = JSON.parse(fs.readFileSync(file, 'utf-8')) as {
    data?: { filter_options?: Array<{ value: string; action?: { type?: number }; input?: { type?: number; options_from?: string } }> };
  };
  for (const o of cfg.data?.filter_options ?? []) {
    map.set(o.value, {
      ...(o.action?.type !== undefined ? { actionType: o.action.type } : {}),
      ...(o.input?.type !== undefined ? { inputType: o.input.type } : {}),
      ...(o.input?.options_from ? { optionsSource: o.input.options_from } : {}),
    });
  }
  return map;
}

function buildFilterRegistry(index: FilterIndex): unknown {
  const upstream = loadUpstreamMeta();
  const categories = Object.entries(index.rows).map(([name, rows]) => {
    const map = new Map<string, z.infer<typeof FilterRegistryEntrySchema>[]>();
    for (const r of rows) {
      const { source, count } = parseOptions(r.opts);
      const entries = map.get(r.grp) ?? [];
      entries.push({
        key: r.key === '?' ? `unknown_${r.label}` : r.key,
        label: r.label,
        category: name,
        subCategory: r.grp,
        control: controlOf(r.ctrl),
        ...(r.unit ? { unit: r.unit } : {}),
        ...(r.hint ? { hint: r.hint } : {}),
        ...(source ? { optionsSource: source } : (upstream.get(r.key)?.optionsSource ? { optionsSource: upstream.get(r.key)!.optionsSource } : {})),
        ...(count !== undefined ? { optionCount: count } : {}),
        ...(upstream.get(r.key)?.actionType !== undefined ? { upstreamActionType: upstream.get(r.key)!.actionType } : {}),
        ...(upstream.get(r.key)?.inputType !== undefined ? { upstreamInputType: upstream.get(r.key)!.inputType } : {}),
        uiVisible: true,
      });
      map.set(r.grp, entries);
    }
    return {
      name,
      subCategories: [...map.entries()].map(([subName, entries]) => ({ name: subName, entries })),
    };
  });

  const hiddenEntries = Object.entries(index.hidden).flatMap(([category, rows]) =>
    rows.map((r) => ({
      key: r.key,
      label: r.label,
      category,
      subCategory: r.grp,
      control: controlOf(r.ctrl),
      ...(r.unit ? { unit: r.unit } : {}),
      ...(r.hint ? { hint: r.hint } : {}),
      ...(upstream.get(r.key)?.actionType !== undefined ? { upstreamActionType: upstream.get(r.key)!.actionType } : {}),
      ...(upstream.get(r.key)?.inputType !== undefined ? { upstreamInputType: upstream.get(r.key)!.inputType } : {}),
      uiVisible: false,
    })),
  );

  const uncategorizedEntries = index.extras.map((e) => ({
    key: e.key,
    label: e.label,
    category: '未分类',
    subCategory: '',
    control: controlOf(e.ctrl),
    ...(upstream.get(e.key)?.actionType !== undefined ? { upstreamActionType: upstream.get(e.key)!.actionType } : {}),
    ...(upstream.get(e.key)?.inputType !== undefined ? { upstreamInputType: upstream.get(e.key)!.inputType } : {}),
    ...(upstream.get(e.key)?.optionsSource ? { optionsSource: upstream.get(e.key)!.optionsSource } : {}),
    uiVisible: true,
  }));

  const total = categories.reduce(
    (n, c) => n + c.subCategories.reduce((m, sc) => m + sc.entries.length, 0),
    0,
  );

  return {
    schemaVersion: '1.0',
    source: 'docs/04-filter-catalog.md（探迹 lightweight-configs + UI 枚举，2026-11-09）',
    fetchedAt: '2026-11-09',
    totalEntries: total,
    categories,
    hiddenEntries,
    uncategorizedEntries,
  };
}

const NAMED_SCHEMAS: Array<[string, z.ZodTypeAny]> = [
  ['ResponseMeta', ResponseMetaSchema],
  ['ApiError', ApiErrorSchema],
  ['CompanySummary', CompanySummarySchema],
  ['CompanyDetail', CompanyDetailSchema],
  ['ContactItem', ContactItemSchema],
  ['ContactList', ContactListSchema],
  ['UnlockRequest', UnlockRequestSchema],
  ['UnlockResult', UnlockResultSchema],
  ['Status', StatusSchema],
  ['LoginRequest', LoginRequestSchema],
  ['HealthResponse', HealthResponseSchema],
  ['SearchNameRequest', SearchNameRequestSchema],
  ['SearchAdvanceRequest', SearchAdvanceRequestSchema],
  ['CompaniesListRequest', CompaniesListRequestSchema],
  ['CompaniesDetailRequest', CompaniesDetailRequestSchema],
  ['ContactsListRequest', ContactsListRequestSchema],
  ['SearchResult', SearchResultSchema],
  ['CacheStats', CacheStatsSchema],
  ['CacheClearRequest', CacheClearRequestSchema],
  ['CacheClearResult', CacheClearResultSchema],
  ['FilterRegistry', FilterRegistrySchema],
  ['FilterCategoryName', FilterCategoryNameSchema],
  ['FilterControl', FilterControlSchema],
];

function pathSchema(op: (typeof OPERATIONS)[number]): JsonSchema {
  const props: Record<string, JsonSchema> = {};
  if (op.rest.pathParams) {
    const p = toJsonSchema(op.rest.pathParams) as { properties?: Record<string, JsonSchema> };
    Object.assign(props, p.properties ?? {});
  }
  if (op.rest.query) {
    const q = toJsonSchema(op.rest.query) as { properties?: Record<string, JsonSchema> };
    Object.assign(props, q.properties ?? {});
  }
  if (op.rest.body) {
    const b = toJsonSchema(op.rest.body) as { properties?: Record<string, JsonSchema> };
    Object.assign(props, b.properties ?? {});
  }
  return { type: 'object', properties: props, additionalProperties: false };
}

function openApiSchema(): JsonSchema {
  const schemas: Record<string, JsonSchema> = {};
  for (const [name, schema] of NAMED_SCHEMAS) schemas[name] = toJsonSchema(schema);

  const paths: Record<string, Record<string, JsonSchema>> = {};
  for (const op of OPERATIONS) {
    const method = op.rest.method.toLowerCase();
    const operation: JsonSchema = {
      operationId: op.id,
      summary: op.summary,
      ...(op.description ? { description: op.description } : {}),
      tags: [op.id.split('.')[0]],
      ...(op.auth === 'bearer' ? { security: [{ bearerAuth: [] }] } : {}),
      responses: {},
    };
    const parameters: JsonSchema[] = [];
    if (op.rest.pathParams) {
      const p = toJsonSchema(op.rest.pathParams) as { properties?: Record<string, JsonSchema>; required?: string[] };
      for (const [name, schema] of Object.entries(p.properties ?? {})) {
        parameters.push({ name, in: 'path', required: true, schema });
      }
    }
    if (op.rest.query) {
      const q = toJsonSchema(op.rest.query) as { properties?: Record<string, JsonSchema>; required?: string[] };
      const required = q.required ?? [];
      for (const [name, schema] of Object.entries(q.properties ?? {})) {
        parameters.push({ name, in: 'query', required: required.includes(name), schema });
      }
    }
    if (parameters.length) operation.parameters = parameters;
    if (op.rest.body) {
      operation.requestBody = {
        required: true,
        content: { 'application/json': { schema: toJsonSchema(op.rest.body) } },
      };
    }
    const okEnvelope = envelopeSchemaFor(op.response, `Envelope_${op.id.replace(/\./g, '_')}`);
    operation.responses = {
      '200': {
        description: 'Success',
        content: { 'application/json': { schema: toJsonSchema(okEnvelope) } },
      },
      ...Object.fromEntries(
        [...new Set(op.errors)].map((code) => {
          const meta = codeMeta(code);
          return [
            String(meta.http),
            { description: `${code}: ${meta.title}`, content: { 'application/json': { schema: { $ref: '#/components/schemas/Envelope_Error' } } } },
          ];
        }),
      ),
    };
    paths[op.rest.path] = { ...(paths[op.rest.path] ?? {}), [method]: operation };
  }

  schemas.Envelope_Error = toJsonSchema(
    z.object({
      ok: z.literal(false),
      data: z.null(),
      meta: ResponseMetaSchema,
      error: ApiErrorSchema,
    }),
  ) as JsonSchema;

  return {
    openapi: '3.1.0',
    info: {
      title: 'tanji-client API',
      version: '1.0.0',
      description:
        '探迹 AI 拓客本地客户端接口：统一 envelope、Bearer 鉴权、分页与错误码。生成自 src/api/operations.ts。',
    },
    servers: [{ url: 'http://127.0.0.1:8787', description: '本地默认地址' }],
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
      schemas,
    },
    paths,
  };
}

function codeMeta(code: string): { http: number; title: string } {
  const meta = (ERROR_CATALOG as Record<string, { http: number; title: string }>)[code];
  return meta ?? { http: 500, title: code };
}

function mcpSpec(): JsonSchema {
  return {
    schemaVersion: '1.0',
    transport: 'stdio',
    tools: mcpTools().map((t) => ({
      name: t.name,
      description: t.description,
      operationId: t.operationId,
      inputSchema: toJsonSchema(t.input),
    })),
  };
}

function cliSpec(): JsonSchema {
  return {
    schemaVersion: '1.0',
    commands: OPERATIONS.filter((o) => o.cli).map((o) => ({
      command: `tanji ${o.cli!.command}`,
      description: o.cli!.description,
      ...(o.cli!.example ? { example: o.cli!.example } : {}),
      operationId: o.id,
    })),
  };
}

function operationSpecs(): Array<{ file: string; content: JsonSchema }> {
  const out: Array<{ file: string; content: JsonSchema }> = [];
  for (const op of OPERATIONS) {
    const reqSchema = pathSchema(op);
    out.push({ file: `operations/${op.id}.request.json`, content: reqSchema });
    out.push({
      file: `operations/${op.id}.response.json`,
      content: toJsonSchema(envelopeSchemaFor(op.response, `Envelope_${op.id.replace(/\./g, '_')}`)),
    });
  }
  return out;
}

function loadIndex(): FilterIndex {
  if (fs.existsSync(SOURCE_INDEX)) return JSON.parse(fs.readFileSync(SOURCE_INDEX, 'utf-8')) as FilterIndex;
  throw new Error('filter index not found: exploration/configs/filter-index.json missing');
}

function loadRegistrySource(): unknown {
  if (fs.existsSync(SOURCE_INDEX)) return buildFilterRegistry(loadIndex());
  const existing = path.join(DATA_DIR, 'filter-registry.json');
  if (fs.existsSync(existing)) return JSON.parse(fs.readFileSync(existing, 'utf-8')) as unknown;
  throw new Error('filter registry not found: exploration/configs/filter-index.json or data/filter-registry.json required');
}

export function generateAll(): Map<string, string> {
  const files = new Map<string, string>();
  const parsedRegistry = FilterRegistrySchema.parse(loadRegistrySource());
  files.set('data/filter-registry.json', JSON.stringify(parsedRegistry, null, 2));

  for (const [name, schema] of NAMED_SCHEMAS) {
    files.set(`spec/schemas/${name}.json`, JSON.stringify(toJsonSchema(schema), null, 2));
  }
  files.set('spec/openapi.json', JSON.stringify(openApiSchema(), null, 2));
  files.set('spec/mcp-tools.json', JSON.stringify(mcpSpec(), null, 2));
  files.set('spec/cli-commands.json', JSON.stringify(cliSpec(), null, 2));
  for (const { file, content } of operationSpecs()) files.set(`spec/${file}`, JSON.stringify(content, null, 2));
  files.set(
    'spec/README.md',
    [
      '# tanji-client 接口产物（自动生成，勿手改）',
      '',
      '由 `npm run gen` 从 `src/domain/*` 与 `src/api/operations.ts` 生成。',
      '',
      '| 文件 | 说明 |',
      '| --- | --- |',
      '| `openapi.json` | OpenAPI 3.1（REST） |',
      '| `mcp-tools.json` | MCP 工具清单与 inputSchema |',
      '| `cli-commands.json` | CLI 命令清单 |',
      '| `schemas/*.json` | 领域模型 JSON Schema |',
      '| `operations/*.request.json` / `*.response.json` | 每个操作的请求/响应 schema |',
      '',
      `操作数：${OPERATIONS.length}；模型数：${NAMED_SCHEMAS.length}；筛选条件：${parsedRegistry.totalEntries}（另有 ${parsedRegistry.hiddenEntries.length} 隐藏、${parsedRegistry.uncategorizedEntries.length} 未分类）。`,
      '',
    ].join('\n'),
  );
  return files;
}

function writeFiles(files: Map<string, string>): void {
  for (const [rel, content] of files) {
    const abs = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content + '\n', 'utf-8');
  }
}

function checkFiles(files: Map<string, string>): { ok: boolean; drift: string[] } {
  const drift: string[] = [];
  for (const [rel, content] of files) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs) || fs.readFileSync(abs, 'utf-8') !== content + '\n') drift.push(rel);
  }
  return { ok: drift.length === 0, drift };
}

const isCheck = process.argv.includes('--check');
const files = generateAll();
if (isCheck) {
  const { ok, drift } = checkFiles(files);
  if (!ok) {
    console.error('[gen:check] drift detected in:\n' + drift.map((d) => '  - ' + d).join('\n'));
    process.exit(1);
  }
  console.log(`[gen:check] OK (${files.size} files up to date)`);
} else {
  writeFiles(files);
  console.log(`[gen] wrote ${files.size} files`);
}
