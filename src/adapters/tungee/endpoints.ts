/**
 * 探迹上游端点（来自 2026-11-09 实测，详见 docs/03、docs/05）
 */
export const TUNGEE_ENDPOINTS = {
  /** 登录门户（user.tungee.com） */
  portalLogin: '/users/sign-in',
  portalHome: '/home',
  /** 探迹拓客（sales.tungee.com） */
  salesHome: '/home?entry=1',
  remainLead: '/api/console/remain-lead',
  infoBar: '/api/console/info-bar',
  advanceSearchV2: '/api/advance-search-v2',
  enterprisesSearch: '/api/enterprises/search',
  enterpriseNamesSearch: '/api/enterprise-names/search',
  homepageEnterprises: '/api/search/homepage/enterprises',
  queryContacts: '/api/lead/query-contacts',
  topNContacts: '/api/lead/contact/top-n-contacts',
  contactTabCount: '/api/enterprise/info/contact-tab-count',
  enterpriseLeadInfo: '/api/enterprise/lead/info',
  unlock: '/api/lead/unlock',
  advanceFilterPage: '/customer-seeking/advanced-filter/enterprise',
  findEnterpriseHome: '/find-enterprise/homepage',
  findEnterpriseResults: '/find-enterprise/results',
  unlockList: '/unlock-list/enterprise',
} as const;

export const TUNGEE_DEFAULTS = {
  baseUrl: 'https://sales.tungee.com',
  portalUrl: 'https://user.tungee.com',
  productLine: 'financial',
  /** 解锁来源参数（页面右侧“解锁企业并查看”=4） */
  unlockSource: '4',
  unlockEntityType: 'enterprise',
  /** 高级筛选模式 */
  advanceSearchMode: '2',
} as const;

/** 企业查询的范围 → fields 参数 */
export const SEARCH_FIELDS = {
  all: undefined,
  name: 'name',
  legalRepresentative: 'legalRepresentative',
  address: 'address.value',
  socialCreditCode: 'socialCreditCode',
  contact: 'contact',
} as const;

/** 结果页筛选 → filter JSON 字段 */
export const RESULT_FILTER_KEYS = {
  province: 'address',
  industry: 'industryTag',
  registerYears: 'foundTime',
  showAssociate: 'show_associate',
} as const;
