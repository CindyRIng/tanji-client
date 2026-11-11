/**
 * 高级筛选条件模型（对应探迹 12 大类 / 345 个可见条件）
 * 条件注册表数据来自 docs/04 的实测结果，见 src/data/filter-registry.json
 */
import { z } from 'zod';
import { JsonValueSchema } from './common.js';

export const FilterCategoryNameSchema = z
  .enum([
    '工商信息',
    '联系方式',
    '招聘信息',
    '官网信息',
    '经营状况',
    '资质证书',
    '媒体信息',
    '推广信息',
    '产品信息',
    '风险信息',
    '知识产权',
    '探迹线索数据',
  ])
  .meta({ id: 'FilterCategoryName' });

/** 控件类型（对应 upstream action.type / input.type 的组合语义） */
export const FilterControlSchema = z
  .enum([
    'keyword', // 文本包含任一
    'select', // 下拉单选
    'multiSelect', // 多选下拉（等于任一）
    'tree', // 树形选择（国标行业/注册地址等）
    'numberRange', // 数值区间
    'dateRange', // 日期区间
    'toggle', // 是/否
    'tier', // 档位选择
    'relation', // 关联过滤（如号码过滤条件）
    'preset', // 预设选项（To B/To C 等）
  ])
  .meta({ id: 'FilterControl' });

export const FilterOpSchema = z
  .enum([
    'eq', // 等于
    'anyOf', // 等于任一
    'contains', // 文本包含任一
    'range', // 数值/日期区间 {min,max}
    'boolean', // 是/否
    'preset', // 预设值（upstream 自带的 value 对象）
    'exists', // 有值
    'notExists', // 无值
    'custom', // 关联条件等自定义结构
  ])
  .meta({ id: 'FilterOp' });

/** 条件值：标量 / 数组 / 区间对象；具体约束由 op 决定 */
export const FilterValueSchema = z
  .union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.union([z.string(), z.number(), z.boolean()])),
    z.object({ min: z.union([z.number(), z.string()]).optional(), max: z.union([z.number(), z.string()]).optional() }),
    JsonValueSchema,
  ])
  .meta({ id: 'FilterValue' });

export const FilterConditionSchema = z
  .object({
    key: z
      .string()
      .regex(/^[A-Za-z][A-Za-z0-9_.]{0,63}$/, 'filter key must be an upstream field key')
      .meta({ description: '条件字段 key，如 industriesV2 / regCapitalRmb / name' }),
    op: FilterOpSchema,
    value: FilterValueSchema,
    negated: z.boolean().default(false).meta({ description: '取反（NOT）' }),
  })
  .superRefine((cond, ctx) => {
    const fail = (msg: string) => ctx.addIssue({ code: 'custom', message: msg, path: ['value'] });
    if (cond.op === 'boolean' && typeof cond.value !== 'boolean') fail('boolean op requires boolean value');
    if (cond.op === 'anyOf' && !Array.isArray(cond.value)) fail('anyOf op requires array value');
    if (cond.op === 'contains' && typeof cond.value !== 'string') fail('contains op requires string value');
    if (cond.op === 'range') {
      const v = cond.value as { min?: unknown; max?: unknown } | null;
      if (!v || typeof v !== 'object' || Array.isArray(v) || (v.min === undefined && v.max === undefined)) {
        fail('range op requires { min?, max? } value');
      }
    }
    if (cond.op === 'preset') {
      const v = cond.value;
      if (typeof v !== 'object' || v === null || Array.isArray(v)) fail('preset op requires object value');
    }
  })
  .meta({ id: 'FilterCondition', description: '单条筛选条件' });

export type FilterCondition = z.input<typeof FilterConditionSchema>;

/** 条件组：支持一层嵌套（对应「添加条件组合」） */
export type FilterGroupInput = {
  relation?: 'all' | 'any';
  conditions?: FilterCondition[];
  groups?: FilterGroupInput[];
};

export const FilterGroupSchema: z.ZodType<FilterGroupInput> = z.lazy(() =>
  z
    .object({
      relation: z.enum(['all', 'any']).default('all').meta({ description: 'all=全部满足，any=任一满足' }),
      conditions: z.array(FilterConditionSchema).max(50).default([]),
      groups: z.array(FilterGroupSchema).max(5).default([]).meta({ description: '嵌套条件组（最多 5 组）' }),
    })
    .superRefine((g, ctx) => {
      const total = (g.conditions?.length ?? 0) + (g.groups?.length ?? 0);
      if (total === 0) ctx.addIssue({ code: 'custom', message: 'filter group must not be empty' });
    })
    .meta({ id: 'FilterGroup', description: '条件组（所有/任一）' }),
) as unknown as z.ZodType<FilterGroupInput>;

/** 条件注册表条目（由 docs/04 与 upstream lightweight-configs 生成） */
export const FilterRegistryEntrySchema = z
  .object({
    key: z.string(),
    label: z.string(),
    category: FilterCategoryNameSchema.or(z.string()),
    subCategory: z.string().default(''),
    control: FilterControlSchema,
    unit: z.string().optional(),
    hint: z.string().optional(),
    optionsSource: z.string().optional().meta({ description: '候选值字典 key（input_values）' }),
    optionCount: z.number().int().nonnegative().optional(),
    correlationLabels: z.array(z.string()).optional(),
    upstreamActionType: z.number().int().optional(),
    upstreamInputType: z.number().int().nullable().optional(),
    uiVisible: z.boolean().default(true).meta({ description: '当前账号 UI 是否可见' }),
  })
  .meta({ id: 'FilterRegistryEntry', description: '一个可用筛选条件的定义' });

export const FilterRegistrySchema = z
  .object({
    schemaVersion: z.string(),
    source: z.string().meta({ description: '数据来源说明' }),
    fetchedAt: z.string().optional(),
    totalEntries: z.number().int(),
    categories: z.array(
      z.object({
        name: FilterCategoryNameSchema.or(z.string()),
        subCategories: z.array(
          z.object({
            name: z.string(),
            entries: z.array(FilterRegistryEntrySchema),
          }),
        ),
      }),
    ),
    hiddenEntries: z.array(FilterRegistryEntrySchema).default([]),
    uncategorizedEntries: z.array(FilterRegistryEntrySchema).default([]),
  })
  .meta({ id: 'FilterRegistry', description: '筛选条件全量注册表' });

export type FilterRegistry = z.infer<typeof FilterRegistrySchema>;

export type FilterControl = z.infer<typeof FilterControlSchema>;
export type FilterOp = z.infer<typeof FilterOpSchema>;
export type FilterValue = z.infer<typeof FilterValueSchema>;
export type FilterRegistryEntry = z.infer<typeof FilterRegistryEntrySchema>;
