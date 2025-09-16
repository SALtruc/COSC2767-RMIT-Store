import { test, expect, Page, Locator } from '@playwright/test';

test.use({ video: 'on', trace: 'retain-on-failure' });

const USE_HASH = process.env.USE_HASH === '1';
const BASE_PATH = process.env.BASE_PATH || '';
function gotoPath(path: string) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return USE_HASH ? `/#${BASE_PATH}${p}` : `${BASE_PATH}${p}`;
}
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@rmit.edu.vn';
const ADMIN_PASS  = process.env.ADMIN_PASS  || 'ChangeMe123!';

async function findByTextWithScroll(page: Page, text: string, containerSel = 'main', maxScrolls = 30) {
  const container = page.locator(containerSel).first();
  const target = container.locator(`text="${text}"`).first();
  for (let i = 0; i < maxScrolls; i++) {
    if (await target.isVisible().catch(() => false)) return target;
    await container.evaluate(el => el.scrollBy(0, 1200)).catch(async () => page.mouse.wheel(0, 1200));
    await page.waitForTimeout(200);
  }
  return target; 
}

async function pickNthOptionNearLabel_RS(page: Page, labelRe: RegExp, n: number) {
  const box = page.locator('.select-box', {
    has: page.locator('label', { hasText: labelRe })
  }).first();

  await expect(box, `Không thấy .select-box với label ${labelRe}`).toBeVisible({ timeout: 10000 });

  const control = box.locator('.react-select__control').first();
  await expect(control, 'Không thấy react-select control').toBeVisible({ timeout: 10000 });

  await control.click({ force: true });

  const menu = page.locator('.react-select__menu').first();
  await expect(menu, 'Dropdown menu không mở').toBeVisible({ timeout: 10000 });

  const options = menu.locator('.react-select__option')
    .filter({ hasNotText: /^\s*(No option selected|Select.*)\s*$/i });

  await expect(options.nth(n), `Không tìm thấy option thứ ${n + 1}`).toBeVisible({ timeout: 10000 });
  await options.nth(n).click();
}

async function getDeleteBtnForProduct(page: Page, name: string): Promise<Locator> {
  const row = page.locator(
    `tr:has-text("${name}"), .product-row:has-text("${name}"), .product-item:has-text("${name}"), .card:has-text("${name}"), li:has-text("${name}")`
  ).first();
  if (await row.isVisible().catch(() => false)) {
    const del = row.locator(
      'button:has-text("Delete"), a:has-text("Delete"), [aria-label*="delete" i], [data-testid*="delete" i], [class*="trash"], .fa-trash'
    ).first();
    if (await del.isVisible().catch(() => false)) return del;

    const link = row.getByRole('link', { name: new RegExp(name, 'i') }).first()
      .or(row.locator('a[href*="/dashboard/product"]').first())
      .or(row.locator('a').first());
    if (await link.isVisible().catch(() => false)) {
      await Promise.all([
        page.waitForLoadState('networkidle').catch(() => {}),
        link.click({ force: true })
      ]);
    } else {
      await row.click({ force: true });
    }
  } else {
    await page.getByRole('link', { name: new RegExp(name, 'i') }).first().click({ force: true });
  }

  await expect(
    page.getByRole('heading', { name: new RegExp(name, 'i') }).first()
      .or(page.getByText(new RegExp(`^\\s*${name}\\s*$`, 'i')).first())
  ).toBeVisible({ timeout: 10000 });

  return page.locator(
    'button:has-text("Delete"), a:has-text("Delete"), [aria-label*="delete" i], [data-testid*="delete" i], [class*="trash"], .fa-trash'
  ).first();
}

test.describe('ADMIN • add product then delete it', () => {
  test('Sign out → Sign in → Add Product → Verify last → Delete', async ({ page }, testInfo) => {

    // 0) Ensure we start from login (sign out if needed)
    await page.goto(gotoPath('/dashboard'));
    if (await page.getByText(/Account Details/i).isVisible().catch(() => false)) {
      const adminMenu = page.getByRole('link', { name: /admin/i }).first()
        .or(page.locator('button:has-text("admin")').first());
      if (await adminMenu.isVisible().catch(() => false)) {
        await adminMenu.click().catch(() => {});
        const logout = page.getByRole('menuitem', { name: /log\s*out|sign\s*out/i }).first()
          .or(page.locator('a:has-text("Logout"), a:has-text("Sign Out"), button:has-text("Logout")').first());
        if (await logout.isVisible().catch(() => false)) await logout.click();
      }
    }

    await page.goto(gotoPath('/login'));
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
    const box = page.locator('.login-form'); 
    await box.getByPlaceholder('Enter Your Email Address').fill('admin@rmit.edu.vn'); 
    await box.getByPlaceholder('Enter Your Password').fill('ChangeMe123!'); 
    await Promise.all([
      page.waitForLoadState('networkidle'),
      page.getByRole('button', { name: /sign in/i }).click()
    ]);

    // 2) Go to Dashboard → Products
    await page.goto(gotoPath('/dashboard/product'));
    await expect(page.getByRole('heading', { name: /products/i })).toBeVisible();

    // 3) Click Add
    const addBtn = page.getByRole('link', { name: /^add$/i }).first()
      .or(page.getByRole('button', { name: /^add$/i }).first());
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // 4) Fill Add Product form 
    const ts = Date.now();
    const sku  = `SKU-E2E-${ts}`;
    const name = `E2E Product ${ts}`;
    const desc = `E2E description ${ts}`;
    const qty  = '2';
    const price = '19.99';

    await expect(page.getByRole('heading', { name: /add product/i })).toBeVisible();
    await page.getByPlaceholder('Product Sku').fill(sku);
    await page.getByPlaceholder('Product Name').fill(name);
    await page.getByPlaceholder('Product Description').fill(desc);

    const qtyInput = page.locator(
    '.input-box:has(> label:has-text("Quantity")) input[type="number"], ' + 
    'input[name="quantity"], ' +                                           
    'input[placeholder*="Product Quantity"]'                               
    ).first();

    await expect(qtyInput).toBeVisible();
    await qtyInput.click({ force: true });
    await qtyInput.press('ControlOrMeta+a'); 
    await qtyInput.type(qty, { delay: 20 });

    const priceInput = page.locator(
    '.input-box:has(> label:has-text("Price")) input[type="number"], ' +   
    'input[name="price"], ' +                                              
    'input[placeholder*="Product Price"]'                                 
    ).first();

    await expect(priceInput).toBeVisible();
    await priceInput.click({ force: true });
    await priceInput.press('ControlOrMeta+a');
    await priceInput.type(price, { delay: 20 });

    await pickNthOptionNearLabel_RS(page, /Select Brand/i , 1);   

    // 5) Save
    const saveBtn = page.locator(
      'button:has-text("Save"), [type="submit"]:has-text("Save"), ' +
      'button:has-text("Add Product"), [type="submit"]:has-text("Add Product"), ' +
      'button:has-text("Create"), [type="submit"]:has-text("Create")'
    ).first();
    await expect(saveBtn).toBeVisible();
    await Promise.all([page.waitForLoadState('networkidle'), saveBtn.click()]);

    if (!/\/dashboard\/product(\b|$)/.test(page.url())) {
      await page.goto(gotoPath('/dashboard/product'));
    }
    await expect(page.getByRole('heading', { name: /products/i })).toBeVisible();

    // 6) Find the product in list (scroll if needed), take a screenshot
    const hit = await findByTextWithScroll(page, name, 'main');
    await expect(hit, `Could not find created product "${name}" in list`).toBeVisible();

    const card = hit.locator('..'); 
    try {
      await card.scrollIntoViewIfNeeded();
      const img = await card.screenshot();
      await testInfo.attach('created-product', { body: img, contentType: 'image/png' });
    } catch {
      const img = await page.screenshot({ fullPage: true });
      await testInfo.attach('created-product-fallback', { body: img, contentType: 'image/png' });
    }

    // 7) Open the product or find its Delete on the row
    await hit.scrollIntoViewIfNeeded();
    await expect(hit).toBeVisible();

    const href = await hit.evaluate(el => el.closest('a')?.getAttribute('href') || null);

    if (href) {
    await Promise.all([
        page.waitForURL(/\/dashboard\/product\/edit\//, { timeout: 10000 }).catch(() => {}),
        page.locator(`a[href="${href}"]`).click({ force: true })
    ]);
    } else {

    await Promise.all([
        page.waitForURL(/\/dashboard\/product\/edit\//, { timeout: 10000 }).catch(() => {}),
        hit.click({ force: true })
    ]);
    }

    const deleteBtn = page.getByRole('button', { name: /^delete$/i }).first()
    .or(page.locator('button:has-text("Delete")').first());

    await expect(deleteBtn).toBeVisible({ timeout: 10000 });
    page.once('dialog', d => d.accept().catch(() => {}));
    await deleteBtn.click().catch(() => {});

    // 8) Back on list and verify it’s gone
    await page.goto(gotoPath('/dashboard/product'));
    const gone = await findByTextWithScroll(page, name, 'main', 10);
    await expect(gone, `Product "${name}" still visible after delete`).toHaveCount(0);
  });
});
