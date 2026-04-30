/**
 * 物流追踪集成工具
 * 
 * 功能:
 * 1. 调用 17Track API 查询物流状态
 * 2. 物流时间线数据格式化
 * 3. 智能刷新调度
 * 
 * 路径：/Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/crm-ui/lib/utils/logistics-integration.ts
 */

// ==================== 类型定义 ====================

export interface TrackingEvent {
  event_id: string;
  event_time: string;
  location?: string;
  description: string;
  status?: string;
  checkpoint_status?: string;
}

export interface TrackingInfo {
  tracking_number: string;
  carrier: string;
  carrier_name: string;
  status: string;
  status_description: string;
  origin_country?: string;
  destination_country?: string;
  shipped_date?: string;
  estimated_delivery_date?: string;
  actual_delivery_date?: string;
  events: TrackingEvent[];
  last_update_time?: string;
}

export interface CarrierInfo {
  code: string;
  name: string;
  phone?: string;
  homepage?: string;
}

// ==================== 配置 ====================

const CONFIG = {
  // 17Track API 配置
  api: {
    baseUrl: 'https://api.17track.net/rest/v2.2',
    // 注意：API Key 应从环境变量读取
    // apiKey: process.env.SEVERTEEN_TRACK_API_KEY || '',
    batchSize: 40, // 单次最多查询 40 个运单
  },

  // 智能刷新间隔（小时）
  refreshInterval: {
    pending: 6,           // 待发货：每 6 小时
    in_transit: 24,       // 运输中：每 24 小时
    customs_clearance: 12, // 清关：每 12 小时
    out_for_delivery: 6,  // 派送中：每 6 小时
    delivered: 0,         // 已签收：不再查询
    returning: 12,        // 退回中：每 12 小时
    returned: 0,          // 已退回：不再查询
    lost: 0,              // 丢失：不再查询
    customer_rejected: 0, // 客户拒收：不再查询
  },

  // 状态映射（17Track → 内部状态）
  statusMapping: {
    'InfoReceived': 'pending',
    'InTransit': 'in_transit',
    'CustomsHold': 'customs_clearance',
    'OutForDelivery': 'out_for_delivery',
    'Delivered': 'delivered',
    'ReturnToSender': 'returning',
    'Returned': 'returned',
    'Lost': 'lost',
    'Rejected': 'customer_rejected',
  } as Record<string, string>,
};

// ==================== 承运商识别 ====================

/**
 * 承运商正则表达式映射
 */
const CARRIER_PATTERNS: Record<string, RegExp> = {
  dhl: /^(\d{10,11}|[A-Z]{2,3}\d{6,8})$/i,
  fedex: /^\d{12,14}$/i,
  ups: /^1Z[A-Z0-9]{16}$/i,
  usps: /^(\d{20,22}|[A-Z]{2}\d{9}[A-Z]{2})$/i,
  sf: /^(\d{12,15}|SF\d{10,12})$/i,
  ems: /^[A-Z]{2}\d{9}[A-Z]{2}$/i,
  aramex: /^\d{9,12}$/i,
  tnt: /^\d{9}$/i,
};

/**
 * 识别承运商
 */
export function identifyCarrier(trackingNumber: string): string | null {
  for (const [carrier, pattern] of Object.entries(CARRIER_PATTERNS)) {
    if (pattern.test(trackingNumber)) {
      return carrier;
    }
  }
  return null;
}

/**
 * 获取承运商信息
 */
export function getCarrierInfo(carrierCode: string): CarrierInfo {
  const carriers: Record<string, CarrierInfo> = {
    dhl: { code: 'dhl', name: 'DHL Express', phone: '+1-800-225-5345', homepage: 'https://www.dhl.com' },
    fedex: { code: 'fedex', name: 'FedEx', phone: '+1-800-463-3339', homepage: 'https://www.fedex.com' },
    ups: { code: 'ups', name: 'UPS', phone: '+1-800-742-5877', homepage: 'https://www.ups.com' },
    usps: { code: 'usps', name: 'USPS', phone: '+1-800-275-8777', homepage: 'https://www.usps.com' },
    sf: { code: 'sf', name: '顺丰速运', phone: '95338', homepage: 'https://www.sf-express.com' },
    ems: { code: 'ems', name: 'EMS', phone: '11183', homepage: 'https://www.ems.com.cn' },
    aramex: { code: 'aramex', name: 'Aramex', phone: '+971-600-544000', homepage: 'https://www.aramex.com' },
    tnt: { code: 'tnt', name: 'TNT', phone: '+31-88-393-9000', homepage: 'https://www.tnt.com' },
  };

  return carriers[carrierCode.toLowerCase()] || { code: carrierCode, name: carrierCode };
}

// ==================== 17Track API 调用 ====================

/**
 * 批量注册运单到 17Track
 */
export async function registerTrackings(trackingNumbers: string[]): Promise<{
  success: boolean;
  registered_count: number;
  error?: string;
}> {
  // TODO: 实际调用 17Track API
  // const response = await fetch(`${CONFIG.api.baseUrl}/register`, {
  //   method: 'POST',
  //   headers: {
  //     '17track-token': CONFIG.api.apiKey,
  //     'Content-Type': 'application/json',
  //   },
  //   body: JSON.stringify({
  //     data: trackingNumbers.map(number => ({
  //       number,
  //       carrier: identifyCarrier(number),
  //     })),
  //   }),
  // });

  console.log('[17Track] 注册运单:', trackingNumbers);
  
  return {
    success: true,
    registered_count: trackingNumbers.length,
  };
}

/**
 * 批量查询物流状态
 */
export async function getTrackingInfo(trackingNumbers: string[]): Promise<{
  success: boolean;
  data: TrackingInfo[];
  error?: string;
}> {
  // TODO: 实际调用 17Track API
  // const response = await fetch(`${CONFIG.api.baseUrl}/gettrackinfo`, {
  //   method: 'POST',
  //   headers: {
  //     '17track-token': CONFIG.api.apiKey,
  //     'Content-Type': 'application/json',
  //   },
  //   body: JSON.stringify({
  //     data: trackingNumbers,
  //   }),
  // });

  console.log('[17Track] 查询运单:', trackingNumbers);

  // 模拟返回数据（用于开发测试）
  const mockData: TrackingInfo[] = trackingNumbers.map(number => ({
    tracking_number: number,
    carrier: identifyCarrier(number) || 'unknown',
    carrier_name: getCarrierInfo(identifyCarrier(number) || 'unknown').name,
    status: 'in_transit',
    status_description: '运输中',
    origin_country: 'CN',
    destination_country: 'US',
    shipped_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    estimated_delivery_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    events: [
      {
        event_id: `evt_${number}_1`,
        event_time: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        location: 'Shenzhen, CN',
        description: 'Shipment has departed from facility',
        status: 'in_transit',
        checkpoint_status: 'InTransit',
      },
      {
        event_id: `evt_${number}_2`,
        event_time: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        location: 'Shenzhen, CN',
        description: 'Shipment picked up',
        status: 'in_transit',
        checkpoint_status: 'InTransit',
      },
    ],
    last_update_time: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  }));

  return {
    success: true,
    data: mockData,
  };
}

// ==================== 数据格式化 ====================

/**
 * 格式化 17Track 响应为内部数据结构
 */
export function formatTrackingResponse(response: any): TrackingInfo {
  const status = CONFIG.statusMapping[response.checkpoint_status] || 'in_transit';

  const events: TrackingEvent[] = (response.checkpoints || []).map((checkpoint: any) => ({
    event_id: checkpoint.id || `evt_${Date.now()}_${Math.random()}`,
    event_time: checkpoint.date || checkpoint.time || '',
    location: checkpoint.location || '',
    description: checkpoint.description || checkpoint.status || '',
    status: CONFIG.statusMapping[checkpoint.checkpoint_status] || status,
    checkpoint_status: checkpoint.checkpoint_status,
  }));

  // 按时间倒序排列
  events.sort((a, b) => new Date(b.event_time).getTime() - new Date(a.event_time).getTime());

  return {
    tracking_number: response.number,
    carrier: response.carrier || identifyCarrier(response.number) || 'unknown',
    carrier_name: getCarrierInfo(response.carrier || identifyCarrier(response.number) || 'unknown').name,
    status: status,
    status_description: getStatusCode(status),
    origin_country: response.origin_country,
    destination_country: response.destination_country,
    shipped_date: response.shipped_date,
    estimated_delivery_date: response.est_delivery_date,
    actual_delivery_date: response.delivered_date,
    events,
    last_update_time: response.last_update_time || response.lastEventTime,
  };
}

/**
 * 获取状态码中文描述
 */
export function getStatusCode(status: string): string {
  const statusDescriptions: Record<string, string> = {
    pending: '待发货',
    in_transit: '运输中',
    customs_clearance: '清关中',
    out_for_delivery: '派送中',
    delivered: '已签收',
    returning: '退回中',
    returned: '已退回',
    lost: '丢失',
    customer_rejected: '客户拒收',
  };

  return statusDescriptions[status] || status;
}

// ==================== 智能刷新调度 ====================

/**
 * 判断运单是否需要刷新
 */
export function shouldRefresh(shipment: {
  status: string;
  last_check_time?: string | null;
}): boolean {
  const { status, last_check_time } = shipment;

  // 终态不需要刷新
  if (['delivered', 'returned', 'lost', 'customer_rejected'].includes(status)) {
    return false;
  }

  // 从未查询过，需要刷新
  if (!last_check_time) {
    return true;
  }

  // 获取刷新间隔
  const intervalHours = CONFIG.refreshInterval[status as keyof typeof CONFIG.refreshInterval] || 24;

  // 不需要刷新的状态
  if (intervalHours === 0) {
    return false;
  }

  // 计算上次查询至今的时间
  const lastCheck = new Date(last_check_time).getTime();
  const now = Date.now();
  const hoursSinceLastCheck = (now - lastCheck) / (1000 * 60 * 60);

  return hoursSinceLastCheck >= intervalHours;
}

/**
 * 计算下次查询时间
 */
export function getNextCheckTime(status: string): string {
  const intervalHours = CONFIG.refreshInterval[status as keyof typeof CONFIG.refreshInterval] || 24;
  
  if (intervalHours === 0) {
    return ''; // 终态不再查询
  }

  const nextCheck = new Date(Date.now() + intervalHours * 60 * 60 * 1000);
  return nextCheck.toISOString();
}

// ==================== 批量处理 ====================

/**
 * 分批处理运单列表（17Track 单次最多 40 个）
 */
export function batchTrackings(trackingNumbers: string[], batchSize: number = CONFIG.api.batchSize): string[][] {
  const batches: string[][] = [];
  for (let i = 0; i < trackingNumbers.length; i += batchSize) {
    batches.push(trackingNumbers.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * 过滤需要刷新的运单
 */
export function filterForRefresh(shipments: Array<{
  tracking_number: string;
  status: string;
  last_check_time?: string | null;
}>): string[] {
  return shipments
    .filter(shipment => shouldRefresh(shipment))
    .map(shipment => shipment.tracking_number);
}
