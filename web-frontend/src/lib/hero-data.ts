// Fetches real-time data from Mac Mini via SSH reverse tunnel
// Tunnel: qwensales.com:18900 -> Mac Mini:18900

const DATA_API = process.env.HERO_DATA_API_URL || 'http://127.0.0.1:18900';

async function fetchJson<T>(endpoint: string): Promise<T | null> {
  try {
    const res = await fetch(`${DATA_API}${endpoint}`, {
      cache: 'no-store', // Always fresh
      signal: AbortSignal.timeout(3000), // 3s timeout
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch (e) {
    console.error(`[hero-data] ${endpoint} failed:`, e);
    return null;
  }
}

export interface SentLogEntry {
  email: string;
  company: string;
  subject: string;
  sent_at: string;
}

export interface FollowUpEntry {
  has_reply?: boolean;
  [key: string]: unknown;
}

export interface ReplyEntry {
  company: string;
  email: string;
  time: string;
  [key: string]: unknown;
}

export interface LeadRecord {
  company: string;
  contact_name?: string;
  email: string;
  website?: string;
  country?: string;
  industry?: string;
  tier?: string;
  [key: string]: unknown;
}

export async function getSentLog(): Promise<SentLogEntry[]> {
  return (await fetchJson<SentLogEntry[]>('/sent-log')) || [];
}

export async function getFollowUpState(): Promise<Record<string, FollowUpEntry>> {
  return (await fetchJson<Record<string, FollowUpEntry>>('/follow-up-state')) || {};
}

export async function getReplies(): Promise<ReplyEntry[]> {
  return (await fetchJson<ReplyEntry[]>('/tracking/replies')) || [];
}

export async function getLeads(): Promise<LeadRecord[]> {
  return (await fetchJson<LeadRecord[]>('/leads')) || [];
}

export async function getHeroOverview(): Promise<{
  totalSent: number;
  repliedCount: number;
  replyRate: number;
  totalLeads: number;
  lastSentAt: string | null;
  timestamp: string;
} | null> {
  return fetchJson('/overview');
}

// Quick health check
export async function isDataApiAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${DATA_API}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
