import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Brain, PanelLeft, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { conversationService, streamChat } from '../services/chatService';
import { getErrorMessage } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { ChatMessage } from '../components/chat/ChatMessage';
import { ChatComposer } from '../components/chat/ChatComposer';
import { ConversationList } from '../components/chat/ConversationList';
import { SourceDrawer } from '../components/chat/SourceDrawer';
import { ConfirmDialog } from '../components/ui/Modal';
import { ErrorState, Spinner } from '../components/ui/Feedback';

const SUGGESTIONS = [
  'Summarize the key ideas across my documents',
  'What are the most important definitions I should remember?',
  'Explain the concept I wrote about most recently',
  'Create a short quiz from my lecture notes',
];

let tempId = 0;
const nextTempId = () => `temp-${++tempId}`;

export default function ChatPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [streaming, setStreaming] = useState(false);
  const [activeSource, setActiveSource] = useState(null);
  const [scope, setScope] = useState('all');
  const [scopedDocument, setScopedDocument] = useState(
    location.state?.documentId ? { id: location.state.documentId, title: location.state.documentTitle } : null,
  );
  const [listOpen, setListOpen] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const stickToBottom = useRef(true);
  const justCreatedId = useRef(null); // conversation created by the current stream — don't reload it

  const conversations = useAsync(() => conversationService.list({ limit: 100 }).then((r) => r.items), []);
  const current = conversations.data?.find((c) => c.id === conversationId);
  useDocumentTitle(current?.title ?? 'Chat');

  // Load messages when switching conversations.
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setLoadError(null);
      return;
    }
    if (justCreatedId.current === conversationId) return;
    let cancelled = false;
    setLoadingMessages(true);
    setLoadError(null);
    conversationService
      .get(conversationId)
      .then(({ messages }) => !cancelled && setMessages(messages))
      .catch((err) => !cancelled && setLoadError(getErrorMessage(err)))
      .finally(() => !cancelled && setLoadingMessages(false));
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // Abort any in-flight stream when leaving the page.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Auto-scroll while streaming unless the user scrolled up to read.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const updateMessage = (id, patch) =>
    setMessages((list) => list.map((m) => (m.id === id ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m)));

  const send = useCallback(
    async (text) => {
      const userTemp = { id: nextTempId(), role: 'user', content: text };
      const assistantTemp = { id: nextTempId(), role: 'assistant', content: '', sources: [], pending: true, stage: 'searching' };
      setMessages((list) => [...list, userTemp, assistantTemp]);
      setStreaming(true);
      stickToBottom.current = true;

      const controller = new AbortController();
      abortRef.current = controller;
      let activeConversationId = conversationId;

      const filters = scopedDocument ? { sourceType: 'documents', documentIds: [scopedDocument.id] } : { sourceType: scope };

      try {
        await streamChat(
          { conversationId: conversationId ?? null, message: text, filters, signal: controller.signal },
          {
            onMeta: ({ conversation, userMessage }) => {
              updateMessage(userTemp.id, { id: userMessage.id });
              userTemp.id = userMessage.id;
              if (!activeConversationId) {
                activeConversationId = conversation.id;
                justCreatedId.current = conversation.id;
                conversations.setData((list) => [conversation, ...(list ?? [])]);
                navigate(`/chat/${conversation.id}`, { replace: true });
              }
            },
            onSources: ({ sources }) => updateMessage(assistantTemp.id, { sources, stage: 'generating' }),
            onToken: ({ text: delta }) => updateMessage(assistantTemp.id, (m) => ({ content: m.content + delta })),
            onDone: ({ assistantMessage, conversation }) => {
              updateMessage(assistantTemp.id, { ...assistantMessage, pending: false });
              conversations.setData((list) => [conversation, ...(list ?? []).filter((c) => c.id !== conversation.id)]);
            },
            onError: ({ message }) => updateMessage(assistantTemp.id, { pending: false, error: message, retryText: text }),
          },
        );
      } catch (err) {
        if (err.name === 'AbortError') {
          updateMessage(assistantTemp.id, (m) => ({ pending: false, content: m.content || '_Stopped._' }));
          // The server saved whatever was generated; resync so ids/sources are real.
          if (activeConversationId) {
            const id = activeConversationId;
            setTimeout(() => {
              conversationService
                .get(id)
                .then(({ messages: saved }) => setMessages(saved))
                .catch(() => {});
            }, 600);
          }
        } else {
          updateMessage(assistantTemp.id, { pending: false, error: getErrorMessage(err), retryText: text });
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversationId, scope, scopedDocument, navigate],
  );

  const retry = (message) => {
    setMessages((list) => {
      const idx = list.findIndex((m) => m.id === message.id);
      return list.slice(0, Math.max(0, idx - 1)); // drop the failed pair
    });
    send(message.retryText);
  };

  const newConversation = () => {
    abortRef.current?.abort();
    justCreatedId.current = null;
    setScopedDocument(null);
    setListOpen(false);
    navigate('/chat');
  };

  const confirmDelete = async () => {
    try {
      await conversationService.remove(toDelete.id);
      conversations.setData((list) => list.filter((c) => c.id !== toDelete.id));
      if (toDelete.id === conversationId) navigate('/chat', { replace: true });
      toast.success('Conversation deleted');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setToDelete(null);
    }
  };

  const empty = !conversationId && messages.length === 0;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 lg:h-dvh">
      {/* Conversation list: column on desktop, drawer on mobile */}
      {listOpen && <div className="fixed inset-0 z-30 bg-zinc-950/40 md:hidden" onClick={() => setListOpen(false)} />}
      <div
        className={clsx(
          'z-30 w-64 shrink-0 border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950',
          'fixed inset-y-0 left-0 transition-transform md:static md:translate-x-0',
          listOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <ConversationList
          conversations={conversations.data}
          loading={conversations.loading}
          onNew={newConversation}
          onDelete={setToDelete}
          onNavigate={() => {
            justCreatedId.current = null;
            setListOpen(false);
          }}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-zinc-200 px-3 dark:border-zinc-800">
          <button
            onClick={() => setListOpen(true)}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 md:hidden dark:hover:bg-zinc-800"
            aria-label="Show conversations"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <h1 className="truncate text-sm font-medium">{current?.title ?? (conversationId ? 'Conversation' : 'New conversation')}</h1>
        </div>

        <div ref={scrollRef} onScroll={onScroll} className="scrollbar-thin flex-1 overflow-y-auto">
          {loadingMessages ? (
            <Spinner className="h-full" />
          ) : loadError ? (
            <ErrorState message={loadError} onRetry={() => navigate(0)} className="h-full" />
          ) : empty ? (
            <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-4 py-10 text-center">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/30">
                <Brain className="h-7 w-7" />
              </div>
              <h2 className="text-xl font-semibold tracking-tight">What would you like to know?</h2>
              <p className="mt-1.5 max-w-md text-sm text-zinc-500">
                Answers come from your own documents and notes, with citations you can click to verify.
              </p>
              <div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="card flex items-start gap-2 p-3 text-left text-sm text-zinc-600 transition hover:border-brand-300 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  >
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
              {messages.map((m) => (
                <ChatMessage key={m.id} message={m} onCite={setActiveSource} onRetry={m.error ? () => retry(m) : undefined} />
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 px-4 pt-2 pb-3">
          <ChatComposer
            onSend={send}
            onStop={() => abortRef.current?.abort()}
            streaming={streaming}
            scope={scope}
            onScopeChange={setScope}
            scopedDocument={scopedDocument}
            onClearDocument={() => setScopedDocument(null)}
          />
        </div>
      </div>

      <SourceDrawer source={activeSource} onClose={() => setActiveSource(null)} />
      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="Delete conversation?"
        message={`"${toDelete?.title}" and all of its messages will be permanently deleted.`}
      />
    </div>
  );
}
