import crypto from "crypto";
import fs from "fs";
import path from "path";
import { XMLParser } from "fast-xml-parser";
import { ensureDir, readJsonFile, ssaCompanyDataPath } from "../ssa-data-paths";

type Fetcher = (url: string, init?: RequestInit) => Promise<string>;

export interface RefreshIntelligenceOptions {
  fetcher?: Fetcher;
  now?: Date;
  maxNewsItems?: number;
  forceRefresh?: boolean;
}

export interface IntelligenceRefreshResult {
  success: boolean;
  workspaceId: string;
  updatedAt: string;
  newsCount: number;
  competitorCount: number;
  sources: SourceStatus[];
  cache?: {
    hit: boolean;
    feed: string;
    updatedAt?: string;
  };
  error?: string;
}

interface SourceStatus {
  source: string;
  ok: boolean;
  items?: number;
  url: string;
  error?: string;
}

interface RawNewsItem {
  id: string;
  title: string;
  titleZh: string;
  summary: string;
  summaryZh: string;
  source: string;
  time: string;
  publishTime: string;
  tag: string;
  url: string;
  reported: boolean;
  quality: number;
}

interface CopperHistoryPoint {
  date: string;
  priceUsdPerLb: number;
}

interface RssSource {
  name: string;
  url: string;
  tag: string;
  quality: number;
}

const RSS_SOURCES: RssSource[] = [
  { name: "HDMI Forum News", url: "https://hdmiforum.org/feed/", tag: "standards", quality: 5 },
  { name: "VESA News", url: "https://vesa.org/feed/", tag: "standards", quality: 5 },
  {
    name: "PR Newswire Electronic Components",
    url: "https://www.prnewswire.com/rss/electronic-components-latest-news/electronic-components-latest-news-list.rss",
    tag: "company",
    quality: 4,
  },
  {
    name: "Supply Chain Dive",
    url: "https://www.supplychaindive.com/feeds/news/",
    tag: "supply_chain",
    quality: 4,
  },
  {
    name: "EE Times",
    url: "https://www.eetimes.com/feed/",
    tag: "tech_industry",
    quality: 4,
  },
  {
    name: "Google News Discovery - cable standards",
    url: googleNewsUrl("HDMI DisplayPort USB cable standard certification connector"),
    tag: "standards",
    quality: 2,
  },
  {
    name: "Google News Discovery - copper trade",
    url: googleNewsUrl("copper price tariff trade electronics cable export"),
    tag: "trade_macro",
    quality: 2,
  },
  {
    name: "Google News Discovery - connector industry",
    url: googleNewsUrl("connector cable manufacturer product certification trade news"),
    tag: "company",
    quality: 2,
  },
];

const YAHOO_COPPER_URL = "https://query1.finance.yahoo.com/v8/finance/chart/HG=F?range=3mo&interval=1d";
const FRANKFURTER_URL = "https://api.frankfurter.dev/v1/latest?from=USD&to=CNY";
const SEC_COMPANIES = [
  { name: "Amphenol", cik: "820313", ticker: "APH" },
  { name: "TE Connectivity", cik: "1385157", ticker: "TEL" },
  { name: "Belden", cik: "913142", ticker: "BDC" },
  { name: "Corning", cik: "24741", ticker: "GLW" },
  { name: "Molex", cik: "67472", ticker: "MOLX" },
];

const BLOCKED_DOMAINS = [
  "alliedmarketresearch.com",
  "researchnester.com",
  "thebusinessresearchcompany.com",
  "grandviewresearch.com",
  "mordorintelligence.com",
  "marketresearchfuture.com",
  "statista.com",
  "openpr.com",
  "einnews.com",
  "industryarc.com",
  "precedenceresearch.com",
  "made-in-china.com",
  "alibaba.com",
  "globalsources.com",
];

const JUNK_TITLE_PATTERNS = [
  /market (size|share|forecast|report|analysis|demand|statistics|outlook)/i,
  /\$[\d.]+\s*(billion|bn).*market/i,
  /\d+(\.\d+)?%\s*cagr/i,
  /market (to (garner|reach)|is expected to)/i,
  /key (players|trends|drivers)/i,
  /segmentation by/i,
  /sample report|request sample|buy now/i,
  /top \d+ (manufacturers|suppliers|companies)/i,
  /\b(best|top)\s+.*(HDMI|DisplayPort|USB-C|Thunderbolt).*(cables?|adapters?|docks?|hubs?)/i,
  /\bI tested\b.*(HDMI|DisplayPort|USB-C|Thunderbolt).*cables?/i,
  /analysis and forecast/i,
  /market\s+\d{4}.*forecast/i,
  /market to grow/i,
  /insulated wire and cable market/i,
  /fast usb c cable market/i,
  /ISO 42001 AI management certification/i,
  /autonomous trucks/i,
  /Hall of Fame honor/i,
  /vascular care/i,
  /embolization/i,
  /\breviews by Wirecutter\b/i,
  /\bour picks\b/i,
  /\brank highest\b/i,
  /\bwhat actually works\b/i,
];

const BLOCKED_SOURCE_PATTERNS = [
  /IndexBox/i,
  /IMARC/i,
  /The Observatory of Economic Complexity/i,
  /Macworld/i,
  /How-To Geek/i,
  /bgr\.com/i,
  /VARGE/i,
  /Wirecutter/i,
  /Anker/i,
  /PCWorld/i,
  /TFTCentral/i,
  /Not a Tesla App/i,
  /The Daily Brief by Zerodha/i,
  /PricePedia/i,
];

const SALES_INTEL_KEYWORDS =
  /\b(copper|tariff|trade|customs|export|import|supply chain|freight|shipping|connector|connectors|cable|cables|wire|wiring|HDMI|DisplayPort|USB|Thunderbolt|semiconductor|electronics|certification|standard|compliance|factory|manufacturing|lead time|inventory|Amphenol|TE Connectivity|Belden|Molex|VESA)\b/i;

const DISCOVERY_TITLE_KEYWORDS =
  /\b(copper|tariff|customs|export|import|connector|connectors|cable|cables|wire|wiring|HDMI|DisplayPort|USB|USB-C|Thunderbolt|semiconductor|electronics|certification|standard|compliance|Amphenol|TE Connectivity|Belden|Molex|VESA)\b/i;

const TAG_LABELS_ZH: Record<string, string> = {
  standards: "标准认证",
  company: "企业动态",
  supply_chain: "供应链",
  tech_industry: "科技产业",
  trade_macro: "贸易宏观",
  competitor: "竞品动态",
  copper: "铜价",
  news: "市场",
};

const TAG_SUMMARY_ZH: Record<string, string> = {
  standards: "规格和认证口径有新变化。",
  company: "企业发布了新的产品或经营消息。",
  supply_chain: "交付、运力或库存端出现变化。",
  tech_industry: "下游技术路线出现新动向。",
  trade_macro: "贸易成本和采购节奏出现变化。",
  competitor: "竞品发布了新的经营动态。",
  copper: "铜价窗口出现变化。",
  news: "市场出现新的可跟进信号。",
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "text",
});

function googleNewsUrl(query: string) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query).replace(/%20/g, "+")}&hl=en-US&gl=US&ceid=US:en`;
}

async function defaultFetcher(url: string, init?: RequestInit): Promise<string> {
  const headers = new Headers(init?.headers);
  if (!headers.has("user-agent")) {
    headers.set(
      "user-agent",
      url.includes("news.google.com")
        ? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36"
        : "SSA-Intelligence/1.0"
    );
  }
  const response = await fetch(url, { ...init, headers, cache: "no-store" });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

function cleanText(value: unknown, limit = 500): string {
  const text = String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, limit);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isBlocked(url: string, title: string): boolean {
  const host = hostOf(url);
  if (!host) return true;
  if (BLOCKED_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`))) return true;
  if (JUNK_TITLE_PATTERNS.some((pattern) => pattern.test(title))) return true;
  return /[\u4e00-\u9fff]/.test(`${title} ${url}`);
}

function isRelevantSalesIntel(source: RssSource, title: string, summary: string): boolean {
  if (source.quality >= 5) return true;
  if (source.name.startsWith("Google News Discovery") && !DISCOVERY_TITLE_KEYWORDS.test(title)) return false;
  return SALES_INTEL_KEYWORDS.test(`${title} ${summary}`);
}

function sourceBrand(sourceName: string): string {
  return sourceName.replace(/\s+News$/i, "").trim();
}

function customerTitleZh(title: string, tag: string, sourceName: string): string {
  const normalized = title.replace(/\s+-\s+[^-]+$/, "").trim();
  const source = sourceBrand(sourceName);
  if (/HDMI FORUM RELEASES VERSION 2\.2/i.test(title)) return "HDMI Forum 发布 HDMI 2.2 规范";
  if (/VESA Releases DisplayPort Automotive Extension/i.test(title)) return "VESA 发布车载 DisplayPort 扩展规范";
  if (/VESA Releases Compliance Test Specification/i.test(title)) return "VESA 发布 DisplayPort 车载扩展测试规范";
  if (/Next-gen HDMI/i.test(title)) return "新一代 HDMI 带宽规格升级";
  if (/VESA to Update DisplayPort 2\.1/i.test(title)) return "VESA 将更新 DisplayPort 2.1 主动线缆规范";
  if (/VESA Adds New Performance Levels/i.test(title)) return "VESA 更新显示性能认证等级";
  if (/VESA Elevates PC and Laptop HDR Display Performance/i.test(title)) return "VESA 更新 PC 与笔记本 HDR 规范";
  if (/DisplayHDR/i.test(title)) return "VESA 更新 HDR 显示认证规范";
  if (/DisplayPort Updates and Extensions/i.test(title)) return "VESA 发布 DisplayPort 游戏与车载市场更新";
  if (/Adaptive-Sync.*Dual-Mode/i.test(title)) return "VESA 更新 Adaptive-Sync 双模式支持";
  if (/Adaptive-Sync.*Tighter Specifications/i.test(title)) return "VESA 收紧 Adaptive-Sync 显示标准";
  if (/AR\/VR Display Stream Compression/i.test(title)) return "VESA 征集 AR/VR 显示压缩需求";
  if (/consumer confusion.*display performance/i.test(title)) return "VESA 澄清显示性能认证差异";
  if (/Ultra High Speed HDMI.*Cables Now Available/i.test(title)) return "Ultra High Speed HDMI 线缆开始支持 HDMI 2.1 部署";
  if (/HDMI 2\.1.*David Glen/i.test(title)) return "HDMI Forum 解读 HDMI 2.1 应用";
  if (/NEW ULTRA HIGH SPEED HDMI.*CERTIFICATION/i.test(title)) return "HDMI 推出 8K 超高速线缆认证";
  if (/Annual Shipments.*HDMI Interface/i.test(title)) return "HDMI 设备年出货量接近十亿级";
  if (/VERSION 2\.1 OF THE HDMI SPECIFICATION/i.test(title)) return "HDMI Forum 发布 HDMI 2.1 规范";
  if (/Webinar: Answering Your Questions about HDMI 2\.1/i.test(title)) return "HDMI Forum 举办 HDMI 2.1 问答说明";
  if (/Release 2\.0a Specification/i.test(title)) return "HDMI Forum 发布 HDMI 2.0a 规范";
  if (/Engineering Award/i.test(title)) return "HDMI 接口获得电视工程奖项";
  if (/Version 2\.0 Of the HDMI Specification/i.test(title)) return "HDMI Forum 发布 HDMI 2.0 规范";
  if (/UPS invests \$50M/i.test(title)) return "UPS 加码汽车与工业物流服务";
  if (/Gartner Says Supply Chain/i.test(title)) return "Gartner：供应链面临地缘政治与 AI 挑战";
  if (/CFOs face tricky tariff refund/i.test(title)) return "美国关税退款流程带来财务处理问题";
  if (/tariff refunds.*price cuts|tariff refunds.*price strategy/i.test(title)) return "关税退款影响零售价格策略";
  if (/Trump adjusts tariffs.*copper/i.test(title)) return "美国调整钢铝铜关税";
  if (/Tariffs in the Electronics Industry/i.test(title)) return "电子行业重新评估关税成本";
  if (/US-India trade deal/i.test(title)) return "美印贸易协议提振电子出口预期";
  if (/Caution Not Celebration/i.test(title)) return "贸易分析师谨慎看待美印协议";
  if (/China Metals Demand Boosted/i.test(title)) return "中国金属需求受出口带动";
  if (/UL Solutions Inc\. Broadens Portfolio/i.test(title)) return "UL Solutions 扩大电气电子认证业务";
  if (/UL Solutions Debuts Testing and Certification Framework/i.test(title)) return "UL 推出插电式太阳能认证框架";
  if (/UCL Swift North America/i.test(title)) return "UCL Swift 北美光纤连接器在德州生产";
  if (/US Copper Import Tariffs/i.test(title)) return "美国铜进口关税影响全球贸易";
  if (/Copper Tariffs: Which Countries/i.test(title)) return "美国铜进口来源结构受关注";
  if (/Copper market pays the price/i.test(title)) return "铜价回吐前期关税溢价";
  if (/blitz of tariff announcements/i.test(title)) return "美国密集发布关税公告";
  if (/Canadian producers relieved/i.test(title)) return "加拿大铜供应商避开关键关税冲击";
  if (/ADJUSTING IMPORTS OF COPPER/i.test(title)) return "美国调整铜进口政策";
  if (/US tariff pull on copper/i.test(title)) return "美国铜关税预期拉动中国保税铜库存";
  if (/Tariffs change copper.?s trade dynamics/i.test(title)) return "铜关税改变全球贸易流向";
  if (/50% tariff hit India/i.test(title)) return "美国高关税压制印度出口";
  if (/US Copper Firms Raise Prices/i.test(title)) return "美国铜企在豁免后继续提价";
  if (/Copper Tariffs Shake Global Metal Markets/i.test(title)) return "铜关税扰动全球金属市场";
  if (/50% tariffs on copper products.*China/i.test(title)) return "美国铜制品关税引发中国影响评估";
  if (/Chile dodges.*copper/i.test(title)) return "智利避开美国铜关税冲击";
  if (/watered-down copper tariffs/i.test(title)) return "美国铜关税范围收窄压低 COMEX 溢价";
  if (/50% Tariff on Copper Imports.*Fall/i.test(title)) return "美国铜关税消息触发金属价格下跌";
  if (/Canada will be spared.*copper tariff/i.test(title)) return "加拿大避开美国铜关税";
  if (/copper-tariff tumult.*prices plunge/i.test(title)) return "铜关税细则引发价格回落";
  if (/Copper prices tumble.*excludes refined metal/i.test(title)) return "精炼铜排除在美国关税外";
  if (/scrap export restrictions/i.test(title)) return "美国铜关税可能叠加废铜出口限制";
  if (/details for 50% copper tariff/i.test(title)) return "美国公布 50% 铜关税细则";
  if (/50% tariffs on Brazil and copper/i.test(title)) return "美国对巴西和铜加征高关税";
  if (/Copper price collapses/i.test(title)) return "精炼铜豁免后铜价大幅回落";
  if (/US-China Tariff Rates/i.test(title)) return "中美关税税率变化仍影响采购成本";
  if (/Copper in the Age of AI/i.test(title)) return "AI 用电需求推高铜供应压力";
  if (/Europe.?s Copper Supply Crisis/i.test(title)) return "欧洲铜供应压力升温";
  if (/Copper joins critical minerals list/i.test(title)) return "美国将铜列入关键矿产清单";
  if (/wires & cables industry/i.test(title)) return "线缆行业景气度继续升温";
  if (/wire rod prices/i.test(title)) return "贸易壁垒推高线材价格讨论";
  if (/Chiplets, Ecosystems/i.test(title)) return "欧洲半导体策略转向 Chiplet 生态";
  if (/DisplayPort/i.test(title)) return `${source} 发布 DisplayPort 相关消息`;
  if (/HDMI/i.test(title)) return `${source} 发布 HDMI 相关消息`;
  if (/USB-C|USB C|USB/i.test(title)) return `${source} 发布 USB 相关消息`;
  if (/Thunderbolt/i.test(title)) return `${source} 发布 Thunderbolt 相关消息`;
  if (/tariff/i.test(title)) return "关税政策变化影响采购与报价";
  if (/supply chain/i.test(title)) return "供应链环境出现新变化";
  if (/copper/i.test(title)) return "铜价与贸易环境出现变化";
  if (tag === "standards") return `${source} 发布标准认证消息`;
  return normalized || title;
}

function customerSummaryZh(title: string, tag: string): string {
  if (/HDMI FORUM RELEASES VERSION 2\.2/i.test(title)) return "新规范提升带宽能力，高速 HDMI 线材规格需要同步。";
  if (/VESA Releases DisplayPort Automotive Extension/i.test(title)) return "车载 DP 规范增加安全与安全性要求，并配套可执行仿真器。";
  if (/VESA Releases Compliance Test Specification/i.test(title)) return "车载 DP 扩展测试模型发布，认证验证路径更清楚。";
  if (/Next-gen HDMI/i.test(title)) return "新一代 HDMI 支持更高分辨率和刷新率，带宽要求继续上行。";
  if (/VESA to Update DisplayPort 2\.1/i.test(title)) return "DP80 主动线缆目标长度提升至原来的约 3 倍。";
  if (/VESA Adds New Performance Levels/i.test(title)) return "ClearMR 与 DisplayHDR True Black 增加更高认证等级。";
  if (/VESA Elevates PC and Laptop HDR Display Performance/i.test(title)) return "PC 与笔记本 HDR 显示认证升级，DisplayHDR 门槛提高。";
  if (/DisplayHDR/i.test(title)) return "HDR 显示认证升级，终端厂商的高端规格口径更细。";
  if (/DisplayPort Updates and Extensions/i.test(title)) return "DisplayPort 扩展覆盖游戏和车载场景，应用范围继续扩大。";
  if (/Adaptive-Sync.*Dual-Mode/i.test(title)) return "Adaptive-Sync 增加双模式支持，游戏显示兼容性要求提高。";
  if (/Adaptive-Sync.*Tighter Specifications/i.test(title)) return "Adaptive-Sync 规格收紧，认证设备需要满足更严格指标。";
  if (/AR\/VR Display Stream Compression/i.test(title)) return "VESA 开始收集 AR/VR 显示压缩需求，高带宽显示链路受关注。";
  if (/consumer confusion.*display performance/i.test(title)) return "VESA 澄清显示性能标识，减少 ClearMR 与其他认证混淆。";
  if (/Ultra High Speed HDMI.*Cables Now Available/i.test(title)) return "超高速 HDMI 线材进入可用阶段，支撑 HDMI 2.1 端到端部署。";
  if (/HDMI 2\.1.*David Glen/i.test(title)) return "HDMI Forum 对 HDMI 2.1 关键能力和部署问题做公开说明。";
  if (/NEW ULTRA HIGH SPEED HDMI.*CERTIFICATION/i.test(title)) return "8K 超高速 HDMI 认证推出，覆盖 HDMI 2.1 全部功能支持。";
  if (/Annual Shipments.*HDMI Interface/i.test(title)) return "HDMI 接口设备年出货接近十亿级，生态规模仍然很大。";
  if (/VERSION 2\.1 OF THE HDMI SPECIFICATION/i.test(title)) return "HDMI 2.1 发布，带宽、刷新率和影音功能进一步升级。";
  if (/Webinar: Answering Your Questions about HDMI 2\.1/i.test(title)) return "HDMI Forum 通过问答形式解释 HDMI 2.1 的部署问题。";
  if (/Release 2\.0a Specification/i.test(title)) return "HDMI 2.0a 规范发布，显示链路能力继续演进。";
  if (/Engineering Award/i.test(title)) return "HDMI 接口获得电视工程奖，生态影响力被行业认可。";
  if (/Version 2\.0 Of the HDMI Specification/i.test(title)) return "HDMI 2.0 发布，高速影音传输规格进一步升级。";
  if (/UPS invests \$50M/i.test(title)) return "UPS 加码汽车与工业物流，北美重货交付时效可能改善。";
  if (/Gartner Says Supply Chain/i.test(title)) return "Gartner 提醒供应链团队同时面对地缘风险和 AI 变革。";
  if (/CFOs face tricky tariff refund/i.test(title)) return "关税退款流程升温，财务确认和价格策略仍复杂。";
  if (/tariff refunds.*price cuts/i.test(title)) return "E.l.f 预计关税退款可支持后续降价。";
  if (/tariff refunds.*price strategy/i.test(title)) return "Walmart 将关税退款与价格策略挂钩。";
  if (/Trump adjusts tariffs.*copper/i.test(title)) return "美国调整钢、铝、铜关税安排，金属成本继续受政策影响。";
  if (/Tariffs in the Electronics Industry/i.test(title)) return "电子行业重新核算关税、BOM 成本和供应链选择。";
  if (/US-India trade deal/i.test(title)) return "美印关税下调提升印度电子制造出口预期。";
  if (/Caution Not Celebration/i.test(title)) return "分析师认为美印协议仍需看执行细节，不能过早乐观。";
  if (/China Metals Demand Boosted/i.test(title)) return "出口需求拉动中国金属消费，铜等原材料采购节奏可能加快。";
  if (/UL Solutions Inc\. Broadens Portfolio/i.test(title)) return "UL Solutions 收购电气电子认证业务，测试认证服务能力扩张。";
  if (/UL Solutions Debuts Testing and Certification Framework/i.test(title)) return "美国插电式太阳能产品认证路径更清楚，电源连接合规要求提高。";
  if (/UCL Swift North America/i.test(title)) return "光纤连接器在德州本地生产，北美交付与原产地卖点增强。";
  if (/US Copper Import Tariffs/i.test(title)) return "美国铜进口关税变化可能抬升线缆材料成本。";
  if (/Copper Tariffs: Which Countries/i.test(title)) return "美国铜进口来源结构受关注，采购国别可能重新评估。";
  if (/Copper market pays the price/i.test(title)) return "铜价回吐关税溢价，短期报价窗口继续波动。";
  if (/blitz of tariff announcements/i.test(title)) return "美国集中发布铜、巴西、韩国和小额进口关税消息。";
  if (/Canadian producers relieved/i.test(title)) return "加拿大关键铜产品暂避 50% 关税，北美供应路径更稳。";
  if (/ADJUSTING IMPORTS OF COPPER/i.test(title)) return "白宫调整铜进口政策，后续仍需看执行品类。";
  if (/US tariff pull on copper/i.test(title)) return "美国铜关税预期吸走中国保税库存，现货供应更紧。";
  if (/Tariffs change copper.?s trade dynamics/i.test(title)) return "铜关税改变贸易流向，区域价差和交付节奏会被重新定价。";
  if (/50% tariff hit India/i.test(title)) return "印度出口面临美国高关税压力，替代供应链机会需要观察。";
  if (/US Copper Firms Raise Prices/i.test(title)) return "美国铜企仍在提价，关税豁免未完全缓解材料成本。";
  if (/Copper Tariffs Shake Global Metal Markets/i.test(title)) return "铜关税扰动全球金属市场，短期报价波动加大。";
  if (/50% tariffs on copper products.*China/i.test(title)) return "美国铜制品关税落地后，中国出口影响仍需分品类判断。";
  if (/Chile dodges.*copper/i.test(title)) return "智利避开美国铜关税，南美铜供应竞争力短期增强。";
  if (/watered-down copper tariffs/i.test(title)) return "美国铜关税范围收窄，COMEX 溢价被快速压低。";
  if (/50% Tariff on Copper Imports.*Fall/i.test(title)) return "市场重新定价美国铜关税影响，金属价格出现回落。";
  if (/Canada will be spared.*copper tariff/i.test(title)) return "加拿大铜供应避开关税，美国采购替代路径更明确。";
  if (/copper-tariff tumult.*prices plunge/i.test(title)) return "铜关税细则低于市场预期，价格从高位回落。";
  if (/Copper prices tumble.*excludes refined metal/i.test(title)) return "精炼铜被排除在关税外，进口成本压力阶段性缓和。";
  if (/scrap export restrictions/i.test(title)) return "美国铜关税可能限制废铜出口，回收料流向需要关注。";
  if (/details for 50% copper tariff/i.test(title)) return "50% 铜关税细则公布，铜制品成本和订单节奏需重算。";
  if (/50% tariffs on Brazil and copper/i.test(title)) return "美国同步加码巴西与铜关税，贸易摩擦范围扩大。";
  if (/Copper price collapses/i.test(title)) return "精炼铜豁免削弱关税冲击预期，铜价快速下修。";
  if (/US-China Tariff Rates/i.test(title)) return "中美关税税率仍影响采购成本和订单节奏。";
  if (/Copper in the Age of AI/i.test(title)) return "AI、电气化和电网投资推高铜需求，供应压力被放大。";
  if (/Europe.?s Copper Supply Crisis/i.test(title)) return "欧洲制造业担心铜供应紧张拖累生产。";
  if (/Copper joins critical minerals list/i.test(title)) return "铜进入美国关键矿产清单，政策关注度提高。";
  if (/wires & cables industry/i.test(title)) return "线缆板块受电力、基建和数据中心需求带动。";
  if (/wire rod prices/i.test(title)) return "贸易壁垒被认为会推高线材价格。";
  if (/Chiplets, Ecosystems/i.test(title)) return "欧洲半导体策略转向 Chiplet 生态，先进互连需求继续增加。";
  if (/HDMI/i.test(title)) return "HDMI 相关规格、认证或应用消息更新。";
  if (/DisplayPort|VESA/i.test(title)) return "DisplayPort 相关规格、认证或应用消息更新。";
  if (/USB-C|USB C|USB/i.test(title)) return "USB 相关接口、认证或应用消息更新。";
  if (/Thunderbolt/i.test(title)) return "Thunderbolt 相关接口或应用消息更新。";
  if (/tariff/i.test(title)) return "关税政策变化影响出口报价和客户采购节奏。";
  if (/copper/i.test(title)) return "铜相关市场波动影响线缆成本窗口。";
  if (/supply chain/i.test(title)) return "供应链消息显示交期、运力或库存正在变化。";
  if (/certification|standard|compliance/i.test(title)) return "认证或合规要求有新变化。";
  return TAG_SUMMARY_ZH[tag] || TAG_SUMMARY_ZH.news;
}

const SEC_8K_ITEM_LABELS: Record<string, string> = {
  "1.01": "重要协议",
  "2.02": "业绩数据",
  "2.03": "融资安排",
  "2.05": "成本调整",
  "2.06": "资产减值",
  "3.01": "上市规则通知",
  "5.02": "董事或高管变动",
  "5.07": "股东大会结果",
  "7.01": "投资者材料",
  "8.01": "其他重要事项",
  "9.01": "财务附件",
};

function sec8kItemLabels(itemCodes: string[]): string[] {
  const labels = itemCodes
    .map((code) => SEC_8K_ITEM_LABELS[code])
    .filter((label): label is string => Boolean(label));
  return [...new Set(labels)];
}

function extractSec8kItems(raw: string): string[] {
  const text = cleanText(raw, 16000);
  const codes = [...text.matchAll(/\bItem\s+(\d{1,2}\.\d{2})\b/gi)].map((match) => match[1]);
  return [...new Set(codes)];
}

async function fetchSec8kItems(fetcher: Fetcher, filingUrl: string): Promise<string[]> {
  try {
    const raw = await fetcher(filingUrl, { headers: { accept: "text/html, text/plain, */*" } });
    return extractSec8kItems(raw);
  } catch {
    return [];
  }
}

function competitorTitleZh(company: string, form: string, itemCodes: string[]): string {
  if (form === "10-Q") return `${company} 发布季度报告`;
  if (form === "10-K") return `${company} 发布年度报告`;
  if (form === "8-K") {
    const labels = primarySec8kItemLabels(itemCodes);
    return labels.length ? `${company} 披露${labels.slice(0, 2).join("、")}` : `${company} 发布 8-K 公告`;
  }
  return `${company} 发布公开披露`;
}

function primarySec8kItemLabels(itemCodes: string[]): string[] {
  const labels = sec8kItemLabels(itemCodes);
  const primary = labels.filter((label) => label !== "财务附件");
  return primary.length ? primary : labels;
}

function competitorDetailZh(company: string, form: string, itemCodes: string[] = []): string {
  if (form === "10-Q") {
    return "季度财报已发布，重点看收入、订单、库存和汽车/工业需求。";
  }
  if (form === "10-K") {
    return "年度报告已发布，重点看全年订单结构、库存和资本开支。";
  }
  if (form === "8-K") {
    const labels = primarySec8kItemLabels(itemCodes);
    if (labels.length) return `${company} 8-K：${labels.slice(0, 3).join("、")}。`;
    return `${company} 8-K 公告已发布，原文事项待读取。`;
  }
  return `${company} 发布公开披露。`;
}

function itemId(url: string, title: string): string {
  return crypto.createHash("sha256").update(`${url || title}`.toLowerCase()).digest("hex").slice(0, 16);
}

function parseDate(value: unknown, now: Date): string {
  const text = String(value || "");
  const parsed = text ? new Date(text) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed.toISOString();
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  if (match) return new Date(`${match[0]}T00:00:00.000Z`).toISOString();
  return now.toISOString();
}

function arrayOf<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function parseRss(raw: string, source: RssSource, now: Date): RawNewsItem[] {
  const data = parser.parse(raw.trimStart());
  const channelItems = arrayOf(data?.rss?.channel?.item);
  const atomItems = arrayOf(data?.feed?.entry);
  const items = [...channelItems, ...atomItems];

  return items.flatMap((entry: Record<string, unknown>) => {
    const title = cleanText(entry.title, 220);
    const linkValue = typeof entry.link === "object" && entry.link !== null
      ? String((entry.link as Record<string, unknown>).href || "")
      : String(entry.link || "");
    const url = cleanText(linkValue, 800);
    if (!title || !url || isBlocked(url, title)) return [];

    const sourceName = cleanText((entry.source as Record<string, unknown> | undefined)?.text || entry.source || source.name, 120) || source.name;
    if (BLOCKED_SOURCE_PATTERNS.some((pattern) => pattern.test(sourceName))) return [];
    const description = cleanText(entry.description || entry.summary || entry.content, 500);
    if (!isRelevantSalesIntel(source, title, description)) return [];
    const publishTime = parseDate(entry.pubDate || entry.published || entry.updated, now);
    const tagLabel = TAG_LABELS_ZH[source.tag] || "市场";

    return [{
      id: itemId(url, title),
      title,
      titleZh: customerTitleZh(title, source.tag, sourceName),
      summary: description,
      summaryZh: customerSummaryZh(title, source.tag),
      source: sourceName,
      time: publishTime.slice(0, 10),
      publishTime,
      tag: source.tag,
      url,
      reported: false,
      quality: source.quality,
    }];
  });
}

function dedupeNews(items: RawNewsItem[]): RawNewsItem[] {
  const seen = new Set<string>();
  const result: RawNewsItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result.sort((a, b) => {
    if (b.quality !== a.quality) return b.quality - a.quality;
    return b.publishTime.localeCompare(a.publishTime);
  });
}

async function collectRssNews(fetcher: Fetcher, now: Date): Promise<{ news: RawNewsItem[]; statuses: SourceStatus[] }> {
  const news: RawNewsItem[] = [];
  const statuses: SourceStatus[] = [];
  for (const source of RSS_SOURCES) {
    try {
      const raw = await fetcher(source.url, { headers: { accept: "application/rss+xml, application/xml, text/xml, */*" } });
      const items = parseRss(raw, source, now);
      news.push(...items);
      statuses.push({ source: source.name, ok: true, items: items.length, url: source.url });
    } catch (error) {
      statuses.push({
        source: source.name,
        ok: false,
        url: source.url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { news: dedupeNews(news), statuses };
}

async function fetchCopper(fetcher: Fetcher, now: Date) {
  const raw = await fetcher(YAHOO_COPPER_URL, { headers: { accept: "application/json" } });
  const data = JSON.parse(raw);
  const result = data?.chart?.result?.[0] || {};
  const meta = result.meta || {};
  const closes = result.indicators?.quote?.[0]?.close || [];
  const timestamps = result.timestamp || [];
  const history = timestamps
    .map((timestamp: number, index: number) => ({ timestamp, value: closes[index] }))
    .filter((row: { value: unknown }) => typeof row.value === "number")
    .map((row: { timestamp: number; value: number }) => ({
      date: new Date(row.timestamp * 1000).toISOString().slice(0, 10),
      priceUsdPerLb: Number(row.value.toFixed(4)),
    }));
  const current = Number(meta.regularMarketPrice || history.at(-1)?.priceUsdPerLb || 0);
  const previous = Number(meta.previousClose || history.at(-2)?.priceUsdPerLb || current);
  const monthly = history.length >= 22 ? history[history.length - 22].priceUsdPerLb : history[0]?.priceUsdPerLb || current;
  return {
    source: "Yahoo Finance chart API (HG=F COMEX copper futures)",
    url: YAHOO_COPPER_URL,
    currentPriceUsdPerLb: Number(current.toFixed(4)),
    currentPriceUsdPerTonApprox: Math.round(current * 2204.62262185),
    previousCloseUsdPerLb: Number(previous.toFixed(4)),
    dailyChangePct: previous ? Number((((current - previous) / previous) * 100).toFixed(2)) : 0,
    monthlyChangePct: monthly ? Number((((current - monthly) / monthly) * 100).toFixed(2)) : 0,
    history,
    updatedAt: now.toISOString(),
  };
}

async function fetchExchangeRate(fetcher: Fetcher, now: Date) {
  const raw = await fetcher(FRANKFURTER_URL, { headers: { accept: "application/json" } });
  const data = JSON.parse(raw);
  return {
    source: "Frankfurter API (ECB reference rates)",
    url: "https://api.frankfurter.dev/",
    usdCny: Number(data?.rates?.CNY || 0),
    updatedAt: now.toISOString(),
  };
}

async function fetchSecCompetitors(fetcher: Fetcher): Promise<{ competitors: Array<Record<string, unknown>>; statuses: SourceStatus[] }> {
  const competitors: Array<Record<string, unknown>> = [];
  const statuses: SourceStatus[] = [];
  for (const company of SEC_COMPANIES) {
    const cik = company.cik.padStart(10, "0");
    const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
    try {
      const raw = await fetcher(url, { headers: { accept: "application/json" } });
      const data = JSON.parse(raw);
      const recent = data?.filings?.recent || {};
      const forms: string[] = recent.form || [];
      const dates: string[] = recent.filingDate || [];
      const accessions: string[] = recent.accessionNumber || [];
      const docs: string[] = recent.primaryDocument || [];
      let count = 0;
      for (let index = 0; index < Math.min(forms.length, 8); index += 1) {
        const form = forms[index];
        if (!["10-K", "10-Q", "8-K", "6-K", "20-F", "DEF 14A"].includes(form)) continue;
        const accession = String(accessions[index] || "").replace(/-/g, "");
        const doc = docs[index] || "";
        if (!accession || !doc) continue;
        const filingUrl = `https://www.sec.gov/Archives/edgar/data/${Number(company.cik)}/${accession}/${doc}`;
        const filingDate = dates[index] || "";
        const title = `${company.name} SEC ${form} filing (${filingDate})`;
        const itemCodes = form === "8-K" ? await fetchSec8kItems(fetcher, filingUrl) : [];
        competitors.push({
          id: itemId(filingUrl, title),
          company: company.name,
          ticker: company.ticker,
          type: "disclosure",
          title,
          titleZh: competitorTitleZh(company.name, form, itemCodes),
          detail: competitorDetailZh(company.name, form, itemCodes),
          items: itemCodes,
          url: filingUrl,
          time: filingDate,
          publishTime: filingDate,
          source: "SEC EDGAR submissions API",
          quality: 5,
        });
        count += 1;
      }
      statuses.push({ source: `SEC ${company.name}`, ok: true, items: count, url });
    } catch (error) {
      statuses.push({ source: `SEC ${company.name}`, ok: false, url, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { competitors, statuses };
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, data: unknown) {
  ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
  fs.renameSync(tmp, filePath);
}

function intelligencePath(workspaceId: string, fileName: string) {
  return ssaCompanyDataPath(workspaceId, "intelligence", fileName);
}

function freshCachedNews(workspaceId: string, now: Date): { updatedAt?: string; news?: RawNewsItem[] } | null {
  const data = readJsonFile<{ updatedAt?: string; news?: RawNewsItem[] }>(intelligencePath(workspaceId, "news.json"), {});
  if (!data.updatedAt || !Array.isArray(data.news) || data.news.length === 0) return null;
  const ageMs = now.getTime() - new Date(data.updatedAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > 6 * 60 * 60 * 1000) return null;
  return data;
}

function buildAlerts(copper: Awaited<ReturnType<typeof fetchCopper>> | null, exchange: Awaited<ReturnType<typeof fetchExchangeRate>> | null, statuses: SourceStatus[], now: Date) {
  const alerts = [];
  if (copper) {
    const daily = copper.dailyChangePct;
    alerts.push({
      id: "copper-price",
      keyword: "铜价",
      type: Math.abs(daily) >= 2 ? "warning" : "info",
      message: `COMEX铜价 ${copper.currentPriceUsdPerLb} USD/lb，约 ${copper.currentPriceUsdPerTonApprox} USD/吨，日变动 ${daily}%。`,
      change: `${daily}%`,
      time: now.toISOString(),
      source: copper.source,
      url: copper.url,
    });
  }
  if (exchange?.usdCny) {
    alerts.push({
      id: "usd-cny",
      keyword: "汇率",
      type: "info",
      message: `USD/CNY 参考汇率 ${exchange.usdCny}。`,
      change: String(exchange.usdCny),
      time: now.toISOString(),
      source: exchange.source,
      url: exchange.url,
    });
  }
  const failed = statuses.filter((status) => !status.ok);
  if (failed.length) {
    alerts.push({
      id: "source-health",
      keyword: "固定源健康",
      type: failed.length >= 4 ? "danger" : "warning",
      message: `${failed.length} 个固定新闻源暂不可用：${failed.slice(0, 5).map((status) => status.source).join(", ")}。`,
      change: `-${failed.length} sources`,
      time: now.toISOString(),
      source: "SSA intelligence collector",
    });
  }
  return { updatedAt: now.toISOString(), alerts };
}

function buildTrends(copper: Awaited<ReturnType<typeof fetchCopper>> | null, exchange: Awaited<ReturnType<typeof fetchExchangeRate>> | null, statuses: SourceStatus[], now: Date) {
  const trends = [];
  if (copper?.history?.length) {
    const history: CopperHistoryPoint[] = copper.history.slice(-13);
    trends.push({
      id: "copper-price",
      label: "COMEX铜价（USD/lb）",
      months: history.map((row) => row.date.slice(5)),
      values: history.map((row) => row.priceUsdPerLb),
      unit: "USD/lb",
      source: copper.source,
      sourceUrl: copper.url,
    });
  }
  if (exchange?.usdCny) {
    trends.push({
      id: "usd-cny",
      label: "USD/CNY汇率",
      months: [now.toISOString().slice(5, 10)],
      values: [exchange.usdCny],
      unit: "CNY per USD",
      source: exchange.source,
      sourceUrl: exchange.url,
    });
  }
  trends.push({
    id: "fixed-source-health",
    label: "固定源可用性",
    months: [now.toISOString().slice(0, 10)],
    values: [statuses.filter((status) => status.ok).length],
    unit: "sources_ok",
    source: "SSA intelligence collector",
  });
  return { updatedAt: now.toISOString(), trends };
}

function buildInsights(news: RawNewsItem[], copper: Awaited<ReturnType<typeof fetchCopper>> | null, now: Date) {
  const insights = [];
  if (copper) {
    insights.push({
      title: Math.abs(copper.monthlyChangePct) >= 5 ? "铜价月度波动影响报价窗口" : "铜价短期相对平稳",
      detail: `当前 COMEX 铜价约 ${copper.currentPriceUsdPerLb} USD/lb，日变动 ${copper.dailyChangePct}%，月变动 ${copper.monthlyChangePct}%。`,
      impact: Math.abs(copper.monthlyChangePct) >= 5 ? "medium" : "low",
    });
  }
  const standardsCount = news.filter((item) => item.tag === "standards").length;
  if (standardsCount) {
    insights.push({
      title: "标准认证动态已进入情报池",
      detail: `本次采集到 ${standardsCount} 条 USB/HDMI/VESA 或线缆认证相关信号，可能影响产品卖点、规格说明和报价依据。`,
      impact: "medium",
    });
  }
  return { generatedAt: now.toISOString(), insights };
}

function writeDedupeLog(workspaceId: string, news: RawNewsItem[], now: Date) {
  const logPath = intelligencePath(workspaceId, "news-dedupe-log.json");
  const existing = readJson<{ items?: Record<string, unknown> }>(logPath, { items: {} });
  const items = { ...(existing.items || {}) };
  for (const item of news) {
    items[item.id] = {
      title: item.title,
      source: item.source,
      url: item.url,
      loggedAt: now.toISOString(),
    };
  }
  writeJson(logPath, { updatedAt: now.toISOString(), items });
}

export async function refreshIntelligenceFeeds(workspaceId = "farreach", options: RefreshIntelligenceOptions = {}): Promise<IntelligenceRefreshResult> {
  const now = options.now || new Date();
  if (!options.forceRefresh) {
    const cachedNews = freshCachedNews(workspaceId, now);
    if (cachedNews) {
      return {
        success: true,
        workspaceId,
        updatedAt: cachedNews.updatedAt || now.toISOString(),
        newsCount: cachedNews.news?.length || 0,
        competitorCount: readJsonFile<{ competitors?: unknown[] }>(intelligencePath(workspaceId, "competitors.json"), {}).competitors?.length || 0,
        sources: [],
        cache: { hit: true, feed: "news", updatedAt: cachedNews.updatedAt },
      };
    }
  }
  const fetcher = options.fetcher || defaultFetcher;
  const maxNewsItems = options.maxNewsItems || 60;
  const { news, statuses } = await collectRssNews(fetcher, now);

  if (!news.length) {
    return {
      success: false,
      workspaceId,
      updatedAt: now.toISOString(),
      newsCount: 0,
      competitorCount: 0,
      sources: statuses,
      error: "No news items were collected; existing intelligence cache was preserved.",
    };
  }

  let copper: Awaited<ReturnType<typeof fetchCopper>> | null = null;
  let exchange: Awaited<ReturnType<typeof fetchExchangeRate>> | null = null;
  try {
    copper = await fetchCopper(fetcher, now);
    statuses.push({ source: "Yahoo Finance HG=F", ok: true, items: copper.history.length, url: YAHOO_COPPER_URL });
  } catch (error) {
    statuses.push({ source: "Yahoo Finance HG=F", ok: false, url: YAHOO_COPPER_URL, error: error instanceof Error ? error.message : String(error) });
  }
  try {
    exchange = await fetchExchangeRate(fetcher, now);
    statuses.push({ source: "Frankfurter FX", ok: true, items: exchange.usdCny ? 1 : 0, url: FRANKFURTER_URL });
  } catch (error) {
    statuses.push({ source: "Frankfurter FX", ok: false, url: FRANKFURTER_URL, error: error instanceof Error ? error.message : String(error) });
  }

  const collectedNews = news.slice(0, maxNewsItems);
  const secResult = await fetchSecCompetitors(fetcher);
  statuses.push(...secResult.statuses);
  const competitors = secResult.competitors.slice(0, 30);

  writeDedupeLog(workspaceId, collectedNews, now);
  writeJson(intelligencePath(workspaceId, "news.json"), { updatedAt: now.toISOString(), news: collectedNews });
  if (competitors.length > 0) {
    writeJson(intelligencePath(workspaceId, "competitors.json"), { updatedAt: now.toISOString(), competitors });
  }
  writeJson(intelligencePath(workspaceId, "alerts.json"), buildAlerts(copper, exchange, statuses, now));
  writeJson(intelligencePath(workspaceId, "trends.json"), buildTrends(copper, exchange, statuses, now));
  writeJson(intelligencePath(workspaceId, "insights.json"), buildInsights(collectedNews, copper, now));

  return {
    success: true,
    workspaceId,
    updatedAt: now.toISOString(),
    newsCount: collectedNews.length,
    competitorCount: competitors.length,
    sources: statuses,
  };
}
