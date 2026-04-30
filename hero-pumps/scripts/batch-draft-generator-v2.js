#!/usr/bin/env node
/**
 * Batch Draft Generator v2 — 批量生成个性化开发信草稿
 * 
 * 修复 v1 问题：
 * 1. CSV 联系人匹配逻辑（website 精确匹配优先）
 * 2. 邮件正文去除 raw URL，使用 clean 描述
 * 3. 联系人姓名正确填充
 * 
 * 用法:
 *   node batch-draft-generator-v2.js              # 生成所有
 *   node batch-draft-generator-v2.js --company gc-gruppe
 *   node batch-draft-generator-v2.js --dry-run
 */

const fs = require('fs');
const path = require('path');

const RESEARCH_DIR = path.join(__dirname, '../research/companies');
const LEADS_DIR = path.join(__dirname, '../leads');
const DRAFTS_DIR = path.join(__dirname, '../campaign-tracker/templates');

// ==================== 公司类型分类 ====================
const COMPANY_TYPES = {
  manufacturer: {
    keywords: ['manufactur', 'producer', 'factory', 'boiler', 'heat pump', 'radiator', 'water heater'],
    angle: 'OEM / system integration',
    pitch: 'complement your product line'
  },
  distributor: {
    keywords: ['distributor', 'wholesale', 'großhandel', 'shk', 'building materials', 'plumbing supply'],
    angle: 'Product range expansion / margin improvement',
    pitch: 'add to your catalogue'
  },
  brand: {
    keywords: ['brand', 'group', 'solutions', 'technology', 'systems'],
    angle: 'Brand complement',
    pitch: 'complement your portfolio'
  },
  contractor: {
    keywords: ['contractor', 'installation', 'engineering', 'project', 'construction', 'mep'],
    angle: 'Project cost reduction',
    pitch: 'reduce equipment costs on your projects'
  }
};

function getCompanyType(company, summary) {
  const text = `${company} ${summary || ''}`.toLowerCase();
  for (const [type, config] of Object.entries(COMPANY_TYPES)) {
    for (const kw of config.keywords) {
      if (text.includes(kw.toLowerCase())) return type;
    }
  }
  return 'distributor';
}

// ==================== 清理研究摘要 ====================
function cleanSummary(summary) {
  if (!summary) return '';
  return summary
    .replace(/https?:\/\/[^\s]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 150);
}

// ==================== 生成邮件 ====================
function generateSubjectLine(company, type) {
  const subjects = {
    manufacturer: [
      `Circulator pump supplier for ${company}`,
      `Variable frequency circulators — OEM inquiry for ${company}`,
      `Energy-efficient pump partner for ${company}`
    ],
    distributor: [
      `ErP-compliant circulator pumps for ${company}`,
      `Circulator pump supply for ${company} — EEI ≤ 0.23, TÜV certified`,
      `Quick intro — Hero Pump circulators`
    ],
    contractor: [
      `Pump specs for your next project`,
      `Cost-saving circulator pumps for ${company}`,
      `ErP pump supplier — 30% below European brands`
    ],
    brand: [
      `Complete ${company}'s portfolio with our circulators`,
      `OEM circulator pump partner for ${company}`,
      `Energy-efficient pumps for ${company}`
    ]
  };
  return subjects[type] || subjects.distributor;
}

function generateEmailBody(contactName, company, country, type) {
  const name = contactName.split(' ')[0]; // 用 first name
  
  const templates = {
    manufacturer: `Hi ${name},

I'm Jaden from Hero Pump, a Chinese manufacturer of variable frequency circulating pumps. I know ${company} produces heating systems for the ${country} market.

Our circulator pumps integrate directly into system packages at 30-40% lower cost than Grundfos and Wilo:

- EEI ≤ 0.23, TÜV SÜD tested (ErP compliant)
- CE and RoHS certified
- OEM support with custom branding
- Direct factory pricing

Could I send you our product sheet and a quotation?

Best regards,
Jaden Yeung
Sales Manager | Zhejiang Hero Pump Co., Ltd.
sales@heropumps.com`,

    distributor: `Hi ${name},

I'm Jaden from Hero Pump — a circulator pump manufacturer based in China.

I noticed ${company} carries a strong HVAC range across ${country}. Our ErP-compliant circulator line could be a solid addition to your catalogue.

- ErP EEI ≤ 0.23 — full EU regulation compliance
- TÜV SÜD certified
- Direct factory pricing — typically 30-40% below European brands
- Stable lead times from our Zhejiang facility

Would you be open to reviewing a product sheet and sample quote?

Best regards,
Jaden Yeung
Sales Manager | Zhejiang Hero Pump Co., Ltd.
sales@heropumps.com`,

    contractor: `Hi ${name},

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

    brand: `Hi ${name},

I'm Jaden from Hero Pump — we make variable frequency circulating pumps at our factory in Zhejiang.

${company} is a well-known brand in ${country}. Our circulator pumps could complement your existing product range.

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

// ==================== 联系人匹配（v2 改进） ====================
function pickBestContact(company, leads) {
  const companyWebsite = (company.website || '').toLowerCase().replace(/^www\./, '');
  const companyName = (company.company || '').toLowerCase();
  
  // Step 1: 通过 website 精确匹配
  let matches = leads.filter(l => {
    const w = (l.website || '').toLowerCase().replace(/^www\./, '');
    return w === companyWebsite || w.includes(companyWebsite) || companyWebsite.includes(w);
  });
  
  // Step 2: 如果 website 没匹配到，用 company name 匹配
  if (matches.length === 0) {
    matches = leads.filter(l => {
      const c = (l.company || '').toLowerCase();
      return c === companyName || c.includes(companyName) || companyName.includes(c);
    });
  }
  
  // Step 3: 还是没匹配到，用 research 里的联系人
  if (matches.length === 0 && company.contacts && company.contacts.length > 0) {
    const c = company.contacts[0];
    return {
      name: c.name || '',
      email: c.email || '',
      position: c.position || '',
      source: 'research'
    };
  }
  
  if (matches.length === 0) return null;
  
  // Step 4: 从匹配结果中选最佳联系人
  // 优先级：有职位的 > 邮箱有效的 > 置信度高的 > Sales/Purchasing/Export 相关
  const priorityRoles = ['export', 'sales', 'purchas', 'procurement', 'product', 'manager', 'director', 'ceo', 'head'];
  
  const sorted = matches.sort((a, b) => {
    // 有职位优先
    const aHasPos = a.position ? 1 : 0;
    const bHasPos = b.position ? 1 : 0;
    if (aHasPos !== bHasPos) return bHasPos - aHasPos;
    
    // 优先销售/采购/产品相关职位
    const aRole = priorityRoles.findIndex(r => (a.position || '').toLowerCase().includes(r));
    const bRole = priorityRoles.findIndex(r => (b.position || '').toLowerCase().includes(r));
    if (aRole !== bRole) {
      if (aRole === -1) return 1;
      if (bRole === -1) return -1;
      return aRole - bRole;
    }
    
    // 置信度高优先
    const aConf = parseInt(a.confidence) || 0;
    const bConf = parseInt(b.confidence) || 0;
    return bConf - aConf;
  });
  
  const best = sorted[0];
  return {
    name: best.contact_name || '',
    email: best.email || '',
    position: best.position || '',
    source: 'csv'
  };
}

// ==================== 检查已有草稿 ====================
function hasDraft(company) {
  const name = company._file.replace('.json', '');
  if (!fs.existsSync(DRAFTS_DIR)) return false;
  const files = fs.readdirSync(DRAFTS_DIR).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const base = file.replace('.md', '').toLowerCase();
    if (base.includes(name.toLowerCase()) || name.toLowerCase().includes(base.replace('iron-', '').replace(/-[a-z]{2}$/, ''))) {
      return true;
    }
  }
  return false;
}

// ==================== 主程序 ====================
async function main() {
  const args = process.argv.slice(2);
  const targetCompany = args.includes('--company') ? args[args.indexOf('--company') + 1] : null;
  const dryRun = args.includes('--dry-run');
  const overwrite = args.includes('--overwrite');
  
  console.log('========================================');
  console.log('Hero Pumps — Batch Draft Generator v2');
  console.log(`模式: ${dryRun ? 'DRY RUN' : 'PRODUCTION'}${overwrite ? ' (OVERWRITE)' : ''}`);
  if (targetCompany) console.log(`目标: ${targetCompany}`);
  console.log('========================================\n');
  
  const companies = loadCompanies();
  const leads = loadLeads();
  
  console.log(`加载数据: ${companies.length} 家公司, ${leads.length} 个联系人\n`);
  
  let generated = 0;
  let skipped = 0;
  let errors = 0;
  let noContact = 0;
  
  for (const company of companies) {
    const name = company._file.replace('.json', '');
    
    if (targetCompany && !name.toLowerCase().includes(targetCompany.toLowerCase())) continue;
    
    if (!targetCompany && !overwrite && hasDraft(company)) {
      skipped++;
      continue;
    }
    
    const contact = pickBestContact(company, leads);
    if (!contact || !contact.email) {
      console.log(`⚠️  ${company.company} — 无有效联系人`);
      noContact++;
      errors++;
      continue;
    }
    
    const type = getCompanyType(company.company, company.research?.summary);
    const countryMap = {
      '波兰': 'Poland', '德国': 'Germany', '法国': 'France', '意大利': 'Italy',
      '西班牙': 'Spain', '荷兰': 'Netherlands', '比利时': 'Belgium', '瑞典': 'Sweden',
      '挪威': 'Norway', '丹麦': 'Denmark', '芬兰': 'Finland', '捷克': 'Czech Republic',
      '奥地利': 'Austria', '瑞士': 'Switzerland', '英国': 'United Kingdom',
      '匈牙利': 'Hungary', '罗马尼亚': 'Romania', '希腊': 'Greece', '斯洛伐克': 'Slovakia',
      '斯洛文尼亚': 'Slovenia', '克罗地亚': 'Croatia', '保加利亚': 'Bulgaria',
      '塞尔维亚': 'Serbia', '区域': 'Europe', '北欧': 'Nordic region'
    };
    const country = countryMap[company.country] || company.country || 'Europe';
    
    const subjects = generateSubjectLine(company.company, type);
    const contactName = contact.name || contact.email.split('@')[0];
    const body = generateEmailBody(contactName, company.company, country, type);
    
    const countryFlag = {
      'Poland': '🇵🇱', 'Germany': '🇩🇪', 'France': '🇫🇷', 'Italy': '🇮🇹',
      'Czech Republic': '🇨🇿', 'Hungary': '🇭🇺', 'Romania': '🇷🇴', 'Sweden': '🇸🇪',
      'Finland': '🇫🇮', 'Norway': '🇳🇴', 'Denmark': '🇩🇰', 'Slovakia': '🇸🇰',
      'Serbia': '🇷🇸', 'Croatia': '🇭🇷', 'Bulgaria': '🇧🇬', 'Europe': '🇪🇺'
    };
    
    const companyTypeLabel = type.charAt(0).toUpperCase() + type.slice(1);
    
    const draft = `# Cold Email — ${company.company}

## Company Info
- **Company:** ${company.company}
- **Country:** ${country} ${countryFlag[country] || ''}
- **Contact:** ${contact.name || '—'} (${contact.source})
- **Position:** ${contact.position || '—'}
- **Email:** ${contact.email}
- **Website:** ${company.website || '—'}
- **Tier:** ${company.tier || '—'}
- **Type:** ${companyTypeLabel}

## Subject Lines
1. ✅ **Recommended:** ${subjects[0]}
2. Alternative: ${subjects[1]}
3. Alternative: ${subjects[2]}

## Email Body

${body}

## Design Notes
- **切入角度:** ${companyTypeLabel} — "${COMPANY_TYPES[type].angle}"
- **重点:** ${COMPANY_TYPES[type].pitch}
- **联系人来源:** ${contact.source}
`;

    if (dryRun) {
      console.log(`📝 [DRY RUN] ${company.company} → ${contact.name || contact.email} (${contact.email})`);
    } else {
      const fileName = `iron-${name.toLowerCase()}.md`;
      const filePath = path.join(DRAFTS_DIR, fileName);
      fs.writeFileSync(filePath, draft, 'utf8');
      console.log(`✅ ${company.company} → ${contact.name || contact.email} (${contact.email}) [${contact.source}]`);
    }
    
    generated++;
    
    if (!dryRun) {
      await new Promise(r => setTimeout(r, 100));
    }
  }
  
  console.log(`\n========================================`);
  console.log(`完成: 生成 ${generated} 封, 跳过 ${skipped} 封, 错误 ${errors} 封 (无联系人: ${noContact})`);
  console.log('========================================');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
