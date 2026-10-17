import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Square, X } from 'lucide-react';
import clsx from 'clsx';

const SCOPES = [
  { value: 'all', label: 'All knowledge' },
  { value: 'documents', label: 'Documents only' },
  { value: 'notes', label: 'Notes only' },
];

export function ChatComposer({ onSend, onStop, streaming, scope, onScopeChange, scopedDocument, onClearDocument }) {
  const [value, setValue] = useState('');
  const ref = useRef(null);

  // Auto-grow the textarea up to ~8 lines.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  useEffect(() => {
    if (!streaming) ref.current?.focus();
  }, [streaming]);

  const submit = () => {
    const text = value.trim();
    if (!text || streaming) return;
    onSend(text);
    setValue('');
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="rounded-2xl border border-zinc-300 bg-white shadow-sm transition focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-500/10 dark:border-zinc-700 dark:bg-zinc-900">
        {scopedDocument && (
          <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2 text-xs dark:border-zinc-800">
            <span className="text-zinc-500">Asking about</span>
            <span className="flex items-center gap-1 rounded-md bg-brand-50 px-2 py-0.5 font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
              {scopedDocument.title}
              <button onClick={onClearDocument} aria-label="Remove document scope">
                <X className="h-3 w-3" />
              </button>
            </span>
          </div>
        )}
        <textarea
          ref={ref}
          rows={1}
          value={value}
          maxLength={4000}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask your knowledge base…"
          className="block w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-sm placeholder:text-zinc-400 focus:outline-none"
          aria-label="Message"
        />
        <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5">
          <select
            value={scope}
            onChange={(e) => onScopeChange(e.target.value)}
            disabled={Boolean(scopedDocument)}
            className="rounded-lg border-0 bg-zinc-100 py-1 pr-7 pl-2.5 text-xs font-medium text-zinc-600 focus:ring-2 focus:ring-brand-500/30 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-300"
            aria-label="Search scope"
          >
            {SCOPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          {streaming ? (
            <button
              onClick={onStop}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
              aria-label="Stop generating"
              title="Stop"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!value.trim()}
              className={clsx(
                'flex h-8 w-8 items-center justify-center rounded-lg transition',
                value.trim() ? 'bg-brand-600 text-white hover:bg-brand-700' : 'bg-zinc-200 text-zinc-400 dark:bg-zinc-800',
              )}
              aria-label="Send message"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-zinc-400">
        Answers are generated from your uploaded knowledge. Check citations for important details.
      </p>
    </div>
  );
}
