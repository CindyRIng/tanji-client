# Changelog

All notable changes to tanji-client are documented here.
格式参考 [Keep a Changelog](https://keepachangelog.com/)，版本号遵循 SemVer。

## [Unreleased]

### Added

- 多账号（进程级）：`accounts` 配置、`tanji accounts list/start/stop`、每账号独立 profile/cache/端口。
- 常驻：systemd user 服务（`tanji service install/status/stop/uninstall`）、`--start-browser`。
- 日志：JSONL 文件日志、按大小轮转、保留份数、密码/token/cookie 脱敏。
- 文档：`docs/README.md` 索引、`SECURITY.md`、`CHANGELOG.md`、`docs/09-configuration.md`。
- 公共领域许可（Unlicense）与公共仓库配置模板（config/.env/deploy/setup 脚本）。

### Changed

- 限频器：priority/bulk 双通道 + 预留令牌 + bulk 队列上限（429 + `retryAfterMs`）。
- 解锁：默认只打 1 个上游调用；`quota` / `contacts` 改为可选。
- 详情：新增 `sections` 轻量模式（`basic,detail` 2 个上游调用），轻量结果不写缓存。
- 浏览器环境独立到 `~/cloak-env`（FHS + cloakbrowser 0.6.5 + 通用 `cloak-run` 包装）。
- cloakbrowser 升级 0.6.4 → 0.6.5（Chromium 146 不变）。

### Fixed

- 企业查询第 2 页起改走 advance-search-v2，避免企业查询接口 403。
- 上游新增/空字段的兼容（nullable 数值、动态字段）。
- CLI/MCP 日志不再污染 stdout/JSON 输出。
- 缓存统计体积包含 SQLite WAL/SHM。

## [0.1.0] - 2026-11-09

### Added

- 初始版本：zod 领域模型、统一 envelope、错误码目录。
- CLI / REST / MCP 三类传输与自动生成的 OpenAPI/MCP/CLI 规范。
- 探迹适配：登录、名称搜索、高级筛选、翻页、企业详情、联系人、解锁、额度。
- SQLite 缓存（搜索页/详情/联系人/查询会话）与 memory 回退。
- 筛选条件注册表（12 类 / 345 个 UI 条件）。
- systemd/daemon 常驻与性能基准。
