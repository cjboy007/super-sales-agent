import { execSync } from "child_process";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface SystemResources {
  cpu: {
    usage: number;
    cores: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    percent: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    percent: number;
  };
  uptime: number;
  processes: {
    node: number;
    total: number;
  };
  timestamp: number;
}

// ─── Cache ─────────────────────────────────────────────────────────────────

const CACHE_TTL = 10_000; // 10 seconds
let cache: { data: SystemResources | null; expires: number } = {
  data: null,
  expires: 0,
};

function parseSizeKb(str: string): number {
  // Parse strings like "1024M", "512G", "8192K" → megabytes
  const match = str.match(/([\d.]+)([KMG])/);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  const unit = match[2];
  if (unit === "G") return val * 1024;
  if (unit === "M") return val;
  if (unit === "K") return val / 1024;
  return val;
}

function parseSizeMb(str: string): number {
  const match = str.match(/([\d.]+)([KMGTP])/);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  const unit = match[2];
  if (unit === "T") return val * 1024 * 1024;
  if (unit === "G") return val * 1024;
  if (unit === "M") return val;
  if (unit === "K") return val / 1024;
  return val;
}

function getCpuUsage(): number {
  try {
    const output = execSync(
      "top -l 1 -n 0 | grep 'CPU usage' | tail -1",
      { encoding: "utf-8", timeout: 5000 }
    );
    // "CPU usage: 12.3% user, 8.7% sys, 79.0% idle"
    const userMatch = output.match(/([\d.]+)%\s*user/);
    const sysMatch = output.match(/([\d.]+)%\s*sys/);
    const user = userMatch ? parseFloat(userMatch[1]) : 0;
    const sys = sysMatch ? parseFloat(sysMatch[1]) : 0;
    return Math.round((user + sys) * 10) / 10;
  } catch {
    return 0;
  }
}

function getCpuCores(): number {
  try {
    const output = execSync("sysctl -n hw.ncpu", {
      encoding: "utf-8",
      timeout: 2000,
    });
    return parseInt(output.trim(), 10) || 1;
  } catch {
    return 1;
  }
}

function getMemory(): { total: number; used: number; free: number; percent: number } {
  try {
    // Get page size from vm_stat header (macOS can be 4096 or 16384)
    const vmOutput = execSync("vm_stat", { encoding: "utf-8", timeout: 2000 });
    const pageSizeMatch = vmOutput.match(/page size of (\d+) bytes/);
    const pageSize = pageSizeMatch ? parseInt(pageSizeMatch[1], 10) : 4096;

    // Also get total memory from sysctl as authoritative source
    const memSizeOutput = execSync("sysctl -n hw.memsize", {
      encoding: "utf-8",
      timeout: 2000,
    });
    const totalBytes = parseInt(memSizeOutput.trim(), 10) || 0;
    const total = Math.round(totalBytes / 1024 / 1024); // MB

    const getPageCount = (key: string): number => {
      const regex = new RegExp(`${key}[\\s:]+([\\d]+)`);
      const m = vmOutput.match(regex);
      return m ? parseInt(m[1], 10) : 0;
    };

    const freePages = getPageCount("Pages free");
    const inactivePages = getPageCount("Pages inactive");
    const speculativePages = getPageCount("Pages speculative");
    const activePages = getPageCount("Pages active");
    const wiredPages = getPageCount("Pages wired down");

    // Free memory = free + inactive + speculative
    const freePagesTotal = freePages + inactivePages + speculativePages;
    // Used memory = active + wired
    const usedPagesTotal = activePages + wiredPages;

    const used = Math.round((usedPagesTotal * pageSize) / 1024 / 1024);
    const free = Math.round((freePagesTotal * pageSize) / 1024 / 1024);
    const percent = total > 0 ? Math.round((used / total) * 1000) / 10 : 0;

    return { total, used, free, percent };
  } catch {
    return { total: 0, used: 0, free: 0, percent: 0 };
  }
}

function getDisk(): { total: number; used: number; free: number; percent: number } {
  try {
    const output = execSync("df -m /", { encoding: "utf-8", timeout: 2000 });
    // df -m / → header line + data line
    // Filesystem 1M-blocks Used Available Capacity Mounted
    const lines = output.trim().split("\n");
    const dataLine = lines[lines.length - 1];
    const parts = dataLine.trim().split(/\s+/);
    // parts[1]=total(MB), parts[2]=used(MB), parts[3]=free(MB), parts[4]=capacity(%)
    const total = parseInt(parts[1], 10) || 0;
    const used = parseInt(parts[2], 10) || 0;
    const free = parseInt(parts[3], 10) || 0;
    const percentStr = parts[4] || "0%";
    const percent = parseInt(percentStr.replace("%", ""), 10) || 0;

    return { total, used, free, percent };
  } catch {
    return { total: 0, used: 0, free: 0, percent: 0 };
  }
}

function getProcesses(): { node: number; total: number } {
  try {
    const output = execSync("ps aux", { encoding: "utf-8", timeout: 2000 });
    const lines = output.trim().split("\n");
    const total = Math.max(0, lines.length - 1); // exclude header
    const node = lines.filter(
      (line) => line.includes("node ") && !line.includes("grep")
    ).length;
    return { node, total };
  } catch {
    return { node: 0, total: 0 };
  }
}

function getUptime(): number {
  try {
    const output = execSync("sysctl -n kern.boottime", {
      encoding: "utf-8",
      timeout: 2000,
    });
    // { sec = 1714550400, usec = 123456 }
    const match = output.match(/sec\s*=\s*(\d+)/);
    if (match) {
      const bootTime = parseInt(match[1], 10) * 1000;
      return Math.round((Date.now() - bootTime) / 1000);
    }
  } catch {}
  return 0;
}

// ─── Public API ────────────────────────────────────────────────────────────

export function getSystemResources(): SystemResources {
  const now = Date.now();
  if (cache.data && now < cache.expires) {
    return cache.data;
  }

  const resources: SystemResources = {
    cpu: {
      usage: getCpuUsage(),
      cores: getCpuCores(),
    },
    memory: getMemory(),
    disk: getDisk(),
    uptime: getUptime(),
    processes: getProcesses(),
    timestamp: now,
  };

  cache.data = resources;
  cache.expires = now + CACHE_TTL;

  return resources;
}

export function invalidateSystemCache(): void {
  cache.data = null;
  cache.expires = 0;
}
