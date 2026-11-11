#!/usr/bin/env node
/**
 * tanji-client 入口
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseEnv } from 'node:util';
import { main } from './transports/cli/index.js';

/** 自动加载项目 .env（可用 TANJI_ENV_FILE 覆盖路径） */
function loadDotEnv(): void {
  const raw = process.env.TANJI_ENV_FILE ?? path.join(process.cwd(), '.env');
  const file = raw.startsWith('~/') ? path.join(os.homedir(), raw.slice(2)) : raw;
  if (!fs.existsSync(file)) return;
  try {
    const parsed = parseEnv(fs.readFileSync(file, 'utf-8'));
    // 已存在的环境变量优先，避免 .env 覆盖显式 export
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch (err) {
    console.error(`[warn] 读取 .env 失败：${(err as Error).message}`);
  }
}

loadDotEnv();

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
