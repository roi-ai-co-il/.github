import type { Metadata, Viewport } from 'next';
import { Heebo } from 'next/font/google';
import './globals.css';

const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-heebo',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'שי עובדיה · ניהול נדל״ן',
    template: '%s · שי עובדיה נדל״ן',
  },
  description: 'מערכת ניהול תיק הנדל״ן של שי עובדיה — נכסים, שוכרים וחוזים במקום אחד.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#FFFFFF',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body className={`${heebo.variable} antialiased`}>
        {/* Applies the saved theme before first paint so there is no light flash. */}
        <script src="/theme-init.js" />
        {children}
      </body>
    </html>
  );
}
