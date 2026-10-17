import { Brain } from 'lucide-react';

export function Logo({ compact = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-600/25">
        <Brain className="h-5 w-5" />
      </div>
      {!compact && <span className="text-[15px] font-semibold tracking-tight">Second Brain</span>}
    </div>
  );
}
