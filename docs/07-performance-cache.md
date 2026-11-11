# tanji-client 性能测试报告 & 缓存机制说明
> 文档编号：07 ｜ 状态：现行报告（v0.2 更新） ｜ 最后更新：2026-11-10
> 压测结果、调度优化与缓存机制说明。


> 测试对象：tanji-client v0.1.0（Node.js 22 + cloakbrowser 0.6.4 / Chromium 146 headless；2026-11-10 已升级到 0.6.5，引擎不变）
> 上游：探迹 AI 拓客 `sales.tungee.com`（真实账号、真实网络）
> 报告时间：2026-11-09
> 复现：见 §6

---

## 1. 测试环境

| 项 | 值 |
| --- | --- |
| 机器 | AMD Ryzen 7 5800H，16 vCPU，Linux 6.18.50 x86_64 |
| 运行时 | Node.js v22.23.2；`node:sqlite`（WAL） |
| 浏览器 | cloakbrowser 0.6.4（stealth Chromium 146），**headless**，持久化 profile |
| 客户端形态 | `tanji serve`（本地 REST，127.0.0.1），请求经 REST → service → 浏览器页面内 fetch → 探迹 |
| 数据库 | SQLite（WAL），`/tmp/tanji-bench-cache.db` |
| 限频 | **压测时 `TANJI_RATE_PER_MIN=0`（关闭本地限频，测上游上限）**；生产默认 20 次/分（约 0.33 rps） |
| 并发模型 | 上游请求在单浏览器页面内执行；本地缓存读取可并发 |
| 压测工具 | `src/bench/run.ts`（`npm run bench`），对 REST 端点计时，取 p50/p90/p99 与吞吐 |

> 说明：冷读（cold）= `refresh=true` 强制请求上游；热读（cached）= 同一查询/企业命中 SQLite 缓存。
> 每次样本都包含本地 REST 解析、zod 校验、SQLite 读取与 JSON 序列化开销。

---

## 2. 结果总览

### 2.1 单请求延迟与吞吐

| 场景 | n | p50 | p90 | p99 | 吞吐 |
| --- | --- | --- | --- | --- | --- |
| `GET /v1/status`（上游 2 次请求） | 10 | 195.1 ms | 212.3 ms | 402.9 ms | 4.6 rps |
| `POST /v1/search/name` 冷读 | 10 | 357.0 ms | 649.4 ms | 1015.0 ms | 2.3 rps |
| `POST /v1/search/name` 缓存命中 | 300 | **2.3 ms** | 2.7 ms | 4.4 ms | **424.3 rps** |
| `GET /v1/companies` 冷读（第 2 页） | 5 | 362.9 ms | 1076.9 ms | 1076.9 ms | 1.8 rps |
| `GET /v1/companies` 缓存命中 | 300 | **1.8 ms** | 2.2 ms | 2.8 ms | **541.5 rps** |
| `GET /v1/companies/{id}` 冷读（7 个上游接口并行） | 3 | 113.9 ms | 165.2 ms | 165.2 ms | 7.7 rps |
| `GET /v1/companies/{id}` 缓存命中 | 300 | **1.9 ms** | 2.2 ms | 2.8 ms | **418.4 rps** |
| `GET /v1/companies/{id}/contacts` 冷读 | 10 | 285.8 ms | 367.6 ms | 392.6 ms | 3.3 rps |
| `GET /v1/companies/{id}/contacts` 缓存命中 | 300 | **1.7 ms** | 2.0 ms | 2.6 ms | **571.4 rps** |

### 2.2 缓存读并发扩展（`company.detail` 缓存命中）

| 并发 | n | p50 | p90 | p99 | 吞吐 |
| --- | --- | --- | --- | --- | --- |
| 1 | 300 | 2.0 ms | 2.3 ms | 3.4 ms | 499.2 rps |
| 4 | 300 | 3.4 ms | 4.7 ms | 6.9 ms | **1,075.3 rps** |
| 16 | 300 | 13.3 ms | 19.3 ms | 42.6 ms | **1,079.1 rps** |

### 2.3 结论：最大读取速度

| 读取路径 | 实测上限 |
| --- | --- |
| **本地缓存命中（REST 层）** | **约 1,000–1,100 QPS**（4–16 并发；单并发约 420–570 QPS，单请求 ~2 ms） |
| 本地缓存命中（p99 视角） | 并发 4 时 p99 6.9 ms；并发 16 时 p99 42.6 ms（吞吐不再提升，尾延迟变差） |
| 上游冷读（真实探迹） | **约 2–8 QPS**：搜索/列表/联系人 2–3.5 rps，详情（7 接口并行）约 7.7 rps |
| 生产默认限频 | 20 次/分 ≈ 0.33 rps（本地令牌桶，防止风控/限流；压测已关闭） |

**解读**：
- 读性能的瓶颈分两段：**缓存命中受本地 REST+SQLite 限制（~1.1k QPS）**；**未命中受探迹响应与并发限制（2–8 QPS）**。
- 并发从 1 提升到 4 时吞吐翻倍，16 时不再提升（单进程 Node + SQLite 同步读 + HTTP 开销），建议缓存读并发控制在 **4–8**。
- 详情冷读虽是 7 个上游接口，但并行请求，p50 113.9 ms，比单接口冷读更快/相当；适合作为“按需补全”路径。
- 列表冷读 p90 出现 ~1s 抖动（探迹侧波动），生产应优先走缓存/降低翻页频率。

### 2.4 缓存统计（压测后）

```json
{
  "driver": "sqlite",
  "sizeBytes": 327680,
  "companyDetails": 3,
  "contacts": 7,
  "queries": 311,
  "searchResults": 8,
  "hits": 2100,
  "misses": 1,
  "hitRate": 0.9995
}
```

> 压测期间共约 2101 次缓存查询，命中率 **99.95%**；库文件约 **320 KB**（311 个 query 会话 + 8 个搜索页 + 3 个详情 + 7 个联系人）。
> 说明：`queries` 每个搜索/翻页会话写一条（TTL 24h），压测中高频生成；生产可按需清理。

---

## 3. 缓存机制（重点）

### 3.1 分层结构

```
agent/CLI/REST/MCP
        │
        ▼
  TanjiService（缓存 Key 计算、TTL 判断、refresh 控制）
        │  命中 ─────────────► 直接返回（cached=true，~2ms）
        ▼ 未命中
  CacheStore（SQLite / Memory，cache-aside 模式）
        │
        ▼
  TungeeApiClient（页面内 fetch，令牌桶限频）
        │
        ▼
  cloak 浏览器（登录态 profile） → 探迹 SaaS
```

- **浏览器 profile 层**：cookie/localStorage 持久化，保证会话保活（不属于 tanji-client 的“业务缓存”，但避免重复登录）。
- **进程内存层**：筛选条件注册表（345 条，启动后常驻）、限频令牌桶、SQLite 连接；无业务数据内存缓存。
- **SQLite 层（业务缓存）**：详情、联系人、搜索页、查询会话。
- **HTTP 层**：REST 不设置缓存头；客户端可通过 `refresh` 控制是否绕过。

### 3.2 缓存表与 TTL

| 表 | 主键 | 内容 | TTL（默认） | 说明 |
| --- | --- | --- | --- | --- |
| `company_details` | `id` | `CompanyDetail` JSON | 7 天（`TANJI_CACHE_DETAIL_TTL`） | 企业详情；含股东/人员/分支等 |
| `contacts` | `company_id` | `ContactList` JSON | 7 天（同上） | 仅缓存**已解锁**企业的联系人；未解锁不写缓存 |
| `search_results` | `sha1(query)` | 搜索页 JSON（companies/total/page/hasMore） | 1 天（`TANJI_CACHE_LIST_TTL`） | 名称搜索、高级筛选、翻页共用 |
| `queries` | `query_id` | 原始查询条件 + 总数 | 24h | 支撑 `companies.list` 翻页（queryId 过期则 404） |
| `companies` | `id` | 企业摘要 JSON | 预留 | 当前主要用 `search_results` 承载列表 |

> 表结构见 `docs/06 §11`；实现见 `src/cache/sqlite.ts`（WAL 模式）。

### 3.3 缓存 Key

| 操作 | Key |
| --- | --- |
| 名称搜索 | `sha1("name", 关键词, field, page, pageSize)` |
| 高级筛选 | `sha1("advance", filters 对象, page, pageSize)` |
| 翻页 | `sha1("list", queryId, page, pageSize)` |
| 详情 | `id`（探迹 `_id`） |
| 联系人 | `company_id` |

- 含查询条件的完整 JSON，条件/分页任一变化即不同 Key。
- 不含账号/环境维度：**一个 profile/账号对应一个缓存库**（多账号请用不同 `TANJI_CACHE_DB`）。

### 3.4 读路径（以详情为例）

```
GET /v1/companies/{id}
  → 鉴权/参数校验
  → service.companyDetail
      → cache.getCompanyDetail(id, TTL)
          ├─ fresh → 返回 { ..., cached: true }   （~2ms）
          └─ 未命中/过期
               → session.ensureStarted（懒启动浏览器）
               → Promise.all(basic + detail + holder + member + invest + branch + alteration)
               → mapper 合并 → CompanyDetail
               → cache.putCompanyDetail(...)
               → 返回 { cached: false }               （~110–400ms）
```

- 名称/高级筛选：先查 `search_results`；未命中再请求上游，并写 `search_results` + `queries`。
- 翻页：先查 `queries`（无则 404），再查 `search_results`；未命中请求上游并写回。
- 联系人：先查 `contacts`；未命中请求 `query-contacts`；只有 `unlocked=true` 才写缓存。

### 3.5 refresh 语义（强制绕缓存）

| 操作 | 参数 |
| --- | --- |
| 名称搜索 / 高级筛选 | body `refresh: true` |
| 翻页 | query `refresh=true` |
| 详情 | query `refresh=true` |
| 联系人 | query `refresh=true` |

`refresh=true` 只影响本次请求：先请求上游，写回缓存（覆盖旧值），响应 `cached=false`。

### 3.6 什么不缓存

- **status / 额度**：每次实时读取（额度会变化，必须准确）。
- **未解锁企业的联系人**：上游返回空，不写缓存（避免解锁后仍读到空）。
- **解锁操作**：不缓存，实时执行；成功后用最新联系人覆盖 contacts 缓存。
- **登录态**：由浏览器 profile 维护，不用业务缓存。
- **筛选条件注册表**：进程内存常驻（来自 `data/filter-registry.json`），不走 SQLite。

### 3.7 失效与清理

| 方式 | 说明 |
| --- | --- |
| TTL 过期 | 读取时判断 `fetched_at + ttl`；过期即视为 miss，后台无清理任务（惰性失效） |
| `refresh=true` | 单次强制刷新并覆盖 |
| `DELETE /v1/cache`（`{"all":true}` / `{"prefix":"..."}`） | 清空或按前缀清理；CLI `tanji cache clear --all` |
| 解锁成功 | 覆盖该企业 `contacts` 缓存 |
| 无 LRU/容量淘汰 | 目前仅 TTL + 手动清理；长期运行建议定期 `cache clear` 或按前缀清理 query 会话 |

### 3.8 一致性、并发与限制

- **单进程 + 单实例锁**：同一 `profileDir` 只允许一个进程（`.tanji.lock`），避免 SQLite 多写与浏览器 profile 冲突。
- **SQLite WAL**：读写并发友好；`node:sqlite` 为同步 API，缓存命中在事件循环内完成（因此单请求 ~2ms）。
- **上游串行**：同一浏览器页面内请求由令牌桶排队（默认 20/min），避免触发探迹风控；压测关闭限频才看到 2–8 QPS 上限。
- **调度（v0.2）**：priority（解锁/登录）优先并保留 `TANJI_PRIORITY_RESERVE` 个令牌；bulk（搜索/详情等）只能用剩余令牌，队列超过 `TANJI_BULK_QUEUE_MAX` 直接 429，防止读请求把解锁堵到分钟级。
- **缓存一致性**：详情/联系人 TTL 独立；企业信息变更最多延迟一个 TTL；需要实时数据用 `refresh=true`。
- **无跨进程共享**：多个 tanji-client 实例请使用不同 profile + 不同缓存库；不要把同一 SQLite 文件给多进程写。

### 3.9 缓存相关接口

```bash
tanji cache stats
tanji cache clear --all
tanji cache clear --prefix 37623

curl -H 'Authorization: Bearer <token>' http://127.0.0.1:8787/v1/cache/stats
curl -X DELETE -H 'Authorization: Bearer <token>' -H 'content-type: application/json' \
  -d '{"all":true}' http://127.0.0.1:8787/v1/cache
```

### 3.10 调度优化（v0.2，解锁慢的修复）

针对实测“批量详情把 20/min 令牌桶占满、解锁排队 90–105s”的问题，v0.2 做了三项调整：

1. **priority / bulk 双通道**：解锁、登录走 priority，优先出队且可使用预留令牌；搜索/翻页/详情/联系人走 bulk。
2. **预留令牌**：`TANJI_PRIORITY_RESERVE=5`，bulk 最多用 15 个；解锁最多等 1 个 token（约 3s），不会被批量读无限拖延。
3. **读请求背压**：bulk 队列超过 `TANJI_BULK_QUEUE_MAX=12` 时立即返回 `429 RATE_LIMITED` + `retryAfterMs`，不再排队几分钟。
4. **解锁瘦身**：默认只打 1 个上游调用（原来是 4 个：前后额度 + 解锁 + 联系人）；额度/联系人改为 `quota=true`/`contacts=true` 可选。
5. **详情分节**：`sections=basic,detail` 轻量模式只打 2 个上游调用（完整 7 个）。

预期（20/min 不变）：

| 场景 | 优化前 | 优化后 |
| --- | --- | --- |
| 解锁（饱和） | 4 token ≈ 12s | 1 token ≈ 3s（priority 通常 <1s） |
| 解锁（批量积压） | 88–105s | 有预留令牌时不排队；无令牌 ≤3s |
| 轻量详情 | 7 token ≈ 21s | 2 token ≈ 6s |
| 批量读 | 无上限排队 | 队列满 429，客户端退避 |

> 实测（2026-11-10 16:27，优化上线后）：默认解锁 8 次耗时 **204–395ms**（同期优化前为 88–105s）；轻量详情（2 接口）约 145–195ms（队列空闲时）。
> 注意：轻量详情结果不写缓存（避免覆盖完整详情）；完整缓存存在时轻量请求直接命中完整缓存。

---

## 4. 如何理解“最大读取速度”

- 如果你问的是**本地缓存读取**：约 **1,000–1,100 QPS**（4–16 并发，REST 层），单请求 p50 ≈ 2 ms。
  - 继续提升需要减少 REST/JSON 开销（例如进程内调用、HTTP keep-alive、压缩、批量化），或换更快的存储层。
- 如果你问的是**从探迹实时读取**：约 **2–8 QPS**（受探迹响应时间和风控约束），且生产默认限频为 20 次/分钟（≈0.33 QPS）以保账号安全。
- 实际业务建议：**冷读只发生一次，后续全部走缓存**；批量场景先 `search` 落缓存，再逐页/逐详情读取；需要最新数据时显式 `refresh`。

---

## 5. 优化建议（按收益排序）

1. **预热**：批量任务前先对目标查询/企业做一次冷读并缓存，后续读全部走缓存。
2. **控制 refresh**：只有确实需要最新数据才 refresh；列表翻页默认缓存。
3. **并发度 4–8**：缓存读并发 4 已到 ~1.07k QPS，16 只增加尾延迟。
4. **批量化**：如需更高吞吐，可在 service 层提供批量详情（一次请求多个企业，减少 HTTP 次数）；本轮未实现。
5. **缓存治理**：定期清理 `queries`（24h TTL 已惰性失效但不会自动删）；可按前缀 `cache clear`。
6. **上游保护**：保持默认限频 20/min；需要更高实时吞吐时再评估提额与风控成本。

---

## 6. 复现方法

```bash
# 1) 构建
npm run build

# 2) 确保 profile 已登录（或 bench 会自动用环境变量登录）
cd "$PROJECT_DIR"
DISPLAY=:0 ~/cloak-env/bin/cloak-run env \
  TANJI_PROFILE_DIR=$PWD/exploration/profile TANJI_PHONE=... TANJI_PASSWORD=... \
  node dist/bench/run.js
```

产物：`bench/results-<timestamp>.json`（含每项样本的延迟数组、错误、缓存统计）。

> 注意：benchmark 会关闭本地限频（`app.config.session.ratePerMin = 0`），仅用于测量上限；不要在生产常驻服务上这样设置。

---

## 7. 局限

- 数字依赖机器、网络、探迹服务端状态；不同时间点冷读延迟会波动（p90/p99 尤其明显）。
- 单账号/单浏览器串行模型，未测试多账号并行；多实例请隔离 profile 与缓存库。
- 详情冷读并行 7 个接口，若探迹后续限流/改版，数字会变化。
- 缓存命中吞吐受本机 Node/SQLite 限制；不是网络或探迹上限。
- 未做长时间（>1h）高并发压测与内存泄漏观察。
