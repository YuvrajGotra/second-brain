import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ArrowUpRight, X } from 'lucide-react';
import { FileIcon } from '../FileIcon';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { FILE_TYPE_LABELS } from '../../utils/constants';

/** Slide-over panel showing the exact passage a citation points to. */
export function SourceDrawer({ source, onClose }) {
  useEffect(() => {
    if (!source) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [source, onClose]);

  if (!source) return null;
  const href = source.documentId
    ? `/knowledge/${source.documentId}?chunk=${source.chunkId}${source.pageNumber ? `&page=${source.pageNumber}` : ''}`
    : `/notes/${source.noteId}`;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-zinc-950/30 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start gap-3 border-b border-zinc-200 p-5 dark:border-zinc-800">
          <FileIcon type={source.fileType} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-zinc-500">Source [{source.index}]</p>
            <h3 className="truncate font-semibold">{source.title}</h3>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge>{FILE_TYPE_LABELS[source.fileType] ?? source.fileType}</Badge>
              {source.location && <Badge tone="brand">{source.location}</Badge>}
              {source.similarity != null && <Badge tone="green">{Math.round(source.similarity * 100)}% match</Badge>}
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto p-5">
          <p className="mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Retrieved passage</p>
          <blockquote className="rounded-xl border-l-4 border-brand-400 bg-zinc-50 p-4 text-sm leading-relaxed whitespace-pre-line text-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-300">
            {source.excerpt}
          </blockquote>
        </div>
        <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
          <Link to={href} onClick={onClose}>
            <Button className="w-full justify-center" icon={ArrowUpRight}>
              Open {source.documentId ? 'document' : 'note'}
              {source.pageNumber ? ` at page ${source.pageNumber}` : ''}
            </Button>
          </Link>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
