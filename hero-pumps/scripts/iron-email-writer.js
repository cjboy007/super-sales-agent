#!/usr/bin/env node
/**
 * IRON Email Writer — 为单个公司生成个性化开发信
 * 
 * 用法: node iron-email-writer.js <company-json-file>
 * 输出: 写入 campaign-tracker/templates/iron-*.md
 * 
 * 由 WILSON 批量调用，为 51 家公司各 spawn 一个 IRON 子 agent
 */

const fs = require('fs');
const path = require('path');

// ==================== 产品信息 ====================
const PRODUCT = `变频循环泵（variable frequency circulating pumps）
- ErP EEI ≤ 0.23, TÜV SÜD 认证
- CE (QA TECHNIC) 和 RoHS 认证
- 比 Grundfos/Wilo 低 30-40%
- 浙江桐乡工厂直供
- 支持 OEM 贴牌定制`;

const SIGNATURE = `Jaden Yeung
Sales Manager | Zhejiang Hero Pump Co., Ltd.
sales@heropumps.com
WhatsApp: +86 136 8034 2402
www.heropumps.com`;

// ==================== 读取公司数据 ====================
function loadCompanyData(jsonFile) {
  const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  return data;
}

// ==================== 生成 IRON Prompt ====================
function generatePrompt(company, contacts) {
  return `你是 IRON，Hero Pump 的贸易操作员。请为以下公司写开发信。

## 公司信息
- **公司名：** ${company.company}
- **国家：** ${company.country}
- **网站：** ${company.website}
- **Tier：** ${company.tier}
- **调研摘要：** ${company.research?.summary?.replace(/https?:\/\/[^\s]+/g, '').substring(0, 200) || 'N/A'}

## 产品信息
${PRODUCT}

## 联系人（${contacts.length} 个）
${contacts.map((c, i) => `${i + 1}. **${c.contact_name || c.email}** | ${c.email} | ${c.position || 'N/A'} | ${c.tier || 'N/A'}`).join('\n')}

## 写作要求
1. 为每个联系人写一封个性化邮件
2. 根据职位定制内容：
   - Sales/Purchasing/Export → 价格优势、利润空间、供应链
   - Product/Engineering/R&D → 技术参数、认证、系统集成
   - CEO/Manager/Director → 品牌互补、战略价值
   - 通用邮箱 → 简洁介绍 + 请求转交负责人
3. 开头个性化，提到公司所在国家或行业
4. 正文 80-120 词（不含签名）
5. 严禁：hope this email finds you well、破折号、空洞恭维
6. 结尾只推进一个动作：同意接收产品单页和报价
7. 每个联系人 3 个主题行

## 签名（每封邮件末尾）
${SIGNATURE}

## 输出格式
为每个联系人输出：

### [联系人姓名/邮箱]
- **职位：** [职位]
- **主题（推荐）：** [推荐主题]
- **主题备选：** [备选1] | [备选2]

**正文：**
[邮件正文]

---
`;
}

// ==================== 主程序 ====================
if (require.main === module) {
  const jsonFile = process.argv[2];
  if (!jsonFile) {
    console.log('用法: node iron-email-writer.js <company-json-file>');
    process.exit(1);
  }
  
  const company = loadCompanyData(jsonFile);
  console.log(generatePrompt(company, company.contacts || []));
}

module.exports = { generatePrompt, loadCompanyData };
