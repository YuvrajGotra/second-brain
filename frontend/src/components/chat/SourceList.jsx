import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { FileIcon } from '../FileIcon';

function SourceChip({ source, onOpen }) {
  return (
    <button
      onClick={() => onOpen(source)}
      className="group flex max-w-full items-center gap-2 rounded-xl border border-zinc-200 bg-white px-2.5 py-1.5 text-left text-xs transition hover:border-brand-300 hover:bg-brand-50/50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/5"
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-[10px] font-semibold text-zinc-600 group-hover:bg-brand-600 group-hover:text-white dark:bg-zinc-800 dark:text-zinc-300">
        {source.index}
      </span>
      <FileIcon type={source.fileType} size="sm" />
      <span className="min-w-0">
        <span className="block truncate font-medium text-zinc-800 dark:text-zinc-200">{source.title}</span>
        {source.location && <span className="block truncate text-zinc-500">{source.location}</span>}
      </span>
    </button>
  );
}

/** Cited sources first; the rest of the retrieved context is tucked behind a toggle. */
export function SourceList({ sources, onOpen }) {
  const [showAll, setShowAll] = useState(false);
  if (!sources?.length) return null;
  const cited = sources.filter((s) => s.cited);
  const others = sources.filter((s) => !s.cited);
  const primary = cited.length ? cited : sources;
  const secondary = cited.length ? others : [];

  return (
    <div className="mt-3">
      <p className="mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Sources</p>
      <div className="flex flex-wrap gap-2">
        {primary.map((s) => (
          <SourceChip key={s.chunkId} source={s} onOpen={onOpen} />
        ))}
        {showAll && secondary.map((s) => <SourceChip key={s.chunkId} source={s} onOpen={onOpen} />)}
      </div>
      {secondary.length > 0 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition ${showAll ? 'rotate-180' : ''}`} />
          {showAll ? 'Hide' : `Show ${secondary.length} more`} retrieved passage{secondary.length === 1 ? '' : 's'}
        </button>
      )}
    </div>
  );
}
