import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Logger } from '../src/utils/logger.js';

describe('logger', () => {
  it('writes JSONL, redacts secrets, rotates by size', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tanji-log-'));
    const file = path.join(dir, 'tanji.log');
    const logger = new Logger({ file, maxBytes: 400, keep: 3, level: 'debug', stdout: false });
    for (let i = 0; i < 30; i++) {
      logger.info('test.event', { i, password: 'secret', phone: '13800000000', token: 'abc', note: 'x'.repeat(40) });
    }
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.existsSync(`${file}.1`)).toBe(true);
    const content = fs.readFileSync(file, 'utf-8') + fs.readFileSync(`${file}.1`, 'utf-8');
    expect(content).toContain('"password":"***"');
    expect(content).toContain('138****0000');
    expect(content).not.toContain('secret');
  });
});
