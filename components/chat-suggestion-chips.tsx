"use client";

import "./dds-components.css";

// AI 가 suggestActions tool 로 제안한 후속 액션을 클릭 가능한 칩으로 렌더.
// 사용자가 다시 타이핑할 필요 없이 한 번 탭으로 대화 진행.

export type SuggestionAction = {
  label: string;
  query: string;
};

export function ChatSuggestionChips({
  actions,
  onSelect,
  disabled = false,
}: {
  actions: SuggestionAction[];
  onSelect: (query: string) => void;
  disabled?: boolean;
}) {
  if (!actions.length) return null;
  return (
    <div className="chat-suggest" role="group" aria-label="추천 액션">
      {actions.map((a, i) => (
        <button
          key={`${i}-${a.label}`}
          type="button"
          className="chat-suggest-chip"
          onClick={() => onSelect(a.query)}
          disabled={disabled}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
