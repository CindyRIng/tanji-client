import { describe, expect, it } from 'vitest';
import { ConfigSchema } from '../src/config/schema.js';
import { performPasswordLogin } from '../src/session/login.js';
import type { PageLike } from '../src/browser/types.js';

const cfg = ConfigSchema.parse({
  phone: '13800000000',
  password: 'secret',
  profileDir: '/tmp/tanji-test-profile',
  apiToken: 'x'.repeat(10),
});

class FakePage implements PageLike {
  urlValue = 'about:blank';
  textValue = '';
  fills: Array<[string, string]> = [];
  clicks: string[] = [];
  private portalRedirect: boolean;
  private captcha: boolean;

  constructor(opts: { portalRedirect?: boolean; captcha?: boolean } = {}) {
    this.portalRedirect = opts.portalRedirect ?? false;
    this.captcha = opts.captcha ?? false;
  }

  url(): string {
    return this.urlValue;
  }
  async goto(url: string): Promise<unknown> {
    if (this.portalRedirect) {
      this.urlValue = 'https://user.tungee.com/home';
      this.textValue = '探迹平台 · 个人中心 退出账户 探迹拓客';
      return;
    }
    this.urlValue = 'https://user.tungee.com/users/sign-in';
    this.textValue = this.captcha ? '请完成验证' : '扫码登录 账号登录 +86 手机号 密码 登 录';
    return;
  }
  async text(): Promise<string> {
    return this.textValue;
  }
  async title(): Promise<string> {
    return '';
  }
  async content(): Promise<string> {
    return '';
  }
  async evaluate<T>(_fn: unknown, _arg?: unknown): Promise<T> {
    return '' as T;
  }
  async clickByText(text: string): Promise<void> {
    this.clicks.push(text);
    if (text === '探迹拓客') {
      this.urlValue = 'https://sales.tungee.com/home?entry=1';
      this.textValue = '探迹拓客 企业查询 高级筛选';
    }
    if (text === '登 录') {
      this.urlValue = 'https://user.tungee.com/home';
      this.textValue = '探迹平台 · 个人中心 退出账户 探迹拓客';
    }
  }
  async click(selector: string): Promise<void> {
    this.clicks.push(selector);
  }
  async fill(selector: string, value: string): Promise<void> {
    this.fills.push([selector, value]);
  }
  async type(selector: string, value: string): Promise<void> {
    this.fills.push([selector, value]);
  }
  async press(_key: string): Promise<void> {}
  async waitForTimeout(_ms: number): Promise<void> {}
  async waitForSelector(selector: string): Promise<void> {
    if (this.captcha || !selector.includes('手机号')) throw new Error('not found');
  }
}

describe('login state machine', () => {
  it('recovers sales session when sign-in redirects to portal home', async () => {
    const page = new FakePage({ portalRedirect: true });
    await performPasswordLogin(page, cfg, false);
    expect(page.url()).toContain('sales.tungee.com');
    expect(page.fills).toHaveLength(0);
    expect(page.clicks).toContain('探迹拓客');
  });

  it('fills the account form when the login page is shown', async () => {
    const page = new FakePage();
    await performPasswordLogin(page, cfg, false);
    expect(page.fills.map(([, v]) => v)).toEqual(['13800000000', 'secret']);
    expect(page.url()).toContain('sales.tungee.com');
  });

  it('reports CAPTCHA_REQUIRED instead of a 30s fill timeout', async () => {
    const page = new FakePage({ captcha: true });
    await expect(performPasswordLogin(page, cfg, false)).rejects.toMatchObject({ code: 'CAPTCHA_REQUIRED' });
  });
});
