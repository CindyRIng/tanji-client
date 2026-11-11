/**
 * 账号运行目录/端口等路径约定
 */
import path from 'node:path';
import os from 'node:os';

export const TANJI_HOME = path.join(os.homedir(), '.tanji-client');
export const RUN_DIR = path.join(TANJI_HOME, 'run');
export const LOG_DIR = path.join(TANJI_HOME, 'logs');

export function accountPidFile(id: string): string {
  return path.join(RUN_DIR, `${id}.pid`);
}
export function accountOutLog(id: string): string {
  return path.join(LOG_DIR, `${id}.out.log`);
}
export function accountErrLog(id: string): string {
  return path.join(LOG_DIR, `${id}.err.log`);
}
export function systemdUnitPath(id: string): string {
  return path.join(os.homedir(), '.config', 'systemd', 'user', id === 'default' ? 'tanji-client.service' : `tanji-client-${id}.service`);
}
