# Financial Data Extraction — 各国企业注册数据库提取指南

> 关联技能: company-intel
> 最后更新: 2026-05-28

## 核心原则

**永远不要说"营收未公开"就放弃财务数据。** 多数国家有公开企业注册数据库，主动查询才能拿到真实营收、利润、员工数。

## 俄罗斯 — zachestnyibiznes.ru

**URL 格式：**
```
https://zachestnyibiznes.ru/company/ul/{ОГРН}_{ИНН}_ООО-{公司名}
```

**ОГРН/ИНН 获取：** 通过 `web_search` 搜 `"{公司名}" ИНН ОГРН` 或 `site:rusprofile.ru "{公司名}"`

**提取命令模板（完整版）：**
```bash
curl -sL -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" \
  "https://zachestnyibiznes.ru/company/ul/{ОГРН}_{ИНН}_ООО-{公司名}" | python3 -c "
import sys, re
html = sys.stdin.read()

# Get all text content
text = re.sub(r'<[^>]+>', '\n', html)
text = re.sub(r'[ \t]+', ' ', text)
lines = text.split('\n')

# Extract year-by-year financial data from the page
for line in lines:
    line = line.strip()
    if re.search(r'(20[12]\d|млн|тыс|руб|₽|чел|сотрудник|выручк|прибыл|расход)', line):
        if line and len(line) < 200:
            print(line)
"
```

**可提取字段：**
- 逐年营收（выручка）
- 逐年净利润（чистая прибыль）
- 逐年支出/成本（расходы）→ 分销商的采购量 ≈ 支出的 95%+
- 逐年员工数（сотрудник/чел）
- 注册资本（уставный капитал）
- 创始人/股东（учредитель）

**汇率换算：** RUB → USD 按 1 USD ≈ 80 RUB（2025 年中）

**实测案例（SNK-S / ООО «СНК-С»，ИНН 7721483847）：**
| 年份 | 营收 (млн ₽) | 折合 USD | 支出 (расходы) | 净利润 |
|------|-------------|----------|---------------|--------|
| 2025 | 524.5 | ~$6.5M | 507.6 | +16.8 |
| 2024 | 401 | ~$5.0M | 418 | -17.1 |
| 2023 | 583 | ~$7.3M | 531 | +51.8 |
| 2022 | 321 | ~$4.0M | 321 | -0.4 |
| 2021 | 516 | ~$6.4M | 494 | +22.0 |
| 2020 | 470 | ~$5.9M | 418 | +52.2 |
| 2019 | 482 | ~$6.0M | 412 | +70.5 |
| 2018 | 66.8 | ~$0.8M | 60.8 | +6.0 |

员工数：2025 年 44 人（2024 年 51 人，净减 7 人）

## 🚨 德国 — GmbH 财务数据提取限制（重要陷阱）

**核心问题：** 德国小型 GmbH（kleine Kapitalgesellschaft）只需向 Bundesanzeiger 提交**简化版资产负债表**（仅 Bilanz，不含损益表 GuV），不披露营收和采购明细。

**实际可获取数据：**
| 数据源 | 免费可得 | 付费/受限 |
|--------|---------|-----------|
| Handelsregister | 注册资本、法人、成立日期 | - |
| North Data | 基本信息、年报提交记录 | 营收/员工数（Premium 付费墙后） |
| Unternehmensregister | 年报提交状态 | 具体财报数字（需付费下载 PDF） |
| Bundesanzeiger | 年报已提交（是/否） | 简化版 Bilanzen 无营收数字 |
| databyte.de | 公司年龄、专利数 | 营收（付费墙） |
| Firmenwissen | 公司存在确认 | 财务数据（付费） |

**关键发现：**
- North Data 明确标注："Revenue numbers are only available to our premium service subscribers"
- 德国小 GmbH 的简化年报只含资产/负债总额（Bilanzsumme），**没有营收（Umsatzerlöse）数字**
- 即使年报 PDF 可下载，里面也只有资产负债表，没有损益表
- 所有第三方数据库（North Data、databyte、Firmenwissen）的营收数据全部锁在付费墙后面

**结论：德国中小型 GmbH 的真实营收和采购量几乎无法通过公开渠道获取。** 如果必须评估体量，只能通过：
1. 员工数 × 行业人均产出（估算）
2. 网站流量/SEO 排名间接推断
3. 行业排名/协会会员资格
4. 直接联系客户询问

## 英国 — Companies House

**URL：** `https://find-and-update.company-information.service.gov.uk/company/{Company Number}`

**API（免费）：**
```bash
curl -sL "https://api.company-information.service.gov.uk/company/{Company Number}/filing-history"
```

## 英国 — Companies House

**URL：** `https://find-and-update.company-information.service.gov.uk/company/{Company Number}`

**API（免费）：**
```bash
curl -sL "https://api.company-information.service.gov.uk/company/{Company Number}/filing-history"
```

## 通用技巧

1. **第一轮 web_search** → 往往只有官网和 LinkedIn，找不到财务数据
2. **第二轮 → 直奔国家企业注册库** → 用 curl + Python 解析
3. **交叉验证** → 至少两个数据源确认同一数字
4. **分销商采购量推算** → 采购成本 ≈ 营收的 95%+（毛利率通常 3-5%）
5. **制造商营收** → 看年报中的 revenue/turnover，注意自有制造 vs 贸易的区别
