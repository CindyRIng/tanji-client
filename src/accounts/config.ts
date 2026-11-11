/**
 * 多账号配置解析（进程级多账号：每个账号一个 profile + cache + 端口）
 */
import path from 'node:path';
import os from 'node:os';
import type { Config } from '../config/schema.js';
import { TanjiError } from '../errors/catalog.js';

export interface AccountConfig {
  id: string;
  phone?: string;
  password?: string;
  profileDir: string;
  cacheDb: string;
  port: number;
  enabled: boolean;
  index: number;
}

const HOME = os.homedir();

export function listAccountConfigs(cfg: Config): AccountConfig[] {
  if (cfg.accounts.length === 0) {
    return [
      {
        id: process.env.TANJI_ACCOUNT ?? 'default',
        ...(cfg.phone ? { phone: cfg.phone } : {}),
        ...(cfg.password ? { password: cfg.password } : {}),
        profileDir: cfg.profileDir,
        cacheDb: cfg.cache.dbPath,
        port: cfg.port,
        enabled: true,
        index: 0,
      },
    ];
  }
  const seen = new Set<string>();
  return cfg.accounts.map((a, index) => {
    if (seen.has(a.id)) throw new TanjiError('BAD_REQUEST', `duplicate account id: ${a.id}`);
    seen.add(a.id);
    const port = a.port ?? cfg.port + index;
    if (port > 65535) throw new TanjiError('BAD_REQUEST', `account ${a.id} port out of range: ${port}`);
    return {
      id: a.id,
      ...(a.phone ?? cfg.phone ? { phone: a.phone ?? cfg.phone } : {}),
      ...(a.password ?? cfg.password ? { password: a.password ?? cfg.password } : {}),
      profileDir: a.profileDir ?? path.join(HOME, '.tanji-client', 'accounts', a.id, 'profile'),
      cacheDb: a.cacheDb ?? path.join(HOME, '.tanji-client', 'accounts', a.id, 'cache.db'),
      port,
      enabled: a.enabled,
      index,
    };
  });
}

export interface ResolvedAccount {
  config: Config;
  accountId: string;
  account: AccountConfig;
  accounts: AccountConfig[];
}

export function resolveAccount(cfg: Config, accountId?: string): ResolvedAccount {
  const accounts = listAccountConfigs(cfg);
  const id = accountId ?? process.env.TANJI_ACCOUNT ?? accounts.find((a) => a.enabled)?.id ?? accounts[0]?.id;
  const account = accounts.find((a) => a.id === id);
  if (!account) {
    throw new TanjiError('BAD_REQUEST', `account not found: ${id}`, {
      details: { available: accounts.map((a) => a.id) },
    });
  }
  if (!account.enabled) throw new TanjiError('BAD_REQUEST', `account disabled: ${id}`);
  const config: Config = {
    ...cfg,
    ...(account.phone ? { phone: account.phone } : {}),
    ...(account.password ? { password: account.password } : {}),
    profileDir: account.profileDir,
    port: account.port,
    cache: { ...cfg.cache, dbPath: account.cacheDb },
  };
  return { config, accountId: account.id, account, accounts };
}

export function maskPhone(phone?: string): string | undefined {
  if (!phone) return undefined;
  return phone.length >= 7 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : '***';
}
