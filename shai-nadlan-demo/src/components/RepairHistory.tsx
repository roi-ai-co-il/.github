import Link from 'next/link';
import { Wrench } from 'lucide-react';
import { heDate, ILS } from '@/lib/format';
import { ILSorDash, money, isOpen, isSplit, whoPaid, type RepairRow } from '@/lib/repairs';
import { Group, Rows, EmptyState } from '@/components/ui';

/**
 * A read-only list of repairs, for screens where the repair is history rather
 * than something you are doing right now — a vendor's jobs, an archive.
 * Recording a repair happens where the fault is: on the property, or on
 * /repairs.
 */
export default function RepairHistory({
  repairs, title = 'תיקונים', empty, showProperty = true,
}: {
  repairs: RepairRow[];
  title?: string;
  empty: string;
  showProperty?: boolean;
}) {
  if (!repairs.length) {
    return (
      <Group title={title}>
        <EmptyState icon={Wrench} text={empty} />
      </Group>
    );
  }

  return (
    <Group title={`${title} (${repairs.length})`}>
      <Rows>
        {repairs.map((r) => (
          <div key={r.id} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[15px] font-semibold text-label truncate">{r.title}</p>
              <span className="text-[15px] font-semibold text-label-secondary whitespace-nowrap">
                {ILSorDash(r.cost)}
              </span>
            </div>
            <p className="text-[13px] text-label-tertiary truncate">
              {[
                r.trade,
                showProperty && r.property ? null : null,
                heDate(r.reported_on),
                isOpen(r) ? 'פתוח' : `טופל ${heDate(r.done_on!)}`,
              ].filter(Boolean).join(' · ')}
              {showProperty && r.property && (
                <>
                  {' · '}
                  <Link href={`/properties/${r.property.id}`} className="press text-accent font-medium">
                    {r.property.name}
                  </Link>
                </>
              )}
            </p>
            <p className="text-[13px] text-label-tertiary mt-0.5">
              {whoPaid(r)}
              {isSplit(r) && money(r.owner_cost) != null && (
                <> · מהרווח {ILS(money(r.owner_cost)!)}</>
              )}
              {money(r.cost) == null && <span className="text-warning"> · טרם התקבלה חשבונית</span>}
            </p>
          </div>
        ))}
      </Rows>
    </Group>
  );
}
