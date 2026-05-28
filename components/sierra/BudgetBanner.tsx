'use client';

/**
 * Sierra daily-budget banner (TDD § 14, § 11).
 *
 * Rendered in place of `<ChatPane />` when the API responds 503 — meaning the
 * global daily Anthropic spend cap has been reached. Plain text only; no link,
 * no retry button. The cap auto-resets at UTC midnight via the Redis TTL.
 */

interface BudgetBannerProps {
  message?: string;
}

export function BudgetBanner({ message }: BudgetBannerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-lg border border-accent bg-code-bg p-4"
    >
      <p className="font-heading text-sm font-semibold text-foreground">
        Demo budget reached for today.
      </p>
      <p className="mt-2 text-xs text-secondary">
        {message ??
          'This live demo runs against the real Anthropic API on a fixed daily spend cap. The cap has been hit for today — please try again tomorrow.'}
      </p>
    </div>
  );
}
