import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'שי עובדיה · ניהול נדל״ן',
    short_name: 'שי עובדיה',
    description: 'מערכת ניהול תיק הנדל״ן של שי עובדיה',
    start_url: '/',
    display: 'standalone',
    background_color: '#FFFFFF',
    theme_color: '#007AFF',
    lang: 'he',
    dir: 'rtl',
    icons: [
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
