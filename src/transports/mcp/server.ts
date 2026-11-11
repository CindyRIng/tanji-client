/**
 * MCP 传输层（stdio）：工具即 operations 中的 mcp 绑定，返回统一 envelope JSON
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { mcpTools, getOperation } from '../../api/operations.js';
import { invoke, type InvocationInput } from '../../api/dispatch.js';
import { asTanjiError } from '../../errors/catalog.js';
import { failureEnvelope, successEnvelope } from '../../schemas/envelope.js';
import { VERSION } from '../../service.js';
import type { App } from '../../app.js';
import { toJsonSchema } from '../../generators/json-schema.js';

const TOOL_MAP = new Map(mcpTools().map((t) => [t.name, t]));

export function createMcpServer(app: App): Server {
  const server = new Server({ name: 'tanji-client', version: VERSION }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: mcpTools().map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: toJsonSchema(t.input, 'input'),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = TOOL_MAP.get(request.params.name);
    const rid = `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const started = Date.now();
    if (!tool) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify(failureEnvelope({ code: 'NOT_FOUND', message: `unknown tool: ${request.params.name}`, retryable: false }, { requestId: rid, tookMs: 0 })),
          },
        ],
      };
    }
    try {
      const parsed = tool.input.safeParse(request.params.arguments ?? {});
      if (!parsed.success) throw parsed.error;
      const op = getOperation(tool.operationId);
      const input: InvocationInput = mcpArgsToInvocation(op.id, parsed.data as Record<string, unknown>);
      const result = await invoke(app.service, tool.operationId, input);
      const envelope = successEnvelope(result.data, {
        requestId: rid,
        tookMs: Date.now() - started,
        cached: result.cached ?? false,
        ...(result.pagination ? { pagination: result.pagination } : {}),
      });
      return { content: [{ type: 'text', text: JSON.stringify(envelope) }] };
    } catch (err) {
      const e = asTanjiError(err);
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify(failureEnvelope(e.toJSON(), { requestId: rid, tookMs: Date.now() - started })),
          },
        ],
      };
    }
  });

  return server;
}

/** MCP 的扁平入参 → REST 风格的 pathParams/query/body */
function mcpArgsToInvocation(operationId: string, args: Record<string, unknown>): InvocationInput {
  switch (operationId) {
    case 'companies.detail':
    case 'contacts.list': {
      const { id, ...rest } = args as { id: string };
      return { pathParams: { id }, query: rest, body: {} };
    }
    case 'companies.unlock': {
      const { id, ...rest } = args as { id: string };
      return { pathParams: { id }, body: rest };
    }
    case 'filters.registry': {
      return { query: args, body: {} };
    }
    case 'cache.clear':
    case 'session.login':
    case 'search.name':
    case 'search.advance':
      return { body: args };
    case 'companies.list':
      return { query: args, body: {} };
    default:
      return { query: args, body: {} };
  }
}

export async function startMcpServer(app: App): Promise<void> {
  const server = createMcpServer(app);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[mcp] tanji-client MCP server started (stdio)');
}

export { z };
