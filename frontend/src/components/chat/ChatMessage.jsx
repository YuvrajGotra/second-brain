import { memo, useState } from 'react';
import clsx from 'clsx';
import { AlertCircle, Brain, Check, Copy, Info, RotateCw, Search } from 'lucide-react';
import { MarkdownAnswer } from './MarkdownAnswer';
import { SourceList } from './SourceList';

function StageIndicator({ stage }) {
  const label = stage === 'searching' ? 'Searching your knowledge base…' : 'Reading sources and writing an answer…';
  return (
    <div className="flex items-center gap-2 text-sm text-zinc-500">
      <Search className="h-4 w-4 animate-pulse text-brand-500" />
      {label}
    </div>
  );
}

function MessageMeta({ metadata }) {
  if (!metadata?.retrieval) return null;
  const t = metadata.retrieval.timings ?? {};
  return (
    <div className="text-left text-xs leading-relaxed">
      {metadata.standaloneQuery && <p>Search query: “{metadata.standaloneQuery}”</p>}
      <p>
        Retrieved {metadata.retrieval.candidates} candidates → kept {metadata.retrieval.selected}
      </p>
      <p>
        search {t.searchMs}ms · rerank {t.rerankMs}ms · answer {metadata.generationMs}ms
      </p>
      <p>Model: {metadata.model}</p>
    </div>
  );
}

export const ChatMessage = memo(function ChatMessage({ message, onCite, onRetry }) {
  const [copied, setCopied] = useState(false);
  const [showMeta, setShowMeta] = useState(false);

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-white shadow-sm sm:max-w-[75%]">
          {message.content}
        </div>
      </div>
    );
  }

  const copy = async () => {
    await navigator.clipboard.writeText(message.content).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const waiting = message.pending && !message.content;

  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
        <Brain className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        {message.error ? (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <p>{message.error}</p>
              {onRetry && (
                <button onClick={onRetry} className="mt-2 flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline">
                  <RotateCw className="h-3.5 w-3.5" /> Try again
                </button>
              )}
            </div>
          </div>
        ) : waiting ? (
          <StageIndicator stage={message.stage} />
        ) : (
          <MarkdownAnswer content={message.content} sources={message.sources} onCite={onCite} streaming={message.pending} />
        )}

        {!message.pending && !message.error && <SourceList sources={message.sources} onOpen={onCite} />}

        {!message.pending && !message.error && (
          <div className="mt-2 flex items-center gap-1 text-zinc-400">
            <button onClick={copy} className="rounded-md p-1 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" title="Copy answer">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            {message.metadata?.retrieval && (
              <div className="relative">
                <button
                  onClick={() => setShowMeta((v) => !v)}
                  className={clsx('rounded-md p-1 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200', showMeta && 'text-brand-600')}
                  title="How this answer was produced"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
                {showMeta && (
                  <div className="absolute bottom-7 left-0 z-10 w-72 rounded-xl border border-zinc-200 bg-white p-3 text-zinc-600 shadow-lg dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                    <MessageMeta metadata={message.metadata} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
