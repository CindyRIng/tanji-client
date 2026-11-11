/**
 * 应用容器：配置 + 缓存 + 会话 + 服务
 */
import { loadConfig, type Config } from './config/schema.js';
import { resolveAccount } from './accounts/config.js';
import { createLogger, type Logger } from './utils/logger.js';
import { MemoryCacheStore } from './cache/memory.js';
import { SqliteCacheStore } from './cache/sqlite.js';
import type { CacheStore } from './cache/types.js';
import { DefaultSessionManager, type SessionManager } from './session/manager.js';
import { DefaultTanjiService, type TanjiService } from './service.js';

export interface App {
  config: Config;
  accountId: string;
  cache: CacheStore;
  session: SessionManager;
  service: TanjiService;
  logger: Logger;
  close(): Promise<void>;
}

export interface CreateAppOptions {
  env?: NodeJS.ProcessEnv;
  configPath?: string;
  accountId?: string;
  logToStdout?: boolean;
}

export async function createApp(opts: CreateAppOptions = {}): Promise<App> {
  const baseConfig = loadConfig({ env: opts.env, configPath: opts.configPath });
  const resolved = resolveAccount(baseConfig, opts.accountId);
  const config = resolved.config;
  const logger = createLogger({
    file: config.log.file,
    maxBytes: config.log.maxBytes,
    keep: config.log.keep,
    level: config.logLevel,
    stdout: opts.logToStdout ?? config.log.stdout,
  });
  const cache = await createCache(config);
  const session = new DefaultSessionManager(config, logger);
  const service = new DefaultTanjiService(config, session, cache, logger);
  logger.info('app.created', { accountId: resolved.accountId, profileDir: config.profileDir, cacheDb: config.cache.dbPath });
  return {
    config,
    accountId: resolved.accountId,
    cache,
    session,
    service,
    logger,
    async close() {
      await session.stop();
      await cache.close();
      logger.info('app.closed', { accountId: resolved.accountId });
    },
  };
}

async function createCache(config: Config): Promise<CacheStore> {
  const driver = process.env.TANJI_CACHE_DRIVER;
  if (driver === 'memory') return new MemoryCacheStore();
  const sqlite = new SqliteCacheStore(config.cache.dbPath);
  try {
    await sqlite.init();
    return sqlite;
  } catch (err) {
    console.error('[warn] SQLite 缓存不可用，回退到内存缓存：', (err as Error).message);
    const memory = new MemoryCacheStore();
    await memory.init();
    return memory;
  }
}
