# 探迹「企业查询 / 找企业」实录（2026-11-09）
> 文档编号：05 ｜ 状态：历史实录（已归档） ｜ 最后更新：2026-11-10
> “找企业”入口、搜索范围与结果字段实测。


> 仓库说明：原始截图与日志未随仓库发布。
>
> 目标：摸清「企业查询」入口的页面结构、搜索范围、筛选参数、结果字段与接口，作为 tanji-client `name search` 能力的实现依据。
> 说明：按用户要求，**批量查询与地图拓客本轮不探索**；「高级筛选」已单独整理为 [`04-filter-catalog.md`](./04-filter-catalog.md)。
> 账号 156****0075（财税版），headless 常驻 cloak 浏览器实测。

---

## 1. 入口与页面

| 项 | 内容 |
| --- | --- |
| 左侧导航 | 拓客工具 → **企业查询** |
| 首页 URL | `https://sales.tungee.com/find-enterprise/homepage` |
| 首页标题 | 找企业 - 探迹拓客 |
| 结果页 URL | `https://sales.tungee.com/find-enterprise/results?key={关键词}&page={页码}` |

### 1.1 首页结构（`/find-enterprise/homepage`）

- 顶部搜索：输入框 placeholder「请输入企业名、人名、品牌名等关键词」+「查询一下」。
- 三个入口 tab：**企业数据**（默认）/ **高级筛选** / **地图拓客**；右侧「更多」按钮。
- 快捷分类 tab（ant-tabs）：
  - **新注册企业、上市企业、高新企业、独角兽企业、瞪羚企业、新列入经营异常企业**
  - 点击后调用首页列表接口，`secondaryIndustries=<tab 名称>`（如「上市企业」），不是本地过滤。
- 地区分类：全部 + 34 个省级行政区（展开）。
- 联系方式过滤：**手机、固话、有无Hot、疑似代理记账号码**。
- 企业列表：显示「精选企业 5000+ 家」，列为 企业信息 / 关键信息 / 经营范围；每页 10 条、翻页。
- 列表字段：企业名、标签（上市/高新/专精特新/瞪羚等）、营业状态、法定代表人、成立时间、注册资本、注册地址、成立时长、经营范围。

### 1.2 首页列表接口

**POST `/api/search/homepage/enterprises`**，`multipart/form-data`：

| 字段 | 值 |
| --- | --- |
| start | 0 |
| end | 10 |
| mode | 0 |
| secondaryIndustries | `新注册企业` / `上市企业` / …（默认页签即「新注册企业」） |
| filter | `{}`（地区/联系方式等过滤项会写入这里） |
| filter_advance_search_filter_pool | 1 |

响应：`{stat, total, data:[企业...]}`，`total=1000`（精选池）。企业字段与搜索结果基本一致（名称、融资/上市标签、营收、利润、规模、联系方式数、法人等）。

---

## 2. 关键词搜索

### 2.1 搜索范围（6 个 tab）→ `fields` 参数

搜索结果页顶部范围 tab：**全部 / 企业名称 / 人名 / 地址 / 统一码 / 联系方式**。实测点击每个 tab 后，搜索接口追加 `fields` 参数：

| 范围 | fields 参数 |
| --- | --- |
| 全部 | 不传 fields |
| 企业名称 | `fields=name` |
| 人名 | `fields=legalRepresentative` |
| 地址 | `fields=address.value` |
| 统一码 | `fields=socialCreditCode` |
| 联系方式 | `fields=contact` |

> URL 不携带范围参数（仅 `key` + `page`），范围保存在页面状态；实现时需自己把 `fields` 传给接口。

### 2.2 搜索接口

**GET `/api/enterprises/search`**：

```
/api/enterprises/search?start=0&end=10&keywords=团车
  &fields=legalRepresentative            # 可选，范围
  &filter={"show_associate":0}           # JSON，地区/行业/时长/关联公司
  &filter_lead=0
  &industry=financial                    # 产品线（财税版固定 financial）
  &is_canary=1
```

响应结构（节选）：

```json
{
  "total": 833,
  "search_total": 833,
  "stat": 1,
  "enterprises": [
    {
      "_id": "37623000277f335b",
      "name": "团车互联网信息服务(北京)有限公司",
      "entity_type": "enterprise",
      "status": 2,
      "operStatus": "营业 > 存续(在营、开业、在册)",
      "legalRepresentative": "闻伟",
      "legalRepresentativeId": "6a0fd251785058ef",
      "regCapital_value": 1080000.0,
      "regCapital_coinType": "人民币",
      "foundTime": "2012-05-16",
      "address": "北京市海淀区羊坊店路21号9层922",
      "address.province": "北京",
      "socialCreditCode": "91110000596018112D",
      "regNumber": "110108014908027",
      "enterpriseType": "有限责任公司(自然人投资或控股)",
      "annualTurnoverAlgValueV2": "5000万-1亿",
      "homepage": "www.tuanche.cn",
      "contactNumber": 84,
      "contact_data": [
        {
          "contact": "138****8161",         // 未解锁时为 130****2248 形式
          "contactName": "王**",
          "contactType": 0,
          "contactSource": "政务公示平台",
          "contactChannelList": [ ... ]
        }
      ],
      "lead": { "creator": {"name": "宋"}, "enterprise_id": "...", "join_time": 1794224324 },
      "follow_info": {"lead_status": 1, "crm_doc_count": 0},
      "highlight": {"name": ["<strong>团<\/strong><strong>车<\/strong>互联网信息服务(北京)有限公司"]},
      "listedLabelList": ["美股(TC)"],
      "isHighTechEnt": 1,
      "hasHotPlus": 1,
      "score": 143.69557,
      "rank_score": 25,
      "enName": ["TuanChe Limited", "..."]
    }
  ]
}
```

关键点：
- 分页用 `start/end`（0-based）；URL 的 `page` 与 `start=(page-1)*10` 对应。
- 联系人未解锁时 `contact` 为掩码（`130****2248`），已解锁企业返回明文（`138****8161`）；`contactName` 脱敏。
- `highlight` 字段带 `<strong>` 高亮片段，可用于展示。
- `contact_data` 是联系人摘要（数量见 `contactNumber`），完整联系人仍需 `query-contacts`。

### 2.3 搜索建议 / 相关搜索

| 接口 | 说明 |
| --- | --- |
| `GET /api/enterprise-names/search?keywords=团车&entity_type=enterprise` | 输入联想：返回企业名、`_id`、logo、heat、highlight |
| `GET /api/search/result-page/get-related-search-terms?keywords=团车` | 相关搜索词 |
| `GET /api/search/new-result-page/config?industry=financial` | 结果页配置（列、筛选项等） |
| `GET /api/search/get_industry_configuration/base_info` | 行业线配置（财税版 financial） |
| `GET /api/search/get-my-navigation?industry=financial` | 我的导航 |
| `GET /api/search/config/get_all_industry?industry=financial` | 全部行业配置 |

---

## 3. 结果页筛选参数

结果页左侧筛选：**省份地区 / 行业分类 / 注册时长**，都写入 `filter` JSON（不改变 URL）：

| 筛选 | filter 字段 | 值示例 |
| --- | --- | --- |
| 省份地区 | `address` | `"广东省"` |
| 行业分类 | `industryTag` | `"制造业"` |
| 注册时长 | `foundTime` | `"1-3"`（1-3 年） |
| 展示号码所关联公司（开关） | `show_associate` | `0` / `1`（默认 0） |

实测组合：

```
filter={"address":"广东省","industryTag":"制造业","foundTime":"1-3","show_associate":1}
```

- 注册时长档位：不足1年 / 1-3年 / 3-5年 / 5-10年 / 10-15年 / 15年以上 / 自定义（起止日期）。
- 地区、行业点击后面板有多选/树形结构（与高级筛选的树同源）。

---

## 4. 结果页 UI 行为

- 结果卡片：名称、标签、营业状态、法定代表人、注册资本、成立时间、年营业额、官网、注册地址、联系方式（首个号码 + 来源 + 总数「更多 N」）、股东/主要人员提示。
- 未解锁企业：号码显示掩码（如 `130****2248`），按钮「**立即解锁**」；已解锁企业：号码明文、按钮「**添加到CRM**」。
- 顶部「展示号码所关联公司」开关：切换后 `filter.show_associate` 0↔1，用于把同一号码关联的公司也纳入/排除。
- 底部翻页：页码 / 每页 10 条 / 跳至 N 页。
- 右侧「最近访问」：显示最近打开的企业（含时间），可点击回到详情。
- 搜索框 placeholder 变体：「请输入关键词，多个关键词用空格隔开」。

截图：
- 36-enterprise-search.png（内部资料，未随仓库发布）（找企业首页）
- 38-search-tuanche.png（内部资料，未随仓库发布）（搜索“团车”结果：833 家）
- 39-person-search.png（内部资料，未随仓库发布）（人名范围搜索“闻伟”：506 家）
- 40-home-current.png（内部资料，未随仓库发布）（首页快捷分类 tab）

---

## 5. 与高级筛选的关系

- 企业查询页的「高级筛选」入口 → 跳到 `https://sales.tungee.com/customer-seeking/advanced-filter/enterprise`（与 04 文档同一页面）。
- 两者数据源一致：高级筛选走 `POST /api/advance-search-v2`（结构化 filter），企业查询走 `GET /api/enterprises/search`（关键词 + `fields` + 简化 filter）。
- 实现建议：
  - `name search`（名称搜索）→ 用 `/api/enterprises/search?keywords=&fields=name`，轻量、返回公司列表；
  - 复杂条件 → 用 `/api/advance-search-v2`（见 04 的条件 key 清单）；
  - 两者结果字段不同（搜索接口含 `highlight`/`score`/`contact_data` 摘要，高级筛选接口含完整行业分级/规模等），统一到 Company 模型时做映射。

---

## 6. 待补充 / 未探索

- 结果排序方式（若页面有「相关度/最新」切换，参数待抓）。
- 地区/行业在搜索页的树形完整选项（与高级筛选同源，见 04 的 `input_values` 字典：地区、行业）。
- 行业线 `industry=financial` 之外的版本（知产版/物流版）字段差异。
- 地图拓客、批量查询：按用户要求本轮不做。
- 「更多」按钮的菜单项（点击被按钮遮挡，未展开成功）。
- 搜索页「高级筛选」点击后的 URL 需最终确认（推测为同一高级筛选页）。

---

## 7. 产物

| 路径 | 内容 |
| --- | --- |
| `exploration/logs/host-1794225189724-*` | 搜索“团车”的网络请求/响应（含 `/api/enterprises/search` 响应） |
| `exploration/logs/host-1794225222451-*` | 人名范围搜索“闻伟”的请求/响应 |
| `exploration/logs/host-1794225261482-*` ~ `...-5268388-*` | 地区/行业/时长筛选参数实测 |
| `exploration/logs/host-1794225362376-*` | `show_associate` 0→1 切换实测 |
| `exploration/screenshots/36/38/39/40-*.png` | 页面截图 |
