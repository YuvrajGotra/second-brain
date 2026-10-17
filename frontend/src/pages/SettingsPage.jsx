import { useState } from 'react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { authService } from '../services/authService';
import { getErrorMessage } from '../services/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { FormField, fieldErrors } from '../components/FormField';
import { formatDate } from '../utils/format';

function Section({ title, description, children }) {
  return (
    <section className="card grid gap-6 p-6 md:grid-cols-3">
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
      </div>
      <div className="md:col-span-2">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  useDocumentTitle('Settings');
  const { user, setUser, logout } = useAuth();
  const { preference, setPreference } = useTheme();

  const [name, setName] = useState(user.name);
  const [savingName, setSavingName] = useState(false);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [pwErrors, setPwErrors] = useState({});
  const [savingPw, setSavingPw] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePw, setDeletePw] = useState('');
  const [deleting, setDeleting] = useState(false);

  const saveName = async (e) => {
    e.preventDefault();
    setSavingName(true);
    try {
      const { user: updated } = await authService.updateProfile({ name });
      setUser(updated);
      toast.success('Profile updated');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSavingName(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setSavingPw(true);
    setPwErrors({});
    try {
      await authService.changePassword(pw);
      setPw({ currentPassword: '', newPassword: '' });
      toast.success('Password changed');
    } catch (err) {
      setPwErrors(fieldErrors(err));
      toast.error(getErrorMessage(err));
    } finally {
      setSavingPw(false);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      await authService.deleteAccount(deletePw);
      toast.success('Your account and all data were deleted.');
      await logout();
    } catch (err) {
      toast.error(getErrorMessage(err));
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description={`Member since ${formatDate(user.created_at)}`} />

      <Section title="Profile" description="How you appear in Second Brain.">
        <form onSubmit={saveName} className="max-w-md space-y-4">
          <FormField label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          <FormField label="Email" value={user.email} disabled hint="Email can't be changed." />
          <Button type="submit" loading={savingName} disabled={!name.trim() || name === user.name}>
            Save profile
          </Button>
        </form>
      </Section>

      <Section title="Appearance" description="Choose light, dark, or follow your system.">
        <div className="grid max-w-md grid-cols-3 gap-2">
          {[
            { value: 'light', label: 'Light', icon: Sun },
            { value: 'dark', label: 'Dark', icon: Moon },
            { value: 'system', label: 'System', icon: Monitor },
          ].map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setPreference(value)}
              className={clsx(
                'flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium transition',
                preference === value
                  ? 'border-brand-500 bg-brand-50 text-brand-700 ring-4 ring-brand-500/10 dark:bg-brand-500/10 dark:text-brand-300'
                  : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50',
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Password" description="Use at least 8 characters with a letter and a number.">
        <form onSubmit={savePassword} className="max-w-md space-y-4">
          <FormField
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={pw.currentPassword}
            onChange={(e) => setPw((p) => ({ ...p, currentPassword: e.target.value }))}
            error={pwErrors.currentPassword}
          />
          <FormField
            label="New password"
            type="password"
            autoComplete="new-password"
            value={pw.newPassword}
            onChange={(e) => setPw((p) => ({ ...p, newPassword: e.target.value }))}
            error={pwErrors.newPassword}
          />
          <Button type="submit" loading={savingPw} disabled={!pw.currentPassword || !pw.newPassword}>
            Change password
          </Button>
        </form>
      </Section>

      <Section title="Danger zone" description="Permanently delete your account and everything in it.">
        <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 dark:border-red-500/20 dark:bg-red-500/5">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            This removes all documents, notes, embeddings and conversations. This cannot be undone.
          </p>
          <Button variant="danger" className="mt-3" onClick={() => setDeleteOpen(true)}>
            Delete account
          </Button>
        </div>
      </Section>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete your account?"
        description="Enter your password to confirm."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={deleteAccount} loading={deleting} disabled={!deletePw}>
              Delete forever
            </Button>
          </>
        }
      >
        <FormField label="Password" type="password" value={deletePw} onChange={(e) => setDeletePw(e.target.value)} />
      </Modal>
    </div>
  );
}
