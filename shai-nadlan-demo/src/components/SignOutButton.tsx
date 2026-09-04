'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/** Signing out has to be possible from the maintenance notice, or the only way
 *  off the page is clearing cookies by hand. */
export default function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await createClient().auth.signOut();
        router.replace('/login');
        router.refresh();
      }}
      className="press text-label-tertiary underline underline-offset-2 disabled:opacity-50"
    >
      {busy ? 'יוצא…' : 'יציאה מהחשבון'}
    </button>
  );
}
