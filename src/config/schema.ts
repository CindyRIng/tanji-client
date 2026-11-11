/**
 * 运行配置（env > config file > defaults）
 */
import { z } from 'zod';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TanjiError } from '../errors/catalog.js';

export const AccountSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,31}$/, 'account id must be lowercase [a-z0-9_-]'),
    phone: z.string().optional(),
    password: z.string().optional(),
    profileDir: z.string().optional(),
    cacheDb: z.string().optional(),
    port: z.number().int().min(1).max(65535).optional(),
    enabled: z.boolean().default(true),
  })
  .meta({ id: 'Account' });

export const ConfigFileSchema = z
  .object({
    baseUrl: z.string().url().optional(),
    loginUrl: z.string().url().optional(),
    phone: z.string().optional(),
    password: z.string().optional(),
    profileDir: z.string().optional(),
    headless: z.boolean().optional(),
    apiToken: z.string().optional(),
    host: z.string().optional(),
    port: z.number().int().min(1).max(65535).optional(),
    cache: z
      .object({
        dbPath: z.string().optional(),
        detailTtlSec: z.number().int().nonnegative().optional(),
        listTtlSec: z.number().int().nonnegative().optional(),
      })
      .partial()
      .optional(),
    session: z
      .object({
        heartbeatSec: z.number().int().positive().optional(),
        ratePerMin: z.number().int().nonnegative().optional(),
        autoRelogin: z.boolean().optional(),
        maxPages: z.number().int().positive().optional(),
        requestTimeoutMs: z.number().int().positive().optional(),
        priorityReserve: z.number().int().nonnegative().optional(),
        bulkQueueMax: z.number().int().nonnegative().optional(),
      })
      .partial()
      .optional(),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).optional(),
    log: z
      .object({
        file: z.string().optional(),
        maxBytes: z.number().int().positive().optional(),
        keep: z.number().int().positive().optional(),
        stdout: z.boolean().optional(),
      })
      .partial()
      .optional(),
    accounts: z.array(AccountSchema).optional(),
  })
  .meta({ id: 'ConfigFile' });

const CACHE_DEFAULTS = {
  dbPath: path.join(os.homedir(), '.tanji-client', 'cache.db'),
  detailTtlSec: 7 * 24 * 3600,
  listTtlSec: 24 * 3600,
};
const SESSION_DEFAULTS = {
  heartbeatSec: 300,
  ratePerMin: 20,
  autoRelogin: true,
  maxPages: 5,
  requestTimeoutMs: 30_000,
  priorityReserve: 5,
  bulkQueueMax: 12,
};
const LOG_DEFAULTS = {
  file: path.join(os.homedir(), '.tanji-client', 'logs', 'tanji.log'),
  maxBytes: 10 * 1024 * 1024,
  keep: 5,
  stdout: true,
};

export const ConfigSchema = z
  .object({
    baseUrl: z.string().url().default('https://sales.tungee.com'),
    loginUrl: z.string().url().default('https://user.tungee.com/users/sign-in'),
    phone: z.string().optional(),
    password: z.string().optional(),
    profileDir: z.string().default(path.join(os.homedir(), '.tanji-client', 'profile')),
    headless: z.boolean().default(true),
    browserChannel: z.enum(['cloak', 'chrome']).default('cloak'),
    apiToken: z.string().min(8).default('change-me'),
    host: z.string().default('127.0.0.1'),
    port: z.number().int().min(1).max(65535).default(8787),
    cache: z
      .object({
        dbPath: z.string().default(CACHE_DEFAULTS.dbPath),
        detailTtlSec: z.number().int().nonnegative().default(CACHE_DEFAULTS.detailTtlSec),
        listTtlSec: z.number().int().nonnegative().default(CACHE_DEFAULTS.listTtlSec),
      })
      .default(CACHE_DEFAULTS),
    session: z
      .object({
        heartbeatSec: z.number().int().positive().default(SESSION_DEFAULTS.heartbeatSec),
        ratePerMin: z.number().int().nonnegative().default(SESSION_DEFAULTS.ratePerMin),
        autoRelogin: z.boolean().default(SESSION_DEFAULTS.autoRelogin),
        maxPages: z.number().int().positive().default(SESSION_DEFAULTS.maxPages),
        requestTimeoutMs: z.number().int().positive().default(SESSION_DEFAULTS.requestTimeoutMs),
        priorityReserve: z.number().int().nonnegative().default(SESSION_DEFAULTS.priorityReserve),
        bulkQueueMax: z.number().int().nonnegative().default(SESSION_DEFAULTS.bulkQueueMax),
      })
      .default(SESSION_DEFAULTS),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    log: z
      .object({
        file: z.string().default(LOG_DEFAULTS.file),
        maxBytes: z.number().int().positive().default(LOG_DEFAULTS.maxBytes),
        keep: z.number().int().positive().default(LOG_DEFAULTS.keep),
        stdout: z.boolean().default(LOG_DEFAULTS.stdout),
      })
      .default(LOG_DEFAULTS),
    accounts: z.array(AccountSchema).default([]),
  })
  .meta({ id: 'Config', description: '运行时配置' });

export type Config = z.infer<typeof ConfigSchema>;

function envBool(v: string | undefined): boolean | undefined {
  if (v === undefined || v === '') return undefined;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

function expandHome(p: string): string {
  return p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p;
}

export interface LoadConfigOptions {
  env?: NodeJS.ProcessEnv;
  configPath?: string;
}

/** 加载配置：优先级 CLI（由调用方覆盖） > env > 配置文件 > 默认值 */
export function loadConfig(opts: LoadConfigOptions = {}): Config {
  const env = opts.env ?? process.env;
  const configPath = expandHome(
    opts.configPath ??
      env.TANJI_CONFIG_FILE ??
      path.join(os.homedir(), '.tanji-client', 'config.json'),
  );

  let fileConfig: z.infer<typeof ConfigFileSchema> = {};
  if (fs.existsSync(configPath)) {
    try {
      fileConfig = ConfigFileSchema.parse(JSON.parse(fs.readFileSync(configPath, 'utf-8')));
    } catch (err) {
      throw new TanjiError('BAD_REQUEST', `invalid config file: ${configPath}`, { cause: err });
    }
  }

  const merged = {
    baseUrl: env.TANJI_BASE_URL ?? fileConfig.baseUrl,
    loginUrl: env.TANJI_LOGIN_URL ?? fileConfig.loginUrl,
    phone: env.TANJI_PHONE ?? fileConfig.phone,
    password: env.TANJI_PASSWORD ?? fileConfig.password,
    profileDir: env.TANJI_PROFILE_DIR ? expandHome(env.TANJI_PROFILE_DIR) : fileConfig.profileDir,
    headless: envBool(env.TANJI_HEADLESS) ?? fileConfig.headless,
    browserChannel: (env.TANJI_BROWSER_CHANNEL as 'cloak' | 'chrome' | undefined) ?? undefined,
    apiToken: env.TANJI_API_TOKEN ?? fileConfig.apiToken,
    host: env.TANJI_HOST ?? fileConfig.host,
    port: env.TANJI_PORT ? Number(env.TANJI_PORT) : fileConfig.port,
    cache: {
      ...fileConfig.cache,
      ...(env.TANJI_CACHE_DB ? { dbPath: expandHome(env.TANJI_CACHE_DB) } : {}),
      ...(env.TANJI_CACHE_DETAIL_TTL ? { detailTtlSec: Number(env.TANJI_CACHE_DETAIL_TTL) } : {}),
      ...(env.TANJI_CACHE_LIST_TTL ? { listTtlSec: Number(env.TANJI_CACHE_LIST_TTL) } : {}),
    },
    session: {
      ...fileConfig.session,
      ...(env.TANJI_HEARTBEAT_SEC ? { heartbeatSec: Number(env.TANJI_HEARTBEAT_SEC) } : {}),
      ...(env.TANJI_RATE_PER_MIN !== undefined && env.TANJI_RATE_PER_MIN !== ''
        ? { ratePerMin: Number(env.TANJI_RATE_PER_MIN) }
        : {}),
      ...(env.TANJI_AUTO_RELOGIN ? { autoRelogin: envBool(env.TANJI_AUTO_RELOGIN) } : {}),
      ...(env.TANJI_MAX_PAGES ? { maxPages: Number(env.TANJI_MAX_PAGES) } : {}),
      ...(env.TANJI_REQUEST_TIMEOUT_MS ? { requestTimeoutMs: Number(env.TANJI_REQUEST_TIMEOUT_MS) } : {}),
      ...(env.TANJI_PRIORITY_RESERVE !== undefined && env.TANJI_PRIORITY_RESERVE !== ''
        ? { priorityReserve: Number(env.TANJI_PRIORITY_RESERVE) }
        : {}),
      ...(env.TANJI_BULK_QUEUE_MAX !== undefined && env.TANJI_BULK_QUEUE_MAX !== ''
        ? { bulkQueueMax: Number(env.TANJI_BULK_QUEUE_MAX) }
        : {}),
    },
    logLevel: (env.TANJI_LOG_LEVEL as Config['logLevel'] | undefined) ?? fileConfig.logLevel,
    log: {
      ...LOG_DEFAULTS,
      ...fileConfig.log,
      ...(env.TANJI_LOG_FILE ? { file: expandHome(env.TANJI_LOG_FILE) } : {}),
      ...(env.TANJI_LOG_MAX_BYTES ? { maxBytes: Number(env.TANJI_LOG_MAX_BYTES) } : {}),
      ...(env.TANJI_LOG_KEEP ? { keep: Number(env.TANJI_LOG_KEEP) } : {}),
      ...(env.TANJI_LOG_STDOUT !== undefined && env.TANJI_LOG_STDOUT !== ''
        ? { stdout: envBool(env.TANJI_LOG_STDOUT) }
        : {}),
    },
    accounts: fileConfig.accounts,
  };

  const parsed = ConfigSchema.safeParse(merged);
  if (!parsed.success) {
    throw new TanjiError('BAD_REQUEST', 'invalid runtime config', {
      details: { issues: parsed.error.issues },
    });
  }
  const cfg = parsed.data;
  cfg.profileDir = expandHome(cfg.profileDir);
  cfg.cache.dbPath = expandHome(cfg.cache.dbPath);
  cfg.log.file = expandHome(cfg.log.file);
  cfg.accounts = cfg.accounts.map((a) => ({
    ...a,
    ...(a.profileDir ? { profileDir: expandHome(a.profileDir) } : {}),
    ...(a.cacheDb ? { cacheDb: expandHome(a.cacheDb) } : {}),
  }));
  return cfg;
}
