import { createClient } from '@/lib/supabase/server';
import SettingsForm, { type SettingsRow } from '@/components/SettingsForm';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'הגדרות' };

export default async function SettingsPage() {
  const supabase = await createClient();

  /* One row, keyed on a boolean primary key — the standard singleton trick.
     maybeSingle() so a missing row renders the "could not load" state instead
     of throwing a 500 at someone who only wanted to change an email address. */
  const { data } = await supabase
    .from('digest_settings')
    .select('recipient, sender, enabled, greeting_name, send_dow, lease_notice_days, insurance_notice_days, last_sent_at, last_status')
    .eq('id', true)
    .maybeSingle();

  return <SettingsForm settings={(data as SettingsRow | null) ?? null} />;
}
