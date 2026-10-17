import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowUpRight, Search, SearchX, Sparkles } from 'lucide-react';
import { searchService } from '../services/knowledgeService';
import { getErrorMessage } from '../services/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/Feedback';
import { FileIcon } from '../components/FileIcon';
import { Highlight } from '../components/Highlight';

const MODES = [
  { value: 'hybrid', label: 'Hybrid', hint: 'Meaning + keywords (recommended)' },
  { value: 'semantic', label: 'Semantic', hint: 'Vector similarity only' },
  { value: 'keyword', label: 'Keyword', hint: 'Full-text only' },
];
const SOURCES = [
  { value: 'all', label: 'Everything' },
  { value: 'documents', label: 'Documents' },
  { value: 'notes', label: 'Notes' },
];

const resultHref = (r) =>
  r.documentId ? `/knowledge/${r.documentId}?chunk=${r.chunkId}${r.pageNumber ? `&page=${r.pageNumber}` : ''}` : `/notes/${r.noteId}`;

export default function SearchPage() {
  useDocumentTitle('Search');
  const [params, setParams] = useSearchParams();
  const [input, setInput] = useState(params.get('q') ?? '');
  const [mode, setMode] = useState('hybrid');
  const [sourceType, setSourceType] = useState('all');
  const [state, setState] = useState({ results: null, loading: false, error: null });
  const q = params.get('q') ?? '';

  useEffect(() => {
    if (!q) {
      setState({ results: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    searchService
      .search({ query: q, mode, sourceType, limit: 20 })
      .then((results) => !cancelled && setState({ results, loading: false, error: null }))
      .catch((err) => !cancelled && setState({ results: null, loading: false, error: getErrorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, [q, mode, sourceType]);

  const submit = (e) => {
    e.preventDefault();
    if (input.trim()) setParams({ q: input.trim() });
  };

  return (
    <>
      <PageHeader title="Search" description="Find passages by meaning, not just exact words." />

      <form onSubmit={submit} className="card p-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-zinc-400" />
            <input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder='e.g. "refresh token security"'
              className="input h-12 pl-11 text-base"
              maxLength={500}
            />
          </div>
          <Button type="submit" size="lg" className="h-12">
            Search
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <div className="flex items-center gap-1">
            {MODES.map((m) => (
              <button
                type="button"
                key={m.value}
                title={m.hint}
                onClick={() => setMode(m.value)}
                className={clsx(
                  'rounded-lg px-2.5 py-1 text-xs font-medium transition',
                  mode === m.value ? 'bg-brand-600 text-white' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {SOURCES.map((s) => (
              <button
                type="button"
                key={s.value}
                onClick={() => setSourceType(s.value)}
                className={clsx(
                  'rounded-lg px-2.5 py-1 text-xs font-medium transition',
                  sourceType === s.value
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                    : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </form>

      <div className="mt-6">
        {state.loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
        ) : state.error ? (
          <div className="card">
            <ErrorState message={state.error} />
          </div>
        ) : state.results === null ? (
          <EmptyState icon={Search} title="Search your Second Brain" description="Hybrid search combines vector similarity (pgvector) with PostgreSQL full-text ranking." />
        ) : state.results.length === 0 ? (
          <div className="card">
            <EmptyState icon={SearchX} title="No results" description={`Nothing in your knowledge base matched “${q}”.`} />
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-zinc-500">
                {state.results.length} result{state.results.length === 1 ? '' : 's'} for “{q}”
              </p>
              <Link to="/chat" state={null}>
                <Button variant="secondary" size="sm" icon={Sparkles}>
                  Ask AI instead
                </Button>
              </Link>
            </div>
            <ol className="space-y-3">
              {state.results.map((r, i) => (
                <li key={r.chunkId}>
                  <Link to={resultHref(r)} className="card group block p-4 transition hover:border-brand-300 hover:shadow-md dark:hover:border-brand-500/40">
                    <div className="flex items-start gap-3">
                      <span className="mt-1 w-5 shrink-0 text-right text-sm font-semibold text-zinc-400 tabular-nums">{i + 1}.</span>
                      <FileIcon type={r.fileType} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-medium group-hover:text-brand-600 dark:group-hover:text-brand-400">{r.title}</p>
                          {r.location && <span className="text-xs text-zinc-500">{r.location}</span>}
                          <ArrowUpRight className="h-4 w-4 text-zinc-300 opacity-0 transition group-hover:opacity-100" />
                        </div>
                        <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                          <Highlight text={r.snippet} query={q} />
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {r.similarity != null && <Badge tone="green">{Math.round(r.similarity * 100)}% semantic</Badge>}
                          {r.matchedKeywords && <Badge tone="amber">keyword match</Badge>}
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </>
  );
}
