"use client";

import { type Tone, getToneClasses } from "./BattleTokens";

export function CommandButton({
  variant = "primary",
  size = "sm",
  className = "",
  children,
  ...props
}: {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "xs";
  children: React.ReactNode;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base = "h-7 rounded-md font-semibold transition outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60";
  const sizeClass = size === "xs" ? "px-2 text-[10px]" : "px-3 text-xs";
  const variants = {
    primary: "bg-emerald-600 text-white hover:bg-emerald-500",
    secondary: "bg-slate-700 text-slate-100 hover:bg-slate-600",
    danger: "bg-red-600/70 text-white hover:bg-red-500",
    ghost: "border border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600 hover:text-slate-200",
  };
  return (
    <button className={`${base} ${sizeClass} ${variants[variant]} disabled:opacity-40 ${className}`} {...props}>
      {children}
    </button>
  );
}

export function InputField({
  label,
  mono,
  className = "",
  ...props
}: { label?: string; mono?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      {label && <label className="block text-[10px] uppercase tracking-wide text-slate-600 mb-1">{label}</label>}
      <input
        className={`h-8 w-full rounded-md border border-slate-700 bg-slate-800 px-2 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-emerald-500 ${mono ? "font-mono" : ""} ${className}`}
        {...props}
      />
    </div>
  );
}

export function SelectField({
  label,
  className = "",
  children,
  ...props
}: { label?: string; children: React.ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div>
      {label && <label className="block text-[10px] uppercase tracking-wide text-slate-600 mb-1">{label}</label>}
      <select
        className={`h-8 w-full rounded-md border border-slate-700 bg-slate-800 px-2 text-xs text-slate-200 outline-none focus:border-emerald-500 ${className}`}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

export function TextAreaField({
  label,
  mono,
  className = "",
  ...props
}: { label?: string; mono?: boolean } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div>
      {label && <label className="block text-[10px] uppercase tracking-wide text-slate-600 mb-1">{label}</label>}
      <textarea
        className={`w-full resize-none rounded-md border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-emerald-500 ${mono ? "font-mono" : ""} ${className}`}
        {...props}
      />
    </div>
  );
}
