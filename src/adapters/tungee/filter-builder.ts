/**
 * 条件组 → 探迹 /api/advance-search-v2 的 filter JSON
 *
 * 映射逻辑来自探迹前端 transformCondition（见 docs/06 §8）：
 *   action.type: RANGE=0, EXIST_OR_NOT=1, CONTAIN_OR_NOT=2, EQUAL_OR_NOT=3,
 *                TEXT_CONTAIN_OR_NOT=4, SELECT=5, TEXT_CONTAIN=7, NO_ACTION=8,
 *                CONTAIN=9, EQUAL=10, YES_OR_NO=11
 *   input.type:  NUMBER=0, DATE_PICKER=1, MULTI_TREE_SELECT=2, MULTI_KEYWORD=3,
 *                MULTI_SELECT=4, NUMBER_RANGE=5, DATE_RANGE=6, SELECT_RANGE=7,
 *                MULTI_TREE_SELECT_FOUR=8, YEAR_RANGE=9, MULTI_SELECT_WITH_LAST_VALUE=10
 *
 * 规则：
 *   action=0  → { key: [ {gte?, lte?} ] }
 *   action=8  → { key: value }                       （关联过滤 / 原始值）
 *   action=5  → { key: [ value ] }                   （预设选项，value 为上游对象）
 *   其他      → { key: [ { <operator>: value } ] }
 *       operator: 1/11 exist|not_exist；2/4 in|nin；3 eq|neq；7/9 in；10 eq
 */
import type { FilterGroupInput, FilterCondition } from '../../domain/filters.js';
import { TanjiError } from '../../errors/catalog.js';

export interface FilterEntryMeta {
  key: string;
  label: string;
  upstreamActionType?: number | null;
  upstreamInputType?: number | null;
  optionsSource?: string;
}

export type FilterEntryLookup = (key: string) => FilterEntryMeta | undefined;

export interface AdvanceFilterPayload {
  filter: Record<string, unknown>;
  relation: 0 | 1;
}

const RANGE = 0;
const EXIST_OR_NOT = 1;
const CONTAIN_OR_NOT = 2;
const EQUAL_OR_NOT = 3;
const TEXT_CONTAIN_OR_NOT = 4;
const SELECT = 5;
const TEXT_CONTAIN = 7;
const NO_ACTION = 8;
const CONTAIN = 9;
const EQUAL = 10;
const YES_OR_NO = 11;

function asArray<T>(v: T | T[]): T[] {
  return Array.isArray(v) ? v : [v];
}

function asNumberOrString(v: unknown): number | string | undefined {
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return undefined;
}

function rangeOf(cond: FilterCondition): { min?: number | string; max?: number | string } {
  const v = cond.value;
  if (Array.isArray(v)) {
    return { ...(v[0] !== undefined ? { min: asNumberOrString(v[0]) } : {}), ...(v[1] !== undefined ? { max: asNumberOrString(v[1]) } : {}) };
  }
  if (v && typeof v === 'object') {
    const o = v as { min?: unknown; max?: unknown };
    return { ...(o.min !== undefined ? { min: asNumberOrString(o.min) } : {}), ...(o.max !== undefined ? { max: asNumberOrString(o.max) } : {}) };
  }
  throw new TanjiError('BAD_REQUEST', `condition ${cond.key} range value must be {min?,max?} or [min,max]`);
}

function shapeValue(cond: FilterCondition, entry: FilterEntryMeta | undefined, actionType: number | undefined): unknown {
  const inputType = entry?.upstreamInputType ?? undefined;
  if (actionType === RANGE) {
    const { min, max } = rangeOf(cond);
    return { ...(min !== undefined ? { gte: min } : {}), ...(max !== undefined ? { lte: max } : {}) };
  }
  if (actionType === SELECT) {
    return cond.value;
  }
  if (actionType === NO_ACTION) {
    return cond.value;
  }
  // 多选/树形：上游使用嵌套数组（每项是一条选择路径）
  if (inputType === 2 || inputType === 8) {
    if (Array.isArray(cond.value)) {
      const nested = cond.value.every((x) => Array.isArray(x))
        ? cond.value
        : cond.value.map((x) => [x]);
      return nested;
    }
    return [[cond.value]];
  }
  return Array.isArray(cond.value) ? cond.value : [cond.value];
}

function operatorFor(cond: FilterCondition, actionType: number | undefined): string {
  const neg = cond.negated;
  switch (actionType) {
    case EXIST_OR_NOT:
    case YES_OR_NO:
      return neg ? 'not_exist' : 'exist';
    case CONTAIN_OR_NOT:
    case TEXT_CONTAIN_OR_NOT:
      return neg ? 'nin' : 'in';
    case EQUAL_OR_NOT:
    case EQUAL:
      return neg ? 'neq' : 'eq';
    case TEXT_CONTAIN:
    case CONTAIN:
      return 'in';
    default:
      // 未知 action.type 时按 op 兜底
      switch (cond.op) {
        case 'anyOf':
        case 'contains':
          return neg ? 'nin' : 'in';
        case 'eq':
          return neg ? 'neq' : 'eq';
        case 'boolean':
          return neg ? 'not_exist' : 'exist';
        case 'preset':
          return 'eq';
        default:
          throw new TanjiError('NOT_IMPLEMENTED', `无法为 ${cond.key}（action.type=${actionType ?? 'unknown'}）生成 filter`, {
            details: { key: cond.key, op: cond.op, actionType },
          });
      }
  }
}

export function conditionToFilter(
  cond: FilterCondition,
  entry: FilterEntryMeta | undefined,
  actionType: number | undefined,
): Record<string, unknown> {
  if (actionType === NO_ACTION) {
    return { [cond.key]: cond.value };
  }
  if (actionType === SELECT) {
    return { [cond.key]: [cond.value] };
  }
  if (actionType === EXIST_OR_NOT || actionType === YES_OR_NO) {
    const truthy = cond.value === true || cond.value === 1 || cond.value === '1' || cond.value === '是';
    const op = truthy !== cond.negated ? 'exist' : 'not_exist';
    return { [cond.key]: [{ [op]: true }] };
  }
  if (actionType === RANGE) {
    return { [cond.key]: [shapeValue(cond, entry, actionType)] };
  }
  const op = operatorFor(cond, actionType);
  const shaped = shapeValue(cond, entry, actionType);
  return { [cond.key]: [{ [op]: shaped }] };
}

function buildGroup(group: FilterGroupInput, lookup: FilterEntryLookup): Record<string, unknown> {
  const key = group.relation === 'any' ? 'should' : 'must';
  const children: unknown[] = [];
  for (const cond of group.conditions ?? []) {
    const entry = lookup(cond.key);
    const actionType = entry?.upstreamActionType ?? undefined;
    children.push(conditionToFilter(cond, entry, actionType));
  }
  for (const child of group.groups ?? []) {
    const inner = buildGroup(child, lookup);
    const innerKey = Object.keys(inner)[0];
    if (innerKey && innerKey !== key) {
      children.push(inner);
    } else {
      // 同 relation 时直接展开子项，减少嵌套
      children.push(...((inner[innerKey!] as unknown[]) ?? []));
    }
  }
  return { [key]: children };
}

export function buildAdvanceFilter(group: FilterGroupInput, lookup: FilterEntryLookup): AdvanceFilterPayload {
  if (!group.conditions?.length && !group.groups?.length) {
    throw new TanjiError('BAD_REQUEST', 'filter group must not be empty');
  }
  const filter = buildGroup(group, lookup);
  return { filter, relation: group.relation === 'any' ? 1 : 0 };
}
