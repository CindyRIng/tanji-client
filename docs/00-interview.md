# Tanji Client 需求访谈记录（工作稿）
> 文档编号：00 ｜ 状态：历史工作稿（已归档） ｜ 最后更新：2026-11-09
> 记录需求访谈过程与决策，供追溯。


> 状态：访谈已完成（4 轮），产出 `docs/01-requirements.md` v0.1 草稿 + `docs/02-api-draft.md` v0.1。

## 0. 背景与已有上下文

- 目标：把「探迹 AI 拓客（网页版）」封装成一个**本地客户端**，基于 cloak browser 实现会话保活，并对外提供图示的检索/详情/状态/额度能力。
- 图（2026-11-09 提供）中的元素：tanji client 内的 cloak browser session、local cache；对外能力 name search / advance search / company list / company detail / check statues / credit session；接入形态 MCP / CLI / Rest；下游 SKILL。
- 环境中已确认：
  - `cloakbrowser` npm 包 v0.6.4（stealth Chromium，Playwright API，含 `human` 拟人化模块、`launchPersistentContext`、license 校验）。
  - `~/.local/share/cloakbrowser-lab/` 下有一套 BOSS 直聘自动化实验脚本（登录、验证码、详情抓取、翻页），可作为实现参考。
  - 笔记 `N2605153 M-Cloak Browser安装&CDP启动&维护`：Docker `cloakserve` + CDP `127.0.0.1:9222` 的启动方式。
  - 草图 `E2610301 孚盟销售系统V2`：tanji client 在 lead platform 生态中与 boss/zhilian/feige/fuma client 并列，下游连 Twenty CRM。当前需求已明确为**独立本地服务**，暂不直接写 CRM。

## 1. Round 1（范围类）

| 问题 | 结论 |
| --- | --- |
| 探迹入口 | **探迹 AI 拓客（网页版）** |
| 数据去向 / 生态角色 | **独立本地服务**，结果给 agent / 脚本消费，不直接写 CRM |
| 接入方式 | **纯浏览器自动化**，不依赖探迹官方 API |
| 账号与保活 | **单账号，7×24 在线，掉线自动重登** |
| v1 功能范围 | 名称搜索、高级搜索/多条件筛选、企业列表（分页/去重/导出）、企业详情、状态检查、额度/credit 查询、本地缓存 |
| 对外形态 | **CLI、REST、MCP server、SKILL 全要** |

## 2. Round 2（技术约束类）

| 问题 | 结论 |
| --- | --- |
| cloak 运行形态 | 宿主机 Node 进程直接 `launchPersistentContext`（profile 落本地） |
| 登录方式 | 手机号 + 密码自动登录 |
| 保活/重登 | 全自动：掉线自动重登，验证码尽量自动，失败才通知 |
| `check statues` | **登录态 + 剩余日额度/月额度**（用户自定义回答，非客户保护状态） |
| `credit session` | 账号额度查询 |
| `SKILL` 定位 | agent 技能包，内部调用 CLI/MCP |

## 3. Round 3（架构约束类）

| 问题 | 结论 |
| --- | --- |
| 技术栈 | Node.js + TypeScript |
| 运行平台 | Linux 常驻（systemd），默认 headless |
| 探迹入口 | 浏览器直接访问探迹网页 |
| 反爬策略 | cloak human 拟人化 + 随机延迟、限制请求频率、限制单次翻页/条数（不用代理） |
| 缓存 | SQLite：企业详情 + 搜索/列表结果；按企业唯一 ID/统一社会信用代码去重 |
| status 与 credit | 合并为一个 `status` 接口 |

## 4. Round 4（交付与细节）

| 问题 | 结论 |
| --- | --- |
| 导出 | **不导出文件**，只通过接口返回 JSON（覆盖 Round 1 的"导出"勾选） |
| 失败通知 | 本地结构化日志（不做 webhook/桌面通知/邮件） |
| 验证码兜底 | 全自动重试 + 失败后人工处理再恢复 |
| 本地控制台 | 不要，纯 CLI + REST |
| 高级搜索参数 | 结构化字段（非原样透传） |
| 文档形态 | 标准 PRD + Mermaid 图 + 接口草案，先草稿评审 |

## 5. 决策要点 / 矛盾处理

1. **导出冲突**：Round 1 勾选"导出"，Round 4 明确"不导出、只返回 JSON"→ 以 Round 4 为准，导出列 v2。
2. **status 合并**：`check status`（登录态 + 日/月额度）与 `credit`（额度）合并为单个 `status`。
3. **人工介入路径**：v1 只写日志；通过 `status.health=needs_human` + 日志发现，用 `tanji login --interactive` 人工恢复。
4. **免代理**：v1 不内置代理，仅保留配置位。

## 6. 产出物

- [`01-requirements.md`](./01-requirements.md)：PRD v0.1（架构图、功能/非功能需求、里程碑、验收标准、风险）。
- [`02-api-draft.md`](./02-api-draft.md)：统一响应包、数据模型、CLI/REST/MCP/SKILL 契约、配置项。
- 待用户确认事项见 PRD 第 10.2 节。

## 7. 探索阶段（2026-11-09）

已用 cloak 真实登录探迹并跑通「高级搜索 → 列表 → 详情 → 联系人 → 解锁 10 家 → headless 复验」，详细记录见 [`03-page-operations.md`](./03-page-operations.md)；
核心结论已回填 PRD 第 10.3 节。

## 8. 第二轮探索（2026-11-09 晚）

- 高级筛选：从 `lightweight-configs` + UI 逐类点击，整理出 12 类 / 345 个可见条件（含字段 key、控件、候选值），见 [`04-filter-catalog.md`](./04-filter-catalog.md)。
- 企业查询：摸清首页、搜索范围 `fields`、筛选参数 `filter`、结果字段与接口，见 [`05-enterprise-search.md`](./05-enterprise-search.md)。
- 批量查询、地图拓客：按用户要求跳过。

## 9. 工程落地（2026-11-09 晚）

- 建立 TS 工程骨架：zod 领域模型、12 个操作注册表、REST/CLI/MCP 传输层、SQLite 缓存、上游适配层、生成器（OpenAPI/JSON Schema/MCP tools/filter registry）。
- 接口规范见 [`06-api-spec.md`](./06-api-spec.md)；机器可读产物在 `spec/`；筛选条件注册表在 `data/filter-registry.json`。
- `npm run typecheck` / `npm test` / `npm run gen:check` 均通过。
