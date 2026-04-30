import { db } from '../../db/connection';

export interface CustomerLTVItem {
  customer_key: string;
  customer_label: string;
  customer_email: string;
  order_count: number;
  total_amount: number;
  first_order_date: string;
  last_order_date: string;
  cooperation_months: number;
  ltv: number;
}

export interface CustomerRFMItem {
  customer_key: string;
  customer_label: string;
  customer_email: string;
  recency_days: number;
  frequency: number;
  monetary: number;
  r_score: number;
  f_score: number;
  m_score: number;
  total_score: number;
}

export interface CustomerSegmentationItem {
  segment: 'high_value' | 'potential' | 'general' | 'lost';
  segment_label: string;
  customer_count: number;
  total_amount: number;
  average_score: number;
}

export interface LTVTrendItem {
  period: string;
  customer_count: number;
  total_amount: number;
  average_ltv: number;
}

interface RawCustomerMetric {
  customer_key: string;
  customer_label: string;
  customer_email: string;
  order_count: number;
  total_amount: number;
  first_order_date: string;
  last_order_date: string;
}

function ensureOrdersTableExists(): void {
  const table = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'orders'`
    )
    .get();

  if (!table) {
    throw new Error('orders table not found. Please run database migrations before requesting analytics.');
  }
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

function getCooperationMonths(firstOrderDate: string, lastOrderDate: string): number {
  const first = new Date(firstOrderDate).getTime();
  const last = new Date(lastOrderDate).getTime();

  if (!Number.isFinite(first) || !Number.isFinite(last)) {
    return 1;
  }

  const diffDays = Math.max(0, (last - first) / (1000 * 60 * 60 * 24));
  return Math.max(1, round(diffDays / 30));
}

function getBaseCustomerMetrics(): RawCustomerMetric[] {
  ensureOrdersTableExists();

  const rows = db
    .prepare(
      `
      SELECT
        COALESCE(NULLIF(customer_company, ''), customer_email) AS customer_key,
        COALESCE(NULLIF(customer_company, ''), customer_name, customer_email) AS customer_label,
        MIN(customer_email) AS customer_email,
        COUNT(*) AS order_count,
        COALESCE(SUM(total_amount), 0) AS total_amount,
        MIN(created_at) AS first_order_date,
        MAX(created_at) AS last_order_date
      FROM orders
      WHERE deleted_at IS NULL
        AND status != 'cancelled'
      GROUP BY COALESCE(NULLIF(customer_company, ''), customer_email)
      HAVING COUNT(*) > 0
      ORDER BY total_amount DESC, order_count DESC
      `
    )
    .all() as any[];

  return rows.map((row) => ({
    customer_key: row.customer_key,
    customer_label: row.customer_label,
    customer_email: row.customer_email,
    order_count: toNumber(row.order_count),
    total_amount: toNumber(row.total_amount),
    first_order_date: row.first_order_date,
    last_order_date: row.last_order_date,
  }));
}

function assignQuintileScores(
  items: RawCustomerMetric[],
  getValue: (item: RawCustomerMetric) => number,
  higherIsBetter: boolean
): Map<string, number> {
  const sorted = [...items].sort((a, b) => {
    const diff = getValue(a) - getValue(b);
    return higherIsBetter ? diff : -diff;
  });

  const scoreMap = new Map<string, number>();
  const total = sorted.length;

  sorted.forEach((item, index) => {
    const percentile = total <= 1 ? 1 : index / total;
    let score = Math.floor(percentile * 5) + 1;
    if (score > 5) score = 5;
    scoreMap.set(item.customer_key, score);
  });

  return scoreMap;
}

function buildRFMItems(): CustomerRFMItem[] {
  const baseMetrics = getBaseCustomerMetrics();
  const now = Date.now();

  const recencyScoreMap = assignQuintileScores(
    baseMetrics,
    (item) => {
      const lastOrder = new Date(item.last_order_date).getTime();
      return Math.max(0, Math.round((now - lastOrder) / (1000 * 60 * 60 * 24)));
    },
    false
  );
  const frequencyScoreMap = assignQuintileScores(baseMetrics, (item) => item.order_count, true);
  const monetaryScoreMap = assignQuintileScores(baseMetrics, (item) => item.total_amount, true);

  return baseMetrics
    .map((item) => {
      const lastOrder = new Date(item.last_order_date).getTime();
      const recencyDays = Math.max(0, Math.round((now - lastOrder) / (1000 * 60 * 60 * 24)));
      const r_score = recencyScoreMap.get(item.customer_key) ?? 1;
      const f_score = frequencyScoreMap.get(item.customer_key) ?? 1;
      const m_score = monetaryScoreMap.get(item.customer_key) ?? 1;

      return {
        customer_key: item.customer_key,
        customer_label: item.customer_label,
        customer_email: item.customer_email,
        recency_days: recencyDays,
        frequency: item.order_count,
        monetary: round(item.total_amount),
        r_score,
        f_score,
        m_score,
        total_score: r_score + f_score + m_score,
      };
    })
    .sort((a, b) => b.total_score - a.total_score || b.monetary - a.monetary);
}

export function getCustomerLTV(limit = 20): CustomerLTVItem[] {
  return getBaseCustomerMetrics()
    .map((item) => {
      const cooperationMonths = getCooperationMonths(item.first_order_date, item.last_order_date);
      return {
        customer_key: item.customer_key,
        customer_label: item.customer_label,
        customer_email: item.customer_email,
        order_count: item.order_count,
        total_amount: round(item.total_amount),
        first_order_date: item.first_order_date,
        last_order_date: item.last_order_date,
        cooperation_months: cooperationMonths,
        ltv: round(item.total_amount / cooperationMonths),
      };
    })
    .sort((a, b) => b.ltv - a.ltv || b.total_amount - a.total_amount)
    .slice(0, limit);
}

export function getCustomerRFM(limit = 50): CustomerRFMItem[] {
  return buildRFMItems().slice(0, limit);
}

export function getCustomerSegmentation(): CustomerSegmentationItem[] {
  const labels: Record<CustomerSegmentationItem['segment'], string> = {
    high_value: '高价值客户',
    potential: '潜力客户',
    general: '一般客户',
    lost: '流失客户',
  };

  const summary = new Map<CustomerSegmentationItem['segment'], CustomerSegmentationItem>();

  for (const item of buildRFMItems()) {
    let segment: CustomerSegmentationItem['segment'] = 'general';

    if (item.r_score === 1) {
      segment = 'lost';
    } else if (item.total_score >= 12) {
      segment = 'high_value';
    } else if (item.total_score >= 9 || item.f_score >= 4 || item.m_score >= 4) {
      segment = 'potential';
    }

    const existing = summary.get(segment) ?? {
      segment,
      segment_label: labels[segment],
      customer_count: 0,
      total_amount: 0,
      average_score: 0,
    };

    existing.customer_count += 1;
    existing.total_amount += item.monetary;
    existing.average_score += item.total_score;
    summary.set(segment, existing);
  }

  return ['high_value', 'potential', 'general', 'lost'].map((segment) => {
    const item = summary.get(segment as CustomerSegmentationItem['segment']) ?? {
      segment,
      segment_label: labels[segment as CustomerSegmentationItem['segment']],
      customer_count: 0,
      total_amount: 0,
      average_score: 0,
    };

    return {
      ...item,
      total_amount: round(item.total_amount),
      average_score: item.customer_count > 0 ? round(item.average_score / item.customer_count) : 0,
    };
  });
}

export function getLTVTrend(limit = 12): LTVTrendItem[] {
  ensureOrdersTableExists();

  const trendRows = db
    .prepare(
      `
      SELECT
        strftime('%Y-%m', MIN(created_at)) AS period,
        COALESCE(NULLIF(customer_company, ''), customer_email) AS customer_key,
        COALESCE(SUM(total_amount), 0) AS total_amount,
        MIN(created_at) AS first_order_date,
        MAX(created_at) AS last_order_date
      FROM orders
      WHERE deleted_at IS NULL
        AND status != 'cancelled'
      GROUP BY COALESCE(NULLIF(customer_company, ''), customer_email)
      HAVING COUNT(*) > 0
      ORDER BY period ASC
      `
    )
    .all() as any[];

  const trendMap = new Map<string, { customer_count: number; total_amount: number; total_ltv: number }>();

  for (const row of trendRows) {
    const period = row.period;
    const totalAmount = toNumber(row.total_amount);
    const cooperationMonths = getCooperationMonths(row.first_order_date, row.last_order_date);
    const ltv = cooperationMonths > 0 ? totalAmount / cooperationMonths : totalAmount;

    const existing = trendMap.get(period) ?? {
      customer_count: 0,
      total_amount: 0,
      total_ltv: 0,
    };

    existing.customer_count += 1;
    existing.total_amount += totalAmount;
    existing.total_ltv += ltv;
    trendMap.set(period, existing);
  }

  return Array.from(trendMap.entries())
    .map(([period, value]) => ({
      period,
      customer_count: value.customer_count,
      total_amount: round(value.total_amount),
      average_ltv: value.customer_count > 0 ? round(value.total_ltv / value.customer_count) : 0,
    }))
    .sort((a, b) => a.period.localeCompare(b.period))
    .slice(-limit);
}
