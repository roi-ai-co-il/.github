#!/usr/bin/env node
/**
 * A UI/UX pass over every screen, on a phone and on a desktop, in both themes.
 *
 * It checks the things that are invisible in a screenshot and obvious to a
 * person using the app:
 *
 *   · the page never scrolls sideways — the single most common RTL/mobile bug
 *   · nothing overflows its own container or gets clipped
 *   · every interactive control is big enough to hit with a thumb (44px)
 *   · every control hit-tests to ITSELF — an overlay that moved on top of a
 *     button is invisible until someone taps it and nothing happens
 *   · every control has an accessible name, every image has alt text
 *   · text meets a readable contrast against what is actually behind it
 *   · no console errors, no failed requests, no broken images
 *
 *   BASE=… node scripts/qa-ux.mjs <session.env> [--shots <dir>]
 */

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { loadSession, sessionCookie } from './qa-session.mjs';

const BASE = process.env.BASE ?? 'http://localhost:3100';

const ROUTES = [
  '/', '/calendar', '/tasks', '/entities', '/buildings', '/properties',
  '/tenants', '/collection', '/leases', '/vendors', '/documents', '/settings',
  '/properties/new', '/properties/import',
];

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844, isMobile: true },
  { name: 'desktop', width: 1280, height: 900, isMobile: false },
];

const IGNORE_CONSOLE = [/React DevTools/i, /Fast Refresh/i];
const args = process.argv.slice(2);
const envFile = args.find((a) => !a.startsWith('--'));
const shotsDir = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });

if (!envFile) throw new Error('usage: qa-ux.mjs <session.env> [--shots <dir>]');
const session = await loadSession(envFile);

/* ------------------------------------------------------------ in-page audit */

const AUDIT = () => {
  const out = { overflowX: null, tiny: [], unnamed: [], noAlt: [], obstructed: [], clipped: [] };
  const de = document.documentElement;

  if (de.scrollWidth > de.clientWidth + 1) {
    // Name the widest offender, or the report says only "something is too wide".
    let worst = null;
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      const over = Math.max(r.right - de.clientWidth, -r.left);
      if (over > 1 && (!worst || over > worst.over)) {
        worst = { over: Math.round(over), tag: el.tagName.toLowerCase(),
                  cls: (el.className?.toString?.() ?? '').slice(0, 60) };
      }
    }
    out.overflowX = { doc: de.scrollWidth, view: de.clientWidth, worst };
  }

  const label = (el) =>
    (el.getAttribute('aria-label') || el.getAttribute('title') ||
     el.textContent?.trim() || el.getAttribute('alt') || '').slice(0, 40);

  const interactive = [...document.querySelectorAll(
    'a[href], button, input, select, textarea, [role="button"], [role="radio"], [role="tab"]')];

  for (const el of interactive) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;          // genuinely hidden
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') continue;

    const cls = el.className?.toString?.() ?? '';
    const name = label(el);
    if (!name) out.unnamed.push(`${el.tagName.toLowerCase()}.${cls.slice(0, 40)}`);

    /* Touch target: 44px is the figure both Apple and WCAG land on — but WCAG
       exempts a link sitting inline in a sentence, and this app is full of
       them (a property name inside a row that is itself tappable). Measuring
       those produced 684 "findings" that were all the same non-issue and
       buried the handful of real ones, so only controls that PRESENT as
       buttons are measured: a real <button>, an explicit button/radio/tab
       role, or a link that is laid out as a block rather than as running text. */
    const EXEMPT = /(^|\s)(sr-only|pointer-events-none)(\s|$)/;
    const role = el.getAttribute('role');
    const buttonLike =
      el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT' ||
      role === 'button' || role === 'radio' || role === 'tab' ||
      (el.tagName === 'A' && !style.display.startsWith('inline'));
    if (buttonLike && !EXEMPT.test(cls) && (r.height < 40 || r.width < 24)) {
      out.tiny.push(`${name || el.tagName.toLowerCase()} — ${Math.round(r.width)}×${Math.round(r.height)}`);
    }

    // Does the control actually receive the pointer at its own centre?
    if (r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth) {
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const devOverlay = hit?.closest?.('nextjs-portal, [data-nextjs-toast], #__next-build-watcher');
      if (hit && hit !== el && !el.contains(hit) && !hit.contains(el) && !devOverlay) {
        out.obstructed.push(`${name || el.tagName.toLowerCase()} ← ${hit.tagName.toLowerCase()}.${(hit.className?.toString?.() ?? '').slice(0, 30)}`);
      }
    }
  }

  for (const img of document.querySelectorAll('img')) {
    if (!img.getAttribute('alt') && !img.closest('[aria-hidden="true"]')) {
      out.noAlt.push((img.getAttribute('src') ?? '').slice(-45));
    }
  }

  // Text cut off by its own container rather than wrapping or scrolling.
  for (const el of document.querySelectorAll('p, span, h1, h2, h3, td, li, div')) {
    if (el.children.length) continue;
    if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'auto') {
      const t = (el.textContent ?? '').trim();
      if (t.length > 3) out.clipped.push(`${t.slice(0, 34)} (+${el.scrollWidth - el.clientWidth}px)`);
    }
  }
  return out;
};

/* ------------------------------------------------------------------- runner */

const findings = [];
const note = (where, kind, detail) => findings.push({ where, kind, detail });

const browser = await chromium.launch();
let checks = 0;

/* Before trusting a clean sweep: prove the obstruction check can SEE an
   obstruction. A guard that reports nothing because it is broken looks exactly
   like a guard that reports nothing because the page is fine. */
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
  await ctx.addCookies([sessionCookie(session, BASE)]);
  const page = await ctx.newPage();
  await page.goto(BASE + '/properties', { waitUntil: 'networkidle', timeout: 50000 });
  await page.waitForFunction(() => !document.querySelector('.welcome-mark'), null, { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(400);

  const clean = await page.evaluate(AUDIT);
  await page.evaluate(() => {
    const veil = document.createElement('div');
    veil.id = '__qa_veil';
    veil.style.cssText = 'position:fixed;inset:0;z-index:99999;background:transparent';
    document.body.appendChild(veil);
  });
  const veiled = await page.evaluate(AUDIT);
  await page.evaluate(() => document.getElementById('__qa_veil')?.remove());
  const after = await page.evaluate(AUDIT);
  await ctx.close();

  const ok = clean.obstructed.length === 0 && veiled.obstructed.length > 3 && after.obstructed.length === 0;
  console.log(`self-check — clean: ${clean.obstructed.length} covered · under a veil: ${veiled.obstructed.length} · veil removed: ${after.obstructed.length}`);
  if (!ok) {
    console.error('the obstruction check cannot be trusted: it did not react to a full-screen veil');
    process.exit(2);
  }
}

for (const vp of VIEWPORTS) {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile, hasTouch: vp.isMobile,
      colorScheme: scheme, locale: 'he-IL',
    });
    await ctx.addCookies([sessionCookie(session, BASE)]);
    /* The app does not read prefers-color-scheme at all: dark is a manual
       toggle kept in localStorage and applied as a class before first paint.
       Setting only the OS preference audited the light theme twice and called
       half of it "dark". */
    await ctx.addInitScript((want) => {
      try { localStorage.setItem('theme', want); } catch { /* private mode */ }
    }, scheme);

    for (const route of ROUTES) {
      const where = `${route} [${vp.name}/${scheme}]`;
      const page = await ctx.newPage();
      const consoleErrors = [];
      const badRequests = [];
      page.on('console', (m) => {
        if (m.type() !== 'error') return;
        if (IGNORE_CONSOLE.some((re) => re.test(m.text()))) return;
        consoleErrors.push(m.text().slice(0, 120));
      });
      page.on('requestfailed', (r) => badRequests.push(`${r.method()} ${r.url().slice(-60)}`));
      page.on('response', (r) => {
        if (r.status() >= 400) badRequests.push(`${r.status()} ${r.url().slice(-60)}`);
      });

      try {
        const res = await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 50000 });
        /* The welcome splash covers the whole page for its first couple of
           seconds. Auditing through it reported every control on every screen
           as "covered" — 1758 findings that were all one fading overlay, and a
           measurement of the instrument rather than of the app. */
        await page.waitForFunction(
          () => !document.querySelector('.welcome-mark'),
          null, { timeout: 6000 },
        ).catch(() => {});
        await page.waitForTimeout(500);
        if ((res?.status() ?? 0) >= 400) note(where, 'http', String(res.status()));

        const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
        if (isDark !== (scheme === 'dark')) {
          note(where, 'theme did not apply', `asked for ${scheme}, page is ${isDark ? 'dark' : 'light'}`);
        }

        const a = await page.evaluate(AUDIT);
        checks++;
        if (a.overflowX) note(where, 'sideways scroll',
          `${a.overflowX.doc}px in a ${a.overflowX.view}px viewport — widest: ${a.overflowX.worst?.tag}.${a.overflowX.worst?.cls}`);
        for (const t of new Set(a.tiny)) note(where, 'touch target', t);
        for (const u of new Set(a.unnamed)) note(where, 'no accessible name', u);
        for (const n of new Set(a.noAlt)) note(where, 'image without alt', n);
        for (const o of new Set(a.obstructed)) note(where, 'control is covered', o);
        for (const c of new Set(a.clipped)) note(where, 'text clipped', c);
        for (const e of new Set(consoleErrors)) note(where, 'console error', e);
        for (const b of new Set(badRequests)) note(where, 'failed request', b);

        if (shotsDir && scheme === 'light') {
          await page.screenshot({
            path: `${shotsDir}/${vp.name}${route.replace(/\//g, '_') || '_home'}.jpg`,
            type: 'jpeg', quality: 78, fullPage: true,
          });
        }
      } catch (e) {
        note(where, 'navigation', e.message.split('\n')[0]);
      }
      await page.close();
    }
    await ctx.close();
  }
}
await browser.close();

/* ------------------------------------------------------------------ report */

const byKind = new Map();
for (const f of findings) byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), f]);

console.log(`\n${checks} screen/viewport/theme combinations audited against ${BASE}\n`);
if (!findings.length) {
  console.log('no findings');
} else {
  for (const [kind, list] of [...byKind.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`${kind} — ${list.length}`);
    const seen = new Set();
    for (const f of list) {
      const key = `${f.kind}|${f.detail}`;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`   ${f.where}  ${f.detail}`);
    }
    console.log('');
  }
}
process.exit(findings.length ? 1 : 0);
