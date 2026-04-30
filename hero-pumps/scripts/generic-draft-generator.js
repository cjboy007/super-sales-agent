#!/usr/bin/env node
/**
 * Generic Draft Generator — 为没有公司背调的 lead 生成通用冷启动邮件
 * 
 * 用法:
 *   node generic-draft-generator.js              # 生成所有
 *   node generic-draft-generator.js --limit 50   # 生成指定数量
 *   node generic-draft-generator.js --dry-run
 */

const fs = require('fs');
const path = require('path');

const LEADS_DIR = path.join(__dirname, '../leads');
const DRAFTS_DIR = path.join(__dirname, '../campaign-tracker/templates');
const RESEARCH_DIR = path.join(__dirname, '../research/companies');
const SENT_LOG = path.join(__dirname, '../sent-log.json');

// 已背调的公司列表（有 research/companies/*.json）
function getResearchedCompanies() {
  if (!fs.existsSync(RESEARCH_DIR)) return new Set();
  return new Set(
    fs.readdirSync(RESEARCH_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', '').toLowerCase())
  );
}

// 已发送邮件列表
function getSentEmails() {
  if (!fs.existsSync(SENT_LOG)) return new Set();
  return new Set(JSON.parse(fs.readFileSync(SENT_LOG, 'utf8')).map(e => e.email.toLowerCase()));
}

// 已有草稿的邮箱
function getDraftEmails() {
  if (!fs.existsSync(DRAFTS_DIR)) return new Set();
  const emails = new Set();
  for (const f of fs.readdirSync(DRAFTS_DIR).filter(f => f.endsWith('.md'))) {
    const content = fs.readFileSync(path.join(DRAFTS_DIR, f), 'utf8');
    const m = content.match(/\*\*Email:\*\*\s*(.+)/) || content.match(/- \*\*Email:\*\*\s*(.+)/);
    if (m) emails.add(m[1].trim().toLowerCase());
  }
  return emails;
}

// 公司类型判断
function getCompanyType(industry, position) {
  const text = `${industry || ''} ${position || ''}`.toLowerCase();
  if (text.includes('manufactur') || text.includes('producer') || text.includes('boiler') || text.includes('heat pump')) return 'manufacturer';
  if (text.includes('contractor') || text.includes('installation') || text.includes('engineering') || text.includes('project')) return 'contractor';
  if (text.includes('brand') || text.includes('group') || text.includes('technology') || text.includes('systems')) return 'brand';
  return 'distributor';
}

const COUNTRY_MAP = {
  '波兰': 'Poland', '德国': 'Germany', '法国': 'France', '意大利': 'Italy',
  '西班牙': 'Spain', '荷兰': 'Netherlands', '比利时': 'Belgium', '瑞典': 'Sweden',
  '挪威': 'Norway', '丹麦': 'Denmark', '芬兰': 'Finland', '捷克': 'Czech Republic',
  '奥地利': 'Austria', '瑞士': 'Switzerland', '英国': 'United Kingdom',
  '匈牙利': 'Hungary', '罗马尼亚': 'Romania', '希腊': 'Greece', '斯洛伐克': 'Slovakia',
  '斯洛文尼亚': 'Slovenia', '克罗地亚': 'Croatia', '保加利亚': 'Bulgaria',
  '塞尔维亚': 'Serbia', '区域': 'Europe', '北欧': 'Nordic region'
};

function generateEmail(contactName, company, country, type) {
  const firstName = contactName ? contactName.split(' ')[0] : 'there';
  
  const bodies = {
    manufacturer: `Hi ${firstName},

I'm Jaden from Hero Pump — a manufacturer of variable frequency circulating pumps based in Zhejiang, China.

I noticed ${company} manufactures heating equipment for the ${country} market. Our circulator pumps are designed to integrate directly into heat pump and boiler systems at 30-40% lower cost than European brands, with the same ErP compliance.

Key specs:
- EEI ≤ 0.23 (ErP compliant), TÜV SÜD tested
- CE and RoHS certified
- OEM support with custom branding
- Direct factory pricing

Would you be open to reviewing a product datasheet and sample pricing?

Best regards,
Jaden Yeung
Sales Manager | Zhejiang Hero Pump Co., Ltd.
sales@heropumps.com`,

    distributor: `Hi ${firstName},

I'm Jaden from Hero Pump — we manufacture ErP-compliant variable frequency circulating pumps in China.

I noticed ${company} carries HVAC products across ${country}. Our circulator pumps could be a solid addition to your range:

- EEI ≤ 0.23 — full EU ErP regulation compliance
- TÜV SÜD, CE, and RoHS certified
- 30-40% lower cost than Grundfos/Wilo equivalents
- Stable lead times from our Zhejiang facility

Would you be open to reviewing a product sheet and sample quote?

Best regards,
Jaden Yeung
Sales Manager | Zhejiang Hero Pump Co., Ltd.
sales@heropumps.com`,

    contractor: `Hi ${firstName},

I'm Jaden from Hero Pump — we manufacture ErP-compliant circulating pumps for HVAC projects.

I noticed ${company} handles projects across ${country}. Our variable frequency circulator pumps could help reduce equipment costs:

- EEI ≤ 0.23, TÜV SÜD tested (ErP compliant)
- CE and RoHS certified
- 30-40% below European brand pricing
- Fast delivery for project timelines

Want me to send over a spec sheet for your next project?

Best regards,
Jaden Yeung
Sales Manager | Zhejiang Hero Pump Co., Ltd.
sales@heropumps.com`,

    brand: `Hi ${firstName},

I'm Jaden from Hero Pump — we make variable frequency circulating pumps at our factory in Zhejiang.

${company} is a well-known name in ${country}. Our ErP-compliant circulator pumps could complement your existing product range.

- EEI ≤ 0.23, TÜV SÜD certified
- CE and RoHS compliant
- OEM support for brand integration
- 30-40% cost advantage vs. European alternatives

May I send you a product sheet and pricing for review?

Best regards,
Jaden Yeung
Sales Manager | Zhejiang Hero Pump Co., Ltd.
sales@heropumps.com`
  };

  return bodies[type] || bodies.distributor;
}

function generateSubject(company, type) {
  const subjects = {
    manufacturer: [
      `Circulator pump supplier for ${company}`,
      `Variable frequency circulators — OEM inquiry for ${company}`,
      `Energy-efficient pump partner for ${company}`
    ],
    distributor: [
      `ErP-compliant circulator pumps for ${company}`,
      `Circulator pump supply for ${company} — EEI ≤ 0.23, TÜV certified`,
      `Quick intro — Hero Pump circulators for ${company}`
    ],
    contractor: [
      `Cost-saving circulator pumps for ${company} projects`,
      `ErP pump supplier for ${company}`,
      `Reduce equipment costs with Hero Pump circulators`
    ],
    brand: [
      `Complete ${company}'s portfolio with our circulators`,
      `OEM circulator pump partner for ${company}`,
      `Energy-efficient pumps for ${company}`
    ]
  };
  const list = subjects[type] || subjects.distributor;
  return list[Math.floor(Math.random() * Math.min(2, list.length))];
}

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.indexOf('--limit');
  const limit = limitArg >= 0 ? parseInt(args[limitArg + 1]) : 100;
  const dryRun = args.includes('--dry-run');

  console.log('========================================');
  console.log('Generic Draft Generator');
  console.log(`模式: ${dryRun ? 'DRY RUN' : 'PRODUCTION'}`);
  console.log(`限制: ${limit} 封`);
  console.log('========================================\n');

  const sentEmails = getSentEmails();
  const draftEmails = getDraftEmails();
  const researchedCompanies = getResearchedCompanies();
  const excludedEmails = new Set([...sentEmails, ...draftEmails]);

  console.log(`已发送: ${sentEmails.size} 封`);
  console.log(`已有草稿: ${draftEmails.size} 封`);
  console.log(`已背调公司: ${researchedCompanies.size} 家\n`);

  // 从 CSV 加载 leads
  const leads = [];
  for (const file of ['eastern-europe-2026-04-20.csv', 'nordic-west-2026-04-20.csv', 'western-europe-2026-04-21.csv'].filter(f => fs.existsSync(path.join(LEADS_DIR, f)))) {
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
        // 只处理没有公司背调的 lead
        const companyKey = (lead.company || '').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/-$/, '');
        if (!researchedCompanies.has(companyKey)) {
          lead._companyKey = companyKey;
          leads.push(lead);
        }
      }
    }
  }

  // 过滤已发送/已有草稿的
  const targetLeads = leads.filter(l => !excludedEmails.has(l.email.toLowerCase()));
  console.log(`无背调的 lead: ${leads.length}`);
  console.log(`去除已发送/已有草稿后: ${targetLeads.length}\n`);

  if (targetLeads.length === 0) {
    console.log('没有需要生成的草稿');
    return;
  }

  let generated = 0;
  const selected = targetLeads.slice(0, limit);

  for (const lead of selected) {
    const company = lead.company || lead.email.split('@')[1];
    const country = COUNTRY_MAP[lead.country] || lead.country || 'Europe';
    const type = getCompanyType(lead.industry, lead.position);
    const contactName = lead.contact_name || lead.email.split('@')[0];
    const subject = generateSubject(company, type);
    const body = generateEmail(contactName, company, country, type);

    const countryFlag = {
      'Poland': '🇵🇱', 'Germany': '🇩🇪', 'France': '🇫🇷', 'Italy': '🇮🇹',
      'Czech Republic': '🇨🇿', 'Hungary': '🇭🇺', 'Romania': '🇷🇴', 'Sweden': '🇸🇪',
      'Finland': '🇫🇮', 'Norway': '🇳🇴', 'Denmark': '🇩🇰', 'Slovakia': '🇸🇰',
      'Serbia': '🇷🇸', 'Croatia': '🇭🇷', 'Bulgaria': '🇧🇬', 'Europe': '🇪🇺'
    };

    const safeName = company.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/-$/, '');
    const emailSafe = lead.email.replace(/[@.]/g, '-');

    const draft = `# Cold Email — ${company} — ${contactName}

## Company Info
- **Company:** ${company}
- **Country:** ${country} ${countryFlag[country] || ''}
- **To:** ${contactName} <${lead.email}>
- **Position:** ${lead.position || 'N/A'}
- **Email:** ${lead.email}
- **Website:** ${lead.website || company.toLowerCase() + '.com'}
- **Tier:** ${lead.tier || '—'}
- **Type:** ${type.charAt(0).toUpperCase() + type.slice(1)}

## Subject Lines
1. ✅ **Recommended:** ${subject}

## Email Body

${body}

## Design Notes
- **切入角度:** Generic cold email (no company research)
- **类型:** iron
- **联系人来源:** csv
`;

    if (dryRun) {
      console.log(`📝 [DRY RUN] ${company} → ${contactName} (${lead.email})`);
    } else {
      const fileName = `iron-generic-${emailSafe}.md`;
      const filePath = path.join(DRAFTS_DIR, fileName);
      fs.writeFileSync(filePath, draft, 'utf8');
      console.log(`✅ ${company} → ${contactName} (${lead.email})`);
    }

    generated++;
    if (!dryRun) await new Promise(r => setTimeout(r, 50));
  }

  console.log(`\n========================================`);
  console.log(`完成: 生成 ${generated} 封草稿`);
  console.log('========================================');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
