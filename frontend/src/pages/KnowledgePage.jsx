import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Eye, Library, Network, RotateCw, Search, Trash2, UploadCloud } from 'lucide-react';
import { documentService, statsService } from '../services/knowledgeService';
import { getErrorMessage } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import { useDebounce } from '../hooks/useDebounce';
import { usePolling } from '../hooks/usePolling';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/Badge';
import { ConfirmDialog } from '../components/ui/Modal';
import { EmptyState, ErrorState, Skeleton, Spinner } from '../components/ui/Feedback';
import { FileIcon } from '../components/FileIcon';
import { UploadDialog } from '../components/UploadDialog';
import { KnowledgeGraph } from '../components/KnowledgeGraph';
import { FILE_TYPE_LABELS } from '../utils/constants';
import { formatBytes, formatDate, formatNumber } from '../utils/format';

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'indexed', label: 'Indexed' },
  { value: 'processing', label: 'Processing' },
  { value: 'failed', label: 'Failed' },
];

function GraphView() {
  const { data, error, loading, reload } = useAsync(() => statsService.graph(), []);
  if (loading) return <Spinner className="h-[520px]" label="Mapping your knowledge…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data.nodes.length) {
    return <EmptyState icon={Network} title="Nothing to map yet" description="Index some documents or notes to see how they relate." />;
  }
  return (
    <div>
      <KnowledgeGraph data={data} />
      <p className="border-t border-zinc-200 px-5 py-3 text-xs text-zinc-500 dark:border-zinc-800">
        Sources are linked when their average embeddings are semantically similar. Click a node to open it.
      </p>
    </div>
  );
}

export default function KnowledgePage() {
  useDocumentTitle('Knowledge');
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('library');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const debouncedQuery = useDebounce(query);
  const uploadOpen = params.get('upload') === '1';

  const { data, error, loading, reload, setData } = useAsync(
    () => documentService.list({ q: debouncedQuery || undefined, status: status || undefined, limit: 100 }),
    [debouncedQuery, status],
  );
  const docs = data?.items ?? [];
  const busy = docs.some((d) => d.status === 'queued' || d.status === 'processing');
  usePolling(() => reload({ silent: true }), 2500, busy);

  // Notify when background processing finishes.
  const [prevStatuses, setPrevStatuses] = useState({});
  useEffect(() => {
    const next = Object.fromEntries(docs.map((d) => [d.id, d.status]));
    for (const d of docs) {
      const before = prevStatuses[d.id];
      if (before && before !== d.status && (before === 'processing' || before === 'queued')) {
        if (d.status === 'indexed') toast.success(`"${d.title}" is ready`, { description: `${d.chunk_count} chunks indexed` });
        if (d.status === 'failed') toast.error(`"${d.title}" failed`, { description: d.error_message });
      }
    }
    setPrevStatuses(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const setUploadOpen = (open) => {
    const next = new URLSearchParams(params);
    if (open) next.set('upload', '1');
    else next.delete('upload');
    setParams(next, { replace: true });
  };

  const onUploaded = useCallback(
    (newDocs) => setData((d) => ({ ...d, items: [...newDocs, ...(d?.items ?? [])] })),
    [setData],
  );

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await documentService.remove(toDelete.id);
      setData((d) => ({ ...d, items: d.items.filter((x) => x.id !== toDelete.id) }));
      toast.success('Document deleted', { description: 'Its chunks and embeddings were removed.' });
      setToDelete(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  const reprocess = async (doc) => {
    try {
      const updated = await documentService.reprocess(doc.id);
      setData((d) => ({ ...d, items: d.items.map((x) => (x.id === doc.id ? updated : x)) }));
      toast.info('Re-processing started');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        title="Knowledge"
        description="Everything your Second Brain knows. Uploaded files are chunked, embedded and indexed automatically."
        actions={
          <Button icon={UploadCloud} onClick={() => setUploadOpen(true)}>
            Upload documents
          </Button>
        }
      />

      <div className="mb-4 inline-flex rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800/70">
        {[
          { id: 'library', label: 'Library', icon: Library },
          { id: 'graph', label: 'Knowledge graph', icon: Network },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx(
              'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition',
              tab === id ? 'bg-white shadow-sm dark:bg-zinc-900' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {tab === 'graph' ? (
          <GraphView />
        ) : (
          <>
            <div className="flex flex-col gap-3 border-b border-zinc-200 p-4 sm:flex-row sm:items-center dark:border-zinc-800">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input className="input pl-9" placeholder="Filter by name…" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <div className="flex gap-1 overflow-x-auto">
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setStatus(f.value)}
                    className={clsx(
                      'rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition',
                      status === f.value
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                        : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800',
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {error ? (
              <ErrorState message={error} onRetry={reload} />
            ) : loading && !data ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : !docs.length ? (
              <EmptyState
                icon={UploadCloud}
                title={query || status ? 'No matching documents' : 'Your library is empty'}
                description={query || status ? 'Try a different filter.' : 'Upload PDFs, Markdown notes, text files or lecture transcripts.'}
                action={!query && !status && <Button onClick={() => setUploadOpen(true)}>Upload your first document</Button>}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 text-left text-xs font-medium tracking-wide text-zinc-500 uppercase dark:bg-zinc-900/50">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="hidden px-4 py-3 md:table-cell">Type</th>
                      <th className="hidden px-4 py-3 md:table-cell">Uploaded</th>
                      <th className="hidden px-4 py-3 text-right sm:table-cell">Chunks</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {docs.map((doc) => (
                      <tr key={doc.id} className="group hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40">
                        <td className="px-4 py-3">
                          <Link to={`/knowledge/${doc.id}`} className="flex items-center gap-3">
                            <FileIcon type={doc.file_type} />
                            <div className="min-w-0">
                              <p className="max-w-[16rem] truncate font-medium group-hover:text-brand-600 sm:max-w-xs dark:group-hover:text-brand-400">
                                {doc.title}
                              </p>
                              <p className="text-xs text-zinc-500">
                                {formatBytes(doc.size_bytes)}
                                {doc.page_count ? ` · ${doc.page_count} pages` : ''}
                              </p>
                            </div>
                          </Link>
                        </td>
                        <td className="hidden px-4 py-3 text-zinc-600 md:table-cell dark:text-zinc-400">{FILE_TYPE_LABELS[doc.file_type]}</td>
                        <td className="hidden px-4 py-3 text-zinc-600 md:table-cell dark:text-zinc-400">{formatDate(doc.created_at)}</td>
                        <td className="hidden px-4 py-3 text-right tabular-nums sm:table-cell">{formatNumber(doc.chunk_count)}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={doc.status} title={doc.error_message ?? undefined} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            {doc.status === 'failed' && (
                              <Button variant="ghost" size="icon-sm" title="Retry processing" onClick={() => reprocess(doc)}>
                                <RotateCw className="h-4 w-4" />
                              </Button>
                            )}
                            <Link to={`/knowledge/${doc.id}`}>
                              <Button variant="ghost" size="icon-sm" title="Open">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </Link>
                            <Button variant="danger-ghost" size="icon-sm" title="Delete" onClick={() => setToDelete(doc)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={onUploaded} />
      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Delete document?"
        message={`"${toDelete?.title}" and all of its chunks and embeddings will be permanently removed from your knowledge base.`}
      />
    </>
  );
}
