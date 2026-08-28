import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ChevronRight, MapPin, BedDouble, Ruler, Layers, Wallet,
  TrendingUp, CalendarDays, FileText, StickyNote, User, Home,
} from 'lucide-react';
import ContactButtons from '@/components/ContactButtons';
import { createClient } from '@/lib/supabase/server';
import { ILS, heDate, daysUntil, waLink } from '@/lib/format';
import { PROPERTY_TYPES, leaseUrgency, URGENCY_STYLE } from '@/lib/domain';
import { StatusBadge, Group, Rows, EmptyState, IconChip } from '@/components/ui';
import PropertyGallery from '@/components/PropertyGallery';
import PropertyActions from '@/components/PropertyActions';

export const dynamic = 'force-dynamic';

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: property } = await supabase
    .from('properties')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!property) notFound();

  const [{ data: images }, { data: leases }] = await Promise.all([
    supabase.from('property_images').select('*').eq('property_id', id).order('sort_order'),
    supabase
      .from('leases')
      .select('*, tenant:tenants(id, full_name, phone, email)')
      .eq('property_id', id)
      .order('end_date', { ascending: false }),
  ]);

  const activeLease = (leases ?? []).find((l) => l.status === 'active');
  const appreciation =
    property.purchase_price && property.current_value
      ? ((property.current_value - property.purchase_price) / property.purchase_price) * 100
      : null;

  const facts = [
    { icon: Home, label: 'סוג נכס', value: PROPERTY_TYPES[property.property_type] ?? property.property_type },
    { icon: BedDouble, label: 'חדרים', value: property.rooms != null ? `${property.rooms}` : null },
    { icon: Ruler, label: 'שטח', value: property.area_sqm != null ? `${property.area_sqm} מ״ר` : null },
    { icon: Layers, label: 'קומה', value: property.floor_no != null ? `${property.floor_no}` : null },
    { icon: Wallet, label: 'מחיר רכישה', value: property.purchase_price != null ? ILS(property.purchase_price) : null },
    { icon: CalendarDays, label: 'תאריך רכישה', value: property.purchase_date ? heDate(property.purchase_date) : null },
    { icon: TrendingUp, label: 'שווי נוכחי', value: property.current_value != null ? ILS(property.current_value) : null },
    { icon: TrendingUp, label: 'עליית ערך', value: appreciation != null ? `${appreciation > 0 ? '+' : ''}${appreciation.toFixed(0)}%` : null },
  ].filter((f) => f.value != null);

  return (
    <div className="space-y-5">
      {/* ── Back + title ────────────────────────────────── */}
      <div>
        <Link href="/properties" className="press inline-flex items-center gap-0.5 text-[15px] font-medium text-accent -mr-1">
          <ChevronRight size={18} strokeWidth={2.5} />
          <span>נכסים</span>
        </Link>
        <div className="flex items-start justify-between gap-3 mt-2">
          <div className="min-w-0">
            <h1 className="text-[26px] font-bold text-label tracking-tight leading-tight">{property.name}</h1>
            <p className="text-[14px] text-label-secondary mt-1 flex items-center gap-1">
              <MapPin size={14} strokeWidth={2} />
              {property.address}, {property.city}
            </p>
          </div>
          <div className="shrink-0 mt-1">
            <StatusBadge status={property.status} />
          </div>
        </div>
      </div>

      {/* ── Actions — everything you can do with the property, one row ── */}
      <PropertyActions
        propertyId={property.id}
        propertyName={property.name}
        activeLease={
          activeLease
            ? { id: activeLease.id, tenantName: activeLease.tenant?.full_name ?? 'השוכר', startDate: activeLease.start_date, endDate: activeLease.end_date }
            : null
        }
      />

      <PropertyGallery
        propertyId={property.id}
        propertyName={property.name}
        images={(images ?? []).map((im) => ({ id: im.id, url: im.url }))}
        coverUrl={property.cover_image_url}
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">
        {/* ── Facts ───────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-5">
          <Group title="פרטי הנכס">
            <dl className="grid grid-cols-2 sm:grid-cols-4">
              {facts.map((f) => (
                <div key={f.label} className="p-3.5 border-b border-l border-separator last:border-l-0">
                  <dt className="text-[12px] text-label-tertiary flex items-center gap-1.5">
                    <f.icon size={13} strokeWidth={2} />
                    {f.label}
                  </dt>
                  <dd className="text-[16px] font-semibold text-label mt-1 whitespace-nowrap">{f.value}</dd>
                </div>
              ))}
            </dl>
          </Group>

          {property.notes && (
            <Group title="הערות">
              <div className="p-4 flex items-start gap-2.5">
                <StickyNote size={16} className="text-warning shrink-0 mt-0.5" strokeWidth={2} />
                <p className="text-[15px] text-label-secondary leading-relaxed">{property.notes}</p>
              </div>
            </Group>
          )}
        </div>

        {/* ── Active lease ────────────────────────────── */}
        <div className="lg:col-span-2">
          {activeLease ? (
            <LeasePanel lease={activeLease} />
          ) : (
            <Group title="חוזה שכירות">
              <EmptyState icon={FileText} text="אין חוזה פעיל בנכס זה" />
            </Group>
          )}
        </div>
      </div>

      {/* ── Lease history ───────────────────────────────── */}
      {(leases ?? []).length > 1 && (
        <Group title="היסטוריית חוזים">
          <Rows>
            {(leases ?? []).map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-medium text-label truncate">{l.tenant?.full_name}</p>
                  <p className="text-[13px] text-label-tertiary mt-0.5">
                    {heDate(l.start_date)} — {heDate(l.end_date)}
                  </p>
                </div>
                <span className="text-[15px] font-semibold text-label whitespace-nowrap">{ILS(l.monthly_rent)}</span>
              </div>
            ))}
          </Rows>
        </Group>
      )}
    </div>
  );
}

function LeasePanel({ lease }: {
  lease: {
    start_date: string; end_date: string; monthly_rent: number; payment_day: number;
    deposit: number | null; linked_to_cpi: boolean; notes: string | null;
    tenant: { full_name: string; phone: string | null; email: string | null } | null;
  };
}) {
  const days = daysUntil(lease.end_date);
  const urgency = leaseUrgency(days);
  const style = URGENCY_STYLE[urgency];

  const total = daysUntil(lease.end_date) - daysUntil(lease.start_date);
  const elapsed = -daysUntil(lease.start_date);
  const progress = total > 0 ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 100;

  return (
    <Group
      title="חוזה שכירות"
      action={
        <span className={`px-2.5 py-1 rounded-full text-[12px] font-semibold ${style.text} ${style.bg}`}>
          {style.label(days)}
        </span>
      }
    >
      {/* Tenant row — the thing you reach for first */}
      <div className="flex items-center gap-3 px-4 py-3.5 border-b border-separator">
        <IconChip icon={User} tone="accent" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[15px] text-label truncate">{lease.tenant?.full_name}</p>
          {lease.tenant?.phone && (
            <p className="text-[13px] text-label-tertiary whitespace-nowrap" dir="ltr">{lease.tenant.phone}</p>
          )}
        </div>
      </div>
      {lease.tenant?.phone && (
        <div className="px-4 py-3 border-b border-separator">
          <ContactButtons phone={lease.tenant.phone} name={lease.tenant.full_name ?? undefined} />
        </div>
      )}

      {/* Term progress against today */}
      <div className="px-4 py-3.5 border-b border-separator">
        <div className="flex items-center justify-between text-[12px] text-label-tertiary mb-1.5">
          <span>{heDate(lease.start_date)}</span>
          <span>{heDate(lease.end_date)}</span>
        </div>
        <div className="h-1.5 rounded-full bg-fill overflow-hidden">
          <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Terms */}
      <dl className="grid grid-cols-2">
        <div className="p-3.5 border-l border-b border-separator">
          <dt className="text-[12px] text-label-tertiary">שכר דירה</dt>
          <dd className="text-[18px] font-bold text-label whitespace-nowrap mt-0.5 tracking-tight">
            {ILS(lease.monthly_rent)}
          </dd>
        </div>
        <div className="p-3.5 border-b border-separator">
          <dt className="text-[12px] text-label-tertiary">יום תשלום</dt>
          <dd className="text-[18px] font-bold text-label mt-0.5 tracking-tight">{lease.payment_day} בחודש</dd>
        </div>
        <div className="p-3.5 border-l border-separator">
          <dt className="text-[12px] text-label-tertiary">פיקדון</dt>
          <dd className="text-[16px] font-semibold text-label whitespace-nowrap mt-0.5">
            {lease.deposit != null ? ILS(lease.deposit) : '—'}
          </dd>
        </div>
        <div className="p-3.5">
          <dt className="text-[12px] text-label-tertiary">הצמדה למדד</dt>
          <dd className="text-[16px] font-semibold text-label mt-0.5">{lease.linked_to_cpi ? 'כן' : 'לא'}</dd>
        </div>
      </dl>

      {lease.notes && (
        <div className="px-4 py-3.5 border-t border-separator flex items-start gap-2.5">
          <StickyNote size={15} className="text-warning shrink-0 mt-0.5" strokeWidth={2} />
          <p className="text-[14px] text-label-secondary leading-relaxed">{lease.notes}</p>
        </div>
      )}
    </Group>
  );
}
