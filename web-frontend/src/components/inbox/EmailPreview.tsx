"use client";

import { useState } from "react";
import type { ReplyStyle } from "@/types/inbox";

interface FullEmail {
  subject: string;
  body: string;
  attachments?: string[];
}

interface EmailPreviewProps {
  email: FullEmail;
  toEmail: string;
  toName: string;
  selectedStyle: ReplyStyle;
  onEdit: (body: string) => void;
}

const styleColors = {
  steady: "border-blue-500/40 bg-blue-500/5",
  aggressive: "border-red-500/40 bg-red-500/5",
  creative: "border-purple-500/40 bg-purple-500/5",
};

const styleLabels = {
  steady: { icon: "🛡️", label: "Steady", color: "text-blue-400" },
  aggressive: { icon: "⚔️", label: "Aggressive", color: "text-red-400" },
  creative: { icon: "🎲", label: "Creative", color: "text-purple-400" },
};

export default function EmailPreview({ email, toEmail, toName, selectedStyle, onEdit }: EmailPreviewProps) {
  const [editMode, setEditMode] = useState(false);
  const [editedBody, setEditedBody] = useState(email.body);
  const style = styleLabels[selectedStyle];

  const handleSaveEdit = () => {
    onEdit(editedBody);
    setEditMode(false);
  };

  return (
    <div className={`rounded-xl border-2 ${styleColors[selectedStyle]} overflow-hidden`}>
      {/* Preview header */}
      <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">{style.icon}</span>
          <span className={`text-sm font-semibold ${style.color}`}>{style.label} Reply</span>
          <span className="text-xs text-gray-500">— Preview</span>
        </div>
        <button
          onClick={() => setEditMode((v) => !v)}
          className="text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 rounded bg-white/5 hover:bg-white/10"
        >
          {editMode ? "✕ Cancel" : "✏️ Edit"}
        </button>
      </div>

      {/* Email metadata */}
      <div className="px-4 py-3 border-b border-[var(--border-color)] space-y-1 bg-white/2">
        <div className="flex gap-2 text-xs">
          <span className="text-gray-500 w-12 flex-shrink-0">To:</span>
          <span className="text-gray-200">{toName} &lt;{toEmail}&gt;</span>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="text-gray-500 w-12 flex-shrink-0">Subject:</span>
          <span className="text-gray-200 font-medium">{email.subject}</span>
        </div>
        {email.attachments && email.attachments.length > 0 && (
          <div className="flex gap-2 text-xs">
            <span className="text-gray-500 w-12 flex-shrink-0">Attach:</span>
            <div className="flex flex-wrap gap-1">
              {email.attachments.map((a) => (
                <span key={a} className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-gray-300">
                  📎 {a}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Email body */}
      <div className="px-4 py-4">
        {editMode ? (
          <div className="space-y-3">
            <textarea
              value={editedBody}
              onChange={(e) => setEditedBody(e.target.value)}
              rows={12}
              className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-xs text-gray-200 font-mono focus:outline-none focus:border-[var(--accent)] resize-none leading-relaxed"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setEditedBody(email.body); setEditMode(false); }}
                className="px-3 py-1.5 text-xs bg-white/5 text-gray-400 rounded-lg hover:text-white transition-colors"
              >
                Reset
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-1.5 text-xs bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        ) : (
          <pre className="text-xs text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
            {editedBody}
          </pre>
        )}
      </div>
    </div>
  );
}
