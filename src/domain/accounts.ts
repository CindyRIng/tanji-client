/**
 * 多账号对外模型（/v1/accounts）
 */
import { z } from 'zod';

export const AccountInfoSchema = z
  .object({
    id: z.string(),
    phoneMasked: z.string().optional(),
    profileDir: z.string(),
    cacheDb: z.string(),
    port: z.number().int(),
    enabled: z.boolean(),
    running: z.boolean(),
    pid: z.number().int().optional(),
    health: z.enum(['ok', 'degraded', 'needs_human', 'stopped', 'unreachable', 'unknown']).default('unknown'),
    message: z.string().optional(),
  })
  .meta({ id: 'AccountInfo' });

export const AccountsResponseSchema = z
  .object({
    defaultAccountId: z.string(),
    accounts: z.array(AccountInfoSchema),
  })
  .meta({ id: 'AccountsResponse' });

export type AccountInfo = z.infer<typeof AccountInfoSchema>;
export type AccountsResponse = z.infer<typeof AccountsResponseSchema>;
