import clsx from 'clsx';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from './Button';

export function Spinner({ className, label }) {
  return (
    <div className={clsx('flex items-center justify-center gap-2 text-sm text-zinc-500', className)} role="status">
      <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
      {label && <span>{label}</span>}
    </div>
  );
}

export function Skeleton({ className }) {
  return <div className={clsx('animate-pulse rounded-lg bg-zinc-200/70 dark:bg-zinc-800', className)} />;
}

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={clsx('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {Icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry, className }) {
  return (
    <div className={clsx('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" icon={RefreshCw} className="mt-4" onClick={() => onRetry()}>
          Try again
        </Button>
      )}
    </div>
  );
}
