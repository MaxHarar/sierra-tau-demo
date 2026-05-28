'use client';

/**
 * Sierra tool-call card (TDD § 11.3, § 5.2).
 *
 * Renders one tool invocation across the four visual lifecycle states:
 *
 *   pending   → input is still streaming, args appear character-by-character
 *   executing → input is complete, the local `execute()` is running
 *   complete  → execute returned; we show input + output
 *   error     → execute returned `{ error }` or the stream surfaced an error
 *
 * SECURITY (TDD § 17.2): tool inputs and outputs render exclusively via
 * `JSON.stringify(..., null, 2)` inside a `<pre>`. We MUST NEVER use
 * `dangerouslySetInnerHTML` on agent-produced content.
 */

export type ToolCallState = 'pending' | 'executing' | 'complete' | 'error';

interface ToolCallCardProps {
  name: string;
  state: ToolCallState;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  errorMessage?: string;
}

const BORDER_BY_STATE: Record<ToolCallState, string> = {
  pending: 'border-accent animate-pulse',
  executing: 'border-accent',
  complete: 'border-border',
  error: 'border-red-500',
};

const STATE_LABEL: Record<ToolCallState, string> = {
  pending: 'streaming args…',
  executing: 'executing…',
  complete: 'done',
  error: 'error',
};

export function ToolCallCard({
  name,
  state,
  input,
  output,
  errorMessage,
}: ToolCallCardProps) {
  return (
    <div
      className={`rounded-md border ${BORDER_BY_STATE[state]} bg-code-bg p-3 text-xs transition-colors duration-150`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-foreground">{name}</span>
        <span className="text-[10px] uppercase tracking-wider text-secondary">
          {STATE_LABEL[state]}
        </span>
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] text-secondary hover:text-foreground">
          input
        </summary>
        <pre className="mt-1 overflow-x-auto rounded bg-background p-2 font-mono text-[11px] leading-relaxed text-foreground">
          {JSON.stringify(input ?? {}, null, 2)}
        </pre>
      </details>

      {state === 'complete' && output !== undefined && (
        <details className="mt-2" open>
          <summary className="cursor-pointer text-[11px] text-secondary hover:text-foreground">
            output
          </summary>
          <pre className="mt-1 overflow-x-auto rounded bg-background p-2 font-mono text-[11px] leading-relaxed text-foreground">
            {JSON.stringify(output, null, 2)}
          </pre>
        </details>
      )}

      {state === 'error' && (
        <div className="mt-2 rounded bg-background p-2 font-mono text-[11px] text-red-500">
          {errorMessage ?? 'tool returned an error'}
        </div>
      )}
    </div>
  );
}
