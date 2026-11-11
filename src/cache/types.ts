/**
 * 缓存数据结构与存储接口
 */
import type { CompanyDetail, CompanySummary } from '../domain/company.js';
import type { ContactList } from '../domain/contact.js';
import type { FilterGroupInput } from '../domain/filters.js';
import type { CacheStats } from '../schemas/cache.js';

export interface CachedValue<T> {
  value: T;
  fetchedAt: number;
  expiresAt: number;
  fresh: boolean;
}

export interface SearchPageValue {
  companies: CompanySummary[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  pagesFetched: number;
}

export interface SearchQueryRecord {
  queryId: string;
  kind: 'name' | 'advance';
  request:
    | {
        kind: 'name';
        name: string;
        field: string;
        pageSize: number;
        maxPages: number;
      }
    | {
        kind: 'advance';
        filters: FilterGroupInput;
        pageSize: number;
        maxPages: number;
        sort?: { field: string; direction?: 'asc' | 'desc' };
      };
  total: number;
  fetchedAt: number;
  expiresAt: number;
}

export interface CacheStore {
  readonly driver: 'sqlite' | 'memory';
  init(): Promise<void>;
  close(): Promise<void>;

  getCompanySummary(id: string, ttlSec: number): CachedValue<CompanySummary> | null;
  putCompanySummary(company: CompanySummary): void;

  getCompanyDetail(id: string, ttlSec: number): CachedValue<CompanyDetail> | null;
  putCompanyDetail(detail: CompanyDetail): void;

  getContacts(companyId: string, ttlSec: number): CachedValue<ContactList> | null;
  putContacts(list: ContactList): void;

  getQuery(queryId: string): SearchQueryRecord | null;
  putQuery(record: SearchQueryRecord): void;

  getSearchPage(key: string, ttlSec: number): CachedValue<SearchPageValue> | null;
  putSearchPage(key: string, value: SearchPageValue): void;

  stats(): Promise<CacheStats>;
  clear(opts: { prefix?: string; all?: boolean }): Promise<number>;
}
