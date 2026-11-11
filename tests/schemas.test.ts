import fs from 'node:fs';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { CompanyDetailSchema, CompanySummarySchema } from '../src/domain/company.js';
import { ContactItemSchema, ContactListSchema } from '../src/domain/contact.js';
import { StatusSchema } from '../src/domain/status.js';
import { FilterConditionSchema, FilterGroupSchema, FilterRegistrySchema } from '../src/domain/filters.js';
import { SearchResultSchema } from '../src/domain/search.js';
import { envelopeSchemaFor, failureEnvelope, successEnvelope } from '../src/schemas/envelope.js';
import { ApiErrorSchema } from '../src/schemas/envelope.js';

const company = {
  id: '37623000277f335b',
  name: '团车互联网信息服务(北京)有限公司',
  uscc: '91110000596018112D',
  legalRepresentative: '闻伟',
  regCapital: { value: 1080000, coinType: '人民币', text: '108.000000万元人民币' },
  foundTime: '2012-05-16',
  address: '北京市海淀区羊坊店路21号9层922',
  operStatus: '营业 > 存续(在营、开业、在册)',
  industry: { first: '信息传输、软件和信息技术服务业', fourth: '互联网其他信息服务' },
  scale: { min: 1000, max: 5000 },
  contactCount: 84,
  unlocked: true,
  tags: ['高新企业', '专精特新'],
  listedTags: ['美股(TC)'],
};

describe('company schemas', () => {
  it('parses summary', () => {
    expect(CompanySummarySchema.parse(company).name).toContain('团车');
  });
  it('rejects invalid id', () => {
    expect(CompanySummarySchema.safeParse({ ...company, id: '中文' }).success).toBe(false);
  });
  it('parses detail with defaults', () => {
    const detail = CompanyDetailSchema.parse(company);
    expect(detail.shareholders).toEqual([]);
    expect(detail.extra).toEqual({});
  });
});

describe('contact schemas', () => {
  it('parses unlocked contact list', () => {
    const list = ContactListSchema.parse({
      companyId: '37623000277f335b',
      unlocked: true,
      counts: { mobile: 39, phone: 22, email: 23, total: 84 },
      contacts: [
        { type: 'mobile', value: '13910230132', masked: false, name: '闻*', department: '财务部' },
        { type: 'email', value: 'ma@chcss.com.cn', masked: false },
      ],
    });
    expect(list.contacts[0]?.type).toBe('mobile');
    expect(ContactItemSchema.parse({ type: 'phone', value: '010-82828236', masked: false }).type).toBe('phone');
  });
  it('rejects unknown contact type', () => {
    expect(ContactItemSchema.safeParse({ type: 'fax', value: '123', masked: false }).success).toBe(false);
  });
});

describe('status schema', () => {
  it('parses quota buckets', () => {
    const status = StatusSchema.parse({
      loggedIn: true,
      health: 'ok',
      quota: {
        daily: { limit: 500, remaining: 490, used: 10, unit: '额度点' },
        monthly: { limit: 1500, remaining: 809, used: 691, unit: '额度点' },
        enterpriseMonthly: { limit: 19500, remaining: 1050, used: 18450, unit: '额度点' },
        settlementDay: 11,
      },
    });
    expect(status.quota?.monthly.remaining).toBe(809);
  });
});

describe('filter schemas', () => {
  it('accepts known condition shapes', () => {
    expect(
      FilterConditionSchema.parse({ key: 'industriesV2', op: 'anyOf', value: ['制造业'] }).key,
    ).toBe('industriesV2');
    expect(
      FilterConditionSchema.parse({ key: 'regCapitalRmb', op: 'range', value: { min: 100, max: 1000 } }).op,
    ).toBe('range');
    expect(FilterConditionSchema.parse({ key: 'hasMobile', op: 'boolean', value: true }).value).toBe(true);
  });
  it('rejects mismatched op/value', () => {
    expect(FilterConditionSchema.safeParse({ key: 'hasMobile', op: 'boolean', value: 'yes' }).success).toBe(false);
    expect(FilterConditionSchema.safeParse({ key: 'name', op: 'contains', value: ['a'] }).success).toBe(false);
  });
  it('parses nested groups', () => {
    const group = FilterGroupSchema.parse({
      relation: 'all',
      conditions: [{ key: 'industriesV2', op: 'anyOf', value: ['制造业'] }],
      groups: [{ relation: 'any', conditions: [{ key: 'regCapitalRmb', op: 'range', value: { min: 100 } }] }],
    });
    expect(group.groups).toHaveLength(1);
  });
  it('registry file is valid and has 12 categories / 345 visible entries', () => {
    const registry = FilterRegistrySchema.parse(
      JSON.parse(fs.readFileSync(new URL('../data/filter-registry.json', import.meta.url), 'utf-8')),
    );
    expect(registry.categories).toHaveLength(12);
    const visible = registry.categories.reduce(
      (n, c) => n + c.subCategories.reduce((m, sc) => m + sc.entries.length, 0),
      0,
    );
    expect(visible).toBe(345);
    expect(registry.hiddenEntries).toHaveLength(11);
    expect(registry.uncategorizedEntries).toHaveLength(23);
  });
});

describe('search result schema', () => {
  it('parses search result', () => {
    const r = SearchResultSchema.parse({
      queryId: 'q_20261109_ab12cd',
      companies: [company],
      total: 833,
      page: 1,
      pageSize: 20,
      hasMore: true,
      tookMs: 120,
    });
    expect(r.cached).toBe(false);
    expect(r.pagesFetched).toBe(1);
  });
});

describe('envelope', () => {
  it('wraps success', () => {
    const meta = {
      schemaVersion: '1.0' as const,
      requestId: 'req_12345678',
      timestamp: '2026-11-09T19:00:00+08:00',
      tookMs: 12,
      cached: false,
      warnings: [],
    };
    const env = successEnvelope({ hello: 'world' }, { requestId: meta.requestId, tookMs: 12 });
    expect(env.ok).toBe(true);
    const schema = envelopeSchemaFor(z.object({ hello: z.string() }));
    expect(schema.safeParse(env).success).toBe(true);
  });
  it('wraps failure', () => {
    const env = failureEnvelope(
      { code: 'AUTH_REQUIRED', message: 'login required', retryable: true },
      { requestId: 'req_12345678', tookMs: 3 },
    );
    expect(env.ok).toBe(false);
    expect(env.error.code).toBe('AUTH_REQUIRED');
  });
});
