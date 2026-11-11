/**
 * 性能基准：对本地 REST 做压测（需在 cloak FHS 环境运行，且 profile 已登录）
 *
 * 运行示例：
 *   cd /home/songqian/tanji-client && DISPLAY=:0 ~/cloak-env/bin/cloak-run env \
 *     TANJI_PROFILE_DIR=$PWD/exploration/profile TANJI_RATE_PER_MIN=0 \
 *     TANJI_CACHE_DB=/tmp/tanji-bench-cache.db node dist/bench/run.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../app.js';
import { startRestServer } from '../transports/rest/server.js';

const PORT = Number(process.env.BENCH_PORT ?? 8790);
const TOKEN = process.env.BENCH_TOKEN ?? 'bench-token';
const OUT_DIR = path.resolve(process.cwd(), 'bench');

const UNLOCKED_IDS = [
  '37623000277f335b',
  '577dd24e843215d5',
  '37622fbf98053877',
  '37622fbc83853ddd',
  '37622fea7f0536b8',
  '37622fdf7b053a96',
  '37622ff78a3f3d9c',
  '37622fcb6c853a65',
  '37622fc64b453395',
  '37622ffcf17f3e08',
];
const DETAIL_IDS = UNLOCKED_IDS.slice(0, 3);
const SEARCH_TERMS = ['团车', '科技', '贸易', '软件', '电子', '网络', '智能', '数据', '材料', '实业'];

interface Sample {
  name: string;
  n: number;
  ok: number;
  errors: number;
  errorMessages?: string[];
  latencies: number[];
  cached: number;
  mode: string;
  concurrency: number;
  throughput: number;
  p50: number;
  p90: number;
  p99: number;
  mean: number;
  startedAt: string;
  notes?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function pct(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

async function call(method: string, p: string, body?: unknown): Promise<{ data: unknown; meta: { cached: boolean } }> {
  const init: RequestInit = {
    method,
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
  const res = await fetch(`http://127.0.0.1:${PORT}${p}`, init);
  const json = (await res.json()) as { ok: boolean; data: unknown; meta: { cached: boolean }; error?: unknown };
  if (!json.ok) throw new Error(JSON.stringify(json.error));
  return { data: json.data, meta: json.meta };
}

async function measure(
  name: string,
  n: number,
  fn: () => Promise<{ meta?: { cached?: boolean } }>,
  opts: { mode: string; concurrency?: number; notes?: string },
): Promise<Sample> {
  const concurrency = opts.concurrency ?? 1;
  const started = Date.now();
  const latencies: number[] = [];
  let ok = 0;
  let errors = 0;
  let cached = 0;
  const errorMessages: string[] = [];
  let cursor = 0;

  const worker = async () => {
    for (;;) {
      const i = cursor++;
      if (i >= n) return;
      const t0 = performance.now();
      try {
        const r = await fn();
        latencies.push(performance.now() - t0);
        ok++;
        if (r.meta?.cached) cached++;
      } catch (e) {
        errors++;
        if (errorMessages.length < 5) errorMessages.push(e instanceof Error ? e.message : String(e));
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  const elapsed = (Date.now() - started) / 1000;
  latencies.sort((a, b) => a - b);
  return {
    name,
    n,
    ok,
    errors,
    latencies,
    cached,
    mode: opts.mode,
    concurrency,
    throughput: elapsed > 0 ? ok / elapsed : 0,
    p50: pct(latencies, 50),
    p90: pct(latencies, 90),
    p99: pct(latencies, 99),
    mean: latencies.reduce((a, b) => a + b, 0) / Math.max(1, latencies.length),
    startedAt: new Date().toISOString(),
    ...(opts.notes ? { notes: opts.notes } : {}),
    ...(errorMessages.length ? { errorMessages } : {}),
  };
}

function summarize(s: Sample): string {
  return `${s.name.padEnd(42)} n=${String(s.n).padEnd(4)} ${s.mode.padEnd(8)} c=${String(s.concurrency).padEnd(2)} ok=${String(s.ok).padEnd(4)} err=${String(s.errors).padEnd(2)} cached=${String(s.cached).padEnd(4)} p50=${s.p50.toFixed(1).padStart(7)}ms p90=${s.p90.toFixed(1).padStart(7)}ms p99=${s.p99.toFixed(1).padStart(7)}ms ${s.throughput.toFixed(1).padStart(8)} rps`;
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const app = await createApp({});
  app.config.port = PORT;
  app.config.apiToken = TOKEN;
  app.config.session.ratePerMin = 0; // 压测时解除本地限频，测量上游上限
  await app.session.ensureStarted();
  let status = await app.service.status();
  if (!status.loggedIn && app.config.phone && app.config.password) {
    console.error(`[bench] profile 无有效登录态（${status.message ?? status.health}），尝试自动登录…`);
    try {
      status = await app.session.login({ interactive: false, force: false });
    } catch (err) {
      throw new Error(`自动登录失败：${(err as Error).message}`);
    }
  }
  for (let i = 0; i < 10 && !status.loggedIn; i++) {
    await sleep(1000);
    status = await app.service.status();
  }
  if (!status.loggedIn) {
    throw new Error(`not logged in: ${status.message ?? 'unknown'}（请先 tanji login，或使用已登录 profile）`);
  }
  console.error(`[bench] logged in, quota monthly=${status.quota?.monthly.remaining}`);
  const server = await startRestServer(app);
  const results: Sample[] = [];
  const cacheBefore = await app.service.cacheStats();

  // 1) status（上游 2 次请求）
  await measure('status (upstream)', 2, async () => call('GET', '/v1/status'), { mode: 'warmup' });
  results.push(await measure('status (upstream)', 10, async () => call('GET', '/v1/status'), { mode: 'upstream' }));

  // 2) 搜索：冷启动（强制上游）
  results.push(
    await measure(
      'search.name cold',
      SEARCH_TERMS.length,
      async () => {
        const term = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)]!;
        const r = await call('POST', '/v1/search/name', { name: term, field: 'name', page: 1, pageSize: 10, maxPages: 5, refresh: true });
        return r;
      },
      { mode: 'cold' },
    ),
  );

  // 3) 搜索：缓存命中
  const first = await call('POST', '/v1/search/name', { name: '团车', field: 'name', page: 1, pageSize: 10, maxPages: 5 });
  const queryId = (first.data as { queryId: string }).queryId;
  results.push(
    await measure(
      'search.name cached',
      300,
      async () => call('POST', '/v1/search/name', { name: '团车', field: 'name', page: 1, pageSize: 10 }),
      { mode: 'cached' },
    ),
  );

  // 4) 翻页：冷 / 缓存
  results.push(
    await measure(
      'companies.list cold',
      5,
      async () => call('GET', `/v1/companies?queryId=${queryId}&page=2&pageSize=10&refresh=true`),
      { mode: 'cold' },
    ),
  );
  results.push(
    await measure('companies.list cached', 300, async () => call('GET', `/v1/companies?queryId=${queryId}&page=2&pageSize=10`), {
      mode: 'cached',
    }),
  );

  // 5) 详情：冷 / 缓存
  results.push(
    await measure(
      'company.detail cold (7 APIs)',
      DETAIL_IDS.length,
      async () => {
        const id = DETAIL_IDS[Math.floor(Math.random() * DETAIL_IDS.length)]!;
        return call('GET', `/v1/companies/${id}?refresh=true`);
      },
      { mode: 'cold', notes: 'basic+detail+holder/member/invest/branch/alteration' },
    ),
  );
  results.push(
    await measure('company.detail cached', 300, async () => call('GET', `/v1/companies/${DETAIL_IDS[0]}?refresh=false`), {
      mode: 'cached',
    }),
  );

  // 6) 联系人：冷 / 缓存
  results.push(
    await measure(
      'contacts cold',
      UNLOCKED_IDS.length,
      async () => {
        const id = UNLOCKED_IDS[Math.floor(Math.random() * UNLOCKED_IDS.length)]!;
        return call('GET', `/v1/companies/${id}/contacts?refresh=true&types=mobile`);
      },
      { mode: 'cold' },
    ),
  );
  results.push(
    await measure('contacts cached', 300, async () => call('GET', `/v1/companies/${UNLOCKED_IDS[0]}/contacts?types=mobile`), {
      mode: 'cached',
    }),
  );

  // 7) 缓存并发读
  for (const c of [1, 4, 16]) {
    results.push(
      await measure(
        'company.detail cached concurrent',
        300,
        async () => call('GET', `/v1/companies/${DETAIL_IDS[0]}?refresh=false`),
        { mode: 'cached', concurrency: c },
      ),
    );
  }

  const cacheAfter = await app.service.cacheStats();
  const report = {
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    config: {
      profile: app.config.profileDir,
      headless: app.config.headless,
      cacheDb: app.config.cache.dbPath,
      ratePerMin: 0,
      note: 'benchmark disables local rate limit to measure upstream ceiling; production default 20/min',
    },
    quota: status.quota,
    cacheBefore,
    cacheAfter,
    results,
    summary: results.map(summarize),
  };
  const file = path.join(OUT_DIR, `results-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2), 'utf-8');
  console.log(report.summary.join('\n'));
  console.log(`\n[bench] results written to ${file}`);
  console.log(`[bench] cache before/after:`, JSON.stringify({ before: cacheBefore, after: cacheAfter }));

  await server.close();
  await app.close();
}

main().catch(async (err) => {
  console.error('[bench] failed:', err);
  process.exit(1);
});
