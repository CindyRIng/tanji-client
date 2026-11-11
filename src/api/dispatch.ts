/**
 * 操作分发：把传输层解析后的参数映射到 TanjiService
 */
import type { TanjiService } from '../service.js';
import type { PaginationMeta } from '../schemas/envelope.js';
import type { FilterRegistry } from '../domain/filters.js';

export interface InvocationInput {
  pathParams?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: unknown;
}

export interface InvocationResult {
  data: unknown;
  pagination?: PaginationMeta;
  cached?: boolean;
}

export async function invoke(service: TanjiService, operationId: string, input: InvocationInput): Promise<InvocationResult> {
  const { pathParams = {}, query = {}, body = {} } = input;
  switch (operationId) {
    case 'health.get':
      return { data: await service.health() };
    case 'status.get':
      return { data: await service.status() };
    case 'session.login':
      return { data: await service.login(body as { interactive: boolean; force: boolean }) };
    case 'search.name': {
      const result = await service.searchName(body as Parameters<TanjiService['searchName']>[0]);
      return { data: result, pagination: pageOf(result), cached: result.cached };
    }
    case 'search.advance': {
      const result = await service.searchAdvance(body as Parameters<TanjiService['searchAdvance']>[0]);
      return { data: result, pagination: pageOf(result), cached: result.cached };
    }
    case 'companies.list': {
      const q = query as { queryId: string; page: number; pageSize: number; refresh?: string | boolean };
      const result = await service.listCompanies({
        queryId: q.queryId,
        page: q.page,
        pageSize: q.pageSize,
        refresh: q.refresh === 'true' || q.refresh === true,
      });
      return { data: result, pagination: pageOf(result), cached: result.cached };
    }
    case 'companies.detail': {
      const id = pathParams.id ?? '';
      const refresh = query.refresh === 'true' || query.refresh === true;
      const rawSections = Array.isArray(query.sections)
        ? query.sections.map(String)
        : typeof query.sections === 'string'
          ? query.sections.split(',').map((x) => x.trim()).filter(Boolean)
          : [];
      const detail = await service.companyDetail({ id, refresh, sections: rawSections });
      return { data: detail, cached: Boolean((detail as { cached?: boolean }).cached) };
    }
    case 'contacts.list': {
      const id = pathParams.id ?? '';
      const refresh = query.refresh === 'true' || query.refresh === true;
      const rawTypes = typeof query.types === 'string' ? query.types.split(',').filter(Boolean) : [];
      const list = await service.listContacts({
        id,
        refresh,
        types: rawTypes as Array<'mobile' | 'phone' | 'email'>,
      });
      return { data: list, cached: list.cached };
    }
    case 'companies.unlock': {
      const id = pathParams.id ?? '';
      const b = body as { confirm: true; idempotencyKey?: string; quota?: boolean; contacts?: boolean };
      return {
        data: await service.unlock(id, {
          confirm: true,
          idempotencyKey: b.idempotencyKey,
          quota: b.quota ?? false,
          contacts: b.contacts ?? false,
        }),
      };
    }
    case 'accounts.list':
      return { data: await service.listAccounts() };
    case 'cache.stats':
      return { data: await service.cacheStats() };
    case 'cache.clear': {
      const b = body as { prefix?: string; all?: boolean };
      return { data: await service.cacheClear(b) };
    }
    case 'filters.registry': {
      const reg = await service.filterRegistry();
      const category = typeof query.category === 'string' ? query.category : undefined;
      const keyword = typeof query.keyword === 'string' ? query.keyword : undefined;
      return { data: filterRegistry(reg, category, keyword) };
    }
    default:
      throw new Error(`unhandled operation: ${operationId}`);
  }
}

function pageOf(result: { page: number; pageSize: number; total: number; hasMore: boolean }): PaginationMeta {
  return { page: result.page, pageSize: result.pageSize, total: result.total, hasMore: result.hasMore };
}

function filterRegistry(reg: FilterRegistry, category?: string, keyword?: string): FilterRegistry {
  if (!category && !keyword) return reg;
  const match = (e: { label: string; key: string }) =>
    (!keyword || e.label.includes(keyword) || e.key.includes(keyword)) as boolean;
  return {
    ...reg,
    categories: reg.categories
      .filter((c) => !category || c.name === category)
      .map((c) => ({
        ...c,
        subCategories: c.subCategories
          .map((sc) => ({ ...sc, entries: sc.entries.filter(match) }))
          .filter((sc) => sc.entries.length > 0),
      })),
    hiddenEntries: reg.hiddenEntries.filter(match),
    uncategorizedEntries: reg.uncategorizedEntries.filter(match),
  };
}
