# tanji-client 接口产物（自动生成，勿手改）

由 `npm run gen` 从 `src/domain/*` 与 `src/api/operations.ts` 生成。

| 文件 | 说明 |
| --- | --- |
| `openapi.json` | OpenAPI 3.1（REST） |
| `mcp-tools.json` | MCP 工具清单与 inputSchema |
| `cli-commands.json` | CLI 命令清单 |
| `schemas/*.json` | 领域模型 JSON Schema |
| `operations/*.request.json` / `*.response.json` | 每个操作的请求/响应 schema |

操作数：13；模型数：23；筛选条件：345（另有 11 隐藏、23 未分类）。

