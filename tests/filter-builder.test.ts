import { describe, expect, it } from 'vitest';
import { buildAdvanceFilter } from '../src/adapters/tungee/filter-builder.js';
import { filterEntryLookup } from '../src/adapters/tungee/filter-registry.js';
import type { FilterGroupInput } from '../src/domain/filters.js';

const lookup = filterEntryLookup();

function build(group: FilterGroupInput) {
  return buildAdvanceFilter(group, lookup);
}

describe('filter builder (upstream transformCondition 规则)', () => {
  it('keyword → in', () => {
    const { filter } = build({ relation: 'all', conditions: [{ key: 'name', op: 'contains', value: '团车' }] });
    expect(filter).toEqual({ must: [{ name: [{ in: ['团车'] }] }] });
  });

  it('select/multiSelect (action=3) → eq + 嵌套数组', () => {
    const { filter } = build({
      relation: 'all',
      conditions: [{ key: 'operStatus_v2', op: 'anyOf', value: ['营业'] }],
    });
    expect(filter).toEqual({ must: [{ operStatus_v2: [{ eq: [['营业']] }] }] });
  });

  it('tree (input=8) → eq + 嵌套数组', () => {
    const { filter } = build({
      relation: 'all',
      conditions: [{ key: 'industriesV2', op: 'anyOf', value: ['信息传输、软件和信息技术服务业'] }],
    });
    expect(filter).toEqual({ must: [{ industriesV2: [{ eq: [['信息传输、软件和信息技术服务业']] }] }] });
  });

  it('number range → gte/lte', () => {
    const { filter } = build({
      relation: 'all',
      conditions: [{ key: 'regCapitalRmb', op: 'range', value: { min: 100, max: 1000 } }],
    });
    expect(filter).toEqual({ must: [{ regCapitalRmb: [{ gte: 100, lte: 1000 }] }] });
  });

  it('date range → gte/lte', () => {
    const { filter } = build({
      relation: 'all',
      conditions: [{ key: 'foundTime', op: 'range', value: { min: '2020-01-01', max: '2023-12-31' } }],
    });
    expect(filter).toEqual({ must: [{ foundTime: [{ gte: '2020-01-01', lte: '2023-12-31' }] }] });
  });

  it('toggle (action=1) → exist', () => {
    const { filter } = build({
      relation: 'all',
      conditions: [{ key: 'hasAnnualReport', op: 'boolean', value: true }],
    });
    expect(filter).toEqual({ must: [{ hasAnnualReport: [{ exist: true }] }] });
  });

  it('relation=any → should / relation=1', () => {
    const out = build({
      relation: 'any',
      conditions: [{ key: 'name', op: 'contains', value: '团车' }],
    });
    expect(out.relation).toBe(1);
    expect(out.filter).toEqual({ should: [{ name: [{ in: ['团车'] }] }] });
  });

  it('nested groups', () => {
    const out = build({
      relation: 'all',
      conditions: [{ key: 'name', op: 'contains', value: '团车' }],
      groups: [
        {
          relation: 'any',
          conditions: [
            { key: 'regCapitalRmb', op: 'range', value: { min: 100 } },
            { key: 'hasAnnualReport', op: 'boolean', value: true },
          ],
        },
      ],
    });
    expect(out.filter).toEqual({
      must: [
        { name: [{ in: ['团车'] }] },
        { should: [{ regCapitalRmb: [{ gte: 100 }] }, { hasAnnualReport: [{ exist: true }] }] },
      ],
    });
  });

  it('rejects empty group', () => {
    expect(() => build({ relation: 'all', conditions: [] })).toThrow(/must not be empty/);
  });

  it('rejects malformed range', () => {
    expect(() => build({ relation: 'all', conditions: [{ key: 'regCapitalRmb', op: 'range', value: 100 }] })).toThrow(
      /range value/,
    );
  });
});
