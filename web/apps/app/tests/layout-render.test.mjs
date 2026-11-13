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
      if (process.env.THREERECO_B2_SHOTS) console.log(result.output);
    } finally {
      await server.close();
    }
  }
);

const regression = String.raw`
import sys, json, re, os
from pathlib import Path
from datetime import date, timedelta
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

base = sys.argv[1]
sys.stdout.reconfigure(encoding='utf-8')
listing = {'id': 'stock', 'seller_id': 'seller', 'seller_name': 'Greenloop', 'material_id': 'glass', 'material_name': 'Clear glass', 'weight': '1000', 'held_weight': '0', 'price': '8.00', 'carbon_factor': '1', 'gw_code': 'GL', 'image_url': '', 'seller_avatar_url': '', 'average_rating': None, 'review_count': 0, 'created_at': '2026-11-08T08:00:00Z'}
routes = ['/', '/?role=collector', '/?role=admin', '/transactions/trade?from=/transactions/purchases', '/transactions/purchases?open=trade', '/transactions', '/transactions/purchases', '/transactions/sales', '/collections', '/market/incoming', '/market/outgoing', '/stock', '/collectors', '/materials', '/admin/users', '/messages', '/profile', '/market/store/seller', '/market/listing/stock', '/cart?seller_id=seller']
party = lambda id, name: {'id': id, 'name': name, 'business_verified': True}
trade = {'id': 'trade', 'type': 'b2b', 'business_verified': True, 'status': 'complete', 'request_id': None, 'seller': party('seller', 'Greenloop'), 'buyer': party('buyer', 'Layout Buyer'), 'invoice_number': 'INV-2048', 'total_price': '100.00', 'effective_at': '2026-11-08T08:00:00Z', 'created_at': '2026-11-08T08:00:00Z', 'collection_day': None, 'collection_date': None, 'can_remove_receipts': True, 'items': [{'material_id': 'glass', 'material_name': 'Clear glass', 'weight': '12.5', 'price': '8.00'}], 'receipts': [{'id': 'receipt', 'file_name': 'Payment receipt.jpg', 'uploaded_by': 'buyer'}]}
large_trade = dict(trade, id='large', type='c2b', invoice_number='GLH09G54', seller=party('collector', 'Zanele Both'), buyer=party('buyer', 'Kasi Collect Co'), total_price='2000000.00', items=[{'material_id': 'steel', 'material_name': 'Steel cans and mixed recyclable metal offcuts', 'weight': '1000000', 'price': '2.00'}])
request = {'id': 'request', 'seller': large_trade['seller'], 'buyer': large_trade['buyer'], 'status': 'offered', 'offer_by': 'seller', 'offer_version': 1, 'buyer_confirmed_version': None, 'seller_confirmed_version': 1, 'created_at': trade['created_at'], 'updated_at': trade['created_at'], 'items': [{'material_id': 'glass', 'material_name': 'Steel cans and mixed recyclable metal offcuts', 'stock_id': 'stock', 'offer_price': '2.00', 'offer_weight': '1000000', 'requested_price': '8.00', 'requested_weight': '12.5', 'available_weight': '1000'}]}
totals = {'count': 7, 'weight': '87.5', 'value': '700.00', 'carbon_savings': '100'}
dashboard = {'from': '2026-10-08T08:00:00Z', 'to': trade['created_at'], 'totals': totals, 'series': [dict(totals, day=str(date(2026,10,10)+timedelta(days=i))) for i in range(30)], 'counterparties': [dict(party(str(i), 'Partner ' + str(i)), count=1, value='100.00') for i in range(7)], 'collector_linked': True}
admin_users = [{'id': 'buyer', 'name': 'Layout Buyer', 'email': 'admin@example.test', 'role': 'admin', 'profile_complete': True, 'business_verified': False, 'created_at': trade['created_at']}, {'id': 'business', 'name': 'Naledi Jacobs', 'email': 'naledi@kasicollect.co.za', 'role': 'business', 'profile_complete': True, 'business_verified': True, 'created_at': trade['created_at']}, {'id': 'unverified-business', 'name': 'Thandi Mokoena', 'email': 'thandi@metroscraptraders.co.za', 'role': 'business', 'profile_complete': False, 'business_verified': False, 'created_at': trade['created_at']}]
measurements = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    for mode in ['light', 'dark']:
        for width in [1100, 1280, 1440, 1920, 390, 412, 820]:
            context = browser.new_context(viewport={'width': width, 'height': 1000}, color_scheme=mode)
            role = 'admin'
            errors = []
            def handle(route):
                path = urlparse(route.request.url).path.removeprefix('/api')
                body = {'items': [], 'has_more': False, 'next_cursor': None, 'count': 0}
                if path == '/auth/me': body = {'user': {'id': 'buyer', 'name': 'Layout Buyer', 'email': 'layout@example.test', 'role': role, 'emailVerified': True, 'profileComplete': True, 'agreedToTerms': True, 'business_verified': True}}
                elif path == '/collectors': body['items'] = [{'id': 'collector', 'name': 'Zanele Both', 'email': 'zanele@example.test', 'phone': '0821234567', 'image': '', 'city': 'Cape Town', 'province': 'Western Cape', 'payout_method': 'bank', 'bank_name': 'FNB', 'bank_account_number': '1234567890', 'can_edit': True, 'can_view_payout': True, 'created_at': trade['created_at']}]
                elif path == '/admin/users': body['items'] = admin_users
                elif path == '/auth/sessions': body = {'sessions': []}
                elif path == '/profile': body = dict.fromkeys(['image', 'avatar_url', 'phone', 'id_number', 'business_name', 'business_registration_number', 'bank_account_holder_name', 'bank_name', 'bank_account_number', 'bank_branch_code', 'bank_account_type', 'street_address', 'city', 'province'], '') | {'id': 'buyer', 'name': 'Layout Buyer', 'first_name': 'Layout', 'last_name': 'Buyer', 'email': 'layout@example.test', 'role': role, 'profile_complete': True, 'agreed_to_terms': True, 'area_code': None}
                elif path == '/collectors/selection' or (path == '/materials' and 'all=true' in route.request.url): body = []
                elif path == '/transactions/totals': body = totals
                elif path == '/transactions/trade': body = trade
                elif path in ['/transactions', '/transactions/', '/transactions/purchases', '/transactions/sales']: body['items'] = [trade, large_trade, dict(large_trade, id='unverified', business_verified=False)] + [dict(trade, id=str(i)) for i in range(4)]
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
                if width in [1100, 1440] and route not in ['/transactions', '/collectors', '/admin/users']: continue
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
                    if route == '/' and width < 1024:
                        header = page.locator('h1').locator('xpath=ancestor::header[1]')
                        title_box = header.locator('h1').bounding_box()
                        action_box = header.get_by_role('button', name='View transactions').bounding_box()
                        description = header.locator('p')
                        assert action_box['y'] >= description.bounding_box()['y'] + description.bounding_box()['height']
                        assert action_box['width'] >= header.bounding_box()['width'] - 1
                        assert description.evaluate('(el) => el.scrollWidth <= el.clientWidth')
                        quick = page.get_by_role('heading', name='Your workspace').locator('xpath=ancestor::section[1]').get_by_role('button')
                        expect(quick).to_have_count(3)
                        boxes = [tile.bounding_box() for tile in quick.all()]
                        assert max(b['y'] for b in boxes) - min(b['y'] for b in boxes) < 1
                        assert max(b['width'] for b in boxes) - min(b['width'] for b in boxes) < 1
                        assert all(b['height'] >= 44 for b in boxes)
                        tick_labels = page.locator('svg text').filter(has_text=re.compile(r'^\d{2} (Oct|Nov)$'))
                        expect(tick_labels).to_have_count(2)
                        tick_boxes = [label.bounding_box() for label in tick_labels.all()]
                        assert 1 <= len(tick_boxes) <= 2
                        assert all(tick_boxes[i]['x'] + tick_boxes[i]['width'] < tick_boxes[i+1]['x'] for i in range(len(tick_boxes)-1))
                    if route in ['/transactions', '/transactions/purchases', '/market/incoming', '/market/outgoing']:
                        if width >= 1024:
                            container = page.locator('[data-slot="table-container"]')
                            assert container.evaluate('(el) => el.scrollWidth <= el.clientWidth + 1'), f'table scrolls {route} {width}'
                            for cell in page.locator('tbody td').all():
                                if cell.is_visible():
                                    assert cell.evaluate('(el) => el.scrollWidth <= el.clientWidth + 1'), f'cell content spills {route} {width}: {cell.inner_text()}'
                                    box = cell.bounding_box()
                                    assert box['x'] + box['width'] <= container.bounding_box()['x'] + container.bounding_box()['width'] + 1
                            if route.startswith('/transactions'):
                                expect(page.get_by_role('columnheader', name='Type', exact=True)).to_have_count(0)
                                for cell in page.locator('tbody tr').nth(1).locator('td').all()[-2:]:
                                    assert cell.evaluate('(el) => el.scrollWidth <= el.clientWidth + 1'), f'numeric cell clipped {route} {width}'
                        else:
                            rows = page.locator('[data-slot="record-row"]')
                            assert rows.count() > 0
                            for row in rows.all():
                                assert row.bounding_box()['height'] <= 88, f'compact content too tall {route} {width}'
                                meta = row.locator('[data-slot="record-meta"]')
                                assert not re.search(r'\b(C2B|B2B)\b', meta.inner_text())
                                assert meta.bounding_box()['height'] <= 20
                                assert meta.evaluate('(el) => el.scrollWidth <= el.clientWidth + 1'), f'footer clips {route} {width}'
                            stress = rows.nth(1) if route.startswith('/transactions') else rows.first
                            parties = stress.locator('[data-slot="record-parties"]')
                            assert 'Zanele Both' in parties.inner_text() and 'Kasi Collect Co' in parties.inner_text()
                            assert parties.evaluate('(el) => el.scrollWidth <= el.clientWidth + 1')
                    if route in ['/transactions', '/collectors', '/admin/users'] and width in [1100, 1280, 1440, 1920]:
                        container = page.locator('[data-slot="table-container"]')
                        expect(container).to_have_count(1)
                        geometry = container.evaluate('(el) => ({width: el.clientWidth, scrollWidth: el.scrollWidth})')
                        assert geometry['scrollWidth'] <= geometry['width'] + 1, f'table scrolls {route} {width}: {geometry}'
                        if route == '/transactions':
                            materials = page.locator('tbody tr').first.locator('td').nth(1)
                            geometry['materials'] = materials.bounding_box()['width']
                            geometry['materialsText'] = materials.locator('span').evaluate('(el) => el.clientWidth')
                            assert geometry['materialsText'] >= 80, f'Materials squeezed {width}: {geometry}'
                        if route == '/collectors':
                            heading = page.get_by_role('heading', name='Collector directory', exact=True).locator('..')
                            expect(heading.get_by_text('Verified business', exact=True)).to_be_visible()
                            description = heading.locator('..').locator('p')
                            assert description.evaluate('(el) => getComputedStyle(el).whiteSpace') == 'normal'
                            assert description.evaluate('(el) => el.scrollHeight <= el.clientHeight + 1')
                        measurements.append(dict(mode=mode, viewport=width, route=route, **geometry))
                        print(f'B2 {mode} {width} {route}: {json.dumps(geometry)}', flush=True)
                        if os.environ.get('THREERECO_B2_SHOTS'):
                            shots = Path(os.environ['THREERECO_B2_SHOTS'])
                            shots.mkdir(parents=True, exist_ok=True)
                            page.screenshot(path=str(shots / (mode + '-' + str(width) + '-' + route.strip('/').replace('/', '-') + '.png')), full_page=True)
                    if route == '/admin/users' and width >= 1024:
                        container = page.locator('[data-slot="table-container"]')
                        assert container.evaluate('(el) => el.scrollWidth <= el.clientWidth + 1'), f'admin table scrolls {width}'
                        page.get_by_role('button', name='Actions for Naledi Jacobs', exact=True).click()
                        remove_verification = page.get_by_role('menuitem', name='Remove verification', exact=True)
                        expect(remove_verification).to_have_count(1)
                        remove_verification.click()
                        dialog = page.get_by_role('alertdialog')
                        expect(dialog).to_be_visible()
                        expect(dialog.get_by_role('heading', name='Remove verification for Naledi Jacobs?')).to_be_visible()
                        dialog.get_by_role('button', name='Keep it', exact=True).click()
                    if route == '/profile' and width < 1024:
                        buttons = page.get_by_role('button', name='Cancel changes').first.locator('..').get_by_role('button')
                        expect(buttons).to_have_count(2)
                        boxes = [button.bounding_box() for button in buttons.all()]
                        assert abs(boxes[0]['width'] - boxes[1]['width']) < 1
                    if route in ['/transactions', '/transactions/purchases', '/market/incoming', '/market/outgoing']:
                        expect(page.get_by_role('table')).to_have_count(1 if width >= 1024 else 0)
                    if route in ['/transactions', '/transactions/purchases']:
                        flow = page.locator('[data-slot="trade-parties"]').filter(has_text='Zanele Both').first
                        assert flow.evaluate('(el) => getComputedStyle(el).display') == 'inline'
                        expect(flow.locator('span.whitespace-nowrap').filter(has_text=re.compile(r'^→ Kasi$'))).to_have_count(1)
                        for check in flow.get_by_role('img', name='Verified business').all():
                            assert check.evaluate('(el) => getComputedStyle(el.parentElement).whiteSpace') == 'nowrap'
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
                    if os.environ.get('THREERECO_LAYOUT_SHOTS') and width in [390, 1280] and route in ['/', '/?role=collector', '/?role=admin', '/transactions/trade?from=/transactions/purchases', '/transactions', '/profile', '/market/incoming', '/admin/users']:
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
if os.environ.get('THREERECO_B2_SHOTS'):
    (Path(os.environ['THREERECO_B2_SHOTS']) / 'measurements.json').write_text(json.dumps(measurements, indent=2))
print('212 route/theme/viewport checks passed')
`;
