'use client';

/**
 * 订单列表页面
 * 
 * 功能：
 * - 集成 OrderFilterBar 和 OrderListTable
 * - 分页逻辑
 * - 加载状态和空状态处理
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import OrderFilterBar from '../../../components/orders/OrderFilterBar';
import OrderListTable from '../../../components/orders/OrderListTable';
import { OrderStatus } from '../../../enums/order-status';

interface Order {
  order_id: string;
  customer_name: string;
  customer_email: string;
  customer_company?: string;
  total_amount: number;
  currency: string;
  status: OrderStatus;
  created_at: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export default function OrderListPage() {
  const router = useRouter();
  
  // 筛选状态
  const [status, setStatus] = useState<OrderStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState('created_at_desc');
  
  // 分页状态
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  
  // 数据状态
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // 加载订单列表
  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        sort
      });
      
      if (status !== 'all') {
        params.append('status', status);
      }
      
      const response = await fetch(`/api/orders?${params}`);
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || '加载失败');
      }
      
      setOrders(result.data.orders);
      setPagination(result.data.pagination);
    } catch (err: any) {
      setError(err.message || '加载订单失败');
    } finally {
      setLoading(false);
    }
  }, [page, limit, sort, status]);
  
  useEffect(() => {
    loadOrders();
  }, [loadOrders]);
  
  // 处理刷新
  const handleRefresh = () => {
    loadOrders();
  };
  
  // 处理分页
  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航栏 */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                订单管理
              </h1>
              <p className="text-sm text-gray-500">
                查看和管理所有订单
              </p>
            </div>
            
            <button
              onClick={() => router.push('/orders/create')}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              创建订单
            </button>
          </div>
        </div>
      </div>
      
      {/* 主要内容 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* 筛选工具栏 */}
        <OrderFilterBar
          status={status}
          onStatusChange={setStatus}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          sort={sort}
          onSortChange={setSort}
          onRefresh={handleRefresh}
        />
        
        {/* 错误提示 */}
        {error && (
          <div className="mb-6 rounded-md bg-red-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}
        
        {/* 订单表格 */}
        <div className="bg-white rounded-lg shadow">
          <OrderListTable orders={orders} loading={loading} />
        </div>
        
        {/* 分页控件 */}
        {!loading && pagination && pagination.total_pages > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              显示第 {(pagination.page - 1) * pagination.limit + 1} 到{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} 条，
              共 {pagination.total} 条结果
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                上一页
              </button>
              
              {Array.from({ length: Math.min(5, pagination.total_pages) }, (_, i) => {
                // 智能显示页码：始终显示第一页和最后一页，当前页附近
                let pageNum;
                if (pagination.total_pages <= 5) {
                  pageNum = i + 1;
                } else if (pagination.page <= 3) {
                  pageNum = i + 1;
                } else if (pagination.page >= pagination.total_pages - 2) {
                  pageNum = pagination.total_pages - 4 + i;
                } else {
                  pageNum = pagination.page - 2 + i;
                }
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum)}
                    className={`px-4 py-2 border rounded-md text-sm font-medium ${
                      pagination.page === pageNum
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              
              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page === pagination.total_pages}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
