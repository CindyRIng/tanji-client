/**
 * 统一错误码目录（REST / CLI / MCP 共用）
 */
import { z } from 'zod';

export interface ErrorCodeMeta {
  readonly http: number;
  readonly retryable: boolean;
  readonly title: string;
  readonly description: string;
}

export const ERROR_CATALOG = {
  BAD_REQUEST: {
    http: 400,
    retryable: false,
    title: '参数错误',
    description: '请求参数不合法（格式/范围/必填项缺失）',
  },
  UNAUTHORIZED: {
    http: 401,
    retryable: false,
    title: '未授权',
    description: 'REST/MCP 鉴权失败（Bearer token 缺失或错误）',
  },
  AUTH_REQUIRED: {
    http: 401,
    retryable: true,
    title: '登录态失效',
    description: '探迹登录态失效，客户端会尝试自动重登；重登后再重试',
  },
  LOGIN_FAILED: {
    http: 401,
    retryable: false,
    title: '登录失败',
    description: '自动登录失败（密码错误/账号异常），需要人工介入',
  },
  FORBIDDEN: {
    http: 403,
    retryable: false,
    title: '无权限',
    description: '账号无该功能权限（如未开通线索模块）',
  },
  NOT_FOUND: {
    http: 404,
    retryable: false,
    title: '不存在',
    description: '企业/查询会话/缓存条目不存在',
  },
  METHOD_NOT_ALLOWED: {
    http: 405,
    retryable: false,
    title: '方法不允许',
    description: 'HTTP 方法不匹配',
  },
  VALIDATION_FAILED: {
    http: 422,
    retryable: false,
    title: '校验失败',
    description: '请求体 JSON Schema 校验未通过，details 内给出字段级问题',
  },
  CONFLICT: {
    http: 409,
    retryable: false,
    title: '状态冲突',
    description: '当前状态不允许该操作（如未确认就解锁）',
  },
  CAPTCHA_REQUIRED: {
    http: 409,
    retryable: true,
    title: '需要验证码',
    description: '触发滑块/短信验证，需要人工处理后恢复',
  },
  QUOTA_EXHAUSTED: {
    http: 409,
    retryable: false,
    title: '额度不足',
    description: '个人日/月或企业月额度不足，操作被拒绝',
  },
  RATE_LIMITED: {
    http: 429,
    retryable: true,
    title: '限频',
    description: '触发本地限频或上游限流，按 retryAfterMs 退避',
  },
  ALREADY_RUNNING: {
    http: 409,
    retryable: false,
    title: '已在运行',
    description: '同一台机器上 tanji-client 已在运行（单实例约束）',
  },
  TIMEOUT: {
    http: 504,
    retryable: true,
    title: '上游超时',
    description: '探迹页面/接口响应超时',
  },
  UPSTREAM_CHANGED: {
    http: 502,
    retryable: false,
    title: '上游改版',
    description: '探迹页面结构/接口字段变化导致解析失败，需要更新适配层',
  },
  UPSTREAM_UNAVAILABLE: {
    http: 503,
    retryable: true,
    title: '上游不可用',
    description: '网络异常/探迹服务不可达',
  },
  NOT_IMPLEMENTED: {
    http: 501,
    retryable: false,
    title: '未实现',
    description: '骨架阶段该能力尚未实现（等待接入 cloak 浏览器与上游适配器）',
  },
  CACHE_ERROR: {
    http: 500,
    retryable: false,
    title: '缓存错误',
    description: 'SQLite 读写失败',
  },
  INTERNAL: {
    http: 500,
    retryable: false,
    title: '内部错误',
    description: '未分类的客户端内部错误',
  },
} as const satisfies Record<string, ErrorCodeMeta>;

export type ErrorCode = keyof typeof ERROR_CATALOG;

export const ErrorCodeSchema = z.enum(
  Object.keys(ERROR_CATALOG) as [ErrorCode, ...ErrorCode[]],
).meta({ id: 'ErrorCode', description: '统一错误码' });

export class TanjiError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;
  readonly retryAfterMs?: number;
  override readonly cause?: unknown;

  constructor(
    code: ErrorCode,
    message?: string,
    opts: { details?: Record<string, unknown>; retryAfterMs?: number; cause?: unknown } = {},
  ) {
    super(message ?? ERROR_CATALOG[code].title);
    this.name = 'TanjiError';
    this.code = code;
    this.details = opts.details;
    this.retryAfterMs = opts.retryAfterMs;
    this.cause = opts.cause;
  }

  get retryable(): boolean {
    return ERROR_CATALOG[this.code].retryable;
  }

  get httpStatus(): number {
    return ERROR_CATALOG[this.code].http;
  }

  toJSON(): { code: ErrorCode; message: string; retryable: boolean; retryAfterMs?: number; details?: Record<string, unknown> } {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.retryAfterMs !== undefined ? { retryAfterMs: this.retryAfterMs } : {}),
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export function asTanjiError(err: unknown): TanjiError {
  if (err instanceof TanjiError) return err;
  if (err instanceof z.ZodError) {
    return new TanjiError('VALIDATION_FAILED', 'request validation failed', {
      details: { issues: err.issues },
    });
  }
  return new TanjiError('INTERNAL', err instanceof Error ? err.message : String(err), { cause: err });
}
