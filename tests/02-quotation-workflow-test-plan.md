# 报价单工作流测试方案 (quotation-workflow)

---

## 测试目标

验证报价单自动生成（Excel/Word/HTML/PDF）的正确性、格式规范性和数据准确性。

---

## 模块概述

**核心文件：**
- `skills/quotation-workflow/scripts/generate-all.sh` - 统一生成入口
- `skills/quotation-workflow/scripts/generate_quotation_excel.py` - Excel 生成
- `skills/quotation-workflow/scripts/generate_quotation_word.py` - Word 生成
- `skills/quotation-workflow/scripts/generate_quotation_html.py` - HTML 生成
- `skills/quotation-workflow/scripts/convert-to-pdf.sh` - PDF 转换
- `config/bank-accounts.json` - 银行账户配置

**依赖：**
- Python 3 + openpyxl, python-docx
- Node.js (统一入口)
- Google Chrome (PDF 导出)

---

## 1. 单元测试

### 1.1 数据验证测试

| 测试用例 | 输入数据 | 预期结果 | 通过标准 |
|---------|---------|---------|---------|
| TC-VALIDATE-001 | 有效客户数据 | 验证通过 | 无错误 |
| TC-VALIDATE-002 | 客户名含"Example" | 验证失败 | 错误：示例关键词 |
| TC-VALIDATE-003 | 邮箱@test.com | 验证失败 | 错误：测试邮箱 |
| TC-VALIDATE-004 | 地址含"123 Test St" | 验证失败 | 错误：占位符地址 |
| TC-VALIDATE-005 | 产品列表为空 | 验证失败 | 错误：产品不能为空 |
| TC-VALIDATE-006 | 产品价格 <= 0 | 验证失败 | 错误：价格无效 |
| TC-VALIDATE-007 | 编号格式错误 | 验证失败 | 错误：QT-YYYYMMDD-XXX |

### 1.2 Excel 生成测试

| 测试用例 | 输入 | 预期结果 | 通过标准 |
|---------|------|---------|---------|
| TC-EXCEL-001 | 标准数据 (5 产品) | 生成.xlsx 文件 | 文件存在，可打开 |
| TC-EXCEL-002 | 单产品数据 | 生成单行表格 | 格式正确 |
| TC-EXCEL-003 | 50 产品数据 | 生成多页表格 | 分页正确 |
| TC-EXCEL-004 | 含特殊字符 | 正确显示 | 无乱码 |
| TC-EXCEL-005 | 长文本描述 | 单元格自动换行 | 内容完整显示 |
| TC-EXCEL-006 | 货币格式化 | 正确显示 USD | $8.50 格式 |
| TC-EXCEL-007 | 计算公式 | 总额自动计算 | 公式正确 |

### 1.3 Word 生成测试

| 测试用例 | 输入 | 预期结果 | 通过标准 |
|---------|------|---------|---------|
| TC-WORD-001 | 标准数据 | 生成.docx 文件 | 文件存在，可打开 |
| TC-WORD-002 | 含公司 Logo | Logo 正确插入 | 图片清晰 |
| TC-WORD-003 | 表格格式 | 传统边框样式 | 符合模板 |
| TC-WORD-004 | Times New Roman 字体 | 字体正确应用 | 全文档一致 |
| TC-WORD-005 | 页眉页脚 | 正确显示 | 包含 QT 编号 |

### 1.4 HTML 生成测试

| 测试用例 | 输入 | 预期结果 | 通过标准 |
|---------|------|---------|---------|
| TC-HTML-001 | 标准数据 | 生成.html 文件 | 文件存在 |
| TC-HTML-002 | 响应式设计 | 移动端适配 | 布局正确 |
| TC-HTML-003 | Export to PDF 按钮 | 按钮可点击 | 触发打印 |
| TC-HTML-004 | 打印样式 | @media print 生效 | 无多余元素 |
| TC-HTML-005 | 传统风格模板 | 黑白配色 | 符合设计 |

### 1.5 PDF 转换测试

| 测试用例 | 输入 | 预期结果 | 通过标准 |
|---------|------|---------|---------|
| TC-PDF-001 | HTML → PDF | 生成.pdf 文件 | 文件存在 |
| TC-PDF-002 | A4 纸张 | 尺寸正确 | 8.27x11.69 英寸 |
| TC-PDF-003 | 无页眉页脚 | 干净输出 | --print-to-pdf-no-* |
| TC-PDF-004 | 多页文档 | 分页正确 | 无截断 |
| TC-PDF-005 | 中文字符 | 正确渲染 | 无方框 |

### 1.6 银行账户测试

| 测试用例 | 配置 | 预期结果 | 通过标准 |
|---------|------|---------|---------|
| TC-BANK-001 | 单一账户配置 | 正确加载 | 所有字段完整 |
| TC-BANK-002 | 多账户配置 | 使用 active:true | 正确选择 |
| TC-BANK-003 | 无 active 字段 | 使用第一个 | 默认行为 |
| TC-BANK-004 | 配置为空 | 生成失败 | 错误提示 |
| TC-BANK-005 | 配置更新后 | 新文档用新配置 | 热加载 |

---

## 2. 集成测试

### 2.1 数据 → Excel → Word → HTML → PDF 全流程

**测试场景：** 完整文档生成链

**测试数据：**
```json
{
  "customer": {
    "company_name": "Acme Corporation",
    "contact": "John Doe",
    "email": "john@acme.com",
    "address": "123 Business Ave, New York, NY"
  },
  "quotation": {
    "quotation_no": "QT-20260327-001",
    "date": "2026-03-27",
    "valid_until": "2026-04-26"
  },
  "products": [
    {"description": "Product A", "quantity": 500, "unit_price": 8.50},
    {"description": "Product B", "quantity": 1000, "unit_price": 5.20}
  ],
  "trade_terms": {
    "incoterms": "FOB Shenzhen",
    "currency": "USD",
    "delivery": "15-20 days"
  }
}
```

**预期流程：**
1. 数据验证通过
2. 生成 Excel (.xlsx)
3. 生成 Word (.docx)
4. 生成 HTML (.html)
5. HTML 转 PDF (.pdf)
6. 所有文件输出到 output/

**通过标准：** 4 种格式全部生成，数据一致

### 2.2 统一入口脚本测试

**测试场景：** generate-document.js 调用

**命令：**
```bash
node scripts/generate-document.js --type quotation --data data/customer.json --output QT-20260327-001
```

**预期结果：** 自动调用所有生成脚本

### 2.3 OKKI 跟进记录写入

**测试场景：** 报价单发送后同步

**预期流程：**
1. 报价单生成
2. 通过邮件发送
3. 写入 OKKI trail_type=101
4. 关联客户 ID

**通过标准：** OKKI 中有跟进记录

---

## 3. 端到端测试

### 3.1 E2E-001: 完整报价流程

**前置条件：**
- 客户数据在 OKKI 中
- 产品数据在知识库
- 银行账户配置完成

**步骤：**
1. 从 OKKI 获取客户数据
2. 选择产品并输入数量
3. 运行 generate-document.js
4. 检查 output/ 目录
5. 发送 PDF 给客户
6. 写入 OKKI 跟进记录

**预期结果：**
- 4 种格式文件生成
- 银行信息正确
- 金额计算准确
- OKKI 有记录

**通过标准：** 全流程 < 2 分钟

### 3.2 E2E-002: 批量报价生成

**步骤：**
1. 准备 10 个客户数据
2. 批量生成报价单
3. 检查所有输出文件

**预期结果：** 10 个报价单全部生成，无错误

### 3.3 E2E-003: 报价单修订流程

**步骤：**
1. 生成初始报价 QT-001
2. 修改价格后重新生成
3. 版本号递增 QT-001-R1

**预期结果：** 版本管理正确

---

## 4. 边界条件测试

### 4.1 异常输入

| 测试用例 | 输入 | 预期处理 |
|---------|------|---------|
| TC-BOUND-001 | 产品数量 = 0 | 验证失败 |
| TC-BOUND-002 | 产品价格 = 负数 | 验证失败 |
| TC-BOUND-003 | 客户名为空 | 验证失败 |
| TC-BOUND-004 | 日期格式错误 | 验证失败 |
| TC-BOUND-005 | 货币代码无效 | 验证失败 |

### 4.2 极端值

| 测试用例 | 场景 | 预期处理 |
|---------|------|---------|
| TC-EXTREME-001 | 产品数量 = 1,000,000 | 正常处理 |
| TC-EXTREME-002 | 单价 = 0.01 | 正常处理 |
| TC-EXTREME-003 | 产品数量 = 999,999,999 | 溢出检查 |
| TC-EXTREME-004 | 1000 个产品 | 分页处理 |
| TC-EXTREME-005 | 描述文本 > 1000 字符 | 截断或换行 |

### 4.3 错误恢复

| 测试用例 | 故障场景 | 预期恢复 |
|---------|---------|---------|
| TC-RECOVER-001 | Chrome 未安装 | 跳过 PDF 生成，告警 |
| TC-RECOVER-002 | 磁盘空间不足 | 停止生成，告警 |
| TC-RECOVER-003 | Python 依赖缺失 | 错误提示 + 安装指南 |
| TC-RECOVER-004 | 模板文件损坏 | 使用默认模板 |

---

## 5. 性能测试

### 5.1 生成时间

| 文档类型 | 目标时间 | 测量方法 |
|---------|---------|---------|
| Excel | < 2s | 单文件生成 |
| Word | < 3s | 单文件生成 |
| HTML | < 1s | 单文件生成 |
| PDF | < 5s | Chrome 渲染 |
| 全流程 | < 10s | 4 种格式 |

### 5.2 并发能力

| 场景 | 并发数 | 预期吞吐量 |
|-----|-------|-----------|
| 正常负载 | 5 个/分钟 | 100% 成功率 |
| 峰值负载 | 20 个/分钟 | > 95% 成功率 |
| 压力测试 | 50 个/分钟 | > 90% 成功率 |

### 5.3 资源消耗

| 指标 | 限制 | 监控方式 |
|-----|------|---------|
| 内存占用 | < 300MB | process monitoring |
| CPU 使用 | < 30% | top/htop |
| Chrome 实例 | < 3 并发 | 防止过载 |

---

## 测试数据样例

### 标准报价数据

```json
{
  "customer": {
    "company_name": "Acme Corporation",
    "contact": "John Doe",
    "email": "john@acme-corp.com",
    "phone": "+1-555-123-4567",
    "address": "123 Business Avenue, New York, NY 10001",
    "country": "USA"
  },
  "quotation": {
    "quotation_no": "QT-20260327-001",
    "date": "2026-03-27",
    "valid_until": "2026-04-26"
  },
  "products": [
    {
      "description": "Wireless Bluetooth Headphones",
      "specification": "BT 5.0, 30h battery, ANC",
      "quantity": 500,
      "unit_price": 8.50
    },
    {
      "description": "USB-C Charging Cable",
      "specification": "1m, 60W, braided",
      "quantity": 1000,
      "unit_price": 2.30
    }
  ],
  "trade_terms": {
    "incoterms": "FOB Shenzhen",
    "currency": "USD",
    "delivery": "15-20 days",
    "payment": "T/T 30% deposit"
  }
}
```

### 计算验证

```
Product A: 500 × $8.50 = $4,250.00
Product B: 1000 × $2.30 = $2,300.00
Subtotal: $6,550.00
```

---

## 通过标准汇总

| 测试类型 | 通过率要求 | 关键指标 |
|---------|-----------|---------|
| 单元测试 | 100% | 所有用例通过 |
| 集成测试 | 100% | 格式转换正确 |
| 端到端测试 | 100% | 业务流程完整 |
| 边界测试 | > 95% | 异常处理正确 |
| 性能测试 | 满足目标 | 生成时间 < 10s |

---

## 测试环境要求

- **Python 3.8+** with openpyxl, python-docx
- **Node.js 18+**
- **Google Chrome** (PDF 导出)
- **测试输出目录：** output/test/

---

**文档版本：** 1.0.0  
**创建日期：** 2026-03-27  
**维护者：** Super Sales Agent QA Team
