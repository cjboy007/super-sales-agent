"use client";

import { useMemo, useState } from "react";
import FocusMode from "@/components/battle-station/FocusMode";
import { battleStationI18n } from "@/lib/battle-station-data";
import { useTheme } from "@/components/ui/ThemeProvider";

const DEFAULT_FOCUS_DEAL = "amphenol";

const APPROVAL_STATES = {
  waiting: "waiting-human",
  approved: "approved-by-wilson",
  saved: "draft-saved",
  regenerated: "ai-regenerated",
  rejected: "rejected-by-wilson",
} as const;

type ApprovalState = (typeof APPROVAL_STATES)[keyof typeof APPROVAL_STATES];

export default function FocusPage() {
  const { language } = useTheme();
  const station = battleStationI18n[language];
  const focusCase = station.focusCases[DEFAULT_FOCUS_DEAL];
  const copy = station.copy.focus;
  const draftKey = `${language}:${focusCase.dealId}`;

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [subjects, setSubjects] = useState<Record<string, string>>({});
  const [approvalState, setApprovalState] = useState<ApprovalState>(APPROVAL_STATES.waiting);

  const draft = drafts[draftKey] ?? focusCase.draft;
  const subject = subjects[draftKey] ?? focusCase.subject;
  const approvalLabel = useMemo(
    () => station.copy.approvalStates[approvalState] ?? station.copy.approvalStates[APPROVAL_STATES.waiting],
    [approvalState, station.copy.approvalStates]
  );

  return (
    <FocusMode
      focusCase={focusCase}
      copy={copy}
      draft={draft}
      subject={subject}
      approvalState={approvalLabel}
      onDraftChange={(nextDraft) =>
        setDrafts((current) => ({
          ...current,
          [draftKey]: nextDraft,
        }))
      }
      onSubjectChange={(nextSubject) =>
        setSubjects((current) => ({
          ...current,
          [draftKey]: nextSubject,
        }))
      }
      onBack={() => {
        window.location.href = "/";
      }}
      onApprove={() => setApprovalState(APPROVAL_STATES.approved)}
      onSave={() => setApprovalState(APPROVAL_STATES.saved)}
      onRegenerate={() => {
        setDrafts((current) => ({
          ...current,
          [draftKey]: `${draft}\n\n${station.copy.regeneratedNote}`,
        }));
        setApprovalState(APPROVAL_STATES.regenerated);
      }}
      onReject={() => setApprovalState(APPROVAL_STATES.rejected)}
    />
  );
}
