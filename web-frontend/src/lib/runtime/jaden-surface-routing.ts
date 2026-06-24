import type { JadenCommandMode, JadenCommandSurface } from "./jaden-command";

export type JadenSurfaceRoutingKind =
  | "shared-command-pipeline"
  | "specialized-local-editor"
  | "workflow-driven"
  | "shared-command-plus-workflow";

export interface JadenSurfaceRoutingDecision {
  surface: JadenCommandSurface;
  kind: JadenSurfaceRoutingKind;
  modes: JadenCommandMode[];
  entryPoints: string[];
  notes: string;
}

export const JADEN_SURFACE_ROUTING: JadenSurfaceRoutingDecision[] = [
  {
    surface: "battle-station",
    kind: "shared-command-pipeline",
    modes: ["global_command"],
    entryPoints: ["Battle Station bottom command bar"],
    notes: "Global Jaden command input posts to /api/operator-command with page context and target.",
  },
  {
    surface: "customers",
    kind: "shared-command-pipeline",
    modes: ["page_assist"],
    entryPoints: ["PageCommandPanel on Customer Records"],
    notes: "Uses the shared command envelope with selected customer target.",
  },
  {
    surface: "leads",
    kind: "shared-command-pipeline",
    modes: ["page_assist"],
    entryPoints: ["PageCommandPanel on Customer Follow-up"],
    notes: "Uses the shared command envelope with selected lead/customer context.",
  },
  {
    surface: "documents",
    kind: "shared-command-pipeline",
    modes: ["page_assist"],
    entryPoints: ["PageCommandPanel on Documents"],
    notes: "Uses the shared command envelope for document inspection and gated preparation tasks.",
  },
  {
    surface: "intake",
    kind: "specialized-local-editor",
    modes: ["file_intake"],
    entryPoints: ["Intake upload/chat save flow", "Intake Send for Review"],
    notes: "The upload/chat flow stores local intake records; review submission routes through /api/operator-command with the intake envelope.",
  },
  {
    surface: "quick-quote",
    kind: "specialized-local-editor",
    modes: ["object_edit"],
    entryPoints: ["Quick Quote edit chat"],
    notes: "Edits the local quote draft only; the modify route writes a Jaden task thread and validated plan before applying changes.",
  },
  {
    surface: "inbox",
    kind: "shared-command-plus-workflow",
    modes: ["reply_draft", "review"],
    entryPoints: ["PageCommandPanel on Email Review", "Inbox draft generation", "Inbox send review"],
    notes: "Inbox free-form review commands use the shared envelope; dedicated reply draft and send-review buttons remain gated inbox workflows.",
  },
  {
    surface: "approvals",
    kind: "shared-command-plus-workflow",
    modes: ["review"],
    entryPoints: ["PageCommandPanel on Pending Review", "Pending Review workspace decisions"],
    notes: "Approval review commands use the shared envelope; confirm/reject/retry buttons remain side-effect-gate review workflows.",
  },
  {
    surface: "growth",
    kind: "shared-command-plus-workflow",
    modes: ["review", "page_assist"],
    entryPoints: ["PageCommandPanel on Lead Development", "Growth dry-run, draft, outbound approval, and decision-learning actions"],
    notes: "Growth free-form review commands use the shared envelope; explicit growth buttons remain draft-only/review workflow APIs.",
  },
];

export function getJadenSurfaceRouting(surface: JadenCommandSurface): JadenSurfaceRoutingDecision {
  return JADEN_SURFACE_ROUTING.find((item) => item.surface === surface)
    || {
      surface: "unknown",
      kind: "shared-command-pipeline",
      modes: ["page_assist"],
      entryPoints: [],
      notes: "Unknown surfaces fall back to operator.command only.",
    };
}
