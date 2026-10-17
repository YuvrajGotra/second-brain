import { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { MessageSquare, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Feedback';
import { timeAgo } from '../../utils/format';

function groupByDate(conversations) {
  const groups = { Today: [], 'Previous 7 days': [], Older: [] };
  const now = Date.now();
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  for (const c of conversations) {
    const t = new Date(c.updated_at).getTime();
    if (t >= startOfToday) groups.Today.push(c);
    else if (now - t < 7 * 86_400_000) groups['Previous 7 days'].push(c);
    else groups.Older.push(c);
  }
  return Object.entries(groups).filter(([, list]) => list.length);
}

export function ConversationList({ conversations, loading, onNew, onDelete, onNavigate }) {
  const [filter, setFilter] = useState('');
  const filtered = useMemo(
    () => (conversations ?? []).filter((c) => c.title.toLowerCase().includes(filter.toLowerCase())),
    [conversations, filter],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 p-3">
        <Button className="w-full justify-center" icon={Plus} onClick={onNew}>
          New conversation
        </Button>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search chats"
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-1.5 pr-2 pl-8 text-xs focus:border-brand-400 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900"
          />
        </div>
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto px-2 pb-3">
        {loading && !conversations ? (
          <div className="space-y-2 p-1">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : filtered.length ? (
          groupByDate(filtered).map(([label, list]) => (
            <div key={label} className="mb-3">
              <p className="px-2 py-1 text-[11px] font-semibold tracking-wide text-zinc-400 uppercase">{label}</p>
              {list.map((c) => (
                <NavLink
                  key={c.id}
                  to={`/chat/${c.id}`}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    clsx(
                      'group flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition',
                      isActive
                        ? 'bg-zinc-200/70 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                        : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/60',
                    )
                  }
                  title={`${c.title} · ${timeAgo(c.updated_at)}`}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" />
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onDelete(c);
                    }}
                    className="shrink-0 rounded p-0.5 text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-red-600 focus:opacity-100"
                    aria-label={`Delete ${c.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </NavLink>
              ))}
            </div>
          ))
        ) : (
          <p className="px-3 py-8 text-center text-xs text-zinc-500">{filter ? 'No matching chats' : 'No conversations yet'}</p>
        )}
      </div>
    </div>
  );
}
