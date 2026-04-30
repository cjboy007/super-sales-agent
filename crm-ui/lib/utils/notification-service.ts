/**
 * 通知服务
 * 
 * 功能：
 * 1. Discord webhook 通知
 * 2. 飞书消息通知
 * 
 * 使用场景：
 * - 订单状态变更
 * - 新订单创建
 * - 其他重要事件
 */

import { OrderStatusLabels } from '../../enums/order-status';

// ==================== 类型定义 ====================

interface OrderStatusChangeNotification {
  order_id: string;
  customer_name: string;
  customer_email: string;
  old_status: string;
  new_status: string;
  changed_by: string;
  notes?: string;
  timestamp: string;
}

// ==================== Discord 通知 ====================

/**
 * 发送 Discord webhook 通知
 * 
 * @param data 通知数据
 * @returns 发送结果
 */
export async function sendDiscordNotification(
  data: OrderStatusChangeNotification
): Promise<{ success: boolean; message_id?: string }> {
  // 从环境变量获取 webhook URL
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  
  if (!webhookUrl) {
    console.warn('Discord webhook URL 未配置，跳过通知发送');
    return { success: false };
  }
  
  // 构建 Embed 消息
  const embed = {
    title: '📦 订单状态更新',
    description: `订单 **${data.order_id}** 的状态已更新`,
    color: getStatusColor(data.new_status),
    fields: [
      {
        name: '👤 客户名称',
        value: data.customer_name,
        inline: true
      },
      {
        name: '📧 客户邮箱',
        value: data.customer_email,
        inline: true
      },
      {
        name: '🔄 状态变更',
        value: `${getStatusLabel(data.old_status)} → ${getStatusLabel(data.new_status)}`,
        inline: false
      },
      {
        name: '📝 备注',
        value: data.notes || '无',
        inline: false
      },
      {
        name: '👤 操作人',
        value: data.changed_by,
        inline: true
      },
      {
        name: '⏰ 时间',
        value: formatTimestamp(data.timestamp),
        inline: true
      }
    ],
    footer: {
      text: 'Super Sales Agent CRM'
    },
    timestamp: data.timestamp
  };
  
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        embeds: [embed]
      })
    });
    
    if (!response.ok) {
      throw new Error(`Discord API 返回错误：${response.status} ${response.statusText}`);
    }
    
    // 尝试获取 message_id（如果 webhook 响应中包含）
    const responseData = await response.json().catch(() => ({}));
    
    return {
      success: true,
      message_id: responseData.id
    };
    
  } catch (error: any) {
    console.error('发送 Discord 通知失败:', error);
    throw error;
  }
}

// ==================== 飞书通知 ====================

/**
 * 发送飞书消息通知
 * 
 * @param data 通知数据
 * @returns 发送结果
 */
export async function sendFeishuNotification(
  data: OrderStatusChangeNotification
): Promise<{ success: boolean; message_id?: string }> {
  // 从环境变量获取飞书 webhook URL
  const webhookUrl = process.env.FEISHU_WEBHOOK_URL;
  
  if (!webhookUrl) {
    console.warn('飞书 webhook URL 未配置，跳过通知发送');
    return { success: false };
  }
  
  // 构建富文本消息
  const content = {
    msg_type: 'interactive',
    card: {
      config: {
        wide_screen_mode: true
      },
      header: {
        template: getFeishuHeaderColor(data.new_status),
        title: {
          tag: 'plain_text',
          content: '📦 订单状态更新'
        }
      },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**订单编号：** ${data.order_id}`
          }
        },
        {
          tag: 'div',
          fields: [
            {
              is_short: true,
              text: {
                tag: 'lark_md',
                content: `**客户名称：**\n${data.customer_name}`
              }
            },
            {
              is_short: true,
              text: {
                tag: 'lark_md',
                content: `**客户邮箱：**\n${data.customer_email}`
              }
            }
          ]
        },
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**状态变更：**\n${getStatusLabel(data.old_status)} → ${getStatusLabel(data.new_status)}`
          }
        },
        data.notes ? {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**备注：**\n${data.notes}`
          }
        } : null,
        {
          tag: 'hr'
        },
        {
          tag: 'div',
          fields: [
            {
              is_short: true,
              text: {
                tag: 'lark_md',
                content: `**操作人：**\n${data.changed_by}`
              }
            },
            {
              is_short: true,
              text: {
                tag: 'lark_md',
                content: `**时间：**\n${formatTimestamp(data.timestamp)}`
              }
            }
          ]
        }
      ].filter(Boolean)
    }
  };
  
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(content)
    });
    
    if (!response.ok) {
      throw new Error(`飞书 API 返回错误：${response.status} ${response.statusText}`);
    }
    
    const responseData = await response.json();
    
    return {
      success: responseData.StatusCode === 0 || responseData.code === 0,
      message_id: responseData.data?.message_id
    };
    
  } catch (error: any) {
    console.error('发送飞书通知失败:', error);
    throw error;
  }
}

// ==================== 辅助函数 ====================

/**
 * 获取状态显示名称
 */
function getStatusLabel(status: string): string {
  return OrderStatusLabels[status as keyof typeof OrderStatusLabels]?.zh || status;
}

/**
 * 获取状态颜色（Discord embed 颜色）
 */
function getStatusColor(status: string): number {
  const colors: Record<string, number> = {
    'pending_production': 10038562,  // gray
    'in_production': 3447003,        // blue
    'ready_to_ship': 15158332,       // yellow
    'shipped': 10181046,             // purple
    'completed': 5763719,            // green
    'cancelled': 15548997            // red
  };
  
  return colors[status] || 10038562;
}

/**
 * 获取飞书卡片头部颜色
 */
function getFeishuHeaderColor(status: string): string {
  const colors: Record<string, string> = {
    'pending_production': 'gray',
    'in_production': 'blue',
    'ready_to_ship': 'yellow',
    'shipped': 'purple',
    'completed': 'green',
    'cancelled': 'red'
  };
  
  return colors[status] || 'gray';
}

/**
 * 格式化时间戳
 */
function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return timestamp;
  }
}
