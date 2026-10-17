import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { toast } from 'sonner';
import { ArrowLeft, ExternalLink, FileWarning, Pencil, RotateCw, Sparkles, Trash2 } from 'lucide-react';
import { documentService } from '../services/knowledgeService';
import { getErrorMessage } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import { usePolling } from '../hooks/usePolling';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/Badge';
import { ConfirmDialog, Modal } from '../components/ui/Modal';
import { EmptyState, ErrorState, Spinner } from '../components/ui/Feedback';
import { FileIcon } from '../components/FileIcon';
import { FILE_TYPE_LABELS } from '../utils/constants';
import { formatBytes, formatDateTime, formatNumber } from '../utils/format';

function chunkLocation(c) {
  const parts = [];
  if (c.page_number) parts.push(c.page_end && c.page_end !== c.page_number ? `Pages ${c.page_number}–${c.page_end}` : `Page ${c.page_number}`);
  if (c.section) parts.push(c.section);
  return parts.join(' · ') || `Chunk ${c.chunk_index + 1}`;
}

export default function DocumentPage() {
  const { documentId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const highlightChunk = params.get('chunk');
  const [page, setPage] = useState(params.get('page'));
  const [renaming, setRenaming] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const chunkRefs = useRef({});

  const { data, error, loading, reload, setData } = useAsync(() => documentService.get(documentId, { limit: 200 }), [documentId]);
  const doc = data?.document;
  useDocumentTitle(doc?.title ?? 'Document');
  usePolling(() => reload({ silent: true }), 2500, doc && (doc.status === 'queued' || doc.status === 'processing'));

  useEffect(() => {
    if (highlightChunk && chunkRefs.current[highlightChunk]) {
      chunkRefs.current[highlightChunk].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightChunk, data]);

  if (loading && !data) return <Spinner className="min-h-[50vh]" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const saveTitle = async () => {
    if (!renaming?.trim()) return;
    setBusy(true);
    try {
      const updated = await documentService.rename(doc.id, renaming.trim());
      setData((d) => ({ ...d, document: updated }));
      setRenaming(null);
      toast.success('Renamed');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await documentService.remove(doc.id);
      toast.success('Document deleted');
      navigate('/knowledge', { replace: true });
    } catch (err) {
      toast.error(getErrorMessage(err));
      setBusy(false);
    }
  };

  const reprocess = async () => {
    try {
      const updated = await documentService.reprocess(doc.id);
      setData((d) => ({ ...d, document: updated }));
      toast.info('Re-processing started');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const fileUrl = documentService.fileUrl(doc.id);
  const previewSrc = doc.file_type === 'pdf' && page ? `${fileUrl}#page=${page}` : fileUrl;

  return (
    <div className="space-y-6">
      <Link to="/knowledge" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
        <ArrowLeft className="h-4 w-4" /> Knowledge
      </Link>

      <div className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <FileIcon type={doc.file_type} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-tight">{doc.title}</h1>
            <StatusBadge status={doc.status} />
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            {FILE_TYPE_LABELS[doc.file_type]} · {formatBytes(doc.size_bytes)}
            {doc.page_count ? ` · ${doc.page_count} pages` : ''} · {formatNumber(doc.chunk_count)} chunks · Uploaded{' '}
            {formatDateTime(doc.created_at)}
          </p>
          {doc.status === 'failed' && doc.error_message && (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
              <FileWarning className="h-4 w-4" /> {doc.error_message}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {doc.status === 'indexed' && (
            <Button variant="secondary" size="sm" icon={Sparkles} onClick={() => navigate('/chat', { state: { documentId: doc.id, documentTitle: doc.title } })}>
              Ask about this
            </Button>
          )}
          <a href={fileUrl} target="_blank" rel="noreferrer">
            <Button variant="secondary" size="sm" icon={ExternalLink}>
              Original
            </Button>
          </a>
          <Button variant="ghost" size="icon" title="Rename" onClick={() => setRenaming(doc.title)}>
            <Pencil className="h-4 w-4" />
          </Button>
          {doc.status === 'failed' && (
            <Button variant="ghost" size="icon" title="Retry" onClick={reprocess}>
              <RotateCw className="h-4 w-4" />
            </Button>
          )}
          <Button variant="danger-ghost" size="icon" title="Delete" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="card overflow-hidden lg:col-span-3">
          <div className="border-b border-zinc-200 px-5 py-3 text-sm font-semibold dark:border-zinc-800">Preview</div>
          <iframe key={previewSrc} src={previewSrc} title={`Preview of ${doc.title}`} className="h-[70vh] w-full bg-white" />
        </section>

        <section className="card flex max-h-[calc(70vh+45px)] flex-col overflow-hidden lg:col-span-2">
          <div className="border-b border-zinc-200 px-5 py-3 text-sm font-semibold dark:border-zinc-800">
            Indexed chunks <span className="font-normal text-zinc-500">({formatNumber(doc.chunk_count)})</span>
          </div>
          {data.chunks.length ? (
            <ol className="scrollbar-thin flex-1 space-y-3 overflow-y-auto p-4">
              {data.chunks.map((c) => (
                <li
                  key={c.id}
                  ref={(el) => (chunkRefs.current[c.id] = el)}
                  onClick={() => c.page_number && setPage(String(c.page_number))}
                  className={clsx(
                    'rounded-xl border p-3 text-sm transition',
                    c.page_number && 'cursor-pointer hover:border-brand-300',
                    c.id === highlightChunk
                      ? 'border-brand-400 bg-brand-50/60 ring-4 ring-brand-500/10 dark:bg-brand-500/10'
                      : 'border-zinc-200 dark:border-zinc-800',
                  )}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-zinc-500">
                    <span className="truncate font-medium">{chunkLocation(c)}</span>
                    <span className="shrink-0">#{c.chunk_index + 1} · ~{c.token_estimate} tok</span>
                  </div>
                  <p className="line-clamp-6 whitespace-pre-line text-zinc-700 dark:text-zinc-300">{c.content}</p>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState
              title={doc.status === 'failed' ? 'No chunks' : 'Indexing in progress'}
              description={doc.status === 'failed' ? 'Processing failed for this document.' : 'Chunks will appear here once processing finishes.'}
            />
          )}
        </section>
      </div>

      <Modal
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Rename document"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button onClick={saveTitle} loading={busy}>
              Save
            </Button>
          </>
        }
      >
        <input
          className="input"
          value={renaming ?? ''}
          maxLength={200}
          onChange={(e) => setRenaming(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && saveTitle()}
        />
      </Modal>
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        loading={busy}
        title="Delete document?"
        message="The file, its chunks and embeddings will be permanently removed."
      />
    </div>
  );
}
