/**
 * zod schema → JSON Schema（OpenAPI 3.1 / MCP 共用）
 */
import { z } from 'zod';

export type JsonSchema = Record<string, unknown>;

export function toJsonSchema(schema: z.ZodTypeAny, io: 'input' | 'output' = 'input'): JsonSchema {
  const json = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io,
    unrepresentable: 'any',
  }) as JsonSchema;
  delete json.$schema;
  // zod 会把带 .meta({id}) 的 schema 生成为根 $ref + $defs；这里把根 ref 内联，
  // 保留 $defs 供嵌套引用（如 SortSpec/FilterGroup），便于 OpenAPI/MCP/文档消费。
  if (typeof json.$ref === 'string' && json.$defs && typeof json.$defs === 'object') {
    const defs = json.$defs as Record<string, JsonSchema>;
    const name = json.$ref.split('/').pop() ?? '';
    const target = defs[name];
    if (target) {
      const { $ref: _ref, $defs: _defs, ...rest } = json;
      return { ...target, ...rest, $defs: defs };
    }
  }
  return json;
}
