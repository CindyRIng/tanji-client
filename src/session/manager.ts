/**
 * 会话管理器：浏览器生命周期 + 单实例锁 + 心跳/自动重登 + status
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Config } from '../config/schema.js';
import type { BrowserHost, PageLike } from '../browser/types.js';
import { CloakBrowserHost } from '../browser/cloak.js';
import { PageTungeeApiClient, type TungeeApiClient } from '../adapters/tungee/client.js';
import { mapQuota } from '../adapters/tungee/mapper.js';
import { TUNGEE_DEFAULTS } from '../adapters/tungee/endpoints.js';
import { TanjiError } from '../errors/catalog.js';
import { performPasswordLogin } from './login.js';
import type { Logger } from '../utils/logger.js';
import type { HealthStatus, LoginRequest, Status } from '../domain/status.js';

export interface SessionManager {
  ensureStarted(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  api(): TungeeApiClient;
  page(): PageLike;
  status(): Promise<Status>;
  login(req: LoginRequest): Promise<Status>;
}

export class DefaultSessionManager implements SessionManager {
  private host: BrowserHost | null = null;
  private client: TungeeApiClient | null = null;
  private state: HealthStatus = 'stopped';
  private startedAt: number | null = null;
  private starting: Promise<void> | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reloginBusy = false;
  private reloginFailures = 0;
  private reloginNotBefore = 0;
  private loginBusy = false;
  private startupRecoveryTimer: NodeJS.Timeout | null = null;
  private lastHeartbeatAt: string | undefined;
  private lockPath: string | null = null;
  private lockFd: number | null = null;

  constructor(
    private readonly cfg: Config,
    private readonly logger?: Logger,
  ) {}

  isRunning(): boolean {
    return this.host?.isConnected() ?? false;
  }

  async ensureStarted(): Promise<void> {
    if (this.isRunning()) return;
    if (!this.starting) {
      this.starting = this.start().finally(() => {
        this.starting = null;
      });
    }
    return this.starting;
  }

  async start(): Promise<void> {
    if (this.isRunning()) return;
    this.acquireLock();
    try {
      this.state = 'starting';
      const host = new CloakBrowserHost({
        headless: this.cfg.headless,
        profileDir: this.cfg.profileDir,
        timezone: 'Asia/Shanghai',
        locale: 'zh-CN',
      });
      await host.start();
      // 打开探迹域，确保页面内 fetch 为同源请求（否则会被 CORS 拦截）
      await host
        .page()
        .goto(`${this.cfg.baseUrl}/home?entry=1`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
        .catch(() => {});
      await host.page().waitForTimeout(2_500);
      this.host = host;
      this.client = new PageTungeeApiClient(host.page(), {
        baseUrl: this.cfg.baseUrl,
        productLine: TUNGEE_DEFAULTS.productLine,
        timeoutMs: this.cfg.session.requestTimeoutMs,
        ratePerMin: this.cfg.session.ratePerMin,
        priorityReserve: this.cfg.session.priorityReserve,
        bulkQueueMax: this.cfg.session.bulkQueueMax,
      });
      this.startedAt = Date.now();
      this.state = 'degraded';
      this.logger?.info('session.started', { profileDir: this.cfg.profileDir, headless: this.cfg.headless });
      this.startHeartbeat();
      // 启动后做一次自动恢复检查（不阻塞 serve 的首次 status）
      if (this.cfg.session.autoRelogin && this.cfg.phone && this.cfg.password) {
        this.startupRecoveryTimer = setTimeout(() => {
          this.startupRecoveryTimer = null;
          void this.tick().catch(() => {});
        }, 5_000);
        this.startupRecoveryTimer.unref?.();
      }
    } catch (err) {
      this.releaseLock();
      this.state = 'stopped';
      throw err;
    }
  }

  async stop(): Promise<void> {
    this.stopHeartbeat();
    if (this.startupRecoveryTimer) {
      clearTimeout(this.startupRecoveryTimer);
      this.startupRecoveryTimer = null;
    }
    await this.host?.close().catch(() => {});
    this.host = null;
    this.client = null;
    this.startedAt = null;
    this.state = 'stopped';
    this.releaseLock();
    this.logger?.info('session.stopped');
  }

  api(): TungeeApiClient {
    if (!this.client) {
      throw new TanjiError('AUTH_REQUIRED', '浏览器会话未启动：请先执行 `tanji login`');
    }
    return this.client;
  }

  page(): PageLike {
    if (!this.host) throw new TanjiError('AUTH_REQUIRED', '浏览器会话未启动');
    return this.host.page();
  }

  async status(): Promise<Status> {
    const upstream = {
      baseUrl: this.cfg.baseUrl,
      productLine: TUNGEE_DEFAULTS.productLine,
      portalUrl: 'https://user.tungee.com',
    };
    if (!this.client) {
      return { loggedIn: false, health: 'stopped', message: '浏览器会话未启动：请执行 `tanji login`', upstream };
    }
    try {
      const remain = await this.client.getRemainLead();
      const infoBar = await this.client.getInfoBar().catch(() => undefined);
      this.state = 'ok';
      this.lastHeartbeatAt = new Date().toISOString();
      return {
        loggedIn: true,
        health: 'ok',
        quota: mapQuota(remain, infoBar),
        session: {
          headless: this.cfg.headless,
          profileDir: this.cfg.profileDir,
          ...(this.startedAt ? { startedAt: new Date(this.startedAt).toISOString() } : {}),
          lastHeartbeatAt: this.lastHeartbeatAt,
          ...(this.cfg.phone ? { lastLoginAt: this.lastHeartbeatAt } : {}),
        },
        upstream,
        lastCheckedAt: new Date().toISOString(),
      };
    } catch (err) {
      const e = err instanceof TanjiError ? err : new TanjiError('INTERNAL', String(err));
      if (e.code === 'AUTH_REQUIRED' || e.code === 'LOGIN_FAILED' || e.code === 'CAPTCHA_REQUIRED') {
        this.state = 'needs_human';
        return { loggedIn: false, health: 'needs_human', message: e.message, upstream };
      }
      this.state = 'degraded';
      return { loggedIn: false, health: 'degraded', message: e.message, upstream };
    }
  }

  async login(req: LoginRequest): Promise<Status> {
    await this.ensureStarted();
    this.loginBusy = true;
    try {
      const before = await this.status();
      if (req.force || !before.loggedIn) {
        try {
          await performPasswordLogin(this.page(), this.cfg, req.interactive);
        } catch (err) {
          const e = err instanceof TanjiError ? err : new TanjiError('INTERNAL', String(err), { cause: err });
          this.logger?.error('session.login.failed', {
            code: e.code,
            message: e.message,
            ...(e.details ? { details: e.details } : {}),
          });
          throw e;
        }
      }
      const after = await this.status();
      this.logger?.[after.loggedIn ? 'info' : 'warn']('session.login', {
        loggedIn: after.loggedIn,
        health: after.health,
        message: after.message,
      });
      if (!after.loggedIn) {
        throw new TanjiError('LOGIN_FAILED', after.message ?? '登录后仍无法读取额度，请检查账号状态');
      }
      this.state = 'ok';
      this.reloginFailures = 0;
      this.reloginNotBefore = 0;
      return after;
    } finally {
      this.loginBusy = false;
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    const intervalMs = Math.max(30, this.cfg.session.heartbeatSec) * 1000;
    this.heartbeatTimer = setInterval(() => {
      this.tick().catch(() => {});
    }, intervalMs);
    this.heartbeatTimer.unref?.();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async tick(): Promise<void> {
    if (!this.client || this.reloginBusy || this.loginBusy) return;
    const status = await this.status();
    this.logger?.debug('session.heartbeat', { health: status.health, loggedIn: status.loggedIn });
    if (status.loggedIn) {
      this.reloginFailures = 0;
      this.reloginNotBefore = 0;
      return;
    }
    if (status.health !== 'needs_human' || !this.cfg.session.autoRelogin) return;
    if (!this.cfg.phone || !this.cfg.password) return;
    if (Date.now() < this.reloginNotBefore) return;

    this.reloginBusy = true;
    try {
      this.logger?.warn('session.relogin.start');
      await performPasswordLogin(this.page(), this.cfg, false);
      this.state = 'ok';
      this.lastHeartbeatAt = new Date().toISOString();
      this.reloginFailures = 0;
      this.reloginNotBefore = 0;
      this.logger?.info('session.relogin.ok');
    } catch (err) {
      const e = err instanceof TanjiError ? err : new TanjiError('INTERNAL', String(err), { cause: err });
      this.reloginFailures++;
      // 5m → 10m → 20m → 40m → 60m 上限，避免每 5 分钟无限重试
      const base = Math.max(30, this.cfg.session.heartbeatSec) * 1000;
      const delayMs = Math.min(base * 2 ** Math.min(this.reloginFailures - 1, 6), 60 * 60 * 1000);
      this.reloginNotBefore = Date.now() + delayMs;
      this.state = e.code === 'CAPTCHA_REQUIRED' ? 'needs_human' : 'degraded';
      this.logger?.error('session.relogin.failed', {
        code: e.code,
        message: e.message,
        failures: this.reloginFailures,
        nextRetryMs: delayMs,
        ...(e.details ? { details: e.details } : {}),
      });
    } finally {
      this.reloginBusy = false;
    }
  }

  // ─── 单实例锁 ─────────────────────────────

  private acquireLock(): void {
    fs.mkdirSync(this.cfg.profileDir, { recursive: true });
    const lockPath = path.join(this.cfg.profileDir, '.tanji.lock');
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(fd, String(process.pid));
      this.lockFd = fd;
      this.lockPath = lockPath;
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
    const pidText = fs.readFileSync(lockPath, 'utf-8').trim();
    const pid = Number(pidText);
    if (Number.isFinite(pid) && pid > 0 && this.pidAlive(pid)) {
      throw new TanjiError('ALREADY_RUNNING', `已有 tanji-client 在运行（pid=${pid}），profile=${this.cfg.profileDir}`);
    }
    // 陈旧锁：清理后重试
    try {
      fs.unlinkSync(lockPath);
    } catch {
      /* ignore */
    }
    this.acquireLock();
  }

  private pidAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private releaseLock(): void {
    if (this.lockFd !== null) {
      try {
        fs.closeSync(this.lockFd);
      } catch {
        /* ignore */
      }
      this.lockFd = null;
    }
    if (this.lockPath) {
      try {
        fs.unlinkSync(this.lockPath);
      } catch {
        /* ignore */
      }
      this.lockPath = null;
    }
  }
}
