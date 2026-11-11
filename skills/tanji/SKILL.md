# SKILL: tanji-client（探迹拓客本地客户端）

## 概述

通过本地 `tanji` CLI / MCP 工具调用探迹 AI 拓客（sales.tungee.com）：
**登录态由 cloak 浏览器常驻保持，支持企业检索、高级筛选、详情、联系人、解锁、额度查询；结果默认走本地 SQLite 缓存。**

## 何时使用

- 需要查企业/找线索：按名称、人名、地址、统一码、联系方式搜索
- 需要多条件筛选：行业、地区、注册资本、成立时间、风险、资质、招聘等（345 个条件）
- 需要企业详情/股东/联系人/联系方式
- 需要解锁企业（消耗额度）
- 需要批量、稳定、可缓存的读取（agent/脚本/批处理）

## 前置检查（必须）

```bash
tanji status                 # 默认会自动启动浏览器并返回登录态 + 日/月额度
```

- `data.health != "ok"`：提示用户执行 `tanji login --interactive`，不要继续。
- `data.quota.monthly.remaining <= 0`：额度不足，停止。
- 如果服务已常驻，可直接 `curl -H "Authorization: Bearer $TANJI_API_TOKEN" http://127.0.0.1:8787/v1/status`。

## 常用命令

| 目的 | 命令 |
| --- | --- |
| 状态/额度 | `tanji status` |
| 登录（首次/掉线） | `tanji login`（验证码：`tanji login --interactive`） |
| 名称搜索 | `tanji search name --name 团车 --field name` |
| 高级筛选 | `tanji search advance --filter-file filters.json` |
| 翻页 | `tanji companies list --query-id <qid> --page 2` |
| 企业详情 | `tanji companies detail --id <companyId>` |
| 联系人 | `tanji contacts --id <companyId> --types mobile,email` |
| 解锁（扣额度） | `tanji unlock --id <companyId> --confirm` |
| 筛选条件 | `tanji filters registry --category 风险信息` |
| 缓存 | `tanji cache stats` / `tanji cache clear --all` |
| 多账号 | `tanji accounts list` / `--account <id>` |
| 常驻 | `tanji accounts start main` / `tanji service install` |

所有命令输出统一 envelope JSON：`{ok, data, meta, error}`；失败时看 `error.code`。

## 标准工作流

### 1) 名称/高级搜索 → 翻页 → 详情 → 联系人

```bash
# 1. 搜索（返回 data.queryId / data.companies / data.total）
tanji search name --name 团车 --field name --page-size 20

# 2. 翻页（复用 queryId；名称搜索第 2 页起会自动走 advance-search-v2）
tanji companies list --query-id <queryId> --page 2

# 3. 详情（7 个上游接口并行；默认读缓存，refresh=true 强制刷新）
tanji companies detail --id 37623000277f335b
# 轻量（2 个上游调用，适合批量）：
tanji companies detail --id 37623000277f335b --sections basic,detail

# 4. 联系人（未解锁返回空；解锁后明文手机/固话/邮箱）
tanji contacts --id 37623000277f335b --types mobile

# 5. 解锁（消耗 1 额度点，必须用户确认；默认只打 1 个上游调用）
tanji unlock --id 37623000277f335b --confirm
# 需要额度/联系人时再显式加：
tanji unlock --id 37623000277f335b --confirm --with-quota --with-contacts
```

### 2) 高级筛选示例（filters.json）

```json
{
  "relation": "all",
  "conditions": [
    { "key": "industriesV2", "op": "anyOf", "value": ["信息传输、软件和信息技术服务业"] },
    { "key": "regCapitalRmb", "op": "range", "value": { "min": 100, "max": 1000 } },
    { "key": "hasAnnualReport", "op": "boolean", "value": true }
  ]
}
```

```bash
tanji search advance --filter-file filters.json --page-size 20
```

可用条件通过 `tanji filters registry` 查询（345 个，含字段 key/控件/候选值来源）。

### 3) 多账号

```bash
tanji accounts list                  # 账号、端口、运行状态
tanji --account backup status        # 指定账号
tanji accounts start --all           # 所有账号后台常驻（每账号独立进程/profile/cache/端口）
tanji accounts stop --all
```

### 4) 常驻 / 开机自启

```bash
tanji service install                # systemd user：enable + start，开机自启、崩溃重启
tanji service status
tanji service stop / uninstall
```

REST 服务默认 `http://127.0.0.1:8787`（每个账号独立端口），文档：`/docs`、`/openapi.json`。

## MCP 工具（若挂到 agent）

`tanji mcp` 暴露 13 个工具：`tanji_health`、`tanji_status`、`tanji_accounts`、`tanji_session_login`、`tanji_search_name`、`tanji_search_advance`、`tanji_list_companies`、`tanji_company_detail`、`tanji_list_contacts`、`tanji_unlock_company`、`tanji_cache_stats`、`tanji_cache_clear`、`tanji_filter_registry`。

## 规则与安全

1. **解锁前必须用户确认**，单次任务默认 ≤5 次解锁；先 `status` 查额度。
2. 单次翻页 ≤5 页（`maxPages`），避免触发探迹风控。
3. 结果按 `uscc`（统一社会信用代码）去重，缺失回退 `id`。
4. 输出中联系人号码默认脱敏（如 139****0132），除非用户明确要求明文。
5. 遇到以下错误停止并报告，不要循环重试：
   - `AUTH_REQUIRED` / `LOGIN_FAILED` / `CAPTCHA_REQUIRED` → 让用户 `tanji login --interactive`
   - `QUOTA_EXHAUSTED` → 停止
   - `UPSTREAM_CHANGED` → 探迹可能改版，记录错误交给维护者
   - `RATE_LIMITED` → 按 `retryAfterMs` 退避，不要并发轰炸
6. 缓存：默认命中即返回（`meta.cached=true`）；只有需要最新数据时传 `refresh=true`。
7. 多账号：不要在同一 profile 上起两个进程（单实例锁会拒绝）；多账号用独立 account 配置。

## 输出模板

```json
{
  "query": "团车",
  "filters": { "relation": "all", "conditions": [] },
  "total": 833,
  "companies": [
    {
      "id": "37623000277f335b",
      "name": "团车互联网信息服务（北京）有限公司",
      "uscc": "91110000596018112D",
      "legalRepresentative": "闻伟",
      "regCapital": { "value": 1080000, "coinType": "人民币" },
      "foundTime": "2012-05-16",
      "address": "北京市海淀区羊坊店路21号9层922",
      "contactCount": 84,
      "unlocked": true,
      "tags": ["高新企业", "专精特新"]
    }
  ],
  "errors": []
}
```

表格输出建议列：企业名 / 法人 / 注册资本 / 成立时间 / 地区 / 联系方式数 / 是否已解锁。

## 性能与缓存提示

- 缓存命中读取 ≈ 1–2ms（单进程 ~420–570 QPS；4–16 并发可达 ~1.1k QPS）；上游冷读 2–8 QPS。
- 批量场景：先搜索/详情预热缓存，后续读取全部走缓存；不要对每个企业都 `refresh=true`。
- 生产保持 `TANJI_RATE_PER_MIN=20`；压测才设 0。
- 解锁走 priority 通道，批量读不会把它堵住；bulk 队列满会返回 429，按 `retryAfterMs` 退避。
- 批量场景用 `sections=basic,detail` 控制详情开销，避免并发详情占满限频。
- 缓存位置 `~/.tanji-client/cache.db`；清理 `tanji cache clear --all`。

## 参考

- 接口规范：`docs/06-api-spec.md`
- 性能/缓存：`docs/07-performance-cache.md`
- 筛选条件：`docs/04-filter-catalog.md`
- 上游实录：`docs/03-page-operations.md`、`docs/05-enterprise-search.md`
