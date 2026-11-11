/**
 * 缓存相关的对外模型
 */
import { z } from 'zod';
import { IsoDateTimeSchema } from '../domain/common.js';

export const CacheStatsSchema = z
  .object({
    dbPath: z.string().optional(),
    driver: z.enum(['sqlite', 'memory']).default('sqlite'),
    sizeBytes: z.number().int().nonnegative().optional(),
    companies: z.number().int().nonnegative().default(0),
    companyDetails: z.number().int().nonnegative().default(0),
    contacts: z.number().int().nonnegative().default(0),
    queries: z.number().int().nonnegative().default(0),
    searchResults: z.number().int().nonnegative().default(0),
    hits: z.number().int().nonnegative().default(0),
    misses: z.number().int().nonnegative().default(0),
    hitRate: z.number().min(0).max(1).optional(),
    oldestFetchedAt: IsoDateTimeSchema.optional(),
    newestFetchedAt: IsoDateTimeSchema.optional(),
  })
  .meta({ id: 'CacheStats' });

export const CacheClearRequestSchema = z
  .object({
    prefix: z.string().optional().meta({ description: '按 key/企业 ID 前缀清理，空=全部' }),
    all: z.boolean().default(false).meta({ description: 'true=清空全部缓存' }),
  })
  .meta({ id: 'CacheClearRequest' });

export const CacheClearResultSchema = z
  .object({
    deleted: z.number().int().nonnegative(),
    scope: z.string(),
  })
  .meta({ id: 'CacheClearResult' });

export type CacheStats = z.infer<typeof CacheStatsSchema>;
export type CacheClearRequest = z.infer<typeof CacheClearRequestSchema>;
export type CacheClearResult = z.infer<typeof CacheClearResultSchema>;
