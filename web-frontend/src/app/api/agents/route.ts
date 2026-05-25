import { NextResponse } from "next/server";
import { getAgentState } from "@/lib/db";
import { mapRuntimeAgentStateToAgents, type RuntimeAgentTaskRow, type RuntimeAgentSummary } from "@/lib/agent-runtime";
import { getAgents } from "@/lib/agents";
import type { ApiResponse } from "@/lib/api-types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const project = url.searchParams.get("project") || "farreach";

  const runtimeState = getAgentState(undefined, 50);
  const runtimeAgents = Array.isArray(runtimeState.agents) && runtimeState.agents.length > 0
    ? mapRuntimeAgentStateToAgents(
        runtimeState.agents as RuntimeAgentSummary[],
        runtimeState.tasks as RuntimeAgentTaskRow[]
      )
    : [];

  const agents = runtimeAgents.length > 0 ? runtimeAgents : getAgents(project);
  const resp: ApiResponse<typeof agents> = { success: true, data: agents };
  return NextResponse.json(resp);
}
