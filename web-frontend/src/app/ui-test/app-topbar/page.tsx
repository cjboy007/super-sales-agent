import Link from "next/link";

const navItems = [
  { label: "Cockpit", href: "/" },
  { label: "Leads", href: "/leads" },
  { label: "Inbox", href: "/inbox" },
  { label: "Emails", href: "/emails" },
  { label: "Quotes", href: "/quotations" },
  { label: "Docs", href: "/documents" },
  { label: "Intel", href: "/intelligence" },
  { label: "Settings", href: "/settings" },
];

const leads = [
  ["AMTEK Cable Assemblies", "Germany", "Hot", "92%", "$184K", "RFQ volume spike"],
  ["Orion Controls", "United States", "Warm", "78%", "$96K", "UL wire harness match"],
  ["Nidec Connector Group", "Japan", "Hot", "88%", "$142K", "Competitor quote gap"],
  ["VoltEdge Mobility", "Mexico", "Cold", "51%", "$38K", "Needs validation"],
];

const events = [
  ["09:42:18", "LEADS", "Prioritized 12 high-fit cable buyers from current filter", "emerald"],
  ["09:44:02", "DOCS", "PI fields missing customer address and destination port", "amber"],
  ["09:47:30", "INTEL", "JST quote appears 14% below standing Farreach price", "purple"],
  ["09:51:11", "INBOX", "Customer reply classified as price negotiation", "blue"],
];

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    emerald: "bg-emerald-400/15 text-emerald-200 ring-emerald-300/30",
    amber: "bg-amber-400/15 text-amber-200 ring-amber-300/30",
    red: "bg-red-400/15 text-red-200 ring-red-300/30",
    blue: "bg-sky-400/15 text-sky-200 ring-sky-300/30",
    purple: "bg-violet-400/15 text-violet-200 ring-violet-300/30",
    neutral: "bg-slate-700 text-slate-200 ring-slate-500/40",
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase ring-1 ${tones[tone]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

function Panel({
  title,
  meta,
  children,
  className = "",
}: {
  title: string;
  meta: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-md border border-slate-600/80 bg-slate-800/70 ${className}`}>
      <div className="flex min-h-10 items-center justify-between border-b border-slate-600/80 bg-slate-800 px-3">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-200">{title}</h2>
          <p className="font-mono text-[10px] text-slate-400">{meta}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function AppTopBarApprovalPage() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-900 text-slate-100">
      <header className="shrink-0 border-b border-slate-600 bg-slate-800">
        <div className="grid h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 lg:grid-cols-[minmax(220px,320px)_minmax(0,1fr)_minmax(220px,320px)]">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="grid h-7 w-7 shrink-0 place-items-center rounded bg-emerald-500 font-mono text-[11px] font-black text-slate-950">
              FR
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-slate-100">Leads Radar</h1>
              <p className="truncate font-mono text-[10px] text-slate-400">SSA Battle Station / test chrome</p>
            </div>
          </div>

          <nav className="mx-auto hidden items-center gap-1 lg:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase transition ${
                  item.label === "Leads"
                    ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-100"
                    : "border-slate-600 bg-slate-900/45 text-slate-300 hover:border-slate-500 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex min-w-0 items-center justify-end gap-2">
            <Badge tone="emerald">Live</Badge>
            <span className="hidden font-mono text-[10px] text-slate-300 xl:inline">2026-05-26 14:20:18 CST</span>
            <button className="h-7 rounded-md border border-slate-500 bg-slate-700 px-3 text-xs font-semibold text-slate-100">
              Refresh
            </button>
          </div>
        </div>
        <nav className="flex h-8 items-center gap-1 overflow-x-auto border-t border-slate-700 px-4 lg:hidden">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 rounded border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                item.label === "Leads"
                  ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-100"
                  : "border-slate-600 bg-slate-900/45 text-slate-300"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-3 rounded-md border border-sky-400/40 bg-sky-400/10 px-3 py-2 text-xs text-sky-100">
          Approval sandbox: shared top bar, fixed center nav, brighter slate surfaces, stronger borders, lighter primary text.
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          {[
            ["Total Leads", "128", "emerald"],
            ["Hot", "24", "red"],
            ["Warm", "61", "amber"],
            ["Countries", "18", "blue"],
          ].map(([label, value, tone]) => (
            <div key={label} className="rounded-md border border-slate-600/80 bg-slate-800/75 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-300">{label}</p>
              <p className={`mt-1 font-mono text-lg font-semibold ${tone === "emerald" ? "text-emerald-200" : tone === "red" ? "text-red-200" : tone === "amber" ? "text-amber-200" : "text-sky-200"}`}>
                {value}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_400px]">
          <Panel title="Lead List" meta="shared top bar / brighter row contrast">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-xs">
                <thead className="border-b border-slate-600 bg-slate-900/85 text-[10px] uppercase tracking-wide text-slate-300">
                  <tr>
                    <th className="px-3 py-2">Company</th>
                    <th className="px-3 py-2">Country</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Confidence</th>
                    <th className="px-3 py-2">Value</th>
                    <th className="px-3 py-2">Signal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-600/70">
                  {leads.map((lead) => (
                    <tr key={lead[0]} className="bg-slate-850/40 hover:bg-slate-700/70">
                      <td className="px-3 py-2 font-semibold text-slate-50">{lead[0]}</td>
                      <td className="px-3 py-2 font-mono text-slate-200">{lead[1]}</td>
                      <td className="px-3 py-2">
                        <Badge tone={lead[2] === "Hot" ? "red" : lead[2] === "Warm" ? "amber" : "neutral"}>{lead[2]}</Badge>
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-100">{lead[3]}</td>
                      <td className="px-3 py-2 font-mono text-emerald-200">{lead[4]}</td>
                      <td className="px-3 py-2 text-slate-200">{lead[5]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="space-y-3">
            <Panel title="Ask SSA About This Page" meta="uses current filters and visible records">
              <div className="space-y-3 p-3">
                <div className="rounded-md border border-slate-600 bg-slate-900 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-slate-300">What SSA can see</p>
                  <p className="mt-1 text-[10px] text-slate-300">
                    Lead List / High Priority / 4 visible / 24 hot / no search
                  </p>
                </div>
                <div className="min-h-24 rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-slate-300">
                  Prioritize the hot leads and prepare a first outreach angle for Wilson.
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">Nothing is sent to customers</span>
                  <button className="h-7 rounded-md border border-emerald-400 bg-emerald-500 px-3 text-xs font-semibold text-slate-950">
                    Ask SSA
                  </button>
                </div>
              </div>
            </Panel>

            <Panel title="Live Timeline" meta="stronger timestamp and event contrast">
              <div className="divide-y divide-slate-600/70">
                {events.map((event) => (
                  <div key={event[0]} className="px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] text-slate-300">{event[0]}</span>
                      <Badge tone={event[3]}>{event[1]}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-100">{event[2]}</p>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      </main>
    </div>
  );
}
