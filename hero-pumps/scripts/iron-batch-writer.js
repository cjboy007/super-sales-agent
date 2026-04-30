#!/usr/bin/env node
/**
 * IRON Batch Writer — 让 IRON 为所有联系人写个性化开发信
 * 
 * 策略：按公司分批，每家公司 spawn 一个 IRON 子 agent
 * 51 家公司 × 1 次 spawn = 51 次 IRON 调用
 * 输出到 campaign-tracker/templates/iron-{company}.md
 * 
 * 用法:
 *   node iron-batch-writer.js              # 全部
 *   node iron-batch-writer.js --company gc-gruppe  # 单家
 */

const fs = require('fs');
const path = require('path');

const RESEARCH_DIR = path.join(__dirname, '../research/companies');
const LEADS_DIR = path.join(__dirname, '../leads');
const DRAFTS_DIR = path.join(__dirname, '../campaign-tracker/templates');

const SIGNATURE = `Jaden Yeung
Sales Manager | Zhejiang Hero Pump Co., Ltd.
sales@heropumps.com
WhatsApp: +86 136 8034 2402
www.heropumps.com`;

function loadCompanies() {
  const companies = [];
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
  const cw = (company.website || '').toLowerCase().replace(/^www\./, '');
  const cn = (company.company || '').toLowerCase();
  
  let matches = leads.filter(l => {
    const w = (l.website || '').toLowerCase().replace(/^www\./, '');
    return w === cw || w.includes(cw) || cw.includes(w);
  });
  
  if (matches.length === 0) {
    matches = leads.filter(l => {
      const c = (l.company || '').toLowerCase();
      return c === cn || c.includes(cn) || cn.includes(c);
    });
  }
  
  return matches.sort((a, b) => {
    const roles = ['sales', 'purchas', 'export', 'product', 'manager', 'director', 'head', 'ceo'];
    const aRank = roles.findIndex(r => (a.position || '').toLowerCase().includes(r));
    const bRank = roles.findIndex(r => (b.position || '').toLowerCase().includes(r));
    return (aRank === -1 ? 99 : aRank) - (bRank === -1 ? 99 : bRank);
  });
}

function generateIronPrompt(company, contacts) {
  const summary = (company.research?.summary || '')
    .replace(/https?:\/\/[^\s]+/g, '')
    .substring(0, 200);
  
  return `你是 IRON，Hero Pump 的贸易操作员。请为 ${company.company} 写开发信。

## 公司背景
- **公司：** ${company.company}（${company.country}）
- **网站：** ${company.website}
- **行业：** ${company.industry}
- **调研：** ${summary || 'N/A'}

## 产品
变频循环泵（variable frequency circulating pumps）
- ErP EEI ≤ 0.23, TÜV SÜD, CE, RoHS
- 比 Grundfos/Wilo 低 30-40%
- 浙江桐乡工厂直供，支持 OEM

## 联系人（${contacts.length} 个，按优先级排序）
${contacts.map((c, i) => `${i+1}. ${c.contact_name || c.email} | ${c.email} | ${c.position || 'N/A'}`).join('\n')}

## 要求
1. 每封 80-120 词（不含签名）
2. 根据职位定制：Sales→价格/利润，Product→技术参数，CEO→战略价值
3. 严禁 "hope this finds you well"、破折号、空洞恭维
4. 结尾只推进一个动作
5. 每人 3 个主题行

## 签名
${SIGNATURE}

## 输出
对每个联系人输出：

### [姓名/邮箱]
- **职位：** [职位]
- **主题（推荐）：** [...]
- **备选：** [...] | [...]

**正文：**
[邮件内容]

---

请一次输出全部 ${contacts.length} 封。`;
}

function main() {
  const args = process.argv.slice(2);
  const target = args.includes('--company') ? args[args.indexOf('--company') + 1] : null;
  
  console.log('========================================');
  console.log('IRON Batch Writer — 准备数据');
  console.log('========================================\n');
  
  const companies = loadCompanies();
  const leads = loadLeads();
  
  let totalEmails = 0;
  let prompts = [];
  
  for (const company of companies) {
    const name = company._file.replace('.json', '');
    if (target && !name.toLowerCase().includes(target.toLowerCase())) continue;
    
    const contacts = matchContacts(company, leads);
    if (contacts.length === 0) continue;
    
    totalEmails += contacts.length;
    prompts.push({ company, contacts, name });
  }
  
  console.log(`${prompts.length} 家公司, ${totalEmails} 封邮件\n`);
  
  // 输出所有 prompt 到文件，供 WILSON 批量 spawn IRON
  const outputDir = path.join(__dirname, '../iron-tasks');
  fs.mkdirSync(outputDir, { recursive: true });
  
  for (const { company, contacts, name } of prompts) {
    const prompt = generateIronPrompt(company, contacts);
    const taskFile = path.join(outputDir, `${name.toLowerCase()}.json`);
    fs.writeFileSync(taskFile, JSON.stringify({
      company: company.company,
      country: company.country,
      contacts: contacts.map(c => ({ name: c.contact_name, email: c.email, position: c.position })),
      prompt
    }, null, 2));
    console.log(`✅ ${company.company} → ${contacts.length} 封 (${name.toLowerCase()}.json)`);
  }
  
  console.log(`\nPrompt 文件已输出到: iron-tasks/`);
  console.log(`WILSON 将批量 spawn IRON 子 agent 生成邮件`);
}

main();
