/**
 * 探迹登录流程（手机号+密码 → SSO → 探迹拓客）
 *
 * 兼容三种入场状态：
 * 1) 已经在 sales.tungee.com：直接返回；
 * 2) 账号中心仍有会话：/users/sign-in 会 302 到 user.tungee.com/home，
 *    此时没有手机号表单，应先点「探迹拓客」恢复 sales 会话；
 * 3) 真正未登录：登录页 → 切账号登录 → 填手机号/密码。
 */
import type { PageLike } from '../browser/types.js';
import type { Config } from '../config/schema.js';
import { TanjiError } from '../errors/catalog.js';

const SIGN_IN = '/users/sign-in';
const PORTAL_HOME = '/home';
const SALES_HOME = '/home?entry=1';
const PHONE_INPUT = 'input[placeholder*="手机号码"], input[placeholder*="手机号"]';

function isCaptchaText(t: string): boolean {
  return /拖动|滑块|请完成验证|安全验证|验证码|aliyunCaptcha/i.test(t);
}

function isSalesUrl(url: string): boolean {
  try {
    return new URL(url).hostname === 'sales.tungee.com';
  } catch {
    return false;
  }
}

function isPortalHome(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === 'user.tungee.com' && u.pathname.startsWith('/home');
  } catch {
    return false;
  }
}

function textSnippet(text: string, max = 500): string {
  return text.replace(/\s+/g, ' ').slice(0, max);
}

async function waitPhoneInput(page: PageLike, timeout: number): Promise<boolean> {
  try {
    await page.waitForSelector(PHONE_INPUT, { state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

/**
 * 从账号中心首页恢复 sales 会话：点「探迹拓客」，必要时直接打开 sales 首页并处理 SSO 提示。
 * 返回是否最终落在 sales.tungee.com 且没有“登录信息失效/请先选择登录企业”。
 */
async function recoverSalesFromPortal(page: PageLike, cfg: Config): Promise<boolean> {
  const hasInvalidText = async () => {
    const body = await page.text().catch(() => '');
    return /登录信息失效|请先选择登录企业/.test(body);
  };

  if (await hasInvalidText()) {
    await page.clickByText('我知道了', { exact: true, timeout: 8_000 }).catch(() => {});
    await page.waitForTimeout(1_200);
  }

  // 1) 在账号中心首页直接点「探迹拓客」
  if (!isSalesUrl(page.url())) {
    await page
      .clickByText('探迹拓客', { exact: true, timeout: 10_000 })
      .catch(async () => {
        await page.click('a._1k3WK').catch(() => {});
      });
    await page.waitForTimeout(5_000);
    if (isSalesUrl(page.url()) && !(await hasInvalidText())) return true;
  }

  // 2) 直接打开 sales 首页；若仍提示登录失效，回账号中心再点一次
  await page
    .goto(new URL(SALES_HOME, cfg.baseUrl).toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 })
    .catch(() => {});
  await page.waitForTimeout(3_000);
  if (isSalesUrl(page.url()) && !(await hasInvalidText())) return true;

  if (await hasInvalidText()) {
    await page.clickByText('我知道了', { exact: true, timeout: 8_000 }).catch(() => {});
    await page.waitForTimeout(1_000);
  }

  await page
    .goto(new URL(PORTAL_HOME, cfg.loginUrl).toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 })
    .catch(() => {});
  await page.waitForTimeout(2_000);
  await page.clickByText('探迹拓客', { exact: true, timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(5_000);

  return isSalesUrl(page.url()) && !(await hasInvalidText());
}

/** 确保登录表单出现；返回 false 时由调用方决定抛什么错误 */
async function ensureAccountForm(page: PageLike, cfg: Config, interactive: boolean): Promise<void> {
  if (await waitPhoneInput(page, 3_000)) return;

  // 默认可能是扫码 tab，切到账号登录后再等一次
  await page.clickByText('账号登录', { exact: true, timeout: 8_000 }).catch(async () => {
    await page.click('div._2me12:has-text("账号登录")').catch(() => {});
  });
  await page.waitForTimeout(800);
  if (await waitPhoneInput(page, 8_000)) return;

  const body = await page.text().catch(() => '');
  if (isCaptchaText(body)) {
    throw new TanjiError(
      'CAPTCHA_REQUIRED',
      interactive && cfg.headless
        ? '登录页出现验证码，但常驻服务是 headless，无法人工完成；请停止服务后本地 headful 登录'
        : '登录页出现验证码，请使用 `tanji login --interactive` 人工完成',
      { details: { url: page.url(), text: textSnippet(body) } },
    );
  }
  throw new TanjiError('LOGIN_FAILED', '登录页未出现手机号输入框（可能仍在扫码/风控页）', {
    details: { url: page.url(), text: textSnippet(body) },
  });
}

export async function performPasswordLogin(page: PageLike, cfg: Config, interactive: boolean): Promise<void> {
  if (!cfg.phone || !cfg.password) {
    throw new TanjiError('LOGIN_FAILED', '未配置 TANJI_PHONE / TANJI_PASSWORD');
  }

  await page.goto(cfg.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(2_500);

  let url = page.url();
  let body = await page.text().catch(() => '');

  // 已经在 sales 域且没有失效提示：直接返回（由 manager.login 的 status 再确认）
  if (isSalesUrl(url) && !/登录信息失效|请先选择登录企业/.test(body)) return;

  // 账号中心仍有会话：登录页被 302 到个人中心，没有手机号表单
  if (isPortalHome(url) || /个人中心|退出账户/.test(body)) {
    if (await recoverSalesFromPortal(page, cfg)) return;
    throw new TanjiError('LOGIN_FAILED', '账号中心已登录，但无法进入探迹拓客（SSO 恢复失败）', {
      details: { url: page.url(), text: textSnippet(await page.text().catch(() => '')) },
    });
  }

  // 理论上应该是登录页；如果跳到了其他页面，给明确诊断
  if (!url.includes(SIGN_IN)) {
    if (await recoverSalesFromPortal(page, cfg)) return;
    throw new TanjiError('LOGIN_FAILED', '登录入口跳转到了未知页面', {
      details: { url, text: textSnippet(body) },
    });
  }

  await ensureAccountForm(page, cfg, interactive);
  await page.fill(PHONE_INPUT, cfg.phone);
  await page.fill('input[type="password"]', cfg.password);

  // 勾选“自动登录”，让 cookie 持久化（默认未勾选）
  await page.clickByText('自动登录', { exact: true, timeout: 5_000 }).catch(() => {});

  // 协议默认勾选；提交
  await page.clickByText('登 录', { exact: false, timeout: 10_000 }).catch(async () => {
    await page.click('button.ant-btn-primary');
  });
  await page.waitForTimeout(4_500);

  body = await page.text();
  if (isCaptchaText(body)) {
    if (!interactive) {
      throw new TanjiError('CAPTCHA_REQUIRED', '登录触发验证码：请用 `tanji login --interactive` 人工完成');
    }
    const deadline = Date.now() + 240_000;
    while (Date.now() < deadline) {
      await page.waitForTimeout(3_000);
      body = await page.text();
      if (!isCaptchaText(body) && !page.url().includes(SIGN_IN)) break;
    }
    if (isCaptchaText(await page.text())) {
      throw new TanjiError('CAPTCHA_REQUIRED', '验证码未完成（超时 240s）');
    }
  }

  if (/密码错误|账号或密码|用户名或密码|账号不存在/.test(body)) {
    throw new TanjiError('LOGIN_FAILED', '账号或密码错误');
  }
  if (page.url().includes(SIGN_IN)) {
    const detail = body.match(/(账号[^\n]{0,40}|密码[^\n]{0,40}|验证码[^\n]{0,40})/)?.[1];
    throw new TanjiError('LOGIN_FAILED', detail ? `登录失败：${detail}` : '登录失败（仍在登录页）', {
      details: { url: page.url(), text: textSnippet(body) },
    });
  }

  // 个人中心 → 探迹拓客建立 sales 域会话
  await page
    .goto(new URL(PORTAL_HOME, cfg.loginUrl).toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 })
    .catch(() => {});
  await page.waitForTimeout(2_500);

  if (await recoverSalesFromPortal(page, cfg)) return;

  throw new TanjiError('LOGIN_FAILED', '登录成功但跳转探迹拓客失败（SSO 异常）', {
    details: { url: page.url(), text: textSnippet(await page.text().catch(() => '')) },
  });
}
