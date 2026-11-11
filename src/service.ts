/**
 * 应用服务层：对外能力的统一实现
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Config } from './config/schema.js';
import type { CacheStore, SearchPageValue } from './cache/types.js';
import type { SessionManager } from './session/manager.js';
import { TanjiError } from './errors/catalog.js';
import { mapCompany, mapContactList, mapDetailFromApis, mapQuota } from './adapters/tungee/mapper.js';
import type { CompanyDetail, CompanyDetailSection } from './domain/company.js';
import type { ContactList, UnlockRequest, UnlockResult } from './domain/contact.js';
import type { HealthResponse, LoginRequest, Status } from './domain/status.js';
import type { SearchResult } from './domain/search.js';
import type { CacheClearResult, CacheStats } from './schemas/cache.js';
import type { SearchAdvanceRequest, SearchNameRequest } from './domain/search.js';
import { SCHEMA_VERSION } from './schemas/envelope.js';
import { FilterRegistrySchema, type FilterRegistry } from './domain/filters.js';
import type { Logger } from './utils/logger.js';
import { listAccountConfigs, maskPhone } from './accounts/config.js';
import { accountRuntimeStatus } from './accounts/daemon.js';
import type { AccountsResponse } from './domain/accounts.js';

export const VERSION = '0.1.0';

export interface TanjiService {
  health(): Promise<HealthResponse>;
  status(): Promise<Status>;
  login(req: LoginRequest): Promise<Status>;
  searchName(req: SearchNameRequest): Promise<SearchResult>;
  searchAdvance(req: SearchAdvanceRequest): Promise<SearchResult>;
  listCompanies(req: { queryId: string; page: number; pageSize: number; refresh?: boolean }): Promise<SearchResult>;
  companyDetail(req: { id: string; refresh?: boolean; sections?: string[] }): Promise<CompanyDetail>;
  listContacts(req: { id: string; refresh?: boolean; types?: Array<'mobile' | 'phone' | 'email'> }): Promise<ContactList>;
  unlock(companyId: string, req: UnlockRequest): Promise<UnlockResult>;
  cacheStats(): Promise<CacheStats>;
  cacheClear(req: { prefix?: string; all?: boolean }): Promise<CacheClearResult>;
  filterRegistry(): Promise<FilterRegistry>;
  listAccounts(): Promise<AccountsResponse>;
}

function newQueryId(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `q_${ymd}_${Math.random().toString(36).slice(2, 8)}`;
}

export class DefaultTanjiService implements TanjiService {
  private readonly startedAt = Date.now();

  constructor(
    private readonly cfg: Config,
    private readonly session: SessionManager,
    private readonly cache: CacheStore,
    private readonly logger?: Logger,
  ) {}

  private key(...parts: unknown[]): string {
    return createHash('sha1').update(JSON.stringify(parts)).digest('hex');
  }

  async health(): Promise<HealthResponse> {
    return {
      ok: true,
      version: VERSION,
      uptimeSec: Math.floor((Date.now() - this.startedAt) / 1000),
      schemaVersion: SCHEMA_VERSION,
      browser: { connected: this.session.isRunning(), headless: this.cfg.headless },
      cache: { dbPath: this.cfg.cache.dbPath, ready: true },
    };
  }

  async status(): Promise<Status> {
    return this.session.status();
  }

  async login(req: LoginRequest): Promise<Status> {
    return this.session.login(req);
  }

  private storeQuery(
    kind: 'name' | 'advance',
    request: Parameters<CacheStore['putQuery']>[0]['request'],
    total: number,
  ): string {
    const queryId = newQueryId();
    this.cache.putQuery({
      queryId,
      kind,
      request,
      total,
      fetchedAt: Date.now(),
      expiresAt: Date.now() + this.cfg.cache.listTtlSec * 1000,
    });
    return queryId;
  }

  async searchName(req: SearchNameRequest): Promise<SearchResult> {
    await this.session.ensureStarted();
    const api = this.session.api();
    const started = Date.now();
    const pageSize = req.pageSize;
    const start = (req.page - 1) * pageSize;
    const cacheKey = this.key('name', req.name, req.field, req.page, pageSize);
    if (!req.refresh) {
      const cached = this.cache.getSearchPage(cacheKey, this.cfg.cache.listTtlSec);
      if (cached?.fresh) {
        const queryId = this.storeQuery(
          'name',
          { kind: 'name', name: req.name, field: req.field, pageSize, maxPages: req.maxPages },
          cached.value.total,
        );
        return { queryId, ...cached.value, cached: true, tookMs: Date.now() - started, warnings: [] };
      }
    }
    api.assertBulkCapacity(1);
    const raw = await api.searchEnterprises({ start, end: start + pageSize, keywords: req.name, field: req.field });
    const value: SearchPageValue = {
      companies: raw.enterprises.map(mapCompany),
      total: raw.total,
      page: req.page,
      pageSize,
      hasMore: start + raw.enterprises.length < raw.total,
      pagesFetched: 1,
    };
    this.cache.putSearchPage(cacheKey, value);
    const queryId = this.storeQuery(
      'name',
      { kind: 'name', name: req.name, field: req.field, pageSize, maxPages: req.maxPages },
      value.total,
    );
    return { queryId, ...value, cached: false, tookMs: Date.now() - started, warnings: [] };
  }

  async searchAdvance(req: SearchAdvanceRequest): Promise<SearchResult> {
    await this.session.ensureStarted();
    const api = this.session.api();
    const started = Date.now();
    const pageSize = req.pageSize;
    const start = (req.page - 1) * pageSize;
    const cacheKey = this.key('advance', req.filters, req.page, pageSize);
    if (!req.refresh) {
      const cached = this.cache.getSearchPage(cacheKey, this.cfg.cache.listTtlSec);
      if (cached?.fresh) {
        const queryId = this.storeQuery(
          'advance',
          { kind: 'advance', filters: req.filters, pageSize, maxPages: req.maxPages, ...(req.sort ? { sort: req.sort } : {}) },
          cached.value.total,
        );
        return { queryId, ...cached.value, cached: true, tookMs: Date.now() - started, warnings: [] };
      }
    }
    const { filter, relation } = api.buildAdvanceFilter(req.filters);
    const raw = await api.advanceSearch({ filter, relation, start, end: start + pageSize, ...(req.sort ? { sort: req.sort as unknown as Record<string, unknown> } : {}) });
    const value: SearchPageValue = {
      companies: raw.data.map(mapCompany),
      total: raw.total,
      page: req.page,
      pageSize,
      hasMore: start + raw.data.length < raw.total,
      pagesFetched: 1,
    };
    this.cache.putSearchPage(cacheKey, value);
    const queryId = this.storeQuery(
      'advance',
      { kind: 'advance', filters: req.filters, pageSize, maxPages: req.maxPages, ...(req.sort ? { sort: req.sort } : {}) },
      value.total,
    );
    return { queryId, ...value, cached: false, tookMs: Date.now() - started, warnings: [] };
  }

  async listCompanies(req: { queryId: string; page: number; pageSize: number; refresh?: boolean }): Promise<SearchResult> {
    const record = this.cache.getQuery(req.queryId);
    if (!record) throw new TanjiError('NOT_FOUND', `query not found or expired: ${req.queryId}`);
    await this.session.ensureStarted();
    const api = this.session.api();
    const started = Date.now();
    const start = (req.page - 1) * req.pageSize;
    const cacheKey = this.key('list', req.queryId, req.page, req.pageSize);
    if (!req.refresh) {
      const cached = this.cache.getSearchPage(cacheKey, this.cfg.cache.listTtlSec);
      if (cached?.fresh) {
        return { queryId: req.queryId, ...cached.value, cached: true, tookMs: Date.now() - started, warnings: [] };
      }
    }
    const value =
      record.request.kind === 'name'
        ? await this.fetchNamePage(record.request, start, req.pageSize)
        : await this.fetchAdvancePage(record.request, start, req.pageSize);
    this.cache.putSearchPage(cacheKey, value);
    return { queryId: req.queryId, ...value, cached: false, tookMs: Date.now() - started, warnings: [] };
  }

  private async fetchNamePage(
    request: Extract<Parameters<CacheStore['putQuery']>[0]['request'], { kind: 'name' }>,
    start: number,
    pageSize: number,
  ): Promise<SearchPageValue> {
    const api = this.session.api();
    // 企业查询接口在 start>0 时返回 403（err=402，风控），翻页改走 advance-search-v2
    const fieldKey: Record<string, string> = {
      name: 'name',
      legalRepresentative: 'legalRepresentative',
      address: 'address',
      socialCreditCode: 'socialCreditCode',
      contact: 'contact',
    };
    const key = fieldKey[request.field] ?? 'name';
    const filter = { must: [{ [key]: [{ in: [request.name] }] }] };
    const raw = await api.advanceSearch({ filter, relation: 0, start, end: start + pageSize });
    return {
      companies: raw.data.map(mapCompany),
      total: raw.total,
      page: Math.floor(start / pageSize) + 1,
      pageSize,
      hasMore: start + raw.data.length < raw.total,
      pagesFetched: 1,
    };
  }

  private async fetchAdvancePage(
    request: Extract<Parameters<CacheStore['putQuery']>[0]['request'], { kind: 'advance' }>,
    start: number,
    pageSize: number,
  ): Promise<SearchPageValue> {
    const api = this.session.api();
    const built = api.buildAdvanceFilter(request.filters);
    api.assertBulkCapacity(1);
    const raw = await api.advanceSearch({ ...built, start, end: start + pageSize });
    return {
      companies: raw.data.map(mapCompany),
      total: raw.total,
      page: Math.floor(start / pageSize) + 1,
      pageSize,
      hasMore: start + raw.data.length < raw.total,
      pagesFetched: 1,
    };
  }

  async companyDetail(req: { id: string; refresh?: boolean; sections?: string[] }): Promise<CompanyDetail> {
    const FULL: CompanyDetailSection[] = ['basic', 'detail', 'holders', 'members', 'invests', 'branches', 'alterations'];
    const wanted = new Set(
      (req.sections ?? []).filter((x): x is CompanyDetailSection => (FULL as string[]).includes(x)),
    );
    const fullRequested = wanted.size === 0 || FULL.every((s) => wanted.has(s));
    if (!req.refresh) {
      const cached = this.cache.getCompanyDetail(req.id, this.cfg.cache.detailTtlSec);
      if (cached?.fresh) return { ...cached.value, cached: true };
    }
    await this.session.ensureStarted();
    const api = this.session.api();
    const sections = fullRequested ? FULL : [...wanted];
    api.assertBulkCapacity(sections.length);
    const want = (s: CompanyDetailSection) => sections.includes(s);
    const [basic, detail, holders, members, invests, branches, alterations] = await Promise.all([
      want('basic') ? api.getEnterpriseBasic(req.id) : Promise.resolve(undefined),
      want('detail') ? api.getEnterpriseDetailInfo(req.id) : Promise.resolve(undefined),
      want('holders') ? api.getHolderPage(req.id) : Promise.resolve(undefined),
      want('members') ? api.getMemberPage(req.id) : Promise.resolve(undefined),
      want('invests') ? api.getInvestPage(req.id) : Promise.resolve(undefined),
      want('branches') ? api.getBranchPage(req.id) : Promise.resolve(undefined),
      want('alterations') ? api.getAlterationPage(req.id) : Promise.resolve(undefined),
    ]);
    const combined = mapDetailFromApis({
      id: req.id,
      nameHint: (detail?.name as string | undefined) ?? (basic?.name as string | undefined),
      basic,
      detail,
      holders,
      members,
      invests,
      branches,
      alterations,
    });
    if (fullRequested) {
      this.cache.putCompanyDetail(combined);
      return combined;
    }
    return { ...combined, sections, partial: true };
  }

  async listContacts(req: { id: string; refresh?: boolean; types?: Array<'mobile' | 'phone' | 'email'> }): Promise<ContactList> {
    if (!req.refresh) {
      const cached = this.cache.getContacts(req.id, this.cfg.cache.detailTtlSec);
      if (cached?.fresh) return filtered({ ...cached.value, cached: true }, req.types);
    }
    await this.session.ensureStarted();
    const api = this.session.api();
    api.assertBulkCapacity(1);
    const raw = await api.queryContacts(req.id);
    const list = mapContactList(raw, req.id);
    if (list.unlocked) this.cache.putContacts(list);
    return filtered(list, req.types);
  }

  async unlock(companyId: string, req: UnlockRequest): Promise<UnlockResult> {
    if (!req.confirm) throw new TanjiError('CONFLICT', '解锁必须显式 confirm=true');
    await this.session.ensureStarted();
    const api = this.session.api();
    // 默认只打 1 个上游调用（priority 通道，可插队）；额度/联系人为可选项
    const raw = await api.unlockCompany(companyId);
    if (raw.stat !== 1) {
      throw new TanjiError('CONFLICT', raw.message ?? raw.msg ?? '解锁失败', { details: { companyId } });
    }
    let quotaAfter: number | undefined;
    if (req.quota) {
      // 解锁已成功；附加查询失败（含本地队列满）不应把本次解锁判为失败
      try {
        api.assertBulkCapacity(1);
        const after = await api.getRemainLead().catch(() => undefined);
        quotaAfter = after ? mapQuota(after).monthly.remaining : undefined;
      } catch (err) {
        if (!(err instanceof TanjiError) || err.code !== 'RATE_LIMITED') throw err;
      }
    }
    let contacts: ContactList | undefined;
    if (req.contacts) {
      try {
        api.assertBulkCapacity(1);
        const contactsRaw = await api.queryContacts(companyId).catch(() => undefined);
        contacts = contactsRaw ? mapContactList(contactsRaw, companyId) : undefined;
        if (contacts?.unlocked) this.cache.putContacts(contacts);
      } catch (err) {
        if (!(err instanceof TanjiError) || err.code !== 'RATE_LIMITED') throw err;
      }
    }
    return {
      companyId,
      alreadyUnlocked: false,
      quotaCost: 1,
      ...(quotaAfter !== undefined ? { quotaAfter } : {}),
      ...(contacts ? { contacts } : {}),
    };
  }

  async cacheStats(): Promise<CacheStats> {
    return this.cache.stats();
  }

  async cacheClear(req: { prefix?: string; all?: boolean }): Promise<CacheClearResult> {
    const deleted = await this.cache.clear(req);
    return { deleted, scope: req.prefix ?? (req.all ? 'all' : 'all') };
  }

  async listAccounts(): Promise<AccountsResponse> {
    const accounts = listAccountConfigs(this.cfg);
    const enriched = await Promise.all(
      accounts.map(async (a) => {
        const runtime = await accountRuntimeStatus(a);
        return {
          id: a.id,
          ...(a.phone ? { phoneMasked: maskPhone(a.phone) } : {}),
          profileDir: a.profileDir,
          cacheDb: a.cacheDb,
          port: a.port,
          enabled: a.enabled,
          running: runtime.running,
          ...(runtime.pid ? { pid: runtime.pid } : {}),
          health: runtime.health,
          ...(runtime.message ? { message: runtime.message } : {}),
        };
      }),
    );
    const defaultAccountId =
      this.cfg.accounts.find((a) => a.enabled)?.id ?? accounts[0]?.id ?? 'default';
    return { defaultAccountId, accounts: enriched };
  }

  async filterRegistry(): Promise<FilterRegistry> {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      path.join(here, '..', 'data', 'filter-registry.json'),
      path.join(process.cwd(), 'data', 'filter-registry.json'),
    ];
    const file = candidates.find((p) => fs.existsSync(p));
    if (!file) throw new TanjiError('NOT_FOUND', 'filter registry not generated; run `npm run gen`');
    const parsed = FilterRegistrySchema.safeParse(JSON.parse(fs.readFileSync(file, 'utf-8')));
    if (!parsed.success) {
      throw new TanjiError('INTERNAL', 'filter registry invalid', { details: { issues: parsed.error.issues } });
    }
    return parsed.data;
  }
}

function filtered(list: ContactList, types?: Array<'mobile' | 'phone' | 'email'>): ContactList {
  if (!types || types.length === 0) return list;
  return {
    ...list,
    contacts: list.contacts.filter((c) => types.includes(c.type as 'mobile' | 'phone' | 'email')),
  };
}
