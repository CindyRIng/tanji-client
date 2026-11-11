import { describe, expect, it, vi } from 'vitest';
import { ConfigSchema } from '../src/config/schema.js';
import { DefaultTanjiService } from '../src/service.js';
import type { TungeeApiClient } from '../src/adapters/tungee/client.js';

const cfg = ConfigSchema.parse({});

function fakeCache() {
  const details: unknown[] = [];
  const contacts: unknown[] = [];
  return {
    details,
    contacts,
    getCompanyDetail: () => null,
    putCompanyDetail: (d: unknown) => details.push(d),
    getContacts: () => null,
    putContacts: (c: unknown) => contacts.push(c),
  };
}

function fakeSession(api: unknown) {
  return { ensureStarted: async () => {}, api: () => api } as never;
}

describe('unlock slim-down', () => {
  it('default unlock hits only PUT /lead/unlock', async () => {
    const calls: string[] = [];
    const api = {
      unlockCompany: vi.fn(async () => {
        calls.push('unlock');
        return { stat: 1 };
      }),
      getRemainLead: vi.fn(async () => {
        calls.push('quota');
        return {};
      }),
      queryContacts: vi.fn(async () => {
        calls.push('contacts');
        return { status: 4, contacts: [] };
      }),
      assertBulkCapacity: vi.fn(),
    } as unknown as TungeeApiClient;
    const service = new DefaultTanjiService(cfg, fakeSession(api), fakeCache() as never);
    const r = await service.unlock('37623000277f335b', { confirm: true, quota: false, contacts: false });
    expect(calls).toEqual(['unlock']);
    expect(r.quotaCost).toBe(1);
    expect(r.contacts).toBeUndefined();
  });

  it('quota/contacts are opt-in', async () => {
    const calls: string[] = [];
    const remain = {
      individual_month_remain_lead: 100,
      individual_month_limit_lead: 1500,
      individual_day_remain_lead: 490,
      individual_day_limit_lead: 500,
      enterprise_month_remain_lead: 1000,
      enterprise_month_limit_lead: 19500,
    };
    const api = {
      unlockCompany: vi.fn(async () => ({ stat: 1 })),
      getRemainLead: vi.fn(async () => {
        calls.push('quota');
        return remain;
      }),
      queryContacts: vi.fn(async () => {
        calls.push('contacts');
        return { status: 4, contacts: [] };
      }),
      assertBulkCapacity: vi.fn(),
    } as unknown as TungeeApiClient;
    const service = new DefaultTanjiService(cfg, fakeSession(api), fakeCache() as never);
    const r = await service.unlock('id', { confirm: true, quota: true, contacts: true });
    expect(calls).toEqual(['quota', 'contacts']);
    expect(r.quotaAfter).toBe(100);
  });
});

describe('detail sections', () => {
  const makeApi = () => {
    const calls: string[] = [];
    const make = (name: string) =>
      vi.fn(async () => {
        calls.push(name);
        return {};
      });
    const api = {
      getEnterpriseBasic: make('basic'),
      getEnterpriseDetailInfo: make('detail'),
      getHolderPage: make('holders'),
      getMemberPage: make('members'),
      getInvestPage: make('invests'),
      getBranchPage: make('branches'),
      getAlterationPage: make('alterations'),
      assertBulkCapacity: vi.fn(),
    } as unknown as TungeeApiClient;
    return { api, calls };
  };

  it('light request only fetches basic+detail and does not overwrite full cache', async () => {
    const { api, calls } = makeApi();
    const cache = fakeCache();
    const service = new DefaultTanjiService(cfg, fakeSession(api), cache as never);
    const d = await service.companyDetail({ id: 'x', sections: ['basic', 'detail'] });
    expect(calls).toEqual(['basic', 'detail']);
    expect(d.partial).toBe(true);
    expect(d.sections).toEqual(['basic', 'detail']);
    expect(cache.details).toHaveLength(0);
  });

  it('full request fetches 7 sections and caches', async () => {
    const { api, calls } = makeApi();
    const cache = fakeCache();
    const service = new DefaultTanjiService(cfg, fakeSession(api), cache as never);
    const d = await service.companyDetail({ id: 'x' });
    expect(calls).toHaveLength(7);
    expect(d.partial).toBe(false);
    expect(cache.details).toHaveLength(1);
  });
});
