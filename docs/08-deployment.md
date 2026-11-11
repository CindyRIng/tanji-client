# 部署与常驻指南
> 文档编号：08 ｜ 状态：现行指南 ｜ 最后更新：2026-11-10
> 共享 cloak-env、systemd/daemon、多账号、日志与排障。


> 适用：NixOS/Linux，本项目路径 `/home/songqian/tanji-client`。
> 目标：进程常驻、开机自启、崩溃自动重启；多账号各自独立进程/端口/profile/cache。

---

## 1. 前置条件

| 项 | 要求 |
| --- | --- |
| Node.js | >= 22.5（本项目用 22.23.2，`node:sqlite` 实验特性） |
| cloak 运行环境 | 共享 FHS：`~/cloak-env/bin/cloak-run`（独立于项目；见 §2.1） |
| 已登录 profile | `~/.tanji-client/profile`（由 `tanji login` 生成；或拷贝已有 profile） |
| systemd user | 常驻/开机自启用；无 systemd 时可用 `tanji accounts start` 后台模式 |

---

## 2. 安装全局命令

```bash
ln -sf /home/songqian/tanji-client/bin/tanji-run ~/.local/bin/tanji
tanji --version
```

- `bin/tanji-run` 会进入 cloak FHS 后执行 `node dist/main.js`，因此浏览器相关命令在 NixOS 上也能直接跑。
- 常驻服务在线时，CLI 自动走 `127.0.0.1:<port>` 的 REST（不会与常驻进程抢 profile 锁）。
- 常驻服务离线时，CLI 本地启动浏览器执行单次命令。

### 2.1 共享 cloak 环境（~/cloak-env）

- 位置：`~/cloak-env/`（FHS + cloakbrowser 0.6.5 + playwright-core 1.65.0，独立于本项目）。
- 版本：`~/cloak-env/bin/cloak-env-info`。
- 重建：`cd ~/cloak-env && nix build --impure --expr 'import ~/cloak-env/fhs.nix' -o ~/cloak-env/cloak-fhs`。
- 其他项目可直接用 `~/cloak-env/bin/cloak-run <cmd>`；Chromium 缓存在 `~/.cloakbrowser`，天然共享；profile 必须各自独立。
- 项目 `bin/tanji-run` 支持用 `CLOAK_ENV=/path/to/cloak-env` 覆盖共享目录（默认 `/home/songqian/cloak-env`）。

## 3. 首次部署

```bash
cd /home/songqian/tanji-client
npm install
npm run build

# 1) 登录（首次建议可见浏览器，人工过验证码）
cd /home/songqian/tanji-client
DISPLAY=:0 ~/cloak-env/bin/cloak-run env TANJI_PROFILE_DIR=$PWD/.profile node dist/main.js login --interactive
#   说明：正式部署 profile 建议 ~/.tanji-client/profile；可用 TANJI_PROFILE_DIR 指定

# 2) 写配置文件（权限 600，含凭据；不要提交到仓库）
mkdir -p ~/.tanji-client/logs ~/.tanji-client/run
cat > ~/.tanji-client/config.json <<'JSON'
{
  "phone": "156xxxxxxxx",
  "password": "******",
  "headless": true,
  "apiToken": "<随机 token>",
  "port": 8787,
  "accounts": [
    {
      "id": "main",
      "phone": "156xxxxxxxx",
      "password": "******",
      "profileDir": "/home/songqian/.tanji-client/profile",
      "cacheDb": "/home/songqian/.tanji-client/cache.db",
      "port": 8787
    }
  ]
}
JSON
chmod 600 ~/.tanji-client/config.json
```

> `apiToken` 用于 REST/MCP 鉴权；可用 `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"` 生成。

---

## 4. 常驻方式

### 方式 A：systemd user（推荐，开机自启 + 崩溃重启）

```bash
tanji service install                 # 默认账号
# 或指定账号：tanji service install main
tanji service status
tanji service stop
tanji service uninstall
```

实际效果：

- 生成 `~/.config/systemd/user/tanji-client-main.service`；
- `systemctl --user enable --now`；
- 执行 `loginctl enable-linger $USER`（用户退出登录后仍运行）；
- 进程崩溃 5 秒后自动重启；
- 启动参数：`bin/tanji-run serve --account main --port <port> --start-browser`（内部走 cloak FHS）。

查看日志：

```bash
journalctl --user -u tanji-client-main.service -f
tail -f ~/.tanji-client/logs/tanji.log
```

### 方式 B：后台守护（无 systemd 时）

```bash
tanji accounts start main             # 单账号后台启动
tanji accounts start --all            # 多账号（每账号独立进程/端口）
tanji accounts stop main
tanji accounts stop --all
tanji accounts list                   # 运行状态/端口/pid/health
```

pid 与日志：`~/.tanji-client/run/<id>.pid`、`~/.tanji-client/logs/<id>.out.log`。

> 同一账号不要同时用 systemd 与 `accounts start` 启动（单实例锁会拒绝）。

---

## 5. 多账号

`config.json`：

```json
{
  "port": 8787,
  "accounts": [
    { "id": "main",  "phone": "13800000001", "password": "***" },
    { "id": "sales", "phone": "13800000002", "password": "***", "port": 8788 }
  ]
}
```

- 每个账号：独立 `profileDir`（默认 `~/.tanji-client/accounts/<id>/profile`）、独立 `cache.db`、独立端口（未显式指定时 `port + index`）。
- CLI：`tanji --account sales status`；MCP：`tanji mcp --account sales`。
- REST：每个账号一个端口（`tanji accounts list` 查看）。
- 常驻：`tanji service install main`、`tanji service install sales`（两个 unit），或 `tanji accounts start --all`。

---

## 5.1 调度与限频参数

| 环境变量 | 默认 | 说明 |
| --- | --- | --- |
| `TANJI_RATE_PER_MIN` | 20 | 总上游限频（priority+bulk 共享） |
| `TANJI_PRIORITY_RESERVE` | 5 | 为解锁/登录预留的令牌数 |
| `TANJI_BULK_QUEUE_MAX` | 12 | 读请求等待队列上限，超出返回 429 + retryAfterMs |

解锁默认只打 1 个上游调用；需要额度/联系人时用 `quota=true` / `contacts=true`（各多 1 次调用）。详情轻量模式 `sections=basic,detail` 只打 2 个调用。

## 6. 日志与轮转

- 位置：`~/.tanji-client/logs/tanji.log`（JSONL）。
- 轮转：单文件超过 `TANJI_LOG_MAX_BYTES`（默认 10MB）→ `tanji.log.1`，保留 `TANJI_LOG_KEEP`（默认 5）份。
- 脱敏：password/token/cookie/authorization 自动替换 `***`；手机号显示 `156****0075`。
- 同时写 stdout：systemd 下进 journal；CLI/MCP 默认只写文件（避免污染 JSON 输出/MCP 协议）。

---

## 7. 健康检查与运维

```bash
# REST（token 在 config.json）
TOKEN=$(python3 -c "import json;print(json.load(open('/home/songqian/.tanji-client/config.json'))['apiToken'])")
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8787/v1/health
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8787/v1/status

tanji status                          # 自动拉起/检查
tanji accounts list
tanji cache stats
```

- 缓存：`~/.tanji-client/cache.db`（SQLite WAL）；清理 `tanji cache clear --all`。
- 升级：`git pull && npm install && npm run build && systemctl --user restart tanji-client-main.service`。
- 备份：`config.json`（凭据）、`profile/`（登录态）、`cache.db`（可选）。
- 日志排查：`journalctl --user -u tanji-client-main.service -n 200` + `tanji.log`。

---

## 8. 当前机器上的部署状态（2026-11-09）

| 项 | 状态 |
| --- | --- |
| cloak 环境 | `~/cloak-env`（FHS + cloakbrowser 0.6.5 + playwright-core 1.65.0） |
| 项目依赖 | `cloakbrowser 0.6.5`（项目 `node_modules`） |
| 账号 | `main`（156****0075） |
| 运行方式 | systemd user：`tanji-client-main.service`（active/running，enabled） |
| Linger | 已开启（`Linger=yes`） |
| 端口 | `127.0.0.1:8787` |
| Profile | `~/.tanji-client/profile`（已登录） |
| 缓存 | `~/.tanji-client/cache.db` |
| 日志 | `~/.tanji-client/logs/tanji.log`（JSONL，轮转 10MB×5） |
| 健康 | `/v1/health` 200，`/v1/status` loggedIn=true，quota 正常 |
| 全局命令 | `~/.local/bin/tanji` → `bin/tanji-run`（任意目录可用） |

---

## 9. 常见问题

| 现象 | 处理 |
| --- | --- |
| `ALREADY_RUNNING` | 已有进程持有 profile 锁；`tanji accounts stop main` 或停 systemd 服务 |
| 服务启动即退出 | 看 `journalctl --user -u tanji-client-main.service`；确认 cloak FHS 路径存在、config 权限/JSON 正确 |
| 登录态失效 | `tanji login --interactive`（headless 需要人工过验证码时临时 `TANJI_HEADLESS=false` + DISPLAY） |
| 端口占用 | 修改 account 的 `port`，重启服务 |
| 探迹改版 `UPSTREAM_CHANGED` | 停止自动任务，更新适配层后重启 |
| 日志太大 | 调小 `TANJI_LOG_MAX_BYTES` 或 `TANJI_LOG_KEEP` |
