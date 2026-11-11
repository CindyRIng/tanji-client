/**
 * 探迹登录流程（手机号+密码 → SSO → 探迹拓客）
 * 参考 docs/03 §1 的实测流程。
 */
import type { PageLike } from '../browser/types.js';
import type { Config } from '../config/schema.js';
import { TanjiError } from '../errors/catalog.js';

const SIGN_IN = '/users/sign-in';
const PORTAL_HOME = '/home';
const SALES_HOME = '/home?entry=1';

function isCaptchaText(t: string): boolean {
  return /拖动|滑块|请完成验证|安全验证|验证码|aliyunCaptcha/i.test(t);
}

export async function performPasswordLogin(page: PageLike, cfg: Config, interactive: boolean): Promise<void> {
  if (!cfg.phone || !cfg.password) {
    throw new TanjiError('LOGIN_FAILED', '未配置 TANJI_PHONE / TANJI_PASSWORD');
  }

  await page.goto(cfg.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(2_500);

  // 切到账号登录（默认是扫码）
  const firstText = await page.text();
  if (firstText.includes('扫码登录') && firstText.includes('账号登录')) {
    await page.clickByText('账号登录', { exact: true, timeout: 10_000 }).catch(async () => {
      await page.click('div._2me12:has-text("账号登录")').catch(() => {});
    });
    await page.waitForTimeout(800);
  }

  await page.fill('input[placeholder*="手机号码"], input[placeholder*="手机号"]', cfg.phone);
  await page.fill('input[type="password"]', cfg.password);

  // 勾选“自动登录”，让 cookie 持久化（默认未勾选）
  await page.clickByText('自动登录', { exact: true, timeout: 5_000 }).catch(() => {});

  // 协议默认勾选；提交
  await page.clickByText('登 录', { exact: false, timeout: 10_000 }).catch(async () => {
    await page.click('button.ant-btn-primary');
  });
  await page.waitForTimeout(4_500);

  let body = await page.text();
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
    throw new TanjiError('LOGIN_FAILED', detail ? `登录失败：${detail}` : '登录失败（仍在登录页）');
  }

  // 个人中心 → 点击“探迹拓客”建立 sales 域会话
  await page.goto(new URL(PORTAL_HOME, cfg.loginUrl).toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(2_500);
  let portal = await page.text();
  if (portal.includes('登录信息失效')) {
    await page.clickByText('我知道了', { exact: true, timeout: 8_000 }).catch(() => {});
    await page.waitForTimeout(1_200);
  }
  await page.clickByText('探迹拓客', { exact: true, timeout: 10_000 }).catch(async () => {
    await page.click('a._1k3WK').catch(() => {});
  });
  await page.waitForTimeout(5_000);

  if (!page.url().includes('sales.tungee.com')) {
    await page.goto(new URL(SALES_HOME, cfg.baseUrl).toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(3_000);
    const salesText = await page.text();
    if (salesText.includes('登录信息失效') || salesText.includes('请先选择登录企业')) {
      // 兼容：回个人中心再点一次
      await page.clickByText('我知道了', { exact: true, timeout: 8_000 }).catch(() => {});
      await page.waitForTimeout(1_000);
      await page.goto(new URL(PORTAL_HOME, cfg.loginUrl).toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForTimeout(2_000);
      await page.clickByText('探迹拓客', { exact: true, timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(5_000);
    }
  }

  if (!page.url().includes('sales.tungee.com')) {
    throw new TanjiError('LOGIN_FAILED', '登录成功但跳转探迹拓客失败（SSO 异常）', {
      details: { url: page.url() },
    });
  }
}
