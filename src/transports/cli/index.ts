/**
 * CLI 传输层（commander）：命令与 operations 对应，默认输出统一 envelope JSON
 */
import { Command } from 'commander';
import { createApp, type App } from '../../app.js';
import { invoke, type InvocationInput } from '../../api/dispatch.js';
import { getOperation } from '../../api/operations.js';
import { loadConfig } from '../../config/schema.js';
import { resolveAccount } from '../../accounts/config.js';
import { asTanjiError, TanjiError, type ErrorCode } from '../../errors/catalog.js';
import { failureEnvelope, successEnvelope } from '../../schemas/envelope.js';
import { VERSION } from '../../service.js';
import { listAccountConfigs, maskPhone } from '../../accounts/config.js';
import { startAccount, stopAccount, accountRuntimeStatus, fetchHealth } from '../../accounts/daemon.js';
import { installService, serviceStatus, stopService, systemdAvailable, uninstallService } from '../../accounts/systemd.js';
import { startRestServer } from '../rest/server.js';
import { startMcpServer } from '../mcp/server.js';
import { SearchAdvanceRequestSchema } from '../../domain/search.js';
import { OPERATIONS } from '../../api/operations.js';
import { operationHelpText, operationsIndexText, rootHelpText } from './help.js';

const EXIT_CODES: Partial<Record<ErrorCode, number>> = {
  BAD_REQUEST: 2,
  VALIDATION_FAILED: 2,
  UNAUTHORIZED: 2,
  AUTH_REQUIRED: 3,
  LOGIN_FAILED: 3,
  CAPTCHA_REQUIRED: 3,
  QUOTA_EXHAUSTED: 4,
  UPSTREAM_CHANGED: 5,
  RATE_LIMITED: 6,
  NOT_FOUND: 7,
  NOT_IMPLEMENTED: 8,
};

interface GlobalOpts {
  config?: string;
  account?: string;
}

/** 常驻服务在线时，CLI 自动走本地 REST（避免与常驻进程抢 profile 锁） */
async function tryProxy(opId: string, input: InvocationInput, opts: GlobalOpts): Promise<boolean> {
  try {
    const cfg = loadConfig({ configPath: opts.config });
    const resolved = resolveAccount(cfg, opts.account);
    const port = resolved.config.port;
    const probe = await fetch(`http://127.0.0.1:${port}/v1/health`, { signal: AbortSignal.timeout(800) });
    if (!probe.ok) return false;
    const op = getOperation(opId);
    const pathParams = input.pathParams ?? {};
    let path = op.rest.path.replace(/\{([^}]+)\}/g, (_m, k: string) => encodeURIComponent(String(pathParams[k] ?? '')));
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(input.query ?? {})) {
      if (v === undefined || v === null) continue;
      qs.set(k, Array.isArray(v) ? v.join(',') : String(v));
    }
    if ([...qs.keys()].length) path += `?${qs.toString()}`;
    const headers: Record<string, string> = { authorization: `Bearer ${resolved.config.apiToken}` };
    const init: RequestInit = { method: op.rest.method, headers };
    if (op.rest.body && input.body !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(input.body);
    }
    const res = await fetch(`http://127.0.0.1:${port}${path}`, init);
    const text = await res.text();
    type ProxyJson = { ok?: boolean; error?: { code?: string } };
    let json: ProxyJson | null = null;
    try {
      json = JSON.parse(text) as ProxyJson;
    } catch {
      return false;
    }
    console.log(JSON.stringify(json, null, 2));
    if (json && json.ok === false) {
      process.exitCode = EXIT_CODES[(json.error?.code ?? 'INTERNAL') as ErrorCode] ?? 1;
    }
    return true;
  } catch {
    return false;
  }
}

async function run(opId: string, input: InvocationInput, opts: GlobalOpts): Promise<void> {
  if (await tryProxy(opId, input, opts)) return;
  const app = await createApp({ configPath: opts.config, accountId: opts.account, logToStdout: false });
  const rid = `cli_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const started = Date.now();
  try {
    const result = await invoke(app.service, opId, input);
    console.log(
      JSON.stringify(
        successEnvelope(result.data, {
          requestId: rid,
          tookMs: Date.now() - started,
          cached: result.cached ?? false,
          ...(result.pagination ? { pagination: result.pagination } : {}),
        }),
        null,
        2,
      ),
    );
  } catch (err) {
    const e = asTanjiError(err);
    console.error(JSON.stringify(failureEnvelope(e.toJSON(), { requestId: rid, tookMs: Date.now() - started }), null, 2));
    process.exitCode = EXIT_CODES[e.code] ?? 1;
  } finally {
    await app.close();
  }
}

async function startServer(opts: GlobalOpts & { port?: string; host?: string; startBrowser?: boolean }): Promise<void> {
  const app = await createApp({ configPath: opts.config, accountId: opts.account, logToStdout: false });
  if (opts.port) app.config.port = Number(opts.port);
  if (opts.host) app.config.host = opts.host;
  const { close } = await startRestServer(app);
  app.logger.info('serve.listening', {
    accountId: app.accountId,
    url: `http://${app.config.host}:${app.config.port}`,
    version: VERSION,
  });
  if (opts.startBrowser) {
    try {
      await app.session.ensureStarted();
      const st = await app.service.status();
      app.logger.info('serve.browser.started', { loggedIn: st.loggedIn, health: st.health });
    } catch (err) {
      app.logger.error('serve.browser.failed', { message: err instanceof Error ? err.message : String(err) });
    }
  }
  const shutdown = async () => {
    await close();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

export function createCli(): Command {
  const program = new Command();
  program
    .name('tanji')
    .description('探迹 AI 拓客本地客户端（cloak 浏览器会话保活 + CLI/REST/MCP 接口）')
    .version(VERSION)
    .option('--config <path>', '配置文件路径（默认 ~/.tanji-client/config.json）')
    .option('--account <id>', '选择账号（多账号配置时）');

  program.configureHelp({ sortSubcommands: true, sortOptions: false });
  program.addHelpText('after', rootHelpText);

  const g = (cmd: Command): GlobalOpts => cmd.optsWithGlobals() as GlobalOpts;

  program
    .command('health')
    .description('健康检查（无需登录）')
    .action(async (_options, cmd: Command) => run('health.get', {}, g(cmd)));

  program
    .command('status')
    .description('查看登录态与剩余日/月额度（默认自动启动浏览器会话）')
    .option('--no-start', '不启动浏览器，只报告当前已加载会话状态')
    .action(async (options: { start?: boolean }, cmd: Command) => {
      const gopts = g(cmd);
      if (await tryProxy('status.get', {}, gopts)) return;
      const app = await createApp({ configPath: gopts.config, accountId: gopts.account, logToStdout: false });
      const rid = `cli_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const started = Date.now();
      try {
        if (options.start !== false) await app.session.ensureStarted();
        const result = await invoke(app.service, 'status.get', {});
        console.log(
          JSON.stringify(
            successEnvelope(result.data, { requestId: rid, tookMs: Date.now() - started, cached: false }),
            null,
            2,
          ),
        );
      } catch (err) {
        const e = asTanjiError(err);
        console.error(JSON.stringify(failureEnvelope(e.toJSON(), { requestId: rid, tookMs: Date.now() - started }), null, 2));
        process.exitCode = EXIT_CODES[e.code] ?? 1;
      } finally {
        await app.close();
      }
    });

  program
    .command('login')
    .description('启动浏览器并登录探迹')
    .option('--interactive', '启动可见浏览器人工完成验证码', false)
    .option('--force', '强制重新登录', false)
    .action(async (options: { interactive: boolean; force: boolean }, cmd: Command) =>
      run('session.login', { body: { interactive: options.interactive, force: options.force } }, g(cmd)),
    );

  const search = program.command('search').description('企业搜索');
  search
    .command('name')
    .description('按名称/人名/地址/统一码/联系方式搜索')
    .requiredOption('--name <keyword>', '搜索关键词')
    .option('--field <field>', '命中范围：all|name|legalRepresentative|address|socialCreditCode|contact', 'all')
    .option('--page <n>', '页码', '1')
    .option('--page-size <n>', '每页条数', '20')
    .option('--max-pages <n>', '最大翻页数', '5')
    .action(async (options: Record<string, string>, cmd: Command) =>
      run(
        'search.name',
        {
          body: {
            name: options.name,
            field: options.field,
            page: Number(options.page),
            pageSize: Number(options.pageSize),
            maxPages: Number(options.maxPages),
          },
        },
        g(cmd),
      ),
    );
  search
    .command('advance')
    .description('高级筛选')
    .option('--filter <json>', '条件组 JSON（FilterGroup）')
    .option('--filter-file <path>', '从文件读取条件组 JSON')
    .option('--page <n>', '页码', '1')
    .option('--page-size <n>', '每页条数', '20')
    .option('--max-pages <n>', '最大翻页数', '5')
    .action(async (options: Record<string, string>, cmd: Command) => {
      const fs = await import('node:fs/promises');
      const raw = options.filterFile ? await fs.readFile(options.filterFile, 'utf-8') : options.filter ?? '';
      let filters: unknown;
      try {
        filters = JSON.parse(raw);
      } catch {
        throw new TanjiError('BAD_REQUEST', '--filter 不是合法 JSON 或未提供');
      }
      const parsed = SearchAdvanceRequestSchema.safeParse({
        filters,
        page: Number(options.page),
        pageSize: Number(options.pageSize),
        maxPages: Number(options.maxPages),
      });
      if (!parsed.success) throw parsed.error;
      await run('search.advance', { body: parsed.data }, g(cmd));
    });

  const companies = program.command('companies').description('企业列表与详情');
  companies
    .command('list')
    .description('按 queryId 翻页')
    .requiredOption('--query-id <id>', 'search 返回的 queryId')
    .option('--page <n>', '页码', '1')
    .option('--page-size <n>', '每页条数', '20')
    .option('--refresh', '忽略缓存', false)
    .action(async (options: Record<string, string | boolean>, cmd: Command) =>
      run(
        'companies.list',
        {
          query: {
            queryId: options.queryId,
            page: Number(options.page),
            pageSize: Number(options.pageSize),
            refresh: options.refresh ? 'true' : undefined,
          },
        },
        g(cmd),
      ),
    );
  companies
    .command('detail')
    .description('企业详情')
    .requiredOption('--id <companyId>', '企业 ID')
    .option('--refresh', '忽略缓存', false)
    .option('--sections <csv>', '按段拉取：basic,detail,holders,members,invests,branches,alterations（空=完整；轻量=basic,detail）')
    .action(async (options: { id: string; refresh: boolean; sections?: string }, cmd: Command) =>
      run(
        'companies.detail',
        { pathParams: { id: options.id }, query: { refresh: options.refresh, sections: options.sections } },
        g(cmd),
      ),
    );

  program
    .command('contacts')
    .description('企业联系人')
    .requiredOption('--id <companyId>', '企业 ID')
    .option('--types <csv>', 'mobile,phone,email')
    .option('--refresh', '忽略缓存', false)
    .action(async (options: Record<string, string>, cmd: Command) =>
      run(
        'contacts.list',
        { pathParams: { id: options.id }, query: { types: options.types, refresh: options.refresh } },
        g(cmd),
      ),
    );

  program
    .command('unlock')
    .description('解锁企业（消耗 1 个额度点）')
    .requiredOption('--id <companyId>', '企业 ID')
    .option('--confirm', '确认解锁（必须）', false)
    .option('--with-contacts', '解锁后立即拉取联系人（多 1 次上游调用）', false)
    .option('--with-quota', '解锁后查询剩余额度（多 1 次上游调用）', false)
    .action(async (options: { id: string; confirm: boolean; withContacts: boolean; withQuota: boolean }, cmd: Command) => {
      if (!options.confirm) throw new TanjiError('CONFLICT', '解锁需要 --confirm');
      await run(
        'companies.unlock',
        {
          pathParams: { id: options.id },
          body: { confirm: true, contacts: options.withContacts, quota: options.withQuota },
        },
        g(cmd),
      );
    });

  const cache = program.command('cache').description('本地缓存');
  cache.command('stats').description('缓存统计').action(async (_o, cmd: Command) => run('cache.stats', {}, g(cmd)));
  cache
    .command('clear')
    .description('清空/按前缀清理缓存')
    .option('--all', '清空全部', false)
    .option('--prefix <p>', '按前缀清理')
    .action(async (options: { all: boolean; prefix?: string }, cmd: Command) =>
      run('cache.clear', { body: { all: options.all || !options.prefix, prefix: options.prefix } }, g(cmd)),
    );

  const filters = program.command('filters').description('筛选条件');
  filters
    .command('registry')
    .description('筛选条件注册表（12 类 / 345 个条件）')
    .option('--category <name>', '按分类过滤，如 风险信息')
    .option('--keyword <kw>', '按名称/key 搜索')
    .action(async (options: Record<string, string>, cmd: Command) =>
      run('filters.registry', { query: options }, g(cmd)),
    );

  program
    .command('serve')
    .description('启动本地 REST 服务')
    .option('--port <n>', '端口（默认取配置）')
    .option('--host <h>', '监听地址（默认 127.0.0.1）')
    .option('--start-browser', '启动时即拉起浏览器并保持会话', false)
    .action(async (options: Record<string, string | boolean>, cmd: Command) =>
      startServer({ ...g(cmd), ...(options as { port?: string; host?: string; startBrowser?: boolean }) }),
    );

  const accounts = program.command('accounts').description('多账号管理（进程级：每个账号独立 profile/cache/端口）');
  accounts
    .command('list')
    .description('列出账号及运行状态')
    .action(async (_options, cmd: Command) => {
      const app = await createApp({ configPath: g(cmd).config, accountId: g(cmd).account, logToStdout: false });
      try {
        const data = await app.service.listAccounts();
        console.log(JSON.stringify({ ok: true, data, meta: { requestId: `cli_${Date.now()}`, tookMs: 0 }, error: null }, null, 2));
      } finally {
        await app.close();
      }
    });
  accounts
    .command('start [id]')
    .description('后台启动账号守护进程（serve + 浏览器）')
    .option('--all', '启动所有启用账号', false)
    .action(async (id: string | undefined, options: { all: boolean }, cmd: Command) => {
      const app = await createApp({ configPath: g(cmd).config, accountId: id ?? g(cmd).account, logToStdout: false });
      try {
        const all = listAccountConfigs(app.config);
        const selected = options.all ? all.filter((a) => a.enabled) : all.filter((a) => a.id === (id ?? app.accountId));
        if (!selected.length) throw new Error(`account not found: ${id ?? app.accountId}`);
        const results = [];
        for (const a of selected) results.push(await startAccount(a));
        console.log(JSON.stringify({ ok: true, data: { started: results }, meta: { requestId: `cli_${Date.now()}`, tookMs: 0 }, error: null }, null, 2));
      } finally {
        await app.close();
      }
    });
  accounts
    .command('stop [id]')
    .description('停止账号守护进程')
    .option('--all', '停止所有启用账号', false)
    .action(async (id: string | undefined, options: { all: boolean }, cmd: Command) => {
      const app = await createApp({ configPath: g(cmd).config, accountId: id ?? g(cmd).account, logToStdout: false });
      try {
        const all = listAccountConfigs(app.config);
        const selected = options.all ? all.filter((a) => a.enabled) : all.filter((a) => a.id === (id ?? app.accountId));
        if (!selected.length) throw new Error(`account not found: ${id ?? app.accountId}`);
        const results = [];
        for (const a of selected) results.push({ accountId: a.id, stopped: await stopAccount(a) });
        console.log(JSON.stringify({ ok: true, data: { stopped: results }, meta: { requestId: `cli_${Date.now()}`, tookMs: 0 }, error: null }, null, 2));
      } finally {
        await app.close();
      }
    });

  const service = program.command('service').description('systemd user 服务（开机自启 + 崩溃重启）');
  const serviceAccount = async (cmd: Command, id?: string) => {
    const app = await createApp({ configPath: g(cmd).config, accountId: id ?? g(cmd).account, logToStdout: false });
    const all = listAccountConfigs(app.config);
    const account = all.find((a) => a.id === app.accountId);
    await app.close();
    if (!account) throw new Error(`account not found: ${app.accountId}`);
    return account;
  };
  service
    .command('install [id]')
    .description('安装并启动 systemd user 服务')
    .action(async (id: string | undefined, _options, cmd: Command) => {
      if (!systemdAvailable()) throw new Error('systemd user 不可用；请改用 `tanji accounts start`');
      const account = await serviceAccount(cmd, id);
      const r = installService(account);
      console.log(JSON.stringify({ ok: r.enabled && r.started, data: { accountId: account.id, ...r, unit: r.file }, meta: { requestId: `cli_${Date.now()}`, tookMs: 0 }, error: r.enabled && r.started ? null : { code: 'INTERNAL', message: 'systemctl 执行失败', retryable: false } }, null, 2));
    });
  service
    .command('status [id]')
    .description('查看 systemd 服务状态')
    .action(async (id: string | undefined, _options, cmd: Command) => {
      const account = await serviceAccount(cmd, id);
      const r = serviceStatus(account);
      console.log(JSON.stringify({ ok: r.active, data: { accountId: account.id, unit: r.file, active: r.active, status: r.status }, meta: { requestId: `cli_${Date.now()}`, tookMs: 0 }, error: null }, null, 2));
    });
  service
    .command('stop [id]')
    .description('停止 systemd 服务')
    .action(async (id: string | undefined, _options, cmd: Command) => {
      const account = await serviceAccount(cmd, id);
      console.log(JSON.stringify({ ok: stopService(account), data: { accountId: account.id }, meta: { requestId: `cli_${Date.now()}`, tookMs: 0 }, error: null }, null, 2));
    });
  service
    .command('uninstall [id]')
    .description('停止并移除 systemd 服务')
    .action(async (id: string | undefined, _options, cmd: Command) => {
      const account = await serviceAccount(cmd, id);
      console.log(JSON.stringify({ ok: uninstallService(account), data: { accountId: account.id }, meta: { requestId: `cli_${Date.now()}`, tookMs: 0 }, error: null }, null, 2));
    });

  program
    .command('docs [operationId]')
    .description('查看接口文档：全部操作索引 / 单个操作详情（参数、响应、错误码、示例）')
    .action((operationId?: string) => {
      console.log(operationId ? operationHelpText(operationId) : operationsIndexText());
    });

  program
    .command('mcp')
    .description('以 stdio 启动 MCP server')
    .action(async (_options, cmd: Command) => {
      const app = await createApp({ configPath: g(cmd).config, accountId: g(cmd).account, logToStdout: false });
      await startMcpServer(app);
    });

  // 为每个 leaf command 挂上由 operations 生成的详细帮助
  const attach = (cmd: Command, prefix = ''): void => {
    for (const child of cmd.commands) {
      const name = prefix ? `${prefix} ${child.name()}` : child.name();
      const op = OPERATIONS.find((o) => o.cli?.command === name);
      if (op) child.addHelpText('after', () => operationHelpText(op.id));
      attach(child, name);
    }
  };
  attach(program);

  return program;
}

export async function main(): Promise<void> {
  const program = createCli();
  await program.parseAsync(process.argv);
}

export type { App };
