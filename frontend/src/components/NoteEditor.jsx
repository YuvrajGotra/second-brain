import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Save, Trash2 } from 'lucide-react';
import { noteService } from '../services/knowledgeService';
import { getErrorMessage } from '../services/api';
import { Button } from './ui/Button';
import { StatusBadge } from './ui/Badge';
import { TagInput } from './TagInput';
import { MarkdownAnswer } from './chat/MarkdownAnswer';
import { formatDateTime } from '../utils/format';

const EMPTY = { title: '', content: '', tags: [], indexEnabled: true };

/** Markdown note editor with live preview. `note` is null for a new note. */
export function NoteEditor({ note, onSaved, onDelete }) {
  const [form, setForm] = useState(EMPTY);
  const [mode, setMode] = useState('write');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(note ? { title: note.title, content: note.content, tags: note.tags, indexEnabled: note.index_enabled } : EMPTY);
    setMode(note?.content ? 'preview' : 'write');
  }, [note]);

  const dirty = note
    ? form.title !== note.title ||
      form.content !== note.content ||
      form.indexEnabled !== note.index_enabled ||
      form.tags.join() !== note.tags.join()
    : Boolean(form.title || form.content);

  const save = async () => {
    if (!form.title.trim()) {
      toast.error('Give your note a title');
      return;
    }
    setSaving(true);
    try {
      const saved = note ? await noteService.update(note.id, form) : await noteService.create(form);
      toast.success(note ? 'Note saved' : 'Note created', {
        description: form.indexEnabled ? 'It will be searchable by AI in a moment.' : undefined,
      });
      onSaved(saved, !note);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // Ctrl/Cmd + S saves.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (dirty && !saving) save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="flex h-full min-h-[70vh] flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
        <div className="inline-flex rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800">
          {['write', 'preview'].map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={clsx(
                'rounded-md px-3 py-1 text-xs font-medium capitalize transition',
                mode === m ? 'bg-white shadow-sm dark:bg-zinc-900' : 'text-zinc-500',
              )}
            >
              {m}
            </button>
          ))}
        </div>
        {note && <StatusBadge status={note.index_status} title={note.index_error ?? undefined} />}
        <div className="ml-auto flex items-center gap-2">
          {note && (
            <Button variant="danger-ghost" size="sm" icon={Trash2} onClick={() => onDelete(note)}>
              Delete
            </Button>
          )}
          <Button size="sm" icon={Save} onClick={save} loading={saving} disabled={!dirty}>
            {note ? 'Save' : 'Create note'}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 flex-col px-5 py-4">
        <input
          value={form.title}
          onChange={(e) => set('title')(e.target.value)}
          placeholder="Untitled note"
          maxLength={200}
          className="w-full bg-transparent text-2xl font-semibold tracking-tight placeholder:text-zinc-300 focus:outline-none dark:placeholder:text-zinc-600"
        />
        <div className="mt-3 border-b border-zinc-100 pb-3 dark:border-zinc-800">
          <TagInput tags={form.tags} onChange={set('tags')} />
        </div>
        {mode === 'write' ? (
          <textarea
            value={form.content}
            onChange={(e) => set('content')(e.target.value)}
            placeholder={'Write in Markdown…\n\n# Heading\n- bullet points\n```js\ncode blocks\n```'}
            className="mt-4 min-h-[40vh] w-full flex-1 resize-none bg-transparent font-mono text-sm leading-relaxed placeholder:text-zinc-400 focus:outline-none"
          />
        ) : (
          <div className="mt-4 flex-1">
            {form.content ? <MarkdownAnswer content={form.content} /> : <p className="text-sm text-zinc-400">Nothing to preview yet.</p>}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 px-5 py-3 text-xs text-zinc-500 dark:border-zinc-800">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={form.indexEnabled}
            onChange={(e) => set('indexEnabled')(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 accent-brand-600"
          />
          Include in AI knowledge (embed for search & chat)
        </label>
        {note && <span>Updated {formatDateTime(note.updated_at)} · {note.chunk_count} chunks</span>}
      </div>
    </div>
  );
}
