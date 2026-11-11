import { describe, expect, it } from 'vitest';
import { operationHelpText, operationsIndexText, rootHelpText } from '../src/transports/cli/help.js';
import { OPERATIONS } from '../src/api/operations.js';

describe('CLI help', () => {
  it('root help has usage, env, examples, exit codes and docs links', () => {
    const h = rootHelpText();
    for (const s of ['TANJI_API_TOKEN', 'tanji search name', '退出码', '/docs', 'tanji docs', 'AUTH_REQUIRED']) {
      expect(h, s).toContain(s);
    }
  });
  it('operation help renders request fields, response, errors and examples', () => {
    const h = operationHelpText('search.name');
    expect(h).toContain('POST /v1/search/name');
    expect(h).toContain('tanji_search_name');
    expect(h).toContain('name (body)');
    expect(h).toContain('field (body)');
    expect(h).toContain('AUTH_REQUIRED');
    expect(h).toContain('tanji search name --name');
  });
  it('unlock help warns quota', () => {
    const h = operationHelpText('companies.unlock');
    expect(h).toContain('消耗额度');
    expect(h).toContain('confirm');
  });
  it('index lists every operation id', () => {
    const idx = operationsIndexText();
    for (const op of OPERATIONS) expect(idx).toContain(op.id);
  });
});
