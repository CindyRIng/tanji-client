/**
 * cloak 浏览器宿主（基于 cloakbrowser npm 包；骨架阶段动态加载，未安装时给出明确错误）
 */
import type { BrowserHost, BrowserInfo, BrowserStartOptions, PageLike } from './types.js';
import { TanjiError } from '../errors/catalog.js';

interface CloakPageLike {
  url(): string;
  title(): Promise<string>;
  goto(url: string, opts?: Record<string, unknown>): Promise<unknown>;
  evaluate<T>(fn: string | ((arg: unknown) => T | Promise<T>), arg?: unknown): Promise<T>;
  waitForTimeout(ms: number): Promise<void>;
  content(): Promise<string>;
  locator(selector: string): {
    first(): {
      click(opts?: Record<string, unknown>): Promise<void>;
      fill(value: string): Promise<void>;
      type(value: string, opts?: Record<string, unknown>): Promise<void>;
      waitFor(opts?: Record<string, unknown>): Promise<void>;
    };
  };
  getByText(text: string, opts?: Record<string, unknown>): {
    first(): { click(opts?: Record<string, unknown>): Promise<void> };
  };
  keyboard: { press(key: string): Promise<void> };
}

interface CloakContext {
  pages(): CloakPageLike[];
  newPage(): Promise<CloakPageLike>;
  close(): Promise<void>;
  on?(event: string, cb: (...args: unknown[]) => void): void;
}

export class CloakBrowserHost implements BrowserHost {
  private context: CloakContext | null = null;
  private pageRef: PageLike | null = null;
  private startedAt = 0;

  constructor(private readonly opts: BrowserStartOptions) {}

  async start(): Promise<void> {
    const moduleName = 'cloakbrowser';
    let mod: { launchPersistentContext?: (o: Record<string, unknown>) => Promise<CloakContext> };
    try {
      mod = (await import(moduleName)) as typeof mod;
    } catch (err) {
      throw new TanjiError(
        'NOT_IMPLEMENTED',
        'cloakbrowser 未安装：请先 `npm i cloakbrowser`（NixOS 需要 FHS 运行环境，见 docs/03 探迹页面操作实录）',
        { cause: err },
      );
    }
    if (typeof mod.launchPersistentContext !== 'function') {
      throw new TanjiError('INTERNAL', 'cloakbrowser API 不兼容：缺少 launchPersistentContext');
    }
    const ctx = await mod.launchPersistentContext({
      userDataDir: this.opts.profileDir,
      headless: this.opts.headless,
      humanize: this.opts.humanize ?? true,
      timezone: this.opts.timezone ?? 'Asia/Shanghai',
      locale: this.opts.locale ?? 'zh-CN',
      viewport: this.opts.viewport ?? { width: 1440, height: 900 },
    });
    this.context = ctx;
    this.pageRef = wrapPage(ctx.pages()[0] ?? (await ctx.newPage()));
    this.startedAt = Date.now();
  }

  isConnected(): boolean {
    return this.context !== null && this.pageRef !== null;
  }

  page(): PageLike {
    if (!this.pageRef) throw new TanjiError('AUTH_REQUIRED', 'browser not started');
    return this.pageRef;
  }

  info(): BrowserInfo {
    return {
      connected: this.isConnected(),
      headless: this.opts.headless,
      profileDir: this.opts.profileDir,
      ...(this.startedAt ? { browserVersion: 'cloak' } : {}),
    };
  }

  async close(): Promise<void> {
    await this.context?.close().catch(() => {});
    this.context = null;
    this.pageRef = null;
  }
}


/** 把 cloak/playwright 页面包装成稳定的 PageLike（隔离底层类型） */
function wrapPage(page: CloakPageLike): PageLike {
  return {
    url: () => page.url(),
    title: () => page.title(),
    goto: (url, opts) => page.goto(url, opts as Record<string, unknown>),
    evaluate: (fn, arg) => page.evaluate(fn, arg),
    waitForTimeout: (ms) => page.waitForTimeout(ms),
    content: () => page.content(),
    text: () => page.evaluate('document.body ? document.body.innerText : ""') as Promise<string>,
    click: (selector, opts) => page.locator(selector).first().click(opts ?? {}),
    clickByText: async (text, opts) => {
      await page.getByText(text, { exact: opts?.exact ?? true }).first().click({ timeout: opts?.timeout ?? 15000 });
    },
    fill: (selector, value) => page.locator(selector).first().fill(value),
    type: (selector, value, opts) => page.locator(selector).first().type(value, { delay: opts?.delay ?? 80 }),
    press: (key) => page.keyboard.press(key),
    waitForSelector: (selector, opts) =>
      page.locator(selector).first().waitFor({ state: opts?.state ?? 'visible', timeout: opts?.timeout ?? 20000 }),
  };
}
