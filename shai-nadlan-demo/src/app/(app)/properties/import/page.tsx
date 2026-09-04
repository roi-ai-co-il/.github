import { createClient } from '@/lib/supabase/server';
import ImportWizard, { type RecentBatch } from '@/components/ImportWizard';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'ייבוא נכסים' };

export default async function ImportPage() {
  const supabase = await createClient();

  // Duplicate detection compares against what is already here, so the list is
  // fetched once on the server rather than per row from the browser.
  const [{ data: properties }, { data: batches }] = await Promise.all([
    supabase.from('properties').select('id, name, address, city'),
    supabase
      .from('import_batches')
      .select('id, created_at, filename, source, counts')
      .is('undone_at', null)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const recent: RecentBatch[] = (batches ?? []).map((b) => ({
    id: b.id,
    created_at: b.created_at,
    filename: b.filename,
    source: b.source,
    counts: (b.counts ?? null) as Record<string, number> | null,
  }));

  return <ImportWizard existing={properties ?? []} recent={recent} />;
}
