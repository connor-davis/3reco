import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createPortServer } from 'node:net';

test(
  'duplicate review states, decisions and collection keys on phone/desktop in both themes',
  { timeout: 240000 },
  async () => {
    const { createServer } = await import('vite');
    const reservation = createPortServer();
    await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
    const port = reservation.address().port;
    await new Promise((resolve, reject) =>
      reservation.close((error) => (error ? reject(error) : resolve()))
    );
    const server = await createServer({
      cacheDir: 'node_modules/.vite-duplicates',
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
import sys, json, re
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

base = sys.argv[1]
out = Path('../../../mystuff/checks/duplicates-render')
out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch()
    for mode in ['light', 'dark']:
        for width in [390, 1440]:
            context = browser.new_context(viewport={'width': width, 'height': 1000}, color_scheme=mode)
            context.add_init_script("localStorage.setItem('vite-ui-theme', '" + mode + "')")
            user = {'id': 'admin', 'name': 'Nomsa', 'email': 'nomsa@example.test', 'role': 'admin', 'profileComplete': True, 'emailVerified': True, 'agreedToTerms': True}
            party = lambda id: {'id': id, 'name': id, 'verified': True}
            def trade(id, status='complete', kind='c2b'):
                return {'id': id, 'type': kind, 'status': status, 'duplicate_of': 'original' if status == 'duplicate' else None, 'effective_at': '2026-11-08T08:00:00Z', 'collection_day': '2026-11-08', 'created_at': '2026-11-08T08:00:00Z', 'invoice_number': id, 'seller': party('Thandi Collector'), 'buyer': party('Greenloop Recycling'), 'total_price': '20', 'business_verified': True, 'items': [{'material_id': 'glass', 'material_name': 'Glass', 'weight': '4.00', 'price': '5.00'}], 'receipts': []}
            original, copy = trade('original'), trade('copy')
            data = {'groups': [{'kind': 'exact', 'original_id': 'original', 'trades': [original, copy, trade('copy-three')]}], 'marked': [trade('marked', 'duplicate')]}
            state, actions, errors, sockets, collection_keys = {'value': 'ready'}, [], [], [], []
            held, pending_collection, pending_mark = [], [], []
            def handle(route):
                path = urlparse(route.request.url).path.removeprefix('/api')
                body = {'items': [], 'has_more': False, 'count': 0}
                if path == '/auth/me': body = {'user': user}
                elif path == '/auth/sessions': body = {'sessions': []}
                elif path == '/businesses/mine': body = []
                elif path == '/transactions/collections' and route.request.method == 'POST':
                    collection_keys.append(route.request.headers.get('idempotency-key'))
                    if len(collection_keys) == 1:
                        pending_collection.append(route)
                        return
                    body = {'transaction_id': 'saved'}
                elif path == '/collectors/selection': body = [{'id': 'collector', 'name': 'Thandi Collector', 'phone': '+27820000001'}]
                elif path == '/materials': body = {'items': [{'id': 'glass', 'name': 'Glass', 'price': '5', 'carbon_factor': '2', 'gw_code': 'GW'}]}
                elif path == '/transactions/totals': body = {'count': 0, 'weight': '0', 'value': '0'}
                elif path == '/admin/duplicates':
                    if state['value'] == 'loading':
                        held.append(route)
                        return
                    if state['value'] == 'error':
                        route.fulfill(status=403, content_type='application/json', body=json.dumps({'message': 'Review is unavailable.'}))
                        return
                    body = {'groups': [], 'marked': []} if state['value'] == 'empty' else data
                elif path.startswith('/admin/duplicates/'):
                    actions.append((path, route.request.post_data_json))
                    if path.endswith('/mark'):
                        data['groups'] = []; data['marked'] = [trade('copy', 'duplicate')]
                        pending_mark.append(route)
                        return
                    elif path.endswith('/undo'): data['marked'] = []
                    elif path.endswith('/dismiss'): data['groups'] = []
                    body = {'ok': True}
                route.fulfill(content_type='application/json', body=json.dumps(body))
            context.route(base + '/api/**', handle)
            context.route_web_socket('**/api/live', lambda ws: sockets.append(ws))
            page = context.new_page()
            page.set_default_timeout(12000)
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('console', lambda message: errors.append(message.text) if message.type == 'error' and '503' not in message.text and '403' not in message.text else None)
            try:
                state['value'] = 'loading'
                page.goto(base + '/admin/duplicates')
                expect(page.locator('[aria-busy="true"]').first).to_be_visible()
                state['value'] = 'ready'
                for route in held: route.fulfill(content_type='application/json', body=json.dumps(data))
                expect(page.get_by_text('Suggested original', exact=True)).to_be_visible()
                expect(page.get_by_role('heading', name='Invoice copy-three', exact=True)).to_be_visible()
                assert page.locator('html').evaluate('(el) => el.scrollWidth <= innerWidth'), (mode, width)
                assert 'R' in page.get_by_role('heading', name='Invoice original', exact=True).locator('..').locator('..').inner_text()
                page.screenshot(path=str(out / f'{mode}-{width}.png'), full_page=True)
                page.get_by_role('button', name='Mark as duplicate', exact=True).first.click()
                expect(page.get_by_role('button', name='Mark as duplicate', exact=True).first).to_be_disabled()
                expect(page.get_by_role('button', name='Mark as duplicate', exact=True).last).to_be_disabled()
                pending_mark.pop().fulfill(content_type='application/json', body=json.dumps({'ok': True}))
                expect(page.get_by_role('button', name='Mark as duplicate', exact=True)).to_have_count(0)
                assert actions[-1] == ('/admin/duplicates/copy/mark', {'original_id': 'original'})
                page.get_by_role('button', name='Undo', exact=True).click()
                expect(page.get_by_text('No duplicates to review', exact=True)).to_be_visible()
                assert actions[-1][0] == '/admin/duplicates/copy/undo'
                # A server event refreshes the scan, with no polling or navigation.
                data['groups'] = [{'kind': 'possible', 'original_id': 'original', 'trades': [original, copy]}]
                sockets[-1].send(json.dumps({'type': 'changed', 'kind': 'duplicate', 'id': 'dismissal'}))
                expect(page.get_by_role('heading', name='Possible match', exact=True)).to_be_visible()
                expect(page.get_by_role('button', name='Mark as duplicate', exact=True)).to_have_count(0)
                page.get_by_role('button', name='Not a duplicate', exact=True).click()
                expect(page.get_by_text('No duplicates to review', exact=True)).to_be_visible()
                assert actions[-1][1] == {'ids': ['original', 'copy']}
                state['value'] = 'error'
                page.reload()
                expect(page.get_by_text('Review is unavailable.', exact=True)).to_be_visible()
                state['value'] = 'empty'
                page.get_by_role('button', name='Try again', exact=True).click()
                expect(page.get_by_text('No duplicates to review', exact=True)).to_be_visible()
                # Collection retries keep the key; a new dialog opening changes it.
                user.update(role='business', active_business_id='business', business_role='manager')
                page.goto(base + '/collections')
                page.get_by_role('button', name='Record collection', exact=True).click()
                dialog = page.get_by_role('dialog', name='Record collection', exact=True)
                dialog.get_by_role('combobox', name='Collector', exact=True).fill('Thandi')
                page.get_by_role('option', name=re.compile('Thandi Collector')).click()
                dialog.get_by_role('combobox', name='Material', exact=True).click()
                page.get_by_role('option', name='Glass', exact=True).click()
                dialog.get_by_label('Weight', exact=True).fill('4')
                dialog.get_by_role('button', name='Record collection', exact=True).click()
                expect(dialog.get_by_role('button', name='Record collection', exact=True)).to_be_disabled()
                pending_collection.pop().fulfill(status=503, content_type='application/json', body=json.dumps({'message': 'Try saving again.'}))
                expect(dialog.get_by_text('Try saving again.', exact=True)).to_be_visible()
                dialog.get_by_role('button', name='Record collection', exact=True).click()
                expect(dialog).not_to_be_visible()
                assert collection_keys[0] and collection_keys[0] == collection_keys[1], collection_keys
                page.get_by_role('button', name='Record collection', exact=True).click()
                dialog = page.get_by_role('dialog', name='Record collection', exact=True)
                dialog.get_by_role('combobox', name='Collector', exact=True).fill('Thandi')
                page.get_by_role('option', name=re.compile('Thandi Collector')).click()
                dialog.get_by_role('combobox', name='Material', exact=True).click()
                page.get_by_role('option', name='Glass', exact=True).click()
                dialog.get_by_label('Weight', exact=True).fill('4')
                dialog.get_by_role('button', name='Record collection', exact=True).click()
                expect(dialog).not_to_be_visible()
                assert collection_keys[2] != collection_keys[0], collection_keys
                assert not errors, errors
            except Exception:
                page.screenshot(path=str(out / f'failure-{mode}-{width}.png'), full_page=True)
                print('PAGE ERRORS:', errors)
                raise
            finally:
                context.close()
    browser.close()
print('Duplicate states, decisions, live refresh and collection keys passed in four theme/viewport cells')
`;
