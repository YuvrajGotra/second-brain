import { Outlet } from 'react-router-dom';
import { FileSearch, Quote, ShieldCheck } from 'lucide-react';
import { Logo } from '../components/Logo';

const FEATURES = [
  { icon: FileSearch, title: 'Ask your documents', text: 'Semantic + keyword search across PDFs, notes and transcripts.' },
  { icon: Quote, title: 'Answers with citations', text: 'Every answer links back to the exact page or passage.' },
  { icon: ShieldCheck, title: 'Private by design', text: 'Your knowledge is isolated to your account. Always.' },
];

export default function AuthLayout() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-zinc-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -top-40 -left-40 h-[28rem] w-[28rem] rounded-full bg-brand-600/30 blur-3xl" />
        <div className="absolute -right-32 -bottom-32 h-[24rem] w-[24rem] rounded-full bg-fuchsia-600/20 blur-3xl" />
        <div className="relative">
          <Logo />
        </div>
        <div className="relative max-w-md">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight">
            Your notes, lectures and docs — <span className="text-brand-300">one brain you can talk to.</span>
          </h2>
          <ul className="mt-10 space-y-6">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
                  <Icon className="h-5 w-5 text-brand-200" />
                </div>
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="mt-0.5 text-sm text-zinc-400">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-zinc-500">Retrieval-Augmented Generation · PostgreSQL + pgvector</p>
      </div>
      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
