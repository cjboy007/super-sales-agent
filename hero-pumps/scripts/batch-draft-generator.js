#!/usr/bin/env node
/**
 * Batch Draft Generator — 批量生成个性化开发信草稿
 * 
 * 工作流程：
 * 1. 读取 research/companies/*.json 获取公司研究数据
 * 2. 读取 leads/*.csv 获取联系人数据
 * 3. 为每个公司选择最佳联系人
 * 4. 根据公司类型/行业生成个性化邮件
 * 5. 输出到 campaign-tracker/templates/
 * 
 * 用法:
 *   node batch-draft-generator.js              # 生成所有缺失的草稿
 *   node batch-draft-generator.js --company gc-gruppe  # 只生成指定公司
 *   node batch-draft-generator.js --dry-run    # 预览模式
 */

const fs = require('fs');
const path = require('path');

const RESEARCH_DIR = path.join(__dirname, '../research/companies');
const LEADS_DIR = path.join(__dirname, '../leads');
const DRAFTS_DIR = path.join(__dirname, '../campaign-tracker/templates');

// ==================== 公司类型分类 ====================
const COMPANY_TYPES = {
  // 制造商 — 强调 OEM / 系统集成 / 互补产品线
  manufacturer: {
    keywords: ['manufactur', 'producer', 'factory', 'boiler', 'heat pump', 'radiator', 'valve'],
    angle: 'OEM / system integration',
    pitch: 'Our circulator pumps integrate seamlessly into your system packages',
    focus: 'OEM partnership, direct factory pricing, complementary product line'
  },
  // 分销商/批发商 — 强调价格优势 / 利润空间 / 产品线补充
  distributor: {
    keywords: ['distributor', 'wholesale', 'großhandel', 'supply', 'trading', 'dealer'],
    angle: 'Product range expansion / margin improvement',
    pitch: 'Add our circulator pumps to your catalogue at 30-40% below European brands',
    focus: 'Competitive pricing, ErP compliance, reliable supply chain'
  },
  // 工程承包商 — 强调项目价格 / 规格 / 交期
  contractor: {
    keywords: ['contractor', 'installation', 'engineering', 'project', 'construction'],
    angle: 'Project cost reduction',
    pitch: 'Reduce pump costs on your next project by 30%+',
    focus: 'Bulk pricing, spec compliance, fast delivery'
  },
  // 品牌方 — 强调品牌互补 / 系统解决方案
  brand: {
    keywords: ['brand', 'group', 'solutions', 'technology'],
    angle: 'Brand complement / system solution',
    pitch: 'Complete your heating system portfolio with our circulator pumps',
    focus: 'Brand alignment, quality certification, OEM support'
  }
};

// ==================== 通用模板 ====================
function getCompanyType(company, research) {
  const text = `${company} ${research || ''}`.toLowerCase();
  for (const [type, config] of Object.entries(COMPANY_TYPES)) {
    for (const kw of config.keywords) {
      if (text.includes(kw.toLowerCase())) return type;
    }
  }
  return 'distributor'; // 默认
}

function generateSubjectLine(company, contact, type, country) {
  const subjects = {
    manufacturer: [
      `Circulator pump supplier for ${company} system packages`,
      `Variable frequency circulators — OEM inquiry`,
      `Energy-efficient pump partner for ${company}`
    ],
    distributor: [
      `ErP-compliant circulator pumps for ${company}`,
      `Circulator pump supply for ${company} — EEI ≤ 0.23, TÜV certified`,
      `Quick intro — Hero Pump circulators for ${company}`
    ],
    contractor: [
      `Pump specs for your next project`,
      `Cost-saving circulator pumps for ${company} projects`,
      `ErP pump supplier — 30% below European brands`
    ],
    brand: [
      `Complete ${company}'s heating portfolio with our circulators`,
      `OEM circulator pump partner for ${company}`,
      `Energy-efficient pumps for ${company} system solutions`
    ]
  };
  return subjects[type] || subjects.distributor;
}

function generateEmailBody(contactName, company, country, type, researchNotes) {
  const templates = {
    manufacturer: `Hi ${contactName},

I'm Jaden from Hero Pump, a Chinese manufacturer of variable frequency circulating pumps. I know ${company} produces ${researchNotes || 'heating systems'} for the ${country} market.

Our circulator pumps are designed as direct components for system packages at 30-40% lower cost than Grundfos and Wilo:

- EEI ≤ 0.23, TÜV SÜD tested (ErP compliant)
- CE and RoHS certified
- OEM support with custom branding
- Direct factory pricing, no distributor markup

Could I send you our product sheet and a quotation?

Best regards,
Jaden Yeung
Sales Manager | Zhejiang Hero Pump Co., Ltd.
sales@heropumps.com`,

    distributor: `Hi ${contactName},

I'm Jaden from Hero Pump — a circulator pump manufacturer based in China.

${company} runs a strong HVAC distribution business in ${country}. I thought our ErP-compliant circulator line could be a solid addition to your catalogue.

- ErP EEI ≤ 0.23 — full EU regulation compliance
- TÜV SÜD certified
- Direct factory pricing — typically 30-40% below European brands
- Stable lead times from our Zhejiang facility

Would you be open to reviewing a product sheet and sample quote?

Best regards,
Jaden Yeung
Sales Manager | Zhejiang Hero Pump Co., Ltd.
sales@heropumps.com`,

    contractor: `Hi ${contactName},

I'm Jaden from Hero Pump, we manufacture variable frequency circulating pumps in China.

I noticed ${company} handles HVAC projects across ${country}. Our ErP-compliant circulator pumps could help reduce equipment costs on your upcoming projects.

- EEI ≤ 0.23, TÜV SÜD tested (ErP compliant)
- CE and RoHS certified
- Bulk pricing — 30-40% below European brands
- Fast delivery for project timelines

Want me to send over a spec sheet for your next project?

Best regards,
Jaden Yeung
Sales Manager | Zhejiang Hero Pump Co., Ltd.
sales@heropumps.com`,

    brand: `Hi ${contactName},

I'm Jaden from Hero Pump — we make variable frequency circulating pumps at our factory in Zhejiang.

${company} is a well-known ${researchNotes || 'brand'} in ${country}. Our circulator pumps could complement your existing product range.

- ErP EEI ≤ 0.23, TÜV SÜD certified
- CE and RoHS compliant
- OEM support for brand integration
- 30-40% cost advantage vs. European alternatives

May I send you a product sheet and pricing for review?

Best regards,
Jaden Yeung
Sales Manager | Zhejiang Hero Pump Co., Ltd.
sales@heropumps.com`
  };
  
  return templates[type] || templates.distributor;
}

// ==================== 读取数据 ====================
function loadCompanies() {
  const companies = [];
  if (!fs.existsSync(RESEARCH_DIR)) return companies;
  
  for (const file of fs.readdirSync(RESEARCH_DIR).filter(f => f.endsWith('.json'))) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(RESEARCH_DIR, file), 'utf8'));
      data._file = file;
      companies.push(data);
    } catch(e) {
      console.error(`Failed to load: ${file}`);
    }
  }
  return companies;
}

function loadLeads() {
  const leads = [];
  if (!fs.existsSync(LEADS_DIR)) return leads;
  
  for (const file of fs.readdirSync(LEADS_DIR).filter(f => f.endsWith('.csv'))) {
    const content = fs.readFileSync(path.join(LEADS_DIR, file), 'utf8').trim();
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.replace(/^["']|["']$/g, '').trim());
      if (values.length < headers.length) continue;
      const lead = {};
      headers.forEach((h, idx) => { lead[h] = values[idx] || ''; });
      if (lead.email && lead.email.includes('@')) {
        leads.push(lead);
      }
    }
  }
  return leads;
}

// ==================== 选择最佳联系人 ====================
function pickBestContact(company, leads) {
  const companyLeads = leads.filter(l => {
    const c = (l.company || '').toLowerCase();
    const w = (l.website || '').toLowerCase();
    const cn = company.company.toLowerCase();
    const cw = (company.website || '').toLowerCase();
    return c === cn || c.includes(cn) || w.includes(cw) || cw.includes(w);
  });
  
  if (companyLeads.length === 0) {
    // Fallback: 使用公司研究中的联系人
    if (company.contacts && company.contacts.length > 0) {
      return company.contacts[0];
    }
    return null;
  }
  
  // 优先级：有职位的 > 邮箱有效的 > 置信度高的
  const prioritized = companyLeads.sort((a, b) => {
    const aPos = a.position ? 1 : 0;
    const bPos = b.position ? 1 : 0;
    if (aPos !== bPos) return bPos - aPos;
    
    const aConf = parseInt(a.confidence) || 0;
    const bConf = parseInt(b.confidence) || 0;
    return bConf - aConf;
  });
  
  return prioritized[0];
}

// ==================== 检查是否已有草稿 ====================
function hasDraft(company) {
  const name = company._file.replace('.json', '');
  if (!fs.existsSync(DRAFTS_DIR)) return false;
  
  const files = fs.readdirSync(DRAFTS_DIR).filter(f => f.endsWith('.md'));
  // 检查文件名是否匹配（忽略国家后缀）
  for (const file of files) {
    const base = file.replace('.md', '').toLowerCase();
    if (base.includes(name.toLowerCase()) || name.toLowerCase().includes(base.replace('cold-email-', ''))) {
      return true;
    }
  }
  return false;
}

// ==================== 生成草稿 ====================
function generateDraft(company, contact, dryRun = false) {
  const type = getCompanyType(company.company, company.research?.summary);
  const countryMap = {
    '波兰': 'Poland', '德国': 'Germany', '法国': 'France', '意大利': 'Italy',
    '西班牙': 'Spain', '荷兰': 'Netherlands', '比利时': 'Belgium', '瑞典': 'Sweden',
    '挪威': 'Norway', '丹麦': 'Denmark', '芬兰': 'Finland', '捷克': 'Czech Republic',
    '奥地利': 'Austria', '瑞士': 'Switzerland', '英国': 'United Kingdom',
    '爱尔兰': 'Ireland', '葡萄牙': 'Portugal', '匈牙利': 'Hungary',
    '罗马尼亚': 'Romania', '希腊': 'Greece', '斯洛伐克': 'Slovakia',
    '斯洛文尼亚': 'Slovenia', '克罗地亚': 'Croatia', '保加利亚': 'Bulgaria',
    '爱沙尼亚': 'Estonia', '拉脱维亚': 'Latvia', '立陶宛': 'Lithuania',
    '塞尔维亚': 'Serbia', '区域': 'Europe', '北欧': 'Nordic region'
  };
  const country = countryMap[company.country] || company.country || 'Europe';
  
  const subjects = generateSubjectLine(company.company, contact.name, type, country);
  const body = generateEmailBody(
    contact.name || 'there',
    company.company,
    country,
    type,
    company.research?.summary?.substring(0, 100)
  );
  
  const countryFlag = {
    'Poland': '🇵🇱', 'Germany': '🇩🇪', 'France': '🇫🇷', 'Italy': '🇮🇹',
    'Czech Republic': '🇨🇿', 'Hungary': '🇭🇺', 'Romania': '🇷🇴', 'Sweden': '🇸🇪',
    'Finland': '🇫🇮', 'Norway': '🇳🇴', 'Denmark': '🇩🇰', 'Slovakia': '🇸🇰',
    'Serbia': '🇷🇸', 'Croatia': '🇭🇷', 'Bulgaria': '🇧🇬', 'Europe': '🇪🇺'
  };
  
  const draft = `# Cold Email — ${company.company}

## Company Info
- **Company:** ${company.company}
- **Country:** ${country} ${countryFlag[country] || ''}
- **Contact:** ${contact.name || '—'}
- **Position:** ${contact.position || '—'}
- **Email:** ${contact.email || '—'}
- **Website:** ${company.website || '—'}
- **Tier:** ${company.tier || '—'}
- **Type:** ${type.charAt(0).toUpperCase() + type.slice(1)}

## Subject Lines
1. ✅ **Recommended:** ${subjects[0]}
2. Alternative: ${subjects[1]}
3. Alternative: ${subjects[2]}

## Email Body

${body}

## Design Notes
- **切入角度:** ${type} — "${COMPANY_TYPES[type].angle}"
- **重点:** ${COMPANY_TYPES[type].focus}
- **长度:** ~${body.split('\n').filter(l => l.trim()).length} lines
- **关联点:** ${company.research?.summary?.substring(0, 120) || '公司基本信息'}

---

_Generated by Hero Pumps Batch Draft Generator_
`;

  return draft;
}

// ==================== 主程序 ====================
async function main() {
  const args = process.argv.slice(2);
  const targetCompany = args.includes('--company') ? args[args.indexOf('--company') + 1] : null;
  const dryRun = args.includes('--dry-run');
  
  console.log('========================================');
  console.log('Hero Pumps — Batch Draft Generator');
  console.log(`模式: ${dryRun ? 'DRY RUN' : 'PRODUCTION'}`);
  if (targetCompany) console.log(`目标: ${targetCompany}`);
  console.log('========================================\n');
  
  const companies = loadCompanies();
  const leads = loadLeads();
  
  console.log(`加载数据: ${companies.length} 家公司, ${leads.length} 个联系人\n`);
  
  let generated = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const company of companies) {
    const name = company._file.replace('.json', '');
    
    if (targetCompany && !name.toLowerCase().includes(targetCompany.toLowerCase())) continue;
    
    if (!targetCompany && hasDraft(company)) {
      skipped++;
      console.log(`⏭️  ${company.company} — 已有草稿`);
      continue;
    }
    
    const contact = pickBestContact(company, leads);
    if (!contact || (!contact.email && !contact.name)) {
      console.log(`⚠️  ${company.company} — 无有效联系人`);
      errors++;
      continue;
    }
    
    const draft = generateDraft(company, contact, dryRun);
    
    if (dryRun) {
      console.log(`📝 [DRY RUN] ${company.company} → ${contact.email || contact.name}`);
      console.log(draft.substring(0, 200) + '...\n');
    } else {
      const fileName = `cold-email-${name.toLowerCase()}.md`;
      const filePath = path.join(DRAFTS_DIR, fileName);
      fs.writeFileSync(filePath, draft, 'utf8');
      console.log(`✅ ${company.company} → ${fileName}`);
    }
    
    generated++;
    
    // 速率限制
    if (!dryRun) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  
  console.log('\n========================================');
  console.log(`完成: 生成 ${generated} 封, 跳过 ${skipped} 封, 错误 ${errors} 封`);
  console.log('========================================');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
