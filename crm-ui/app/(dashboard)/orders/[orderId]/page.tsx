'use client';

/**
 * 订单详情页
 * 
 * 功能：
 * - 显示订单详细信息
 * - 订单状态管理（选择器 + 弹窗确认）
 * - 状态历史时间线
 * - 客户信息、产品清单、物流信息等
 */

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import OrderStatusSelector from '../../../../components/orders/OrderStatusSelector';
import StatusChangeDialog from '../../../../components/orders/StatusChangeDialog';
import OrderStatusTimeline from '../../../../components/orders/OrderStatusTimeline';
import LogisticsCard from '../../../../components/orders/LogisticsCard';
import LogisticsTimeline from '../../../../components/orders/LogisticsTimeline';
import { OrderStatus, OrderStatusLabels } from '../../../../enums/order-status';

interface Order {
  order_id: string;
  quotation_no?: string;
  okki_company_id?: string;
  customer_name: string;
  customer_email: string;
  customer_company?: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  currency: string;
  delivery_date: string;
  status: OrderStatus;
  product_list: Array<{
    sku?: string;
    name: string;
    quantity: number;
    unit_price: number;
  }>;
  shipping_address?: {
    country?: string;
    state?: string;
    city?: string;
    address_line1?: string;
    address_line2?: string;
    postal_code?: string;
  };
  tracking_number?: string;
  carrier?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

interface LogisticsEvent {
  event_id: string;
  event_time: string;
  location?: string | null;
  description: string;
  status?: string | null;
  checkpoint_status?: string | null;
}

interface LogisticsData {
  id: number;
  order_id: string;
  tracking_number?: string | null;
  carrier?: string | null;
  carrier_name?: string | null;
  status: string;
  shipped_date?: string | null;
  estimated_delivery_date?: string | null;
  actual_delivery_date?: string | null;
  event_count?: number;
  events: LogisticsEvent[];
}

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = params.orderId as string;
  
  // 状态管理
  const [order, setOrder] = useState<Order | null>(null);
  const [logistics, setLogistics] = useState<LogisticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [logisticsLoading, setLogisticsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 状态变更弹窗
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<OrderStatus | null>(null);
  
  // 加载订单详情
  useEffect(() => {
    loadOrder();
    loadLogistics();
  }, [orderId]);
  
  const loadOrder = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/orders/${orderId}`);
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || '加载失败');
      }
      
      setOrder(result.data.order);
    } catch (err: any) {
      setError(err.message || '加载订单失败');
    } finally {
      setLoading(false);
    }
  };
  
  const loadLogistics = async () => {
    setLogisticsLoading(true);
    
    try {
      const response = await fetch(`/api/orders/${orderId}/logistics`);
      const result = await response.json();
      
      if (result.success && result.data.logistics) {
        setLogistics({
          ...result.data.logistics,
          event_count: result.data.logistics.events?.length || 0,
        });
      }
    } catch (err: any) {
      console.error('加载物流信息失败:', err);
      // 不显示错误，物流信息可选
    } finally {
      setLogisticsLoading(false);
    }
  };
  
  const handleRefreshLogistics = async () => {
    await loadLogistics();
  };
  
  // 处理状态选择
  const handleStatusChange = (newStatus: OrderStatus) => {
    if (newStatus === order?.status) return;
    
    setPendingStatus(newStatus);
    setShowStatusDialog(true);
  };
  
  // 确认状态变更
  const handleConfirmStatusChange = async (notes: string, sendNotification: boolean) => {
    if (!pendingStatus) return;
    
    const response = await fetch(`/api/orders/${orderId}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: pendingStatus,
        notes,
        skip_notification: !sendNotification
      })
    });
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.message || '状态更新失败');
    }
    
    // 更新本地状态
    setOrder(prev => prev ? { ...prev, status: pendingStatus } : null);
    setShowStatusDialog(false);
    setPendingStatus(null);
    
    // 重新加载订单（确保数据一致）
    await loadOrder();
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  if (error || !order) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-700">❌ {error || '订单不存在'}</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航栏 */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                订单详情
              </h1>
              <p className="text-sm text-gray-500">{order.order_id}</p>
            </div>
            
            {/* 状态选择器 */}
            <OrderStatusSelector
              currentStatus={order.status}
              onStatusChange={handleStatusChange}
              size="lg"
            />
          </div>
        </div>
      </div>
      
      {/* 主要内容 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* 左侧：订单信息 */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* 客户信息 */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">👤 客户信息</h2>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500">客户名称</dt>
                  <dd className="mt-1 text-sm text-gray-900">{order.customer_name}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">客户邮箱</dt>
                  <dd className="mt-1 text-sm text-gray-900">{order.customer_email}</dd>
                </div>
                {order.customer_company && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">公司名称</dt>
                    <dd className="mt-1 text-sm text-gray-900">{order.customer_company}</dd>
                  </div>
                )}
                {order.okki_company_id && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">OKKI 客户 ID</dt>
                    <dd className="mt-1 text-sm text-gray-900">{order.okki_company_id}</dd>
                  </div>
                )}
              </dl>
            </div>
            
            {/* 订单金额 */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">💰 订单金额</h2>
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500">数量</dt>
                  <dd className="mt-1 text-sm text-gray-900">{order.quantity}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">单价</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {order.currency} {order.unit_price.toFixed(2)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">总金额</dt>
                  <dd className="mt-1 text-lg font-semibold text-gray-900">
                    {order.currency} {order.total_amount.toFixed(2)}
                  </dd>
                </div>
              </dl>
            </div>
            
            {/* 产品清单 */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">📦 产品清单</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">产品名称</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">数量</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">单价</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">小计</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {order.product_list.map((product, index) => (
                      <tr key={index}>
                        <td className="px-4 py-2 text-sm text-gray-900">{product.name}</td>
                        <td className="px-4 py-2 text-sm text-gray-900">{product.quantity}</td>
                        <td className="px-4 py-2 text-sm text-gray-900">
                          {order.currency} {product.unit_price.toFixed(2)}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-900">
                          {order.currency} {(product.quantity * product.unit_price).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* 收货地址 */}
            {order.shipping_address && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">📍 收货地址</h2>
                <address className="not-italic text-sm text-gray-900">
                  {order.shipping_address.address_line1}
                  {order.shipping_address.address_line2 && (
                    <>{order.shipping_address.address_line2}</>
                  )}
                  {order.shipping_address.city && (
                    <>, {order.shipping_address.city}</>
                  )}
                  {order.shipping_address.state && (
                    <>, {order.shipping_address.state}</>
                  )}
                  {order.shipping_address.postal_code && (
                    <> {order.shipping_address.postal_code}</>
                  )}
                  {order.shipping_address.country && (
                    <>, {order.shipping_address.country}</>
                  )}
                </address>
              </div>
            )}
            
            {/* 物流信息 */}
            <div className="bg-white rounded-lg shadow p-6">
              {logisticsLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-4 text-sm text-gray-500">加载物流信息...</p>
                </div>
              ) : logistics ? (
                <div className="space-y-6">
                  <LogisticsCard
                    orderId={orderId}
                    trackingNumber={logistics.tracking_number}
                    carrier={logistics.carrier}
                    carrierName={logistics.carrier_name}
                    status={logistics.status}
                    statusDescription={getStatusCode(logistics.status)}
                    estimatedDeliveryDate={logistics.estimated_delivery_date}
                    actualDeliveryDate={logistics.actual_delivery_date}
                    eventCount={logistics.event_count}
                    onRefresh={handleRefreshLogistics}
                  />
                  
                  {logistics.events && logistics.events.length > 0 && (
                    <div className="border-t pt-6">
                      <LogisticsTimeline events={logistics.events} />
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">🚚 物流信息</h2>
                  <div className="text-center py-8">
                    <p className="text-gray-500 mb-4">暂无物流信息</p>
                    <p className="text-sm text-gray-400">订单发货后将显示物流追踪信息</p>
                  </div>
                </div>
              )}
            </div>
            
            {/* 备注 */}
            {order.notes && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">📝 备注</h2>
                <p className="text-sm text-gray-700">{order.notes}</p>
              </div>
            )}
            
          </div>
          
          {/* 右侧：状态历史 */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-6 sticky top-4">
              <OrderStatusTimeline orderId={orderId} />
            </div>
          </div>
          
        </div>
      </div>
      
      {/* 状态变更确认弹窗 */}
      {showStatusDialog && pendingStatus && (
        <StatusChangeDialog
          orderId={order.order_id}
          currentStatus={order.status}
          newStatus={pendingStatus}
          onConfirm={handleConfirmStatusChange}
          onCancel={() => {
            setShowStatusDialog(false);
            setPendingStatus(null);
          }}
        />
      )}
    </div>
  );
}
