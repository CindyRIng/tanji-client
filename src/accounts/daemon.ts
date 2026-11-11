/**
 * 进程级多账号守护：每个账号一个 serve 子进程（独立 profile/cache/端口）
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { accountOutLog, accountErrLog, accountPidFile, LOG_DIR, RUN_DIR } from './paths.js';
import type { AccountConfig } from './config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function readPid(id: string): number | undefined {
  try {
    const pid = Number(fs.readFileSync(accountPidFile(id), 'utf-8').trim());
    return Number.isFinite(pid) && pid > 0 ? pid : undefined;
  } catch {
    return undefined;
  }
}

export function pidAlive(pid: number | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function fetchHealth(port: number, timeoutMs = 1500): Promise<{ ok: boolean; health?: string; message?: string }> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/v1/health`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return { ok: false, message: `HTTP ${r.status}` };
    const j = (await r.json()) as { ok?: boolean; data?: { browser?: { connected?: boolean } } };
    return { ok: true, health: j.data?.browser?.connected ? 'ok' : 'stopped' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function waitHealth(port: number, timeoutMs = 90_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const h = await fetchHealth(port, 1000);
    if (h.ok) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

export interface StartResult {
  accountId: string;
  pid: number;
  alreadyRunning: boolean;
  healthy: boolean;
  port: number;
}

export async function startAccount(account: AccountConfig): Promise<StartResult> {
  fs.mkdirSync(RUN_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const existing = readPid(account.id);
  if (pidAlive(existing)) {
    const h = await fetchHealth(account.port, 1000);
    return { accountId: account.id, pid: existing!, alreadyRunning: true, healthy: h.ok, port: account.port };
  }
  // systemd 托管的实例没有 pid 文件：端口可访问即视为已运行
  const probe = await fetchHealth(account.port, 800);
  if (probe.ok) {
    return { accountId: account.id, pid: 0, alreadyRunning: true, healthy: true, port: account.port };
  }
  const out = fs.openSync(accountOutLog(account.id), 'a');
  const err = fs.openSync(accountErrLog(account.id), 'a');
  const child = spawn(
    path.join(ROOT, 'bin', 'tanji-run'),
    ['serve', '--account', account.id, '--port', String(account.port), '--start-browser'],
    {
      detached: true,
      stdio: ['ignore', out, err],
      env: { ...process.env, TANJI_ACCOUNT: account.id },
    },
  );
  fs.writeFileSync(accountPidFile(account.id), String(child.pid));
  child.unref();
  const healthy = await waitHealth(account.port);
  return { accountId: account.id, pid: child.pid!, alreadyRunning: false, healthy, port: account.port };
}

export async function stopAccount(account: AccountConfig, timeoutMs = 15_000): Promise<boolean> {
  const pid = readPid(account.id);
  if (!pidAlive(pid)) {
    try {
      fs.unlinkSync(accountPidFile(account.id));
    } catch {
      /* ignore */
    }
    return false;
  }
  process.kill(pid!, 'SIGTERM');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!pidAlive(pid)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (pidAlive(pid)) {
    try {
      process.kill(pid!, 'SIGKILL');
    } catch {
      /* ignore */
    }
  }
  try {
    fs.unlinkSync(accountPidFile(account.id));
  } catch {
    /* ignore */
  }
  return true;
}

export async function accountRuntimeStatus(account: AccountConfig): Promise<{
  running: boolean;
  pid?: number;
  health: 'ok' | 'degraded' | 'needs_human' | 'stopped' | 'unreachable' | 'unknown';
  message?: string;
}> {
  const pid = readPid(account.id);
  const h = await fetchHealth(account.port, 1200);
  if (!pidAlive(pid)) {
    if (h.ok) return { running: true, health: (h.health as 'ok' | 'stopped') ?? 'unknown' };
    return { running: false, health: 'stopped' };
  }
  if (!h.ok) return { running: true, pid, health: 'unreachable', ...(h.message ? { message: h.message } : {}) };
  return { running: true, pid, health: (h.health as 'ok' | 'stopped') ?? 'unknown' };
}
