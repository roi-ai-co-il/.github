import { Phone } from 'lucide-react';
import { waLink } from '@/lib/format';

/** The real WhatsApp glyph — a generic chat icon reads as "message",
    this reads as WhatsApp. */
export function WhatsAppIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2zm5 13.8c-.2.7-1.3 1.3-1.9 1.3-.5.1-1.1.1-1.8-.1-2.5-.8-4.9-3-6.1-5.4-.4-.8-.7-1.7-.5-2.4.1-.6.8-1.6 1.4-1.7h.7c.2 0 .5 0 .7.6l1 2.1c.1.2 0 .5-.1.6l-.6.8c-.1.2-.2.4 0 .7.4.7 1.7 2 3 2.6.3.1.5.1.7-.1l.8-.9c.2-.2.4-.3.7-.2l2 1c.3.1.4.3.4.5-.1.2-.2.4-.4.6z" />
    </svg>
  );
}

/**
 * Call + WhatsApp for a tenant, used beside every property and lease.
 * `compact` renders two round icon buttons for cards and rows; the full
 * form renders labeled pills for detail panels.
 */
export default function ContactButtons({
  phone,
  name,
  compact = false,
}: {
  phone: string;
  name?: string;
  compact?: boolean;
}) {
  const waTitle = name ? `וואטסאפ ל${name}` : 'וואטסאפ';
  const telTitle = name ? `חיוג ל${name}` : 'חיוג';

  if (compact) {
    return (
      <span className="flex items-center gap-2 shrink-0">
        <a
          href={waLink(phone)}
          target="_blank"
          rel="noreferrer"
          title={waTitle}
          aria-label={waTitle}
          className="press flex items-center justify-center w-10 h-10 rounded-full bg-[#25D366] text-white shadow-sm"
        >
          <WhatsAppIcon size={19} />
        </a>
        <a
          href={`tel:${phone}`}
          title={telTitle}
          aria-label={telTitle}
          className="press flex items-center justify-center w-10 h-10 rounded-full bg-accent-tint text-accent"
        >
          <Phone size={17} strokeWidth={2.2} />
        </a>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <a
        href={waLink(phone)}
        target="_blank"
        rel="noreferrer"
        className="press flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#25D366] text-white text-[14px] font-semibold"
      >
        <WhatsAppIcon size={17} />
        <span>וואטסאפ</span>
      </a>
      <a
        href={`tel:${phone}`}
        className="press flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-accent-tint text-accent text-[14px] font-semibold"
      >
        <Phone size={16} strokeWidth={2.2} />
        <span>חיוג</span>
      </a>
    </span>
  );
}
