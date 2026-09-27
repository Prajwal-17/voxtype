import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
type ApiModule = typeof import('../../src/lib/api');
const captures = '../../.impeccable/review';
test('first run, navigation, settings and overlay are usable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dictation' })).toBeVisible();
  await expect(page.getByText('Browser preview ·')).toBeVisible();
  const shortcuts = page.locator('kbd[data-shortcut][data-slot="kbd"]');
  expect(await shortcuts.count()).toBeGreaterThanOrEqual(2);
  await expect(shortcuts.first()).toHaveText('Right Alt');
  await expect(shortcuts.first()).toHaveCSS('user-select', 'none');
  await expect(page.getByRole('button', { name: 'Set up dictation' })).toHaveCSS(
    'color',
    'rgb(246, 246, 242)',
  );
  await expect(page.getByRole('button', { name: 'Set up dictation' })).toHaveCSS(
    'background-color',
    'rgb(70, 73, 68)',
  );
  await mkdir(captures, { recursive: true });
  await page.screenshot({ path: `${captures}/desktop.png`, fullPage: false });
  await page.getByRole('button', { name: 'Preview overlay' }).click();
  await expect(page.getByText('Overlay preview · Idle')).toBeVisible();
  await page.screenshot({ path: `${captures}/overlay-preview.png`, fullPage: false });
  await page.getByRole('button', { name: 'Close preview' }).click();
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No dictations yet' })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Search history' })).toBeDisabled();
  await page.screenshot({ path: `${captures}/history.png`, fullPage: false });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  const deepgramKey = page.getByLabel('Deepgram API key', { exact: true });
  await deepgramKey.fill('not-a-real-api-key');
  await expect(deepgramKey).toHaveAttribute('type', 'password');
  await deepgramKey.locator('..').getByRole('button', { name: 'Show API key' }).click();
  await expect(deepgramKey).toHaveAttribute('type', 'text');
  await deepgramKey.fill('');
  await page.getByRole('switch', { name: 'Paste when I finish' }).click();
  await expect(page.getByText('You have unsaved changes.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save preferences' })).toBeDisabled();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${captures}/settings.png`, fullPage: false });
  await page.getByRole('heading', { name: 'Personal vocabulary' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${captures}/settings-lower.png`, fullPage: false });
  await page.setViewportSize({ width: 760, height: 650 });
  await page.getByRole('button', { name: 'Dictation', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${captures}/compact-desktop.png`, fullPage: false });
  expect(errors).toEqual([]);
});
test('overlay window has transparent background and reduced motion support', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 336, height: 80 });
  await page.goto('/?window=overlay');
  await expect(page.getByRole('button', { name: 'Finish dictation' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dismiss overlay' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Not recording');
  await expect(page.getByText('Ready')).toBeVisible();
  const overlay = page.getByLabel('Voice recording controls');
  await expect(overlay).toHaveCSS('width', '320px');
  await expect(overlay).toHaveCSS('height', '64px');
  await expect(overlay).toHaveClass(/rounded-full/);
  const meter = page.getByRole('meter', { name: 'Microphone level' });
  await expect(meter).toHaveCSS('width', '96px');
  await expect(meter.locator('span')).toHaveCount(19);
  await expect(page.getByRole('button', { name: 'Dismiss overlay' })).toHaveCSS('width', '32px');
  expect(await overlay.boundingBox()).toMatchObject({ x: 8, y: 8, width: 320, height: 64 });
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
    'rgba(0, 0, 0, 0)',
  );
  await page.screenshot({ path: `${captures}/overlay-idle.png` });
  await page.evaluate(async () => {
    // @ts-expect-error Vite resolves this browser-only module path during the test.
    const { queryClient } = (await import('/src/lib/api.ts')) as ApiModule;
    queryClient.setQueryData(['session'], {
      sessionId: 'overlay-review',
      phase: 'listening',
      text: '',
      interim: '',
      level: 0.62,
      speechActive: true,
      elapsedMs: 3200,
      message: '',
      delivery: '',
      isTest: false,
    });
  });
  await expect(page.getByText('Speech detected')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel dictation' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Finish dictation' })).toBeEnabled();
  await page.screenshot({ path: `${captures}/overlay.png` });
});

test('review evidence covers compact help, filtering, and recovery states', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 650 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Dictation', exact: true }).hover();
  await expect(page.getByRole('tooltip')).toHaveText('Dictation');
  await page.screenshot({ path: `${captures}/compact-tooltip.png`, fullPage: false });

  await page.setViewportSize({ width: 1100, height: 800 });
  await page.evaluate(async () => {
    // @ts-expect-error Vite resolves this browser-only module path during the test.
    const { queryClient } = (await import('/src/lib/api.ts')) as ApiModule;
    queryClient.setQueryData(
      ['history'],
      [
        {
          id: 'one',
          text: 'Alpha project planning notes',
          createdAt: Date.now(),
          durationMs: 18000,
          words: 4,
          delivery: 'copied',
        },
        {
          id: 'two',
          text: 'Beta meeting follow-up',
          createdAt: Date.now() - 60000,
          durationMs: 12000,
          words: 3,
          delivery: 'pasted',
        },
      ],
    );
  });
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search history' }).fill('alpha');
  await expect(page.getByText('1 of 2 dictations')).toBeVisible();
  await page.screenshot({ path: `${captures}/history-filtered.png`, fullPage: false });

  await page.evaluate(async () => {
    // @ts-expect-error Vite resolves this browser-only module path during the test.
    const { queryClient } = (await import('/src/lib/api.ts')) as ApiModule;
    const query = queryClient.getQueryCache().find({ queryKey: ['history'] });
    if (!query) throw new Error('History query is missing');
    query.setState({
      ...query.state,
      data: undefined,
      error: new Error('Synthetic history failure'),
      errorUpdatedAt: Date.now(),
      fetchStatus: 'idle',
      status: 'error',
    });
  });
  await expect(page.getByRole('heading', { name: 'History couldn’t load' })).toBeVisible();
  await expect(
    page.getByText('Flow couldn’t read your local history. Nothing was deleted.'),
  ).toBeVisible();
  await page.screenshot({ path: `${captures}/history-error.png`, fullPage: false });
});
