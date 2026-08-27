import { test, expect, type Page } from '@playwright/test';

// A real Supabase session cookie, injected instead of driving the login form:
// in a network-restricted CI sandbox the browser may not be able to reach
// Supabase directly, while the Node server can. See e2e/README.md for how to
// mint the cookie.
const COOKIE_VALUE = process.env.E2E_SESSION_COOKIE;
const COOKIE_NAME = process.env.E2E_COOKIE_NAME ?? 'sb-thmkokzalrgwzhdbiabi-auth-token';

test.skip(!COOKIE_VALUE, 'E2E_SESSION_COOKIE is not set — see e2e/README.md');

async function authenticate(page: Page) {
  await page.context().addCookies([
    { name: COOKIE_NAME, value: COOKIE_VALUE!, domain: 'localhost', path: '/' },
  ]);
}

/**
 * The welcome overlay covers the screen for its first couple of seconds, which
 * would swallow the clicks in these tests. It keys off sessionStorage, so
 * marking the session as greeted skips it — exactly what a returning user gets.
 * The overlay itself is covered by its own test below.
 */
async function skipWelcome(page: Page) {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('welcomed', '1');
    } catch {}
  });
}

test.beforeEach(async ({ page }) => {
  await authenticate(page);
  await skipWelcome(page);
});

test('welcome greets Shai by name, then gets out of the way', async ({ page, context }) => {
  // This one wants the real first-visit behaviour.
  await context.clearCookies();
  await authenticate(page);
  const fresh = await context.newPage();
  await fresh.goto('/');

  const welcome = fresh.getByRole('status');
  await expect(welcome).toBeVisible();
  await expect(welcome).toContainText('שי');

  // It clears on its own rather than needing a dismissal.
  await expect(welcome).toBeHidden({ timeout: 6000 });
  await expect(fresh.getByRole('heading', { name: 'סקירה' })).toBeVisible();
  await fresh.close();
});

test('dashboard shows portfolio totals and lease-expiry alerts', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'סקירה' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'דורש טיפול' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'התיק' })).toBeVisible();
  await expect(page.getByText('שווי', { exact: true })).toBeVisible();
  await expect(page.getByText('₪', { exact: false }).first()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  // Ignore image loads: the sandbox proxy blocks the browser reaching the CDN.
  expect(errors.filter((e) => !/image|unsplash|404/i.test(e))).toEqual([]);
});

test('properties grid lists the portfolio, filters and searches', async ({ page }) => {
  await page.goto('/properties');
  await expect(page.getByText('21 נכסים בתיק')).toBeVisible();

  const cards = page.locator('a[href^="/properties/2"]');
  await expect(cards).toHaveCount(21);

  await page.getByRole('button', { name: 'פנויים' }).click();
  await expect(cards).toHaveCount(1);

  await page.getByRole('button', { name: 'הכל' }).click();
  await expect(cards).toHaveCount(21);

  await page.getByLabel('חיפוש נכס').fill('חיפה');
  await expect(cards).toHaveCount(2);

  // The clear button appears with text and empties the field.
  await page.getByLabel('נקה חיפוש').click();
  await expect(cards).toHaveCount(21);
});

test('property detail shows facts, gallery and the active lease', async ({ page }) => {
  await page.goto('/properties/20000000-0000-4000-8000-000000000001');
  await expect(page.getByRole('heading', { name: 'דירת 4 חד׳ ברוטשילד' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'פרטי הנכס' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'חוזה שכירות' })).toBeVisible();
  await expect(page.getByText('דניאל כהן')).toBeVisible();
  await expect(page.getByRole('button', { name: 'הוסף תמונות' })).toBeVisible();
});

test('deleting a gallery image asks first', async ({ page }) => {
  await page.goto('/properties/20000000-0000-4000-8000-000000000001');

  // Selecting a thumbnail reveals its delete affordance — on touch too, where
  // there is no hover to reveal it.
  await page.getByRole('button', { name: 'תמונה 2', exact: true }).click();
  await page.getByRole('button', { name: 'מחק תמונה 2' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('למחוק את התמונה?');

  // Cancelling leaves the gallery untouched — nothing irreversible on one tap.
  await dialog.getByRole('button', { name: 'ביטול' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'תמונה 2', exact: true })).toBeVisible();
});

test('leases page groups by urgency', async ({ page }) => {
  await page.goto('/leases');
  await expect(page.getByRole('heading', { name: 'חוזים', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'דורש טיפול' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'תקינים' })).toBeVisible();
});

test('new property form validates required fields', async ({ page }) => {
  await page.goto('/properties/new');
  await page.getByRole('button', { name: 'שמור נכס' }).click();
  await expect(page.getByText('שם הנכס חובה')).toBeVisible();
  await expect(page.getByText('כתובת חובה')).toBeVisible();
  await expect(page.getByText('עיר חובה')).toBeVisible();
});

test('no horizontal page scroll at any width', async ({ page }) => {
  for (const width of [320, 375, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    for (const path of ['/', '/properties', '/leases']) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} @ ${width}px scrolls horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
    }
  }
});
