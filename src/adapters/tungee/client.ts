/**
 * 探迹上游 API 客户端（在已登录页面上下文中执行 fetch，保持 cookie/会话）
 */
import type { PageLike } from '../../browser/types.js';
import type { FilterGroupInput, FilterCondition } from '../../domain/filters.js';
import { TanjiError } from '../../errors/catalog.js';
import { SEARCH_FIELDS, TUNGEE_DEFAULTS, TUNGEE_ENDPOINTS } from './endpoints.js';
import { buildAdvanceFilter } from './filter-builder.js';
import { RateLimiter } from './rate-limiter.js';
import { filterEntryLookup } from './filter-registry.js';
import {
  RawAlterationPageSchema,
  RawBranchPageSchema,
  RawEnterpriseBasicSchema,
  RawEnterpriseDetailInfoSchema,
  RawHolderPageSchema,
  RawInvestPageSchema,
  RawMemberPageSchema,
  RawAdvanceSearchSchema,
  RawEnterpriseNamesSchema,
  RawEnterprisesSearchSchema,
  RawInfoBarSchema,
  RawQueryContactsSchema,
  RawRemainLeadSchema,
  RawUnlockSchema,
  type RawAdvanceSearch,
  type RawEnterpriseNames,
  type RawAlterationPage,
  type RawBranchPage,
  type RawEnterpriseBasic,
  type RawEnterpriseDetailInfo,
  type RawHolderPage,
  type RawInvestPage,
  type RawMemberPage,
  type RawEnterprisesSearch,
  type RawInfoBar,
  type RawQueryContacts,
  type RawRemainLead,
  type RawUnlock,
} from './raw.js';
import type { z } from 'zod';

export interface TungeeApiConfig {
  baseUrl: string;
  productLine?: string;
  timeoutMs?: number;
  ratePerMin?: number;
  priorityReserve?: number;
  bulkQueueMax?: number;
}

export interface EnterprisesSearchParams {
  start: number;
  end: number;
  keywords: string;
  field?: keyof typeof SEARCH_FIELDS;
  filter?: Record<string, unknown>;
}

export interface AdvanceSearchParams {
  filter: Record<string, unknown>;
  relation: 0 | 1;
  start: number;
  end: number;
  sort?: Record<string, unknown>;
}

export interface TungeeApiClient {
  getRemainLead(): Promise<RawRemainLead>;
  getInfoBar(): Promise<RawInfoBar>;
  searchEnterprises(params: EnterprisesSearchParams): Promise<RawEnterprisesSearch>;
  advanceSearch(params: AdvanceSearchParams): Promise<RawAdvanceSearch>;
  queryContacts(companyId: string): Promise<RawQueryContacts>;
  unlockCompany(companyId: string): Promise<RawUnlock>;
  searchEnterpriseNames(keyword: string): Promise<RawEnterpriseNames>;
  assertBulkCapacity(count?: number): void;
  getEnterpriseBasic(companyId: string): Promise<RawEnterpriseBasic>;
  getEnterpriseDetailInfo(companyId: string): Promise<RawEnterpriseDetailInfo>;
  getHolderPage(companyId: string): Promise<RawHolderPage>;
  getMemberPage(companyId: string): Promise<RawMemberPage>;
  getInvestPage(companyId: string): Promise<RawInvestPage>;
  getBranchPage(companyId: string): Promise<RawBranchPage>;
  getAlterationPage(companyId: string): Promise<RawAlterationPage>;
  buildAdvanceFilter(group: FilterGroupInput): { filter: Record<string, unknown>; relation: 0 | 1 };
}

interface FetchInit {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined>;
  form?: Array<[string, string]>;
}

export class PageTungeeApiClient implements TungeeApiClient {
  private readonly limiter: RateLimiter;

  constructor(
    private readonly page: PageLike,
    private readonly cfg: TungeeApiConfig,
  ) {
    this.limiter = new RateLimiter(cfg.ratePerMin ?? 20, {
      priorityReserve: cfg.priorityReserve,
      bulkQueueMax: cfg.bulkQueueMax,
    });
  }

  assertBulkCapacity(count = 1): void {
    this.limiter.assertBulkCapacity(count);
  }

  private async fetchJson<T extends z.ZodTypeAny>(
    path: string,
    init: FetchInit,
    schema: T,
    kind: 'bulk' | 'priority' = 'bulk',
  ): Promise<z.infer<T>> {
    await this.limiter.acquire(kind);
    const url = new URL(path, this.cfg.baseUrl).toString();
    const payload = {
      url,
      method: init.method,
      query: init.query ?? {},
      form: init.form ?? null,
    };
    let out: { status: number; json: unknown; text: string };
    try {
      out = (await this.page.evaluate(
      async (raw) => {
        const req = raw as {
          url: string;
          method: string;
          query: Record<string, string | number | boolean>;
          form: Array<[string, string]> | null;
        };
        const u = new URL(req.url);
        for (const [k, v] of Object.entries(req.query)) {
          if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
        }
        const opts: RequestInit = { method: req.method, credentials: 'include' };
        if (req.form) {
          const fd = new FormData();
          for (const [k, v] of req.form) fd.append(k, v);
          opts.body = fd;
        }
        const r = await fetch(u.toString(), opts);
        const text = await r.text();
        let json: unknown = null;
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
        return { status: r.status, json, text: text.slice(0, 2000) };
      },
        payload,
      )) as { status: number; json: unknown; text: string };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/Failed to fetch|net::ERR|CORS/i.test(message)) {
        throw new TanjiError('AUTH_REQUIRED', '页面不在探迹域或登录态失效，请重新登录（tanji login）', {
          cause: err,
        });
      }
      throw new TanjiError('UPSTREAM_UNAVAILABLE', `页面内请求失败：${message}`, { cause: err });
    }

    if (out.status === 401) {
      throw new TanjiError('AUTH_REQUIRED', '探迹登录态失效，需要重新登录');
    }
    if (out.status === 403) {
      throw new TanjiError('FORBIDDEN', '探迹接口拒绝访问（无权限/风控）');
    }
    if (out.status === 429) {
      throw new TanjiError('RATE_LIMITED', '触发探迹限流', { retryAfterMs: 60_000 });
    }
    if (out.status >= 500) {
      throw new TanjiError('UPSTREAM_UNAVAILABLE', `探迹接口异常 HTTP ${out.status}`, {
        details: { body: out.text },
      });
    }
    if (out.json === null) {
      throw new TanjiError('UPSTREAM_CHANGED', '探迹接口返回非 JSON（可能已改版）', {
        details: { path, body: out.text },
      });
    }
    const parsed = schema.safeParse(out.json);
    if (!parsed.success) {
      throw new TanjiError('UPSTREAM_CHANGED', '探迹接口响应结构变化', {
        details: { path, issues: parsed.error.issues, body: out.text.slice(0, 800) },
      });
    }
    return parsed.data as z.infer<T>;
  }

  async getRemainLead(): Promise<RawRemainLead> {
    return this.fetchJson(TUNGEE_ENDPOINTS.remainLead, { method: 'GET' }, RawRemainLeadSchema);
  }

  async getInfoBar(): Promise<RawInfoBar> {
    return this.fetchJson(TUNGEE_ENDPOINTS.infoBar, { method: 'GET' }, RawInfoBarSchema);
  }

  async searchEnterprises(params: EnterprisesSearchParams): Promise<RawEnterprisesSearch> {
    const fieldValue = params.field && params.field !== 'all' ? SEARCH_FIELDS[params.field] : undefined;
    return this.fetchJson(
      TUNGEE_ENDPOINTS.enterprisesSearch,
      {
        method: 'GET',
        query: {
          start: params.start,
          end: params.end,
          keywords: params.keywords,
          ...(fieldValue ? { fields: fieldValue } : {}),
          filter: JSON.stringify(params.filter ?? { show_associate: 0 }),
          filter_lead: 0,
          industry: this.cfg.productLine ?? TUNGEE_DEFAULTS.productLine,
          is_canary: 1,
        },
      },
      RawEnterprisesSearchSchema,
    );
  }

  async advanceSearch(params: AdvanceSearchParams): Promise<RawAdvanceSearch> {
    return this.fetchJson(
      TUNGEE_ENDPOINTS.advanceSearchV2,
      {
        method: 'POST',
        form: [
          ['filter', JSON.stringify(params.filter)],
          ['relation', String(params.relation)],
          ['start', String(params.start)],
          ['end', String(params.end)],
          ['sort', JSON.stringify(params.sort ?? {})],
          ['mode', TUNGEE_DEFAULTS.advanceSearchMode],
          ['filter_advance_search_filter_pool', '1'],
        ],
      },
      RawAdvanceSearchSchema,
    );
  }

  async queryContacts(companyId: string): Promise<RawQueryContacts> {
    return this.fetchJson(
      TUNGEE_ENDPOINTS.queryContacts,
      { method: 'GET', query: { enterprise_id: companyId } },
      RawQueryContactsSchema,
    );
  }

  async unlockCompany(companyId: string): Promise<RawUnlock> {
    return this.fetchJson(
      TUNGEE_ENDPOINTS.unlock,
      {
        method: 'PUT',
        form: [
          ['source', TUNGEE_DEFAULTS.unlockSource],
          ['enterprise_id', companyId],
          ['entity_type', TUNGEE_DEFAULTS.unlockEntityType],
        ],
      },
      RawUnlockSchema,
      'priority',
    );
  }

  async getEnterpriseBasic(companyId: string): Promise<RawEnterpriseBasic> {
    return this.fetchJson(
      '/api/enterprise/info/basic',
      { method: 'GET', query: { enterprise_id: companyId } },
      RawEnterpriseBasicSchema,
    );
  }

  async getEnterpriseDetailInfo(companyId: string): Promise<RawEnterpriseDetailInfo> {
    return this.fetchJson(
      '/api/enterprise/info/detail',
      { method: 'GET', query: { enterprise_id: companyId } },
      RawEnterpriseDetailInfoSchema,
    );
  }

  async getHolderPage(companyId: string): Promise<RawHolderPage> {
    return this.fetchJson(
      '/api/enterprise/detail/holder-page',
      { method: 'GET', query: { enterprise_id: companyId, start: 0, end: 50 } },
      RawHolderPageSchema,
    );
  }

  async getMemberPage(companyId: string): Promise<RawMemberPage> {
    return this.fetchJson(
      '/api/enterprise/detail/member-page',
      { method: 'GET', query: { enterprise_id: companyId, start: 0, end: 50 } },
      RawMemberPageSchema,
    );
  }

  async getInvestPage(companyId: string): Promise<RawInvestPage> {
    return this.fetchJson(
      '/api/enterprise/detail/invest-page',
      { method: 'GET', query: { enterprise_id: companyId, start: 0, end: 50 } },
      RawInvestPageSchema,
    );
  }

  async getBranchPage(companyId: string): Promise<RawBranchPage> {
    return this.fetchJson(
      '/api/enterprise/detail/branch-office-page',
      { method: 'GET', query: { enterprise_id: companyId, start: 0, end: 50 } },
      RawBranchPageSchema,
    );
  }

  async getAlterationPage(companyId: string): Promise<RawAlterationPage> {
    return this.fetchJson(
      '/api/enterprise/detail/alteration-page',
      { method: 'GET', query: { enterprise_id: companyId, start: 0, end: 50 } },
      RawAlterationPageSchema,
    );
  }

  async searchEnterpriseNames(keyword: string): Promise<RawEnterpriseNames> {
    return this.fetchJson(
      TUNGEE_ENDPOINTS.enterpriseNamesSearch,
      { method: 'GET', query: { keywords: keyword, entity_type: 'enterprise' } },
      RawEnterpriseNamesSchema,
    );
  }

  /**
   * 条件组 → 探迹 advance-search-v2 的 filter JSON。
   * 通用规则见 src/adapters/tungee/filter-builder.ts 与 docs/06 §8。
   */
  buildAdvanceFilter(group: FilterGroupInput): { filter: Record<string, unknown>; relation: 0 | 1 } {
    return buildAdvanceFilter(group, filterEntryLookup());
  }
}
