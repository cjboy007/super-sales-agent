"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useProject } from "@/lib/project";

function shouldSkipFirstRunCheck(pathname: string) {
  return pathname === "/beta-access"
    || pathname === "/jadenos/onboarding"
    || pathname === "/onboarding"
    || pathname === "/settings"
    || pathname === "/user-guide"
    || pathname.startsWith("/docs/");
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { apiFetch, betaToken } = useProject();

  useEffect(() => {
    if (!betaToken || shouldSkipFirstRunCheck(pathname)) return;
    let cancelled = false;
    apiFetch("/api/local-gateway", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((json) => {
        const onboarding = json?.data?.onboarding;
        if (!cancelled && onboarding?.completed === false) {
          router.replace("/jadenos/onboarding");
        }
      })
      .catch(() => {
        // Keep the requested page visible if first-run status cannot be read.
      });
    return () => {
      cancelled = true;
    };
  }, [apiFetch, betaToken, pathname, router]);

  return <div className="min-h-screen bg-slate-950 text-slate-200">{children}</div>;
}
