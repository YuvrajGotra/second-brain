import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../services/api';
import { Button } from '../components/ui/Button';
import { FormField, fieldErrors } from '../components/FormField';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function LoginPage() {
  useDocumentTitle('Log in');
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});
    try {
      const user = await login(form);
      toast.success(`Welcome back, ${user.name.split(' ')[0]}!`);
      navigate(location.state?.from?.pathname ?? '/dashboard', { replace: true });
    } catch (err) {
      setErrors({ ...fieldErrors(err), form: getErrorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Log in to your knowledge base.</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
        {errors.form && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
            {errors.form}
          </div>
        )}
        <FormField label="Email" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} required />
        <FormField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={form.password}
          onChange={set('password')}
          error={errors.password}
          required
        />
        <Button type="submit" size="lg" className="w-full justify-center" loading={submitting}>
          Log in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-500">
        New here?{' '}
        <Link to="/register" className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
          Create an account
        </Link>
      </p>
    </>
  );
}
