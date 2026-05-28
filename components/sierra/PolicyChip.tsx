'use client';

/**
 * Sierra policy citation chip (TDD § 11.4, § 15.B).
 *
 * Inline clickable element that opens a fixed side sheet displaying the
 * referenced airline-policy rule. The side sheet reuses the
 * `<BookOverlay />` accessibility pattern from
 * `components/library/bookshelf.tsx`:
 *
 *  - role="dialog" + aria-modal
 *  - Escape closes
 *  - Tab is trapped inside the sheet
 *  - Focus restores to the trigger when closed
 *
 * v1 caveat: `policyText` is whatever the parent hands us. We do NOT yet
 * resolve `rule` (e.g. "3.2.1") → the actual paragraph from the airline
 * wiki — that landing pad is v1.1.
 *
 * TODO(v1.1): resolve `rule` against `app/sierra/data/wiki.md` at build time
 * and inject the matched paragraph here instead of trusting the parent.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface PolicyChipProps {
  rule: string;
  policyText: string;
  children: React.ReactNode;
}

export function PolicyChip({ rule, policyText, children }: PolicyChipProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Open policy rule ${rule}`}
        className="rounded border border-border bg-code-bg px-1.5 py-0.5 font-mono text-[11px] text-accent transition-colors duration-150 hover:border-accent hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {children}
      </button>
      {open && (
        <PolicySheet
          rule={rule}
          policyText={policyText}
          onClose={close}
          triggerRef={triggerRef}
        />
      )}
    </>
  );
}

function PolicySheet({
  rule,
  policyText,
  onClose,
  triggerRef,
}: {
  rule: string;
  policyText: string;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    closeRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab' && sheetRef.current) {
        const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }

    const trigger = triggerRef.current;
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      trigger?.focus();
    };
  }, [onClose, triggerRef]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end"
      style={{ backgroundColor: 'var(--book-overlay-bg)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="policy-title"
      ref={sheetRef}
    >
      <div
        className="relative h-full w-full max-w-md overflow-y-auto border-l border-border bg-background p-6 shadow-2xl sm:p-8"
        style={{ animation: 'bookOpen 0.2s ease-out' }}
      >
        <button
          ref={closeRef}
          onClick={onClose}
          className="absolute right-4 top-4 text-xl leading-none text-secondary transition-colors hover:text-foreground"
          aria-label="Close policy"
        >
          &times;
        </button>

        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-tertiary">
              Airline policy
            </p>
            <h2
              id="policy-title"
              className="font-heading text-2xl font-bold tracking-tight text-foreground"
            >
              Rule <span className="text-accent">{rule}</span>
            </h2>
          </div>

          <div className="border-t border-border pt-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-secondary">
              {policyText}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
