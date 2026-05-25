"use client";

interface AgentTask {
  task: string;
  status: "processing" | "pending" | "completed";
  progress: number;
  timestamp?: string;
}

interface AgentActivityProps {
  tasks: AgentTask[];
  loading?: boolean;
}

const STATUS_CONFIG = {
  completed: { label: "已完成", color: "text-green-400", bar: "bg-green-500", dot: "bg-green-500" },
  processing: { label: "处理中", color: "text-blue-400", bar: "bg-blue-500", dot: "bg-blue-500 animate-pulse" },
  pending: { label: "等待中", color: "text-gray-500", bar: "bg-gray-600", dot: "bg-gray-500" },
};

export default function AgentActivity({ tasks, loading = false }: AgentActivityProps) {
  return (
    <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)] p-5">
      <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
        <span>🤖</span> Agent 活动
      </h2>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 bg-[var(--sidebar-hover)] rounded animate-pulse w-3/4" />
              <div className="h-1.5 bg-[var(--sidebar-hover)] rounded-full animate-pulse" />
            </div>
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <span className="text-3xl mb-2">😴</span>
          <p className="text-sm text-gray-500">Agent 暂无活动</p>
        </div>
      ) : (
        <div className="space-y-4">
          {tasks.map((task, i) => {
            const cfg = STATUS_CONFIG[task.status];
            return (
              <div key={task.task + i} className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                    <div className="min-w-0">
                      <p className="text-xs text-white leading-relaxed">{task.task}</p>
                      {task.timestamp && (
                        <p className="text-[10px] text-gray-600 mt-0.5">{task.timestamp}</p>
                      )}
                    </div>
                  </div>
                  <span className={`text-[10px] ${cfg.color} flex-shrink-0 mt-0.5`}>{cfg.label}</span>
                </div>
                <div className="h-1 bg-[var(--sidebar-hover)] rounded-full overflow-hidden ml-3.5">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${cfg.bar}`}
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
