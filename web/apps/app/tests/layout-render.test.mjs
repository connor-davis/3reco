import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createPortServer } from 'node:net';

test(
  'layout blocks render across compact/wide widths in light and dark',
  { timeout: 360000 },
  async () => {
    const { createServer } = await import('vite');
    const portServer = createPortServer();
    await new Promise((resolve) => portServer.listen(0, '127.0.0.1', resolve));
    const port = portServer.address().port;
    await new Promise((resolve, reject) =>
      portServer.close((error) => (error ? reject(error) : resolve()))
    );
    const server = await createServer({
      // The account-switch browser regression runs another Vite server in parallel.
      cacheDir: 'node_modules/.vite-layout',
      server: { host: '127.0.0.1', port, strictPort: true, hmr: false },
    });
    try {
      await server.listen();
      const result = await new Promise((resolve) => {
        const child = spawn(
          'python',
          [
            '-c',
            regression,
            `http://127.0.0.1:${server.httpServer.address().port}`,
          ],
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
import sys, json, re, os
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

base = sys.argv[1]
sys.stdout.reconfigure(encoding='utf-8')
listing = {'id': 'stock', 'seller_id': 'seller', 'seller_name': 'Greenloop', 'material_id': 'glass', 'material_name': 'Clear glass', 'weight': '1000', 'held_weight': '0', 'price': '8.00', 'carbon_factor': '1', 'gw_code': 'GL', 'image_url': '', 'seller_avatar_url': '', 'average_rating': None, 'review_count': 0, 'created_at': '2026-11-08T08:00:00Z'}
routes = ['/', '/?role=collector', '/?role=admin', '/transactions/trade?from=/transactions/purchases', '/transactions/purchases?open=trade', '/transactions', '/transactions/purchases', '/transactions/sales', '/collections', '/market/incoming', '/market/outgoing', '/stock', '/collectors', '/materials', '/admin/users', '/messages', '/profile', '/market/store/seller', '/market/listing/stock', '/cart?seller_id=seller']
party = lambda id, name: {'id': id, 'name': name, 'business_verified': True}
trade = {'id': 'trade', 'type': 'b2b', 'business_verified': True, 'status': 'complete', 'request_id': None, 'seller': party('seller', 'Greenloop'), 'buyer': party('buyer', 'Layout Buyer'), 'invoice_number': 'INV-2048', 'total_price': '100.00', 'effective_at': '2026-11-08T08:00:00Z', 'created_at': '2026-11-08T08:00:00Z', 'collection_day': None, 'collection_date': None, 'can_remove_receipts': True, 'items': [{'material_id': 'glass', 'material_name': 'Clear glass', 'weight': '12.5', 'price': '8.00'}], 'receipts': [{'id': 'receipt', 'file_name': 'Payment receipt.jpg', 'uploaded_by': 'buyer'}]}
request = {'id': 'request', 'seller': trade['seller'], 'buyer': trade['buyer'], 'status': 'offered', 'offer_by': 'seller', 'offer_version': 1, 'buyer_confirmed_version': None, 'seller_confirmed_version': 1, 'created_at': trade['created_at'], 'updated_at': trade['created_at'], 'items': [{'material_id': 'glass', 'material_name': 'Clear glass', 'stock_id': 'stock', 'offer_price': '8.00', 'offer_weight': '12.5', 'requested_price': '8.00', 'requested_weight': '12.5', 'available_weight': '1000'}]}
totals = {'count': 7, 'weight': '87.5', 'value': '700.00', 'carbon_savings': '100'}
dashboard = {'from': '2026-10-08T08:00:00Z', 'to': trade['created_at'], 'totals': totals, 'series': [dict(totals, day='2026-11-08')], 'counterparties': [dict(party(str(i), 'Partner ' + str(i)), count=1, value='100.00') for i in range(7)], 'collector_linked': True}
with sync_playwright() as p:
    browser = p.chromium.launch()
    for mode in ['light', 'dark']:
        for width in [390, 412, 820, 1280, 1920]:
            context = browser.new_context(viewport={'width': width, 'height': 1000}, color_scheme=mode)
            role = 'admin'
            errors = []
            def handle(route):
                path = urlparse(route.request.url).path.removeprefix('/api')
                body = {'items': [], 'has_more': False, 'next_cursor': None, 'count': 0}
                if path == '/auth/me': body = {'user': {'id': 'buyer', 'name': 'Layout Buyer', 'email': 'layout@example.test', 'role': role, 'emailVerified': True, 'profileComplete': True, 'agreedToTerms': True}}
                elif path == '/auth/sessions': body = {'sessions': []}
                elif path == '/profile': body = dict.fromkeys(['image', 'avatar_url', 'phone', 'id_number', 'business_name', 'business_registration_number', 'bank_account_holder_name', 'bank_name', 'bank_account_number', 'bank_branch_code', 'bank_account_type', 'street_address', 'city', 'province'], '') | {'id': 'buyer', 'name': 'Layout Buyer', 'first_name': 'Layout', 'last_name': 'Buyer', 'email': 'layout@example.test', 'role': role, 'profile_complete': True, 'agreed_to_terms': True, 'area_code': None}
                elif path == '/collectors/selection' or (path == '/materials' and 'all=true' in route.request.url): body = []
                elif path == '/transactions/totals': body = totals
                elif path == '/transactions/trade': body = trade
                elif path in ['/transactions', '/transactions/', '/transactions/purchases', '/transactions/sales']: body['items'] = [dict(trade, id='trade' if i == 0 else str(i)) for i in range(7)]
                elif path in ['/requests', '/requests/incoming', '/requests/outgoing']: body['items'] = [request]
                elif path == '/requests/request': body = request
                elif path in ['/dashboard/business', '/dashboard/collector', '/admin/dashboard']: body = dashboard
                elif path == '/stats': body = {'total_kg': '87.5', 'co2_kg': '100', 'deals': 7, 'top_stores': []}
                elif path == '/market/listings/stock': body = listing
                elif path == '/stores/seller': body = {'id': 'seller', 'name': 'Greenloop', 'city': 'Cape Town', 'province': 'Western Cape', 'created_at': '2026-11-08T08:00:00Z', 'average_rating': None, 'review_count': 0}
                elif path == '/stores/seller/listings': body['items'] = [listing]
                elif path == '/cart/stores': body['items'] = [{'id': 'seller', 'name': 'Greenloop', 'item_count': 1}]
                elif path == '/cart': body = {'items': [{'stock_id': 'stock', 'material_id': 'glass', 'weight': '12.5', 'price': '8.00'}]}
                elif path.endswith('/summary'): body = {'average_rating': None, 'review_count': 0}
                elif path.endswith('/reviewable'): body = {'items': []}
                elif path.endswith('/unread-count'): body = {'count': 0}
                route.fulfill(content_type='application/json', body=json.dumps(body))
            context.route(base + '/api/**', handle)
            context.route_web_socket('**/api/live', lambda ws: None)
            page = context.new_page()
            page.set_default_timeout(10000)
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
            for route in routes:
                role = 'collector' if route == '/?role=collector' else 'admin' if route in ['/?role=admin', '/transactions', '/materials', '/admin/users'] else 'business'
                try:
                    page.goto(base + route)
                    page.wait_for_load_state('networkidle')
                    page.locator('h1').first.wait_for()
                    assert page.locator('html').evaluate('(el) => el.scrollWidth <= window.innerWidth'), f'page overflow {route} {width} {mode}'
                    for toolbar in page.locator('[data-slot="toolbar"]').all():
                        assert toolbar.evaluate('(el) => el.scrollWidth <= el.clientWidth + 1'), f'toolbar overflow {route} {width}'
                        assert toolbar.evaluate('(el) => getComputedStyle(el).flexWrap') == 'nowrap'
                        if width < 1024 and toolbar.get_by_role('button', name=re.compile('Filters')).count():
                            toolbar.get_by_role('button', name=re.compile('Filters')).click()
                            dialog = page.get_by_role('dialog', name='Filters', exact=True)
                            expect(dialog).to_be_visible()
                            buttons = dialog.locator('[data-slot="button-row"] button')
                            expect(buttons).to_have_count(2)
                            boxes = [button.bounding_box() for button in buttons.all()]
                            assert abs(boxes[0]['width'] - boxes[1]['width']) < 1
                            assert boxes[0]['height'] >= 44 and boxes[1]['height'] >= 44
                            dialog.get_by_role('button', name='Clear', exact=True).click()
                            dialog.get_by_role('button', name='Show results', exact=True).click()
                            expect(dialog).not_to_be_visible()
                    for tabs in page.locator('[data-slot="tabs-list"][data-variant="line"]').all():
                        assert tabs.evaluate('(el) => getComputedStyle(el).flexWrap') == 'nowrap'
                        boxes = [tab.bounding_box() for tab in tabs.get_by_role('tab').all()]
                        assert max(box['y'] for box in boxes) - min(box['y'] for box in boxes) < 1
                        if width < 1024: assert all(box['height'] >= 44 for box in boxes)
                    for bar in page.locator('[data-slot="action-bar"]').all():
                        assert bar.evaluate('(el) => el.scrollWidth <= el.clientWidth + 1'), f'action bar overflow {route} {width}'
                        label = bar.locator(':scope > div').first.bounding_box()
                        actions = bar.locator('[data-slot="button-row"]').bounding_box()
                        overlap_x = min(label['x'] + label['width'], actions['x'] + actions['width']) - max(label['x'], actions['x'])
                        overlap_y = min(label['y'] + label['height'], actions['y'] + actions['height']) - max(label['y'], actions['y'])
                        assert overlap_x < 1 or overlap_y < 1, f'action label overlaps buttons {route} {width}'
                        if width < 1024:
                            box = bar.bounding_box()
                            assert abs(box['x']) < 1 and abs(box['width'] - width) < 1
                            assert abs(box['y'] + box['height'] - (1000 - 52)) < 2
                    if route == '/market/store/seller':
                        buttons = page.locator('header [data-slot="button-row"] button, header [data-slot="button-row"] a')
                        expect(buttons).to_have_count(2)
                        if width < 1024:
                            boxes = [button.bounding_box() for button in buttons.all()]
                            assert abs(boxes[0]['width'] - boxes[1]['width']) < 1
                    if route == '/market/listing/stock':
                        buttons = page.locator('[data-slot="action-bar"] button')
                        expect(buttons).to_have_count(2)
                        if width < 1024:
                            boxes = [button.bounding_box() for button in buttons.all()]
                            assert abs(boxes[0]['width'] - boxes[1]['width']) < 1
                    if route in ['/', '/?role=collector', '/?role=admin']:
                        expect(page.locator('[data-slot="card"]')).to_have_count(3)
                        stats = page.locator('[data-slot="card"]').all()
                        assert max(card.bounding_box()['y'] for card in stats) - min(card.bounding_box()['y'] for card in stats) < 1
                        partners = page.get_by_role('heading', name='Trading partners').locator('xpath=ancestor::section[1]').locator('ul > li')
                        expect(partners).to_have_count(5)
                        if role == 'collector':
                            recent = page.get_by_role('heading', name='Your recent collections').locator('xpath=ancestor::section[1]').locator('ul > li')
                            expect(recent).to_have_count(5)
                    if route == '/profile' and width < 1024:
                        buttons = page.get_by_role('button', name='Cancel changes').first.locator('..').get_by_role('button')
                        expect(buttons).to_have_count(2)
                        boxes = [button.bounding_box() for button in buttons.all()]
                        assert abs(boxes[0]['width'] - boxes[1]['width']) < 1
                    if route in ['/transactions', '/transactions/purchases', '/market/incoming', '/market/outgoing']:
                        expect(page.get_by_role('table')).to_have_count(1 if width >= 1024 else 0)
                    if route in ['/transactions/trade?from=/transactions/purchases', '/transactions/purchases?open=trade']:
                        assert 'Not available' not in page.locator('body').inner_text()
                        expect(page.get_by_role('heading', name='Invoice INV-2048')).to_be_visible()
                        expect(page.get_by_role('dialog')).to_have_count(0)
                        assert '/transactions/trade' in page.url and 'open=' not in page.url
                        expect(page.get_by_role('heading', name='Items', exact=True)).to_be_visible()
                        expect(page.get_by_role('heading', name='Summary', exact=True)).to_be_visible()
                        expect(page.get_by_label('Receipts', exact=True)).to_be_visible()
                    if route == '/transactions/purchases':
                        if width >= 1024:
                            page.get_by_role('row', name='Invoice and receipts: Clear glass · 12.5 kg').first.click()
                        else:
                            page.get_by_role('button', name='Invoice and receipts: Clear glass · 12.5 kg').first.click()
                        expect(page.get_by_role('heading', name='Invoice INV-2048')).to_be_visible()
                        page.get_by_role('link', name='Back to transactions').click()
                        expect(page.get_by_role('heading', name='Purchases', exact=True)).to_be_visible()
                    if route in ['/transactions', '/market/incoming', '/market/outgoing']:
                        expect(page.get_by_role('link', name='Open messages')).to_have_count(0)
                    assert not errors, errors
                    if os.environ.get('THREERECO_LAYOUT_SHOTS') and width in [390, 1280] and route in ['/', '/?role=collector', '/?role=admin', '/transactions/trade?from=/transactions/purchases', '/transactions', '/profile', '/market/incoming']:
                        shots = Path(os.environ['THREERECO_LAYOUT_SHOTS'])
                        shots.mkdir(parents=True, exist_ok=True)
                        page.screenshot(path=str(shots / (mode + '-' + str(width) + '-' + route.strip('/').replace('/', '-').replace('?', '-').replace('=', '-') + '.png')), full_page=True)
                except Exception:
                    shots = Path(os.environ.get('THREERECO_LAYOUT_SHOTS', '../../../mystuff/layout-phase2-shots'))
                    shots.mkdir(parents=True, exist_ok=True)
                    page.screenshot(path=str(shots / 'failure.png'), full_page=True)
                    print(page.locator('body *').evaluate_all('(els) => els.filter(el => el.getBoundingClientRect().right > innerWidth).map(el => [el.tagName, el.className, el.getBoundingClientRect().toJSON(), getComputedStyle(el).position, getComputedStyle(el).left, getComputedStyle(el).width, getComputedStyle(el).margin, el.parentElement.outerHTML.slice(0,500)]).slice(0, 20)'), flush=True)
                    print(f'FAILED {mode} {width} {route}: {errors}\n' + page.locator('body').inner_text(), flush=True)
                    raise
            context.close()
    browser.close()
print('200 route/theme/viewport checks passed')
`;
