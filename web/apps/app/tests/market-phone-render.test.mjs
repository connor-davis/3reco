import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createPortServer } from 'node:net';

test(
  'phone market shows cards above the fold and role-aware tabs',
  { timeout: 180000 },
  async () => {
    const { createServer } = await import('vite');
    const portServer = createPortServer();
    await new Promise((resolve) => portServer.listen(0, '127.0.0.1', resolve));
    const port = portServer.address().port;
    await new Promise((resolve, reject) =>
      portServer.close((error) => (error ? reject(error) : resolve()))
    );
    const server = await createServer({
      cacheDir: 'node_modules/.vite-market-phone',
      server: { host: '127.0.0.1', port, strictPort: true, hmr: false },
    });
    try {
      await server.listen();
      const result = await new Promise((resolve) => {
        const child = spawn(
          'python',
          ['-c', regression, `http://127.0.0.1:${port}`],
          { windowsHide: true }
        );
        let output = '';
        child.stdout.on('data', (data) => {
          output += data;
        });
        child.stderr.on('data', (data) => {
          output += data;
        });
        child.on('error', (error) =>
          resolve({ code: -1, output: String(error) })
        );
        child.on('close', (code) => resolve({ code, output }));
      });
      assert.equal(result.code, 0, result.output);
    } finally {
      await server.close();
    }
  }
);

const regression = String.raw`
import sys, json
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

base = sys.argv[1]
listing = {'fulfillment_mode': 'both', 'pickup_area': 'Bellville', 'id': 'stock', 'seller_id': 'seller', 'seller_name': 'Greenloop', 'material_id': 'glass', 'material_name': 'Clear glass', 'weight': '1000', 'held_weight': '0', 'price': '8.00', 'carbon_factor': '1', 'gw_code': 'GL', 'image_url': '', 'seller_avatar_url': '', 'average_rating': None, 'review_count': 0, 'created_at': '2026-11-08T08:00:00Z'}
with sync_playwright() as p:
    browser = p.chromium.launch()
    for mode in ['light', 'dark']:
        for has_stock in [False, True]:
            context = browser.new_context(viewport={'width': 390, 'height': 844}, color_scheme=mode)
            errors = []
            def handle(route):
                path = urlparse(route.request.url).path.removeprefix('/api')
                body = {'items': [], 'has_more': False, 'next_cursor': None}
                if path == '/auth/me':
                    body = {'user': {'id': 'buyer', 'name': 'Buyer', 'email': 'buyer@example.test', 'role': 'business', 'emailVerified': True, 'profileComplete': True, 'agreedToTerms': True, 'business_verified': True, 'active_business_id': 'buyer', 'business_role': 'owner'}}
                elif path == '/auth/sessions': body = {'sessions': []}
                elif path == '/businesses/mine': body = []
                elif path == '/materials': body = [{'id': 'glass', 'name': 'Glass', 'price': '5', 'carbon_factor': '1', 'gw_code': 'GL'}]
                elif path == '/market/distance': body = {'enabled': True, 'has_origin': True}
                elif path == '/market/listings': body['items'] = [dict(listing, id='a' + str(i)) for i in range(3)]
                elif path == '/market/listings/stock': body = listing
                elif path == '/stock' and has_stock: body['items'] = [{'id': 'lot', 'material_id': 'glass', 'material_name': 'Glass', 'weight': '5', 'available_weight': '5', 'price': '8.00', 'is_listed': True}]
                elif path in ['/favourites/ids', '/follows/ids']: body = {'ids': []}
                elif path.endswith('/unread-count'): body = {'count': 0}
                route.fulfill(status=200, content_type='application/json', body=json.dumps(body))
            context.route(base + '/api/**', handle)
            context.route_web_socket('**/api/live', lambda ws: None)
            page = context.new_page()
            page.set_default_timeout(60000)
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(base + '/market')
            page.wait_for_load_state('networkidle')
            assert page.locator('html').evaluate('(el) => el.scrollWidth <= innerWidth'), (mode, 'overflow')
            expect(page.get_by_text('Community impact', exact=False)).to_have_count(0)
            first = page.locator('[data-slot="card"]').filter(has=page.locator('h3')).first.bounding_box()
            assert first['y'] < 844 - 200, ('first card below the fold', first['y'])
            expect(page.get_by_role('link', name='Add stock', exact=True)).to_have_count(1 if has_stock else 0)
            padding = page.locator('#main-content > div').last.evaluate('(el) => getComputedStyle(el).paddingBottom')
            assert padding == '52px', padding
            page.goto(base + '/market/listing/stock')
            page.wait_for_load_state('networkidle')
            expect(page.get_by_role('navigation', name='Main')).to_have_count(0)
            assert not errors, errors
            context.close()
    browser.close()
`;
