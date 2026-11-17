import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createPortServer } from 'node:net';

test(
  'Buy again access, merge and failure in both themes on phone and desktop',
  { timeout: 420000 },
  async () => {
    const { createServer } = await import('vite');
    const reservation = createPortServer();
    await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
    const port = reservation.address().port;
    await new Promise((resolve, reject) =>
      reservation.close((error) => (error ? reject(error) : resolve()))
    );
    const server = await createServer({
      cacheDir: 'node_modules/.vite-buy-again',
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
import sys, json, os
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

base = sys.argv[1]
with sync_playwright() as p:
    browser = p.chromium.launch()
    for mode in ['light', 'dark']:
        for width in [390, 1280]:
            context = browser.new_context(viewport={'width': width, 'height': 1000}, color_scheme=mode)
            context.add_init_script("localStorage.setItem('vite-ui-theme', '" + mode + "')")
            user = {'id': 'person', 'name': 'Nomsa', 'email': 'nomsa@example.test', 'role': 'business', 'active_business_id': 'buyer', 'business_role': 'manager', 'profileComplete': True, 'emailVerified': True, 'agreedToTerms': True}
            def party(id):
                return {'id': id, 'name': id.title() + ' Recycling', 'business_verified': True}
            trade = {'id': 'trade', 'type': 'b2b', 'status': 'complete', 'effective_at': '2026-11-08T08:00:00Z', 'created_at': '2026-11-08T08:00:00Z', 'invoice_number': 'TEST-11', 'seller': party('seller'), 'buyer': party('buyer'), 'total_price': '16', 'business_verified': True, 'items': [{'material_id': 'glass', 'material_name': 'Glass', 'weight': '2.01', 'price': '8'}, {'material_id': 'missing', 'material_name': 'Cardboard', 'weight': '3', 'price': '2'}], 'receipts': []}
            def listing(id, weight):
                return {'id': id + '-stock', 'seller_id': 'seller', 'seller_name': 'Seller Recycling', 'seller_verified': True, 'material_id': id, 'material_name': id.title(), 'weight': weight, 'price': '9.99', 'image_urls': [], 'image_url': '', 'carbon_factor': '1', 'gw_code': '', 'review_count': 0, 'average_rating': None}
            cart = {'items': [{'stock_id': 'paper-stock', 'material_id': 'paper', 'material_name': 'Paper', 'weight': '4', 'price': '1'}, {'stock_id': 'glass-stock', 'material_id': 'glass', 'material_name': 'Glass', 'weight': '1', 'price': '9.99'}]}
            saved, calls, errors, console_errors, failed_responses = [], [], [], [], []
            fail_save = False
            fail_read = False
            def handle(route):
                parsed = urlparse(route.request.url)
                path = parsed.path.removeprefix('/api')
                query = parse_qs(parsed.query)
                calls.append((route.request.method, path, query))
                body = {'items': [], 'has_more': False, 'count': 0}
                if path == '/auth/me': body = {'user': user}
                elif path == '/auth/sessions': body = {'sessions': []}
                elif path == '/businesses/mine': body = []
                elif path == '/transactions/trade': body = trade
                elif path == '/market/listings':
                    assert query['seller_id'] == ['seller']
                    if fail_read:
                        route.fulfill(status=400, content_type='application/json', body=json.dumps({'code': 'invalid', 'message': 'Listings could not load.', 'fields': None})); return
                    body = {'items': [listing('glass', '1.999')] if query.get('material_id') == ['glass'] else [], 'has_more': False}
                elif path.startswith('/market/listings/'):
                    body = listing(path.split('/')[-1].removesuffix('-stock'), '10')
                elif path == '/cart' and route.request.method == 'PUT':
                    saved.append(route.request.post_data_json)
                    if fail_save:
                        route.fulfill(status=400, content_type='application/json', body=json.dumps({'code': 'invalid', 'message': 'Please fix the highlighted field.', 'fields': {'items': 'Only 1.5 kg left.'}})); return
                    cart['items'] = route.request.post_data_json['items']
                    body = {'ok': True}
                elif path == '/cart':
                    assert query['seller_id'] == ['seller']
                    body = cart
                elif path == '/cart/stores': body = {'items': [{'id': 'seller', 'name': 'Seller Recycling', 'business_verified': True, 'item_count': 2}]}
                elif path == '/stores/seller': body = dict(party('seller'), item_count=2)
                route.fulfill(status=200, content_type='application/json', body=json.dumps(body))
            context.route(base + '/api/**', handle)
            context.route_web_socket('**/api/live', lambda ws: None)
            page = context.new_page()
            page.set_default_timeout(15000)
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('console', lambda message: console_errors.append(message.text) if message.type == 'error' else None)
            page.on('response', lambda response: failed_responses.append((response.status, urlparse(response.url).path)) if response.status >= 400 else None)
            def open_menu():
                page.goto(base + '/transactions/trade')
                expect(page.get_by_role('heading', name='Invoice TEST-11', exact=True)).to_be_visible()
                # Wait for the button itself, not for a quiet network.
                actions = page.get_by_role('button', name='Invoice actions', exact=True)
                expect(actions).to_be_visible()
                expect(actions).to_be_enabled()
                actions.click()
                expect(page.get_by_role('menu')).to_be_visible()
            try:
                for role, business_role, business, kind, status, visible in [
                    ('business', 'owner', 'buyer', 'b2b', 'complete', True),
                    ('business', 'manager', 'buyer', 'b2b', 'complete', True),
                    ('business', 'member', 'buyer', 'b2b', 'complete', False),
                    ('business', 'manager', 'seller', 'b2b', 'complete', False),
                    ('business', 'manager', 'other', 'b2b', 'complete', False),
                    ('business', 'manager', 'buyer', 'c2b', 'complete', False),
                    ('business', 'manager', 'buyer', 'b2b', 'pending', False),
                    ('business', 'manager', 'buyer', 'b2b', 'cancelled', False),
                    ('business', 'manager', 'buyer', 'b2b', 'duplicate', False),
                    ('staff', 'manager', 'buyer', 'b2b', 'complete', False),
                    ('admin', 'owner', 'buyer', 'b2b', 'complete', False),
                ]:
                    user.update(role=role, business_role=business_role, active_business_id=business)
                    trade.update(type=kind, status=status)
                    open_menu()
                    expect(page.get_by_role('menuitem', name='Buy again', exact=True)).to_have_count(1 if visible else 0)
                    assert page.locator('html').evaluate('(el) => el.scrollWidth <= innerWidth')
                    if visible and business_role == 'owner' and os.environ.get('THREERECO_BUY_AGAIN_SCREENSHOTS'):
                        page.screenshot(path=os.path.join(os.environ['THREERECO_BUY_AGAIN_SCREENSHOTS'], 'pr11-' + mode + '-' + str(width) + '.png'), full_page=True)
                user.update(role='business', business_role='manager', active_business_id='buyer')
                trade.update(type='b2b', status='complete')
                fail_save = True
                original = json.loads(json.dumps(cart))
                open_menu()
                page.get_by_role('menuitem', name='Buy again', exact=True).click()
                expect(page.get_by_text('Only 1.5 kg left.', exact=True)).to_be_visible()
                assert urlparse(page.url).path == '/transactions/trade'
                assert cart == original
                assert len(saved) == 1
                expected = {'items': [{'stock_id': 'paper-stock', 'material_id': 'paper', 'weight': '4'}, {'stock_id': 'glass-stock', 'material_id': 'glass', 'weight': '1.999'}]}
                assert saved[0] == expected, saved
                fail_read = True
                open_menu()
                page.get_by_role('menuitem', name='Buy again', exact=True).click()
                expect(page.get_by_text('Listings could not load.', exact=True)).to_be_visible()
                assert len(saved) == 1
                assert cart == original
                # Each deliberately failed HTTP response produces a browser console error.
                assert failed_responses == [(400, '/api/cart'), (400, '/api/market/listings'), (400, '/api/market/listings')], failed_responses
                assert len(console_errors) == len(failed_responses), console_errors
                console_errors.clear()
                fail_save = False
                fail_read = False
                open_menu()
                page.get_by_role('menuitem', name='Buy again', exact=True).click()
                expect(page.get_by_role('heading', name='Your cart', exact=True)).to_be_visible()
                assert parse_qs(urlparse(page.url).query)['seller_id'] == ['seller']
                expect(page.get_by_text('Not added because they are no longer listed: Cardboard.', exact=True)).to_be_visible()
                assert saved == [expected, expected]
                assert cart['items'] == expected['items']
                assert not any(method != 'GET' and path.startswith('/requests') for method, path, _ in calls)
                assert not errors, errors
                assert not console_errors, console_errors
            finally:
                context.close()
    browser.close()
print('Buy again passed: 11 visibility cases, save/read failure and merged cart in all 4 theme/viewport combinations')
`;
