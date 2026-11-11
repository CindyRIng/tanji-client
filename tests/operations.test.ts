import { describe, expect, it } from 'vitest';
import { OPERATIONS, mcpTools } from '../src/api/operations.js';
import { ERROR_CATALOG, ErrorCodeSchema, type ErrorCode } from '../src/errors/catalog.js';
import fs from 'node:fs';

describe('operations registry', () => {
  it('has unique ids', () => {
    const ids = OPERATIONS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('every operation has a response schema and valid errors', () => {
    for (const op of OPERATIONS) {
      expect(op.response).toBeTruthy();
      for (const code of op.errors) {
        expect(ErrorCodeSchema.safeParse(code).success).toBe(true);
        expect(ERROR_CATALOG[code]).toBeTruthy();
      }
    }
  });
  it('rest paths are unique per method', () => {
    const keys = OPERATIONS.map((o) => `${o.rest.method} ${o.rest.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('mcp tools are unique and mapped to operations', () => {
    const tools = mcpTools();
    expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length);
    for (const t of tools) {
      expect(OPERATIONS.some((o) => o.id === t.operationId && o.mcp?.tool === t.name)).toBe(true);
    }
  });
  it('covers the required core operations', () => {
    const ids = new Set(OPERATIONS.map((o) => o.id));
    for (const id of [
      'health.get',
      'status.get',
      'session.login',
      'search.name',
      'search.advance',
      'companies.list',
      'companies.detail',
      'contacts.list',
      'companies.unlock',
      'cache.stats',
      'cache.clear',
      'filters.registry',
    ]) {
      expect(ids.has(id), `missing operation ${id}`).toBe(true);
    }
  });
});

describe('generated specs', () => {
  it('openapi.json contains every operation path', () => {
    const spec = JSON.parse(fs.readFileSync(new URL('../spec/openapi.json', import.meta.url), 'utf-8')) as {
      openapi: string;
      paths: Record<string, Record<string, unknown>>;
      components: { securitySchemes: Record<string, unknown> };
    };
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.components.securitySchemes.bearerAuth).toBeTruthy();
    const covered = new Set(
      Object.entries(spec.paths).flatMap(([p, methods]) =>
        Object.keys(methods).map((m) => `${m.toUpperCase()} ${p}`),
      ),
    );
    for (const op of OPERATIONS) {
      expect(covered.has(`${op.rest.method} ${op.rest.path}`), `missing ${op.id}`).toBe(true);
    }
  });
  it('mcp-tools.json matches registry', () => {
    const spec = JSON.parse(fs.readFileSync(new URL('../spec/mcp-tools.json', import.meta.url), 'utf-8')) as {
      tools: Array<{ name: string; inputSchema: unknown }>;
    };
    expect(spec.tools).toHaveLength(mcpTools().length);
    for (const t of spec.tools) expect(t.inputSchema).toBeTruthy();
  });
  it('cli-commands.json covers all cli bindings', () => {
    const spec = JSON.parse(fs.readFileSync(new URL('../spec/cli-commands.json', import.meta.url), 'utf-8')) as {
      commands: Array<{ operationId: string }>;
    };
    const expected = OPERATIONS.filter((o) => o.cli).map((o) => o.id);
    expect(new Set(spec.commands.map((c) => c.operationId))).toEqual(new Set(expected));
  });
});
