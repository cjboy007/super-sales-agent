"use client";

import { Suspense, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useProject, type BetaAccessSession } from "@/lib/project";

function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/leads";
  if (value.startsWith("/api/")) return "/leads";
  if (value === "/beta-access") return "/leads";
  return value;
}

const buttonFeedbackClass = "transform-gpu border-slate-600 text-slate-100 transition-all duration-150 hover:-translate-y-0.5 hover:border-[#f59e0b] hover:bg-[#f59e0b] hover:text-slate-950 hover:shadow-[0_0_0_3px_rgb(245_158_11_/_0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b] focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-60";
const primaryButtonFeedbackClass = "transform-gpu bg-[#a44912] transition-all duration-150 hover:-translate-y-0.5 hover:bg-[#f59e0b] hover:text-slate-950 hover:brightness-110 hover:shadow-[0_0_0_3px_rgb(245_158_11_/_0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b] focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-60";

function BetaAccessForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { applyBetaAccessSession } = useProject();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const next = useMemo(() => safeNext(searchParams.get("next")), [searchParams]);

  async function sendCode() {
    const normalized = phone.trim();
    if (!normalized) {
      setError("请输入手机号。");
      return;
    }
    setSending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/trial-access/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalized }),
      });
      const json = await response.json().catch(() => ({})) as { error?: string; data?: { expiresInSeconds?: number } };
      if (!response.ok) {
        setError(json.error || "验证码暂时无法发送。");
        return;
      }
      setCodeSent(true);
      setMessage("验证码已发送。");
    } catch {
      setError("验证码暂时无法发送，请稍后重试。");
    } finally {
      setSending(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedPhone = phone.trim();
    const normalizedCode = code.trim();
    if (!normalizedPhone) {
      setError("请输入手机号。");
      return;
    }
    if (!normalizedCode) {
      setError("请输入短信验证码。");
      return;
    }
    setVerifying(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/trial-access/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalizedPhone, code: normalizedCode }),
      });
      if (!response.ok) {
        const json = await response.json().catch(() => ({})) as { error?: string };
        setError(json.error || "验证码无效。");
        return;
      }
      const json = await response.json() as { data?: BetaAccessSession };
      applyBetaAccessSession("", json.data || {});
      router.replace(next);
    } catch {
      setError("暂时无法验证手机号，请稍后重试。");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--battle-bg)] text-[var(--battle-foreground)]">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
        <div className="mb-6 grid h-12 w-12 place-items-center overflow-hidden rounded-lg border border-[var(--battle-border)] bg-slate-100 shadow-sm">
          <Image
            src="/brand/ssa-icon-192.png"
            alt="SSA"
            width={48}
            height={48}
            className="h-full w-full object-contain"
            priority
          />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--battle-muted)]">Super Sales Agent</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-normal text-[var(--battle-foreground)]">内测访问</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--battle-muted)]">
          使用手机号验证后进入 14 天体验。到期后请联系 13680342402 开通本地部署。
        </p>
        <div className="mt-5 rounded-md border border-[var(--battle-border)] bg-[var(--battle-panel)] px-4 py-3 text-xs leading-5 text-[var(--battle-muted)]">
          <p className="font-semibold text-[var(--battle-foreground)]">Start with Customers, Mailbox, or Demo data.</p>
          <p className="mt-1">第一次进入后，可以先看客户页，也可以连接邮箱或创建演示数据熟悉订单和时间线。</p>
          <a
            href="/user-guide"
            className={`mt-3 inline-flex h-8 items-center justify-center rounded-md border px-3 text-xs font-semibold ${buttonFeedbackClass}`}
          >
            User guide / 使用指南
          </a>
        </div>

        <form onSubmit={submit} className="mt-7 space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-[var(--battle-muted)]">手机号</span>
            <input
              type="tel"
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value);
                setError("");
              }}
              className="h-11 w-full rounded-md border border-[var(--battle-border)] bg-[var(--battle-panel)] px-3 text-sm outline-none transition focus:border-[var(--battle-accent)]"
              autoComplete="tel"
              inputMode="tel"
              placeholder="13680342402"
              autoFocus
            />
          </label>

          <button
            type="button"
            disabled={sending}
            onClick={sendCode}
            className={`inline-flex h-10 w-full items-center justify-center rounded-md border px-4 text-sm font-semibold ${buttonFeedbackClass}`}
          >
            {sending ? "正在发送验证码" : codeSent ? "重新发送验证码" : "发送短信验证码"}
          </button>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-[var(--battle-muted)]">短信验证码</span>
            <input
              type="text"
              value={code}
              onChange={(event) => {
                setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                setError("");
              }}
              className="h-11 w-full rounded-md border border-[var(--battle-border)] bg-[var(--battle-panel)] px-3 text-sm outline-none transition focus:border-[var(--battle-accent)]"
              autoComplete="one-time-code"
              inputMode="numeric"
              placeholder="6 位验证码"
            />
          </label>

          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}
          {message && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={verifying}
            className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold text-white ${primaryButtonFeedbackClass}`}
          >
            {verifying ? "正在验证手机号" : "进入 14 天体验"}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function BetaAccessPage() {
  return (
    <Suspense fallback={null}>
      <BetaAccessForm />
    </Suspense>
  );
}
