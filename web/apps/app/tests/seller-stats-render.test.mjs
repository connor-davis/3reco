import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createPortServer } from 'node:net';

test(
  'seller stats states and public badges work on phone/desktop in light/dark',
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
      cacheDir: 'node_modules/.vite-seller-stats',
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
totals = {'count': 0, 'weight': '0', 'value': '0', 'carbon_savings': '0'}
empty = {'views': {'days_7': 0, 'days_30': 0, 'lifetime': 0}, 'listings': [], 'replies': {'requests': 0, 'within_day': 0}}
ready = {'views': {'days_7': 17, 'days_30': 31, 'lifetime': 105}, 'listings': [{'id': 'stock', 'material_name': 'Long recyclable material name that must wrap on a narrow phone', 'is_listed': True, 'views': {'days_7': 17, 'days_30': 31, 'lifetime': 105}}], 'replies': {'requests': 6, 'within_day': 4}}
listing = {'id': 'stock', 'seller_id': 'seller', 'seller_name': 'Greenloop', 'seller_verified': True, 'usually_replies_within_day': True, 'material_id': 'glass', 'material_name': 'Clear glass', 'weight': '1000', 'held_weight': '0', 'price': '8.00', 'carbon_factor': '1', 'gw_code': 'GL', 'image_url': '', 'image_urls': [], 'seller_avatar_url': '', 'average_rating': None, 'review_count': 0, 'created_at': '2026-11-08T08:00:00Z'}
with sync_playwright() as p:
    browser = p.chromium.launch()
    for mode in ['light', 'dark']:
        for width in [390, 1440]:
            context = browser.new_context(viewport={'width': width, 'height': 1000}, color_scheme=mode)
            state = {'kind': 'empty', 'calls': 0, 'badge': True, 'role': 'business'}
            errors = []
            def handle(route):
                path = urlparse(route.request.url).path.removeprefix('/api')
                body, code = {'items': [], 'has_more': False, 'count': 0}, 200
                if path == '/auth/me':
                    body = {'user': {'id': 'buyer', 'name': 'Buyer', 'email': 'buyer@example.test', 'role': state['role'], 'emailVerified': True, 'profileComplete': True, 'agreedToTerms': True, 'business_verified': True, 'active_business_id': 'buyer' if state['role'] == 'business' else '', 'business_role': 'owner' if state['role'] == 'business' else ''}}
                elif path == '/auth/sessions': body = {'sessions': []}
                elif path == '/businesses/mine' or path == '/materials': body = []
                elif path == '/stats': body = {'total_kg': '0', 'co2_kg': '0', 'deals': 0, 'top_stores': []}
                elif path in ['/dashboard/business', '/dashboard/collector', '/admin/dashboard']:
                    body = {'totals': totals, 'previous': totals, 'series': [], 'counterparties': [], 'stock_mix': []}
                elif path == '/stats/seller':
                    state['calls'] += 1
                    if state['kind'] == 'error':
                        expect(page.get_by_role('status').filter(has_text='Loading listing views')).to_be_visible()
                        body, code = {'message': 'Seller stats could not be loaded.'}, 400
                    else: body = ready if state['kind'] == 'ready' else empty
                elif path == '/market/listings/stock': body = dict(listing, usually_replies_within_day=state['badge'])
                elif path == '/stores/seller': body = {'id': 'seller', 'name': 'Greenloop', 'business_verified': True, 'usually_replies_within_day': state['badge'], 'city': 'Cape Town', 'province': 'Western Cape', 'created_at': listing['created_at'], 'average_rating': None, 'review_count': 0}
                elif path in ['/favourites/ids', '/follows/ids']: body = {'ids': []}
                elif path.endswith('/summary'): body = {'average_rating': None, 'review_count': 0}
                elif path.endswith('/unread-count'): body = {'count': 0}
                route.fulfill(status=code, content_type='application/json', body=json.dumps(body))
            context.route(base + '/api/**', handle)
            context.route_web_socket('**/api/live', lambda ws: None)
            page = context.new_page()
            page.set_default_timeout(15000)
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('console', lambda message: errors.append(message.text) if message.type == 'error' and '400 (Bad Request)' not in message.text else None)
            page.goto(base + '/')
            page.wait_for_load_state('networkidle')
            expect(page.get_by_role('heading', name='Listing views', exact=True)).to_be_visible()
            expect(page.get_by_text('No listing views in the last 30 days yet.', exact=True)).to_be_visible()
            expect(page.locator('html')).to_have_class(mode)
            state['kind'] = 'error'
            page.reload()
            expect(page.get_by_text('Seller stats could not be loaded.', exact=True)).to_be_visible()
            state['kind'] = 'ready'
            page.get_by_role('button', name='Try again', exact=True).click()
            expect(page.get_by_text('You replied within a day to 4 of 6 requests.', exact=True)).to_be_visible()
            expect(page.get_by_text('31 views', exact=True)).to_be_visible()
            assert page.locator('html').evaluate('(el) => el.scrollWidth <= innerWidth'), (mode, width, 'panel overflow')
            calls = state['calls']
            for route in ['/market/listing/stock', '/market/store/seller']:
                page.goto(base + route)
                page.wait_for_load_state('networkidle')
                badge = page.get_by_text('Usually replies within 1 day', exact=True)
                expect(badge).to_be_visible()
                assert page.locator('html').evaluate('(el) => el.scrollWidth <= innerWidth'), (mode, width, route, 'badge overflow')
                state['badge'] = False
                page.reload()
                page.wait_for_load_state('networkidle')
                expect(badge).to_have_count(0)
                state['badge'] = True
            page.goto(base + '/')
            page.wait_for_load_state('networkidle')
            expect(page.get_by_text('31 views', exact=True)).to_be_visible()
            assert state['calls'] > calls, 'navigation must refresh seller stats'
            calls = state['calls']
            state['role'] = 'collector'
            page.reload()
            page.wait_for_load_state('networkidle')
            expect(page.get_by_role('heading', name='Listing views', exact=True)).to_have_count(0)
            assert state['calls'] == calls, 'collector must not fetch business stats'
            assert not errors, errors
            context.close()
    browser.close()
`;
