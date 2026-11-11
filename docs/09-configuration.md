# 配置与环境说明

> 文档编号：09 ｜ 状态：现行指南 ｜ 适用版本：tanji-client 0.1.x
> 目标：让其他人从零完成「共享浏览器环境 + 凭据 + 缓存 + 常驻」配置。

## 1. 配置文件与优先级

配置有三个来源，优先级从高到低：

```text
CLI 参数（--config / --account / --port ...）
  > 环境变量（TANJI_*）
  > 配置文件（默认 ~/.tanji-client/config.json）
  > 内置默认值
```

常用文件：

| 文件 | 用途 | 是否提交仓库 |
| --- | --- | --- |
| `config.example.json` | 单账号配置模板 | ✅ |
| `config.multi-account.example.json` | 多账号配置模板 | ✅ |
| `~/.tanji-client/config.json` | 实际运行配置（含凭据） | ❌ |
| `.env` / `.env.local` | 环境变量（含凭据） | ❌ |
| `~/.tanji-client/profile/` | 浏览器登录态 | ❌ |
| `~/.tanji-client/cache.db` | SQLite 缓存 | ❌ |
| `~/.tanji-client/logs/` | JSONL 日志 | ❌ |

## 2. 三步快速配置

```bash
# 1) 安装共享浏览器环境（详见第 5 节）
CLOAK_ENV=$HOME/cloak-env scripts/setup-cloak-env.sh

# 2) 写配置（二选一）
cp config.example.json ~/.tanji-client/config.json
chmod 600 ~/.tanji-client/config.json
# 编辑 phone / password / apiToken

# 也可以只用环境变量
cp .env.example .env
# 编辑 TANJI_PHONE / TANJI_PASSWORD / TANJI_API_TOKEN

# 3) 登录并验证
tanji login --interactive
tanji status
```

### 2.1 `.env` 如何生效

- 程序启动时自动读取**项目根目录**的 `.env`（Node 22 `process.loadEnvFile`）；
- 可用 `TANJI_ENV_FILE` 指定其他路径；
- systemd 场景可用 unit 的 `EnvironmentFile=`（`tanji service install` 生成的 unit 会读取 `~/.tanji-client/env`）；
- `.env` 优先级高于 config.json、低于 CLI 参数。

## 3. config.json 字段

```jsonc
{
  // 站点
  "baseUrl": "https://sales.tungee.com",
  "loginUrl": "https://user.tungee.com/users/sign-in",

  // 登录凭据（建议只在本文件，权限 600）
  "phone": "13800000000",
  "password": "REPLACE_ME",

  // 浏览器
  "headless": true,
  "profileDir": "~/.tanji-client/profile",

  // 本地 REST/MCP
  "apiToken": "REPLACE_WITH_RANDOM_TOKEN",
  "host": "127.0.0.1",
  "port": 8787,

  // 缓存
  "cache": {
    "dbPath": "~/.tanji-client/cache.db",
    "detailTtlSec": 604800,
    "listTtlSec": 86400
  },

  // 会话与调度
  "session": {
    "heartbeatSec": 300,
    "ratePerMin": 20,
    "autoRelogin": true,
    "maxPages": 5,
    "requestTimeoutMs": 30000,
    "priorityReserve": 5,
    "bulkQueueMax": 12
  },

  // 日志
  "logLevel": "info",
  "log": {
    "file": "~/.tanji-client/logs/tanji.log",
    "maxBytes": 10485760,
    "keep": 5,
    "stdout": true
  },

  // 多账号（可选）
  "accounts": [
    {
      "id": "main",
      "phone": "13800000001",
      "password": "REPLACE_ME",
      "profileDir": "~/.tanji-client/accounts/main/profile",
      "cacheDb": "~/.tanji-client/accounts/main/cache.db",
      "port": 8787
    }
  ]
}
```

> `~` 会被展开为当前用户 home；相对路径按运行目录解析。

## 4. 环境变量完整表

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `TANJI_CONFIG_FILE` | `~/.tanji-client/config.json` | 配置文件路径 |
| `TANJI_ENV_FILE` | `./.env` | 启动时加载的 env 文件（已存在的环境变量优先） |
| `TANJI_BASE_URL` | `https://sales.tungee.com` | 探迹销售端 |
| `TANJI_LOGIN_URL` | `https://user.tungee.com/users/sign-in` | 登录页 |
| `TANJI_PHONE` | — | 登录手机号 |
| `TANJI_PASSWORD` | — | 登录密码 |
| `TANJI_HEADLESS` | `true` | 是否无头 |
| `TANJI_BROWSER_CHANNEL` | `cloak` | `cloak` 或 `chrome`（调试） |
| `TANJI_PROFILE_DIR` | `~/.tanji-client/profile` | 浏览器 userDataDir |
| `TANJI_API_TOKEN` | `change-me` | REST/MCP Bearer token，**必须修改** |
| `TANJI_HOST` | `127.0.0.1` | REST 监听地址 |
| `TANJI_PORT` | `8787` | REST 端口 |
| `TANJI_CLIENT_URL` | — | CLI/MCP 代理目标；默认 `http://host:port` |
| `TANJI_CACHE_DRIVER` | `sqlite` | `sqlite` 或 `memory` |
| `TANJI_CACHE_DB` | `~/.tanji-client/cache.db` | SQLite 路径 |
| `TANJI_CACHE_DETAIL_TTL` | `604800` | 详情/联系人 TTL（秒） |
| `TANJI_CACHE_LIST_TTL` | `86400` | 搜索页/query TTL（秒） |
| `TANJI_HEARTBEAT_SEC` | `300` | 心跳间隔 |
| `TANJI_AUTO_RELOGIN` | `true` | 掉线自动重登 |
| `TANJI_RATE_PER_MIN` | `20` | 上游总限频（0=不限，仅压测） |
| `TANJI_PRIORITY_RESERVE` | `5` | 解锁/登录预留令牌 |
| `TANJI_BULK_QUEUE_MAX` | `12` | 读请求队列上限（超出 429） |
| `TANJI_MAX_PAGES` | `5` | 单次任务翻页上限 |
| `TANJI_REQUEST_TIMEOUT_MS` | `30000` | 上游请求超时 |
| `TANJI_ACCOUNT` | — | 默认账号 id（多账号时） |
| `TANJI_LOG_LEVEL` | `info` | debug/info/warn/error |
| `TANJI_LOG_FILE` | `~/.tanji-client/logs/tanji.log` | JSONL 日志 |
| `TANJI_LOG_MAX_BYTES` | `10485760` | 单日志文件上限 |
| `TANJI_LOG_KEEP` | `5` | 保留历史份数 |
| `TANJI_LOG_STDOUT` | `true` | 同时写 stdout |

## 5. 浏览器环境（共享 `~/cloak-env`）

### 5.1 为什么需要单独环境

- 探迹要求真实浏览器和登录态，项目使用 **cloakbrowser 0.6.5 + Chromium 146**；
- NixOS 上 Chromium 依赖动态链接器，不能直接运行，需要 FHS；
- 把 FHS/Chromium 缓存与业务项目分离，多个项目可共用。

### 5.2 一键初始化

仓库提供 `scripts/setup-cloak-env.sh`：

```bash
CLOAK_ENV=$HOME/cloak-env scripts/setup-cloak-env.sh
```

脚本会：

1. 复制 `deploy/fhs.nix`、`deploy/cloak-run`、`deploy/cloak-env-info` 到 `$CLOAK_ENV`；
2. 写入 `package.json`（cloakbrowser 0.6.5 + playwright-core 1.65.0）并 `npm install`；
3. 检测到 Nix 时构建 FHS：`$CLOAK_ENV/cloak-fhs`；
4. 输出 `cloak-env-info` 版本信息。

### 5.3 非 NixOS

非 NixOS 不需要 FHS：脚本检测不到 `nix` 时只安装 npm 包；`deploy/cloak-run` 会直接执行命令。
前提是系统已装 Chromium 运行库（libnss3、libatk、libgbm、libasound2 等），或使用 Docker。

### 5.4 验证

```bash
~/cloak-env/bin/cloak-env-info
~/cloak-env/bin/cloak-run node --version
```

`bin/tanji-run` 默认使用 `$HOME/cloak-env`，可用 `CLOAK_ENV` 覆盖：

```bash
CLOAK_ENV=/opt/cloak-env tanji status
```

## 6. 多账号

```json
{
  "accounts": [
    { "id": "main",  "phone": "13800000001", "password": "***", "port": 8787 },
    { "id": "sales", "phone": "13800000002", "password": "***", "port": 8788 }
  ]
}
```

- 每个账号独立 `profileDir`、`cacheDb`、端口；
- `profileDir`/`cacheDb` 省略时默认 `~/.tanji-client/accounts/<id>/...`；
- CLI/MCP：`--account sales`；`TANJI_ACCOUNT=sales`；
- REST：每个账号一个端口；
- 常驻：`tanji service install main`、`tanji service install sales`，或 `tanji accounts start --all`。

## 7. MCP 代理（推荐）

MCP 默认**不打开浏览器**，只把工具调用转发给常驻 REST 服务：

```bash
tanji mcp                         # 默认 http://127.0.0.1:8787
tanji mcp --url http://127.0.0.1:8787
TANJI_CLIENT_URL=http://127.0.0.1:8787 tanji mcp
tanji mcp --local                 # 仅开发/无服务时：本地 App，会独占 profile
```

MCP 客户端配置示例（Claude/Codex 等）：

```json
{
  "mcpServers": {
    "tanji": {
      "command": "/usr/local/bin/tanji",
      "args": ["mcp"],
      "env": {
        "TANJI_CLIENT_URL": "http://127.0.0.1:8787",
        "TANJI_API_TOKEN": "REPLACE_WITH_TOKEN"
      }
    }
  }
}
```

- 服务未启动时，工具列表仍可返回；调用数据工具会返回 `SERVICE_UNAVAILABLE`，不会去抢 profile 锁。
- `--local` 会自己启动浏览器，只在没有常驻服务时使用；同一 profile 只能有一个 owner。

## 8. 启动与验证

```bash
tanji health                     # 无需登录
tanji status                     # 登录态 + 额度
tanji serve --port 8787          # REST
tanji serve --start-browser      # 启动即拉起会话
tanji mcp                        # MCP stdio
tanji service install            # systemd user 常驻
```

验证：

```bash
curl http://127.0.0.1:8787/v1/health
curl -H "Authorization: Bearer $TANJI_API_TOKEN" http://127.0.0.1:8787/v1/status
```

## 9. 常见配置场景

| 需求 | 配置 |
| --- | --- |
| 可见浏览器过验证码 | `TANJI_HEADLESS=false` + `DISPLAY` |
| 关闭自动重登 | `TANJI_AUTO_RELOGIN=false` |
| 缓存更久 | 调大 `TANJI_CACHE_DETAIL_TTL` / `LIST_TTL` |
| 缓存禁用 | `TANJI_CACHE_DETAIL_TTL=0`（立即过期） |
| 调试内存缓存 | `TANJI_CACHE_DRIVER=memory` |
| 仅本机低风险使用 | 保持 `TANJI_RATE_PER_MIN=20` |
| 批量任务 | 解锁走 priority；详情用 `--sections basic,detail` |
| 多账号隔离 | `accounts` + 独立端口/profile/cache |

## 10. 安全

- `config.json` / `.env` 权限 `600`，不要提交；
- `TANJI_API_TOKEN` 必须改成随机值；
- REST 只监听 `127.0.0.1`，不要暴露公网；
- profile 与登录态不得跨项目/账号共用；
- 解锁消耗额度，务必先 `tanji status`；
- 使用需遵守探迹服务条款与授权范围。

## 11. 排障

| 现象 | 处理 |
| --- | --- |
| `cloak-run: FHS not found` | 运行 `scripts/setup-cloak-env.sh` 或设置 `CLOAK_FHS` |
| `ALREADY_RUNNING` | 已有进程占用 profile；`tanji accounts stop` 或停 systemd |
| `AUTH_REQUIRED` | `tanji login --interactive` 重新登录 |
| `RATE_LIMITED` | 按 `retryAfterMs` 退避；不要并发轰炸 |
| `UPSTREAM_CHANGED` | 探迹改版，更新适配层 |
| 端口占用 | 改 `port` / account 端口 |
| 缓存异常 | `tanji cache clear --all` 或 `TANJI_CACHE_DRIVER=memory` 临时验证 |
