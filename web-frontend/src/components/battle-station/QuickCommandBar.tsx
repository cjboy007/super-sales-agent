import Link from "next/link";
import { useRef } from "react";
import type { BattleStationCopy, ModuleLink } from "@/lib/battle-station-data";
import { useTheme } from "@/components/ui/ThemeProvider";
import { cx } from "./theme";

interface QuickCommandBarProps {
  copy: BattleStationCopy["quickCommand"];
  moduleLinks: ModuleLink[];
  command: string;
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    text: string;
  }>;
  lastCommand?: string;
  status?: "idle" | "sending" | "answered" | "error";
  taskStatus?: "idle" | "sending" | "queued" | "error";
  receipt?: string;
  tasksAvailable?: boolean;
  onCommandChange: (value: string) => void;
  onSubmit: (value?: string) => void;
  onCreateTask: (value?: string) => void;
  onOpenTasks?: () => void;
}

export default function QuickCommandBar({
  copy,
  moduleLinks,
  command,
  messages,
  lastCommand,
  status = "idle",
  taskStatus = "idle",
  receipt,
  tasksAvailable = false,
  onCommandChange,
  onSubmit,
  onCreateTask,
  onOpenTasks,
}: QuickCommandBarProps) {
  const { language } = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const taskAvailable = tasksAvailable;
  const currentCommand = () => inputRef.current?.value || command;
  const canCreateTask = Boolean(command.trim() || lastCommand);

  return (
    <footer className="shrink-0 border-t border-slate-800 bg-slate-900/95 px-3 py-2">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-2">
        {messages.length > 0 && (
          <div aria-live="polite" className="max-h-36 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2">
            <div className="space-y-2">
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={cx("flex", message.role === "user" ? "justify-end" : "justify-start")}
                >
                  <div className={cx(
                    "max-w-[min(760px,86%)] rounded-md border px-3 py-2 text-xs leading-5",
                    message.role === "assistant"
                      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-50"
                      : "border-blue-500/25 bg-blue-500/10 text-blue-50"
                  )}>
                    <p className="whitespace-pre-wrap break-words">{message.text}</p>
                  </div>
                </article>
              ))}
              {status === "sending" && (
                <article className="flex justify-start">
                  <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-100">
                    {language === "zh" ? "Jaden 正在回复..." : "Jaden is replying..."}
                  </div>
                </article>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-1 lg:flex">
            {moduleLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded border border-slate-800 bg-slate-950/60 px-2 py-1 text-[10px] font-semibold text-slate-400 transition hover:border-slate-700 hover:text-slate-100"
              >
                <span className="font-mono text-slate-600">{item.hotkey}</span> {language === "zh" ? item.zhLabel ?? item.label : item.label}
              </Link>
            ))}
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
            <span className="font-mono text-xs text-emerald-400">SSA</span>
            <input
              ref={inputRef}
              value={command}
              onChange={(event) => onCommandChange(event.target.value)}
              onInput={(event) => onCommandChange(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onSubmit(event.currentTarget.value);
                }
              }}
              placeholder={copy.placeholder}
              disabled={status === "sending"}
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-600"
            />
            <button
              type="button"
              onClick={() => onSubmit(currentCommand())}
              disabled={status === "sending"}
              className={cx(
                "rounded px-3 py-1.5 text-xs font-semibold text-white transition",
                command.trim()
                  ? "bg-emerald-600 hover:bg-emerald-500"
                  : "bg-slate-700 text-slate-400"
              )}
            >
              {status === "sending" ? (language === "zh" ? "回复中" : "Sending") : copy.queue}
            </button>
            <button
              type="button"
              onClick={() => onCreateTask(currentCommand())}
              disabled={taskStatus === "sending"}
              className={cx(
                "hidden rounded border px-3 py-1.5 text-xs font-semibold transition sm:inline-flex",
                canCreateTask
                  ? "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600 hover:text-slate-100"
                  : "border-slate-800 bg-slate-900 text-slate-600"
              )}
            >
              {taskStatus === "sending" ? (language === "zh" ? "创建中" : "Setting up") : (language === "zh" ? "创建任务" : "Create task")}
            </button>
          </div>
          {(receipt || taskAvailable) && (
            <div className="hidden max-w-[360px] items-center gap-2 xl:flex">
              {receipt && (
                <p className={cx(
                  "min-w-0 truncate text-[10px]",
                  taskStatus === "error" ? "text-red-300" : taskStatus === "queued" ? "text-emerald-300" : "text-slate-500"
                )}>
                  {receipt}
                </p>
              )}
              {taskAvailable && (
                <button
                  type="button"
                  onClick={onOpenTasks}
                  className="shrink-0 rounded border border-slate-800 px-2 py-1 text-[10px] font-semibold text-slate-300 transition hover:border-slate-700 hover:text-slate-100"
                >
                  {language === "zh" ? "查看任务" : "View tasks"}
                </button>
              )}
            </div>
          )}
          <div className="flex sm:hidden">
            <button
              type="button"
              onClick={() => onCreateTask(currentCommand())}
              disabled={taskStatus === "sending"}
              className={cx(
                "rounded border bg-slate-900 px-2 py-1.5 text-[10px] font-semibold transition",
                canCreateTask
                  ? "border-slate-700 text-slate-300 hover:border-slate-600 hover:text-slate-100"
                  : "border-slate-800 text-slate-600"
              )}
            >
              {language === "zh" ? "任务" : "Task"}
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
