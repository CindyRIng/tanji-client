/**
 * 企业领域模型
 */
import { z } from 'zod';
import { CompanyIdSchema, DateOnlySchema, IsoDateTimeSchema, UrlSchema, UsccSchema } from './common.js';

export const EntityTypeSchema = z.enum(['enterprise', 'person', 'unknown']).meta({ id: 'EntityType' });

export const RegCapitalSchema = z
  .object({
    value: z.number().nonnegative().meta({ description: '金额数值（人民币元）' }),
    coinType: z.string().default('人民币').meta({ description: '币种' }),
    text: z.string().optional().meta({ description: '展示文本，如“108万人民币”' }),
  })
  .meta({ id: 'RegCapital' });

export const IndustrySchema = z
  .object({
    first: z.string().optional().meta({ description: '一级行业' }),
    second: z.string().optional().meta({ description: '二级行业' }),
    third: z.string().optional().meta({ description: '三级行业' }),
    fourth: z.string().optional().meta({ description: '四级行业' }),
  })
  .meta({ id: 'Industry' });

export const CompanyScaleSchema = z
  .object({
    min: z.number().int().nonnegative().optional(),
    max: z.number().int().nonnegative().optional(),
    text: z.string().optional().meta({ description: '展示文本，如“100-499人”' }),
  })
  .meta({ id: 'CompanyScale' });

/** 列表项（搜索/高级筛选返回的企业摘要） */
export const CompanySummarySchema = z
  .object({
    id: CompanyIdSchema,
    name: z.string().min(1),
    entityType: EntityTypeSchema.default('enterprise'),
    uscc: UsccSchema.optional(),
    legalRepresentative: z.string().optional(),
    regCapital: RegCapitalSchema.optional(),
    foundTime: DateOnlySchema.optional(),
    address: z.string().optional(),
    province: z.string().optional(),
    operStatus: z.string().optional().meta({ description: '登记状态，如“营业 > 存续”' }),
    industry: IndustrySchema.optional(),
    scale: CompanyScaleSchema.optional(),
    annualTurnover: z.string().optional().meta({ description: '年营业额区间文本' }),
    homepage: UrlSchema.or(z.string().min(1)).optional(),
    phoneCount: z.number().int().nonnegative().optional(),
    emailCount: z.number().int().nonnegative().optional(),
    contactCount: z.number().int().nonnegative().optional().meta({ description: '联系方式总数' }),
    unlocked: z.boolean().optional().meta({ description: '当前账号是否已解锁该企业' }),
    tags: z.array(z.string()).default([]).meta({ description: '标签，如 高新企业/专精特新/上市' }),
    listedTags: z.array(z.string()).default([]).meta({ description: '上市标签，如 美股(TC)/新三板' }),
    score: z.number().optional().meta({ description: '搜索相关度分' }),
    rankScore: z.number().optional(),
    highlight: z.record(z.string(), z.array(z.string())).optional().meta({ description: '高亮片段' }),
    updatedAt: IsoDateTimeSchema.optional(),
  })
  .meta({ id: 'CompanySummary', description: '企业列表项' });

export type CompanySummary = z.infer<typeof CompanySummarySchema>;

export const ShareholderSchema = z
  .object({
    name: z.string(),
    ratio: z.number().optional().meta({ description: '持股比例（%）' }),
    subscribedAmount: z.number().optional(),
    subscribedDate: DateOnlySchema.optional(),
    isControlling: z.boolean().optional(),
  })
  .meta({ id: 'Shareholder' });

export const KeyPersonSchema = z
  .object({
    name: z.string(),
    position: z.string().optional(),
    ratio: z.number().optional(),
  })
  .meta({ id: 'KeyPerson' });

export const CompanyDetailSectionSchema = z
  .enum(['basic', 'detail', 'holders', 'members', 'invests', 'branches', 'alterations'])
  .meta({ id: 'CompanyDetailSection', description: '企业详情分段：basic/detail/holders/members/invests/branches/alterations' });

export type CompanyDetailSection = z.infer<typeof CompanyDetailSectionSchema>;

/** 企业详情（搜索结果/详情的完整模型） */
export const CompanyDetailSchema = CompanySummarySchema.extend({
  businessScope: z.string().optional().meta({ description: '经营范围' }),
  registrationAuthority: z.string().optional().meta({ description: '登记机关' }),
  approvedAt: DateOnlySchema.optional().meta({ description: '核准日期' }),
  companyType: z.string().optional().meta({ description: '公司类型' }),
  registrationNumber: z.string().optional().meta({ description: '注册号' }),
  organizationCode: z.string().optional().meta({ description: '组织机构代码' }),
  englishName: z.string().optional(),
  insuredCount: z.number().int().nonnegative().optional().meta({ description: '参保人数' }),
  paidInCapital: z.number().nonnegative().optional().meta({ description: '实缴资本（元）' }),
  operatingPeriod: z.string().optional().meta({ description: '营业期限' }),
  shareholders: z.array(ShareholderSchema).default([]),
  keyPeople: z.array(KeyPersonSchema).default([]),
  officeAddresses: z.array(z.string()).default([]),
  branchCount: z.number().int().nonnegative().optional(),
  investmentCount: z.number().int().nonnegative().optional(),
  changeCount: z.number().int().nonnegative().optional(),
  annualReportYears: z.array(z.number().int()).default([]),
  formerNames: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  extra: z.record(z.string(), z.unknown()).default({}).meta({ description: '未建模的原始字段' }),
  fetchedAt: IsoDateTimeSchema.optional(),
  cached: z.boolean().default(false).meta({ description: '是否命中本地缓存' }),
  sections: z.array(CompanyDetailSectionSchema).optional().meta({ description: '本次实际拉取的分段；缺省/全量表示完整详情' }),
  partial: z.boolean().default(false).meta({ description: '是否为分段（轻量）结果' }),
}).meta({ id: 'CompanyDetail', description: '企业详情' });

export type CompanyDetail = z.infer<typeof CompanyDetailSchema>;
