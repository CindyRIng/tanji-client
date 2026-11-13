# 部署与常驻指南

> 文档编号：08 ｜ 状态：现行指南 ｜ 适用版本：v0.1.x
> 目标：从零部署、常驻、多账号与排障；配置字段细节见 [09-configuration](09-configuration.md)。

## 1. 前置条件

| 项 | 要求 |
| --- | --- |
| OS | Linux；NixOS 需通过 FHS 运行 Chromium |
| Node.js | >= 22.5（建议 22.23.x，`node:sqlite`） |
| 浏览器环境 | 共享 `~/cloak-env`（cloakbrowser 0.6.5 + Chromium 146） |
| 探迹账号 | 已授权账号；解锁消耗额度 |
| systemd（可选） | 常驻/开机自启；无 systemd 可用后台 daemon |

## 2. 安装

```bash
# 1) 获取代码
git clone <repo-url> tanji-client
cd tanji-client

# 2) 安装共享浏览器环境（NixOS 会构建 FHS）
CLOAK_ENV=$HOME/cloak-env scripts/setup-cloak-env.sh

# 3) 安装项目依赖
npm install
npm run build

# 4) 安装全局命令（可选）
ln -sf "$PWD/bin/tanji-run" ~/.local/bin/tanji
tanji --version
```

> `bin/tanji-run` 默认使用 `$HOME/cloak-env`；自定义路径时设置 `CLOAK_ENV`。

## 3. 配置

```bash
mkdir -p ~/.tanji-client/logs ~/.tanji-client/run
cp config.example.json ~/.tanji-client/config.json
chmod 600 ~/.tanji-client/config.json
# 编辑 phone / password / apiToken
```

生成随机 token：

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

完整字段、环境变量、共享环境说明见 [09-configuration](09-configuration.md)。

## 4. 登录

```bash
# 首次登录：可见浏览器，人工完成验证码
tanji login --interactive

# 无头环境（需要已保存的 profile 或人工兜底）
DISPLAY=:0 tanji login
```

验证：

```bash
tanji status
tanji health
```

登录流程会自动识别三种状态：

- 已在 `sales.tungee.com`：直接返回；
- 登录页被 302 到 `user.tungee.com/home`（账号中心仍登录、sales 会话失效）：自动点击「探迹拓客」恢复 SSO，不再等待手机号表单；
- 真正未登录：切账号登录并填写手机号/密码。

服务启动 5 秒后会做一次自动恢复尝试；失败会写入 `session.relogin.failed`，并按 5m → 10m → 20m → 40m → 60m 退避，避免每 5 分钟无限重试。若出现验证码且服务是 headless，会返回 `CAPTCHA_REQUIRED` 并提示改用 headful 登录。

## 5. 运行方式

### 5.1 前台

```bash
tanji serve --port 8787 --start-browser
# REST: http://127.0.0.1:8787
# 文档: http://127.0.0.1:8787/docs
```

`--start-browser` 会在启动时拉起会话；不加则首次请求时懒启动。

### 5.2 systemd user（推荐常驻）

```bash
tanji service install            # 默认账号
tanji service status
tanji service stop
tanji service uninstall
```

实际效果：

- 生成 `~/.config/systemd/user/tanji-client[-<account>].service`；
- `systemctl --user enable --now`；
- 尝试 `loginctl enable-linger $USER`，用户退出登录后仍运行；
- `Restart=always`，崩溃 5 秒后重启；
- 启动命令：`bin/tanji-run serve --account <id> --port <port> --start-browser`。

日志：

```bash
journalctl --user -u tanji-client-main.service -f
tail -f ~/.tanji-client/logs/tanji.log
```

> 移动项目目录后需重新 `tanji service install`（unit 中记录项目路径）。

### 5.3 后台 daemon（无 systemd）

```bash
tanji accounts start main        # 单账号
tanji accounts start --all       # 多账号
tanji accounts list
tanji accounts stop --all
```

pid/日志：`~/.tanji-client/run/<id>.pid`、`~/.tanji-client/logs/<id>.out.log`。

> 同一账号不要同时用 systemd 与 `accounts start`（单实例锁会拒绝）。

## 5.4 MCP 代理（默认）

MCP 不直接开浏览器，而是转发到常驻 REST 服务：

```bash
tanji mcp                         # 默认 http://127.0.0.1:8787
tanji mcp --url http://127.0.0.1:8787
TANJI_CLIENT_URL=http://127.0.0.1:8787 tanji mcp
tanji mcp --local                 # 仅开发/无服务：会独占 profile
```

- 服务在线：工具调用走 REST，登录/查询/缓存都在服务进程内完成；
- 服务离线：数据工具返回 `SERVICE_UNAVAILABLE`，不会争抢 profile；
- `--local` 才创建本地 App，必须确保没有常驻服务占用同一 profile。

## 6. 多账号

`~/.tanji-client/config.json`：

```json
{
  "accounts": [
    { "id": "main",  "phone": "13800000001", "password": "***", "port": 8787 },
    { "id": "sales", "phone": "13800000002", "password": "***", "port": 8788 }
  ]
}
```

- 每账号独立 `profileDir` / `cacheDb` / 端口；
- CLI/MCP：`--account sales`；REST：各账号独立端口；
- 常驻：`tanji service install main`、`tanji service install sales`，或 `tanji accounts start --all`。

模板：[config.multi-account.example.json](../config.multi-account.example.json)。

## 7. 日志

- JSONL：`~/.tanji-client/logs/tanji.log`；
- 按 `TANJI_LOG_MAX_BYTES`（默认 10MB）轮转，保留 `TANJI_LOG_KEEP`（默认 5）份；
- password/token/cookie/authorization 自动脱敏；手机号掩码；
- systemd 下 stdout 同时进入 journal。

## 8. 健康检查

```bash
tanji status
tanji accounts list

TOKEN=$(python3 -c "import json;print(json.load(open('$HOME/.tanji-client/config.json'))['apiToken'])")
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8787/v1/health
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8787/v1/status
```

## 9. 升级与备份

```bash
git pull
npm install
npm run build
systemctl --user restart tanji-client-main.service
```

备份：`~/.tanji-client/config.json`、`profile/`（登录态）、`cache.db`（可选）。
升级 cloakbrowser 需同步共享环境与项目依赖，见 [09-configuration](09-configuration.md)。

## 10. 排障

| 现象 | 处理 |
| --- | --- |
| `FHS not found` | 运行 `scripts/setup-cloak-env.sh`，或设置 `CLOAK_FHS` |
| `ALREADY_RUNNING` | 已有进程占用 profile；停 systemd/daemon |
| 服务启动即退出 | 看 `journalctl --user -u tanji-client-main.service`；检查 cloak-env、config 权限 |
| 登录态失效 | `tanji login --interactive`；headless 需人工验证码时临时 `TANJI_HEADLESS=false` |
| 端口占用 | 修改 `port` 或账号端口后重启 |
| `UPSTREAM_CHANGED` | 探迹改版；更新适配层后重启 |
| `RATE_LIMITED` | 按 `retryAfterMs` 退避；保持默认 20/min |

## 11. NixOS 说明

- Chromium 不能直接运行，必须走 `~/cloak-env/cloak-fhs`；
- `deploy/fhs.nix` 构建 FHS，`-o ~/cloak-env/cloak-fhs` 创建 GC root；
- 重建：`cd ~/cloak-env && NIXPKGS_ALLOW_UNFREE=1 nix build --impure --expr 'import ~/cloak-env/fhs.nix' -o ~/cloak-env/cloak-fhs`；
- 其他 Linux 发行版可跳过 FHS，直接使用 `deploy/cloak-run` 与本机 Chromium 依赖。
