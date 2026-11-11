/**
 * MCP 后端选择：
 * - 默认 remote：MCP 只是 REST 代理，不打开浏览器、不碰 profile；
 * - --local：显式本地 App，仅开发/无服务场景使用（会独占 profile）。
 */
import { createApp, type App } from '../app.js';
import { loadConfig } from '../config/schema.js';
import { resolveAccount } from '../accounts/config.js';
import { invoke, type InvocationInput, type InvocationResult } from '../api/dispatch.js';
import { RemoteTanjiClient, serviceBaseUrl } from '../remote/client.js';

export type McpBackendMode = 'remote' | 'local';

export interface McpBackend {
  mode: McpBackendMode;
  serviceUrl?: string;
  invoke(operationId: string, input: InvocationInput): Promise<InvocationResult>;
  close(): Promise<void>;
}

export interface CreateMcpBackendOptions {
  mode?: McpBackendMode;
  url?: string;
  configPath?: string;
  accountId?: string;
}

export async function createMcpBackend(opts: CreateMcpBackendOptions = {}): Promise<McpBackend> {
  const mode = opts.mode ?? 'remote';

  if (mode === 'local') {
    const app: App = await createApp({
      configPath: opts.configPath,
      accountId: opts.accountId,
      logToStdout: false,
    });
    return {
      mode: 'local',
      invoke: (operationId, input) => invoke(app.service, operationId, input),
      close: () => app.close(),
    };
  }

  const base = loadConfig({ configPath: opts.configPath });
  const resolved = resolveAccount(base, opts.accountId);
  const client = new RemoteTanjiClient(resolved.config, opts.url ?? serviceBaseUrl(resolved.config));
  return {
    mode: 'remote',
    serviceUrl: client.baseUrl,
    invoke: (operationId, input) => client.invoke(operationId, input),
    close: async () => {},
  };
}
