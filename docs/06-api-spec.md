# tanji-client 接口规范 v1.0
> 文档编号：06 ｜ 状态：现行规范 v1.0 ｜ 最后更新：2026-11-10
> 权威 API 契约：CLI/REST/MCP 统一 envelope、错误码、模型、配置。


| 项 | 内容 |
| --- | --- |
| 版本 | 1.0（与响应包 `meta.schemaVersion` 一致） |
| 状态 | v1.0 完整实现：登录/搜索/翻页/详情/联系人/解锁/缓存/多账号/常驻 |
| 单一事实源 | `src/domain/*.ts`（zod schema） + `src/api/operations.ts`（操作注册表） |
| 机器可读产物 | `spec/openapi.json`、`spec/mcp-tools.json`、`spec/cli-commands.json`、`spec/schemas/*.json`、`spec/operations/*.json` |
| 相关文档 | [02 接口草案（v0.1 草稿）](./02-api-draft.md)、[03 页面操作实录](./03-page-operations.md)、[04 筛选条件清单](./04-filter-catalog.md)、[05 企业查询实录](./05-enterprise-search.md) |

> 本文是**权威接口规范**。02 为早期草案，冲突时以本文 + `spec/` 为准。
> 接口变更流程：改 `src/domain` / `src/api/operations.ts` → `npm run gen` → 更新本文 → `npm run gen:check`（CI 校验漂移）。

---

## 1. 传输层与映射

| 传输层 | 入口 | 说明 |
| --- | --- | --- |
| REST | `tanji serve` → `http://127.0.0.1:8787` | 仅本机监听、Bearer token、统一 envelope |
| CLI | `tanji <command>` | 与 REST 同 schema；默认输出 envelope JSON |
| MCP | `tanji mcp`（stdio） | 12 个工具，inputSchema 由 zod 生成 |
| SKILL | `skills/tanji/SKILL.md` | agent 技能包，内部调 CLI/MCP |

### 1.1 文档入口（自动生成）

| 入口 | 说明 |
| --- | --- |
| `tanji --help` / `tanji <command> --help` | 由 operations + zod 实时生成：参数（含类型/必填/默认/说明）、响应、错误码、示例 |
| `tanji docs` | 12 个操作的索引（ID / REST / MCP / CLI） |
| `tanji docs <operationId>` | 单个操作的完整说明（同 `--help` 详情） |
| `GET /docs` | 自包含 HTML 交互文档（无外部 CDN） |
| `GET /docs?format=json` | 机器可读的文档 JSON |
| `GET /openapi.json` | OpenAPI 3.1（12 路径 / 24 schema） |
| `GET /mcp-tools.json` | MCP 工具清单与 inputSchema |
| `spec/*.json` | 生成物（见 §13） |

所有传输层共享**同一个请求/响应 schema**：

| 能力 | REST | MCP tool | CLI |
| --- | --- | --- | --- |
| 健康检查 | `GET /v1/health` | `tanji_health` | `tanji health` |
| 状态/额度 | `GET /v1/status` | `tanji_status` | `tanji status` |
| 登录 | `POST /v1/session/login` | `tanji_session_login` | `tanji login` |
| 名称搜索 | `POST /v1/search/name` | `tanji_search_name` | `tanji search name` |
| 高级筛选 | `POST /v1/search/advance` | `tanji_search_advance` | `tanji search advance` |
| 翻页 | `GET /v1/companies` | `tanji_list_companies` | `tanji companies list` |
| 企业详情 | `GET /v1/companies/{id}` | `tanji_company_detail` | `tanji companies detail` |
| 联系人 | `GET /v1/companies/{id}/contacts` | `tanji_list_contacts` | `tanji contacts` |
| 解锁 | `POST /v1/companies/{id}/unlock` | `tanji_unlock_company` | `tanji unlock` |
| 缓存统计 | `GET /v1/cache/stats` | `tanji_cache_stats` | `tanji cache stats` |
| 清缓存 | `DELETE /v1/cache` | `tanji_cache_clear` | `tanji cache clear` |
| 筛选条件注册表 | `GET /v1/filters/registry` | `tanji_filter_registry` | `tanji filters registry` |
| 账号列表 | `GET /v1/accounts` | `tanji_accounts` | `tanji accounts list` |

> 性能测试与缓存机制详见 [`07-performance-cache.md`](./07-performance-cache.md)。

---

## 2. 鉴权与安全

- REST/MCP 使用 **Bearer token**：`Authorization: Bearer <TANJI_API_TOKEN>`；`/v1/health` 不需要鉴权。
- token 来源：`TANJI_API_TOKEN` 环境变量或配置文件；默认 `change-me`，**部署时必须修改**。
- REST 仅监听 `127.0.0.1`（`TANJI_HOST`），不对外网开放。
- 凭据（手机号/密码）不写入日志；日志中手机号脱敏。
- 单实例约束：同一 `profileDir` 只允许一个进程（`.tanji.lock`，pid 存活检测）。
- 响应头与错误信息不回显 token/密码。

---

## 3. 统一响应包（Envelope）

所有 REST 响应（含错误）都是 envelope；CLI/MCP 也返回同一结构。

### 3.1 成功

```json
{
  "ok": true,
  "data": { "...": "操作响应" },
  "meta": {
    "schemaVersion": "1.0",
    "requestId": "req_1794226235315_fj6j1a",
    "timestamp": "2026-11-09T20:10:35.315+08:00",
    "tookMs": 7,
    "cached": false,
    "pagination": { "page": 1, "pageSize": 20, "total": 833, "hasMore": true },
    "warnings": [],
    "upstream": { "baseUrl": "https://sales.tungee.com", "latencyMs": 120 }
  },
  "error": null
}
```

### 3.2 失败

```json
{
  "ok": false,
  "data": null,
  "meta": {
    "schemaVersion": "1.0",
    "requestId": "req_1794226235315_fj6j1a",
    "timestamp": "2026-11-09T20:10:35.315+08:00",
    "tookMs": 3,
    "cached": false,
    "warnings": []
  },
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "浏览器会话未启动：请先执行 `tanji login`",
    "retryable": true
  }
}
```

### 3.3 meta 字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| schemaVersion | `"1.0"` | 是 | 响应包 schema 版本 |
| requestId | string | 是 | 贯穿日志的请求 ID |
| timestamp | ISO8601 | 是 | 服务端时间（含时区） |
| tookMs | int ≥0 | 是 | 处理耗时 |
| cached | boolean | 是 | 是否命中缓存 |
| pagination | object | 否 | 分页操作返回 |
| warnings | string[] | 是 | 非致命告警（如截断、部分失败） |
| upstream | object | 否 | 上游调用信息 |

---

## 4. 错误码目录

| code | HTTP | retryable | 含义 |
| --- | --- | --- | --- |
| `BAD_REQUEST` | 400 | 否 | 参数格式错误 |
| `UNAUTHORIZED` | 401 | 否 | Bearer token 错误/缺失 |
| `AUTH_REQUIRED` | 401 | 是 | 探迹登录态失效，可自动重登后重试 |
| `LOGIN_FAILED` | 401 | 否 | 自动登录失败，需要人工 |
| `FORBIDDEN` | 403 | 否 | 无权限（模块未开通/风控） |
| `NOT_FOUND` | 404 | 否 | 企业/查询会话/缓存不存在 |
| `METHOD_NOT_ALLOWED` | 405 | 否 | HTTP 方法不匹配 |
| `CONFLICT` | 409 | 否 | 状态冲突（未确认解锁等） |
| `CAPTCHA_REQUIRED` | 409 | 是 | 需要人工过验证码 |
| `QUOTA_EXHAUSTED` | 409 | 否 | 额度不足 |
| `VALIDATION_FAILED` | 422 | 否 | JSON Schema 校验失败（details.issues） |
| `RATE_LIMITED` | 429 | 是 | 本地/上游限频，按 `retryAfterMs` 退避 |
| `ALREADY_RUNNING` | 409 | 否 | 同机重复启动 |
| `TIMEOUT` | 504 | 是 | 上游超时 |
| `UPSTREAM_CHANGED` | 502 | 否 | 探迹改版/字段变化 |
| `UPSTREAM_UNAVAILABLE` | 503 | 是 | 探迹不可达 |
| `SERVICE_UNAVAILABLE` | 503 | 是 | CLI/MCP 代理的本地常驻服务不可达 |
| `NOT_IMPLEMENTED` | 501 | 否 | 骨架阶段未实现 |
| `CACHE_ERROR` | 500 | 否 | SQLite 读写失败 |
| `INTERNAL` | 500 | 否 | 未分类内部错误 |

`error.details` 为可选对象；`VALIDATION_FAILED` 时含 `issues: ZodIssue[]`；`UPSTREAM_CHANGED` 时含 `path/body/issues`。

---

## 5. 分页、重试、幂等、限频、额度

### 5.1 分页与 queryId

- 搜索类操作返回 `data.queryId`（格式 `q_<yyyymmdd>_<rand>`），服务端在 SQLite `queries` 表保存原始条件（TTL 24h）。
- 翻页：`GET /v1/companies?queryId=...&page=1&pageSize=20`；`page` 从 1 开始，`pageSize` 1–100。
- 上游使用 `start/end`（0-based）：`start=(page-1)*pageSize`、`end=start+pageSize`。
- `search.name` / `search.advance` 的 `page > 1` 会直接请求对应页，但仍会生成新的 queryId。
- `maxPages`：单次任务最多翻页数（默认 5，1–50），用于防风控。

### 5.2 重试与限频

- 可重试错误：`AUTH_REQUIRED`、`CAPTCHA_REQUIRED`、`RATE_LIMITED`、`TIMEOUT`、`UPSTREAM_UNAVAILABLE`。
- 客户端建议指数退避（1s/2s/4s，最多 3 次）；`RATE_LIMITED` 使用 `retryAfterMs`。
- 服务端默认限频 `TANJI_RATE_PER_MIN=20`；所有上游调用经过同一个令牌桶（容量 20，约 1 token/3s）。
- **双通道调度**：
  - `priority`：解锁、登录等写操作；优先出队，可消费全部令牌（含预留）。
  - `bulk`：搜索/翻页/详情/联系人等读操作；只能消费预留之外的令牌（`TANJI_PRIORITY_RESERVE`，默认 5）。
- **读队列背压**：bulk 等待队列超过 `TANJI_BULK_QUEUE_MAX`（默认 12）时，直接返回 `429 RATE_LIMITED` + `retryAfterMs`，避免请求排队到分钟级；客户端应退避重试。
- 解锁默认只打 1 个上游调用（priority），批量读不会再把解锁堵到 100s 级。

### 5.3 幂等

| 操作 | 幂等 | 说明 |
| --- | --- | --- |
| status/health/cache.stats/filters.registry | 是 | 只读 |
| search.* / companies.list / companies.detail / contacts.list | 是 | 只读 |
| companies.unlock | 是（业务幂等） | 已解锁企业不会重复扣额度；可选 `idempotencyKey` |
| cache.clear / session.login | 否 | 有副作用 |

### 5.4 额度语义（实测）

- `status.data.quota` 含三层：个人日 `daily`、个人月 `monthly`、企业月 `enterpriseMonthly`。
- **解锁 1 家企业 = 扣 1 个额度点**（三层同时 -1）。
- 搜索、翻页、打开详情页**不扣额度**。
- 解锁前建议先 `status` 检查剩余额度；额度不足返回 `QUOTA_EXHAUSTED`。

---

## 6. 数据模型

> 完整 JSON Schema：`spec/schemas/*.json`（由 zod 生成）。以下列出关键字段。

### 6.1 CompanySummary（企业列表项）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string(hex) | 探迹企业 ID（`_id`） |
| name | string | 企业名 |
| entityType | `enterprise`\|`person` | 实体类型 |
| uscc | string? | 统一社会信用代码 |
| legalRepresentative | string? | 法定代表人 |
| regCapital | `{value, coinType, text?}`? | 注册资本，value 为人民币元 |
| foundTime | `YYYY-MM-DD`? | 成立日期 |
| address / province | string? | 注册地址 / 省份 |
| operStatus | string? | 登记状态（如“营业 > 存续”） |
| industry | `{first?,second?,third?,fourth?}`? | 四级行业 |
| scale | `{min?,max?,text?}`? | 人员规模 |
| annualTurnover | string? | 年营业额区间文本 |
| homepage | string? | 官网 |
| contactCount | int? | 联系方式数 |
| unlocked | boolean? | 当前账号是否已解锁 |
| tags / listedTags | string[] | 标签 / 上市标签 |
| score / rankScore | number? | 搜索相关度 |
| highlight | `Record<string,string[]>`? | 高亮片段 |

### 6.2 CompanyDetail

`CompanySummary` 的超集，另含：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| businessScope | string? | 经营范围 |
| registrationAuthority | string? | 登记机关 |
| approvedAt | date? | 核准日期 |
| companyType / registrationNumber / organizationCode | string? | 公司类型/注册号/组织机构代码 |
| englishName | string? | 英文名 |
| insuredCount | int? | 参保人数 |
| paidInCapital | number? | 实缴资本（元） |
| operatingPeriod | string? | 营业期限 |
| shareholders | Shareholder[] | 股东 |
| keyPeople | KeyPerson[] | 主要人员 |
| officeAddresses | string[] | 办公地址 |
| branchCount / investmentCount / changeCount | int? | 分支/对外投资/变更数 |
| annualReportYears | int[] | 年报年份 |
| formerNames | string[] | 曾用名 |
| extra | object | 未建模原始字段 |

### 6.3 ContactItem / ContactList

| 字段 | 类型（ContactItem） | 说明 |
| --- | --- | --- |
| contactId | string? | 联系人内部 ID |
| name | string? | 姓名（可能脱敏，如“闻*”） |
| type | `mobile`\|`phone`\|`email`\|`other` | 类型 |
| value | string | 号码/邮箱（解锁后明文） |
| masked | boolean | 是否掩码 |
| isKeyLead / isHighFreq | boolean? | 关键人/高频 |
| department/position/region | string? | 部门/职位/地区 |
| source | string? | 来源（政务公示/年报/官网…） |
| tags | string[] | 标签（如实号） |
| followStatus | int? | 跟进状态 |
| unlocked/hidden | boolean? | 是否已解锁/隐藏 |

`ContactList`：`{companyId, unlocked, counts:{mobile,phone,email,total}, contacts[], cached}`。

### 6.4 Status / QuotaSummary

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| loggedIn | boolean | 是否登录 |
| health | `starting`\|`ok`\|`degraded`\|`needs_human`\|`stopped` | 健康度 |
| message | string? | 状态说明 |
| account | `{displayName?,phoneMasked?,phone?,companyName?,role?}`? | 账号 |
| quota.daily/monthly/enterpriseMonthly | `{limit,used?,remaining,unit}` | 额度 |
| quota.settlementDay | int? | 结算日 |
| quota.nearlySevenDayUnlockCount | int? | 近 7 天解锁数 |
| session | `{profileDir?,headless?,startedAt?,lastHeartbeatAt?,lastLoginAt?}`? | 会话 |
| upstream | `{baseUrl, productLine, portalUrl?}`? | 上游 |
| lastCheckedAt | ISO8601? | 最近检查时间 |

### 6.5 SearchResult

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| queryId | string | 分页会话 ID |
| companies | CompanySummary[] | 当前页 |
| total | int | 总数 |
| page / pageSize | int | 分页 |
| hasMore | boolean | 是否有下一页 |
| pagesFetched | int | 本次请求上游页数 |
| cached | boolean | 是否命中缓存 |
| tookMs | int | 耗时 |
| warnings | string[] | 告警 |

### 6.6 FilterCondition / FilterGroup

```json
{
  "relation": "all",
  "conditions": [
    { "key": "industriesV2", "op": "anyOf", "value": ["制造业"], "negated": false },
    { "key": "regCapitalRmb", "op": "range", "value": { "min": 100, "max": 1000 } }
  ],
  "groups": []
}
```

| 字段 | 说明 |
| --- | --- |
| key | 上游字段 key（见 `/v1/filters/registry`） |
| op | `eq`/`anyOf`/`contains`/`range`/`boolean`/`preset`/`exists`/`notExists`/`custom` |
| value | 标量/数组/`{min,max}`/预设对象；按 op 约束 |
| negated | 是否取反 |
| relation | `all`=所有条件（relation=0）；`any`=任一（relation=1） |
| groups | 嵌套条件组（最多 5 层，待接入） |

约束（zod `superRefine`）：
- `boolean` 必须 boolean；`anyOf` 必须数组；`contains` 必须字符串；`range` 必须含 min 或 max；`preset` 必须对象。

### 6.7 FilterRegistry

`GET /v1/filters/registry` 返回：

```json
{
  "schemaVersion": "1.0",
  "source": "docs/04-filter-catalog.md（…）",
  "fetchedAt": "2026-11-09",
  "totalEntries": 345,
  "categories": [
    {
      "name": "工商信息",
      "subCategories": [
        { "name": "基础信息", "entries": [
          { "key": "industriesV2", "label": "国标行业", "category": "工商信息", "subCategory": "基础信息", "control": "tree", "optionsSource": "industriesV2", "optionCount": 20, "uiVisible": true }
        ] }
      ]
    }
  ],
  "hiddenEntries": [ { "key": "payGapRate", "label": "实缴比例", "uiVisible": false } ],
  "uncategorizedEntries": [ { "key": "isBranch", "label": "是否分支机构" } ]
}
```

- 共 12 类 / 345 个 UI 可见条件；11 个隐藏、23 个未分类。
- `control` 枚举：`keyword`/`select`/`multiSelect`/`tree`/`numberRange`/`dateRange`/`toggle`/`tier`/`relation`/`preset`。

### 6.8 CacheStats / HealthResponse

- `CacheStats`：`driver`、`sizeBytes?`（含 -wal/-shm）、`companies`、`companyDetails`、`contacts`、`queries`、`searchResults`、`hits/misses/hitRate`、`oldest/newestFetchedAt`。
- `HealthResponse`：`ok`、`version`、`uptimeSec`、`schemaVersion`、`browser{connected,headless}`、`cache{dbPath,ready}`。

---

## 7. 操作规范

### 7.1 health.get

`GET /v1/health` · 无需鉴权 · 无副作用

```json
{"ok":true,"data":{"ok":true,"version":"0.1.0","uptimeSec":1,"schemaVersion":"1.0","browser":{"connected":false,"headless":true},"cache":{"dbPath":"~/.tanji-client/cache.db","ready":true}},"meta":{...},"error":null}
```

### 7.2 status.get

`GET /v1/status` · Bearer · 只读

响应 `Status`（§6.4）。典型情况：
- 未启动浏览器：`loggedIn=false, health="stopped"`。
- 已登录：`health="ok"` + 三层额度。

### 7.3 session.login

`POST /v1/session/login` · Bearer

请求：

```json
{ "interactive": false, "force": false }
```

- `interactive=true`：启动可见浏览器，人工完成验证码/登录。
- `force=true`：即使已登录也重新登录。
- 响应 `Status`；当前骨架已启动浏览器，登录流程待补（`NOT_IMPLEMENTED`）。

### 7.4 search.name

`POST /v1/search/name` · Bearer

```json
{ "name": "团车", "field": "name", "page": 1, "pageSize": 20, "maxPages": 5 }
```

- `field`：`all`（默认）| `name` | `legalRepresentative` | `address` | `socialCreditCode` | `contact`。
- 上游：`GET /api/enterprises/search`；`fields` 映射见 [05](./05-enterprise-search.md)。
- 响应 `SearchResult`。

### 7.5 search.advance

`POST /v1/search/advance` · Bearer

```json
{
  "filters": {
    "relation": "all",
    "conditions": [
      { "key": "industriesV2", "op": "anyOf", "value": ["信息传输、软件和信息技术服务业"] },
      { "key": "regCapitalRmb", "op": "range", "value": { "min": 100, "max": 1000 } }
    ]
  },
  "page": 1, "pageSize": 20, "maxPages": 5
}
```

- 上游：`POST /api/advance-search-v2`（multipart，filter/relation/start/end/sort/mode=2）。
- 当前仅实现 `industriesV2`、`regCapitalRmb` 的 filter 映射；其余返回 `NOT_IMPLEMENTED`（待补齐，见 §14）。

### 7.6 companies.list

`GET /v1/companies?queryId=q_...&page=2&pageSize=20` · Bearer

响应 `SearchResult`；queryId 不存在/过期返回 `NOT_FOUND`。

### 7.7 companies.detail

`GET /v1/companies/{id}?refresh=false&sections=basic,detail` · Bearer

- 默认（不传 `sections`）返回完整详情：7 个上游接口并行（basic/detail/holders/members/invests/branches/alterations）。
- `sections` 逗号分隔，可按需拉取；`sections=basic,detail` 为轻量模式（2 个上游调用，约 1/3 耗时）。
- 轻量结果带 `partial=true` + `sections` 字段；**只缓存完整详情**，轻量结果不写缓存（避免覆盖完整数据）。
- 若已有完整缓存，轻量请求也会直接命中并返回完整详情（`cached=true`）。
- `refresh=true` 忽略缓存。

### 7.8 contacts.list

`GET /v1/companies/{id}/contacts?refresh=false&types=mobile,email` · Bearer

- 未解锁：`unlocked=false, contacts=[]`（不扣额度）。
- 已解锁：`unlocked=true` + 联系人（`value` 为明文，`masked=false`）。
- `types` 逗号分隔过滤。

### 7.9 companies.unlock

`POST /v1/companies/{id}/unlock` · Bearer · **扣额度**

```json
{ "confirm": true, "quota": false, "contacts": false, "idempotencyKey": "unlock-37623000277f335b-20261109" }
```

- `confirm` 必须为 `true`，否则 `CONFLICT`。
- **默认只调用 `PUT /api/lead/unlock`（1 个上游调用，priority 通道）**，成功即返回。
- `quota=true`：解锁后额外查询一次额度（+1 次上游调用，填充 `quotaAfter`）。
- `contacts=true`：解锁后立即拉取联系人（+1 次上游调用，返回 `contacts`）。
- 响应 `UnlockResult`：`{companyId, alreadyUnlocked, quotaCost, quotaAfter?, contacts?}`；默认 `quotaCost=1` 为估算（已解锁企业也按 1 返回，精确额度请用 `quota=true`）。
- 附件查询失败（含本地读队列满）不会把已成功的解锁判为失败。
- 额度不足/上游拒绝 → 对应错误码。

### 7.10 cache.stats / cache.clear

- `GET /v1/cache/stats` → `CacheStats`。
- `DELETE /v1/cache` body `{"all":true}` 或 `{"prefix":"37623"}` → `{deleted, scope}`。

### 7.12 accounts.list

`GET /v1/accounts` · Bearer · 只读

返回配置中的账号及运行状态（多账号为**进程级**：每个账号独立 profile/cache/端口/进程）：

```json
{
  "defaultAccountId": "main",
  "accounts": [
    { "id": "main", "phoneMasked": "156****0075", "profileDir": "...", "cacheDb": "...", "port": 8787, "enabled": true, "running": true, "pid": 12345, "health": "ok" }
  ]
}
```

实现：`src/accounts/config.ts`（配置解析）、`src/accounts/daemon.ts`（后台进程管理）、`src/accounts/systemd.ts`（systemd user 服务）。

### 7.11 filters.registry

`GET /v1/filters/registry?category=风险信息&keyword=裁判` · Bearer

返回 `FilterRegistry`（§6.7），支持 `category`/`keyword` 过滤。CLI：`tanji filters registry --category 风险信息`。

---

## 8. 筛选条件模型（对应 04 文档）

- 全量 345 个 UI 可见条件 + 11 隐藏 + 23 未分类，已生成到 `data/filter-registry.json`（116KB）。
- 每个条件包含：`key`（上游字段）、`label`、`category`/`subCategory`、`control`、`optionsSource`（候选值字典）、`unit`/`hint`。
- `control` 与 `op` 建议映射：

| control | 推荐 op | value 形态 |
| --- | --- | --- |
| keyword | `contains` | string |
| select | `eq` | string |
| multiSelect | `anyOf` | string[] |
| tree | `anyOf` | string[]（行业/地区） |
| numberRange | `range` | `{min?,max?}`（数值） |
| dateRange | `range` | `{min?,max?}`（日期） |
| toggle | `boolean` | boolean |
| tier | `preset` | 档位对象/字符串 |
| relation | `custom` | 关联子条件对象 |
| preset | `preset` | upstream 预设 value |

### 8.2 upstream 条件转换规则（前端 `transformCondition`，已确认）

探迹前端把每个条件转换为 `filter` 的规则是统一的（`src/adapters/tungee/filter-builder.ts` 已按此实现）：

| action.type | 名称 | 生成结构 |
| --- | --- | --- |
| 0 | RANGE | `{ key: [ { gte?, lte? } ] }`（数值/日期） |
| 1 | EXIST_OR_NOT | `{ key: [ { exist\|not_exist: true } ] }` |
| 2 | CONTAIN_OR_NOT | `{ key: [ { in\|nin: value } ] }` |
| 3 | EQUAL_OR_NOT | `{ key: [ { eq\|neq: value } ] }` |
| 4 | TEXT_CONTAIN_OR_NOT | `{ key: [ { in\|nin: value } ] }` |
| 5 | SELECT | `{ key: [ value ] }`（预设选项对象） |
| 7 | TEXT_CONTAIN | `{ key: [ { in: value } ] }` |
| 8 | NO_ACTION | `{ key: value }`（关联过滤原始值） |
| 9 | CONTAIN | `{ key: [ { in: value } ] }` |
| 10 | EQUAL | `{ key: [ { eq: value } ] }` |
| 11 | YES_OR_NO | `{ key: [ { exist\|not_exist: true } ] }` |

`input.type` 决定取值形态：`0` NUMBER、`1` DATE_PICKER、`2` MULTI_TREE_SELECT、`3` MULTI_KEYWORD、`4` MULTI_SELECT、`5` NUMBER_RANGE、`6` DATE_RANGE、`7` SELECT_RANGE、`8` MULTI_TREE_SELECT_FOUR、`9` YEAR_RANGE、`10` MULTI_SELECT_WITH_LAST_VALUE。

已用真实抓包验证 4 种：

| 条件 | 请求 filter |
| --- | --- |
| 企业名称 `name`（action=4） | `{"name":[{"in":["团车"]}]}` |
| 登记状态 `operStatus_v2`（action=3, input=2） | `{"operStatus_v2":[{"eq":[["营业"]]}]}` |
| 国标行业 `industriesV2`（action=3, input=8） | `{"industriesV2":[{"eq":[["信息传输、软件和信息技术服务业"]]}]}` |
| 注册资本 `regCapitalRmb`（action=0） | `{"regCapitalRmb":[{"gte":100,"lte":1000}]}` |

按上述规则推断（待 UI 抓包复核）：日期区间 → `{foundTime:[{gte,lte}]}`；是/否 → `{hasAnnualReport:[{exist:true}]}`；档位（公司规模）→ 取决于 option value，通常 `{enterpriseScaleAlgV2:[{gte,lte}]}`；预设（业务类型）→ `{businessType:[{eq:"toB"}]}`；关联过滤（手机）→ `{"hasMobile": <原始值>}`。

条件组关系：`relation: all` → `must` 数组 + `relation=0`；`any` → `should` 数组 + `relation=1`；嵌套条件组用嵌套 `{must|should:[...]}`。

---

## 9. 上游映射附录

| 客户端能力 | 上游接口 | 说明 |
| --- | --- | --- |
| 登录 | `user.tungee.com/users/sign-in` → `sales.tungee.com/home?entry=1` | SSO 坑见 03 §1.3 |
| 状态/额度 | `GET /api/console/remain-lead` + `/api/console/info-bar` | 三层额度 |
| 名称搜索 | `GET /api/enterprises/search` | `fields` 映射范围 |
| 高级筛选 | `POST /api/advance-search-v2` | multipart filter |
| 联系人 | `GET /api/lead/query-contacts?enterprise_id=` | 未解锁返回空 |
| 解锁 | `PUT /api/lead/unlock` | source=4 |
| 企业详情 | `GET /enterprise-details/{id}/...` | DOM/接口待接 |
| 联想 | `GET /api/enterprise-names/search` | 名称联想 |

字段映射：
- `_id` → `CompanySummary.id`
- `socialCreditCode` → `uscc`
- `regCapital.value` / `regCapital_value` → `regCapital.value`
- `foundTime` → `foundTime`
- `operStatus` → `operStatus`
- `contactNumber` → `contactCount`
- `lead.join_time` 存在 → `unlocked=true`
- `contactType` 0/1/2 → `mobile`/`phone`/`email`
- `contact_label` → `ContactItem.value`

---

## 10. 配置（Config）

来源优先级：CLI 参数 > 环境变量 > `~/.tanji-client/config.json` > 默认值。

| 配置项 | env | 默认 | 说明 |
| --- | --- | --- | --- |
| baseUrl | `TANJI_BASE_URL` | `https://sales.tungee.com` | 拓客站点 |
| loginUrl | `TANJI_LOGIN_URL` | `https://user.tungee.com/users/sign-in` | 登录页 |
| phone/password | `TANJI_PHONE`/`TANJI_PASSWORD` | — | 登录凭据 |
| profileDir | `TANJI_PROFILE_DIR` | `~/.tanji-client/profile` | cloak userDataDir |
| headless | `TANJI_HEADLESS` | `true` | 是否无头 |
| browserChannel | `TANJI_BROWSER_CHANNEL` | `cloak` | `cloak`/`chrome` |
| apiToken | `TANJI_API_TOKEN` | `change-me` | REST/MCP 鉴权 |
| host/port | `TANJI_HOST`/`TANJI_PORT` | `127.0.0.1`/`8787` | REST 监听 |
| cache.dbPath | `TANJI_CACHE_DB` | `~/.tanji-client/cache.db` | SQLite |
| cache.detailTtlSec | `TANJI_CACHE_DETAIL_TTL` | 604800（7d） | 详情 TTL |
| cache.listTtlSec | `TANJI_CACHE_LIST_TTL` | 86400（1d） | 列表/查询 TTL |
| session.heartbeatSec | `TANJI_HEARTBEAT_SEC` | 300 | 心跳 |
| session.ratePerMin | `TANJI_RATE_PER_MIN` | 20 | 总限频（priority+bulk 共享） |
| session.priorityReserve | `TANJI_PRIORITY_RESERVE` | 5 | 为解锁/登录预留的令牌数 |
| session.bulkQueueMax | `TANJI_BULK_QUEUE_MAX` | 12 | 读请求等待队列上限（超出 429） |
| session.maxPages | `TANJI_MAX_PAGES` | 5 | 翻页上限 |
| session.requestTimeoutMs | `TANJI_REQUEST_TIMEOUT_MS` | 30000 | 超时 |
| logLevel | `TANJI_LOG_LEVEL` | `info` | 日志级别 |
| log.file | `TANJI_LOG_FILE` | `~/.tanji-client/logs/tanji.log` | JSONL 日志文件 |
| log.maxBytes | `TANJI_LOG_MAX_BYTES` | 10MB | 单文件上限，超过即轮转 |
| log.keep | `TANJI_LOG_KEEP` | 5 | 保留历史日志份数 |
| log.stdout | `TANJI_LOG_STDOUT` | true | 是否同时输出 stdout |
| accounts | —（config.json） | `[]` | 多账号：`[{id, phone, password, profileDir?, cacheDb?, port?}]` |
| — | `TANJI_ACCOUNT` | — | 默认账号 id（多账号时） |

完整 schema：`src/config/schema.ts`，JSON Schema 由 `z.toJSONSchema` 可导出。

---

## 11. 缓存（SQLite）

数据库：`~/.tanji-client/cache.db`（`node:sqlite`，WAL）。

```sql
CREATE TABLE companies (        -- 企业摘要
  id TEXT PRIMARY KEY, name TEXT NOT NULL, json TEXT NOT NULL, fetched_at INTEGER NOT NULL);
CREATE TABLE company_details (  -- 企业详情
  id TEXT PRIMARY KEY, name TEXT NOT NULL, json TEXT NOT NULL, fetched_at INTEGER NOT NULL);
CREATE TABLE contacts (         -- 联系人
  company_id TEXT PRIMARY KEY, json TEXT NOT NULL, fetched_at INTEGER NOT NULL);
CREATE TABLE search_results (   -- 搜索/翻页结果页缓存
  cache_key TEXT PRIMARY KEY, json TEXT NOT NULL, fetched_at INTEGER NOT NULL);
CREATE TABLE queries (          -- 查询会话（翻页用）
  query_id TEXT PRIMARY KEY, kind TEXT NOT NULL, request_json TEXT NOT NULL,
  total INTEGER NOT NULL, fetched_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE cache_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
```

- TTL 判断在读取时进行（`fetched_at + ttl`）。
- 命中统计：`hits/misses` 进程内累计，`/v1/cache/stats` 返回。
- `node:sqlite` 不可用时自动降级内存缓存（`TANJI_CACHE_DRIVER=memory` 可强制）。

---

## 12. 日志

- JSONL 文件日志：默认 `~/.tanji-client/logs/tanji.log`，按 10MB 轮转、保留 5 份（`.1` … `.5`），可同时输出 stdout。
- 事件示例：`app.created`、`session.started`、`session.login`、`session.heartbeat`、`session.relogin.*`、`serve.listening`、`http.access`。
- 字段：`ts, level, event, ...`；访问日志含 `op, requestId, method, path, status, tookMs, code?`。
- 密码/token/cookie/authorization 自动脱敏；手机号显示为 `156****0075`。
- 日志写失败不影响主流程；systemd 下 journal 也保留 stdout。

---

## 13. 生成与校验

```bash
npm run gen        # 生成 data/filter-registry.json + spec/**
npm run gen:check  # 校验 spec 是否与代码漂移（CI）
npm test           # schema / operations / spec 一致性测试
npm run typecheck  # 全量类型检查
npm run build      # 产出 dist/
```

产物清单（`spec/`，52 个文件；REST 服务启动后可通过 `GET /docs`、`GET /openapi.json`、`GET /mcp-tools.json`、`GET /docs?format=json` 访问）：
- `openapi.json`（12 条路径 / 24 个 schema）
- `mcp-tools.json`（12 个工具）
- `cli-commands.json`（12 个命令）
- `schemas/*.json`（24 个领域模型）
- `operations/<id>.request.json` / `.response.json`（每操作请求/响应 envelope）

---

## 14. 已知限制 / 下一步

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 登录流程（账号密码 + SSO + 验证码） | ✅ | 支持 `--interactive` 人工过验证码 |
| 企业详情抓取 | ✅ | 7 接口并行；支持 `sections` 轻量模式 |
| 各控件类型 filter 映射 | ✅ 通用实现 | 4 种已抓包验证；其余按前端规则推断 |
| CLI 详细 help / REST docs | ✅ | `tanji help`/`tanji docs` + `/docs`、`/openapi.json` |
| 限频队列 / 优先级 / 背压 | ✅ | priority/bulk 双通道、预留令牌、bulk 队列上限 429 |
| 单实例文件锁 | ✅ | 防同 profile 双开 |
| 心跳与自动重登 | ✅ | 心跳 + needs_human 自动重登 |
| 日志文件轮转 | ✅ | JSONL + 大小轮转 + 脱敏 |
| 多账号 / 常驻 | ✅ | 进程级多账号 + systemd/daemon |
| SKILL | ✅ | `skills/tanji/SKILL.md` |

---

## 15. 调用示例

```bash
# 启动服务
TANJI_API_TOKEN=secret npm run dev -- serve --port 8787

# 健康检查
curl http://127.0.0.1:8787/v1/health

# 状态（需 token）
curl -H 'Authorization: Bearer secret' http://127.0.0.1:8787/v1/status

# 名称搜索
curl -X POST http://127.0.0.1:8787/v1/search/name \
  -H 'Authorization: Bearer secret' -H 'content-type: application/json' \
  -d '{"name":"团车","field":"name","page":1,"pageSize":20,"maxPages":5}'

# 高级筛选
curl -X POST http://127.0.0.1:8787/v1/search/advance \
  -H 'Authorization: Bearer secret' -H 'content-type: application/json' \
  -d '{"filters":{"relation":"all","conditions":[{"key":"industriesV2","op":"anyOf","value":["制造业"]}]},"page":1,"pageSize":20,"maxPages":5}'

# 筛选条件注册表
curl -H 'Authorization: Bearer secret' 'http://127.0.0.1:8787/v1/filters/registry?category=风险信息'
```

```bash
# CLI
tanji health
tanji status
tanji search name --name 团车 --field name
tanji search advance --filter '{"relation":"all","conditions":[{"key":"industriesV2","op":"anyOf","value":["制造业"]}]}'
tanji filters registry --category 风险信息
tanji cache stats

# MCP（配置到 Claude/Codex 等）
tanji mcp
```
