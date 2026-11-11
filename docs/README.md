# 文档索引

> 本目录存放 tanji-client 的需求、实测记录、接口规范、性能与部署文档。
> 阅读顺序与维护约定如下。

## 推荐阅读顺序

| 顺序 | 文档 | 适合谁 |
| --- | --- | --- |
| 1 | [README](../README.md) | 所有人先看项目概览与快速开始 |
| 2 | [06-接口规范](06-api-spec.md) | 接入 REST/CLI/MCP 的开发者 |
| 3 | [09-配置与环境](09-configuration.md) | 从零配置账号、共享浏览器环境、缓存 |
| 4 | [08-部署与常驻](08-deployment.md) | 部署、常驻、多账号运维 |
| 5 | [07-性能与缓存](07-performance-cache.md) | 关心吞吐、缓存、限频的人 |
| 6 | [04-高级筛选清单](04-filter-catalog.md) | 需要构造筛选条件的人 |
| 7 | [03-页面操作实录](03-page-operations.md) / [05-企业查询实录](05-enterprise-search.md) | 需要理解上游页面/接口的人 |
| 8 | [01-需求文档](01-requirements.md) / [00-访谈记录](00-interview.md) / [02-接口草案](02-api-draft.md) | 追溯设计背景（历史归档） |

## 文档状态

| 文档 | 状态 | 权威性 |
| --- | --- | --- |
| [00-interview](00-interview.md) | 历史归档 | 仅追溯 |
| [01-requirements](01-requirements.md) | 历史归档（PRD v0.1） | 功能范围参考 |
| [02-api-draft](02-api-draft.md) | 历史归档 | 以 06 为准 |
| [03-page-operations](03-page-operations.md) | 历史实录（已脱敏） | 上游页面/接口证据 |
| [04-filter-catalog](04-filter-catalog.md) | 实测清单 | filter registry 来源 |
| [05-enterprise-search](05-enterprise-search.md) | 历史实录 | 企业查询证据 |
| [06-api-spec](06-api-spec.md) | **现行规范 v1.0** | **API 契约以本文 + `spec/` 为准** |
| [07-performance-cache](07-performance-cache.md) | 现行报告 | 性能/缓存以本文为准 |
| [08-deployment](08-deployment.md) | 现行指南 | 部署以本文为准 |
| [09-configuration](09-configuration.md) | 现行指南 | 配置/环境变量以本文为准 |

## 文档约定

- 编号固定：00–05 为历史/实测，06–08 为现行规范；新增文档从 09 开始。
- 现行规范优先：接口字段、错误码、路由若与早期草案冲突，以 `06-api-spec.md` 和 `spec/openapi.json` 为准。
- 代码同步：修改 API/schema 后运行 `npm run gen`，并同步 `06-api-spec.md` 的变更说明。
- 脱敏：仓库内文档不包含账号密码、token、完整手机号、cookie、profile 或原始网络日志。
- 原始调研产物（截图、HTML、网络请求、探索脚本）不随仓库发布，仅在内部留存。
- 文档中的命令示例默认在项目根目录执行，共享浏览器环境路径见 [08-deployment](08-deployment.md)。

## 维护命令

```bash
npm run gen        # 重新生成 spec/（OpenAPI / MCP tools / CLI commands）与 data/filter-registry.json
npm run gen:check  # 校验生成物是否最新
npm test           # 文档测试会验证 OpenAPI/MCP/CLI 与 operations 一致
```
