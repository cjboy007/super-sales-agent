import { NextRequest, NextResponse } from "next/server";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/beta-auth";
import {
  createSalesRuntime,
  getDefaultHitlPolicyMatrix,
  listHitlActionKinds,
  summarizeHitlReadiness,
  type DecisionLearningAction,
} from "@/lib/runtime";

export const dynamic = "force-dynamic";

const PROSPECTING_STEPS = [
  { id: "discover-leads", label: "Discover leads", mode: "dry-run" },
  { id: "enrich-company", label: "Enrich company/person", mode: "dry-run" },
  { id: "score-icp-fit", label: "Score ICP fit", mode: "dry-run" },
  { id: "generate-opening-angle", label: "Generate opening angle", mode: "draft-only" },
  { id: "draft-personalized-email", label: "Draft personalized email", mode: "draft-only" },
  { id: "draft-landing-page", label: "Draft landing page", mode: "draft-only" },
  { id: "draft-video-script", label: "Draft video script", mode: "draft-only" },
  { id: "request-outbound-approval", label: "Request outbound approval", mode: "review" },
];

const DECISION_ACTIONS: Array<{
  action: DecisionLearningAction;
  label: string;
  effect: string;
}> = [
  {
    action: "approve_once",
    label: "Approve once",
    effect: "Allow this reviewed action one time.",
  },
  {
    action: "edit_then_approve",
    label: "Edit then approve",
    effect: "Operator edits the draft before approving.",
  },
  {
    action: "reject",
    label: "Reject",
    effect: "Stop the proposed action.",
  },
  {
    action: "update_policy",
    label: "Update policy",
    effect: "Capture the decision as a future rule.",
  },
];

export async function GET(request: NextRequest) {
  const auth = requireResolvedWorkspaceAccess(request);
  if (!auth.ok) return auth.response;

  try {
    const runtime = createSalesRuntime();
    const workspaceId = auth.workspaceId;
    const matrix = getDefaultHitlPolicyMatrix(workspaceId);
    const summary = summarizeHitlReadiness(runtime, workspaceId);

    return NextResponse.json({
      success: true,
      data: {
        workspaceId,
        automationMode: summary.automationMode,
        policyMatrix: listHitlActionKinds().map((actionKind) => matrix[actionKind]),
        readiness: summary.readiness,
        reviewQueue: summary.reviewQueue,
        prospectingPreview: {
          mode: "dry-run",
          draftOnly: true,
          steps: PROSPECTING_STEPS,
        },
        decisionLearning: {
          readOnly: true,
          actions: DECISION_ACTIONS,
        },
      },
    });
  } catch {
    return NextResponse.json({
      success: false,
      error: "Growth control center is unavailable.",
    }, { status: 500 });
  }
}
