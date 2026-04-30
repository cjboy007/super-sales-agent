'use client';

import { useCallback, useEffect, useState } from 'react';
import CustomerLTVTable from '../../../components/analytics/CustomerLTVTable';
import CustomerRFMScatter from '../../../components/analytics/CustomerRFMScatter';
import CustomerSegmentationPie from '../../../components/analytics/CustomerSegmentationPie';
import ExportButton from '../../../components/analytics/ExportButton';
import LTVTrendBarChart from '../../../components/analytics/LTVTrendBarChart';
import type {
  CustomerLTVItem,
  CustomerRFMItem,
  CustomerSegmentationItem,
  LTVTrendItem,
} from '../../../lib/analytics/order-data-service';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

interface AnalyticsCachePayload {
  ltvData: CustomerLTVItem[];
  rfmData: CustomerRFMItem[];
  segmentationData: CustomerSegmentationItem[];
  trendData: LTVTrendItem[];
  updatedAt: string;
}

const CACHE_KEY = 'analytics-dashboard-cache-v1';
const CACHE_TTL_MS = 5 * 60 * 1000;

export default function AnalyticsPage() {
  const [ltvData, setLtvData] = useState<CustomerLTVItem[]>([]);
  const [rfmData, setRfmData] = useState<CustomerRFMItem[]>([]);
  const [segmentationData, setSegmentationData] = useState<CustomerSegmentationItem[]>([]);
  const [trendData, setTrendData] = useState<LTVTrendItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const loadData = useCallback(async (options?: { forceRefresh?: boolean }) => {
    const forceRefresh = options?.forceRefresh ?? false;

    try {
      if (!forceRefresh) {
        const cached = readAnalyticsCache();
        if (cached) {
          applyAnalyticsPayload(cached, {
            setLtvData,
            setRfmData,
            setSegmentationData,
            setTrendData,
            setLastUpdated,
          });
          setError(null);
          setLoading(false);
          return;
        }
      }

      if (forceRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const [ltvRes, rfmRes, segRes, trendRes] = await Promise.all([
        fetch('/api/analytics/customer-ltv?limit=10', { cache: 'no-store' }),
        fetch('/api/analytics/customer-rfm?limit=30', { cache: 'no-store' }),
        fetch('/api/analytics/customer-segmentation', { cache: 'no-store' }),
        fetch('/api/analytics/ltv-trend?limit=12', { cache: 'no-store' }),
      ]);

      const [ltvJson, rfmJson, segJson, trendJson] = (await Promise.all([
        ltvRes.json(),
        rfmRes.json(),
        segRes.json(),
        trendRes.json(),
      ])) as [
        ApiResponse<CustomerLTVItem[]>,
        ApiResponse<CustomerRFMItem[]>,
        ApiResponse<CustomerSegmentationItem[]>,
        ApiResponse<LTVTrendItem[]>
      ];

      if (!ltvJson.success || !rfmJson.success || !segJson.success || !trendJson.success) {
        throw new Error(
          ltvJson.message || rfmJson.message || segJson.message || trendJson.message || '加载分析数据失败'
        );
      }

      const payload: AnalyticsCachePayload = {
        ltvData: ltvJson.data,
        rfmData: rfmJson.data,
        segmentationData: segJson.data,
        trendData: trendJson.data,
        updatedAt: new Date().toISOString(),
      };

      applyAnalyticsPayload(payload, {
        setLtvData,
        setRfmData,
        setSegmentationData,
        setTrendData,
        setLastUpdated,
      });
      writeAnalyticsCache(payload);
    } catch (err: any) {
      setError(err?.message || '加载分析数据失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">客户 LTV 分析</h1>
              <p className="mt-2 text-sm text-gray-500">
                从订单数据计算客户生命周期价值、RFM 评分、客户分层与趋势变化。
              </p>
              <p className="mt-1 text-xs text-gray-400">当前展示最近统计结果，可手动刷新获取最新数据。</p>
              <p className="mt-2 text-xs text-gray-500">
                最后更新时间：{lastUpdated ? formatDateTime(lastUpdated) : '暂无'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => loadData({ forceRefresh: true })}
                disabled={loading || refreshing}
                className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {refreshing ? '刷新中...' : '手动刷新'}
              </button>
              <ExportButton disabled={loading} />
            </div>
          </div>
        </div>

        {loading && (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-gray-500 shadow-sm">
            正在加载客户分析数据...
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="grid gap-6 xl:grid-cols-2">
              <CustomerLTVTable data={ltvData} />
              <CustomerRFMScatter data={rfmData} />
            </div>
            <div className="grid gap-6 xl:grid-cols-2">
              <CustomerSegmentationPie data={segmentationData} />
              <LTVTrendBarChart data={trendData} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function applyAnalyticsPayload(
  payload: AnalyticsCachePayload,
  setters: {
    setLtvData: (value: CustomerLTVItem[]) => void;
    setRfmData: (value: CustomerRFMItem[]) => void;
    setSegmentationData: (value: CustomerSegmentationItem[]) => void;
    setTrendData: (value: LTVTrendItem[]) => void;
    setLastUpdated: (value: string | null) => void;
  }
) {
  setters.setLtvData(payload.ltvData);
  setters.setRfmData(payload.rfmData);
  setters.setSegmentationData(payload.segmentationData);
  setters.setTrendData(payload.trendData);
  setters.setLastUpdated(payload.updatedAt);
}

function readAnalyticsCache(): AnalyticsCachePayload | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as AnalyticsCachePayload;
    if (!parsed.updatedAt) return null;

    const age = Date.now() - new Date(parsed.updatedAt).getTime();
    if (Number.isNaN(age) || age > CACHE_TTL_MS) {
      window.localStorage.removeItem(CACHE_KEY);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writeAnalyticsCache(payload: AnalyticsCachePayload) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore cache write failures
  }
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '暂无';

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}
