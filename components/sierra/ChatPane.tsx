'use client';

/**
 * Sierra chat pane (TDD § 11.2, § 15.B).
 *
 * Renders the message log + composer. Walks each assistant message's `parts`
 * array (AI SDK v6 shape):
 *
 *  - `'text'` parts render as text (with a small regex lift for "rule X.Y"
 *    citations → `<PolicyChip />`)
 *  - `'tool-<name>'` parts render as `<ToolCallCard />` after mapping the
 *    v6 state names → ToolCallCard's 4 visual states.
 *  - All other parts (reasoning, source-*, file, dynamic-tool, data-*,
 *    step-start) are silently skipped in v1 — `<TracePane />` is where the
 *    full sequence is visualised.
 *
 * Accessibility (TDD § 15.B):
 *  - log region is `role="log" aria-live="polite" aria-atomic="false"`
 *  - composer is a real `<form>` so Enter submits and Shift+Enter newlines
 */

import { useRef, useState } from 'react';
import type { UIMessage } from 'ai';
import { PolicyChip } from './PolicyChip';
import { ToolCallCard, type ToolCallState } from './ToolCallCard';

interface ChatPaneProps {
  messages: UIMessage[];
  onSubmit: (text: string) => void;
  status: 'submitted' | 'streaming' | 'ready' | 'error';
}

// Pattern for `rule 3.2.1` / `section 3.2.1` (case-insensitive). We rebuild
// the RegExp per render so we never have to reset `lastIndex` on a shared
// stateful instance.
const RULE_PATTERN = '\\b(?:rule|section)\\s+(\\d+(?:\\.\\d+){0,3})\\b';

function V6StateToCardState(v6: string | undefined): ToolCallState {
  switch (v6) {
    case 'input-streaming':
      return 'pending';
    case 'input-available':
    case 'approval-requested':
    case 'approval-responded':
      return 'executing';
    case 'output-available':
      return 'complete';
    case 'output-error':
      return 'error';
    default:
      return 'pending';
  }
}

function TextWithPolicyChips({ text }: { text: string }) {
  // Walk the text; for every `rule X.Y` match emit a <PolicyChip />, with
  // surrounding prose intact. Falls back to plain text on no-match.
  const ruleRegex = new RegExp(RULE_PATTERN, 'gi');
  const out: React.ReactNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ruleRegex.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (start > lastIndex) out.push(text.slice(lastIndex, start));
    const rule = m[1];
    out.push(
      <PolicyChip
        key={`${start}-${rule}`}
        rule={rule}
        // TODO(v1.1): resolve `rule` → policy paragraph from wiki.md.
        policyText={`Rule ${rule} from the airline policy. (Full text resolution lands in v1.1 — for now the chip is a placeholder that demonstrates the citation pattern.)`}
      >
        {m[0]}
      </PolicyChip>,
    );
    lastIndex = end;
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex));
  if (out.length === 0) return <>{text}</>;
  return <>{out}</>;
}

interface PartLike {
  type?: string;
  text?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  toolCallId?: string;
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user';
  if (isUser) {
    const text = (message.parts ?? [])
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('');
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg bg-accent/10 px-3 py-2 text-sm text-foreground">
          {text}
        </div>
      </div>
    );
  }

  // assistant
  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[95%] space-y-2">
        {(message.parts ?? []).map((rawPart, i) => {
          const part = rawPart as PartLike;
          if (part.type === 'text') {
            return (
              <p
                key={i}
                className="whitespace-pre-wrap text-sm leading-relaxed text-foreground"
              >
                <TextWithPolicyChips text={part.text ?? ''} />
              </p>
            );
          }
          if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
            const name = part.type.slice('tool-'.length);
            const state = V6StateToCardState(part.state);
            return (
              <ToolCallCard
                key={part.toolCallId ?? `${i}-${name}`}
                name={name}
                state={state}
                input={(part.input as Record<string, unknown>) ?? {}}
                output={part.output as Record<string, unknown> | undefined}
                errorMessage={part.errorText}
              />
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

export function ChatPane({ messages, onSubmit, status }: ChatPaneProps) {
  const [value, setValue] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  const canSubmit = status === 'ready' && value.trim().length > 0;
  const isStreaming = status === 'streaming' || status === 'submitted';

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    const text = value.trim();
    setValue('');
    onSubmit(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSubmit) {
        const text = value.trim();
        setValue('');
        onSubmit(text);
      }
    }
  }

  return (
    <div className="flex h-full min-h-[400px] flex-col gap-3">
      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-atomic="false"
        className="flex-1 space-y-3 overflow-y-auto rounded-md border border-border bg-background p-3"
      >
        {messages.length === 0 && (
          <p className="text-xs italic text-tertiary">
            Pick an example above, or type your own request.
          </p>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {isStreaming && (
          <p className="animate-pulse text-[11px] text-secondary">
            streaming…
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          placeholder="Ask the agent…"
          aria-label="Message"
          className="flex-1 resize-none rounded-md border border-border bg-background p-2 font-sans text-sm text-foreground placeholder:text-tertiary focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-md border border-accent bg-accent px-3 py-2 text-xs font-semibold text-background transition-opacity duration-150 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
