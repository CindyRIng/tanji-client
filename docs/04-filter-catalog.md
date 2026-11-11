# 探迹高级筛选条件清单（2026-11-09 实测）
> 文档编号：04 ｜ 状态：实测清单（已归档） ｜ 最后更新：2026-11-09
> 12 类/345 个 UI 可见条件的实测清单，filter registry 的数据来源。


> 数据来源：`GET /api/advance-search/lightweight-configs`（302KB 全量配置，已保存 `exploration/configs/lightweight-configs.json`）+ 在「添加条件」面板逐类真实点击枚举（12 类全部点过，结果见 `exploration/configs/filter-ui-categories.json`）。
> 仓库说明：原始 `exploration/configs` 配置未随仓库发布；条件清单见本文与 `data/filter-registry.json`。
>
> 结论：**12 大类 / 61 个子类（配置）/ 365 个维度（配置）/ 本账号 UI 可见 345 个条件**；另有 11 个配置维度未在 UI 展示、23 个条件未挂到分类。

## 1. 控件与操作符语义（实测 + 配置推断）

配置里每个条件由 `action.type`（操作符）和 `input.type`（控件）描述，UI 文案与推断对应如下：

| action.type | 操作符语义 | 实测/示例 |
| --- | --- | --- |
| 0 | 区间/比较（数值或日期） | 注册资本「~ 万元人民币」、成立时间（日期区间） |
| 1 | 有无（是/否），可带关联过滤 | 企业年报、手机（+「过滤号码全部都是」） |
| 2 | 等于（单选） | 联系人渠道 |
| 3 | 等于任一（多选） | 国标行业（树形）、登记状态、注册地址 |
| 4 | 文本包含任一（关键词） | 企业名称（实测「文本包含任一」）、企业简介、主营业务 |
| 5 | 预设选项（区间/枚举） | 业务类型（To B/To C）、岗位平均更新频率 |
| 8 | 关联过滤（子条件） | 过滤号码全部都是 … 的企业 |
| 9 | 多选（等于任一） | 股东类型 |
| 10 | 多选 | 全部股东类型、大股东类型、获得荣誉年份 |
| 11 | 是/否（特殊） | 是否分支机构 |

| input.type | 控件 | 示例 |
| --- | --- | --- |
| 2 | 下拉单选 | 登记状态 |
| 3 | 关键词文本框 | 企业名称、企业简介、主营业务 |
| 4 | 多选下拉 | 股东类型、联系人渠道 |
| 5 | 数值区间（min/max + 单位） | 注册资本、参保人数 |
| 6 | 日期区间 | 成立时间、变更日期 |
| 7 | 档位选择 | 公司规模 |
| 8 | 树形选择 | 国标行业、注册地址 |
| 10 | 关联条件列表 | 手机/固话/邮箱的号码过滤 |
| 无 | 开关（是/否） | 企业年报、是否上市企业 |

条件组逻辑：「满足下列 **所有/任一** 条件」：所有 → 请求 `relation=0`（实测）；任一 → 预计 `relation=1`（待抓包确认）。

已确认的高级筛选请求格式：`POST /api/advance-search-v2`，`multipart/form-data`，关键字段 `filter`（JSON）、`relation`、`start`、`end`、`sort`、`mode=2`、`filter_advance_search_filter_pool=1`。示例：

```json
{"must":[{"industriesV2":[{"eq":[["信息传输、软件和信息技术服务业"]]}]},{"regCapitalRmb":[{"gte":100,"lte":1000}]}]}
```

> 待补充：其余控件类型（文本/日期/布尔/档位/树形等）在 `filter` JSON 中的精确算子结构；本次只抓到 `industriesV2`、`regCapitalRmb` 两种。实现时可在页面上对每种类型点一次「筛选」抓请求补齐。

---

## 2. 分类总览

| 分类 | 子类数（UI） | 条件数（UI） | 配置中未展示 |
| --- | --- | --- | --- |
| 工商信息 | 6 | 54 | 3 |
| 联系方式 | 3 | 24 | 1 |
| 招聘信息 | 2 | 17 | 0 |
| 官网信息 | 5 | 24 | 0 |
| 经营状况 | 8 | 33 | 7 |
| 资质证书 | 5 | 33 | 0 |
| 媒体信息 | 2 | 9 | 0 |
| 推广信息 | 3 | 9 | 0 |
| 产品信息 | 3 | 27 | 0 |
| 风险信息 | 18 | 90 | 0 |
| 知识产权 | 4 | 25 | 0 |
| 探迹线索数据 | 0 | 0 | 0 |
| **合计** | **59** | **345** | **11** |

---

## 3. 全量条件清单

### 工商信息（54 项）

| 子类 | 条件名称 | 字段 key | 控件/操作符 | 单位/提示 | 候选值来源 |
| --- | --- | --- | --- | --- | --- |
| 基础信息 | 企业名称 | `name` | 关键词（文本包含任一） | — | — |
| 基础信息 | 企业简介 | `desc` | 关键词（文本包含任一） | — | — |
| 基础信息 | 成立时间 | `foundTime` | 日期区间 | — | — |
| 基础信息 | 登记状态 | `operStatus_v2` | 多选下拉（等于任一） | — | `operStatus_v2` 4 项：营业、吊销、注销、其他… |
| 基础信息 | 注册资本 | `regCapitalRmb` | 数值区间 | 万元人民币 | — |
| 基础信息 | 认缴金额 | `totalSubscriptionAmount` | 数值区间 | 万元人民币 | — |
| 基础信息 | 认缴出资日期 | `subscriptionDateList` | 日期区间 | — | — |
| 基础信息 | 实缴资本 | `totalPayAmount` | 数值区间 | 万元人民币 | — |
| 基础信息 | 实缴比例 | `payGapRate` | 数值区间 | 百分比；实缴比例是基于实缴资本占当前注册资本的比例计算出的参考值，比例为100%说明企业已全额实缴，比例为0%说明企业尚未缴纳实缴资本 | — |
| 基础信息 | 注册地址 | `address` | 树形（等于任一） | — | — |
| 基础信息 | 注册详细地址 | `addressValue` | 关键词（文本包含任一） | — | — |
| 基础信息 | 国标行业 | `industriesV2` | 树形（等于任一） | — | — |
| 基础信息 | 探迹行业 | `tungeeIndustries` | 树形（等于任一） | ；探迹行业是基于用户拓客的业务属性，运用大数据模型进行深度分析与精准匹配后，所呈现出的一种更契合企业业务特点的创新性行业分类方式。 | `tungeeIndustries` 6 项：通用制造、国际物流、物业管理、工程建筑、服装行业、纺织面料… |
| 基础信息 | 经营范围 | `business` | 关键词（文本包含任一） | — | — |
| 基础信息 | 企业类型（工商登记） | `enterpriseType` | 多选下拉（等于任一） | — | `enterpriseType` 8 项：港、澳、台、个体户、国有、民营、农资、外资… |
| 基础信息 | 登记机关 | `registrationAuthority` | 关键词（文本包含任一） | — | — |
| 基础信息 | 机构类型 | `institutionTypes` | 多选下拉（等于任一） | — | `institutionTypes` 7 项：农民专业合作社（联合社）、机关单位、事业单位、社会组织、法律服务机构、学校… |
| 基础信息 | 国有企业 | `stateOwnedTags` | 多选下拉（等于任一） | — | `stateOwnedTags` 9 项：央企、央企子公司、省管国企、市管国企、国有全资企业、国有独资企业… |
| 基础信息 | 曾用名 | `formerNames` | 关键词（文本包含任一） | — | — |
| 基础信息 | 吊销时间 | `deactivateDate` | 日期区间 | — | — |
| 基础信息 | 注销时间 | `revokeDate` | 日期区间 | — | — |
| 基础信息 | 法人关联企业数量 | `legalRelatedEnterpriseNum` | 数值区间 | — | — |
| 基础信息 | 出资形式 | `investmentFormList` | 多选下拉（等于任一） ＋关联：年报年份 | — | `investmentFormList` 10 项：货币、实物、股权、知识产权、土地使用权、劳务… |
| 营业收入 | 有无公开营业收入 | `hasEaTotalSales` | 是/否 | — | — |
| 营业收入 | 最新营业收入金额 | `latestEaTotalSalesValue` | 数值区间 ＋关联：营业收入披露年份 | 万元人民币 | — |
| 办公地址 | 有无办公地址 | `hasOfficeAddress` | 是/否 | — | — |
| 办公地址 | 有无推荐办公地址 | `hasRecommendedOfficeAddress` | 是/否 | — | — |
| 办公地址 | 办公地址验证类型 | `officeAddressVerifyTypes` | 单选下拉 | — | `officeAddressVerifyTypes` 4 项：地图可查、打车可达、已验厂、快递可达… |
| 办公地址 | 办公详细地址 | `officeAddressList` | 关键词（文本包含任一） | — | — |
| 办公地址 | 办公地址数量 | `officeAddressTotalNum` | 数值区间 | 个 | — |
| 投资任职 | 分支机构数量 | `branchOfficeNumber` | 数值区间 | 个 | — |
| 投资任职 | 有无对外投资 | `hasCalInvestment` | 是/否 | — | — |
| 投资任职 | 股东人数 | `holderNumber` | 数值区间 | 人 | — |
| 投资任职 | 最大股东占比 | `maxRatio` | 数值区间 | % | — |
| 投资任职 | 股东类型 | `holderTypes` | 多选下拉 | — | `holderTypes` 2 项：自然人、法人… |
| 投资任职 | 大股东类型 | `majorShareholderType` | 多选下拉 | — | `majorShareholderType` 2 项：自然人、法人… |
| 投资任职 | 全部股东类型 | `allHolderType` | 多选下拉 | — | `allHolderType` 2 项：自然人、法人… |
| 投资任职 | 人员姓名 | `personName` | 关键词（文本包含任一） ＋关联：姓名角色 | — | — |
| 年报信息 | 企业年报 | `hasAnnualReport` | 是/否 | — | — |
| 年报信息 | 年报年份 | `arYearList` | 多选下拉（等于任一） | — | `arYearList` 13 项：2025、2024、2023、2022、2021、2020… |
| 年报信息 | 参保人数 | `arInsuranceNumber` | 数值区间 | 人 | — |
| 年报信息 | 通讯地址 | `arAddress` | 关键词（文本包含任一） | — | — |
| 年报信息 | 有无年报对外投资 | `hasInvestment` | 是/否 | — | — |
| 年报信息 | 纳税金额 | `totalTax` | 数值区间 | 万元人民币 | — |
| 年报信息 | 资产总额 | `totalAssets` | 数值区间 | 万元人民币 | — |
| 年报信息 | 营业总收入 | `totalOperatingIncome` | 数值区间 | 万元人民币 | — |
| 年报信息 | 净利润 | `netProfit` | 数值区间 | 万元人民币 | — |
| 年报信息 | 利润总额 | `profit` | 数值区间 | 万元人民币 | — |
| 年报信息 | 负债总额 | `totalLiabilities` | 数值区间 | 万元人民币 | — |
| 年报信息 | 最新上传是否纸质年报 | `isPaperAnnualReport` | 是/否 | — | — |
| 变更信息 | 最新地址变更日期 | `lastAddressChangeDate` | 日期区间 | — | — |
| 变更信息 | 有无变更信息 | `hasAlter` | 是/否 | — | — |
| 变更信息 | 变更类型 | `alterItems` | 多选下拉（等于任一） ＋关联：变更日期 | — | `alterItems` 7 项：法人/负责人变更、企业地址变更、经营范围变更、企业名称变更、股东信息变更、主要人员变更… |
| 变更信息 | 变更日期 | `alterDateList` | 日期区间 ＋关联：变更类型 | — | — |

**配置中存在但本账号 UI 未展示：**

| 子类 | 条件 | 字段 key | 控件 |
| --- | --- | --- | --- |
| 基础信息 | 所属行业（旧） | `industries` | 多选下拉（等于任一） |
| 企业关系 | hasCooperation | `hasCooperation` | ? |
| 企业关系 | cooperationRoles | `cooperationRoles` | ? |

### 联系方式（24 项）

| 子类 | 条件名称 | 字段 key | 控件/操作符 | 单位/提示 | 候选值来源 |
| --- | --- | --- | --- | --- | --- |
| 基本信息 | 手机 | `hasMobile` | 是/否 ＋关联：过滤号码全部都是 | — | — |
| 基本信息 | 固话 | `hasPhone` | 是/否 ＋关联：过滤号码全部都是 | — | — |
| 基本信息 | 邮箱 | `hasEmail` | 是/否 ＋关联：过滤号码全部都是 | — | — |
| 基本信息 | 有无领英 | `hasLinkedin` | 是/否 | — | — |
| 基本信息 | 手机号量级 | `mobileNumber` | 档位 | — | `mobileNumberList` 6 项：1个、5个、10个、20个、50个、1000个… |
| 基本信息 | 有效手机号码 | `hasValidMobile` | 是/否 | — | — |
| 基本信息 | 有无关联联系方式 | `hasAssociateContact` | 是/否 | — | — |
| 基本信息 | 关联联系方式类型 | `associateContactTypeList` | 单选下拉 | — | `associateContactTypeList` 3 项：手机、固话、邮箱… |
| 号码信息 | 手机号地区 | `mobileRegion` | 多选下拉（等于任一） | — | — |
| 号码信息 | HOT号码地区 | `hotMobileRegion` | 多选下拉（等于任一） | — | — |
| 号码信息 | 所属岗位 | `contactPositions` | 单选下拉 | — | `contactPositionList` 3 项：高管、主管、员工… |
| 号码信息 | 联系人所属部门 | `contactPositionRelates` | 树形（等于任一） | — | `contactPositionRelateTree` 8 项：行政部、人事部、商务部、贸易部、市场营销部、销售部… |
| 号码信息 | 手机号所属部门 | `mobile_departments` | 树形（等于任一） | — | `contactPositionRelateTree` 8 项：行政部、人事部、商务部、贸易部、市场营销部、销售部… |
| 号码信息 | 手机号渠道 | `mobileSourceList` | 单选下拉 | — | `contactSource` 17 项：年报、官网、B2B、招聘、垂直门户、分类信息… |
| 号码信息 | 固话渠道 | `phoneSourceList` | 单选下拉 | — | `contactSource` 17 项：年报、官网、B2B、招聘、垂直门户、分类信息… |
| 号码信息 | 邮箱渠道 | `emailSourceList` | 单选下拉 | — | `contactSource` 17 项：年报、官网、B2B、招聘、垂直门户、分类信息… |
| 号码信息 | 联系人渠道 | `contactSource` | 单选下拉 | — | `contactSource` 17 项：年报、官网、B2B、招聘、垂直门户、分类信息… |
| 标签信息 | 有无Hot | `hasKeyman` | 是/否 | — | — |
| 标签信息 | 近期收录 | `hasRecentlyContact` | 单选下拉 | — | `recentlyContactTypeList` 3 项：手机、固话、邮箱… |
| 标签信息 | 有无代理记账号码 | `hasHighFreqContact` | 是/否 | — | — |
| 标签信息 | 代理记账号码类型 | `highFreqContactTypeList` | 单选下拉 | — | `highFreqContactTypeList` 3 项：手机、固话、邮箱… |
| 标签信息 | 有无非代理记账号码 | `hasNotHighFreqContact` | 是/否 | — | — |
| 标签信息 | 非代理记账号码类型 | `notHighFreqContactTypeList` | 单选下拉 | — | `highFreqContactTypeList` 3 项：手机、固话、邮箱… |
| 标签信息 | Hot关联企业数量 | `kpRelateNumber` | 多选下拉（等于任一） | — | `kpRelateNumberList` 4 项：1个、2个以内、5个以内、10个以内… |

**配置中存在但本账号 UI 未展示：**

| 子类 | 条件 | 字段 key | 控件 |
| --- | --- | --- | --- |
| 标签信息 | hasVerifiedContact | `hasVerifiedContact` | ? |

### 招聘信息（17 项）

| 子类 | 条件名称 | 字段 key | 控件/操作符 | 单位/提示 | 候选值来源 |
| --- | --- | --- | --- | --- | --- |
| 岗位信息 | 岗位名称 | `recruitingName` | 关键词（文本包含任一） ＋关联：岗位发布时间、岗位描述、招聘渠道 | — | — |
| 岗位信息 | 岗位描述 | `recruitingDesc` | 关键词（文本包含任一） ＋关联：岗位发布时间、岗位名称、招聘渠道 | — | — |
| 岗位信息 | 岗位类型 | `recruitingTypes` | 单选下拉 | — | `recruitingTypes` 3 项：实习、兼职、全职… |
| 岗位信息 | 岗位发布时间 | `recruitingPublishedTime` | 日期区间 ＋关联：岗位名称、岗位描述、招聘渠道 | — | — |
| 岗位信息 | 岗位平均薪酬 | `recruitingAvgWorkingSalary` | 数值区间 | 元人民币/月 | — |
| 岗位信息 | 岗位平均更新频率 | `recruitingAvgUpdate` | — | — | 预设：小于1周、大于1周且小于1个月、大于1个月 |
| 岗位信息 | 企业福利 | `benefitList` | 关键词（文本包含任一） | — | — |
| 招聘情况 | 招聘渠道 | `recruitingSource` | 单选下拉 ＋关联：岗位发布时间、岗位名称、岗位描述 | — | `recruitingSource` 5 项：主流渠道、行业渠道、地方渠道、兼职平台、其他渠道… |
| 招聘情况 | 招聘地址 | `recruitingAddress` | 单选下拉 | — | — |
| 招聘情况 | 招聘详细地址 | `recruitingAddress.value` | 关键词（文本包含任一） | — | — |
| 招聘情况 | 当前招聘岗位数 | `recruitingCurrentNo` | 数值区间 | 个；所选取渠道下所有招聘岗位数相加，存在偏大情况 | — |
| 招聘情况 | 当前招聘人数 | `recruitingCurrentCount` | 数值区间 | 人；所选取渠道下所有招聘岗位数相加，存在偏大情况 | — |
| 招聘情况 | 当前招聘渠道个数 | `recruitingSourceCount` | 数值区间 | 个 | — |
| 招聘情况 | 最近1个月招聘岗位名称 | `recruitingNameLastMonth` | 关键词（文本包含任一） | — | — |
| 招聘情况 | 近三个月招聘岗位总数 | `recruitingLastThreeMonthNo` | 数值区间 | 个；所选取渠道下所有招聘岗位数相加，存在偏大情况 | — |
| 招聘情况 | 近三个月招聘总人数 | `recruitingLastThreeMonthCount` | 数值区间 | 人；所选取渠道下所有招聘岗位数相加，存在偏大情况 | — |
| 招聘情况 | 招聘城市数量 | `recruitingCityCount` | 数值区间 | 个 | — |

### 官网信息（24 项）

| 子类 | 条件名称 | 字段 key | 控件/操作符 | 单位/提示 | 候选值来源 |
| --- | --- | --- | --- | --- | --- |
| 网站信息 | 有无官网 | `homepage` | 是/否 | — | — |
| 网站信息 | 有无ICP备案 | `hasICP` | 是/否 | — | — |
| 网站信息 | ICP备案数量 | `ICPListNumber` | 数值区间 | 个 | — |
| 网站信息 | ICP备案时间 | `filingAuditTimeList` | 日期区间 | — | — |
| IP信息 | IP运营节点 | `ipOperator` | 单选下拉 ＋关联：IP物理位置 | — | — |
| IP信息 | IP物理位置 | `ipAddress` | 单选下拉 | — | `ipAddress` 564 项：中国、北京市、北京市西城区、北京市通州区、北京市顺义区、北京市石景山区… |
| SEO指标 | 网站关键词（Keywords） | `domainKeywords` | 关键词（文本包含任一） | — | — |
| SEO指标 | 网站描述（Description） | `domainDesc` | 关键词（文本包含任一） | — | — |
| SEO指标 | 标题（Title） | `domainTitle` | 关键词（文本包含任一） | — | — |
| SEO指标 | 网站内容 | `icpHomepageContent` | 关键词（文本包含任一） | — | — |
| SEO指标 | 百度权重 | `weightOnBaidu` | 数值区间 | — | — |
| SEO指标 | 360权重 | `weightOn360` | 数值区间 | — | — |
| SEO指标 | 百度收录量 | `baiduCitedNo` | 数值区间 | — | — |
| SEO指标 | 360收录量 | `360CitedNo` | 数值区间 | — | — |
| 技术指标 | 网站技术 | `domainTechnologies` | 单选下拉 | — | `domainTechnologies` 2 项：HTML5、CSS3… |
| 技术指标 | 域名年龄 | `domainAge` | 数值区间 | 年 | — |
| 技术指标 | 域名到期时间 | `domainExpireDate` | 日期区间 | — | — |
| 技术指标 | W3C标准偏离值 | `W3CDeviate` | 数值区间 | ；1-15属于正常范围 | — |
| 技术指标 | 平均访问错误率 | `avgErrorRate` | 数值区间 | 百分比；代表访问时的错误百分比，如：100%即无法访问 | — |
| 技术指标 | 平均访问速度 | `avgResponseTime` | 数值区间 | 秒；代表访问时的平均速度，数值越小访问速度越快 | — |
| 官网模块 | 在线客服 | `hasDomainServiceOnLine` | 是/否 | — | — |
| 官网模块 | Https模块 | `hasDomainHttps` | 是/否 | — | — |
| 官网模块 | 客服类型 | `domainServiceOnLineList` | 单选下拉 | — | `domainServiceOnLineList` 23 项：QQ、EC云客通、Talk99、live800、网易七鱼、CC客服… |
| 官网模块 | 首页布局 | `domainHomepageLayout` | 单选下拉 | — | `domainHomepageLayout` 8 项：英文版本、400电话、社交网络、app下载、加入我们、申请试用… |

### 经营状况（33 项）

| 子类 | 条件名称 | 字段 key | 控件/操作符 | 单位/提示 | 候选值来源 |
| --- | --- | --- | --- | --- | --- |
| 业务情况 | 业务类型 | `businessType` | — | ；To B代表To Business，即企业的产品卖给另外一个企业。To C代表To Consumer，即企业的产品卖给个人消费者。 | 预设：To B、To C |
| 业务情况 | 企业分类 | `enterpriseClassification` | 单选下拉 | — | `enterpriseClassification` 2 项：销售型、生产型… |
| 业务情况 | 主营业务 | `businessKeywords` | 关键词（文本包含任一） | — | — |
| 业务情况 | 公司规模 | `enterpriseScaleAlgV2` | 档位 | 人；基于企业公开数据分析得出 | `enterpriseScaleAlgV2List` 9 项：0、50、100、300、500、1000… |
| 业务情况 | 年营业额 | `annualTurnoverAlgV2` | 档位 | ；基于企业公开数据分析得出 | `annualTurnoverAlgV2List` 11 项：1万、5万、10万、50万、100万、500万… |
| 开户行信息 | 有无开户信息 | `hasInvoiceBank` | 是/否 | — | — |
| 开户行信息 | 开户总行 | `invoiceBankHeadName` | 多选下拉（等于任一） | — | `invoiceBankHeadNameList` 41 项：中国农业银行、中国建设银行、中国工商银行、中国银行、邮政储蓄银行、交通银行… |
| 开户行信息 | 开户行支行 | `invoiceBankBranchName` | 关键词（文本包含任一） | — | — |
| 融资信息 | 融资次数 | `financingNumber` | 数值区间 | 次 | — |
| 融资信息 | 当前融资轮次 | `financingSeries` | 多选下拉（等于任一） | — | `financingSeries` 21 项：种子轮、天使轮、Pre-A轮、A轮、A+轮、Pre-B轮… |
| 榜单情况 | 当前是否500强企业 | `isTopEnterprise` | 是/否 | — | — |
| 榜单情况 | 是否上市企业 | `hasStock` | 是/否 | ；包含新三板、新四板数据，如需细分可用“上市类型”筛选 | — |
| 榜单情况 | 上市类型 | `stockType` | 多选下拉（等于任一） | — | `stockType` 6 项：A股、B股、新三板、新四板、港股、美股… |
| 资质信息 | 是否高新企业 | `isHighTechEnt` | 是/否 ＋关联：获得荣誉年份、荣誉级别、截止日期 | — | — |
| 资质信息 | 是否专精特新企业 | `isSpecializedAndNewV2` | 是/否 ＋关联：获得荣誉年份、荣誉级别、截止日期 | — | — |
| 资质信息 | 是否专精特新小巨人企业 | `isSpecializedAndNewGiantV2` | 是/否 ＋关联：获得荣誉年份、荣誉级别、截止日期 | — | — |
| 资质信息 | 是否独角兽企业 | `isUnicornEnt` | 是/否 ＋关联：获得荣誉年份、荣誉级别、截止日期 | — | — |
| 资质信息 | 是否瞪羚企业 | `isGazelleEnt` | 是/否 ＋关联：获得荣誉年份、荣誉级别、截止日期 | — | — |
| 资质信息 | 是否雏鹰企业 | `isLittleEagle` | 是/否 ＋关联：获得荣誉年份、荣誉级别、截止日期 | — | — |
| 资质信息 | 是否科技小巨人企业 | `isTechLittleGiant` | 是/否 ＋关联：获得荣誉年份、荣誉级别、截止日期 | — | — |
| 资质信息 | 是否科技型中小企业 | `isTechEnt` | 是/否 ＋关联：获得荣誉年份、荣誉级别、截止日期 | — | — |
| 招投标信息 | 有无招投标 | `hasBidding` | 是/否 | — | — |
| 招投标信息 | 招投标项目标题 | `biddingAnncTitleList` | 关键词（文本包含任一） ＋关联：招投标项目角色、招投标项目发布时间、招投标公告类型 | — | — |
| 招投标信息 | 招投标项目角色 | `biddingRole` | 多选下拉（等于任一） ＋关联：招投标项目标题、招投标项目发布时间、招投标公告类型 | — | `biddingRole` 3 项：招标单位、中标单位、招标代理… |
| 招投标信息 | 招投标项目发布时间 | `biddingAnncPubTimeList` | 日期区间 ＋关联：招投标项目标题、招投标项目角色、招投标公告类型 | — | — |
| 招投标信息 | 招投标公告类型 | `biddingAnncTypeList` | 单选下拉 ＋关联：招投标项目标题、招投标项目角色、招投标项目发布时间 | — | `biddingAnncTypeList` 6 项：招标预告、招标公告、变更补充、中标公告、采购意向、废标终止… |
| 工厂信息 | 厂房面积 | `factoryArea` | 数值区间 | 平方米 | — |
| 工厂信息 | 工厂员工 | `factoryEmpNumber` | 数值区间 | 人 | — |
| 工厂信息 | 设备数量 | `mainDeviceCount` | 数值区间 | 个 | — |
| 工厂信息 | 工厂性质 | `factoryNature` | 多选下拉（等于任一） | — | `factoryNature` 2 项：自有工厂、关联工厂… |
| 工厂信息 | 厂房使用类型 | `useType` | 多选下拉（等于任一） | — | `useType` 2 项：自有、租赁… |
| 税务信息 | 有无税务登记 | `hasTaxReg` | 是/否 | — | — |
| 税务信息 | 税务登记变更时间 | `taxRegChangeTime` | 日期区间 | — | — |

**配置中存在但本账号 UI 未展示：**

| 子类 | 条件 | 字段 key | 控件 |
| --- | --- | --- | --- |
| 业务情况 | 业务关键词 | `businessKeywords` | 关键词（文本包含任一） |
| 业务情况 | 公司规模（旧） | `calEnterpriseScaleLevel` | 多选下拉（等于任一） |
| 业务情况 | 年营业额（旧） | `annualTurnover` | 多选下拉（等于任一） |
| 展会信息 | hasFair | `hasFair` | ? |
| 展会信息 | fairTimes | `fairTimes` | ? |
| 展会信息 | fairBeginTime | `fairBeginTime` | ? |
| 展会信息 | fairName | `fairName` | ? |

### 资质证书（33 项）

| 子类 | 条件名称 | 字段 key | 控件/操作符 | 单位/提示 | 候选值来源 |
| --- | --- | --- | --- | --- | --- |
| 证书 | 有无证书 | `hasCertificate` | 是/否 | — | — |
| 证书 | 涵盖证书类别 | `certTypeList` | 单选下拉 ＋关联：证书名称、证书有效截止日期、获证日期、证书状态、发证机构、发证机构撤销时间、发证机构注销时间、证书认证标准和技术要求、最新证书有效截止日期、证书体系覆盖人数、证书认证依据、证书使用的认可标识 | — | `certTypeList` 29 项：建筑资质、安全生产许可证、特种设备许可证、测绘资质证书、CCC、管理体系认证… |
| 证书 | 证书名称 | `certNameList` | 多选下拉（等于任一） ＋关联：涵盖证书类别、证书有效截止日期、获证日期、证书状态、发证机构、发证机构撤销时间、发证机构注销时间、证书认证标准和技术要求 | — | — |
| 证书 | 证书数量 | `certNumber` | 数值区间 | 个 | — |
| 证书 | 证书有效截止日期 | `certExpireTimeList` | 日期区间 ＋关联：涵盖证书类别、证书名称、获证日期、证书状态、发证机构、发证机构撤销时间、发证机构注销时间、证书认证标准和技术要求 | — | — |
| 证书 | 最近3个月内截止证书类别 | `certTypeListLastThreeMonth` | 单选下拉 | — | `certTypeList` 29 项：建筑资质、安全生产许可证、特种设备许可证、测绘资质证书、CCC、管理体系认证… |
| 证书 | 最近6个月内截止证书类别 | `certTypeListLastSixMonth` | 单选下拉 | — | `certTypeList` 29 项：建筑资质、安全生产许可证、特种设备许可证、测绘资质证书、CCC、管理体系认证… |
| 证书 | 待续办证书类别 | `toBeRenewedCertTypeList` | 单选下拉 | — | `toBeRenewedCertTypeList` 11 项：质量管理体系认证(ISO9001)、环境管理体系认证、中国职业健康安全管理体系认证、汽车行业质量管理体系认证、建设施工行业质量管理体系认证、食品安全管理体系认证… |
| 证书 | 初次获证日期 | `certFirstPublishTime` | 日期区间 | — | — |
| 证书 | 最近获证日期 | `certLastPublishTime` | 日期区间 | — | — |
| 证书 | 本年度获证数量 | `certNumberThisYear` | 数值区间 | 个 | — |
| 证书 | 发证机构 | `certAuthorityList` | 关键词（文本包含任一） ＋关联：涵盖证书类别、证书名称、证书有效截止日期、获证日期、证书状态、发证机构撤销时间、发证机构注销时间、证书认证标准和技术要求 | — | — |
| 证书 | 证书认证标准和技术要求 | `certStandardList` | 关键词（文本包含任一） ＋关联：涵盖证书类别、证书名称、证书有效截止日期、获证日期、证书状态、发证机构、发证机构撤销时间、发证机构注销时间 | — | — |
| 证书 | 证书编号 | `certIdList` | 关键词（文本包含任一） | — | — |
| 行政许可 | 有无行政许可 | `hasLicenseList` | 是/否 | — | — |
| 行政许可 | 许可内容 | `licenseContent` | 关键词（文本包含任一） ＋关联：行政许可起始日期、行政许可截止日期、许可机关、许可文件名称 | — | — |
| 行政许可 | 行政许可数量 | `licenseListCount` | 数值区间 | 个 | — |
| 行政许可 | 许可文件名称 | `licenseName` | 关键词（文本包含任一） ＋关联：行政许可起始日期、行政许可截止日期、许可机关、许可内容 | — | — |
| 行政许可 | 许可机关 | `licenseAuthority` | 关键词（文本包含任一） ＋关联：行政许可起始日期、行政许可截止日期、许可内容、许可文件名称 | — | — |
| 行政许可 | 行政许可起始日期 | `LicenseBeginDateList` | 日期区间 ＋关联：行政许可截止日期、许可机关、许可内容、许可文件名称 | — | — |
| 行政许可 | 行政许可截止日期 | `LicenseEndDateList` | 日期区间 ＋关联：行政许可起始日期、许可机关、许可内容、许可文件名称 | — | — |
| 税务资质 | 是否A级纳税人 | `hasTaxCreditRating` | 是/否 | — | — |
| 税务资质 | A级纳税人评价年份 | `taxCreditRatingYearList` | 单选下拉 | — | `taxCreditRatingYearList` 12 项：2025、2024、2023、2022、2021、2020… |
| 税务资质 | 税务资质类型 | `taxQualificationList` | 单选下拉 | — | `taxQualificationList` 4 项：一般纳税人、小规模纳税人、疑似小规模纳税人、其他… |
| 进出口 | 有无进出口信用 | `hasECRCreditRating` | 是/否 | — | — |
| 进出口 | 海关信用类型 | `ecrCreditType` | 单选下拉 | — | `ecrCreditType` 4 项：一般信用企业、AEO一般认证企业、失信企业、AEO高级认证企业… |
| 进出口 | 海关登记经营类别 | `ecrBusinessType` | 单选下拉 | — | `ecrBusinessType` 11 项：进出口货物收发货人、报关企业、报关企业分支机构、临时注册登记单位、特殊监管区双重身份企业、进出境运输工具负责人… |
| 进出口 | 海关登记行业 | `ecrIndustry` | 单选下拉 | — | `ecrIndustry` 42 项：陆地管道运输、其他未列明专业技术服务业、广播电视卫星传输服务、其他软件开发、基础软件开发、其他卫星传输服务… |
| 标准信息 | 有无标准信息 | `hasStandard` | 是/否 | — | — |
| 标准信息 | 标准名称 | `stdTitleList` | 关键词（文本包含任一） | — | — |
| 标准信息 | 标准级别 | `stdTypeList` | 单选下拉 | — | `stdTypeList` 3 项：国家标准、行业标准、团体标准… |
| 标准信息 | 标准数量 | `stdCount` | 数值区间 | 个 | — |
| 标准信息 | 标准信息最新发布时间 | `stdLatestIssueDate` | 日期区间 | — | — |

### 媒体信息（9 项）

| 子类 | 条件名称 | 字段 key | 控件/操作符 | 单位/提示 | 候选值来源 |
| --- | --- | --- | --- | --- | --- |
| 自媒体 | 有无自媒体 | `hasWeMedia` | 是/否 | — | — |
| 自媒体 | 自媒体名称 | `mediaName` | 关键词（文本包含任一） | — | — |
| 自媒体 | 有无微信公众号 | `hasWechat` | 是/否 | — | — |
| 自媒体 | 微信公众号 | `mediaCount` | 数值区间 | 个 | — |
| 自媒体 | 有无微博机构号 | `hasWeiboOrg` | 是/否 | — | — |
| 自媒体 | 机构微博 | `weiboOrgNumber` | 数值区间 | 个 | — |
| 新闻 | 有无新闻 | `hasNews` | 是/否 | — | — |
| 新闻 | 新闻标题 | `newsTitle` | 关键词（文本包含任一） | — | — |
| 新闻 | 近一月新闻数量 | `lastMonthNewsCount` | 数值区间 | 个 | — |

### 推广信息（9 项）

| 子类 | 条件名称 | 字段 key | 控件/操作符 | 单位/提示 | 候选值来源 |
| --- | --- | --- | --- | --- | --- |
| 企业推广 | 有无推广 | `hasPrmt` | 是/否 | — | — |
| 企业推广 | 推广渠道 | `prmtSources` | 单选下拉 ＋关联：推广时间、推广关键词 | — | `prmtSources` 2 项：百度、360… |
| 企业推广 | 最后推广时间 | `lastPrmtTime` | 日期区间 | — | — |
| 企业推广 | 推广链接数 | `prmtLinksNumber` | 数值区间 | 条 | — |
| 推广创意 | 推广文案 | `prmtText` | 关键词（文本包含任一） | — | — |
| 推广创意 | 推广关键词 | `prmtKeys` | 关键词（文本包含任一） ＋关联：推广时间、推广渠道 | — | — |
| 推广创意 | 最近1个月推广关键词 | `prmtKeyLastMonth` | 关键词（文本包含任一） | — | — |
| 推广创意 | 推广关键词数 | `prmtKeysNumber` | 数值区间 | 个 | — |
| 推广竞品 | 推广竞品数 | `prmtCompetitorsNumber` | 数值区间 | 家 | — |

### 产品信息（27 项）

| 子类 | 条件名称 | 字段 key | 控件/操作符 | 单位/提示 | 候选值来源 |
| --- | --- | --- | --- | --- | --- |
| 电商信息 | 电商主营产品 | `ecShopProducts` | 关键词（文本包含任一） | — | — |
| 电商信息 | 电商主营品牌 | `ecShopBrands` | 关键词（文本包含任一） | — | — |
| 电商信息 | 电商上架平台 | `ecSources` | 单选下拉 | — | `ecSources` 7 项：京东、苏宁、淘宝、国美、蘑菇街、1688… |
| 电商信息 | 电商产品分类 | `ecShopItemCategories` | 关键词（文本包含任一） | — | — |
| 电商信息 | 电商店铺名称 | `ecShopNameList` | 关键词（文本包含任一） | — | — |
| 电商信息 | 电商店铺数量 | `ecShopNumber` | 数值区间 | 个 | — |
| 电商信息 | 电商店铺创建时间 | `ecShopEarliestFoundTime` | 日期区间 | — | — |
| 电商信息 | 电商店铺平均评分 | `ecShopAvgRates` | 数值区间 | 分；最高分为10分 | — |
| 电商信息 | 电商店铺商品总数 | `ecShopItemCount` | 数值区间 | 个 | — |
| 电商信息 | 有无商品 | `hasGoods` | 是/否 | — | — |
| 电商信息 | 商品数量 | `goodsNumber` | 数值区间 | 个 | — |
| 电商信息 | 商品名称 | `goodsNameList` | 关键词（文本包含任一） | — | — |
| 品牌信息 | 有无品牌信息 | `hasBrand` | 是/否 | — | — |
| 品牌信息 | 品牌名称 | `brandNameList` | 关键词（文本包含任一） | — | — |
| 品牌信息 | 品牌数量 | `brandCount` | 数值区间 | 个 | — |
| 品牌信息 | 品牌所属行业 | `brandIndustryList` | 关键词（文本包含任一） | — | — |
| 品牌信息 | 品牌主营产品 | `brandProductList` | 关键词（文本包含任一） | — | — |
| APP应用 | 有无应用 | `hasApplication` | 是/否 | — | — |
| APP应用 | 应用名称 | `appNames` | 关键词（文本包含任一） | — | — |
| APP应用 | 应用描述 | `appDescList` | 关键词（文本包含任一） | — | — |
| APP应用 | 应用数量 | `appNumber` | 数值区间 | 个 | — |
| APP应用 | 应用分类 | `appClass` | 多选下拉（等于任一） | — | `appClass` 20 项：游戏、办公、安全、生活、社交、健康… |
| APP应用 | 应用上架平台 | `appStores` | 多选下拉（等于任一） | — | `appStores` 9 项：华为应用市场、360手机助手、小米应用商店、应用宝、百度手机助手、vivo应用商店… |
| APP应用 | 应用平均评分 | `appAvgRate` | 数值区间 | 分 | — |
| APP应用 | 应用总下载量 | `appTotalDownloadCount` | 数值区间 | 万次 | — |
| APP应用 | 最近发布时间 | `appPublishTime` | 日期区间 | — | — |
| APP应用 | 最近更新时间 | `appUpgradeTime` | 日期区间 | — | — |

### 风险信息（90 项）

| 子类 | 条件名称 | 字段 key | 控件/操作符 | 单位/提示 | 候选值来源 |
| --- | --- | --- | --- | --- | --- |
| 经营异常 | 有无经营异常 | `hasAnomalyList` | 是/否 | ；历史或当前有经营异常信息 | — |
| 经营异常 | 当前是否被列入经营异常 | `isAnomaly` | 是/否 | — | — |
| 经营异常 | 最近经营异常列入日期 | `anomalyCreateDate` | 日期区间 | — | — |
| 经营异常 | 当前被列入经营异常原因 | `currentAnomalyReason` | 单选下拉 | — | `currentAnomalyReason` 3 项：地址异常、年报缺失、工商异常… |
| 经营异常 | 历史列入经营异常原因 | `anomalyCreateReason` | 关键词（文本包含任一） | — | — |
| 经营异常 | 最近经营异常移出日期 | `anomalyRemoveDate` | 日期区间 | — | — |
| 经营异常 | 历史移出经营异常原因 | `anomalyRemoveReason` | 关键词（文本包含任一） | — | — |
| 经营异常 | 经营异常数量 | `anomalyListCount` | 数值区间 | 个 | — |
| 行政处罚 | 有无行政处罚 | `hasPunishment` | 是/否 | — | — |
| 行政处罚 | 行政处罚数量 | `punishmentCount` | 数值区间 | 次 | — |
| 行政处罚 | 最近行政处罚决定日期 | `lastDicisionDate` | 日期区间 | — | — |
| 行政处罚 | 最近行政处罚公示日期 | `lastPunishmentDate` | 日期区间 | — | — |
| 行政处罚 | 违法行为类型 | `punishmentTypeList` | 关键词（文本包含任一） | — | — |
| 行政处罚 | 行政处罚决定机关 | `punishAuthorityList` | 关键词（文本包含任一） | — | — |
| 行政处罚 | 行政处罚结果 | `punishContentList` | 关键词（文本包含任一） | — | — |
| 立案信息 | 有无立案信息 | `hasCourtCase` | 是/否 | — | — |
| 立案信息 | 立案数量 | `courtCaseNumber` | 数值区间 | 个 | — |
| 立案信息 | 立案日期 | `courtCaseCreateTimeList` | 日期区间 ＋关联：立案身份、立案案由、案件立案地址 | — | — |
| 立案信息 | 立案案号 | `courtCaseNumberList` | 关键词（文本包含任一） | — | — |
| 法院公告 | 有无法院公告 | `hasCourtAnnouncement` | 是/否 | — | — |
| 法院公告 | 法院公告类型 | `caTypeList` | 多选下拉（等于任一） | — | `caTypeList` 9 项：起诉状副本及开庭传票、裁判文书、执行文书、起诉状、上诉状副本、开庭传票、公示催告… |
| 法院公告 | 法院公告日期 | `caPublishDateList` | 日期区间 | — | — |
| 法院公告 | 法院公告关联案号 | `caRelatedCaseNumberList` | 关键词（文本包含任一） | — | — |
| 开庭公告 | 有无开庭公告 | `hasOpenCourtSessionAnnc` | 是/否 | — | — |
| 开庭公告 | 案件开庭日期 | `openCourtSessionDateList` | 日期区间 ＋关联：开庭公告身份、开庭公告案由、案件开庭地址、近期发布 | — | — |
| 开庭公告 | 案件开庭地址 | `openCourtSessionAddressList` | 关键词（文本包含任一） ＋关联：开庭公告身份、开庭公告案由、案件开庭日期、近期发布 | — | — |
| 开庭公告 | 开庭公告身份 | `openCourtIdentities` | 单选下拉 | — | `openCourtIdentities` 4 项：原告、被告、当事人、第三人… |
| 开庭公告 | 开庭公告案由 | `openCourtCauses` | 关键词（文本包含任一） | — | — |
| 开庭公告 | 开庭公告数量 | `openCourtNumber` | 数值区间 | 个 | — |
| 裁判文书 | 有无裁判文书 | `hasJudgmentDocument` | 是/否 | — | — |
| 裁判文书 | 裁判文书案由 | `jdCaseOfActionList` | 多选下拉（等于任一） ＋关联：裁判文书判决法院、裁判文书发布时间 | — | `jdCaseOfActionList` 18 项：合同、无因管理、不当得利纠纷、贪污贿赂、婚姻家庭、继承纠纷、非刑事赔偿、危害公共安全、海事海商纠纷… |
| 裁判文书 | 裁判文书详细案由 | `jdCaseOfActionDetailList` | 关键词（文本包含任一） | — | — |
| 裁判文书 | 裁判文书判决法院 | `jdCourtList` | 关键词（文本包含任一） | — | — |
| 裁判文书 | 裁判文书发布时间 | `jdPublishDateList` | 日期区间 | — | — |
| 裁判文书 | 裁判文书数量 | `jdNumber` | 数值区间 | 个 | — |
| 裁判文书 | 裁判文书身份 | `jdIdentities` | 单选下拉 | — | `jdIdentities` 9 项：原告、被告、上诉人、被上诉人、申请执行人、被执行人… |
| 裁判文书 | 裁判文书案件类型 | `jdCaseTypeList` | 单选下拉 | — | `jdCaseTypeList` 7 项：民事案件、执行案件、刑事案件、保全案件、行政案件、管辖案件… |
| 裁判文书 | 裁判文书文书类型 | `jdTypeList` | 关键词（文本包含任一） | — | `jdTypeList` 6 项：判决书、裁定书、通知书、调解书、令、其他文书… |
| 裁判文书 | 裁判文书审理程序 | `jdTrialRoundList` | 关键词（文本包含任一） | — | `jdTrialRoundList` 9 项：一审、二审、首次执行、恢复执行、财产保全执行、执行异议… |
| 被执行人 | 有无被执行人 | `hasEnforcement` | 是/否 | — | — |
| 被执行人 | 执行标的金额 | `efSubjectMoneyList` | 数值区间 | 元 | — |
| 被执行人 | 被执行人立案时间 | `efCaseCreateTimeList` | 日期区间 | — | — |
| 被执行人 | 有无当前被执行人 | `hasCurrentEf` | 是/否 | — | — |
| 被执行人 | 有无历史被执行人 | `hasHistoryEf` | 是/否 | — | — |
| 被执行人 | 历史被执行人立案时间 | `efHistoryCaseCreateTimeList` | 日期区间 | — | — |
| 被执行人 | 被执行人案号 | `efCaseNumberList` | 关键词（文本包含任一） | — | — |
| 失信被执行人 | 有无失信被执行人 | `hasEnforcementDishonest` | 是/否 | — | — |
| 失信被执行人 | 失信被执行人立案时间 | `efDishonestCaseCreateTimeList` | 日期区间 | — | — |
| 失信被执行人 | 失信被执行人发布时间 | `efDishonestPublishTimeList` | 日期区间 | — | — |
| 失信被执行人 | 有无当前失信被执行人 | `hasCurrentDishonest` | 是/否 | — | — |
| 失信被执行人 | 有无历史失信被执行人 | `hasHistoryDishonest` | 是/否 | — | — |
| 失信被执行人 | 历史失信被执行人立案时间 | `efHistoryDishonestCaseCreateTimeList` | 日期区间 | — | — |
| 失信被执行人 | 失信被执行人案号 | `efDishonestCaseNumberList` | 关键词（文本包含任一） | — | — |
| 终本案件 | 累计终本案件未履行比例 | `efTermMoneyProportion` | 数值区间 | 百分比 | — |
| 终本案件 | 终本案件未履行金额 | `efTermDefaultSubjectMoneyList` | 数值区间 | 元 | — |
| 终本案件 | 终本案件执行法院 | `efTermExecutiveCourtList` | 关键词（文本包含任一） | — | — |
| 终本案件 | 终本案件终本日期 | `efTermDateList` | 日期区间 | — | — |
| 终本案件 | 终本案件未履行总金额 | `efTermDefaultSubjectMoneyTotal` | 数值区间 | 元 | — |
| 终本案件 | 有无当前终本案件 | `hasCurrentTerm` | 是/否 | — | — |
| 终本案件 | 有无历史终本案件 | `hasHistoryTerm` | 是/否 | — | — |
| 终本案件 | 历史终本案件终本日期 | `efHistoryTermDateList` | 日期区间 | — | — |
| 终本案件 | 终本案件数量 | `efTermNumber` | 数值区间 | — | — |
| 终本案件 | 终本案件案号 | `efTermCaseNumberList` | 关键词（文本包含任一） | — | — |
| 限制高消费 | 有无限制高消费 | `hasEnforcementLimited` | 是/否 | — | — |
| 限制高消费 | 限制高消费发布时间 | `efLimitedPublishTimeList` | 日期区间 | — | — |
| 限制高消费 | 有无当前限制高消费 | `hasCurrentLimited` | 是/否 | — | — |
| 限制高消费 | 有无历史限制高消费 | `hasHistoryLimited` | 是/否 | — | — |
| 限制高消费 | 历史限制高消费发布时间 | `efHistoryLimitedPublishTimeList` | 日期区间 | — | — |
| 限制高消费 | 限制高消费案号 | `efLimitedPersonCaseNumberList` | 关键词（文本包含任一） | — | — |
| 申请执行 | 有无申请执行 | `isApplicant` | 是/否 | — | — |
| 申请执行 | 申请执行数量 | `applicantNum` | 数值区间 | — | — |
| 申请执行 | 申请执行涉案金额 | `efInvolvedAmountList` | 数值区间 ＋关联：立案时间、申请执行执行法院 | 元人民币 | — |
| 破产重整 | 有无破产重整案件 | `hasBr` | 是/否 | — | — |
| 破产重整 | 破产重整案件身份 | `brIdentities` | 单选下拉 | — | `brIdentitiesList` 2 项：申请人、被申请人… |
| 破产重整 | 破产重整办理法院 | `brHandlingCourtList` | 关键词（文本包含任一） | — | — |
| 出质抵押 | 有无股权出质 | `hasEquityPledge` | 是/否 | — | — |
| 出质抵押 | 有无知识产权出质 | `hasIPRPledge` | 是/否 | — | — |
| 出质抵押 | 有无动产抵押 | `hasMortgage` | 是/否 | — | — |
| 严重风险 | 有无严重违法 | `hasIllegalInfo` | 是/否 | — | — |
| 严重风险 | 有无司法协助 | `hasJudicialAssistance` | 是/否 | — | — |
| 严重风险 | 有无政府采购严重违法 | `hasGovProcurementIllegal` | 是/否 | — | — |
| 税务异常 | 税务异常类型 | `taxAbnormalList` | 单选下拉 | — | `taxAbnormalList` 4 项：税务非正常户、欠税公告、重大税收违法失信、税务局行政处罚… |
| 简易注销 | 有无简易注销 | `hasCsc` | 是/否 | — | — |
| 简易注销 | 简易注销公告发布日期 | `cscPublishDateList` | 日期区间 | — | — |
| 注销备案 | 有无注销备案 | `hasCcn` | 是/否 | — | — |
| 注销备案 | 债权人公告发布日期 | `creditorPublishDateList` | 日期区间 | — | — |
| 减资公告 | 有无减资公告 | `hasEntAnnc` | 是/否 | — | — |
| 减资公告 | 减资公告发布日期 | `entaAnnounceDateList` | 日期区间 ＋关联：减资前注册金额、减资后注册金额 | — | — |
| 减资公告 | 减资前注册金额 | `entAnncPreRegCapitalList` | 数值区间 ＋关联：减资公告发布日期、减资后注册金额 | 万元人民币 | — |
| 减资公告 | 减资后注册金额 | `entAnncPostRegCapitalList` | 数值区间 ＋关联：减资公告发布日期、减资前注册金额 | 万元人民币 | — |

### 知识产权（25 项）

| 子类 | 条件名称 | 字段 key | 控件/操作符 | 单位/提示 | 候选值来源 |
| --- | --- | --- | --- | --- | --- |
| 商标 | 有无商标 | `hasTrademark` | 是/否 | — | — |
| 商标 | 商标状态 | `tmStatusV2` | 单选下拉 | — | `tmStatusV2` 10 项：驳回复审中、撤销/无效宣告申请审查中、初审公告、等待驳回复审、等待实质审查、商标其他情形… |
| 商标 | 商标名称 | `operBrandList` | 关键词（文本包含任一） ＋关联：商标国际分类、商标申请日期、商标商品服务 | — | — |
| 商标 | 商标国际分类 | `tmInternationalClass` | 单选下拉 ＋关联：商标名称、商标申请日期、商标商品服务 | — | `tmInternationalClassList` 45 项：1-化学原料、2-颜料油漆、3-日化用品、4-燃料油脂、5-医药、6-金属材料… |
| 商标 | 商标申请日期 | `tmApplicationTime` | 日期区间 ＋关联：商标名称、商标国际分类、商标商品服务 | — | — |
| 商标 | 商标专用权结束日期 | `tmSpecialTimeList` | 日期区间 | — | — |
| 商标 | 商标商品服务 | `tmServiceDetail` | 关键词（文本包含任一） ＋关联：商标名称、商标国际分类、商标申请日期 | — | — |
| 商标 | 商标地址待变更 | `enterpriseTmAddressChange` | 是/否 | — | — |
| 商标 | 有效状态商标数量 | `tmValidNumber` | 数值区间 | 个 | — |
| 商标 | 无效状态商标数量 | `tmInvalidNumber` | 数值区间 | 个 | — |
| 专利 | 有无专利 | `hasPatent` | 是/否 | — | — |
| 专利 | 涵盖专利类别 | `patentTypeList` | 单选下拉 ＋关联：专利名称、专利申请日期、专利公开日期、专利法律状态 | — | `patentTypeList` 4 项：发明申请、发明授权、实用新型、外观设计… |
| 专利 | 专利名称 | `patentNameList` | 关键词（文本包含任一） ＋关联：涵盖专利类别、专利申请日期、专利公开日期、专利法律状态 | — | — |
| 专利 | 专利数量 | `patentNumber` | 数值区间 | 个 | — |
| 专利 | 专利法律状态 | `calPatentLegalStatusList` | 单选下拉 ＋关联：专利名称、涵盖专利类别、专利申请日期、专利公开日期 | — | `calPatentLegalStatusList` 37 项：授权、公开、审定、实质审查的生效、专利权的终止、专利申请公布后的视为撤回… |
| 专利 | 专利申请日期 | `patentApplicationDateList` | 日期区间 ＋关联：专利名称、涵盖专利类别、专利公开日期、专利法律状态 | — | — |
| 专利 | 最近一年申请专利数量 | `patentApplicationNumberThisYear` | 数值区间 | 个 | — |
| 专利 | 专利公开日期 | `patentPublicationDateList` | 日期区间 ＋关联：专利名称、涵盖专利类别、专利申请日期、专利法律状态 | — | — |
| 专利 | 最近一年公开专利数量 | `patentPublicationNumberThisYear` | 数值区间 | 个 | — |
| 软著 | 有无软著 | `hasSR` | 是/否 | — | — |
| 软著 | 软件名称 | `srName` | 关键词（文本包含任一） | — | — |
| 软著 | 软著数量 | `srNumber` | 数值区间 | 个 | — |
| 作品著作 | 有无作品著作权 | `hasCR` | 是/否 | — | — |
| 作品著作 | 作品名称 | `crName` | 关键词（文本包含任一） | — | — |
| 作品著作 | 作品著作权数量 | `crNumber` | 数值区间 | 个 | — |

### 探迹线索数据（0 项）

| 子类 | 条件名称 | 字段 key | 控件/操作符 | 单位/提示 | 候选值来源 |
| --- | --- | --- | --- | --- | --- |

---

## 4. 配置中存在、但未挂到任何分类的条件（23 个）

这些条件在 `filter_options` 里存在，但没有出现在 12 类的 `categories` 树中（可能用于其它入口/未开放/旧字段）：

| 条件 | 字段 key | 控件/操作符 |
| --- | --- | --- |
| 营业状态_old | `operStatus` | 多选下拉（等于任一） |
| 解锁次数 | `convertCount` | 数值区间 |
| 有无被解锁 | `hasConvert` | 是/否 |
| 注册人员类别 | `certStaffTypeList` | 单选下拉 ＋关联：注册人员人数 |
| 注册人员专业 | `certStaffMajorList` | 单选下拉 ＋关联：注册人员人数 |
| 有无欠税公告 | `hasOwingTax` | 是/否 |
| 欠税公告发布时间 | `owingTaxDateList` | 日期区间 |
| 欠税税种 | `owingTaxTypeList` | 单选下拉 |
| 欠税余额 | `owingTaxAmountList` | 数值区间 |
| 最新发生的欠税金额 | `owingTaxAmountRecentList` | 数值区间 |
| 当前是否欠税 | `isOwingTaxCurrent` | 是/否 |
| 当前是否非正常户 | `isAbnormal` | 是/否 |
| 非正常户认定日期 | `tpAbnormalDateList` | 日期区间 |
| 有无重大税收违法 | `hasSeriousTaxIllegal` | 是/否 |
| 最新税收违法发布时间 | `tpLatestIllegalPublishDate` | 日期区间 |
| 税收违法案件性质 | `caseTypeList` | 单选下拉 |
| 注册人员数量 | `registerNumber` | 数值区间 |
| 注销原因 | `revokeReason` | 关键词（文本包含任一） |
| 吊销原因 | `deactivateReason` | 关键词（文本包含任一） |
| 破产重整公开日期 | `brPublishDateList` | 日期区间 |
| 近期是否有效网站 | `homepageReachability` | 是/否 |
| 近期验证为官网 | `hasHomepageVerified` | 是/否 |
| 是否分支机构 | `isBranch` | 是/否 |

---

## 5. 候选值字典（input_values，95 组）

条件是"下拉/树形/档位"时，候选值来自 `input_values` 字典。以下为每组字典的规模与示例（完整内容见 `exploration/configs/lightweight-configs.json`）：

| 字典 key | 规模 | 示例（前几项） |
| --- | --- | --- |
| `certTypeList` | 29 | 建筑资质、安全生产许可证、特种设备许可证、测绘资质证书、CCC、管理体系认证… |
| `regCapitalCoinType` | 19 | 人民币、美元、港币、日元、澳大利亚元、新加坡元… |
| `jdCaseOfActionList` | 18 | 合同、无因管理、不当得利纠纷、贪污贿赂、婚姻家庭、继承纠纷、非刑事赔偿、危害公共安全、海事海商纠纷… |
| `caseIdentity` | 4 | 原告、被告、当事人、第三人… |
| `fullContactPositionRelateTree` | 11 | 采购部、项目申报部、外贸部、行政部、人事部、商务部… |
| `invoiceBankHeadNameList` | 41 | 中国农业银行、中国建设银行、中国工商银行、中国银行、邮政储蓄银行、交通银行… |
| `domainServiceOnLineList` | 23 | QQ、EC云客通、Talk99、live800、网易七鱼、CC客服… |
| `industries` | 20 | 农林牧渔、采矿业、制造业、水电燃气、建筑业、批发零售… |
| `tmInternationalClassList` | 45 | 1-化学原料、2-颜料油漆、3-日化用品、4-燃料油脂、5-医药、6-金属材料… |
| `mobileNumberList` | 6 | 1个、5个、10个、20个、50个、1000个… |
| `decisionFilterList` | 2 | 二星、三星… |
| `enterpriseScaleAlgV2List` | 9 | 0、50、100、300、500、1000… |
| `unicornEnterpriseEaqType` | 2 | 中国独角兽、全球独角兽… |
| `newsSources` | 3 | 南方网、深圳网报、广州番禺网… |
| `openCourtIdentities` | 4 | 原告、被告、当事人、第三人… |
| `certStaffMajorList` | 21 | 建筑工程、市政公用工程、机电工程、水利水电工程、公路工程、房屋建筑工程… |
| `biddingRole` | 3 | 招标单位、中标单位、招标代理… |
| `appClass` | 20 | 游戏、办公、安全、生活、社交、健康… |
| `domainTechnologies` | 2 | HTML5、CSS3… |
| `annualTurnoverAlgV2List` | 11 | 1万、5万、10万、50万、100万、500万… |
| `contactSource` | 17 | 年报、官网、B2B、招聘、垂直门户、分类信息… |
| `calCertStatus` | 9 | 有效、暂停、撤销、注销、吊销、整改… |
| `caTypeList` | 9 | 起诉状副本及开庭传票、裁判文书、执行文书、起诉状、上诉状副本、开庭传票、公示催告… |
| `personNameRole` | 3 | 法定代表人、工商公示股东、主要人员… |
| `brIdentitiesList` | 2 | 申请人、被申请人… |
| `kpRelateNumberList` | 4 | 1个、2个以内、5个以内、10个以内… |
| `currentAnomalyReason` | 3 | 地址异常、年报缺失、工商异常… |
| `domainHomepageLayout` | 8 | 英文版本、400电话、社交网络、app下载、加入我们、申请试用… |
| `taxCreditRatingYearList` | 12 | 2025、2024、2023、2022、2021、2020… |
| `tungeeIndustries` | 6 | 通用制造、国际物流、物业管理、工程建筑、服装行业、纺织面料… |
| `ecrCreditType` | 4 | 一般信用企业、AEO一般认证企业、失信企业、AEO高级认证企业… |
| `operStatus` | 4 | 营业、筹建、关闭、停业… |
| `majorShareholderType` | 2 | 自然人、法人… |
| `toBeRenewedCertTypeList` | 11 | 质量管理体系认证(ISO9001)、环境管理体系认证、中国职业健康安全管理体系认证、汽车行业质量管理体系认证、建设施工行业质量管理体系认证、食品安全管理体系认证… |
| `allHolderType` | 2 | 自然人、法人… |
| `recruitingSource` | 5 | 主流渠道、行业渠道、地方渠道、兼职平台、其他渠道… |
| `arYearList` | 13 | 2025、2024、2023、2022、2021、2020… |
| `officeAddressVerifyTypes` | 4 | 地图可查、打车可达、已验厂、快递可达… |
| `notHighFreqContactTypeList` | 3 | 手机、固话、邮箱… |
| `domainStatTechnologies` | 6 | 百度统计、友盟、谷歌统计、腾讯分析、360分析、51.la统计… |
| `financingYears` | 14 | 2026、2025、2024、2023、2022、2021… |
| `businessType` | 2 | toB、toC… |
| `financingSeries` | 21 | 种子轮、天使轮、Pre-A轮、A轮、A+轮、Pre-B轮… |
| `appStores` | 9 | 华为应用市场、360手机助手、小米应用商店、应用宝、百度手机助手、vivo应用商店… |
| `institutionTypes` | 7 | 农民专业合作社（联合社）、机关单位、事业单位、社会组织、法律服务机构、学校… |
| `alterItems` | 7 | 法人/负责人变更、企业地址变更、经营范围变更、企业名称变更、股东信息变更、主要人员变更… |
| `ecrBusinessType` | 11 | 进出口货物收发货人、报关企业、报关企业分支机构、临时注册登记单位、特殊监管区双重身份企业、进出境运输工具负责人… |
| `taxQualificationList` | 4 | 一般纳税人、小规模纳税人、疑似小规模纳税人、其他… |
| `recentlyContactTypeList` | 3 | 手机、固话、邮箱… |
| `stockType` | 6 | A股、B股、新三板、新四板、港股、美股… |
| `associateContactTypeList` | 3 | 手机、固话、邮箱… |
| `caseTypeList` | 6 | 偷税案件、逃避追缴欠税案件、抗税案件、骗税案件、走逃（失联）案件、其他案件… |
| `emailFilterList` | 1 | 业务属性… |
| `prmtSources` | 2 | 百度、360… |
| `owingTaxTypeList` | 12 | 增值税、城市维护建设税、城镇土地使用税、房产税、印花税、企业所得税… |
| `enterpriseType` | 8 | 港、澳、台、个体户、国有、民营、农资、外资… |
| `tmStatusV2` | 10 | 驳回复审中、撤销/无效宣告申请审查中、初审公告、等待驳回复审、等待实质审查、商标其他情形… |
| `jdCaseTypeList` | 7 | 民事案件、执行案件、刑事案件、保全案件、行政案件、管辖案件… |
| `patentTypeList` | 4 | 发明申请、发明授权、实用新型、外观设计… |
| `factoryNature` | 2 | 自有工厂、关联工厂… |
| `phoneFilterList` | 1 | 业务属性… |
| `jdTrialRoundList` | 9 | 一审、二审、首次执行、恢复执行、财产保全执行、执行异议… |
| `jdTypeList` | 6 | 判决书、裁定书、通知书、调解书、令、其他文书… |
| `b2bBusinessModelList` | 5 | 生产厂家、经销批发、其他、商业服务、招商代理… |
| `highFreqContactTypeList` | 3 | 手机、固话、邮箱… |
| `ecSources` | 7 | 京东、苏宁、淘宝、国美、蘑菇街、1688… |
| `investmentFormList` | 10 | 货币、实物、股权、知识产权、土地使用权、劳务… |
| `operStatus_v2` | 4 | 营业、吊销、注销、其他… |
| `biddingAnncTypeList` | 6 | 招标预告、招标公告、变更补充、中标公告、采购意向、废标终止… |
| `eaqYearList` | 8 | 2026、2025、2024、2023、2022、2021… |
| `recruitingTypes` | 3 | 实习、兼职、全职… |
| `ecrIndustry` | 42 | 陆地管道运输、其他未列明专业技术服务业、广播电视卫星传输服务、其他软件开发、基础软件开发、其他卫星传输服务… |
| `cooperationRoles` | 3 | 客户、供应商、竞争对手… |
| `tmTypeList` | 45 | 化学原料、颜料油漆、日化用品、燃料油脂、医药、金属材料… |
| `taxAbnormalList` | 4 | 税务非正常户、欠税公告、重大税收违法失信、税务局行政处罚… |
| `b2bSources` | 15 | 1024商务网、258平台、E路网、globrand、中国制造交易网、中国网库… |
| `enterpriseClassification` | 2 | 销售型、生产型… |
| `taxQualificationList_explain` | dict | {'疑似小规模纳税人': '未公开披需其税务资质的企业，通常非一般纳税人，可能属于小规模纳税人'} |
| `stateOwnedTags` | 9 | 央企、央企子公司、省管国企、市管国企、国有全资企业、国有独资企业… |
| `mobileFilterList` | 1 | 业务属性… |
| `jdIdentities` | 9 | 原告、被告、上诉人、被上诉人、申请执行人、被执行人… |
| `annualTurnover` | 11 | 1万-5万、5万-10万、10万-50万、50万-100万、100万-500万、500万-1000万… |
| `eaqRecognitionLevelList` | 4 | 国家级、省级、市级、区级… |
| `holderTypeList` | 1 | 企业法人… |
| `contactPositionRelateTree` | 8 | 行政部、人事部、商务部、贸易部、市场营销部、销售部… |
| `contactDepartmentList` | 8 | 贸易部、人事部、商务部、市场营销部、销售部、业务部… |
| `useType` | 2 | 自有、租赁… |
| `cooperationCertType` | 5 | CCC、管理体系认证、自愿性产品认证、服务认证、食品农产品认证… |
| `calEnterpriseScaleLevel` | 7 | 1~50人、51~100人、101~300人、301~500人、501~1000人、1000人以上… |
| `certStaffTypeList` | 17 | 一级注册建造师、二级注册建造师、注册监理工程师、注册造价工程师、二级临时注册建造师、一级临时注册建造师… |
| `calPatentLegalStatusList` | 37 | 授权、公开、审定、实质审查的生效、专利权的终止、专利申请公布后的视为撤回… |
| `stdTypeList` | 3 | 国家标准、行业标准、团体标准… |
| `holderTypes` | 2 | 自然人、法人… |
| `ipAddress` | 564 | 中国、北京市、北京市西城区、北京市通州区、北京市顺义区、北京市石景山区… |
| `contactPositionList` | 3 | 高管、主管、员工… |

---

## 6. 备注

- `探迹线索数据` 分类在当前账号下为空（配置中 `sub_categories` 也为 0），可能需开通线索模块后才有内容。
- UI 里条件名后面的 `new`、`?` 是新增标记/帮助图标，非条件名一部分；表格已去掉。
- 「实缴比例」「探迹行业」「登记机关」等 11 个条件在本账号 UI 未展示，但配置里存在，后续可能灰度开放。
- 高级筛选页入口：`https://sales.tungee.com/customer-seeking/advanced-filter/enterprise`。
- `主营业务` 与 `业务关键词` 共用字段 key `businessKeywords`（配置中存在两条同名 value 的记录）。
