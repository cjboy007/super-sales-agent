"use client";

import type { ReplyOption } from "@/types/inbox";
import ReplyOptionCard from "./ReplyOptionCard";

interface ReplyGridProps {
  options: ReplyOption[];
  selectedId: string | null;
  onSelect: (option: ReplyOption) => void;
  loading?: boolean;
}

export default function ReplyGrid({ options, selectedId, onSelect, loading = false }: ReplyGridProps) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {options.map((option) => (
        <ReplyOptionCard
          key={option.id}
          option={option}
          selected={selectedId === option.id}
          onSelect={() => onSelect(option)}
          loading={loading && selectedId === option.id}
        />
      ))}
    </div>
  );
}
