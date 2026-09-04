import { redirect } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { createClient } from '@/lib/supabase/server';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // The greeting uses the profile name where there is one, and falls back to
  // the mailbox rather than greeting someone by their full email address.
  const fullName = (user.user_metadata?.full_name as string | undefined)?.trim();
  const firstName = fullName ? fullName.split(/\s+/)[0] : (user.email?.split('@')[0] ?? '');

  return (
    <AppShell email={user.email ?? ''} firstName={firstName}>
      {children}
    </AppShell>
  );
}
