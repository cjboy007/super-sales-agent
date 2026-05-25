import { NextRequest, NextResponse } from "next/server";
import { getAgentState } from "@/lib/db";
import { mapRuntimeAgentStateToAgent, type RuntimeAgentTaskRow, type RuntimeAgentSummary } from "@/lib/agent-runtime";
import { getAgentById } from "@/lib/agents";
import type { ApiResponse } from "@/lib/api-types";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const project = request.nextUrl.searchParams.get("project") || "farreach";
  const runtimeState = getAgentState(undefined, 50);
  const runtimeAgent = mapRuntimeAgentStateToAgent(
    (runtimeState.agents as RuntimeAgentSummary[]).find((agent) => agent.name === params.id),
    runtimeState.tasks as RuntimeAgentTaskRow[]
  );
  const agent = runtimeAgent || getAgentById(params.id, project);

  if (!agent) {
    return NextResponse.json(
      { success: false, error: `Agent "${params.id}" not found` },
      { status: 404 }
    );
  }

  const resp: ApiResponse<typeof agent> = { success: true, data: agent };
  return NextResponse.json(resp);
}
