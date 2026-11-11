/**
 * 内存缓存实现（测试/无 SQLite 环境使用）
 */
import type { CacheStore, CachedValue, SearchPageValue, SearchQueryRecord } from './types.js';
import type { CompanyDetail, CompanySummary } from '../domain/company.js';
import type { ContactList } from '../domain/contact.js';
import type { CacheStats } from '../schemas/cache.js';

interface Entry<T> {
  value: T;
  fetchedAt: number;
}

function cached<T>(e: Entry<T> | undefined, ttlSec: number): CachedValue<T> | null {
  if (!e) return null;
  const expiresAt = e.fetchedAt + ttlSec * 1000;
  return { value: e.value, fetchedAt: e.fetchedAt, expiresAt, fresh: Date.now() < expiresAt };
}

export class MemoryCacheStore implements CacheStore {
  readonly driver = 'memory' as const;
  private companies = new Map<string, Entry<CompanySummary>>();
  private details = new Map<string, Entry<CompanyDetail>>();
  private contacts = new Map<string, Entry<ContactList>>();
  private queries = new Map<string, SearchQueryRecord>();
  private searchPages = new Map<string, Entry<SearchPageValue>>();
  private hits = 0;
  private misses = 0;

  async init(): Promise<void> {}
  async close(): Promise<void> {}

  getCompanySummary(id: string, ttlSec: number): CachedValue<CompanySummary> | null {
    const v = cached(this.companies.get(id), ttlSec);
    v ? this.hits++ : this.misses++;
    return v;
  }
  putCompanySummary(company: CompanySummary): void {
    this.companies.set(company.id, { value: company, fetchedAt: Date.now() });
  }
  getCompanyDetail(id: string, ttlSec: number): CachedValue<CompanyDetail> | null {
    const v = cached(this.details.get(id), ttlSec);
    v ? this.hits++ : this.misses++;
    return v;
  }
  putCompanyDetail(detail: CompanyDetail): void {
    this.details.set(detail.id, { value: detail, fetchedAt: Date.now() });
  }
  getContacts(companyId: string, ttlSec: number): CachedValue<ContactList> | null {
    const v = cached(this.contacts.get(companyId), ttlSec);
    v ? this.hits++ : this.misses++;
    return v;
  }
  putContacts(list: ContactList): void {
    this.contacts.set(list.companyId, { value: list, fetchedAt: Date.now() });
  }
  getQuery(queryId: string): SearchQueryRecord | null {
    return this.queries.get(queryId) ?? null;
  }
  putQuery(record: SearchQueryRecord): void {
    this.queries.set(record.queryId, record);
  }
  getSearchPage(key: string, ttlSec: number): CachedValue<SearchPageValue> | null {
    const v = cached(this.searchPages.get(key), ttlSec);
    v ? this.hits++ : this.misses++;
    return v;
  }
  putSearchPage(key: string, value: SearchPageValue): void {
    this.searchPages.set(key, { value, fetchedAt: Date.now() });
  }

  async stats(): Promise<CacheStats> {
    const total = this.hits + this.misses;
    return {
      driver: 'memory',
      companies: this.companies.size,
      companyDetails: this.details.size,
      contacts: this.contacts.size,
      queries: this.queries.size,
      searchResults: this.searchPages.size,
      hits: this.hits,
      misses: this.misses,
      ...(total > 0 ? { hitRate: this.hits / total } : {}),
    };
  }

  async clear(opts: { prefix?: string; all?: boolean }): Promise<number> {
    if (opts.all || !opts.prefix) {
      const n = this.companies.size + this.details.size + this.contacts.size + this.queries.size + this.searchPages.size;
      this.companies.clear();
      this.details.clear();
      this.contacts.clear();
      this.queries.clear();
      this.searchPages.clear();
      return n;
    }
    let n = 0;
    for (const [k, v] of this.companies) {
      if (k.startsWith(opts.prefix)) {
        this.companies.delete(k);
        n++;
      }
      void v;
    }
    for (const [k] of this.details) if (k.startsWith(opts.prefix)) { this.details.delete(k); n++; }
    for (const [k] of this.contacts) if (k.startsWith(opts.prefix)) { this.contacts.delete(k); n++; }
    for (const [k] of this.queries) if (k.startsWith(opts.prefix)) { this.queries.delete(k); n++; }
    for (const [k] of this.searchPages) if (k.startsWith(opts.prefix)) { this.searchPages.delete(k); n++; }
    return n;
  }
}
