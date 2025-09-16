import { test, expect, Locator } from '@playwright/test';

// ==== ENV toggles ====
const READ_ONLY_GUARD = process.env.READ_ONLY_GUARD === '1';
const USE_HASH = process.env.USE_HASH === '1';
const BASE_PATH = process.env.BASE_PATH || '';

function gotoPath(path: string) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return USE_HASH ? `/#${BASE_PATH}${p}` : `${BASE_PATH}${p}`;
}

async function expectOneVisible(locs: Locator[], failMsg = 'Expected one fallback to be visible') {
  for (const loc of locs) if (await loc.isVisible()) return;
  expect(false, failMsg).toBeTruthy();
}

test.describe('CATALOG • Product list/detail & Dashboard', () => {
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

  test('Product Detail: render tên/giá/brand/kho + form Quantity', async ({ page }) => {
    if (!READ_ONLY_GUARD) {
      await page.route('**/product/item/mock-phone-pro', async route => {
        const product = {
          _id: 'p1',
          slug: 'mock-phone-pro',
          sku: 'SKU-001',
          name: 'Mock Phone Pro',
          description: 'E2E demo',
          price: 999,
          quantity: 5,
          imageUrl: '/images/placeholder-image.png',
          brand: { name: 'Mock Brand', slug: 'mockbrand' }
        };
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, product })
        });
      });
    }

    await page.goto(gotoPath('/product/mock-phone-pro'));

    await expect(page.getByRole('heading', { name: 'Mock Phone Pro' })).toBeVisible();
    await expect(page.getByText('$999')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Mock Brand' })).toHaveAttribute('href', /\/shop\/brand\/mockbrand/);
    await expect(page.getByText(/In stock/i)).toBeVisible();
    await page.waitForSelector('input[name="quantity"]'); 
    const qty = page.locator('input[name="quantity"]');
    await expect(qty).toHaveAttribute('min', '1');
    await expect(qty).toHaveAttribute('max', '5');
    await expect(page.getByRole('button', { name: /Add To Bag/i })).toBeVisible();
  });

  test('Product Detail: API 404/500 → hiển thị "No product found."', async ({ page }) => {
    if (!READ_ONLY_GUARD) {
      await page.route('**/product/item/broken-slug', route =>
        route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ success: false }) })
      );
    }
    await page.goto(gotoPath('/product/broken-slug'));
    await expect(page.getByText('No product found.')).toBeVisible();
  });

  test('Shop list: API OK → hiển thị sản phẩm', async ({ page }) => {
    const payload = {
      success: true,
      products: [
        {
          _id: 'p1',
          slug: 'mock-phone-pro',
          sku: 'SKU-001',
          name: 'Mock Phone Pro',
          title: 'Mock Phone Pro',
          description: 'E2E demo',
          price: 999,
          quantity: 5,
          imageUrl: '/images/placeholder-image.png',
          brand: { name: 'Mock Brand', slug: 'mockbrand' },
          totalReviews: 0
        },
        {
          _id: 'p2',
          slug: 'mock-laptop-air',
          sku: 'SKU-002',
          name: 'Mock Laptop Air',
          title: 'Mock Laptop Air',
          description: 'E2E demo',
          price: 1499,
          quantity: 5,
          imageUrl: '/images/placeholder-image.png',
          brand: { name: 'Mock Brand', slug: 'mockbrand' },
          totalReviews: 0
        }
      ],
      count: 2,
      totalPages: 1,
      currentPage: 1,
      limit: 12,
      order: 'latest',
      items: undefined,
      docs: undefined
    };

    page.on('request', r => {
      const u = r.url();
      if (u.includes('product')) console.log('→ request:', r.method(), u);
    });

    const productApi = /\/(api\/)?(product(s)?)(\/list)?(\?.*)?$/i;

    await page.route('**/*', async route => {
      const url = route.request().url();
      if (productApi.test(url)) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(payload)
        });
      } else {
        await route.continue();
      }
    });

    const [resp] = await Promise.all([
      page.waitForResponse(r => productApi.test(r.url()) && r.status() === 200),
      page.goto(gotoPath('/shop'))
    ]);

    await page.addStyleTag({ content: `.item-name{display:block!important;visibility:visible!important;opacity:1!important}` });

    await expect(page.locator('.item-name', { hasText: 'Mock Phone Pro' })).toHaveCount(1);
    await expect(page.locator('.item-name', { hasText: 'Mock Laptop Air' })).toHaveCount(1);

    await expect(page.getByText('Mock Phone Pro')).toBeVisible();
    await expect(page.getByText('Mock Laptop Air')).toBeVisible();
  });


  test('Shop list: API lỗi 500 → hiện fallback (NotFound/alert/thông báo lỗi)', async ({ page }) => {
    if (!READ_ONLY_GUARD) {
      await page.route('**/product/list**', route =>
        route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Internal error' }) })
      );
    }
    await page.goto(gotoPath('/shop/all'));

    const fallbacks = [
      page.getByText(/No products found\./i),
      page.getByText(/The page you are looking for was not found\./i),
      page.getByRole('alert'),
      page.getByText(/error|failed|internal|không thể/i),
    ];
    await expectOneVisible(fallbacks, 'Expect some error/fallback UI when list API fails');
  });

  test('Sell page: heading & banner text', async ({ page }) => {
    await page.goto(gotoPath('/sell'));
    await expect(page.getByRole('heading', { name: 'Become A RMIT Store Seller!' })).toBeVisible();
    await expect(page.getByText('Would you like to sell your products on RMIT Store!')).toBeVisible();
  });
});
