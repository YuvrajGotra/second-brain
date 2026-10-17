import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Blocks,
  FileText,
  MessageSquare,
  NotebookPen,
  Search,
  Sparkles,
  UploadCloud,
  MessagesSquare,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { usePolling } from '../hooks/usePolling';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { statsService } from '../services/knowledgeService';
import { StatCard } from '../components/StatCard';
import { FileIcon } from '../components/FileIcon';
import { StatusBadge } from '../components/ui/Badge';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/Feedback';
import { Button } from '../components/ui/Button';
import { formatBytes, pluralize, timeAgo } from '../utils/format';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

const QUICK_ACTIONS = [
  { label: 'Upload document', description: 'PDF, Markdown, TXT, transcripts', icon: UploadCloud, to: '/knowledge?upload=1' },
  { label: 'Create note', description: 'Write straight into your brain', icon: NotebookPen, to: '/notes/new' },
  { label: 'Ask AI', description: 'Chat with your knowledge', icon: Sparkles, to: '/chat' },
  { label: 'Search knowledge', description: 'Semantic + keyword search', icon: Search, to: '/search' },
];

export default function DashboardPage() {
  useDocumentTitle('Dashboard');
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useAsync(() => statsService.dashboard(), []);
  usePolling(() => reload({ silent: true }), 4000, (data?.counts?.documents_processing ?? 0) > 0);

  const counts = data?.counts;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-brand-600 dark:text-brand-400">{greeting()}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Welcome back, {user?.name?.split(' ')[0]}</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Here's what's in your Second Brain.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={UploadCloud} onClick={() => navigate('/knowledge?upload=1')}>
            Upload
          </Button>
          <Button icon={Sparkles} onClick={() => navigate('/chat')}>
            Ask your brain
          </Button>
        </div>
      </div>

      {error ? (
        <div className="card">
          <ErrorState message={error} onRetry={reload} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {loading && !data ? (
            Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[124px] rounded-2xl" />)
          ) : (
            <>
              <StatCard
                icon={FileText}
                label="Documents"
                value={counts.documents}
                hint={counts.documents_processing ? `${counts.documents_processing} processing…` : formatBytes(counts.storage_bytes)}
              />
              <StatCard icon={NotebookPen} label="Notes" value={counts.notes} accent="sky" hint="Searchable by AI" />
              <StatCard icon={Blocks} label="Knowledge chunks" value={counts.chunks} accent="emerald" hint="Embedded with pgvector" />
              <StatCard
                icon={MessagesSquare}
                label="Conversations"
                value={counts.conversations}
                accent="amber"
                hint={pluralize(counts.questions_asked, 'question') + ' asked'}
              />
            </>
          )}
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-500 uppercase tracking-wide dark:text-zinc-400">Quick actions</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_ACTIONS.map(({ label, description, icon: Icon, to }) => (
            <Link
              key={label}
              to={to}
              className="card group flex items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md dark:hover:border-brand-500/40"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 transition group-hover:bg-brand-600 group-hover:text-white dark:bg-zinc-800 dark:text-zinc-300">
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{label}</p>
                <p className="truncate text-xs text-zinc-500">{description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="card lg:col-span-3">
          <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <h2 className="font-semibold">Recent documents</h2>
            <Link to="/knowledge" className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {loading && !data ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : data?.recentDocuments?.length ? (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {data.recentDocuments.map((doc) => (
                <li key={doc.id}>
                  <Link to={`/knowledge/${doc.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <FileIcon type={doc.file_type} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{doc.title}</p>
                      <p className="text-xs text-zinc-500">
                        {timeAgo(doc.created_at)} · {pluralize(doc.chunk_count, 'chunk')}
                      </p>
                    </div>
                    <StatusBadge status={doc.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={UploadCloud}
              title="No documents yet"
              description="Upload your first PDF, notes or lecture transcript to start building your brain."
              action={<Button onClick={() => navigate('/knowledge?upload=1')}>Upload a document</Button>}
            />
          )}
        </section>

        <section className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <h2 className="font-semibold">Recent conversations</h2>
            <Link to="/chat" className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
              Open chat <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {loading && !data ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-8" />
              ))}
            </div>
          ) : data?.recentConversations?.length ? (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {data.recentConversations.map((c) => (
                <li key={c.id}>
                  <Link to={`/chat/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <MessageSquare className="h-4 w-4 shrink-0 text-zinc-400" />
                    <span className="min-w-0 flex-1 truncate text-sm">{c.title}</span>
                    <span className="shrink-0 text-xs text-zinc-500">{timeAgo(c.updated_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Sparkles}
              title="No conversations yet"
              description="Ask a question and get answers grounded in your own documents."
              action={
                <Button variant="secondary" onClick={() => navigate('/chat')}>
                  Start a chat
                </Button>
              }
            />
          )}
        </section>
      </div>
    </div>
  );
}
