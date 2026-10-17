import { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { CodeBlock } from './CodeBlock';

/**
 * Turns the model's "[1]" / "[1, 3]" citation markers into links (#cite-1)
 * that render as clickable chips. Fenced and inline code are left untouched.
 */
function linkCitations(markdown) {
  return markdown
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(/\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\](?!\()/g, (_, nums) =>
            nums
              .split(',')
              .map((n) => `[${n.trim()}](#cite-${n.trim()})`)
              .join(''),
          ),
    )
    .join('');
}

export const MarkdownAnswer = memo(function MarkdownAnswer({ content, sources = [], onCite, streaming }) {
  const processed = useMemo(() => linkCitations(content), [content]);
  const byIndex = useMemo(() => Object.fromEntries(sources.map((s) => [s.index, s])), [sources]);

  const components = useMemo(
    () => ({
      a({ href, children, ...props }) {
        if (href?.startsWith('#cite-')) {
          const n = Number(href.slice(6));
          const source = byIndex[n];
          return (
            <button
              type="button"
              onClick={() => source && onCite?.(source)}
              title={source ? `${source.title}${source.location ? ` — ${source.location}` : ''}` : `Source ${n}`}
              className="mx-0.5 inline-flex h-[18px] min-w-[18px] -translate-y-px items-center justify-center rounded-md bg-brand-100 px-1 align-middle text-[11px] font-semibold text-brand-700 no-underline transition hover:bg-brand-600 hover:text-white dark:bg-brand-500/20 dark:text-brand-200"
            >
              {n}
            </button>
          );
        }
        return (
          <a href={href} target="_blank" rel="noreferrer noopener" {...props}>
            {children}
          </a>
        );
      },
      pre: CodeBlock,
    }),
    [byIndex, onCite],
  );

  return (
    <div
      className={`prose prose-sm prose-zinc max-w-none dark:prose-invert prose-p:leading-relaxed prose-pre:my-3 prose-li:my-0.5 ${
        streaming ? 'typing-caret' : ''
      }`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]} components={components}>
        {processed}
      </ReactMarkdown>
    </div>
  );
});
