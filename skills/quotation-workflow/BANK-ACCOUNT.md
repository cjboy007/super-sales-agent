# Farreach 银行账户信息

**更新时间：** 2026-03-27  
**来源：** PI032301J (Jordan Yeung)

---

## 🏦 HSBC Hong Kong（主要收款账户）

| 字段 | 信息 |
|------|------|
| **BENEFICIARY** | FARREACH ELECTRONIC CO LIMITED |
| **BANK NAME** | HSBC Hong Kong |
| **ACCOUNT NO.** | 411-758097-838 |
| **SWIFT** | HSBCHKHHHKH |
| **BANK ADD** | No.1 Queen's Road Central,Central, Hong Kong |

---

## 📋 使用场景

### 报价单/PI 银行信息

所有报价单和 Proforma Invoice 必须使用以上银行账户信息。

**HTML 报价单自动生成：**
```bash
python3 generate_quotation_html.py --data customer.json --output QT-001.html
# ✅ 自动包含 HSBC 香港账户信息
```

**自定义银行信息（如需要）：**
```json
{
  "bank_info": {
    "beneficiary": "FARREACH ELECTRONIC CO LIMITED",
    "bank_name": "HSBC Hong Kong",
    "account_no": "411-758097-838",
    "swift_code": "HSBCHKHHHKH",
    "bank_address": "No.1 Queen's Road Central,Central, Hong Kong"
  }
}
```

---

## 📝 历史账户（仅供参考）

### Standard Chartered Bank（旧账户，已停用）

| 字段 | 旧信息 |
|------|--------|
| **BENEFICIARY** | Farreach Electronic Co., Ltd. |
| **BANK NAME** | Standard Chartered Bank |
| **ACCOUNT NO.** | 1234 5678 9012 |
| **SWIFT** | SCBLHKHH |

**注意：** 2026-03-27 后生成的报价单使用 HSBC 香港账户。

---

## ✅ 验证

生成报价单后请检查银行信息是否正确：

```bash
# 生成报价单
python3 generate_quotation_html.py --data customer.json --output QT-001.html

# 在浏览器打开检查
open QT-001.html

# 检查 Bank Details 部分：
# Beneficiary: FARREACH ELECTRONIC CO LIMITED
# Bank Name: HSBC Hong Kong
# Account No: 411-758097-838
# SWIFT Code: HSBCHKHHHKH
# Bank Address: No.1 Queen's Road Central,Central, Hong Kong
```

---

**更新记录：**
- 2026-03-27: 更新为 HSBC Hong Kong 账户
