import { describe, expect, it } from 'vitest';
import { docsJsonResponse, readMcpToolsJson, readOpenApiJson, renderDocsHtml } from '../src/transports/rest/docs.js';
import { OPERATIONS } from '../src/api/operations.js';
import { ERROR_CATALOG } from '../src/errors/catalog.js';

describe('REST /docs', () => {
  it('html covers every operation', () => {
    const html = renderDocsHtml();
    for (const op of OPERATIONS) {
      expect(html, op.id).toContain(op.id);
      expect(html, op.rest.path).toContain(op.rest.path);
    }
  });
  it('html contains error catalog and envelope note', () => {
    const html = renderDocsHtml();
    expect(html).toContain('AUTH_REQUIRED');
    expect(html).toContain('envelope');
    expect(html).toContain('Bearer');
  });
  it('docs json describes all operations + error catalog', () => {
    const d = docsJsonResponse() as {
      operations: Array<{ id: string; requestFields: unknown[] }>;
      errorCatalog: Array<{ code: string }>;
    };
    expect(d.operations).toHaveLength(OPERATIONS.length);
    expect(d.errorCatalog.length).toBe(Object.keys(ERROR_CATALOG).length);
    const search = d.operations.find((o) => o.id === 'search.name');
    expect(search).toBeTruthy();
  });
  it('openapi.json and mcp-tools.json are readable', () => {
    const oa = readOpenApiJson() as { openapi: string; paths: Record<string, unknown> };
    expect(oa.openapi).toBe('3.1.0');
    expect(Object.keys(oa.paths)).toHaveLength(OPERATIONS.length);
    const mcp = readMcpToolsJson() as { tools: unknown[] };
    expect(mcp.tools).toHaveLength(OPERATIONS.filter((o) => o.mcp).length);
  });
});
