import { createClient } from '@/lib/supabase/server';
import DocumentsCloud, { type CloudDoc } from '@/components/DocumentsCloud';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'מסמכים' };

export default async function DocumentsPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from('property_documents')
    .select('id, title, doc_type, storage_path, size_bytes, doc_date, created_at, property:properties(id, name)')
    .order('created_at', { ascending: false });

  /* A document whose property was deleted has nowhere to belong and nothing to
     link to, so it is left out rather than rendered as an orphan row. */
  const docs: CloudDoc[] = (data ?? []).flatMap((d) => {
    const p = d.property as unknown as { id: string; name: string } | null;
    if (!p) return [];
    return [{
      id: d.id,
      title: d.title,
      doc_type: d.doc_type,
      storage_path: d.storage_path,
      size_bytes: d.size_bytes,
      doc_date: d.doc_date,
      created_at: d.created_at,
      property_id: p.id,
      property_name: p.name,
    }];
  });

  return <DocumentsCloud docs={docs} />;
}
