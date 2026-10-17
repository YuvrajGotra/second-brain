import { useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

/** <pre> wrapper with a language label and copy button. */
export function CodeBlock({ children, ...props }) {
  const ref = useRef(null);
  const [copied, setCopied] = useState(false);
  const className = children?.props?.className ?? '';
  const language = /language-(\w+)/.exec(className)?.[1];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ref.current?.innerText ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="group relative not-prose my-3">
      <div className="flex items-center justify-between rounded-t-xl border border-b-0 border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-400">
        <span>{language ?? 'code'}</span>
        <button onClick={copy} className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-zinc-800 hover:text-zinc-200">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre ref={ref} {...props} className="!mt-0 overflow-x-auto rounded-b-xl border border-zinc-800 bg-zinc-950 p-4 text-[13px] leading-relaxed text-zinc-100">
        {children}
      </pre>
    </div>
  );
}
