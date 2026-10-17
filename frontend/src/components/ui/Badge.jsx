import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import { STATUS_META } from '../../utils/constants';

const TONES = {
  zinc: 'bg-zinc-100 text-zinc-700 ring-zinc-500/20 dark:bg-zinc-800 dark:text-zinc-300',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400',
  red: 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-400',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-400',
  brand: 'bg-brand-50 text-brand-700 ring-brand-600/20 dark:bg-brand-500/10 dark:text-brand-300',
};

export function Badge({ tone = 'zinc', className, children }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status, title }) {
  const meta = STATUS_META[status] ?? { label: status, tone: 'zinc' };
  const busy = status === 'processing' || status === 'queued' || status === 'uploading';
  return (
    <span title={title}>
      <Badge tone={meta.tone}>
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <span className={clsx('h-1.5 w-1.5 rounded-full', status === 'indexed' ? 'bg-emerald-500' : status === 'failed' ? 'bg-red-500' : 'bg-zinc-400')} />
        )}
        {meta.label}
      </Badge>
    </span>
  );
}
