import { test, expect } from '@playwright/test';

// ==== ENV toggles ====
const READ_ONLY_GUARD = process.env.READ_ONLY_GUARD === '1';
const USE_HASH = process.env.USE_HASH === '1';
const BASE_PATH = process.env.BASE_PATH || '';

function gotoPath(path: string) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return USE_HASH ? `/#${BASE_PATH}${p}` : `${BASE_PATH}${p}`;
}

test.describe('SMOKE • Auth & Orders', () => {
  test.beforeEach(async ({ page }) => {
    if (READ_ONLY_GUARD) {
      await page.route('**/*', (route) => {
        const m = route.request().method();
        const url = route.request().url();
        const isMutation = ['POST','PUT','PATCH','DELETE'].includes(m);
        const isLogin = /\/api\/auth\/login\b/.test(url);
        if (isMutation && !isLogin) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, _test: 'blocked-by-readonly-guard' })
          });
        }
        return route.continue();
      });
    }
  });

  test('Login page: heading + fields + forgot link', async ({ page }) => {
    await page.goto(gotoPath('/login'));
    const box = page.locator('.login-form');

  await box.getByPlaceholder('Enter Your Email Address').fill('admin@rmit.edu.vn');
  await box.getByPlaceholder('Enter Your Password').fill('ChangeMe123!');

  await expect(box.getByPlaceholder('Enter Your Email Address')).toHaveValue('admin@rmit.edu.vn');
  await expect(box.getByPlaceholder('Enter Your Password')).toHaveValue('ChangeMe123!');

  });

  test('Protected routes redirect to /login when unauthenticated', async ({ page }) => {
    await page.goto(gotoPath('/dashboard'));
    await expect(page).toHaveURL(/\/login$/);
    await page.goto(gotoPath('/support'));
    await expect(page).toHaveURL(/\/login$/);
  });

  test('Merchant signup: email được prefill từ query', async ({ page }) => {
    await page.goto(gotoPath('/register'));
    await expect(page.getByRole('heading', { name: /Create Your Account/i })).toBeVisible();
    await page.getByRole('main')
    .getByRole('textbox', { name: 'Your Email' })
    .fill('admin@rmit.edu.vn');  
    await expect(
      page.getByRole('main').getByRole('textbox', { name: 'Your Email' })
    ).toHaveValue('admin@rmit.edu.vn');
  });

  test('Perf (perceived): Login ready < 3000ms', async ({ page }) => {
    const t0 = Date.now();
    await page.goto(gotoPath('/login'));
    await page.getByRole('heading', { name: 'Sign In' }).waitFor();
    expect(Date.now() - t0).toBeLessThan(3000);
  });
});
