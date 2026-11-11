/**
 * 探迹上游原始响应 schema（只建模 tanji-client 需要的字段，其余丢弃）
 */
import { z } from 'zod';

const Num = z.number();
const OptNum = z.number().nullable().optional();
const Str = z.string();
const OptStr = z.string().nullable().optional();

// 探迹 2026-11 起把 address 从字符串改成了对象（province/city/district/value）
const OptAddress = z
  .union([
    z.string(),
    z.object({ province: OptStr, city: OptStr, district: OptStr, value: OptStr }).partial(),
  ])
  .nullable()
  .optional();

export const RawRemainLeadSchema = z.object({
  stat: z.number().optional(),
  individual_month_remain_lead: Num,
  individual_month_limit_lead: Num,
  individual_day_remain_lead: Num,
  individual_day_limit_lead: Num,
  enterprise_month_remain_lead: Num,
  enterprise_month_limit_lead: Num,
  individual_nearly_seven_day_unlock_nums: OptNum,
  limit_settlement_type: OptNum,
});
export type RawRemainLead = z.infer<typeof RawRemainLeadSchema>;

export const RawInfoBarSchema = z.object({
  stat: OptNum,
  remain_day: OptNum,
  limit_lead: OptNum,
  remain_lead: OptNum,
  settlement_day: OptNum,
  greeting: OptStr,
});
export type RawInfoBar = z.infer<typeof RawInfoBarSchema>;

export const RawRegCapitalSchema = z.object({
  origin: OptStr,
  value: OptNum,
  coinType: OptStr,
});

export const RawLeadRefSchema = z.object({
  enterprise_id: OptStr,
  enterprise_name: OptStr,
  join_time: OptNum,
  has_been_released: z.boolean().optional(),
  creator: z.object({ name: OptStr }).partial().optional(),
});

/** 列表/搜索/高级筛选返回的企业原始字段（合并三处响应的并集） */
export const RawCompanySchema = z.object({
  _id: Str,
  name: Str,
  entity_type: OptStr,
  contactNumber: OptNum,
  mobileNumber: OptNum,
  regCapital: RawRegCapitalSchema.nullable().optional(),
  regCapital_value: OptNum,
  regCapital_coinType: OptStr,
  foundTime: OptStr,
  address: OptAddress,
  operStatus: OptStr,
  socialCreditCode: OptStr,
  regNumber: OptStr,
  enterpriseType: OptStr,
  homepage: OptStr,
  legalRepresentative: OptStr,
  annualTurnoverAlgValueV2: OptStr,
  firstIndustriesV2: z.array(Str).optional(),
  secondIndustriesV2: z.array(Str).optional(),
  thirdIndustriesV2: z.array(Str).optional(),
  fourthIndustriesV2: z.array(Str).optional(),
  enterpriseScaleAlgV2: z.object({ min: OptNum, max: OptNum }).partial().optional(),
  listedLabelList: z.array(Str).optional(),
  isHighTechEnterprise: OptNum,
  isSpecializedAndNewV2: OptNum,
  isSpecializedAndNewGiantV2: OptNum,
  isGazelleEnt: OptNum,
  isGazelleEnterprise: OptNum,
  isUnicornEnt: OptNum,
  isTechEnt: OptNum,
  isTechLittleGiant: OptNum,
  hasStock: OptNum,
  lead: RawLeadRefSchema.nullable().optional(),
  highlight: z.record(z.string(), z.array(Str)).nullable().optional(),
  score: OptNum,
  rank_score: OptNum,
  contact_data: z
    .array(
      z.object({
        contact: OptStr,
        contactName: OptStr,
        contactType: OptNum,
        contactSource: OptStr,
        contactChannelList: z.array(z.unknown()).optional(),
        _id: OptStr,
      }),
    )
    .optional(),
});
export type RawCompany = z.infer<typeof RawCompanySchema>;

export const RawEnterprisesSearchSchema = z.object({
  stat: OptNum,
  total: Num,
  search_total: OptNum,
  enterprises: z.array(RawCompanySchema),
});
export type RawEnterprisesSearch = z.infer<typeof RawEnterprisesSearchSchema>;

export const RawAdvanceSearchSchema = z.object({
  stat: OptNum,
  total: Num,
  fields: z.array(z.record(z.string(), z.unknown())).optional(),
  data: z.array(RawCompanySchema),
});
export type RawAdvanceSearch = z.infer<typeof RawAdvanceSearchSchema>;

export const RawContactSchema = z.object({
  _id: OptStr,
  contact_id: OptStr,
  contact_label: OptStr,
  contact: OptStr,
  contactName: OptStr,
  contactType: OptNum,
  contactSource: OptStr,
  department: OptStr,
  region: OptStr,
  engage_tag: OptStr,
  is_key_lead: z.boolean().optional(),
  is_high_freq: z.boolean().optional(),
  followStatus: OptNum,
  has_hidden: OptStr,
  has_unlocked: z.boolean().optional(),
  tags: z.array(Str).optional(),
});
export type RawContact = z.infer<typeof RawContactSchema>;

export const RawQueryContactsSchema = z.object({
  stat: OptNum,
  status: OptNum,
  lead: RawLeadRefSchema.nullable().optional(),
  contacts: z.array(RawContactSchema).optional(),
});
export type RawQueryContacts = z.infer<typeof RawQueryContactsSchema>;

export const RawUnlockSchema = z.object({
  stat: OptNum,
  message: OptStr,
  msg: OptStr,
});
export type RawUnlock = z.infer<typeof RawUnlockSchema>;

export const RawEnterpriseNamesSchema = z.object({
  stat: OptNum,
  enterprises: z.array(
    z.object({
      _id: Str,
      name: Str,
      entity_type: OptStr,
      heat: OptNum,
      highlight: z.record(z.string(), z.array(Str)).nullable().optional(),
    }),
  ),
});
export type RawEnterpriseNames = z.infer<typeof RawEnterpriseNamesSchema>;

// ─── 企业详情接口（2026-11-09 实测） ─────────────────────────────
const Loose = z.looseObject;

export const RawIndustrySchema = Loose({
  firstIndustry: OptStr,
  secondIndustry: OptStr,
  thirdIndustry: OptStr,
  fourthIndustry: OptStr,
  originName: OptStr,
});
export type RawIndustry = z.infer<typeof RawIndustrySchema>;

export const RawOfficeAddressSchema = Loose({
  province: OptStr,
  city: OptStr,
  district: OptStr,
  value: OptStr,
});

export const RawEnterpriseBasicSchema = Loose({
  name: OptStr,
  legalRepresentative: OptStr,
  regCapital: RawRegCapitalSchema.nullable().optional(),
  socialCreditCode: OptStr,
  enterpriseType: OptStr,
  foundTime: OptStr,
  homepage: OptStr,
  industry_12315: RawIndustrySchema.optional(),
  firstIndustriesV2: z.array(Str).optional(),
  secondIndustriesV2: z.array(Str).optional(),
  thirdIndustriesV2: z.array(Str).optional(),
  fourthIndustriesV2: z.array(Str).optional(),
  listedLabelList: z.array(Str).optional(),
  isHighTechEnterprise: OptNum,
  businessTags: z.array(Str).optional(),
  officeDefaultAddress: RawOfficeAddressSchema.optional(),
  business: OptStr,
  operStatus: OptStr,
});
export type RawEnterpriseBasic = z.infer<typeof RawEnterpriseBasicSchema>;

export const RawEnterpriseDetailInfoSchema = Loose({
  name: OptStr,
  legalRepresentative: OptStr,
  regCapital: RawRegCapitalSchema.nullable().optional(),
  socialCreditCode: OptStr,
  orgCode: OptStr,
  enterpriseType: OptStr,
  foundTime: OptStr,
  address: OptAddress,
  homepage: OptStr,
  business: OptStr,
  businessTerm: Loose({ min: OptStr, max: OptStr }).optional(),
  formerNames: z.array(Str).optional(),
  arInsuranceNumber: OptNum,
  groupInsuranceNumber: OptNum,
  insuredDetail: z.array(Loose({ name: OptStr, relation: OptStr, insuranceNum: OptNum })).optional(),
  registrationAuthority: OptStr,
  approveDate: OptStr,
  operStatus: OptStr,
  businessLicenseInvalidationDeclarationList: z.array(z.unknown()).optional(),
});
export type RawEnterpriseDetailInfo = z.infer<typeof RawEnterpriseDetailInfoSchema>;

export const RawHolderPageSchema = Loose({
  stat: OptNum,
  total: Num,
  page: z.array(
    Loose({
      name: OptStr,
      ratio: OptNum,
      holderType: OptStr,
      isController: OptNum,
      subscriptionDetail: Loose({ amount: OptNum, date: OptStr, coinType: OptStr }).optional(),
      payAmount: Loose({ value: OptNum, coinType: OptStr }).optional(),
      humanId: OptStr,
    }),
  ),
});
export type RawHolderPage = z.infer<typeof RawHolderPageSchema>;

export const RawMemberPageSchema = Loose({
  stat: OptNum,
  total: Num,
  page: z.array(
    Loose({
      name: OptStr,
      ratio: OptNum,
      position: z.array(Str).optional(),
      isController: OptNum,
      humanId: OptStr,
    }),
  ),
});
export type RawMemberPage = z.infer<typeof RawMemberPageSchema>;

export const RawInvestPageSchema = Loose({
  stat: OptNum,
  total: Num,
  page: z.array(z.unknown()),
});
export type RawInvestPage = z.infer<typeof RawInvestPageSchema>;

export const RawBranchPageSchema = Loose({
  stat: OptNum,
  total: Num,
  page: z.array(z.unknown()),
});
export type RawBranchPage = z.infer<typeof RawBranchPageSchema>;

export const RawAlterationPageSchema = Loose({
  stat: OptNum,
  total: Num,
  page: z.array(z.unknown()),
});
export type RawAlterationPage = z.infer<typeof RawAlterationPageSchema>;
