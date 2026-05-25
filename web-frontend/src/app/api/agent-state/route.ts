/**
 * API: GET /api/agent-state
 * Returns active agent tasks and per-agent summaries for Battle Station.
 * Optional query params: ?agent=shadow&limit=20
 *
 * Uses better-sqlite3 directly — no Python subprocess.
 */

import { NextResponse } from "next/server";
import { getAgentState } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const agent = url.searchParams.get("agent") || undefined;
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;

  try {
    const data = getAgentState(agent, limit);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: true, data: { tasks: [], agents: [] } }
    );
  }
}
