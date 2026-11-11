# Tanji Client 接口草案（v0.1）
> 文档编号：02 ｜ 状态：已归档（以 06 为准） ｜ 最后更新：2026-11-10
> 早期接口设计稿；字段与路由以 06-api-spec.md 为准。


> **注意**：本文为 v0.1 草案。权威接口规范见 [`06-api-spec.md`](./06-api-spec.md) 与 `spec/openapi.json`；冲突时以 06/spec 为准。

> 配套文档：[`01-requirements.md`](./01-requirements.md)、[`03-page-operations.md`](./03-page-operations.md)（上游真实接口与字段见该文档第 4/6/7/8 节；筛选条件全量见 [`04-filter-catalog.md`](./04-filter-catalog.md)，企业查询见 [`05-enterprise-search.md`](./05-enterprise-search.md)）。本文件定义 CLI / REST / MCP 三通道的对外契约，目标：**同一能力、同一 JSON 结构**。
> 状态：草稿。字段名与枚举以最终页面结构调研结果为准，标注 `TBD` 的项需在技术方案阶段确认。

---

## 1. 通用约定

### 1.1 服务与鉴权

| 项 | 约定 |
| --- | --- |
| REST 监听 | `127.0.0.1:8787`（默认，可配；**仅本机**） |
| 鉴权 | `Authorization: Bearer <TANJI_API_TOKEN>`；token 由配置文件/环境变量提供 |
| Content-Type | `application/json; charset=utf-8` |
| MCP | 默认 stdio；可选本地 HTTP（同一 token） |
| 单实例 | 同机重复启动返回 `E_ALREADY_RUNNING` |

### 1.2 统一响应包

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "requestId": "req_20261109_0001",
    "cached": false,
    "page": 1,
    "pageSize": 20,
    "total": 128,
    "hasMore": true,
    "tookMs": 1234
  },
  "error": null
}
```

失败时：

```json
{
  "ok": false,
  "data": null,
  "meta": { "requestId": "req_20261109_0002", "cached": false },
  "error": { "code": "AUTH_REQUIRED", "message": "会话已失效，正在尝试自动重登" }
}
```

### 1.3 错误码

| code | HTTP | 含义 | 可重试 |
| --- | --- | --- | --- |
| `AUTH_REQUIRED` | 401 | 未登录/登录态失效 | 重登后 |
| `LOGIN_FAILED` | 401 | 自动重登失败（密码错误等） | 否，需人工 |
| `CAPTCHA_REQUIRED` | 409 | 触发验证码/滑块，需人工 | 人工后 |
| `RATE_LIMITED` | 429 | 触发本地限频或上游限流 | 退避后 |
| `QUOTA_EXHAUSTED` | 409 | 日/月额度不足 | 否 |
| `UPSTREAM_CHANGED` | 502 | 页面结构变化导致解析失败 | 修复后 |
| `TIMEOUT` | 504 | 上游请求超时 | 是 |
| `NOT_FOUND` | 404 | 企业/结果不存在 | 否 |
| `BAD_REQUEST` | 400 | 参数非法 | 否 |
| `E_ALREADY_RUNNING` | 409 | 客户端已在本机运行 | 否 |
| `INTERNAL` | 500 | 未分类错误 | 视情况 |

### 1.4 分页

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `page` | 1 | 页码，从 1 开始 |
| `pageSize` | 20 | 每页条数，上限可配（默认 50） |
| `maxPages` | 5 | 单次任务翻页上限（防风控，可配） |

---

## 2. 数据模型

### 2.1 Company（列表项）

```json
{
  "id": "tungee_company_id",
  "uscc": "91440300MA5XXXXXXX",
  "name": "深圳市某某科技有限公司",
  "industry": "软件和信息技术服务业",
  "region": "广东省/深圳市",
  "scale": "100-499人",
  "registeredCapital": "500万人民币",
  "establishedAt": "2018-06-01",
  "businessStatus": "存续",
  "hasPhone": true,
  "hasEmail": true
}
```

> 字段可得性 `TBD`；缺失字段返回 `null`。

### 2.2 CompanyDetail（详情，Company 的超集）

```json
{
  "id": "tungee_company_id",
  "uscc": "91440300MA5XXXXXXX",
  "name": "深圳市某某科技有限公司",
  "industry": "软件和信息技术服务业",
  "region": "广东省/深圳市",
  "address": "深圳市南山区……",
  "scale": "100-499人",
  "registeredCapital": "500万人民币",
  "establishedAt": "2018-06-01",
  "legalRepresentative": "张三",
  "businessStatus": "存续",
  "businessScope": "……",
  "contacts": [
    { "name": "李四", "title": "采购经理", "phone": "138****0000", "email": null }
  ],
  "tags": ["高新技术企业"],
  "sourceUrl": "https://…/company/…"
}
```

> 联系方式是否可见/需解锁、是否消耗额度：`TBD`（见 PRD 10.2）。

### 2.3 Status（合并 check status + credit session）

```json
{
  "loggedIn": true,
  "health": "ok",
  "account": "138****0000",
  "quota": {
    "daily": { "limit": 100, "used": 12, "remaining": 88, "unit": "次" },
    "monthly": { "limit": 2000, "used": 300, "remaining": 1700, "unit": "次" }
  },
  "lastCheckedAt": "2026-11-09T19:10:00+08:00",
  "upstreamUrl": "https://…"
}
```

`health` 枚举：`ok` / `degraded`（可重试的异常）/ `needs_human`（需人工登录或过验证码）。

---

## 3. CLI 通道

```bash
tanji <command> [options] [--format json|table] [--request-id <id>]
```

| 命令 | 说明 | 示例 |
| --- | --- | --- |
| `tanji status` | 登录态 + 日/月额度 | `tanji status` |
| `tanji login` | 自动登录（当前 profile） | `tanji login` |
| `tanji login --interactive` | 可见浏览器，人工完成验证/登录 | `tanji login --interactive` |
| `tanji search name` | 名称搜索 | `tanji search name --name "某某科技" --page 1 --page-size 20` |
| `tanji search advance` | 高级搜索（结构化字段） | `tanji search advance --industry 制造业 --region 深圳市 --scale 100-499人 --page 1` |
| `tanji companies list` | 列表（按上次查询条件翻页） | `tanji companies list --query-id q_001 --page 2` |
| `tanji companies detail` | 企业详情 | `tanji companies detail --id <companyId>` |
| `tanji cache stats` | 缓存统计 | `tanji cache stats` |
| `tanji cache clear` | 清缓存（可 `--prefix`） | `tanji cache clear --prefix company:` |
| `tanji serve` | 启动 REST（+可选 MCP HTTP） | `tanji serve --port 8787` |
| `tanji mcp` | 以 stdio 启动 MCP server | `tanji mcp` |

**退出码**：`0` 成功；`2` 参数错误；`3` 未登录/需人工；`4` 额度不足；`5` 上游变化；`6` 限流；`1` 其他错误。

**输出约定**：`--format json`（默认）输出统一响应包；`--format table` 输出人读表格。`stderr` 只输出日志/错误摘要，不污染 JSON。

---

## 4. REST 通道

Base：`http://127.0.0.1:8787`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/v1/status` | 登录态 + 额度 |
| POST | `/v1/login` | 触发自动登录（可选 `{ "interactive": false }`） |
| POST | `/v1/search/name` | 名称搜索 |
| POST | `/v1/search/advance` | 高级搜索 |
| GET | `/v1/companies` | 列表翻页：`?queryId=&page=&pageSize=` |
| GET | `/v1/companies/{id}` | 企业详情 |
| GET | `/v1/cache/stats` | 缓存统计 |
| DELETE | `/v1/cache` | 清缓存：`?prefix=` |
| GET | `/v1/health` | 存活探针（不校验登录态） |

### 4.1 示例：名称搜索

```http
POST /v1/search/name
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "某某科技",
  "page": 1,
  "pageSize": 20,
  "maxPages": 5
}
```

```json
{
  "ok": true,
  "data": {
    "queryId": "q_20261109_0001",
    "companies": [ { "id": "…", "name": "…", "uscc": "…" } ]
  },
  "meta": { "requestId": "req_…", "cached": false, "page": 1, "pageSize": 20, "total": 128, "hasMore": true, "tookMs": 1830 },
  "error": null
}
```

### 4.2 示例：高级搜索

```json
{
  "industry": ["制造业"],
  "region": ["广东省/深圳市"],
  "scale": ["100-499人"],
  "registeredCapital": { "min": 100, "max": 1000, "unit": "万元" },
  "establishedYears": { "min": 3, "max": null },
  "companyType": ["有限责任公司"],
  "hasPhone": true,
  "businessStatus": ["存续"],
  "page": 1,
  "pageSize": 20
}
```

### 4.3 示例：企业详情

```http
GET /v1/companies/tungee_company_id
Authorization: Bearer <token>
```

```json
{
  "ok": true,
  "data": { "id": "…", "name": "…", "uscc": "…", "contacts": [], "tags": [] },
  "meta": { "requestId": "req_…", "cached": true, "tookMs": 3 },
  "error": null
}
```

---

## 5. MCP 通道

启动：`tanji mcp`（stdio）或 `tanji serve --mcp`（本地 HTTP）。

| 工具名 | 入参 | 返回 |
| --- | --- | --- |
| `tanji_status` | 无 | Status |
| `tanji_search_name` | `name`, `page?`, `pageSize?` | 统一响应包 |
| `tanji_search_advance` | 结构化筛选字段（见 4.2） | 统一响应包 |
| `tanji_list_companies` | `queryId?`, `page?`, `pageSize?` | 统一响应包 |
| `tanji_company_detail` | `id` 或 `name`+`region` | 统一响应包 |

MCP 工具描述中需写明：**调用前先 `tanji_status` 检查登录态与额度；额度不足时不要继续**。

---

## 6. SKILL（agent 技能包）接口约定

- 技能入口文档：`skills/tanji/SKILL.md`（后续实现）。
- 依赖：CLI（推荐）或 MCP 工具；不直接访问浏览器/REST 之外的内部实现。
- 典型编排：

```
1) tanji_status            → 不通过则中止并报告
2) tanji_search_advance    → 拿第一页 + queryId
3) tanji_companies list    → 按需翻页（≤ maxPages），按 USCC 去重
4) tanji_company_detail    → 对 Top N 补充详情
5) 汇总输出 JSON / Markdown 表格（不落文件）
```

- 技能输出建议字段：`query`、`filters`、`count`、`companies[]`、`errors[]`、`tookMs`。

---

## 7. 配置项（草案）

| 配置 | 默认 | 说明 |
| --- | --- | --- |
| `TANJI_BASE_URL` | `TBD` | 探迹拓客网页入口 |
| `TANJI_PHONE` | — | 登录手机号（或从加密配置读取） |
| `TANJI_PASSWORD` | — | 密码（建议存加密配置，权限 600） |
| `TANJI_PROFILE_DIR` | `~/.tanji-client/profile` | cloak 持久化 profile |
| `TANJI_CACHE_DB` | `~/.tanji-client/cache.db` | SQLite 路径 |
| `TANJI_API_TOKEN` | — | REST/MCP HTTP 鉴权 token |
| `TANJI_PORT` | `8787` | REST 端口 |
| `TANJI_HEARTBEAT_SEC` | `300` | 心跳间隔 |
| `TANJI_RATE_PER_MIN` | `20` | 上游请求限频 |
| `TANJI_MAX_PAGES` | `5` | 单次翻页上限 |
| `TANJI_CACHE_DETAIL_TTL` | `7d` | 详情缓存 TTL |
| `TANJI_CACHE_LIST_TTL` | `1d` | 列表缓存 TTL |
| `TANJI_HEADLESS` | `true` | 是否无头 |
| `TANJI_LOG_LEVEL` | `info` | 日志级别 |
| `CLOAKBROWSER_LICENSE_KEY` | — | 可选，免费档可不配 |
