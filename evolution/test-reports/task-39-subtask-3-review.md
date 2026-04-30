# Task-39 Subtask 3 Review - 通知与提醒系统

## 📋 任务信息

- **Task ID**: 39
- **Subtask 3**: 通知与提醒
- **描述**: 实现物流/回款关键节点通知
- **验收标准**:
  - 发货通知（Discord/飞书）
  - 签收通知
  - 回款到账通知
  - 逾期提醒（每日扫描）

---

## 🔍 技术选型审查

### 1. 现有基础设施分析

#### ✅ 已存在的组件

**1.1 通知服务 (notification-service.ts)**
- **位置**: `/Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/crm-ui/lib/utils/notification-service.ts`
- **功能**: 
  - ✅ Discord webhook 通知（完整实现）
  - ✅ 飞书消息通知（完整实现）
  - ✅ 订单状态变更通知（OrderStatusChangeNotification）
  - ✅ 状态颜色映射（Discord embed + 飞书卡片）
- **状态**: **生产就绪**

**1.2 订单通知脚本 (send-order-notification.js)**
- **位置**: `/Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/skills/order-tracker/scripts/send-order-notification.js`
- **功能**:
  - ✅ SMTP 邮件通知（集成 imap-smtp-email）
  - ✅ 多语言模板（中/英）
  - ✅ 支持 6 种订单状态（in_production, ready_to_ship, shipped, completed, cancelled）
  - ✅ 自动记录通知历史到 orders.json
- **状态**: **生产就绪**

**1.3 物流自动通知服务 (auto_notification_service.js)**
- **位置**: `/Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/skills/logistics/api/controllers/auto_notification_service.js`
- **功能**:
  - ✅ 4 种物流通知类型（booking/shipment/arrival/delivery）
  - ✅ 邮件内容构建（HTML + Text）
  - ✅ OKKI 同步集成点
  - ⚠️ 邮件发送函数是占位符（需要集成 SMTP 模块）
- **状态**: **需要完成 SMTP 集成**

**1.4 物流数据模型 (logistics_model.js)**
- **位置**: `/Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/skills/logistics/models/logistics_model.js`
- **功能**:
  - ✅ 逾期检测 (`isOverdue()`)
  - ✅ 逾期天数计算 (`getOverdueDays()`)
  - ✅ 通知记录管理 (`addNotificationRecord()`)
- **状态**: **生产就绪**

**1.5 告警管理器 (alert-manager.js)**
- **位置**: `/Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/skills/approval-engine/src/alert-manager.js`
- **功能**:
  - ✅ Discord 告警发送
  - ✅ 告警节流（防止重复通知）
  - ✅ 告警历史记录
  - ✅ 订单逾期告警类型 (`order_overdue`)
- **状态**: **生产就绪**

**1.6 物流集成工具 (logistics-integration.ts)**
- **位置**: `/Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/crm-ui/lib/utils/logistics-integration.ts`
- **功能**:
  - ✅ 17Track API 集成（待激活）
  - ✅ 智能刷新调度
  - ✅ 承运商识别
- **状态**: **API Key 配置后可用**

---

### 2. 差距分析 (Gap Analysis)

| 验收标准 | 现有实现 | 差距 | 优先级 |
|---------|---------|------|--------|
| **发货通知** | ✅ `notification-service.ts` + `send-order-notification.js` | 需要统一调用入口 | P0 |
| **签收通知** | ✅ `auto_notification_service.js` (delivery 类型) | 需要激活 SMTP 集成 | P0 |
| **回款到账通知** | ❌ 未实现 | 需要新增 payment-received 通知 | P1 |
| **逾期提醒（每日扫描）** | ✅ `logistics_model.js` 有逾期检测<br>✅ `alert-manager.js` 有 order_overdue 类型 | 需要 cron 调度器 | P0 |

---

## 📐 架构建议

### 推荐架构

```
┌─────────────────────────────────────────────────────────┐
│                   通知触发层                              │
├─────────────────────────────────────────────────────────┤
│  • 订单状态变更 → notification-service.ts               │
│  • 物流状态变更 → auto_notification_service.js          │
│  • 回款确认 → [新增] payment-notification.js            │
│  • 每日逾期扫描 → [新增] overdue-scanner.ts (cron)      │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                   通知路由层                              │
├─────────────────────────────────────────────────────────┤
│  • 内部通知 → Discord (notification-service.sendDiscord)│
│  • 内部通知 → 飞书 (notification-service.sendFeishu)    │
│  • 客户通知 → SMTP 邮件 (imap-smtp-email/scripts/smtp.js)│
│  • OKKI 同步 → okki-sync.js (可选)                       │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                   通知记录层                              │
├─────────────────────────────────────────────────────────┤
│  • 本地日志 → logs/notifications.log                    │
│  • 订单记录 → orders.json (notification_sent 标记)      │
│  • 物流记录 → logistics.notificationRecords             │
│  • 告警历史 → alert-manager.js (alertHistory)           │
└─────────────────────────────────────────────────────────┘
```

---

## 🛠️ 详细执行指令

### 阶段 1: 完成物流通知 SMTP 集成 (P0)

**文件**: `/Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/skills/logistics/api/controllers/auto_notification_service.js`

**任务**:
1. 集成现有的 SMTP 邮件发送模块
2. 测试 4 种通知类型（booking/shipment/arrival/delivery）

**执行步骤**:

```bash
# 1. 修改 sendEmail 函数，使用现有 SMTP 模块
cd /Users/wilson/.openclaw/workspace/monorepo/super-sales-agent

# 2. 编辑 auto_notification_service.js，替换 sendEmail 占位符：
# 将 sendEmail() 函数替换为调用 imap-smtp-email 的 smtp.js

# 3. 测试发货通知
node skills/logistics/api/controllers/auto_notification_service.js \
  --test-shipment \
  --logistics-id LG-TEST-001

# 4. 测试签收通知
node skills/logistics/api/controllers/auto_notification_service.js \
  --test-delivery \
  --logistics-id LG-TEST-001
```

**代码修改**:
```javascript
// 替换 sendEmail 函数为实际调用
const { exec } = require('child_process');
const path = require('path');

async function sendEmail(emailData) {
  const smtpScript = path.join(__dirname, '../../../../../../imap-smtp-email/scripts/smtp.js');
  const envFile = path.join(__dirname, '../../../../../../imap-smtp-email/.env');
  
  return new Promise((resolve, reject) => {
    const command = `node ${smtpScript} send \\
      --to "${emailData.to}" \\
      --subject "${emailData.subject}" \\
      --body "${emailData.text.replace(/\n/g, '\\n')}" \\
      --env-file ${envFile}`;
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`SMTP 发送失败：${stderr}`));
        return;
      }
      resolve({
        success: true,
        messageId: `MSG-${Date.now()}`
      });
    });
  });
}
```

---

### 阶段 2: 实现回款到账通知 (P1)

**新文件**: `/Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/skills/order-tracker/scripts/payment-notification.js`

**功能**:
- 监听收款确认事件
- 发送 Discord/飞书内部通知
- 发送客户确认邮件
- 可选同步到 OKKI (trail_type=103)

**执行步骤**:

```bash
# 1. 创建回款通知脚本
cat > /Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/skills/order-tracker/scripts/payment-notification.js << 'EOF'
#!/usr/bin/env node

/**
 * Payment Received Notification
 * 
 * 发送回款到账通知到：
 * 1. Discord (内部团队)
 * 2. 飞书 (内部团队)
 * 3. 客户确认邮件
 * 4. OKKI 跟进记录 (trail_type=103)
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../imap-smtp-email/.env') });

// 通知配置
const CONFIG = {
  discord_webhook: process.env.DISCORD_WEBHOOK_URL,
  feishu_webhook: process.env.FEISHU_WEBHOOK_URL,
  smtp_from: process.env.SMTP_FROM || process.env.SMTP_USER,
};

/**
 * 发送 Discord 通知
 */
async function sendDiscordNotification(paymentData) {
  if (!CONFIG.discord_webhook) {
    console.warn('Discord webhook 未配置');
    return { success: false, reason: 'webhook_not_configured' };
  }
  
  const embed = {
    title: '💰 回款到账通知',
    description: `订单 **${paymentData.order_id}** 已收到款项`,
    color: 5763719, // green
    fields: [
      { name: '👤 客户名称', value: paymentData.customer_name, inline: true },
      { name: '💵 收款金额', value: `${paymentData.amount.toFixed(2)} ${paymentData.currency}`, inline: true },
      { name: '📧 客户邮箱', value: paymentData.customer_email, inline: true },
      { name: '🏦 收款方式', value: paymentData.payment_method || 'T/T', inline: true },
      { name: '📅 收款日期', value: new Date(paymentData.payment_date).toLocaleString('zh-CN'), inline: true },
      { name: '📝 备注', value: paymentData.notes || '无', inline: false }
    ],
    footer: { text: 'Super Sales Agent CRM' },
    timestamp: paymentData.payment_date
  };
  
  const response = await fetch(CONFIG.discord_webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] })
  });
  
  return {
    success: response.ok,
    status: response.status
  };
}

/**
 * 发送飞书通知
 */
async function sendFeishuNotification(paymentData) {
  if (!CONFIG.feishu_webhook) {
    console.warn('飞书 webhook 未配置');
    return { success: false, reason: 'webhook_not_configured' };
  }
  
  const content = {
    msg_type: 'interactive',
    card: {
      config: { wide_screen_mode: true },
      header: {
        template: 'green',
        title: { tag: 'plain_text', content: '💰 回款到账通知' }
      },
      elements: [
        { tag: 'div', text: { tag: 'lark_md', content: `**订单编号：** ${paymentData.order_id}` } },
        { tag: 'div', fields: [
          { is_short: true, text: { tag: 'lark_md', content: `**客户名称：**\n${paymentData.customer_name}` } },
          { is_short: true, text: { tag: 'lark_md', content: `**收款金额：**\n${paymentData.amount.toFixed(2)} ${paymentData.currency}` } }
        ]},
        { tag: 'div', fields: [
          { is_short: true, text: { tag: 'lark_md', content: `**收款方式：**\n${paymentData.payment_method || 'T/T'}` } },
          { is_short: true, text: { tag: 'lark_md', content: `**收款日期：**\n${new Date(paymentData.payment_date).toLocaleString('zh-CN')}` } }
        ]}
      ]
    }
  };
  
  const response = await fetch(CONFIG.feishu_webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(content)
  });
  
  const data = await response.json();
  return {
    success: data.StatusCode === 0 || data.code === 0,
    message_id: data.data?.message_id
  };
}

/**
 * 发送客户确认邮件
 */
async function sendCustomerEmail(paymentData) {
  const smtpScript = path.join(__dirname, '../../imap-smtp-email/scripts/smtp.js');
  const envFile = path.join(__dirname, '../../imap-smtp-email/.env');
  
  const subject = `Payment Received - Order ${paymentData.order_id}`;
  const body = `
Dear ${paymentData.customer_name},

We have received your payment successfully.

Payment Details:
- Order ID: ${paymentData.order_id}
- Amount: ${paymentData.amount.toFixed(2)} ${paymentData.currency}
- Payment Method: ${paymentData.payment_method || 'T/T'}
- Payment Date: ${new Date(paymentData.payment_date).toLocaleDateString('en-US')}

Thank you for your prompt payment. We will proceed with your order immediately.

Best regards,
Farreach Electronic Co., Ltd
  `.trim();
  
  const { exec } = require('child_process');
  const command = `node ${smtpScript} send --to "${paymentData.customer_email}" --subject "${subject}" --body "${body.replace(/\n/g, '\\n')}" --env-file ${envFile}`;
  
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`SMTP 发送失败：${stderr}`));
        return;
      }
      resolve({ success: true, messageId: `MSG-${Date.now()}` });
    });
  });
}

/**
 * 同步到 OKKI (trail_type=103: 收款)
 */
async function syncToOKKI(paymentData) {
  // TODO: 调用 OKKI API 创建跟进记录
  console.log('[OKKI Sync] 创建收款跟进记录:', paymentData.order_id);
  return { success: true };
}

/**
 * 主函数：发送回款通知
 */
async function sendPaymentNotification(paymentData) {
  const results = {
    order_id: paymentData.order_id,
    timestamp: new Date().toISOString(),
    discord: null,
    feishu: null,
    email: null,
    okki: null
  };
  
  try {
    results.discord = await sendDiscordNotification(paymentData);
    results.feishu = await sendFeishuNotification(paymentData);
    results.email = await sendCustomerEmail(paymentData);
    results.okki = await syncToOKKI(paymentData);
    
    console.log('[Payment Notification] All notifications sent:', results);
    return { success: true, results };
  } catch (error) {
    console.error('[Payment Notification] Failed:', error);
    return { success: false, error: error.message, results };
  }
}

// CLI 入口
if (require.main === module) {
  const args = process.argv.slice(2);
  // 解析参数并调用 sendPaymentNotification
  // 示例：node payment-notification.js --order-id ORD-123 --amount 5000 --currency USD
}

module.exports = { sendPaymentNotification, sendDiscordNotification, sendFeishuNotification, sendCustomerEmail };
EOF
```

---

### 阶段 3: 实现逾期提醒每日扫描 (P0)

**新文件**: `/Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/skills/logistics/scripts/overdue-scanner.ts`

**功能**:
- 每日扫描所有物流记录
- 检测逾期订单（超过 ETA 未送达）
- 发送告警到 Discord
- 生成逾期报告

**执行步骤**:

```bash
# 1. 创建逾期扫描脚本
cat > /Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/skills/logistics/scripts/overdue-scanner.ts << 'EOF'
/**
 * 逾期订单每日扫描器
 * 
 * 功能：
 * 1. 扫描所有未送达的物流记录
 * 2. 检测是否超过 ETA
 * 3. 发送 Discord 告警
 * 4. 生成逾期报告
 * 
 * 部署：添加到 OpenClaw Cron，每天 8:00 执行
 */

import { LogisticsRecord, LogisticsStatus } from '../models/logistics_model';
import { sendAlert } from '../../approval-engine/src/alert-manager';

interface OverdueReport {
  scan_date: string;
  total_scanned: number;
  overdue_count: number;
  overdue_orders: Array<{
    logistics_id: string;
    order_id: string;
    customer_name: string;
    eta: string;
    overdue_days: number;
    status: string;
  }>;
}

/**
 * 扫描逾期订单
 */
export async function scanOverdueOrders(): Promise<OverdueReport> {
  // TODO: 从数据库/文件加载所有物流记录
  const allLogistics: LogisticsRecord[] = [];
  
  const report: OverdueReport = {
    scan_date: new Date().toISOString(),
    total_scanned: allLogistics.length,
    overdue_count: 0,
    overdue_orders: []
  };
  
  for (const logistics of allLogistics) {
    // 跳过已送达/已取消的记录
    if ([LogisticsStatus.DELIVERED, LogisticsStatus.CANCELLED].includes(logistics.status)) {
      continue;
    }
    
    // 检查是否逾期
    if (logistics.isOverdue()) {
      const overdueDays = logistics.getOverdueDays();
      
      report.overdue_count++;
      report.overdue_orders.push({
        logistics_id: logistics.logisticsId,
        order_id: logistics.orderId,
        customer_name: logistics.customerInfo.name,
        eta: logistics.eta,
        overdue_days: overdueDays,
        status: logistics.status
      });
      
      // 发送 Discord 告警
      await sendAlert({
        type: 'logistics_overdue',
        severity: overdueDays > 7 ? 'critical' : 'warning',
        message: `物流逾期 ${overdueDays} 天`,
        context: {
          logistics_id: logistics.logisticsId,
          order_id: logistics.orderId,
          customer_name: logistics.customerInfo.name,
          eta: logistics.eta,
          overdue_days: overdueDays,
          status: logistics.status
        },
        timestamp: new Date().toISOString()
      });
    }
  }
  
  // 生成报告
  console.log('[Overdue Scanner] 扫描完成:', report);
  return report;
}

// CLI 入口
if (require.main === module) {
  scanOverdueOrders().catch(console.error);
}
EOF
```

**部署到 OpenClaw Cron**:

```bash
# 添加每日 8:00 执行的 cron 任务
openclaw cron add \
  --name "logistics-overdue-scanner" \
  --schedule "0 8 * * *" \
  --agent wilson \
  --message "执行物流逾期扫描：cd /Users/wilson/.openclaw/workspace/monorepo/super-sales-agent && node skills/logistics/scripts/overdue-scanner.js"
```

---

### 阶段 4: 统一通知入口 (P2)

**新文件**: `/Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/crm-ui/lib/utils/unified-notification.ts`

**目标**: 提供单一 API 供所有业务模块调用

```typescript
export interface NotificationRequest {
  type: 'order_status' | 'logistics' | 'payment' | 'overdue_alert';
  channel: 'discord' | 'feishu' | 'email' | 'okki';
  recipient?: {
    email?: string;
    discord_channel?: string;
    feishu_chat?: string;
  };
  data: any;
  skip_throttle?: boolean;
}

export async function sendNotification(request: NotificationRequest): Promise<NotificationResult> {
  // 路由到对应的通知处理器
  switch (request.type) {
    case 'order_status':
      return handleOrderStatusNotification(request);
    case 'logistics':
      return handleLogisticsNotification(request);
    case 'payment':
      return handlePaymentNotification(request);
    case 'overdue_alert':
      return handleOverdueAlert(request);
    default:
      throw new Error(`Unknown notification type: ${request.type}`);
  }
}
```

---

## ✅ 验收清单

### 发货通知 (P0)
- [ ] 订单状态变更为 `shipped` 时自动触发
- [ ] Discord 通知发送成功
- [ ] 飞书通知发送成功
- [ ] 客户邮件发送成功
- [ ] 通知记录写入 orders.json

### 签收通知 (P0)
- [ ] 物流状态变更为 `delivered` 时自动触发
- [ ] 客户邮件发送成功
- [ ] OKKI 同步成功（可选）

### 回款到账通知 (P1)
- [ ] 收款确认后自动触发
- [ ] Discord 内部通知成功
- [ ] 飞书内部通知成功
- [ ] 客户确认邮件发送成功
- [ ] OKKI 跟进记录创建成功（trail_type=103）

### 逾期提醒 (P0)
- [ ] 每日 8:00 自动扫描
- [ ] 正确识别逾期订单（超过 ETA 未送达）
- [ ] Discord 告警发送成功
- [ ] 逾期报告生成
- [ ] 告警节流正常工作（30 分钟内不重复发送）

---

## 📊 技术选型结论

| 组件 | 选型 | 理由 |
|------|------|------|
| **内部通知** | Discord + 飞书 | 已有完整实现，团队日常使用 |
| **客户邮件** | imap-smtp-email | 已配置网易企业邮，支持 HTML 模板 |
| **OKKI 同步** | OKKI API | 已有向量检索和 CLI 工具 |
| **逾期扫描** | TypeScript + Cron | 与现有代码风格一致，OpenClaw Cron 调度 |
| **通知路由** | 统一入口函数 | 避免重复代码，便于维护 |

---

## 🎯 最终 verdict

```json
{
  "verdict": "approve",
  "instructions": "按 4 个阶段执行：\n1. 完成物流通知 SMTP 集成（P0, 2h）\n2. 实现回款到账通知（P1, 3h）\n3. 实现逾期提醒每日扫描（P0, 2h）\n4. 创建统一通知入口（P2, 2h）\n\n优先完成 P0 任务，确保发货/签收/逾期提醒可用。",
  "feedback": "现有基础设施完善（notification-service.ts, alert-manager.js, logistics_model.js 均已就绪），主要工作是集成和补全缺失环节。建议优先激活现有功能，再扩展新特性。"
}
```

---

## 📁 相关文件索引

| 文件 | 状态 | 用途 |
|------|------|------|
| `crm-ui/lib/utils/notification-service.ts` | ✅ 完成 | Discord/飞书通知 |
| `crm-ui/lib/utils/logistics-integration.ts` | ✅ 完成 | 17Track 集成 |
| `skills/logistics/models/logistics_model.js` | ✅ 完成 | 逾期检测 |
| `skills/logistics/api/controllers/auto_notification_service.js` | ⚠️ 待集成 SMTP | 物流邮件通知 |
| `skills/order-tracker/scripts/send-order-notification.js` | ✅ 完成 | 订单邮件通知 |
| `skills/approval-engine/src/alert-manager.js` | ✅ 完成 | Discord 告警 |
| `skills/order-tracker/scripts/payment-notification.js` | ❌ 待创建 | 回款通知 |
| `skills/logistics/scripts/overdue-scanner.ts` | ❌ 待创建 | 逾期扫描 |
| `crm-ui/lib/utils/unified-notification.ts` | ❌ 待创建 | 统一入口 |

---

**审阅完成时间**: 2026-04-03 12:30  
**审阅者**: Revolution System Reviewer  
**任务优先级**: P0 (发货/签收/逾期) > P1 (回款) > P2 (统一入口)
