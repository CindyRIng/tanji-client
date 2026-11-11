/**
 * 统一响应包（Envelope）与分页 / 元信息
 */
import { z } from 'zod';
import { ErrorCodeSchema } from '../errors/catalog.js';
import { IsoDateTimeSchema, RequestIdSchema } from '../domain/common.js';

export const SCHEMA_VERSION = '1.0';

export const PaginationMetaSchema = z
  .object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  })
  .meta({ id: 'PaginationMeta' });

export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;

export const ResponseMetaSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION).default(SCHEMA_VERSION),
    requestId: RequestIdSchema,
    timestamp: IsoDateTimeSchema,
    tookMs: z.number().int().nonnegative(),
    cached: z.boolean().default(false),
    pagination: PaginationMetaSchema.optional(),
    warnings: z.array(z.string()).default([]),
    upstream: z
      .object({
        baseUrl: z.string().optional(),
        latencyMs: z.number().int().nonnegative().optional(),
        requestId: z.string().optional(),
      })
      .optional(),
  })
  .meta({ id: 'ResponseMeta' });

export const ApiErrorSchema = z
  .object({
    code: ErrorCodeSchema,
    message: z.string(),
    retryable: z.boolean(),
    retryAfterMs: z.number().int().nonnegative().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .meta({ id: 'ApiError' });

export type ApiError = z.infer<typeof ApiErrorSchema>;

export interface SuccessEnvelope<T> {
  ok: true;
  data: T;
  meta: z.infer<typeof ResponseMetaSchema>;
  error: null;
}

export interface FailureEnvelope {
  ok: false;
  data: null;
  meta: z.infer<typeof ResponseMetaSchema>;
  error: ApiError;
}

export type Envelope<T> = SuccessEnvelope<T> | FailureEnvelope;

/** 为指定 data schema 生成成功/失败 envelope 的 zod schema（用于 OpenAPI 生成） */
export function envelopeSchemaFor<T extends z.ZodTypeAny>(dataSchema: T, id?: string) {
  return z
    .union([
      z.object({
        ok: z.literal(true),
        data: dataSchema,
        meta: ResponseMetaSchema,
        error: z.null(),
      }),
      z.object({
        ok: z.literal(false),
        data: z.null(),
        meta: ResponseMetaSchema,
        error: ApiErrorSchema,
      }),
    ])
    .meta({ id: id ?? 'ApiEnvelope' });
}

export type ResponseMeta = z.infer<typeof ResponseMetaSchema>;

export interface EnvelopeMetaInput {
  requestId: string;
  tookMs: number;
  cached?: boolean;
  pagination?: PaginationMeta;
  warnings?: string[];
  upstream?: ResponseMeta['upstream'];
  schemaVersion?: typeof SCHEMA_VERSION;
  timestamp?: string;
}

export function successEnvelope<T>(data: T, meta: EnvelopeMetaInput): SuccessEnvelope<T> {
  return {
    ok: true,
    data,
    meta: {
      schemaVersion: SCHEMA_VERSION,
      timestamp: new Date().toISOString(),
      cached: meta.cached ?? false,
      warnings: meta.warnings ?? [],
      ...meta,
    },
    error: null,
  };
}

export function failureEnvelope(error: ApiError, meta: EnvelopeMetaInput): FailureEnvelope {
  return {
    ok: false,
    data: null,
    meta: {
      schemaVersion: SCHEMA_VERSION,
      timestamp: new Date().toISOString(),
      cached: meta.cached ?? false,
      warnings: meta.warnings ?? [],
      ...meta,
    },
    error,
  };
}
