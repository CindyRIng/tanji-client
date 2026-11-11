/**
 * 会话与额度模型（status 聚合）
 */
import { z } from 'zod';
import { IsoDateTimeSchema, UrlSchema } from './common.js';

export const HealthStatusSchema = z
  .enum(['starting', 'ok', 'degraded', 'needs_human', 'stopped'])
  .meta({
    id: 'HealthStatus',
    description: '会话健康度：ok=可用；degraded=可重试异常；needs_human=需人工登录/过验证码；starting=启动中；stopped=已停止',
  });

/** 额度三元组 */
export const QuotaBucketSchema = z
  .object({
    limit: z.number().int().nonnegative().meta({ description: '额度上限' }),
    used: z.number().int().nonnegative().optional().meta({ description: '已用' }),
    remaining: z.number().int().nonnegative().meta({ description: '剩余' }),
    unit: z.string().min(1).meta({ description: '计量单位，如“次/家/点”' }),
  })
  .meta({ id: 'QuotaBucket' });

export const QuotaSummarySchema = z
  .object({
    daily: QuotaBucketSchema.meta({ description: '个人当日额度（个人日）' }),
    monthly: QuotaBucketSchema.meta({ description: '个人本月额度（自然月）' }),
    enterpriseMonthly: QuotaBucketSchema.meta({ description: '企业本月额度' }),
    settlementDay: z.number().int().min(1).max(28).optional().meta({ description: '结算日' }),
    nearlySevenDayUnlockCount: z.number().int().nonnegative().optional().meta({ description: '近 7 天解锁数' }),
  })
  .meta({ id: 'QuotaSummary' });

export const AccountSchema = z
  .object({
    displayName: z.string().optional().meta({ description: '账号显示名' }),
    phoneMasked: z.string().optional().meta({ description: '脱敏手机号，如 156****0075' }),
    phone: z.string().optional().meta({ description: '手机号（仅本地返回，日志中脱敏）' }),
    companyName: z.string().optional().meta({ description: '所属公司' }),
    role: z.string().optional().meta({ description: '角色，如 普通用户' }),
  })
  .meta({ id: 'Account' });

export const SessionInfoSchema = z
  .object({
    profileDir: z.string().optional().meta({ description: 'cloak userDataDir' }),
    headless: z.boolean().optional(),
    startedAt: IsoDateTimeSchema.optional(),
    lastHeartbeatAt: IsoDateTimeSchema.optional(),
    lastLoginAt: IsoDateTimeSchema.optional(),
    browserVersion: z.string().optional(),
  })
  .meta({ id: 'SessionInfo' });

export const UpstreamInfoSchema = z
  .object({
    baseUrl: UrlSchema.or(z.string().min(1)),
    productLine: z.string().default('financial').meta({ description: '探迹产品线，财税版为 financial' }),
    portalUrl: z.string().optional().meta({ description: '登录门户 user.tungee.com' }),
  })
  .meta({ id: 'UpstreamInfo' });

/** status 操作响应 */
export const StatusSchema = z
  .object({
    loggedIn: z.boolean(),
    health: HealthStatusSchema,
    message: z.string().optional().meta({ description: '状态说明/异常摘要' }),
    account: AccountSchema.optional(),
    quota: QuotaSummarySchema.optional(),
    session: SessionInfoSchema.optional(),
    upstream: UpstreamInfoSchema.optional(),
    lastCheckedAt: IsoDateTimeSchema.optional(),
  })
  .meta({ id: 'Status', description: '聚合状态：登录态 + 额度 + 会话' });

export type Status = z.infer<typeof StatusSchema>;

export const LoginRequestSchema = z
  .object({
    interactive: z.boolean().default(false).meta({ description: 'true=启动可见浏览器人工登录；false=用保存的凭据自动登录' }),
    force: z.boolean().default(false).meta({ description: '强制重新登录（即使当前已登录）' }),
  })
  .meta({ id: 'LoginRequest' });

export const HealthResponseSchema = z
  .object({
    ok: z.boolean(),
    version: z.string().meta({ description: '客户端版本' }),
    uptimeSec: z.number().nonnegative(),
    schemaVersion: z.string(),
    browser: z
      .object({ connected: z.boolean(), pid: z.number().int().optional(), headless: z.boolean().optional() })
      .optional(),
    cache: z.object({ dbPath: z.string().optional(), ready: z.boolean() }).optional(),
  })
  .meta({ id: 'HealthResponse', description: '存活探针（不校验登录态）' });

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export type HealthStatus = z.infer<typeof HealthStatusSchema>;
export type QuotaBucket = z.infer<typeof QuotaBucketSchema>;
export type QuotaSummary = z.infer<typeof QuotaSummarySchema>;
export type Account = z.infer<typeof AccountSchema>;
export type SessionInfo = z.infer<typeof SessionInfoSchema>;
export type UpstreamInfo = z.infer<typeof UpstreamInfoSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
