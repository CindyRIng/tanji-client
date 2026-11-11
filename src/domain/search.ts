/**
 * 搜索 / 列表领域模型
 */
import { z } from 'zod';
import { CompanyDetailSectionSchema, CompanySummarySchema } from './company.js';
import { DateOnlySchema, MaxPagesSchema, PageSchema, PageSizeSchema } from './common.js';
import { FilterGroupSchema } from './filters.js';

/** 名称搜索可命中字段（对应企业查询的 6 个范围） */
export const SearchFieldSchema = z
  .enum(['all', 'name', 'legalRepresentative', 'address', 'socialCreditCode', 'contact'])
  .default('all')
  .meta({ id: 'SearchField', description: '搜索命中字段：all/企业名称/人名/地址/统一码/联系方式' });

export const SortFieldSchema = z
  .enum(['score', 'name', 'regCapital', 'foundTime', 'contactCount'])
  .default('score')
  .meta({ id: 'SortField' });

export const SortSpecSchema = z
  .object({
    field: SortFieldSchema,
    direction: z.enum(['asc', 'desc']).default('desc'),
  })
  .meta({ id: 'SortSpec' });

export const SearchNameRequestSchema = z
  .object({
    name: z.string().min(1).max(200).meta({ description: '企业名称/人名/地址/统一码/联系方式关键词' }),
    field: SearchFieldSchema,
    page: PageSchema,
    pageSize: PageSizeSchema,
    maxPages: MaxPagesSchema,
    sort: SortSpecSchema.optional(),
    refresh: z.boolean().default(false).meta({ description: 'true=忽略缓存强制请求上游' }),
  })
  .meta({ id: 'SearchNameRequest' });

export const SearchAdvanceRequestSchema = z
  .object({
    filters: FilterGroupSchema,
    page: PageSchema,
    pageSize: PageSizeSchema,
    maxPages: MaxPagesSchema,
    sort: SortSpecSchema.optional(),
    refresh: z.boolean().default(false).meta({ description: 'true=忽略缓存强制请求上游' }),
  })
  .meta({ id: 'SearchAdvanceRequest' });

/** 查询会话 ID：用于后续翻页（服务端持有原始查询条件） */
export const QueryIdSchema = z
  .string()
  .regex(/^q_[0-9]{8,}_[0-9a-z]{4,}$/)
  .meta({ description: '查询会话 ID，如 q_20261109_ab12cd' });

export const SearchResultSchema = z
  .object({
    queryId: QueryIdSchema,
    companies: z.array(CompanySummarySchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    hasMore: z.boolean(),
    pagesFetched: z.number().int().nonnegative().default(1).meta({ description: '本次实际请求的上游页数' }),
    cached: z.boolean().default(false),
    tookMs: z.number().int().nonnegative(),
    warnings: z.array(z.string()).default([]),
  })
  .meta({ id: 'SearchResult', description: '搜索结果（含分页与缓存信息）' });

export type SearchResult = z.infer<typeof SearchResultSchema>;

export const CompaniesListRequestSchema = z
  .object({
    queryId: QueryIdSchema,
    page: PageSchema,
    pageSize: PageSizeSchema,
    refresh: z.boolean().default(false).meta({ description: 'true=忽略缓存强制请求上游' }),
  })
  .meta({ id: 'CompaniesListRequest' });

export const CompaniesDetailRequestSchema = z
  .object({
    id: z.string().min(1).meta({ description: '企业 ID（_id）或统一社会信用代码' }),
    refresh: z.boolean().default(false).meta({ description: 'true=忽略缓存强制刷新' }),
    sections: z.array(CompanyDetailSectionSchema).default([]).meta({
      description: '按段拉取（basic/detail/holders/members/invests/branches/alterations）；空=完整详情；轻量=basic,detail',
    }),
  })
  .meta({ id: 'CompaniesDetailRequest' });

export const ContactsListRequestSchema = z
  .object({
    id: z.string().min(1).meta({ description: '企业 ID（_id）' }),
    refresh: z.boolean().default(false),
    types: z
      .array(z.enum(['mobile', 'phone', 'email']))
      .default([])
      .meta({ description: '过滤联系人类型，空=全部' }),
  })
  .meta({ id: 'ContactsListRequest' });

/** 统一列表项（兼容不同来源） */
export const EntityRefSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    entityType: z.enum(['enterprise', 'person', 'brand', 'unknown']).default('enterprise'),
  })
  .meta({ id: 'EntityRef' });

export type SearchField = z.infer<typeof SearchFieldSchema>;
export type SortSpec = z.infer<typeof SortSpecSchema>;
export type SearchNameRequest = z.infer<typeof SearchNameRequestSchema>;
export type SearchAdvanceRequest = z.infer<typeof SearchAdvanceRequestSchema>;
export type QueryId = z.infer<typeof QueryIdSchema>;
export type CompaniesListRequest = z.infer<typeof CompaniesListRequestSchema>;
export type CompaniesDetailRequest = z.infer<typeof CompaniesDetailRequestSchema>;
export type ContactsListRequest = z.infer<typeof ContactsListRequestSchema>;
export type EntityRef = z.infer<typeof EntityRefSchema>;
