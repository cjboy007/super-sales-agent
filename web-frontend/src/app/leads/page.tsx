"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PageShell, { PageHeader } from "@/components/ui/PageShell";
import { Badge, PanelSection, type Tone } from "@/components/ui/BattleTokens";
import { CommandButton, InputField, SelectField } from "@/components/ui/CommandControls";
import { useProject } from "@/lib/project";

interface Lead {
  companyName: string;
  country: string;
  industry: string;
  contact: string;
  position: string;
  email: string;
  homepage: string;
  category: string;
  reason: string;
  confidence: string;
  score: "Hot" | "Warm" | "Cold";
}

interface LeadStats {
  total: number;
  hot: number;
  warm: number;
  cold: number;
  countries: Record<string, number>;
}

type ScoreFilter = "All" | "Hot" | "Warm" | "Cold";

const PAGE_SIZE = 20;

function scoreTone(score: string): Tone {
  if (score === "Hot") return "red";
  if (score === "Warm") return "amber";
  if (score === "Cold") return "blue";
  return "neutral";
}

function categoryTone(category: string): Tone {
  if (category === "A") return "emerald";
  if (category === "B") return "blue";
  if (category === "C") return "neutral";
  return "neutral";
}

function NewLeadModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (lead: Partial<Lead>) => void;
}) {
  const [form, setForm] = useState({
    companyName: "",
    country: "",
    industry: "",
    contact: "",
    position: "",
    email: "",
    homepage: "",
    category: "B",
  });

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
    setForm({ companyName: "", country: "", industry: "", contact: "", position: "", email: "", homepage: "", category: "B" });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl overflow-hidden rounded-md border border-slate-800 bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex h-11 items-center justify-between border-b border-slate-800 px-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">New Lead</h2>
          <button onClick={onClose} className="font-mono text-xs text-slate-500 hover:text-slate-200">CLOSE</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InputField label="Company" required value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="Acme Corp" />
            <InputField label="Country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="US" />
            <InputField label="Contact" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="John Doe" />
            <InputField label="Position" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="Purchasing Manager" />
            <InputField label="Email" type="email" mono value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@acme.com" />
            <InputField label="Industry" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="Manufacturing" />
            <InputField label="Website" mono value={form.homepage} onChange={(e) => setForm({ ...form, homepage: e.target.value })} placeholder="https://acme.com" />
            <SelectField label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="A">A high value</option>
              <option value="B">B medium</option>
              <option value="C">C low priority</option>
            </SelectField>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
            <CommandButton type="button" variant="ghost" onClick={onClose}>Cancel</CommandButton>
            <CommandButton type="submit">Add Lead</CommandButton>
          </div>
        </form>
      </div>
    </div>
  );
}

function LeadDetailModal({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  if (!lead) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl overflow-hidden rounded-md border border-slate-800 bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex h-11 items-center justify-between border-b border-slate-800 px-3">
          <div className="min-w-0">
            <h2 className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400">{lead.companyName}</h2>
            <p className="truncate font-mono text-[10px] text-slate-600">{lead.industry} / {lead.country}</p>
          </div>
          <button onClick={onClose} className="font-mono text-xs text-slate-500 hover:text-slate-200">CLOSE</button>
        </div>
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone={scoreTone(lead.score)}>{lead.score}</Badge>
            <Badge tone={categoryTone(lead.category)}>CAT {lead.category || "NA"}</Badge>
            {lead.confidence && <Badge tone="purple">{lead.confidence}</Badge>}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              ["Contact", lead.contact || "NA"],
              ["Position", lead.position || "NA"],
              ["Email", lead.email || "NA"],
              ["Website", lead.homepage || "NA"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-600">{label}</p>
                <p className="mt-1 break-all font-mono text-xs text-slate-200">{value}</p>
              </div>
            ))}
          </div>
          {lead.reason && (
            <div className="rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-600">AI Match Reason</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-300">{lead.reason}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <a href={`mailto:${lead.email}?subject=Inquiry from Super Sales Agent`} className="flex h-7 items-center justify-center rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500">
              Send Email
            </a>
            <a href="/quotations" className="flex h-7 items-center justify-center rounded-md border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-300 hover:text-slate-100">
              Create Quote
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LeadsPage() {
  const { apiUrl, projectId } = useProject();
  const [search, setSearch] = useState("");
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("All");
  const [countryFilter, setCountryFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<LeadStats>({ total: 0, hot: 0, warm: 0, cold: 0, countries: {} });
  const [countries, setCountries] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchRef = useRef(0);

  const fetchAll = useCallback(async () => {
    const fetchId = ++fetchRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        action: "combined",
        page: String(page),
        pageSize: String(PAGE_SIZE),
        search,
        score: scoreFilter === "All" ? "" : scoreFilter,
        country: countryFilter === "All" ? "" : countryFilter,
      });
      const res = await fetch(apiUrl(`/api/leads?${params}`));
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (fetchId === fetchRef.current && json.success) {
        const data = json.data;
        setLeads(data.leads?.data || []);
        setStats({
          total: data.stats?.data?.total || 0,
          hot: data.stats?.data?.hot || 0,
          warm: data.stats?.data?.warm || 0,
          cold: data.stats?.data?.cold || 0,
          countries: data.stats?.data?.countries || {},
        });
        setCountries(data.countries?.data || []);
      }
    } catch (e: unknown) {
      if (fetchId === fetchRef.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (fetchId === fetchRef.current) setLoading(false);
    }
  }, [apiUrl, countryFilter, page, scoreFilter, search]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    setPage(1);
    setSearch("");
    setScoreFilter("All");
    setCountryFilter("All");
  }, [projectId]);

  const totalPages = Math.max(1, Math.ceil(stats.total / PAGE_SIZE));
  const activeFilters = [scoreFilter !== "All", countryFilter !== "All", Boolean(search)].filter(Boolean).length;

  return (
    <PageShell>
      <PageHeader title="Leads Radar" meta={`${projectId} / ${stats.total} loaded / page ${page}`}>
        <CommandButton variant="ghost" size="xs" onClick={fetchAll} disabled={loading}>Refresh</CommandButton>
        <CommandButton size="xs" onClick={() => setNewLeadOpen(true)}>New Lead</CommandButton>
      </PageHeader>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[
            ["Hot", stats.hot, "red" as Tone],
            ["Warm", stats.warm, "amber" as Tone],
            ["Cold", stats.cold, "blue" as Tone],
            ["Total", stats.total, "emerald" as Tone],
          ].map(([label, value, tone]) => (
            <div key={label as string} className="rounded-md border border-slate-800 bg-slate-900/75 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                <Badge tone={tone as Tone}>{tone as string}</Badge>
              </div>
              <p className="mt-1 font-mono text-lg font-semibold text-slate-100">{loading ? "..." : value}</p>
            </div>
          ))}
        </div>

        <PanelSection title="Lead Filters" action={activeFilters ? <Badge tone="amber">{activeFilters} active</Badge> : <Badge tone="neutral">clear</Badge>}>
          <div className="grid grid-cols-1 gap-2 p-3 lg:grid-cols-[minmax(220px,1fr)_340px_220px]">
            <InputField
              mono
              placeholder="Search company, contact, email"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              onKeyDown={(e) => { if (e.key === "Enter") fetchAll(); }}
            />
            <div className="grid grid-cols-4 gap-1">
              {(["All", "Hot", "Warm", "Cold"] as ScoreFilter[]).map((score) => (
                <button
                  key={score}
                  onClick={() => { setScoreFilter(score); setPage(1); }}
                  className={`h-8 rounded-md px-2 font-mono text-[10px] font-semibold uppercase ${scoreFilter === score ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-100"}`}
                >
                  {score}
                </button>
              ))}
            </div>
            <SelectField value={countryFilter} onChange={(e) => { setCountryFilter(e.target.value); setPage(1); }}>
              <option value="All">All countries</option>
              {countries.map((country) => <option key={country} value={country}>{country}</option>)}
            </SelectField>
          </div>
        </PanelSection>

        <PanelSection title="Lead Table" action={<span className="font-mono text-[10px] text-slate-500">{PAGE_SIZE} rows/page</span>}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Company</th>
                  <th className="px-3 py-2 font-semibold">Contact</th>
                  <th className="px-3 py-2 font-semibold">Country</th>
                  <th className="px-3 py-2 font-semibold">Email</th>
                  <th className="px-3 py-2 text-center font-semibold">Category</th>
                  <th className="px-3 py-2 text-center font-semibold">Score</th>
                  <th className="px-3 py-2 font-semibold">AI Reason</th>
                  <th className="px-3 py-2 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {loading ? (
                  <tr><td colSpan={8} className="px-3 py-12 text-center text-slate-500">Loading leads</td></tr>
                ) : error ? (
                  <tr><td colSpan={8} className="px-3 py-12 text-center text-red-400">{error}</td></tr>
                ) : leads.length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-12 text-center text-slate-500">No leads match current filters</td></tr>
                ) : (
                  leads.map((lead, index) => (
                    <tr key={`${lead.companyName}-${index}`} className="cursor-pointer hover:bg-slate-800/30" onClick={() => setSelectedLead(lead)}>
                      <td className="px-3 py-2">
                        <p className="max-w-[220px] truncate font-semibold text-slate-100">{lead.companyName}</p>
                        <p className="max-w-[220px] truncate text-[10px] text-slate-500">{lead.industry || "NA"}</p>
                      </td>
                      <td className="px-3 py-2">
                        <p className="max-w-[160px] truncate text-slate-300">{lead.contact || "NA"}</p>
                        <p className="max-w-[160px] truncate text-[10px] text-slate-500">{lead.position || "NA"}</p>
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-slate-400">{lead.country || "NA"}</td>
                      <td className="max-w-[220px] truncate px-3 py-2 font-mono text-[11px] text-slate-400">{lead.email || "NA"}</td>
                      <td className="px-3 py-2 text-center"><Badge tone={categoryTone(lead.category)}>CAT {lead.category || "NA"}</Badge></td>
                      <td className="px-3 py-2 text-center"><Badge tone={scoreTone(lead.score)}>{lead.score}</Badge></td>
                      <td className="max-w-[260px] truncate px-3 py-2 text-slate-500" title={lead.reason}>{lead.reason || "NA"}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={(e) => { e.stopPropagation(); setSelectedLead(lead); }} className="font-mono text-[10px] font-semibold uppercase text-emerald-400 hover:text-emerald-300">
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && !loading && (
            <div className="flex items-center justify-between border-t border-slate-800 px-3 py-2">
              <span className="font-mono text-[10px] text-slate-500">
                {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, stats.total)} / {stats.total}
              </span>
              <div className="flex gap-1">
                <CommandButton variant="ghost" size="xs" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Prev</CommandButton>
                <span className="flex h-7 items-center rounded-md border border-slate-800 bg-slate-950 px-3 font-mono text-[10px] text-slate-400">{page} / {totalPages}</span>
                <CommandButton variant="ghost" size="xs" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>Next</CommandButton>
              </div>
            </div>
          )}
        </PanelSection>
      </div>

      <NewLeadModal open={newLeadOpen} onClose={() => setNewLeadOpen(false)} onSubmit={() => { setNewLeadOpen(false); fetchAll(); }} />
      <LeadDetailModal lead={selectedLead} onClose={() => setSelectedLead(null)} />
    </PageShell>
  );
}
