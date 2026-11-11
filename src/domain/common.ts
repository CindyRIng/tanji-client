/**
 * 通用基础类型（zod schema 作为单一事实源，后续生成 JSON Schema / OpenAPI / MCP tools）
 */
import { z } from 'zod';

/** JSON 可序列化值 */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
) as unknown as z.ZodType<JsonValue>;

/** ISO-8601 日期时间（含时区） */
export const IsoDateTimeSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/,
    'must be an ISO-8601 datetime with timezone',
  )
  .meta({ description: 'ISO-8601 日期时间（含时区），如 2026-11-09T19:38:00+08:00' });

/** 日期（YYYY-MM-DD） */
export const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
  .meta({ description: '日期 YYYY-MM-DD' });

export const NonEmptyStringSchema = z.string().min(1);
export const UrlSchema = z.string().url();

/** 分页 */
export const PageSchema = z.coerce.number().int().min(1).default(1).meta({ description: '页码，从 1 开始' });
export const PageSizeSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(100)
  .default(20)
  .meta({ description: '每页条数，1-100' });
export const MaxPagesSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(50)
  .default(5)
  .meta({ description: '单次任务最大翻页数，防风控' });

/** 企业唯一标识（探迹 _id） */
export const CompanyIdSchema = z
  .string()
  .regex(/^[0-9a-f]{8,32}$/i, 'company id must be hex string')
  .meta({ description: '探迹企业 ID（响应中的 _id）' });

/** 统一社会信用代码（18 位） */
export const UsccSchema = z
  .string()
  .regex(/^[0-9A-Z]{18}$/, 'USCC must be 18 chars')
  .meta({ description: '统一社会信用代码' });

export const RequestIdSchema = z.string().min(8).meta({ description: '请求 ID，用于日志追踪' });
