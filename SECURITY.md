# Security Policy

## 支持的版本

| 版本 | 支持 |
| --- | --- |
| 0.1.x | ✅ |

## 报告安全问题

请**不要**在公开 issue 中提交账号、密码、token、cookie 或可复现的登录信息。
通过仓库维护者的私有渠道报告，并附上：

- 受影响版本/提交；
- 复现步骤（脱敏后）；
- 影响范围；
- 建议修复方式（可选）。

## 凭据与敏感数据

- 账号密码、`TANJI_API_TOKEN`、浏览器 profile、cookie、SQLite 缓存、日志均**不得提交到仓库**。
- `.gitignore` 已排除：`.env*`（保留 `.env.example`）、`~/.tanji-client/`、`exploration/`、`node_modules/`、`dist/`、`bench/results-*`、`*.db`、`tmp-*`。
- 部署时配置文件权限建议 `600`；REST 仅监听 `127.0.0.1`，并使用 Bearer token。
- 日志会对 password/token/cookie/authorization 字段脱敏，手机号掩码显示。

## 运行时安全

- 默认限频 `TANJI_RATE_PER_MIN=20`，防止高频访问触发上游风控；压测才可临时设为 0。
- 解锁会消耗额度，调用方必须显式 `confirm=true`；建议单任务设置额度上限。
- 共享浏览器环境只共享 FHS 与 Chromium 缓存，**不要共享 profile / 登录态**。
- 本项目依赖第三方站点与浏览器，使用前请确认账号授权与服务条款；不提供任何绕过授权的用途。

## 依赖与供应链

- `cloakbrowser` 版本需锁定（当前 `0.6.5`，keyless，Chromium 146）。
- 升级 cloakbrowser 0.7.x 需要 license key；0.7.2 起 `playwright-core` 需 `<1.65`。
- 定期执行 `npm audit` 与 `npm run gen:check`。
