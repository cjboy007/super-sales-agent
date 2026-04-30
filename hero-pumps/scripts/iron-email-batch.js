#!/usr/bin/env node
/**
 * IRON Email Batch Generator v2
 * 
 * 为每个公司生成 prompt，输出到 drafts-to-write/ 目录
 * IRON 读取 prompt 后写出邮件
 * 
 * 用法:
 *   node iron-email-batch.js              # 全部
 *   node iron-email-batch.js --company gc-gruppe
 */

const fs = require('fs');
const path = require('path');

const RESEARCH_DIR = path.join(__dirname, '../research/companies');
const LEADS_DIR = path.join(__dirname, '../leads');
const OUTPUT_DIR = path.join(__dirname, '../drafts-to-write');

const HERO_PUMP = {
  products: '变频循环泵（variable frequency circulating pumps）',
  certs: 'ErP EEI ≤ 0.23, TÜV SÜD, CE (QA TECHNIC), RoHS',
  price: '比 Grundfos/Wilo 低 30-40%',
  factory: '浙江桐乡（Zhejiang Hero Pump Co., Ltd.）',
  oem: '支持贴牌定制',
  website: 'www.heropumps.com',
  email: 'sales@heropumps.com',
  whatsapp: '+86 136 8034 2402',
  signature: `Jaden Yeung
Sales Manager | Zhejiang Hero Pump Co., Ltd.
sales@heropumps.com
WhatsApp: +86 136 8034 2402
www.heropumps.com`
};

function loadCompanies() {
  const companies = [];
  if (!fs.existsSync(RESEARCH_DIR)) return companies;
  for (const file of fs.readdirSync(RESEARCH_DIR).filter(f => f.endsWith('.json'))) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(RESEARCH_DIR, file), 'utf8'));
      data._file = file;
      companies.push(data);
    } catch(e) {}
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
      if (lead.email && lead.email.includes('@') && !lead.email.includes('IncompleteRead') && lead.email.length > 5) {
        leads.push(lead);
      }
    }
  }
  return leads;
}

function matchContacts(company, leads) {
  const companyWebsite = (company.website || '').toLowerCase().replace(/^www\./, '');
  const companyName = (company.company || '').toLowerCase();
  
  let matches = leads.filter(l => {
    const w = (l.website || '').toLowerCase().replace(/^www\./, '');
    return w === companyWebsite || w.includes(companyWebsite) || companyWebsite.includes(w);
  });
  
  if (matches.length === 0) {
    matches = leads.filter(l => {
      const c = (l.company || '').toLowerCase();
      return c === companyName || c.includes(companyName) || companyName.includes(c);
    });
  }
  
  return matches;
}

function generatePrompt(company, contacts) {
  const lines = [];
  lines.push(`你是 IRON，Hero Pump 的贸易操作员。请为以下公司写开发信。\n`);
  lines.push(`## 公司信息`);
  lines.push(`- **公司名：** ${company.company}`);
  lines.push(`- **国家：** ${company.country}`);
  lines.push(`- **网站：** ${company.website}`);
  lines.push(`- **行业：** ${company.industry}`);
  lines.push(`- **调研：** ${company.research?.summary?.substring(0, 300) || 'N/A'}\n`);
  lines.push(`## Hero Pump 产品信息`);
  lines.push(`- 产品：变频循环泵（variable frequency circulating pumps）`);
  lines.push(`- 认证：ErP EEI ≤ 0.23, TÜV SÜD, CE, RoHS`);
  lines.push(`- 价格：比 Grundfos/Wilo 低 30-40%`);
  lines.push(`- 工厂：浙江桐乡（Zhejiang Hero Pump Co., Ltd.）`);
  lines.push(`- OEM：支持贴牌定制\n`);
  lines.push(`## 写作要求`);
  lines.push(`1. 每封邮件根据联系人职位定制内容`);
  lines.push(`   - Sales/Purchasing/Export → 价格优势、利润空间`);
  lines.push(`   - Product/Engineering → 技术参数、认证、系统集成`);
  lines.push(`   - CEO/Manager → 品牌互补、战略价值`);
  lines.push(`   - 通用邮箱 → 简洁介绍 + 请求转交负责人`);
  lines.push(`2. 开头个性化，提到公司所在国家或行业`);
  lines.push(`3. 正文 80-120 词（不含签名）`);
  lines.push(`4. 严禁：hope this email finds you well、破折号、空洞恭维`);
  lines.push(`5. 结尾只推进一个动作：同意接收产品单页和报价`);
  lines.push(`6. 每个联系人 3 个主题行\n`);
  lines.push(`## 签名`);
  lines.push(HERO_PUMP.signature + '\n');
  lines.push(`## 联系人列表（${contacts.length} 个）\n`);
  
  contacts.forEach((c, idx) => {
    lines.push(`${idx + 1}. ${c.contact_name || 'N/A'} | ${c.email} | ${c.position || 'N/A'}`);
  });
  
  lines.push(`\n请为以上每个联系人写一封个性化开发信。\n`);
  lines.push(`输出格式：`);
  lines.push(`### [联系人姓名]（[邮箱]）`);
  lines.push(`**职位：** [职位]`);
  lines.push(`**主题（推荐）：** [推荐主题]`);
  lines.push(`**主题备选：** [备选1] | [备选2]`);
  lines.push(`\n[邮件正文]\n---\n`);
  
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const targetCompany = args.includes('--company') ? args[args.indexOf('--company') + 1] : null;
  const dryRun = args.includes('--dry-run');
  
  console.log('========================================');
  console.log('IRON Email Batch Generator');
  console.log(`模式: ${dryRun ? 'DRY RUN' : 'PRODUCTION'}`);
  if (targetCompany) console.log(`目标: ${targetCompany}`);
  console.log('========================================\n');
  
  const companies = loadCompanies();
  const leads = loadLeads();
  
  console.log(`加载: ${companies.length} 家公司, ${leads.length} 个联系人\n`);
  
  let totalEmails = 0;
  let companiesProcessed = 0;
  
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  for (const company of companies) {
    const name = company._file.replace('.json', '');
    if (targetCompany && !name.toLowerCase().includes(targetCompany.toLowerCase())) continue;
    
    const contacts = matchContacts(company, leads);
    
    if (contacts.length === 0) continue;
    
    companiesProcessed++;
    totalEmails += contacts.length;
    
    const prompt = generatePrompt(company, contacts);
    
    if (dryRun) {
      console.log(`📝 [DRY RUN] ${company.company} → ${contacts.length} 封`);
    } else {
      const outputFile = path.join(OUTPUT_DIR, `${name.toLowerCase()}.md`);
      fs.writeFileSync(outputFile, prompt, 'utf8');
      console.log(`✅ ${company.company} → ${contacts.length} 封 (${name.toLowerCase()}.md)`);
    }
  }
  
  console.log(`\n========================================`);
  console.log(`总计: ${companiesProcessed} 家公司, ${totalEmails} 封邮件`);
  console.log(`Prompts 输出到: drafts-to-write/`);
  console.log('========================================');
}

main();
