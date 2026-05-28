'use client';

/**
 * Sierra example-chip row (TDD § 11.6, PRD § 7).
 *
 * Renders the 5 canonical example prompts as accessible pill buttons. Each
 * button posts its `prompt` back through the parent's `onPick` callback.
 * Wrapped in a `<div role="group">` so screen readers announce the chips
 * as a related set per TDD § 15.B.
 */

import type { Chip } from '@/content/sierra/chips';

interface ChipRowProps {
  chips: Chip[];
  onPick: (prompt: string) => void;
  disabled?: boolean;
}

export function ChipRow({ chips, onPick, disabled = false }: ChipRowProps) {
  return (
    <div
      role="group"
      aria-label="Example questions"
      className="flex flex-wrap gap-2"
    >
      {chips.map((chip) => (
        <button
          key={chip.label}
          type="button"
          aria-label={chip.label}
          disabled={disabled}
          onClick={() => onPick(chip.prompt)}
          className="rounded-full border border-border px-3 py-1.5 text-xs text-secondary transition-colors duration-150 hover:text-foreground hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
