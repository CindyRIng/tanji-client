import { describe, expect, it } from 'vitest';
import { ConfigSchema } from '../src/config/schema.js';
import { listAccountConfigs, resolveAccount, maskPhone } from '../src/accounts/config.js';

const base = ConfigSchema.parse({});

describe('accounts', () => {
  it('single implicit default account', () => {
    const accounts = listAccountConfigs(base);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.id).toBe('default');
    expect(accounts[0]!.profileDir).toBe(base.profileDir);
    const resolved = resolveAccount(base);
    expect(resolved.accountId).toBe('default');
  });

  it('multi account ports/paths/phones', () => {
    const cfg = ConfigSchema.parse({
      port: 9000,
      phone: '13800000000',
      accounts: [
        { id: 'main', phone: '13800000001' },
        { id: 'backup', phone: '13800000002', port: 9100 },
      ],
    });
    const accounts = listAccountConfigs(cfg);
    expect(accounts.map((a) => a.id)).toEqual(['main', 'backup']);
    expect(accounts[0]!.port).toBe(9000);
    expect(accounts[1]!.port).toBe(9100);
    expect(accounts[1]!.profileDir).toContain('accounts/backup/profile');
    const r = resolveAccount(cfg, 'main');
    expect(r.config.phone).toBe('13800000001');
    expect(r.config.profileDir).toBe(accounts[0]!.profileDir);
    expect(r.config.cache.dbPath).toBe(accounts[0]!.cacheDb);
  });

  it('unknown / disabled account rejected', () => {
    const cfg = ConfigSchema.parse({ accounts: [{ id: 'a' }, { id: 'b', enabled: false }] });
    expect(() => resolveAccount(cfg, 'nope')).toThrow(/account not found/);
    expect(() => resolveAccount(cfg, 'b')).toThrow(/account disabled/);
  });

  it('mask phone', () => {
    expect(maskPhone('13800000000')).toBe('138****0000');
    expect(maskPhone(undefined)).toBeUndefined();
  });
});
