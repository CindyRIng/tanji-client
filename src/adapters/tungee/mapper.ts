/**
 * 上游原始数据 → 领域模型映射
 */
import type { CompanyDetail, CompanySummary } from '../../domain/company.js';
import type { ContactItem, ContactList } from '../../domain/contact.js';
import type { QuotaSummary } from '../../domain/status.js';
import type { RawCompany, RawContact, RawInfoBar, RawQueryContacts, RawRemainLead } from './raw.js';

function addrText(a: unknown): string | undefined {
  if (typeof a === 'string') return a.trim() || undefined;
  if (a && typeof a === 'object') {
    const o = a as Record<string, unknown>;
    if (typeof o.value === 'string' && o.value.trim()) return o.value.trim();
    const parts = [o.province, o.city, o.district].filter(
      (x): x is string => typeof x === 'string' && x.trim().length > 0,
    );
    if (parts.length) return parts.join('');
  }
  return undefined;
}

const TAG_FLAGS: Array<[keyof RawCompany, string]> = [
  ['isHighTechEnterprise', '高新企业'],
  ['isSpecializedAndNewV2', '专精特新'],
  ['isSpecializedAndNewGiantV2', '专精特新小巨人'],
  ['isGazelleEnt', '瞪羚企业'],
  ['isGazelleEnterprise', '瞪羚企业'],
  ['isUnicornEnt', '独角兽企业'],
  ['isTechEnt', '科技型中小企业'],
  ['isTechLittleGiant', '科技小巨人'],
  ['hasStock', '上市企业'],
];

export function mapQuota(remain: RawRemainLead, infoBar?: RawInfoBar): QuotaSummary {
  const bucket = (limit: number, remaining: number) => ({
    limit,
    remaining,
    used: Math.max(0, limit - remaining),
    unit: '额度点',
  });
  return {
    daily: bucket(remain.individual_day_limit_lead, remain.individual_day_remain_lead),
    monthly: bucket(remain.individual_month_limit_lead, remain.individual_month_remain_lead),
    enterpriseMonthly: bucket(remain.enterprise_month_limit_lead, remain.enterprise_month_remain_lead),
    ...(infoBar?.settlement_day != null ? { settlementDay: infoBar.settlement_day } : {}),
    ...(remain.individual_nearly_seven_day_unlock_nums != null
      ? { nearlySevenDayUnlockCount: remain.individual_nearly_seven_day_unlock_nums }
      : {}),
  };
}

export function isUnlocked(raw: RawCompany): boolean {
  if (raw.lead && raw.lead.join_time !== undefined) return true;
  return false;
}

export function mapCompany(raw: RawCompany): CompanySummary {
  const tags = new Set<string>();
  for (const [key, label] of TAG_FLAGS) {
    if (raw[key] === 1) tags.add(label);
  }
  for (const t of raw.listedLabelList ?? []) tags.add(t);
  if (raw.isHighTechEnterprise === 1) tags.add('高新企业');

  const industry = {
    ...(raw.firstIndustriesV2?.[0] ? { first: raw.firstIndustriesV2[0] } : {}),
    ...(raw.secondIndustriesV2?.[0] ? { second: raw.secondIndustriesV2[0] } : {}),
    ...(raw.thirdIndustriesV2?.[0] ? { third: raw.thirdIndustriesV2[0] } : {}),
    ...(raw.fourthIndustriesV2?.[0] ? { fourth: raw.fourthIndustriesV2[0] } : {}),
  };

  const regCapitalValue = raw.regCapital?.value ?? raw.regCapital_value ?? undefined;
  const coinType = raw.regCapital?.coinType ?? raw.regCapital_coinType ?? '人民币';

  return {
    id: raw._id,
    name: raw.name,
    entityType: raw.entity_type === 'person' ? 'person' : 'enterprise',
    ...(raw.socialCreditCode ? { uscc: raw.socialCreditCode } : {}),
    ...(raw.legalRepresentative ? { legalRepresentative: raw.legalRepresentative } : {}),
    ...(regCapitalValue !== undefined && regCapitalValue !== null
      ? { regCapital: { value: regCapitalValue, coinType, ...(raw.regCapital?.origin ? { text: raw.regCapital.origin } : {}) } }
      : {}),
    ...(raw.foundTime ? { foundTime: raw.foundTime } : {}),
    ...(addrText(raw.address) ? { address: addrText(raw.address) } : {}),
    ...(raw.operStatus ? { operStatus: raw.operStatus } : {}),
    ...(Object.keys(industry).length ? { industry } : {}),
    ...(raw.enterpriseScaleAlgV2
      ? {
          scale: {
            ...(raw.enterpriseScaleAlgV2.min != null ? { min: raw.enterpriseScaleAlgV2.min } : {}),
            ...(raw.enterpriseScaleAlgV2.max != null ? { max: raw.enterpriseScaleAlgV2.max } : {}),
          },
        }
      : {}),
    ...(raw.annualTurnoverAlgValueV2 ? { annualTurnover: raw.annualTurnoverAlgValueV2 } : {}),
    ...(raw.homepage ? { homepage: raw.homepage } : {}),
    contactCount: raw.contactNumber ?? 0,
    unlocked: isUnlocked(raw),
    tags: [...tags],
    listedTags: raw.listedLabelList ?? [],
    ...(raw.score != null ? { score: raw.score } : {}),
    ...(raw.rank_score != null ? { rankScore: raw.rank_score } : {}),
    ...(raw.highlight ? { highlight: raw.highlight } : {}),
  };
}

export function mapCompanyDetail(raw: RawCompany): CompanyDetail {
  const summary = mapCompany(raw);
  return {
    ...summary,
    shareholders: [],
    keyPeople: [],
    officeAddresses: [],
    annualReportYears: [],
    formerNames: [],
    extra: raw as unknown as Record<string, unknown>,
    cached: false,
    partial: false,
  };
}

function contactTypeOf(raw: RawContact): ContactItem['type'] {
  switch (raw.contactType) {
    case 0:
      return 'mobile';
    case 1:
      return 'phone';
    case 2:
      return 'email';
    default:
      return 'other';
  }
}

export function mapContact(raw: RawContact): ContactItem {
  const value = raw.contact_label ?? '';
  const masked = /\*{2,}/.test(value) || raw.has_hidden === '1';
  return {
    type: contactTypeOf(raw),
    value,
    masked,
    ...(raw._id || raw.contact_id ? { contactId: raw._id ?? raw.contact_id ?? undefined } : {}),
    ...(raw.contactName ? { name: raw.contactName } : {}),
    ...(raw.is_key_lead !== undefined ? { isKeyLead: raw.is_key_lead } : {}),
    ...(raw.is_high_freq !== undefined ? { isHighFreq: raw.is_high_freq } : {}),
    ...(raw.department ? { department: raw.department } : {}),
    ...(raw.region ? { region: raw.region } : {}),
    ...(raw.contactSource ? { source: raw.contactSource } : {}),
    tags: raw.engage_tag ? [raw.engage_tag] : [],
    ...(raw.followStatus != null ? { followStatus: raw.followStatus } : {}),
    ...(raw.has_unlocked !== undefined ? { unlocked: raw.has_unlocked } : {}),
    ...(raw.has_hidden !== undefined ? { hidden: raw.has_hidden === '1' } : {}),
  };
}

export function mapContactList(raw: RawQueryContacts, companyId: string): ContactList {
  const contacts = (raw.contacts ?? []).map(mapContact);
  const counts = { mobile: 0, phone: 0, email: 0, total: contacts.length };
  for (const c of contacts) {
    if (c.type === 'mobile') counts.mobile++;
    else if (c.type === 'phone') counts.phone++;
    else if (c.type === 'email') counts.email++;
  }
  return {
    companyId,
    unlocked: raw.status !== 4 && contacts.length > 0,
    counts,
    contacts,
    cached: false,
  };
}

export function sumContactCounts(list: ContactList) {
  return list.counts;
}

// ─── 企业详情（多接口合并） ─────────────────────────────
import type {
  RawAlterationPage,
  RawBranchPage,
  RawEnterpriseBasic,
  RawEnterpriseDetailInfo,
  RawHolderPage,
  RawInvestPage,
  RawMemberPage,
} from './raw.js';

export interface DetailSources {
  id: string;
  nameHint?: string;
  basic?: RawEnterpriseBasic;
  detail?: RawEnterpriseDetailInfo;
  holders?: RawHolderPage;
  members?: RawMemberPage;
  invests?: RawInvestPage;
  branches?: RawBranchPage;
  alterations?: RawAlterationPage;
}

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

export function mapDetailFromApis(src: DetailSources): CompanyDetail {
  const { basic, detail } = src;
  const industryRaw = basic?.industry_12315;
  const industry = {
    ...(str(industryRaw?.firstIndustry) ?? basic?.firstIndustriesV2?.[0] ? { first: str(industryRaw?.firstIndustry) ?? basic?.firstIndustriesV2?.[0] } : {}),
    ...(str(industryRaw?.secondIndustry) ?? basic?.secondIndustriesV2?.[0] ? { second: str(industryRaw?.secondIndustry) ?? basic?.secondIndustriesV2?.[0] } : {}),
    ...(str(industryRaw?.thirdIndustry) ?? basic?.thirdIndustriesV2?.[0] ? { third: str(industryRaw?.thirdIndustry) ?? basic?.thirdIndustriesV2?.[0] } : {}),
    ...(str(industryRaw?.fourthIndustry) ?? basic?.fourthIndustriesV2?.[0] ? { fourth: str(industryRaw?.fourthIndustry) ?? basic?.fourthIndustriesV2?.[0] } : {}),
  };
  const regCapitalValue = detail?.regCapital?.value ?? basic?.regCapital?.value ?? undefined;
  const tags = new Set<string>();
  if (basic?.isHighTechEnterprise === 1) tags.add('高新企业');
  for (const t of basic?.listedLabelList ?? []) tags.add(t);
  for (const t of basic?.businessTags ?? []) tags.add(t);

  const shareholders = (src.holders?.page ?? []).map((h) => ({
    name: String(h.name ?? ''),
    ...(typeof h.ratio === 'number' ? { ratio: Math.round(h.ratio * 10000) / 100 } : {}),
    ...(typeof h.subscriptionDetail?.amount === 'number'
      ? { subscribedAmount: h.subscriptionDetail.amount }
      : {}),
    ...(h.subscriptionDetail?.date ? { subscribedDate: h.subscriptionDetail.date } : {}),
    ...(h.isController === 1 ? { isControlling: true } : {}),
  }));
  const keyPeople = (src.members?.page ?? []).map((m) => ({
    name: String(m.name ?? ''),
    ...(Array.isArray(m.position) && m.position.length ? { position: m.position.join('、') } : {}),
    ...(typeof m.ratio === 'number' ? { ratio: Math.round(m.ratio * 10000) / 100 } : {}),
  }));

  return {
    id: src.id,
    name: src.nameHint ?? str(detail?.name) ?? str(basic?.name) ?? '',
    entityType: 'enterprise',
    ...(str(detail?.socialCreditCode) ?? str(basic?.socialCreditCode)
      ? { uscc: str(detail?.socialCreditCode) ?? str(basic?.socialCreditCode) }
      : {}),
    ...(str(detail?.legalRepresentative) ?? str(basic?.legalRepresentative)
      ? { legalRepresentative: str(detail?.legalRepresentative) ?? str(basic?.legalRepresentative) }
      : {}),
    ...(regCapitalValue !== undefined && regCapitalValue !== null
      ? {
          regCapital: {
            value: regCapitalValue,
            coinType: detail?.regCapital?.coinType ?? basic?.regCapital?.coinType ?? '人民币',
            ...(detail?.regCapital?.origin ?? basic?.regCapital?.origin
              ? { text: (detail?.regCapital?.origin ?? basic?.regCapital?.origin)! }
              : {}),
          },
        }
      : {}),
    ...(str(detail?.foundTime) ?? str(basic?.foundTime) ? { foundTime: str(detail?.foundTime) ?? str(basic?.foundTime) } : {}),
    ...(addrText(detail?.address) ?? str(basic?.officeDefaultAddress?.value)
      ? { address: addrText(detail?.address) ?? str(basic?.officeDefaultAddress?.value) }
      : {}),
    ...(str(detail?.address) ?? str(basic?.officeDefaultAddress?.province)
      ? { province: str(basic?.officeDefaultAddress?.province) }
      : {}),
    ...(str(detail?.operStatus) ?? str(basic?.operStatus) ? { operStatus: str(detail?.operStatus) ?? str(basic?.operStatus) } : {}),
    ...(Object.keys(industry).length ? { industry } : {}),
    ...(str(basic?.homepage) ?? str(detail?.homepage) ? { homepage: str(basic?.homepage) ?? str(detail?.homepage) } : {}),
    unlocked: false,
    tags: [...tags],
    listedTags: basic?.listedLabelList ?? [],
    businessScope: str(detail?.business),
    registrationAuthority: str(detail?.registrationAuthority),
    approvedAt: str(detail?.approveDate),
    companyType: str(detail?.enterpriseType) ?? str(basic?.enterpriseType),
    organizationCode: str(detail?.orgCode),
    englishName: undefined,
    insuredCount: num(detail?.arInsuranceNumber),
    paidInCapital: undefined,
    operatingPeriod: detail?.businessTerm
      ? `${detail.businessTerm.min ?? ''} 至 ${detail.businessTerm.max ?? ''}`.trim()
      : undefined,
    shareholders,
    keyPeople,
    officeAddresses: basic?.officeDefaultAddress?.value ? [basic.officeDefaultAddress.value] : [],
    branchCount: src.branches?.total,
    investmentCount: src.invests?.total,
    changeCount: src.alterations?.total,
    annualReportYears: [],
    formerNames: detail?.formerNames ?? [],
    extra: { basic, detail },
    fetchedAt: new Date().toISOString(),
    cached: false,
    partial: false,
  };
}
