import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigSchema } from '../src/config/schema.js';
import { RemoteTanjiClient, serviceBaseUrl } from '../src/remote/client.js';
import { createMcpBackend } from '../src/mcp/backend.js';
import { TanjiError } from '../src/errors/catalog.js';

const cfg = ConfigSchema.parse({ host: '127.0.0.1', port: 8787, apiToken: 'test-token-123' });

afterEach(() => vi.unstubAllGlobals());

describe('remote client', () => {
  it('resolves service url', () => {
    expect(serviceBaseUrl(cfg)).toBe('http://127.0.0.1:8787');
    expect(serviceBaseUrl(cfg, 'http://localhost:9999/')).toBe('http://localhost:9999');
    process.env.TANJI_CLIENT_URL = 'http://127.0.0.1:7777';
    expect(serviceBaseUrl(cfg)).toBe('http://127.0.0.1:7777');
    delete process.env.TANJI_CLIENT_URL;
  });

  it('builds path/query/body/auth', () => {
    const client = new RemoteTanjiClient(cfg);
    const detail = client.buildRequest('companies.detail', {
      pathParams: { id: 'a b' },
      query: { refresh: true, sections: ['basic', 'detail'] },
    });
    expect(detail.url).toBe('http://127.0.0.1:8787/v1/companies/a%20b?refresh=true&sections=basic%2Cdetail');
    expect((detail.init.headers as Record<string, string>).authorization).toBe('Bearer test-token-123');
    const search = client.buildRequest('search.name', { body: { name: '团车' } });
    expect(search.init.method).toBe('POST');
    expect(search.init.body).toBe(JSON.stringify({ name: '团车' }));
  });

  it('maps success envelope and api error', async () => {
    const client = new RemoteTanjiClient(cfg);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { x: 1 }, meta: { cached: true } }), { status: 200 })),
    );
    const result = await client.invoke('health.get', {});
    expect(result.data).toEqual({ x: 1 });
    expect(result.cached).toBe(true);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ok: false,
            data: null,
            meta: { requestId: 'r', tookMs: 1 },
            error: { code: 'SERVICE_UNAVAILABLE', message: 'down', retryable: true },
          }),
          { status: 503 },
        ),
      ),
    );
    await expect(client.invoke('health.get', {})).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });

  it('network failure becomes SERVICE_UNAVAILABLE', async () => {
    const client = new RemoteTanjiClient(cfg);
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('ECONNREFUSED'))));
    await expect(client.invoke('health.get', {})).rejects.toBeInstanceOf(TanjiError);
    await expect(client.invoke('health.get', {})).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });
});

describe('mcp backend', () => {
  it('defaults to remote and never creates a local app', async () => {
    const backend = await createMcpBackend({ mode: 'remote', url: 'http://127.0.0.1:8787' });
    expect(backend.mode).toBe('remote');
    expect(backend.serviceUrl).toBe('http://127.0.0.1:8787');
    await backend.close();
  });
});
