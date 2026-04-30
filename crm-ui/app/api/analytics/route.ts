/**
 * 订单分析 API (Next.js App Router)
 *
 * 功能:
 * 1. GET /api/analytics - 获取订单分析数据
 * 2. 支持参数: period / customer_tier / category
 * 3. 返回概览 + 时间趋势 + 客户分层 + 产品类别聚合
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../db/connection';
import { ANALYTICS_CACHE_TTL_MS, getCachedAnalytics, setCachedAnalytics } from '../../../lib/analytics/cache';

type Period = '7d' | '30d' | '90d' | '365d' | 'all';
type CustomerTier = 'all' | 'standard' | 'growth' | 'vip' | 'strategic';
type Category = 'all' | 'hdmi' | 'displayport' | 'usb' | 'lan' | 'audio_video' | 'other';

interface DateRange {
  start: string | null;
  end: string;
}

const VALID_PERIODS: Period[] = ['7d', '30d', '90d', '365d', 'all'];
const VALID_CUSTOMER_TIERS: CustomerTier[] = ['all', 'standard', 'growth', 'vip', 'strategic'];
const VALID_CATEGORIES: Category[] = ['all', 'hdmi', 'displayport', 'usb', 'lan', 'audio_video', 'other'];

const CUSTOMER_TIER_CASE = `
  CASE
    WHEN customer_total_amount >= 100000 THEN 'strategic'
    WHEN customer_total_amount >= 30000 THEN 'vip'
    WHEN customer_total_amount >= 10000 THEN 'growth'
    ELSE 'standard'
  END
`;

const CATEGORY_CASE = `
  CASE
    WHEN lower(COALESCE(json_extract(item.value, '$.category'), '')) LIKE '%hdmi%'
      OR lower(COALESCE(json_extract(item.value, '$.sku'), '')) LIKE 'hdmi%'
      OR lower(COALESCE(json_extract(item.value, '$.name'), '')) LIKE '%hdmi%'
      THEN 'hdmi'
    WHEN lower(COALESCE(json_extract(item.value, '$.category'), '')) LIKE '%displayport%'
      OR lower(COALESCE(json_extract(item.value, '$.category'), '')) LIKE '%dp%'
      OR lower(COALESCE(json_extract(item.value, '$.sku'), '')) LIKE 'dp%'
      OR lower(COALESCE(json_extract(item.value, '$.name'), '')) LIKE '%displayport%'
      OR lower(COALESCE(json_extract(item.value, '$.name'), '')) GLOB 'dp *'
      OR lower(COALESCE(json_extract(item.value, '$.name'), '')) GLOB 'dp-*'
      THEN 'displayport'
    WHEN lower(COALESCE(json_extract(item.value, '$.category'), '')) LIKE '%usb%'
      OR lower(COALESCE(json_extract(item.value, '$.sku'), '')) LIKE 'usb%'
      OR lower(COALESCE(json_extract(item.value, '$.name'), '')) LIKE '%usb%'
      OR lower(COALESCE(json_extract(item.value, '$.name'), '')) LIKE '%type-c%'
      OR lower(COALESCE(json_extract(item.value, '$.name'), '')) LIKE '%type c%'
      THEN 'usb'
    WHEN lower(COALESCE(json_extract(item.value, '$.category'), '')) LIKE '%lan%'
      OR lower(COALESCE(json_extract(item.value, '$.category'), '')) LIKE '%network%'
      OR lower(COALESCE(json_extract(item.value, '$.sku'), '')) LIKE 'lan%'
      OR lower(COALESCE(json_extract(item.value, '$.name'), '')) LIKE '%lan%'
      OR lower(COALESCE(json_extract(item.value, '$.name'), '')) LIKE '%network%'
      OR lower(COALESCE(json_extract(item.value, '$.name'), '')) LIKE '%ethernet%'
      OR lower(COALESCE(json_extract(item.value, '$.name'), '')) LIKE '%cat5%'
      OR lower(COALESCE(json_extract(item.value, '$.name'), '')) LIKE '%cat6%'
      OR lower(COALESCE(json_extract(item.value, '$.name'), '')) LIKE '%cat7%'
      OR lower(COALESCE(json_extract(item.value, '$.name'), '')) LIKE '%cat8%'
      THEN 'lan'
    WHEN lower(COALESCE(json_extract(item.value, '$.category'), '')) LIKE '%audio%'
      OR lower(COALESCE(json_extract(item.value, '$.category'), '')) LIKE '%video%'
      OR lower(COALESCE(json_extract(item.value, '$.name'), '')) LIKE '%audio%'
      OR lower(COALESCE(json_extract(item.value, '$.name'), '')) LIKE '%video%'
      OR lower(COALESCE(json_extract(item.value, '$.name'), '')) LIKE '%av%'
      THEN 'audio_video'
    ELSE 'other'
  END
`;

function normalizePeriod(value: string | null): Period {
  if (!value) return '30d';
  return VALID_PERIODS.includes(value as Period) ? (value as Period) : '30d';
}

function normalizeCustomerTier(value: string | null): CustomerTier {
  if (!value) return 'all';
  const normalized = value.toLowerCase();
  return VALID_CUSTOMER_TIERS.includes(normalized as CustomerTier)
    ? (normalized as CustomerTier)
    : 'all';
}

function normalizeCategory(value: string | null): Category {
  if (!value) return 'all';
  const normalized = value.toLowerCase();
  return VALID_CATEGORIES.includes(normalized as Category)
    ? (normalized as Category)
    : 'all';
}

function getDateRange(period: Period): DateRange {
  const now = new Date();
  const end = now.toISOString();

  if (period === 'all') {
    return { start: null, end };
  }

  const daysMap: Record<Exclude<Period, 'all'>, number> = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
    '365d': 365,
  };

  const start = new Date(now);
  start.setDate(start.getDate() - daysMap[period as Exclude<Period, 'all'>]);

  return {
    start: start.toISOString(),
    end,
  };
}

function getTimeBucket(period: Period): 'day' | 'week' | 'month' {
  if (period === '7d' || period === '30d') return 'day';
  if (period === '90d') return 'week';
  return 'month';
}

function getTimeBucketExpression(bucket: 'day' | 'week' | 'month'): string {
  if (bucket === 'day') return `strftime('%Y-%m-%d', created_at)`;
  if (bucket === 'week') return `strftime('%Y-W%W', created_at)`;
  return `strftime('%Y-%m', created_at)`;
}

function buildOrdersWhereClause(dateRange: DateRange): { whereClause: string; params: any[] } {
  const conditions: string[] = ['deleted_at IS NULL'];
  const params: any[] = [];

  if (dateRange.start) {
    conditions.push('created_at >= ?');
    params.push(dateRange.start);
  }

  conditions.push('created_at <= ?');
  params.push(dateRange.end);

  return {
    whereClause: conditions.join(' AND '),
    params,
  };
}

function buildFilteredOrdersCte(dateRange: DateRange, customerTier: CustomerTier, category: Category) {
  const { whereClause, params } = buildOrdersWhereClause(dateRange);
  const finalParams = [...params];

  let categoryFilter = '';
  if (category !== 'all') {
    categoryFilter = `
      AND EXISTS (
        SELECT 1
        FROM json_each(orders.product_list) AS item
        WHERE ${CATEGORY_CASE} = ?
      )
    `;
    finalParams.push(category);
  }

  let tierFilter = '';
  if (customerTier !== 'all') {
    tierFilter = `WHERE customer_tier = ?`;
    finalParams.push(customerTier);
  }

  const cte = `
    WITH filtered_orders AS (
      SELECT *
      FROM orders
      WHERE ${whereClause}
      ${categoryFilter}
    ),
    customer_totals AS (
      SELECT
        COALESCE(NULLIF(customer_company, ''), customer_email) AS customer_key,
        COALESCE(NULLIF(customer_company, ''), customer_name, customer_email) AS customer_label,
        COUNT(*) AS customer_order_count,
        COALESCE(SUM(total_amount), 0) AS customer_total_amount
      FROM filtered_orders
      GROUP BY COALESCE(NULLIF(customer_company, ''), customer_email)
    ),
    tiered_orders AS (
      SELECT
        fo.*,
        ct.customer_label,
        ct.customer_order_count,
        ct.customer_total_amount,
        ${CUSTOMER_TIER_CASE} AS customer_tier
      FROM filtered_orders fo
      LEFT JOIN customer_totals ct
        ON COALESCE(NULLIF(fo.customer_company, ''), fo.customer_email) = ct.customer_key
    ),
    scoped_orders AS (
      SELECT *
      FROM tiered_orders
      ${tierFilter}
    )
  `;

  return { cte, params: finalParams };
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}

function ensureOrdersTableExists(): void {
  const table = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name = 'orders'
  `).get();

  if (!table) {
    throw new Error('orders table not found. Please run database migrations before requesting analytics.');
  }
}

export async function GET(request: NextRequest) {
  try {
    ensureOrdersTableExists();

    const searchParams = request.nextUrl.searchParams;
    const period = normalizePeriod(searchParams.get('period'));
    const customerTier = normalizeCustomerTier(searchParams.get('customer_tier'));
    const category = normalizeCategory(searchParams.get('category'));

    const cacheKey = `analytics:${period}:${customerTier}:${category}`;
    const cached = getCachedAnalytics(cacheKey);
    if (cached) {
      return NextResponse.json({
        success: true,
        data: cached,
        meta: {
          cache: 'hit',
          cache_ttl_seconds: Math.floor(ANALYTICS_CACHE_TTL_MS / 1000),
        },
      });
    }

    const dateRange = getDateRange(period);
    const timeBucket = getTimeBucket(period);
    const timeBucketExpr = getTimeBucketExpression(timeBucket);
    const scoped = buildFilteredOrdersCte(dateRange, customerTier, category);

    const overviewQuery = `
      ${scoped.cte}
      SELECT
        COUNT(*) AS total_orders,
        COALESCE(SUM(total_amount), 0) AS total_amount,
        COALESCE(AVG(total_amount), 0) AS average_order_value,
        COUNT(DISTINCT customer_email) AS unique_customers,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_orders,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_orders
      FROM scoped_orders
    `;

    const overviewRow: any = db.prepare(overviewQuery).get(...scoped.params) || {};
    const totalOrders = toNumber(overviewRow.total_orders);
    const completedOrders = toNumber(overviewRow.completed_orders);
    const cancelledOrders = toNumber(overviewRow.cancelled_orders);

    const timeSeriesQuery = `
      ${scoped.cte}
      SELECT
        ${timeBucketExpr} AS bucket,
        COUNT(*) AS order_count,
        COALESCE(SUM(total_amount), 0) AS total_amount
      FROM scoped_orders
      GROUP BY bucket
      ORDER BY bucket ASC
    `;

    const timeSeries = db.prepare(timeSeriesQuery).all(...scoped.params).map((row: any) => ({
      bucket: row.bucket,
      order_count: toNumber(row.order_count),
      total_amount: toNumber(row.total_amount),
    }));

    const customerTierQuery = `
      ${scoped.cte}
      SELECT
        customer_tier,
        COUNT(*) AS order_count,
        COALESCE(SUM(total_amount), 0) AS total_amount,
        COUNT(DISTINCT customer_email) AS customer_count
      FROM scoped_orders
      GROUP BY customer_tier
      ORDER BY total_amount DESC, order_count DESC
    `;

    const customerTierDistribution = db.prepare(customerTierQuery).all(...scoped.params).map((row: any) => ({
      customer_tier: row.customer_tier,
      order_count: toNumber(row.order_count),
      total_amount: toNumber(row.total_amount),
      customer_count: toNumber(row.customer_count),
    }));

    const categoryQuery = `
      ${scoped.cte},
      exploded_products AS (
        SELECT
          so.order_id,
          so.customer_tier,
          json_extract(item.value, '$.sku') AS sku,
          json_extract(item.value, '$.name') AS product_name,
          COALESCE(CAST(json_extract(item.value, '$.quantity') AS REAL), 0) AS quantity,
          COALESCE(CAST(json_extract(item.value, '$.unit_price') AS REAL), 0) AS unit_price,
          ${CATEGORY_CASE} AS category
        FROM scoped_orders so
        JOIN json_each(so.product_list) AS item
      )
      SELECT
        category,
        COUNT(DISTINCT order_id) AS order_count,
        COALESCE(SUM(quantity), 0) AS total_quantity,
        COALESCE(SUM(quantity * unit_price), 0) AS total_amount
      FROM exploded_products
      GROUP BY category
      ORDER BY total_amount DESC, total_quantity DESC
    `;

    const categoryDistribution = db.prepare(categoryQuery).all(...scoped.params).map((row: any) => ({
      category: row.category,
      order_count: toNumber(row.order_count),
      total_quantity: toNumber(row.total_quantity),
      total_amount: toNumber(row.total_amount),
    }));

    const payload = {
      filters: {
        period,
        customer_tier: customerTier,
        category,
        start_date: dateRange.start,
        end_date: dateRange.end,
      },
      overview: {
        total_orders: totalOrders,
        total_amount: toNumber(overviewRow.total_amount),
        average_order_value: toNumber(overviewRow.average_order_value),
        unique_customers: toNumber(overviewRow.unique_customers),
        completed_orders: completedOrders,
        cancelled_orders: cancelledOrders,
        completion_rate: totalOrders > 0 ? Number((completedOrders / totalOrders).toFixed(4)) : 0,
      },
      grouped_by_time: {
        bucket: timeBucket,
        series: timeSeries,
      },
      grouped_by_customer_tier: customerTierDistribution,
      grouped_by_category: categoryDistribution,
    };

    setCachedAnalytics(cacheKey, payload);

    return NextResponse.json({
      success: true,
      data: payload,
      meta: {
        cache: 'miss',
        cache_ttl_seconds: Math.floor(ANALYTICS_CACHE_TTL_MS / 1000),
      },
    });
  } catch (error: any) {
    console.error('GET /api/analytics - 查询分析数据失败:', error);

    const status = String(error?.message || '').includes('orders table not found') ? 503 : 500;

    return NextResponse.json(
      {
        success: false,
        error: status === 503 ? 'ANALYTICS_DB_NOT_READY' : 'INTERNAL_ERROR',
        message: error.message,
      },
      { status }
    );
  }
}
