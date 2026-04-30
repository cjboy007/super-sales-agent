'use client';

/**
 * 订单筛选工具栏组件
 * 
 * 功能：
 * - 状态下拉框（全部 + 6 状态）
 * - 搜索框（订单号/客户名称）
 * - 排序下拉框（时间/金额 升序/降序）
 */

import { OrderStatus, OrderStatusLabels } from '../../enums/order-status';

interface OrderFilterBarProps {
  status: OrderStatus | 'all';
  onStatusChange: (status: OrderStatus | 'all') => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sort: string;
  onSortChange: (sort: string) => void;
  onRefresh?: () => void;
}

export default function OrderFilterBar({
  status,
  onStatusChange,
  searchQuery,
  onSearchChange,
  sort,
  onSortChange,
  onRefresh
}: OrderFilterBarProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
      <div className="flex flex-col sm:flex-row gap-4">
        
        {/* 搜索框 */}
        <div className="flex-1">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 20 20">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="搜索订单号或客户名称..."
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          </div>
        </div>

        {/* 状态筛选 */}
        <div className="sm:w-48">
          <select
            value={status}
            onChange={(e) => onStatusChange(e.target.value as OrderStatus | 'all')}
            className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          >
            <option value="all">全部状态</option>
            {Object.values(OrderStatus).map((statusValue) => (
              <option key={statusValue} value={statusValue}>
                {OrderStatusLabels[statusValue].zh}
              </option>
            ))}
          </select>
        </div>

        {/* 排序选项 */}
        <div className="sm:w-48">
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value)}
            className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          >
            <option value="created_at_desc">创建时间 ↓</option>
            <option value="created_at_asc">创建时间 ↑</option>
            <option value="total_amount_desc">金额 ↓</option>
            <option value="total_amount_asc">金额 ↑</option>
            <option value="delivery_date_desc">交货日期 ↓</option>
            <option value="delivery_date_asc">交货日期 ↑</option>
          </select>
        </div>

        {/* 刷新按钮 */}
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.28m9.14 10.86A9 9 0 1012 21a8.99 8.99 0 006.36-2.64M21 12a9 9 0 11-9-9 9 9 0 019 9z" />
            </svg>
            刷新
          </button>
        )}
      </div>
    </div>
  );
}
