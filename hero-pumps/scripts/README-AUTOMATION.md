# Super Sales Agent — 自动化运行流程

## 架构

```
research/companies/*.json → 49 家公司调研数据
     ↓
leads/*.csv → 541 个联系人
     ↓
scripts/batch-draft-generator-v2.js → 生成 49 封个性化邮件草稿
     ↓
campaign-tracker/templates/cold-email-*.md → 草稿库
     ↓
scripts/smtp-send-batch.js → 审核通过后批量发送
     ↓
SQLite DB → 状态追踪（已发/待跟进/冷却中）
```

## 每日运行流程

### 1. 批量生成草稿（按需）
```bash
node scripts/batch-draft-generator-v2.js
```
- 自动跳过已有草稿的公司
- 输出到 `campaign-tracker/templates/`

### 2. 人工审核草稿
- 检查 `campaign-tracker/templates/cold-email-*.md`
- 确认内容、收件人、公司信息正确

### 3. 批量发送（审核通过后）
```bash
node scripts/smtp-send-batch.js --limit 5
```
- 默认每天发 5 封（安全速率）
- 使用 Hero Pump 签名
- 自动写入 SQLite DB

### 4. 回复处理
```bash
node ../../shared/reply-processor.js
```
- 检查 IMAP 收件箱
- 匹配回复到客户
- 意图识别 + 生成回复草稿

### 5. 自动跟进
```bash
node ../../shared/follow-up-engine.js
```
- 读取 DB 中需要跟进的客户
- 按阶段策略自动发送跟进邮件

## 发送策略

| 参数 | 值 |
|------|-----|
| 每日发送上限 | 5 封/天 |
| 发送间隔 | 2-3 分钟随机 |
| 跟进策略 | 第 2/5/10/20 天 |
| 冷却期 | 90 天 |
| 最大跟进次数 | 4 次 |

## 安全规则

1. 所有邮件草稿必须人工审核后再发送
2. 使用 Hero Pump 签名（禁止用 Farreach）
3. 跳过无效邮箱、已发送过的客户
4. 发送间隔随机化，避免被标记为垃圾邮件
