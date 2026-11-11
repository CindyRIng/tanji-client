/**
 * 筛选条件注册表加载器（data/filter-registry.json），供 filter 构建器查询 action/input 类型
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FilterRegistrySchema, type FilterRegistry, type FilterRegistryEntry } from '../../domain/filters.js';
import type { FilterEntryLookup } from './filter-builder.js';

let cache: Map<string, FilterRegistryEntry> | null = null;

export function loadFilterRegistry(): FilterRegistry {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, '..', '..', '..', 'data', 'filter-registry.json'),
    path.join(process.cwd(), 'data', 'filter-registry.json'),
  ];
  const file = candidates.find((p) => fs.existsSync(p));
  if (!file) throw new Error('filter registry not found; run `npm run gen`');
  return FilterRegistrySchema.parse(JSON.parse(fs.readFileSync(file, 'utf-8')));
}

export function filterEntryMap(): Map<string, FilterRegistryEntry> {
  if (cache) return cache;
  const registry = loadFilterRegistry();
  const map = new Map<string, FilterRegistryEntry>();
  for (const cat of registry.categories) {
    for (const sub of cat.subCategories) {
      for (const e of sub.entries) {
        if (!map.has(e.key)) map.set(e.key, e);
      }
    }
  }
  for (const e of registry.hiddenEntries) if (!map.has(e.key)) map.set(e.key, e);
  for (const e of registry.uncategorizedEntries) if (!map.has(e.key)) map.set(e.key, e);
  cache = map;
  return map;
}

export function filterEntryLookup(): FilterEntryLookup {
  const map = filterEntryMap();
  return (key: string) => map.get(key);
}
