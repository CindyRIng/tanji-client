/**
 * 浏览器宿主抽象（cloak / chrome），传输层不直接依赖 Playwright
 */
import type { TanjiError } from '../errors/catalog.js';

export interface PageLike {
  url(): string;
  title(): Promise<string>;
  goto(url: string, opts?: { waitUntil?: 'domcontentloaded' | 'load' | 'networkidle'; timeout?: number }): Promise<unknown>;
  evaluate<T>(fn: string | ((arg: unknown) => T | Promise<T>), arg?: unknown): Promise<T>;
  waitForTimeout(ms: number): Promise<void>;
  content(): Promise<string>;
  /** 页面纯文本（document.body.innerText） */
  text(): Promise<string>;
  click(selector: string, opts?: { timeout?: number; force?: boolean }): Promise<void>;
  clickByText(text: string, opts?: { exact?: boolean; timeout?: number }): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  type(selector: string, value: string, opts?: { delay?: number }): Promise<void>;
  press(key: string): Promise<void>;
  waitForSelector(selector: string, opts?: { timeout?: number; state?: 'attached' | 'visible' }): Promise<void>;
}

export interface BrowserInfo {
  connected: boolean;
  headless: boolean;
  pid?: number;
  userAgent?: string;
  browserVersion?: string;
  profileDir: string;
}

export interface BrowserHost {
  start(): Promise<void>;
  isConnected(): boolean;
  page(): PageLike;
  info(): BrowserInfo;
  close(): Promise<void>;
}

export interface BrowserStartOptions {
  headless: boolean;
  profileDir: string;
  timezone?: string;
  locale?: string;
  viewport?: { width: number; height: number };
  humanize?: boolean;
}

export type PageEvaluateError = TanjiError;
