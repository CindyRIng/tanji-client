/**
 * SQLite 缓存实现（Node 22 内置 node:sqlite，实验特性；失败时回退 memory 由调用方决定）
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { CacheStore, CachedValue, SearchPageValue, SearchQueryRecord } from './types.js';
import type { CompanyDetail, CompanySummary } from '../domain/company.js';
import type { ContactList } from '../domain/contact.js';
import type { CacheStats } from '../schemas/cache.js';
import { TanjiError } from '../errors/catalog.js';

const require = createRequire(import.meta.url);

interface SqliteStatement {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Record<string, unknown>[];
}
interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}
interface SqliteModule {
  DatabaseSync: new (file: string) => SqliteDatabase;
}

function loadSqlite(): SqliteModule {
  try {
    return require('node:sqlite') as SqliteModule;
  } catch (err) {
    throw new TanjiError('CACHE_ERROR', 'node:sqlite 不可用（需要 Node >= 22.5，或改用内存缓存）', { cause: err });
  }
}

const DDL = `
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  json TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS company_details (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  json TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS contacts (
  company_id TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS search_results (
  cache_key TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS queries (
  query_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  request_json TEXT NOT NULL,
  total INTEGER NOT NULL,
  fetched_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cache_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_companies_fetched ON companies(fetched_at);
CREATE INDEX IF NOT EXISTS idx_details_fetched ON company_details(fetched_at);
CREATE INDEX IF NOT EXISTS idx_contacts_fetched ON contacts(fetched_at);
`;

function cached<T>(row: Record<string, unknown> | undefined, ttlSec: number): CachedValue<T> | null {
  if (!row) return null;
  const fetchedAt = Number(row.fetched_at);
  const expiresAt = fetchedAt + ttlSec * 1000;
  return {
    value: JSON.parse(String(row.json)) as T,
    fetchedAt,
    expiresAt,
    fresh: Date.now() < expiresAt,
  };
}

export class SqliteCacheStore implements CacheStore {
  readonly driver = 'sqlite' as const;
  private db: SqliteDatabase | null = null;
  private hitCount = 0;
  private missCount = 0;

  constructor(private readonly dbPath: string) {}

  async init(): Promise<void> {
    if (this.db && this.dbPath === ':memory:') return;
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    const { DatabaseSync } = loadSqlite();
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;');
    this.db.exec(DDL);
  }

  private get conn(): SqliteDatabase {
    if (!this.db) throw new TanjiError('CACHE_ERROR', 'cache store not initialized');
    return this.db;
  }

  async close(): Promise<void> {
    this.db?.close();
    this.db = null;
  }

  getCompanySummary(id: string, ttlSec: number): CachedValue<CompanySummary> | null {
    const row = this.conn.prepare('SELECT json, fetched_at FROM companies WHERE id = ?').get(id);
    const v = cached<CompanySummary>(row, ttlSec);
    v ? this.hitCount++ : this.missCount++;
    return v;
  }

  putCompanySummary(company: CompanySummary): void {
    this.conn
      .prepare('INSERT OR REPLACE INTO companies (id, name, json, fetched_at) VALUES (?, ?, ?, ?)')
      .run(company.id, company.name, JSON.stringify(company), Date.now());
  }

  getCompanyDetail(id: string, ttlSec: number): CachedValue<CompanyDetail> | null {
    const row = this.conn.prepare('SELECT json, fetched_at FROM company_details WHERE id = ?').get(id);
    const v = cached<CompanyDetail>(row, ttlSec);
    v ? this.hitCount++ : this.missCount++;
    return v;
  }

  putCompanyDetail(detail: CompanyDetail): void {
    this.conn
      .prepare('INSERT OR REPLACE INTO company_details (id, name, json, fetched_at) VALUES (?, ?, ?, ?)')
      .run(detail.id, detail.name, JSON.stringify(detail), Date.now());
  }

  getContacts(companyId: string, ttlSec: number): CachedValue<ContactList> | null {
    const row = this.conn.prepare('SELECT json, fetched_at FROM contacts WHERE company_id = ?').get(companyId);
    const v = cached<ContactList>(row, ttlSec);
    v ? this.hitCount++ : this.missCount++;
    return v;
  }

  putContacts(list: ContactList): void {
    this.conn
      .prepare('INSERT OR REPLACE INTO contacts (company_id, json, fetched_at) VALUES (?, ?, ?)')
      .run(list.companyId, JSON.stringify(list), Date.now());
  }

  getQuery(queryId: string): SearchQueryRecord | null {
    const row = this.conn.prepare('SELECT * FROM queries WHERE query_id = ?').get(queryId);
    if (!row) return null;
    return {
      queryId: String(row.query_id),
      kind: String(row.kind) as SearchQueryRecord['kind'],
      request: JSON.parse(String(row.request_json)) as SearchQueryRecord['request'],
      total: Number(row.total),
      fetchedAt: Number(row.fetched_at),
      expiresAt: Number(row.expires_at),
    };
  }

  getSearchPage(key: string, ttlSec: number): CachedValue<SearchPageValue> | null {
    const row = this.conn.prepare('SELECT json, fetched_at FROM search_results WHERE cache_key = ?').get(key);
    const v = cached<SearchPageValue>(row, ttlSec);
    v ? this.hitCount++ : this.missCount++;
    return v;
  }

  putSearchPage(key: string, value: SearchPageValue): void {
    this.conn
      .prepare('INSERT OR REPLACE INTO search_results (cache_key, json, fetched_at) VALUES (?, ?, ?)')
      .run(key, JSON.stringify(value), Date.now());
  }

  putQuery(record: SearchQueryRecord): void {
    this.conn
      .prepare(
        'INSERT OR REPLACE INTO queries (query_id, kind, request_json, total, fetched_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        record.queryId,
        record.kind,
        JSON.stringify(record.request),
        record.total,
        record.fetchedAt,
        record.expiresAt,
      );
  }

  async stats(): Promise<CacheStats> {
    const count = (table: string) => Number((this.conn.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c);
    const bounds = this.conn
      .prepare('SELECT MIN(fetched_at) AS oldest, MAX(fetched_at) AS newest FROM company_details')
      .get() as { oldest: number | null; newest: number | null };
    let sizeBytes: number | undefined;
    if (this.dbPath !== ':memory:') {
      const files = [this.dbPath, `${this.dbPath}-wal`, `${this.dbPath}-shm`];
      const sizes = files.filter((f) => fs.existsSync(f)).map((f) => fs.statSync(f).size);
      if (sizes.length) sizeBytes = sizes.reduce((a, b) => a + b, 0);
    }
    const total = this.hitCount + this.missCount;
    return {
      dbPath: this.dbPath,
      driver: 'sqlite',
      ...(sizeBytes !== undefined ? { sizeBytes } : {}),
      companies: count('companies'),
      companyDetails: count('company_details'),
      contacts: count('contacts'),
      queries: count('queries'),
      searchResults: count('search_results'),
      hits: this.hitCount,
      misses: this.missCount,
      ...(total > 0 ? { hitRate: this.hitCount / total } : {}),
      ...(bounds.oldest ? { oldestFetchedAt: new Date(bounds.oldest).toISOString() } : {}),
      ...(bounds.newest ? { newestFetchedAt: new Date(bounds.newest).toISOString() } : {}),
    };
  }

  async clear(opts: { prefix?: string; all?: boolean }): Promise<number> {
    if (opts.all || !opts.prefix) {
      const total =
        Number((this.conn.prepare('SELECT COUNT(*) AS c FROM companies').get() as { c: number }).c) +
        Number((this.conn.prepare('SELECT COUNT(*) AS c FROM company_details').get() as { c: number }).c) +
        Number((this.conn.prepare('SELECT COUNT(*) AS c FROM contacts').get() as { c: number }).c) +
        Number((this.conn.prepare('SELECT COUNT(*) AS c FROM queries').get() as { c: number }).c) +
        Number((this.conn.prepare('SELECT COUNT(*) AS c FROM search_results').get() as { c: number }).c);
      this.conn.exec('DELETE FROM companies; DELETE FROM company_details; DELETE FROM contacts; DELETE FROM queries; DELETE FROM search_results;');
      return total;
    }
    const like = `${opts.prefix}%`;
    let n = 0;
    for (const [table, col] of [
      ['companies', 'id'],
      ['company_details', 'id'],
      ['contacts', 'company_id'],
      ['search_results', 'cache_key'],
      ['queries', 'query_id'],
    ] as const) {
      const stmt = this.conn.prepare(`DELETE FROM ${table} WHERE ${col} LIKE ?`);
      const res = stmt.run(like) as { changes?: number };
      n += Number(res.changes ?? 0);
    }
    return n;
  }
}
