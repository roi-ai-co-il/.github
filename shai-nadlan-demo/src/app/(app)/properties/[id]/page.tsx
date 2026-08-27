import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ChevronRight, MapPin, BedDouble, Ruler, Layers, Wallet,
  TrendingUp, CalendarDays, FileText, Phone, MessageSquare, StickyNote, User,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { ILS, heDate, daysUntil, waLink } from '@/lib/format';
import { PROPERTY_TYPES, leaseUrgency, URGENCY_STYLE } from '@/lib/domain';
import { StatusBadge, SectionCard, EmptyState } from '@/components/ui';
import PropertyGallery from '@/components/PropertyGallery';

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
    { icon: Layers, label: 'סוג נכס', value: PROPERTY_TYPES[property.property_type] ?? property.property_type },
    { icon: BedDouble, label: 'חדרים', value: property.rooms != null ? `${property.rooms}` : null },
    { icon: Ruler, label: 'שטח', value: property.area_sqm != null ? `${property.area_sqm} מ”ר` : null },
    { icon: Layers, label: 'קומה', value: property.floor_no != null ? `${property.floor_no}` : null },
    { icon: Wallet, label: 'מחיר רכישה', value: property.purchase_price != null ? ILS(property.purchase_price) : null },
    { icon: CalendarDays, label: 'תאריך רכישה', value: property.purchase_date ? heDate(property.purchase_date) : null },
    { icon: TrendingUp, label: 'שווי נוכחי', value: property.current_value != null ? ILS(property.current_value) : null },
    { icon: TrendingUp, label: 'עליית ערך', value: appreciation != null ? `${appreciation > 0 ? '+' : ''}${appreciation.toFixed(0)}%` : null },
  ].filter((f) => f.value != null);

  return (
    <div className="space-y-5 md:space-y-6">
      {/* ── Breadcrumb + header ────────────────────────── */}
      <div>
        <Link href="/properties" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-gray-light hover:text-gold-deep transition-colors">
          <ChevronRight size={14} />
          <span>חזרה לנכסים</span>
        </Link>
        <div className="flex items-start justify-between gap-3 mt-2">
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-brand-brown">{property.name}</h1>
            <p className="text-xs md:text-sm text-brand-gray-light mt-1 flex items-center gap-1">
              <MapPin size={13} />
              {property.address}, {property.city}
            </p>
          </div>
          <div className="shrink-0 mt-1">
            <StatusBadge status={property.status} />
          </div>
        </div>
      </div>

      {/* ── Gallery + uploader ─────────────────────────── */}
      <PropertyGallery
        propertyId={property.id}
        propertyName={property.name}
        images={(images ?? []).map((im) => ({ id: im.id, url: im.url }))}
        coverUrl={property.cover_image_url}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5 items-start">
        {/* ── Facts ───────────────────────────────── */}
        <div className="lg:col-span-2 bg-white/80 backdrop-blur-xl rounded-3xl border border-white/20 p-5 md:p-6 shadow-xl shadow-black/[0.03]">
          <h2 className="text-base font-bold text-brand-brown mb-4">פרטי הנכס</h2>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-5">
            {facts.map((f) => (
              <div key={f.label}>
                <dt className="text-[11px] text-brand-gray-light flex items-center gap-1">
                  <f.icon size={12} className="text-gold" />
                  {f.label}
                </dt>
                <dd className="text-sm font-bold text-brand-brown mt-1 whitespace-nowrap">{f.value}</dd>
              </div>
            ))}
          </dl>
          {property.notes && (
            <div className="mt-5 pt-4 border-t border-gold/10 flex items-start gap-2">
              <StickyNote size={15} className="text-gold shrink-0 mt-0.5" />
              <p className="text-sm text-brand-gray leading-relaxed">{property.notes}</p>
            </div>
          )}
        </div>

        {/* ── Active lease ───────────────────────────── */}
        <div className="lg:col-span-1">
          {activeLease ? (
            <LeasePanel lease={activeLease} />
          ) : (
            <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-white/20 shadow-xl shadow-black/[0.03]">
              <EmptyState icon={FileText} text="אין חוזה שכירות פעיל בנכס זה" />
            </div>
          )}
        </div>
      </div>

      {/* ── Lease history ─────────────────────────────── */}
      {(leases ?? []).length > 1 && (
        <SectionCard title="היסטוריית חוזים" icon={FileText}>
          <div className="divide-y divide-gold/8">
            {(leases ?? []).map((l) => (
              <div key={l.id} className="p-4 md:px-6 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <span className="font-semibold text-brand-brown">{l.tenant?.full_name}</span>
                  <span className="text-xs text-brand-gray-light mr-2">
                    {heDate(l.start_date)} — {heDate(l.end_date)}
                  </span>
                </div>
                <span className="font-bold text-gold-deep whitespace-nowrap">{ILS(l.monthly_rent)}</span>
              </div>
            ))}
          </div>
        </SectionCard>
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
    <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-white/20 overflow-hidden shadow-xl shadow-black/[0.03]">
      <div className="px-5 py-4 border-b border-gold/10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText size={17} className="text-gold" />
          <h2 className="text-base font-bold text-brand-brown">חוזה שכירות</h2>
        </div>
        <span className={`px-3 py-1 rounded-full text-[11px] font-bold border ${style.text} ${style.bg} ${style.border}`}>
          {style.label(days)}
        </span>
      </div>

      <div className="p-5 space-y-4">
        {/* Tenant */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/15 flex items-center justify-center shrink-0">
            <User size={17} className="text-gold-deep" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-brand-brown text-sm truncate">{lease.tenant?.full_name}</p>
            {lease.tenant?.phone && (
              <p className="text-xs text-brand-gray-light whitespace-nowrap" dir="ltr">{lease.tenant.phone}</p>
            )}
          </div>
          {lease.tenant?.phone && (
            <div className="flex items-center gap-0.5 shrink-0">
              <a href={waLink(lease.tenant.phone)} target="_blank" rel="noreferrer" title="וואטסאפ"
                className="touch-target rounded-xl hover:bg-gold/10 text-brand-gray-light hover:text-green-600 active:scale-95 transition-all">
                <MessageSquare size={18} />
              </a>
              <a href={`tel:${lease.tenant.phone}`} title="התקשר"
                className="touch-target rounded-xl hover:bg-gold/10 text-brand-gray-light hover:text-green-700 active:scale-95 transition-all">
                <Phone size={18} />
              </a>
            </div>
          )}
        </div>

        {/* Term progress */}
        <div>
          <div className="flex items-center justify-between text-[11px] text-brand-gray-light mb-1.5">
            <span>{heDate(lease.start_date)}</span>
            <span>{heDate(lease.end_date)}</span>
          </div>
          <div className="h-2 rounded-full bg-brand-beige/50 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${urgency === 'ok' ? 'bg-green-500' : urgency === 'soon' ? 'bg-amber-400' : 'bg-red-500'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Numbers */}
        <dl className="grid grid-cols-2 gap-x-3 gap-y-4 pt-1">
          <div>
            <dt className="text-[11px] text-brand-gray-light">שכר דירה</dt>
            <dd className="text-base font-bold text-gold-deep whitespace-nowrap mt-0.5">
              {ILS(lease.monthly_rent)}<span className="text-[10px] font-medium text-brand-gray-light"> / חודש</span>
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-brand-gray-light">יום תשלום</dt>
            <dd className="text-sm font-bold text-brand-brown mt-0.5">{lease.payment_day} בחודש</dd>
          </div>
          {lease.deposit != null && (
            <div>
              <dt className="text-[11px] text-brand-gray-light">פיקדון</dt>
              <dd className="text-sm font-bold text-brand-brown whitespace-nowrap mt-0.5">{ILS(lease.deposit)}</dd>
            </div>
          )}
          <div>
            <dt className="text-[11px] text-brand-gray-light">הצמדה למדד</dt>
            <dd className="text-sm font-bold text-brand-brown mt-0.5">{lease.linked_to_cpi ? 'כן' : 'לא'}</dd>
          </div>
        </dl>

        {lease.notes && (
          <div className="pt-3 border-t border-gold/10 flex items-start gap-2">
            <StickyNote size={14} className="text-gold shrink-0 mt-0.5" />
            <p className="text-xs text-brand-gray leading-relaxed">{lease.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
