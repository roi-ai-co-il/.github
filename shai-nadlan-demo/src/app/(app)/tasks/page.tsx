import { createClient } from '@/lib/supabase/server';
import TasksList, { type TaskRow } from '@/components/TasksList';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'משימות' };

export default async function TasksPage() {
  const supabase = await createClient();

  const [{ data: tasks }, { data: properties }] = await Promise.all([
    // Open first, then soonest due; undated tasks sink to the bottom of each
    // group rather than jumping to the top on a null.
    supabase
      .from('tasks')
      .select('id, title, due_date, done, property_id, property:properties(id, name)')
      .order('done', { ascending: true })
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false }),
    supabase.from('properties').select('id, name').order('name'),
  ]);

  return (
    <TasksList
      tasks={(tasks ?? []) as unknown as TaskRow[]}
      properties={properties ?? []}
    />
  );
}
