import { Fragment, useMemo } from 'react';

const STOP = new Set(['the', 'and', 'for', 'with', 'how', 'what', 'does', 'are', 'was', 'that', 'this']);

/** Highlights query terms (≥3 chars) inside a text snippet. */
export function Highlight({ text, query }) {
  const regex = useMemo(() => {
    const terms = (query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((t) => !STOP.has(t));
    if (!terms.length) return null;
    return new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  }, [query]);
  if (!regex) return text;
  return text.split(regex).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded-sm bg-amber-100 text-inherit dark:bg-amber-500/25">
        {part}
      </mark>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}
