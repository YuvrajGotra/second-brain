import clsx from 'clsx';
import { FileText, FileType2, Hash, Mic, NotebookPen } from 'lucide-react';

const STYLES = {
  pdf: { icon: FileType2, className: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' },
  markdown: { icon: Hash, className: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400' },
  text: { icon: FileText, className: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300' },
  transcript: { icon: Mic, className: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
  note: { icon: NotebookPen, className: 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300' },
};

export function FileIcon({ type, size = 'md' }) {
  const { icon: Icon, className } = STYLES[type] ?? STYLES.text;
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-xl',
        size === 'sm' ? 'h-7 w-7' : 'h-9 w-9',
        className,
      )}
    >
      <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
    </span>
  );
}
