export type IntelligenceLanguage = "en" | "zh";

export interface LocalizableNewsItem {
  title?: string;
  summary?: string;
  tag?: string;
  source?: string;
  titleZh?: string;
  summaryZh?: string;
  zhTitle?: string;
  zhSummary?: string;
  title_cn?: string;
  summary_cn?: string;
}

export interface LocalizedNewsText {
  title: string;
  summary: string;
}

const TAG_LABELS_ZH: Record<string, string> = {
  supply_chain: "供应链",
  tech_industry: "科技产业",
  trade_macro: "贸易宏观",
  copper: "铜价",
  tariff: "关税",
  logistics: "物流",
  competitor: "竞品",
  report: "报告",
  news: "新闻",
};

const KNOWN_NEWS_ZH: Record<string, LocalizedNewsText> = {
  "New rail data requirement a ‘win’ for shippers, expert says": {
    title: "美国新增铁路数据披露要求，货主透明度有望提升",
    summary: "美国一级铁路公司将新增两项服务指标披露要求，前 BNSF 负责人认为这会提高运输服务透明度。",
  },
  "Novelis aluminum plant to resume operations following fire damage": {
    title: "Novelis 铝厂火灾后准备恢复生产",
    summary: "Novelis 已开始调试纽约工厂，预计未来几周恢复热轧产能；铝材供应节奏需继续关注。",
  },
  "Full tariff refunds for de minimis imports? US says no": {
    title: "美国反对小额进口关税全额退款",
    summary: "相关诉讼希望恢复小额进口豁免并退还符合条件货件的关税，美国司法部已提出反驳。",
  },
  "Canada’s University of Saskatchewan Acquires Quantum Computer": {
    title: "加拿大萨斯喀彻温大学采购量子计算机",
    summary: "该校将把量子计算用于健康、防务、能源和农业研究，反映科研与高性能计算投入继续升温。",
  },
  "Intelligent, Configurable I/O: Edge Autonomy, Thermal Efficiency, and Higher Uptime in Industrial Control Systems": {
    title: "工业控制系统转向智能可配置 I/O",
    summary: "可配置 I/O 技术正在提升工业控制系统灵活性、热效率和在线时间，有助于减少固定功能 I/O 带来的 SKU 和适配成本。",
  },
  "Startup Boosts Scale-Up to 1000+ GPUs in a Single Domain": {
    title: "初创公司推动单域 1000+ GPU 扩展",
    summary: "Delos Data 计划支持 1000+ GPU 的灵活拓扑扩展，AI 基础设施需求继续推动高速互连和数据中心投资。",
  },
  "Necessity is the Mother of Invention: Huawei Replaces Moore’s Law With Her’s Law": {
    title: "华为用系统级扩展应对先进制程限制",
    summary: "报道关注中国在美国 EUV 技术限制下的替代路线，半导体供应链国产化与系统级创新仍是长期变量。",
  },
  "SECO brings Modular Vision 10.1 MX95 HMI platform to market": {
    title: "SECO 推出 Modular Vision 10.1 MX95 工业 HMI 平台",
    summary: "该平台面向工业界面市场，强调实时控制和端侧 AI 加速，工业电子与自动化需求继续升级。",
  },
  "Henkel releases ultra-low viscosity Technomelt PA 6370": {
    title: "汉高发布超低粘度 Technomelt PA 6370",
    summary: "该低压成型材料面向低压电子保护应用，强调防潮、耐热、耐腐蚀和环境耐受。",
  },
  "Nexperia hooks up with Polar for MOSFET fab": {
    title: "Nexperia 与 Polar 合作生产 MOSFET",
    summary: "Nexperia 将在美国 Polar Semiconductor 代工生产功率 MOSFET，功率器件供应链继续区域化。",
  },
  "Hilarity Greets Ferrari EV": {
    title: "法拉利首款电动车外观引发调侃",
    summary: "市场讨论集中在法拉利首款电动车与大众车型的相似度，豪华电动车定位和消费者预期仍存在张力。",
  },
  "Keysight adds PCIe 7.0 receiver validation at 128 GT/s": {
    title: "是德科技新增 PCIe 7.0 接收端验证能力",
    summary: "是德科技扩展 PCIe 7.0 测试组合，支持 128 GT/s 接收端验证，高速接口测试需求继续提升。",
  },
  "Samsung strike called off as pay rise agreed": {
    title: "三星半导体罢工风险解除",
    summary: "三星半导体部门员工投票接受加薪方案，潜在供应链扰动暂时缓解。",
  },
  "Euro-processor switched on for functional assessment": {
    title: "欧洲处理器进入功能评估阶段",
    summary: "SiPearl 的 Rhea1 处理器开始 12 周 bring-up 测试，欧洲自主处理器项目进入验证阶段。",
  },
  "An active and passive dual-band GNSS L1/L5 stacked patch antenna in a 20x20x8mm package": {
    title: "Taoglas 发布 20x20x8mm 双频 GNSS 贴片天线",
    summary: "Taoglas 发布 GVLB208 系列主动/被动双频 GNSS L1/L5 堆叠贴片天线，定位设备小型化继续推进。",
  },
  "Toshiba adds to Smart MCD series for BLDC": {
    title: "东芝扩展 BLDC SmartMCD 系列",
    summary: "东芝开始提供 TB9M040FTG 样品，集成 MCU 与三相无刷直流电机驱动功率 MOSFET。",
  },
  "Thick-film resistors for high-voltage applications": {
    title: "高压应用厚膜电阻新品进入供应",
    summary: "Rhopoint Components 提供 SRT Resistor Technology 的高阻值、高压厚膜电阻，面向精密电子和传感应用。",
  },
  "OCUDU Ecosystem Foundation emerges as hub for open source RAN innovation": {
    title: "OCUDU 基金会成为开源 RAN 创新平台",
    summary: "自成立以来已有 21 家全球组织加入，开放式无线接入网生态继续扩大。",
  },
  "Broadcom expands Wi-Fi 8 chip lineup": {
    title: "Broadcom 扩展 Wi-Fi 8 芯片产品线",
    summary: "Broadcom 新增面向以太网路由器和 Mesh 网络市场的 Wi-Fi 8 芯片组，下一代网络设备需求继续前移。",
  },
  "Lightcurve brings 8-Gig to central Washington": {
    title: "Lightcurve 在华盛顿中部推出 8G 宽带",
    summary: "Lightcurve 在其光纤覆盖区域推出 8G 宽带服务，进一步提高固定宽带速率竞争。",
  },
  "CMI pursues new Central Asia gateway to Hong Kong submarine cables": {
    title: "中国移动国际规划中亚至香港海缆新通道",
    summary: "CMI 计划建设新路由，把中亚陆地光缆连接到香港海底光缆网络，区域骨干连接继续扩张。",
  },
  "Starlink could reach 100M subs by 2034 – forecast": {
    title: "预测称 Starlink 2034 年用户或达 1 亿",
    summary: "New Street Research 预计 Starlink 继续扩充容量后，2034 年全球用户可能达到 1 亿。",
  },
  "Broadband alliance report offers pros of bulk billing": {
    title: "宽带联盟报告支持多住户批量计费模式",
    summary: "Bulk Broadband Alliance 发布研究，称多住户批量宽带计费可降低消费者成本并提升竞争。",
  },
  "Eurobites: Telenor restructures to get less complicated, more 'country-centric'": {
    title: "Telenor 调整组织，强化国家市场导向",
    summary: "欧洲通信市场动态包括 Telenor 重组、卫星频谱、D2D 服务和量子安全网络合作。",
  },
  "Airtel network-slicing push in India gets unlikely backing from rival Jio": {
    title: "印度 Airtel 网络切片服务获 Jio 支持",
    summary: "Jio 支持 Airtel Priority Postpaid，显示印度运营商在 5G 网络切片商业化上形成行业共识。",
  },
  "Starlink shines where Europe's terrestrial broadband lags – Ookla": {
    title: "Ookla 称 Starlink 补足欧洲地面宽带覆盖缺口",
    summary: "Starlink 已成为欧洲地面宽带覆盖不足地区的可行家庭宽带替代方案。",
  },
  "Oil Rises on Report of Fresh US Strikes With Hormuz Still Shut": {
    title: "霍尔木兹仍未恢复，油价因美军新打击报道上涨",
    summary: "美国与伊朗围绕霍尔木兹海峡重开仍存在分歧，新的军事打击报道推动油价反弹。",
  },
  "Asian Stocks Seen Tepid on Mixed US-Iran Signals: Markets Wrap": {
    title: "美伊信号混杂，亚洲股市开局偏谨慎",
    summary: "美国和伊朗关于停战协议的信号互相矛盾，亚洲股市预期分化，原油价格上涨。",
  },
  "Gold Holds Losses as US-Iran Impasse Keeps Inflation Risk High": {
    title: "美伊僵局维持通胀风险，黄金延续跌势",
    summary: "美伊和平谈判缺乏进展，利率压力仍在，黄金维持两日跌幅。",
  },
  "Hong Kong Seeks Dominant Asia Gold Hub With New Clearing System": {
    title: "香港拟以新清算系统争夺亚洲黄金交易枢纽",
    summary: "香港计划在未来数月推出黄金清算系统，抢占亚洲黄金交易中心的先发优势。",
  },
};

function field(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function zhField(item: LocalizableNewsItem, ...keys: Array<keyof LocalizableNewsItem>): string | undefined {
  for (const key of keys) {
    const value = field(item[key]);
    if (value) return value;
  }
  return undefined;
}

function cleanEnglishSummary(summary?: string): string {
  return field(summary)?.replace(/\s*The post .*$/i, "").replace(/\s+#pressrelease\s*$/i, "").trim() || "";
}

export function localizeNewsTag(tag: string | undefined, language: IntelligenceLanguage): string {
  const value = field(tag) || "news";
  if (language !== "zh") return value;
  return TAG_LABELS_ZH[value] || "市场信号";
}

function zhFallbackTitle(item: LocalizableNewsItem): string {
  const tag = localizeNewsTag(item.tag, "zh");
  return tag === "新闻" || tag === "市场信号" ? "市场信号" : `${tag}市场信号`;
}

function zhFallbackSummary(item: LocalizableNewsItem): string {
  const source = field(item.source) || "外部新闻源";
  const tag = localizeNewsTag(item.tag, "zh");
  const category = tag === "新闻" || tag === "市场信号" ? "市场" : tag;
  return `来自 ${source} 的英文新闻源，当前暂无中文摘要；已记录为${category}相关外部信号。`;
}

export function localizeNewsItem(item: LocalizableNewsItem, language: IntelligenceLanguage): LocalizedNewsText {
  const title = field(item.title) || "-";
  const summary = cleanEnglishSummary(item.summary);
  if (language !== "zh") return { title, summary };

  const explicitTitle = zhField(item, "titleZh", "zhTitle", "title_cn");
  const explicitSummary = zhField(item, "summaryZh", "zhSummary", "summary_cn");
  if (explicitTitle || explicitSummary) {
    return {
      title: explicitTitle || title,
      summary: explicitSummary || summary,
    };
  }

  return KNOWN_NEWS_ZH[title] || {
    title: zhFallbackTitle(item),
    summary: zhFallbackSummary(item),
  };
}

export function localizeMarketNewsText(text: string | undefined, language: IntelligenceLanguage): string {
  const value = field(text) || "";
  if (language !== "zh" || !value) return value;

  const localized = Object.entries(KNOWN_NEWS_ZH).reduce(
    (current, [englishTitle, localized]) => current.split(englishTitle).join(localized.title),
    value
  );

  return localized.replace(/(动态[：:])\s*[A-Za-z][^。；\n]*(\.\.\.|…)?/g, "$1外部英文新闻源信号$2");
}
