/**
 * systemd user 服务安装/管理（开机自启 + 崩溃重启）
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { systemdUnitPath } from './paths.js';
import type { AccountConfig } from './config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function unitName(id: string): string {
  return id === 'default' ? 'tanji-client.service' : `tanji-client-${id}.service`;
}

function systemctl(args: string[], timeout = 30_000): { status: number; stdout: string; stderr: string } {
  const r = spawnSync('systemctl', ['--user', ...args], { encoding: 'utf-8', timeout });
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

export function serviceUnitContent(account: AccountConfig): string {
  return `[Unit]
Description=tanji-client (${account.id}) — 探迹本地客户端
After=network-online.target

[Service]
Type=simple
WorkingDirectory=${ROOT}
Environment=TANJI_ACCOUNT=${account.id}
Environment=TANJI_CONFIG_FILE=%h/.tanji-client/config.json
EnvironmentFile=-%h/.tanji-client/env
ExecStart=${path.join(ROOT, 'bin', 'tanji-run')} serve --account ${account.id} --port ${account.port} --start-browser
Restart=always
RestartSec=5
TimeoutStopSec=25
KillSignal=SIGTERM

[Install]
WantedBy=default.target
`;
}

export function installService(account: AccountConfig): { file: string; enabled: boolean; started: boolean; linger: boolean } {
  const file = systemdUnitPath(account.id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, serviceUnitContent(account), 'utf-8');
  const reload = systemctl(['daemon-reload']);
  const enable = systemctl(['enable', unitName(account.id)]);
  const start = systemctl(['restart', unitName(account.id)]);
  // 尝试开启 linger，使用户退出登录后服务继续运行（失败不阻塞）
  const linger = spawnSync('loginctl', ['enable-linger', process.env.USER ?? ''], { encoding: 'utf-8', timeout: 10_000 });
  return {
    file,
    enabled: enable.status === 0,
    started: start.status === 0 && reload.status === 0,
    linger: linger.status === 0,
  };
}

export function serviceStatus(account: AccountConfig): { file: string; exists: boolean; status: string; active: boolean } {
  const file = systemdUnitPath(account.id);
  const r = systemctl(['status', unitName(account.id), '--no-pager', '-n', '20']);
  return { file, exists: fs.existsSync(file), status: r.stdout || r.stderr, active: r.status === 0 };
}

export function stopService(account: AccountConfig): boolean {
  return systemctl(['stop', unitName(account.id)]).status === 0;
}

export function uninstallService(account: AccountConfig): boolean {
  systemctl(['disable', '--now', unitName(account.id)]);
  const file = systemdUnitPath(account.id);
  try {
    fs.unlinkSync(file);
  } catch {
    /* ignore */
  }
  return systemctl(['daemon-reload']).status === 0;
}

export function systemdAvailable(): boolean {
  return spawnSync('systemctl', ['--user', 'is-system-running'], { encoding: 'utf-8', timeout: 5000 }).status !== 127;
}
