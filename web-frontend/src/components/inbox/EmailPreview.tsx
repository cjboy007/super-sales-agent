"use client";

import { useState } from "react";
import { Badge, type Tone } from "@/components/ui/BattleTokens";
import type { ReplyStyle } from "@/types/inbox";

interface FullEmail {
  subject: string;
  body: string;
  attachments?: string[];
}

const styleTone: Record<ReplyStyle, Tone> = {
  steady: "blue",
  aggressive: "red",
  creative: "purple",
};

const styleLabels: Record<ReplyStyle, string> = {
  steady: "Steady",
  aggressive: "Aggressive",
  creative: "Creative",
};

export default function EmailPreview({
  email,
  toEmail,
  toName,
  selectedStyle,
  onEdit,
}: {
  email: FullEmail;
  toEmail: string;
  toName: string;
  selectedStyle: ReplyStyle;
  onEdit: (body: string) => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [editedBody, setEditedBody] = useState(email.body);

  const handleSaveEdit = () => {
    onEdit(editedBody);
    setEditMode(false);
  };

  return (
    <div className="overflow-hidden rounded-md border border-slate-800 bg-slate-900/75">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <div className="flex items-center gap-2">
          <Badge tone={styleTone[selectedStyle]}>{styleLabels[selectedStyle]}</Badge>
          <span className="text-xs text-slate-500">Draft preview</span>
        </div>
        <button onClick={() => setEditMode((value) => !value)} className="font-mono text-[10px] uppercase text-slate-500 hover:text-slate-200">
          {editMode ? "Cancel Edit" : "Edit Draft"}
        </button>
      </div>

      <div className="space-y-1 border-b border-slate-800 bg-slate-950/50 px-3 py-2 font-mono text-[11px]">
        <div className="flex gap-2">
          <span className="w-14 shrink-0 text-slate-600">TO</span>
          <span className="break-all text-slate-300">{toName} &lt;{toEmail}&gt;</span>
        </div>
        <div className="flex gap-2">
          <span className="w-14 shrink-0 text-slate-600">SUBJECT</span>
          <span className="text-slate-300">{email.subject}</span>
        </div>
        {email.attachments && email.attachments.length > 0 && (
          <div className="flex gap-2">
            <span className="w-14 shrink-0 text-slate-600">FILES</span>
            <span className="text-slate-300">{email.attachments.join(", ")}</span>
          </div>
        )}
      </div>

      <div className="p-3">
        {editMode ? (
          <div className="space-y-2">
            <textarea
              value={editedBody}
              onChange={(e) => setEditedBody(e.target.value)}
              rows={14}
              className="w-full resize-none rounded-md border border-slate-700 bg-slate-950/75 px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-300 outline-none focus:border-emerald-500"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setEditedBody(email.body); setEditMode(false); }} className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-slate-100">Reset</button>
              <button onClick={handleSaveEdit} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500">Save Changes</button>
            </div>
          </div>
        ) : (
          <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-300">{editedBody}</pre>
        )}
      </div>
    </div>
  );
}
