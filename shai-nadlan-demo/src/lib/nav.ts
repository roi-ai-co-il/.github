import {
  LayoutGrid, CalendarDays, CircleCheck, Users, Building, Building2,
  UserRound, CircleDollarSign, FileText, Hammer, Wrench, FolderOpen,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * The one list of screens.
 *
 * There used to be three copies of it — the sidebar, the nav bar's titles, and
 * the ⌘K palette — and the third was already out of date twice over. A screen
 * that exists but is missing from one of those copies is invisible to whoever
 * happened to use that route in; תיקונים was added to the sidebar and could
 * not be found in search at all. Everything derives from here now, so a new
 * entry reaches all three at once.
 *
 * `onPhone` marks the four the bottom bar can hold; everything else lives
 * behind עוד, in these same groups. Nothing is reachable on the desktop and
 * unreachable on the phone.
 */
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  onPhone: boolean;
  /** What the palette shows under the label, and what it searches on. */
  hint: string;
  keywords: string;
}

export const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  { title: 'כללי', items: [
    { href: '/', label: 'בית', icon: LayoutGrid, onPhone: true,
      hint: 'מסך הבית', keywords: 'בית דשבורד ראשי סקירה' },
    { href: '/calendar', label: 'יומן', icon: CalendarDays, onPhone: true,
      hint: 'תשלומים, סופי חוזה ומשימות', keywords: 'יומן לוח שנה תאריכים' },
    { href: '/tasks', label: 'משימות', icon: CircleCheck, onPhone: true,
      hint: 'מה פתוח', keywords: 'משימות טודו לעשות' },
  ]},
  { title: 'התיק', items: [
    { href: '/entities', label: 'ישויות', icon: Users, onPhone: false,
      hint: 'מי מחזיק במה', keywords: 'ישויות חברות בעלות מחזיק' },
    { href: '/buildings', label: 'אתרים', icon: Building, onPhone: false,
      hint: 'בניינים ומתחמים', keywords: 'אתרים בניינים מתחם' },
    { href: '/properties', label: 'נכסים', icon: Building2, onPhone: true,
      hint: 'רשימת הנכסים המלאה', keywords: 'נכסים רשימה דירות' },
    { href: '/tenants', label: 'שוכרים', icon: UserRound, onPhone: false,
      hint: 'כל הדיירים', keywords: 'שוכרים דיירים' },
  ]},
  { title: 'תזרימים', items: [
    { href: '/collection', label: 'גבייה', icon: CircleDollarSign, onPhone: false,
      hint: 'מי חייב לי החודש',
      keywords: 'גבייה לגבות חוב חייב תשלום שכד שכר דירה כסף' },
    { href: '/leases', label: 'חוזים', icon: FileText, onPhone: false,
      hint: 'כל חוזי השכירות', keywords: 'חוזים שכירות רשימה' },
  ]},
  { title: 'אחזקה', items: [
    { href: '/repairs', label: 'תיקונים', icon: Hammer, onPhone: false,
      hint: 'מה התקלקל, מי תיקן ומי שילם',
      keywords: 'תיקון תיקונים נזילה תקלה חשמלאי אינסטלטור מזגן שיפוץ הוצאה עלות מי משלם דייר רווח' },
    { href: '/vendors', label: 'בעלי מקצוע', icon: Wrench, onPhone: false,
      hint: 'אינסטלטור, חשמלאי, מזגנים',
      keywords: 'בעלי מקצוע אינסטלטור חשמלאי מזגן תיקון קבלן ספק טלפון' },
  ]},
  { title: 'ארכיון', items: [
    { href: '/documents', label: 'מסמכים', icon: FolderOpen, onPhone: false,
      hint: 'כל המסמכים של כל הנכסים',
      keywords: 'מסמכים ארכיון קבצים חוזה קבלה ענן' },
  ]},
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
