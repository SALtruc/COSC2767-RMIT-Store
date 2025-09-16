import { test, expect, request, APIRequestContext, Locator } 

from '@playwright/test'; test.use({ video: 'on', trace: 'retain-on-failure' }); 

const API_URL = process.env.API_URL || 'http://localhost:3000/api'; 
const USE_HASH = process.env.USE_HASH === '1'; 
const BASE_PATH = process.env.BASE_PATH || ''; 

function gotoPath(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return USE_HASH ? `/#${BASE_PATH}${p}` : `${BASE_PATH}${p}`;
}

let api: APIRequestContext;

test.beforeAll(async () => { api = await request.newContext({ baseURL: API_URL }); }); 
test.afterAll(async () => { await api.dispose(); }); 

async function waitOneVisible(cands: Locator[], msg = 'Expected one element to be visible') { 
    for (const c of cands) { 
        if (await c.first().isVisible().catch(() => false)) return; } 
    expect(false, msg).toBeTruthy(); } 
    
test.describe('LIVE • Full order flow (FE + BE + DB)', () => { 
    test('Login → Shop → Pick product → Qty=2 → Add To Bag → Mini-cart → Place Order → Success', async ({ page }) => { 
        test.skip(process.env.READ_ONLY_GUARD === '1', 'READ_ONLY_GUARD đang bật → không thể tạo order'); 
        
        // 1) Login 
        await test.step('Login as admin', async () => { 
            await page.goto(gotoPath('/login')); 
            const box = page.locator('.login-form'); 
            await box.getByPlaceholder('Enter Your Email Address').fill('admin@rmit.edu.vn'); 
            await box.getByPlaceholder('Enter Your Password').fill('ChangeMe123!'); 
            await Promise.all([ page.waitForLoadState('networkidle'), 
            page.getByRole('button', { name: /Sign In/i }).click(), 
        ]); }); 
                
        // 2) Đi tới shop (thử /shop rồi fallback /shop/all) 
        await test.step('Open shop page', async () => { 
            await page.goto(gotoPath('/shop')); 
            if (!(await page.locator('a[href^="/product/"]').first().isVisible().catch(() => false))) { 
                await page.goto(gotoPath('/shop/all')); } 
                await waitOneVisible( [page.locator('a[href^="/product/"]').first()], 
                'Không thấy item nào trong shop. Hãy seed DB với ít nhất 1 sản phẩm.' );
            }); 
        
        // 3) Chọn sản phẩm 
        let chosenSlug = ''; 
        await test.step('Pick product (Handmade Rubber Chips if exists, else first item)', async () => { 
            const exact = page.locator('a[href^="/product/"]:has-text("Electronic Silk Gloves")').first(); 
            if (await exact.isVisible().catch(() => false)) { 
                const href = await exact.getAttribute('href'); 
                chosenSlug = href?.split('/product/')[2] || ''; 
                await exact.click(); 
            } else { 
                const first = page.locator('a[href^="/product/"]').first(); 
                const href = await first.getAttribute('href'); 
                chosenSlug = href?.split('/product/')[2] || ''; 
                await first.click(); 
            } }); 
            
        await test.step('Set quantity to 2 and Add To Bag', async () => {
            const shop = page.locator('.product-shop').first(); 
            await expect(shop).toBeVisible();
            let qty = shop.locator( 
                '.input-box input[type="number"],' + 
                '.input-box input[name*="quantity" i],' + 
                '.input-box input[aria-label*="quantity" i]' ).first(); 
                
            if (!(await qty.isVisible().catch(() => false))) { 
                qty = shop.getByRole('spinbutton').first(); } 
                
            if (await qty.isVisible().catch(() => false)) { 
                await qty.click({ force: true }); 
                await qty.press('ControlOrMeta+a'); 
                await qty.type('1', { delay: 20 }); 
            } else { const plusBtn = shop.locator(
                '.input-box button:has-text("+"), .input-box [aria-label*="increase" i]' ).first(); 
                await expect(plusBtn).toBeVisible(); await plusBtn.click(); await plusBtn.click(); } 
                
            const addBtn = shop.locator( 
                'button:has(.btn-text:has-text("Add To Bag")),' + 
                'a:has(.btn-text:has-text("Add To Bag")),' + 
                'button:has-text("Add To Bag"),a:has-text("Add To Bag"),' +
                'button:has-text("Add to Cart"),a:has-text("Add to Cart")' ).first(); 
                
            await expect(addBtn).toBeVisible();
            await Promise.all([ 
                page.waitForLoadState('networkidle'), 
                addBtn.click(), ]); }); 
                
        // 5) Mini-cart popup/Drawer → Place Order / Checkout 
        await test.step('Open mini-cart and click Place Order', async () => {
        const mini = page 
            .getByRole('dialog')   
            .or(page.locator('[data-testid="mini-cart"], .mini-cart, .cart-drawer, .cart-popup')) 
            .first(); 
        
        try { await expect(mini).toBeVisible({ timeout: 3500 }); 
        } catch {
             const cartToggle = page.locator( 
                'a[href*="/cart"], ' + 'button[aria-label*="cart" i], ' + 
                '[data-testid*="cart" i], ' + 'button:has([class*="icon-cart"]), a:has([class*="icon-cart"])' 
            ).first(); 
        
        if (await cartToggle.isVisible().catch(() => false)) { await cartToggle.click(); } 
        else { 
            await page.goto(gotoPath('/cart')); } } 
            
        const placeBtn = page.locator( 
            'button:has-text("Place Order"), a:has-text("Place Order"), ' + 
            'button:has-text("Checkout"), a:has-text("Checkout"), ' + 'button:has-text("Proceed"), a:has-text("Proceed"), ' +
            'button:has(.btn-text:has-text("Place Order")), a:has(.btn-text:has-text("Place Order")), ' + 
            'button:has(.btn-text:has-text("Checkout")), a:has(.btn-text:has-text("Checkout")), ' + 
            'button:has(.btn-text:has-text("Proceed")), a:has(.btn-text:has-text("Proceed"))' ).first();
            
        await expect(placeBtn).toBeVisible({ timeout: 5000 }); 
        await Promise.all([ page.waitForLoadState('networkidle'), placeBtn.click(), ]); }); 
        
        // 6) Trang thành công 
        await test.step('Verify Order Success & capture screenshot', async () => { 
            await expect(page.getByRole('heading', { name: /Thank you for your order\./i })).toBeVisible({ timeout: 10000 }); 
            const idLink = page.getByRole('link', { name: /#\w+/ }).first(); 
            const idText = (await idLink.textContent())?.replace('#', '').trim(); 
            
            const png = await page.screenshot({ fullPage: true }); 
            await test.info().attach('order-success', { body: png, contentType: 'image/png' });            
        });
     }); 
            
     test.afterEach(async ({}, testInfo) => { 
        const vid = testInfo.attachments?.find(a => a.name === 'video' && a.path); 
        if (vid?.path) console.log('[VIDEO]', vid.path); 
        const trace = testInfo.attachments?.find(a => a.name === 'trace' && a.path); 
        if (trace?.path) console.log('[TRACE]', trace.path); 
    }); 
});