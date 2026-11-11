# 探迹页面操作实录（2026-11-09）
> 文档编号：03 ｜ 状态：历史实录（已归档，已脱敏） ｜ 最后更新：2026-11-10
> 真实登录/搜索/详情/解锁全链路记录；原始截图/HTML/日志未随仓库发布。


> 目的：用 cloak 浏览器真实登录探迹 AI 拓客（财税版），跑通「高级搜索 → 企业列表 → 企业详情 → 联系人 → 解锁企业 → 查看隐藏联系人」全链路，记录可复现的页面结构、内部接口、额度账单与风控观察，供 tanji-client 实现与 PRD 定稿使用。
> 账号：156****0075（用户授权）。**公开仓库版本已脱敏，原始记录不随仓库发布。**
> 执行方式：headful 浏览器常驻宿主 + headless 复验；全程留截图、HTML、网络请求/响应、脚本。
> 仓库说明：原始截图、HTML、网络日志与探索脚本未随仓库发布，下文相关链接仅作历史索引。
> 结果：**全链路成功**；解锁 10 家企业，额度从 819 扣到 809（每次解锁扣 1）；headless 下会话与能力全部可用。

---

## 0. 环境与工程

| 项 | 内容 |
| --- | --- |
| 操作系统 | Linux（NixOS），`/lib64/ld-linux-x86-64.so.2` 指向 stub-ld，cloak Chromium 无法直接运行 |
| 解决 | FHS 环境 `~/cloak-env/fhs.nix`（含 Node 22 + Chromium 依赖，2026-11-10 从项目迁出为共享环境），用 `nix build --impure` 构建 |
| 浏览器 | cloakbrowser 0.6.4（stealth Chromium 146；现项目已升 0.6.5）+ 持久化 profile `exploration/profile` |
| 常驻方式 | `exploration/host.mjs` 启动一次浏览器；后续通过 `/tmp/tanji-host/cmd.json` 下发动作、读 `result-<id>.json` 结果（不再反复关浏览器） |
| 驱动脚本 | `lib.mjs`（启动/录制/截图）、`send.mjs`（发命令）、`eval_file.mjs`（在页面上下文执行 JS 文件） |
| 启动命令 | `cd exploration && HOST_HEADLESS=0 DISPLAY=:0 ~/cloak-env/bin/cloak-run node host.mjs` |
| 时间 | 2026-11-09 19:31 ~ 19:43（Asia/Shanghai） |

### 0.1 FHS 构建（可复现）

```bash
# 2026-11-10 起 FHS 已迁到共享目录 ~/cloak-env
cd ~/cloak-env
NIXPKGS_ALLOW_UNFREE=1 nix build --impure --expr 'import ~/cloak-env/fhs.nix' -o ~/cloak-env/cloak-fhs
ls ~/cloak-env/cloak-fhs/bin/cloak-fhs
```

> 注意：`cloak-fhs` 的 runScript 是 bash，传参要用 `cloak-fhs -c '...'` 形式，不能再传一个 `bash`。

---

## 1. 登录

### 1.1 站点与入口

| 用途 | URL | 标题 |
| --- | --- | --- |
| 拓客主站（未登录会跳登录） | `https://sales.tungee.com` | 拓客 |
| 登录页 | `https://user.tungee.com/users/sign-in` | 账号登录 |
| 个人中心 | `https://user.tungee.com/home` | 首页 - 探迹个人中心 |
| 拓客首页（登录后） | `https://sales.tungee.com/home?entry=1` | 首页 - 探迹拓客 |

### 1.2 登录页结构

- 默认 Tab：**扫码登录**（二维码），另有「账号登录」「第三方登录」。
- 必须点可见的 `div._2me12` 中的「账号登录」（页面里还有一套隐藏的 ant-tabs 同文案节点，按文本点会命中隐藏元素超时；这是本次踩到的坑）。
- 账号登录表单：
  - 手机号：`input[placeholder="请输入手机号码"]`
  - 密码：`input[type="password"]`
  - 「自动登录」复选框：默认未勾选（本次勾选）
  - 协议复选框：**默认已勾选**（《探迹用户协议》《隐私政策》《网络服务条款》）
  - 提交按钮：`button.ant-btn-primary`，文案「登 录」
- 本次登录：**手机号 + 密码，未触发任何验证码/滑块**，提交后跳转 `user.tungee.com/home`。
- 登录后个人信息：示例用户 / 手机 156****0075 / 示例企业 / 角色：普通用户 / 产品：探迹拓客 财税版。

### 1.3 登录后的 SSO 坑（重要）

登录后直接访问 `sales.tungee.com` 会弹：

> **登录信息失效 / 请先选择登录企业** / 「我知道了」

点「我知道了」会回到 `user.tungee.com/home`。正确入口是：个人中心页面点击「探迹拓客」链接 → 跳到 `https://sales.tungee.com/home?entry=1`，此后 sales 域会话建立。

> 实现要求：会话保活要同时维持 `user.tungee.com` 与 `sales.tungee.com` 两个域的登录态；检测到「登录信息失效」弹窗时不能当成已登录。

截图：
- 01-open-entry.png（内部资料，未随仓库发布）（默认扫码页）
- 02-login-02-account-tab.png（内部资料，未随仓库发布）（账号登录表单）
- 02-login-03-filled.png（内部资料，未随仓库发布）（已填手机号/密码）
- 06-after-dialog.png（内部资料，未随仓库发布）（SSO 弹窗后回到个人中心）
- 07-sales-home-loggedin.png（内部资料，未随仓库发布）（拓客首页）

---

## 2. 页面地图／导航

左侧导航（财税版）：

```
首页
基础业务：代理记账新开、经营异常解除、税务异常解除、年报客群
同行切户：服务质量问题、同期成立企业、同行服务客户
电商客群：电商财税合规
新企商机：T+1 / T+7 / T+30 新企商机
拓客工具：企业查询、高级筛选、证书拓客、关系拓客、地图拓客、批量查询、线索初筛、解锁列表、收藏列表、线索统计
个人中心：关注动态、企业画像、任务中心、定制申请
```

本次涉及页面：

| 页面 | URL |
| --- | --- |
| 首页/工作台 | `https://sales.tungee.com/home?entry=1` |
| 高级筛选 | `https://sales.tungee.com/customer-seeking/advanced-filter/enterprise`（`/advanced-filter` 会重定向到这里） |
| 企业详情 | `https://sales.tungee.com/enterprise-details/{_id}/enterprise-information/basic-information` |
| 解锁列表 | `https://sales.tungee.com/unlock-list/enterprise` |

---

## 3. 额度体系（对应 status / credit）

### 3.1 UI 展示

首页右侧「线索额度统计（结算日 11）」：

- 本日未消耗额度，共 **500** 额度
- 个人本月额度（自然月）：剩余 **819** 额度可用，共 **1,500** 额度
- 企业本月额度：剩余 **1,060** 额度可用，共 **19,500** 额度

### 3.2 接口

**GET `/api/console/remain-lead`**（个人 + 企业额度）：

```json
{
  "individual_nearly_seven_day_unlock_nums": 215,
  "stat": 1,
  "individual_month_remain_lead": 819,
  "individual_month_limit_lead": 1500,
  "individual_day_remain_lead": 500,
  "limit_settlement_type": 0,
  "enterprise_month_remain_lead": 1060,
  "enterprise_month_limit_lead": 19500,
  "individual_day_limit_lead": 500
}
```

**GET `/api/console/info-bar`**（企业额度 + 结算日）：

```json
{"remain_day":2,"stat":1,"limit_lead":19500,"greeting":"…","remain_lead":1060,"settlement_day":11,"opened_enter_rule_count":0}
```

> `status` 实现建议：以 `remain-lead` 为主，`info-bar` 补结算日；`loggedIn` 用接口是否 401/需登录判断。

### 3.3 额度消耗实测（10 次解锁）

| 时点 | 个人月剩余 | 个人日剩余 | 企业月剩余 | 近 7 天解锁数 |
| --- | --- | --- | --- | --- |
| 解锁前 | 819 | 500 | 1060 | 215 |
| 1 家后 | 818 | 499 | 1059 | 216 |
| … | … | … | … | … |
| 10 家后 | **809** | **490** | **1050** | **225** |

**结论：解锁 1 家企业 = 扣 1 个额度点**（个人日、个人月、企业月同时各 -1）。仅打开详情页、搜索、翻页**不扣额度**；只有「解锁」动作扣。单个企业解锁后，该企业的全部联系人可见（本次最多 84 个），不按联系人数量重复扣。

---

## 4. 高级搜索

### 4.1 页面结构

- 条件组 / 模板库 两个大 Tab；「满足下列 **所有** 条件的 **企业**」。
- 按钮：添加条件、添加条件组合、筛选、清空、保存条件组、复制条件组、粘贴条件组、收起。
- 「添加条件」弹出条件面板（左侧分类 + 右侧条件芯片）：
  - 分类：**工商信息、联系方式、招聘信息、官网信息、经营状况、资质证书、媒体信息、推广信息、产品信息、风险信息、知识产权、探迹线索数据**
  - 工商信息/基础信息下可见字段：企业名称、企业简介、成立时间、登记状态、注册资本、认缴金额、认缴出资日期、实缴资本、实缴比例、注册地址、注册详细地址、国标行业、探迹行业、经营范围、企业类型（工商登记）、登记机关、机构类型、国有企业、曾用名、吊销时间、注销时间、法人关联企业数量、出资形式、营业收入、有无公开营业收入、最新营业收入金额、办公地址、有无办公地址、办公地址验证类型、办公详细地址、办公地址数量、投资任职、分支机构数量、有无对外投资、股东人数、最大股东占比、股东类型、大股东类型、全部股东类型、人员姓名、年报信息、企业年报、年报年份、参保人数、通讯地址、有无年报对外投资、纳税金额、资产总额、营业总收入、净利润、利润总额、负债总额、最新上传是否纸质年报、变更信息、最新地址变更日期、有无变更信息、变更类型、变更日期等。
  - 「智能推荐」：注册地址、手机、企业名称、注册资本、登记状态、涵盖证书类别、公司规模、经营范围、有无 Hot、企业简介……
- 本次选择：**国标行业 = 信息传输、软件和信息技术服务业**、**注册资本 100~1000 万元人民币**，点「筛选」。
- 结果：**100000+ 家**符合条件的未解锁企业；列表卡片含企业名、联系方式数、标签、规模、成立时间、注册资本、官网、国标行业；支持卡片/表格、10 条/页、页码。

截图：
- 09-advanced-filter.png（内部资料，未随仓库发布）
- 11-add-condition-menu.png（内部资料，未随仓库发布）
- 13-industry-dropdown.png（内部资料，未随仓库发布）
- 19-conditions-filled.png（内部资料，未随仓库发布）
- 20-search-results.png（内部资料，未随仓库发布）

### 4.2 搜索接口（关键）

**POST `/api/advance-search-v2`**，`multipart/form-data`：

| 字段 | 值（本次） |
| --- | --- |
| filter | `{"must":[{"industriesV2":[{"eq":[["信息传输、软件和信息技术服务业"]]}]},{"regCapitalRmb":[{"gte":100,"lte":1000}]}]}` |
| relation | `0`（所有条件） |
| start | `0`（分页起点，0-based） |
| end | `10`（分页终点） |
| sort | `{}` |
| mode | `2` |
| filter_advance_search_filter_pool | `1` |

响应结构（节选）：

```json
{
  "fields": [
    {"view_name":"企业名称","is_show":1,"is_required":1,"value":"name"},
    {"view_name":"官网","value":"homepage"},
    {"view_name":"注册资本","value":"regCapital"},
    {"view_name":"成立时间","value":"foundTime"},
    {"view_name":"联系人","value":"contactNumber"},
    {"view_name":"解锁次数","value":"convertCount"},
    {"view_name":"统一社会信用代码","value":"socialCreditCode"},
    {"view_name":"手机","value":"hasMobile"},
    {"view_name":"邮箱","value":"hasEmail"}
    /* …共 35+ 个可配置列 … */
  ],
  "stat": 1,
  "total": 100001,
  "data": [
    {
      "_id": "37623000277f335b",
      "name": "团车互联网信息服务(北京)有限公司",
      "contactNumber": 84,
      "mobileNumber": 39,
      "regCapital": {"origin": "108.000000万元人民币", "value": 1080000.0, "coinType": "人民币"},
      "regCapitalRmb": 1080000.0,
      "foundTime": "2012-05-16",
      "operStatus_v2": {"first": "营业", "second": "存续(在营、开业、在册)", "value": "存续(在营、开业、在册)"},
      "enterpriseScaleAlgV2": {"min": 1000, "max": 5000},
      "firstIndustriesV2": ["信息传输、软件和信息技术服务业"],
      "secondIndustriesV2": ["互联网和相关服务"],
      "thirdIndustriesV2": ["互联网信息服务"],
      "fourthIndustriesV2": ["互联网其他信息服务"],
      "homepage": "www.tuanche.cn",
      "listedLabelList": ["美股(TC)"],
      "isHighTechEnterprise": 1,
      "hasPhone": 1, "hasMobile": 1, "hasEmail": 0,
      "hasKeyDecisionKp": 1, "hasKeyman": 1
    }
  ]
}
```

相关辅助接口：
- `GET /api/advance-search/lightweight-configs`
- `GET /api/advance-search/hide-conditions`
- `GET /api/advance-search/dimensionIntroduce/get?type=enterprise`
- `GET /api/advance-search/get-personal-custom-columns?customType=enterprise`
- `POST /api/advance-search/canary-intelligent-recommend`
- `POST /api/track/advance-search/query`（埋点）
- `GET /security-api/tonxis/init?o=…&c=1&t=…`（探迹风控 SDK 初始化）

> 分页验证：`start=10,end=20` 可取得第 2 页，total 仍 100001。

---

## 5. 企业列表

- 每页 10 条，页码 1..10，可跳页；卡片/表格两种视图；「未解锁企业」筛选。
- 列表项字段：企业 logo、名称、营业状态、标签（上市/瞪羚/高新/专精特新/科技型中小企业等）、联系方式数、规模、成立时间、注册资本、官网、国标行业。
- 列表来源与搜索同一接口，翻页改 `start/end`。

---

## 6. 企业详情

### 6.1 URL 与结构

`/enterprise-details/{_id}/enterprise-information/basic-information`，页面标题 `<企业名> 企业的详情页 - 探迹拓客`。

顶部：企业名、营业状态、标签、更新时间、法定代表人、国标行业、官网、人员规模、年营业额、注册地址、主营业务、附近企业、**解锁** 按钮。

Tab：`企业信息 | 财税信息 | 企业图谱 | 跟进记录 | 员工人脉 {N}`；企业信息下二级：`基本信息 | 公司发展 | 经营信息 | 产品数据 | 风险信息 | 知识产权 | 招投标 | 企业年报`，以及 `公司简介 | 工商信息 | 股东信息 | 主要人员 | 对外投资 | 财务数据 | 分支机构 | 总公司 | 工商变更 | 办公地址` 等块。

### 6.2 字段（工商信息，真实样例）

| 字段 | 团车样例 |
| --- | --- |
| 法定代表人 | 闻伟（关联 43 家企业） |
| 统一社会信用代码 | 91110000596018112D |
| 组织机构代码 | 59601811-2 |
| 公司类型 | 有限责任公司(自然人投资或控股) |
| 注册号 | 110108014908027 |
| 登记状态 | 营业 |
| 营业期限 | 2012-05-16 至 2032-05-15 |
| 注册资本 | 108 万人民币 |
| 实缴资本 | -- |
| 成立日期 | 2012-05-16 |
| 核准日期 | 2026-07-16 |
| 登记机关 | 北京市海淀区市场监督管理局 |
| 公司规模 | 1000-5000 人 |
| 参保人数 | 1 人（集团参保 4 人） |
| 英文名称 | TuanChe Limited |
| 所属行业 | 信息传输、软件和信息技术服务业 > 互联网和相关服务 > 互联网信息服务 > 互联网其他信息服务 |
| 注册地址 | 北京市海淀区羊坊店路 21 号 9 层 922 |
| 经营范围 | （长文本，页面完整展示） |

其他块：股东信息（持股比例/认缴金额/认缴日期）、主要人员、对外投资、分支机构、工商变更、办公地址（来源筛选/标签筛选，含地图/快递/招聘等来源）。

### 6.3 详情页接口（部分）

| 接口 | 说明 |
| --- | --- |
| `GET /api/enterprise/lead/info?enterprise_id=` | 线索信息（creator、rate、join_time、crm 状态） |
| `GET /api/enterprise/info/contact-tab-count?enterprise_id=` | `{contact:84, hasAssociateContact:1, hasOptimalRelateContact:0}` |
| `GET /api/lead/contact/top-n-contacts?enterprise_id=&take_count=5` | `contact_basic_info` 汇总（手机/固话/邮箱数量、部门、职位等） |
| `GET /api/lead/optimal-relate-contacts?enterprise_id=` | 优选关联联系人 |
| `GET /api/lead/query-contacts?enterprise_id=` | **联系人列表（核心）** |
| `GET /api/lead/contact/tags?version=v2` | 标签字典（邮箱/外呼/客户意向/关键人/非关键人） |
| `GET /api/lead/contact/follow-sources` | 关注来源 |

---

## 7. 联系人（解锁前 / 解锁后）

### 7.1 解锁前（隐藏状态）

以「山东润达信息技术有限公司」为例（未解锁）：

- 右侧栏：锁图标 + **「解锁企业并查看 48 个联系方式」**，联系人行是模糊/占位；手机/固话/邮箱 Tab 不可用。
- 接口 `GET /api/lead/query-contacts?enterprise_id=3762301133ff393b` 返回：

```json
{"status": 4, "stat": 1, "lead": null, "contacts": []}
```

即**未解锁时联系人接口不返回任何数据**，必须解锁。

截图：31-locked-company.png（内部资料，未随仓库发布）

### 7.2 解锁后（可见状态）

以「团车」为例，解锁后 `query-contacts` 返回 84 个联系人（节选）：

```json
{
  "status": 2,
  "stat": 1,
  "lead": {"enterprise_name": "团车互联网信息服务(北京)有限公司", "creator": {"name": "宋"}, "join_time": 1794224324, "has_been_released": false, "in_pool": false},
  "contacts": [
    {
      "contactName": "闻*",
      "contact_label": "139****0132",
      "contact": "1x_N>,scR?-",
      "department": "财务部",
      "region": "北京",
      "has_hidden": "0",
      "has_unlocked": true,
      "contactType": 0,
      "is_key_lead": true,
      "engage_tag": "实号",
      "contactSource": "",
      "detect_tag": "1",
      "duplicateFamilyName": "与法人同姓"
    },
    {
      "contactName": "王**",
      "contact_label": "138****8161",
      "contactType": 0,
      "contactSource": "政务公示平台",
      "recommend": 1
    },
    {
      "contact_label": "130****2248",
      "contactName": "杜**",
      "contactSource": "2023年年报"
    }
  ]
}
```

要点：
- **`contact_label` 是明文手机号/固话/邮箱**；`contact` 是密文字段（如 `1x_N>,scR?-`）。
- `contactName` 仍部分脱敏（闻*、王**）。
- `contactType`：**0=手机，1=固话，2=邮箱**（从样例归纳：`0536-8890371`、`010-82828236` 为 1；`macm6811@sina.com` 为 2）。
- 还有 `has_hidden`、`has_unlocked`、`is_key_lead`、`engage_tag`（实号）、部门、地区、来源、标签等字段。
- 解锁后 UI 右侧显示「手机 39 / 固话 22 / 邮箱 23 / 关联公司」及联系人卡片；「查看全部联系方式」在页内展开更多行。

截图：
- 22-company-detail.png（内部资料，未随仓库发布）（解锁前右侧锁定）
- 24-detail-unlocked.png（内部资料，未随仓库发布）（解锁后联系人）
- 25-contacts-visible.png（内部资料，未随仓库发布）
- 26-all-contacts.png（内部资料，未随仓库发布）（展开全部联系方式）

---

## 8. 解锁企业

### 8.1 流程

1. 打开企业详情页（未解锁时右侧显示锁定）。
2. 点击右侧「解锁企业并查看」链接（`a._3jyVD`）或顶部「解 锁」按钮。
3. **本次没有二次确认弹窗**，直接调接口并扣 1 额度；出现「解锁成功」toast，页面出现「解锁人：宋」。
4. 联系人立即可见（手机/固话/邮箱）。

### 8.2 解锁接口

**PUT `/api/lead/unlock`**，`multipart/form-data`：

| 字段 | 值 |
| --- | --- |
| source | `4` |
| enterprise_id | 企业 `_id` |
| entity_type | `enterprise` |

响应：`{"stat":1, ...}` 成功。失败未见（本次全部成功）。

### 8.3 本次解锁的 10 家企业与结果

| # | 企业 | `_id` | 解锁联系人数量 | 首个联系人样例 | 解锁时间 |
| --- | --- | --- | --- | --- | --- |
| 1 | 团车互联网信息服务（北京）有限公司 | `37623000277f335b` | 84 | 139****0132 闻*（财务部）；138****8161 王** | 19:38 |
| 2 | 武汉伟创聚赢科技有限公司 | `577dd24e843215d5` | 51 | 181****5809 陈*；189****8878 郭* | 19:40 |
| 3 | 潍坊恩源信息科技有限公司 | `37622fbf98053877` | 39 | 133****5977 宫**；159****7538 国** | 19:40 |
| 4 | 广州云积软件技术有限公司 | `37622fbc83853ddd` | 25 | 139****8785 张*；133****8189 郑* | 19:40 |
| 5 | 北京美飒格松柏科技发展有限公司 | `37622fea7f0536b8` | 26 | 138****2618 余*；133****8281 翟** | 19:40 |
| 6 | 潍坊中财信信息科技股份有限公司 | `37622fdf7b053a96` | 34 | 136****6711 刘**；0536-8890371 黄** | 19:41 |
| 7 | 云峰核信科技（武汉）股份有限公司 | `37622ff78a3f3d9c` | 15 | 189****5061 张**；133****7538 张** | 19:41 |
| 8 | 北京七兆科技有限公司 | `37622fcb6c853a65` | 41 | 137****0692 甘** | 19:41 |
| 9 | 湖北窗口科技有限公司 | `37622fc64b453395` | 93 | 133****8927 周** | 19:41 |
| 10 | 北京中软信通软件技术有限公司 | `37622ffcf17f3e08` | 10 | 136****5808 马**；176****0576 | 19:41 |

> 数量以搜索接口 `contactNumber` 为准；`query-contacts` 返回条数与之一致（团车 84、武汉伟创 51、潍坊恩源 39……）。

### 8.4 额度账单

见第 3.3 节：819 → 809（10 次解锁），日 500 → 490，企业 1060 → 1050。

### 8.5 解锁列表页

`https://sales.tungee.com/unlock-list/enterprise`（标题「解锁企业 - 探迹拓客」）：

- 顶部统计：**共有 1000 个已解锁的企业，已选择 0 个**。
- 列表列：主体名称、联系方式（优先 Hot）、解锁人、解锁时间；筛选：企业名称、解锁时间、解锁人、CRM 状态。
- 本次 10 家均出现在列表，解锁人「宋」，时间 19:38–19:41。
- **账号是多人共享的**：列表里还有「安旭7」「安旭6」「曹小莹」等解锁记录（更早时间），部分联系人显示为 `151****6942 王* 查看号码`。
- 风险/开放问题：个人额度按「解锁人」计，共享账号下别人解锁会消耗各自额度；「查看号码」的可见性规则还需要产品层面确认。

截图：32-unlock-list.png（内部资料，未随仓库发布）

---

## 9. Headless 复验（用户要求）

| 验证项 | 结果 |
| --- | --- |
| 启动方式 | `HOST_HEADLESS=1 … node host.mjs`，cloak headless |
| profile 复用 | 无需重新登录，直接访问 `sales.tungee.com/home?entry=1` 成功 |
| 额度接口 | `remain-lead` 返回 809 / 490 / 1050，与 headful 结束时一致 |
| 搜索 | `advance-search-v2` 返回 total 100001，第 2 页 id 正常 |
| 详情 | 团车详情页正常打开 |
| 联系人 | `query-contacts` 返回 84 条，手机号明文可见（139****0132 闻*…） |
| 截图 | 33-headless-detail.png（内部资料，未随仓库发布）（headless 渲染同样完整） |

**结论：headless 下会话保活与全部核心能力可用，cloak 的 stealth 指纹未影响探迹页面。**

---

## 10. 风控与安全观察

- 页面加载 `GET /security-api/tonxis/init?o=…&c=1&t=…`，存在探迹自有安全/风控 SDK（tonxis）。
- 本次登录、搜索、详情、解锁全程**未触发验证码/滑块/短信**；未出现封禁或限流提示。
- 未登录访问接口返回 401（正常）。
- 已知风控相关端点：`/api/track/advance-search/query`（埋点）、`/security-api/tonxis/init`。
- 共享账号下存在多用户（宋、安旭6、安旭7、曹小莹），个人额度独立；「查看号码」说明存在按解锁人/权限的可见性控制。

**建议**：客户端控制频率（默认 20 次/分、翻页 ≤5 页）、随机延迟、单实例；解锁前确认额度；账号仅本人/授权使用。

---

## 11. 对 tanji-client 实现的建议（基于本次实测）

1. **技术路线**：页面上下文内调用探迹内部接口（`advance-search-v2`、`query-contacts`、`lead/unlock`、`remain-lead`）为主，DOM 点击/读取作兜底与验收。两条路都已在同一 cloak 会话中验证可行。
2. **能力映射**：
   - `name search` → 可复用 `advance-search-v2`（`filter` 里放企业名称条件，或走搜索框接口）。
   - `advance search` → `advance-search-v2`（结构化条件，`start/end` 分页）。
   - `company list` → 同接口 + 缓存 + 去重（`_id` / `socialCreditCode`）。
   - `company detail` → 详情页 + `query-contacts`（联系人）。
   - `unlock` → `PUT /api/lead/unlock`（source=4, enterprise_id, entity_type=enterprise），消耗 1 额度。
   - `status` → `GET /api/console/remain-lead`（+ `info-bar` 补结算日）。
3. **登录保活**：需处理 `user.tungee.com` ↔ `sales.tungee.com` 的 SSO（登录后要进入 `sales.tungee.com/home?entry=1`）；检测「登录信息失效/请先选择登录企业」弹窗；掉线时重登并重新走入口。
4. **额度策略**：详情页与搜索不扣额度；解锁扣 1。缓存详情/联系人可避免重复解锁；`status` 返回日/月/企业三层额度。
5. **数据模型**：企业主键 `_id`；去重键优先 `socialCreditCode`（统一社会信用代码），否则 `_id`；联系人字段见第 7 节。
6. **风险点**：探迹可能改版（接口/字段名变化）；tonxis 风控；共享账号权限与「查看号码」规则；headful/headless 均可用但建议常驻 headless + 必要时人工过验证码。

---

## 12. 产物清单

| 路径 | 内容 |
| --- | --- |
| `exploration/host.mjs` | 常驻浏览器宿主（命令文件驱动，单实例） |
| `exploration/lib.mjs` | cloak 启动、网络录制、截图/HTML/页面结构采集 |
| `exploration/send.mjs` / `eval_file.mjs` | 命令发送 / 页面上下文执行 JS 文件 |
| `exploration/01_open_entry.mjs` ~ `04_open_sales.mjs` | 分阶段脚本（入口/登录/进应用） |
| `exploration/batch_unlock.js` | 批量解锁 8 家 + 抓联系人 + 抓额度 |
| `exploration/fetch_page2.js` | 搜索第 2 页（验证分页） |
| `~/cloak-env/` | 共享 FHS 环境 + cloakbrowser 包（原 `exploration/cloak-fhs.nix` 已迁出） |
| `exploration/screenshots/` | 34 张关键截图（登录/搜索/详情/解锁/headless） |
| `exploration/html/` | 页面 HTML 快照（含登录页、详情页） |
| `exploration/logs/` | 网络请求/响应、控制台、页面结构 JSON、`upstream-summary.json`、`contacts-by-id.json` |
| `exploration/profile/` | cloak 持久化 profile（登录态） |

### 12.1 网络日志命名

- `host-<ts>-requests.json` / `responses.json`：当前会话累计请求/响应（按 saveLogs 时点切分）
- `host-<ts>-console.json` / `errors.json`：页面控制台与异常
- `<tag>-pageinfo.json`：页面文本/输入框/按钮/链接快照
- `upstream-summary.json`：额度时间线、联系人接口结果、搜索响应摘要

---

## 13. 本次未覆盖 / 待补充

- 超过 10 家的大批量解锁（额度消耗、风控阈值）。
- 解锁已解锁企业（是否幂等、是否重复扣额度）。
- 「查看号码」权限规则（共享账号下别人的解锁记录）。
- 企业详情其它 Tab（财税信息/企业图谱/跟进记录/员工人脉）的接口与字段。
- 批量查询、地图拓客：按用户要求**本轮不探索**。
- 企业查询（找企业）：已单独整理为 [`05-enterprise-search.md`](./05-enterprise-search.md)。
- 高级筛选全量条件：已单独整理为 [`04-filter-catalog.md`](./04-filter-catalog.md)。
- 真实掉线场景（cookie 过期、被踢）下的重登与 SSO 恢复演练。
- 长时间 headless 运行的稳定性与内存占用。
