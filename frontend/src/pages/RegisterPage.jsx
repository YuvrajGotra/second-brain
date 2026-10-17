import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../services/api';
import { Button } from '../components/ui/Button';
import { FormField, fieldErrors } from '../components/FormField';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

function validate({ name, email, password }) {
  const errors = {};
  if (!name.trim()) errors.name = 'Name is required';
  if (!/^\S+@\S+\.\S+$/.test(email)) errors.email = 'Please enter a valid email address';
  if (password.length < 8) errors.password = 'Password must be at least 8 characters';
  else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) errors.password = 'Use at least one letter and one number';
  return errors;
}

export default function RegisterPage() {
  useDocumentTitle('Create account');
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    const clientErrors = validate(form);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length) return;

    setSubmitting(true);
    try {
      await register(form);
      toast.success('Account created — welcome to your Second Brain!');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setErrors({ ...fieldErrors(err), form: getErrorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Create your Second Brain</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Start building a knowledge base you can talk to.</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
        {errors.form && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
            {errors.form}
          </div>
        )}
        <FormField label="Name" autoComplete="name" value={form.name} onChange={set('name')} error={errors.name} />
        <FormField label="Email" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} />
        <FormField
          label="Password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={set('password')}
          error={errors.password}
          hint="At least 8 characters, with a letter and a number."
        />
        <Button type="submit" size="lg" className="w-full justify-center" loading={submitting}>
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-500">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
          Log in
        </Link>
      </p>
    </>
  );
}
