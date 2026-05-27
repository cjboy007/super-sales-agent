"use client";

import { useState, useRef } from "react";
import type { ReplyOption } from "@/types/inbox";
import ReplyOptionCard from "./ReplyOptionCard";

interface ReplySwiperProps {
  options: ReplyOption[];
  selectedId: string | null;
  onSelect: (option: ReplyOption) => void;
  loading?: boolean;
}

export default function ReplySwiper({ options, selectedId, onSelect, loading = false }: ReplySwiperProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const startXRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (startXRef.current === null) return;
    const diff = startXRef.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0 && activeIndex < options.length - 1) {
        setActiveIndex((i) => i + 1);
      } else if (diff < 0 && activeIndex > 0) {
        setActiveIndex((i) => i - 1);
      }
    }
    startXRef.current = null;
  };

  return (
    <div className="relative">
      {/* Swipe container */}
      <div
        ref={containerRef}
        className="overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${activeIndex * 100}%)` }}
        >
          {options.map((option) => (
            <div key={option.id} className="w-full flex-shrink-0 px-1">
              <ReplyOptionCard
                option={option}
                selected={selectedId === option.id}
                onSelect={() => {
                  onSelect(option);
                  setActiveIndex(options.indexOf(option));
                }}
                loading={loading && selectedId === option.id}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Dot indicators */}
      <div className="flex justify-center gap-2 mt-4">
        {options.map((option, i) => (
          <button
            key={option.id}
            onClick={() => setActiveIndex(i)}
            className={`transition-all duration-200 rounded-full ${
              i === activeIndex
                ? `w-6 h-2 ${
                    option.style === "steady"
                      ? "bg-blue-500"
                      : option.style === "aggressive"
                      ? "bg-red-500"
                      : "bg-purple-500"
                  }`
                : "w-2 h-2 bg-white/20"
            }`}
          />
        ))}
      </div>

      {/* Swipe hint */}
      <p className="text-center text-xs text-gray-500 mt-2">
        Swipe to browse · Tap to select
      </p>
    </div>
  );
}
