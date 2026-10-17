import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { toast } from 'sonner';
import { ArrowLeft, NotebookPen, Plus, Search } from 'lucide-react';
import { noteService } from '../services/knowledgeService';
import { getErrorMessage } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import { useDebounce } from '../hooks/useDebounce';
import { usePolling } from '../hooks/usePolling';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/Modal';
import { EmptyState, ErrorState, Skeleton, Spinner } from '../components/ui/Feedback';
import { NoteEditor } from '../components/NoteEditor';
import { timeAgo } from '../utils/format';

export default function NotesPage() {
  const { noteId } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const [toDelete, setToDelete] = useState(null);
  const debounced = useDebounce(query);
  const isNew = noteId === 'new';

  const list = useAsync(() => noteService.list({ q: debounced || undefined, tag: tag || undefined, limit: 100 }), [debounced, tag]);
  const tags = useAsync(() => noteService.tags(), []);
  const notes = list.data?.items ?? [];

  const [active, setActive] = useState(null);
  const [activeError, setActiveError] = useState(null);
  useEffect(() => {
    setActiveError(null);
    if (!noteId || isNew) {
      setActive(null);
      return;
    }
    noteService
      .get(noteId)
      .then(setActive)
      .catch((err) => setActiveError(getErrorMessage(err)));
  }, [noteId, isNew]);

  useDocumentTitle(active?.title ?? (isNew ? 'New note' : 'Notes'));

  // Refresh index status while the active note is being embedded.
  usePolling(
    () => noteService.get(active.id).then((n) => {
      setActive(n);
      list.setData((d) => ({ ...d, items: d.items.map((x) => (x.id === n.id ? n : x)) }));
    }),
    2000,
    active && ['queued', 'processing'].includes(active.index_status),
  );

  const onSaved = (saved, created) => {
    setActive(saved);
    list.setData((d) => ({ ...d, items: [saved, ...(d?.items ?? []).filter((n) => n.id !== saved.id)] }));
    tags.reload({ silent: true });
    if (created) navigate(`/notes/${saved.id}`, { replace: true });
  };

  const confirmDelete = async () => {
    try {
      await noteService.remove(toDelete.id);
      list.setData((d) => ({ ...d, items: d.items.filter((n) => n.id !== toDelete.id) }));
      toast.success('Note deleted');
      navigate('/notes', { replace: true });
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setToDelete(null);
    }
  };

  const showEditor = Boolean(noteId);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notes</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Write knowledge directly — notes are embedded and searchable by AI.</p>
        </div>
        <Button icon={Plus} onClick={() => navigate('/notes/new')}>
          New note
        </Button>
      </div>

      <div className="card grid min-h-[70vh] overflow-hidden md:grid-cols-[18rem_1fr]">
        <aside className={clsx('flex flex-col border-zinc-200 md:border-r dark:border-zinc-800', showEditor && 'hidden md:flex')}>
          <div className="space-y-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input className="input py-2 pl-9" placeholder="Search notes…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            {tags.data?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tags.data.slice(0, 12).map((t) => (
                  <button
                    key={t.tag}
                    onClick={() => setTag(tag === t.tag ? '' : t.tag)}
                    className={clsx(
                      'rounded-md px-1.5 py-0.5 text-[11px] font-medium transition',
                      tag === t.tag
                        ? 'bg-brand-600 text-white'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400',
                    )}
                  >
                    #{t.tag} <span className="opacity-60">{t.count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="scrollbar-thin flex-1 overflow-y-auto">
            {list.error ? (
              <ErrorState message={list.error} onRetry={list.reload} />
            ) : list.loading && !list.data ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            ) : notes.length ? (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {notes.map((n) => (
                  <li key={n.id}>
                    <Link
                      to={`/notes/${n.id}`}
                      className={clsx(
                        'block px-4 py-3 transition',
                        n.id === noteId ? 'bg-brand-50/70 dark:bg-brand-500/10' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50',
                      )}
                    >
                      <p className="truncate text-sm font-medium">{n.title}</p>
                      <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">{n.content.replace(/[#*`>-]/g, '').slice(0, 120) || 'Empty note'}</p>
                      <p className="mt-1 text-[11px] text-zinc-400">
                        {timeAgo(n.updated_at)}
                        {n.tags.length > 0 && ` · ${n.tags.map((t) => `#${t}`).join(' ')}`}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={NotebookPen}
                title={query || tag ? 'No matching notes' : 'No notes yet'}
                description={query || tag ? undefined : 'Capture ideas, summaries and snippets.'}
              />
            )}
          </div>
        </aside>

        <section className={clsx(!showEditor && 'hidden md:block')}>
          {showEditor && (
            <Link to="/notes" className="flex items-center gap-1.5 border-b border-zinc-200 px-5 py-2 text-xs text-zinc-500 md:hidden dark:border-zinc-800">
              <ArrowLeft className="h-3.5 w-3.5" /> All notes
            </Link>
          )}
          {activeError ? (
            <ErrorState message={activeError} />
          ) : isNew ? (
            <NoteEditor note={null} onSaved={onSaved} onDelete={setToDelete} />
          ) : noteId && !active ? (
            <Spinner className="h-full min-h-[40vh]" />
          ) : active ? (
            <NoteEditor note={active} onSaved={onSaved} onDelete={setToDelete} />
          ) : (
            <EmptyState
              className="h-full"
              icon={NotebookPen}
              title="Select a note"
              description="Pick a note from the list or create a new one."
              action={<Button onClick={() => navigate('/notes/new')}>New note</Button>}
            />
          )}
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="Delete note?"
        message={`"${toDelete?.title}" will be permanently deleted and removed from your AI knowledge.`}
      />
    </div>
  );
}
