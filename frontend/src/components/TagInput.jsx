import { useState } from 'react';
import { X } from 'lucide-react';

export function TagInput({ tags, onChange, max = 20 }) {
  const [draft, setDraft] = useState('');

  const add = (raw) => {
    const tag = raw.trim().toLowerCase().replace(/^#/, '');
    if (!tag || tags.includes(tag) || tags.length >= max || tag.length > 40) return;
    onChange([...tags, tag]);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
          #{t}
          <button onClick={() => onChange(tags.filter((x) => x !== t))} aria-label={`Remove tag ${t}`}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add(draft);
            setDraft('');
          } else if (e.key === 'Backspace' && !draft && tags.length) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => {
          add(draft);
          setDraft('');
        }}
        placeholder={tags.length ? 'Add tag' : 'Add tags (press Enter)'}
        className="min-w-[8rem] flex-1 bg-transparent py-0.5 text-xs placeholder:text-zinc-400 focus:outline-none"
      />
    </div>
  );
}
