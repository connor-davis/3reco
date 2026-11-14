import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createPortServer } from 'node:net';

test(
  'Transactions filters and redirects render in light and dark on phone and desktop',
  { timeout: 180000 },
  async () => {
    const { createServer } = await import('vite');
    const reservation = createPortServer();
    await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
    const port = reservation.address().port;
    await new Promise((resolve, reject) =>
      reservation.close((error) => (error ? reject(error) : resolve()))
    );
    const server = await createServer({
      cacheDir: 'node_modules/.vite-transactions',
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
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

base = sys.argv[1]
with sync_playwright() as p:
    browser = p.chromium.launch()
    for mode in ['light', 'dark']:
        for width in [390, 1440]:
            context = browser.new_context(viewport={'width': width, 'height': 1000}, color_scheme=mode)
            context.add_init_script("localStorage.setItem('vite-ui-theme', '" + mode + "')")
            user = {'id': 'person', 'name': 'Nomsa', 'email': 'nomsa@example.test', 'role': 'business', 'active_business_id': 'business-a', 'business_role': 'manager', 'profileComplete': True, 'emailVerified': True, 'agreedToTerms': True}
            def party(id): return {'id': id, 'name': id, 'business_name': id, 'role': 'business', 'business_verified': True}
            def trade(id, seller, buyer):
                return {'id': id, 'type': 'b2b', 'status': 'complete', 'effective_at': '2026-11-08T08:00:00Z', 'created_at': '2026-11-08T08:00:00Z', 'invoice_number': id, 'seller': party(seller), 'buyer': party(buyer), 'total_price': '16', 'business_verified': True, 'items': [{'material_id': 'glass', 'material_name': id + ' glass', 'weight': '2', 'price': '8'}], 'receipts': []}
            bought = trade('Bought-invoice', 'business-b', 'business-a')
            sold = trade('Sold-invoice', 'business-a', 'business-b')
            requests, errors = [], []
            def handle(route):
                parsed = urlparse(route.request.url)
                path = parsed.path.removeprefix('/api')
                query = parse_qs(parsed.query)
                requests.append((path, query))
                body = {'items': [], 'has_more': False, 'count': 0}
                if path == '/auth/me': body = {'user': user}
                elif path == '/auth/sessions': body = {'sessions': []}
                elif path == '/transactions/totals': body = {'count': 2, 'weight': '4', 'value': '32', 'carbon_savings': '1'}
                elif path.startswith('/transactions/') and path.split('/')[-1] in ['Bought-invoice', 'Sold-invoice']: body = bought if path.endswith('Bought-invoice') else sold
                elif path.startswith('/transactions'):
                    rows = [bought] if path.endswith('/purchases') else [sold] if path.endswith('/sales') else [bought, sold]
                    body = {'items': rows, 'has_more': False, 'next_cursor': None}
                elif '/exports/' in path:
                    route.fulfill(status=200, content_type='text/csv', body='id\nexample\n'); return
                route.fulfill(status=200, content_type='application/json', body=json.dumps(body))
            context.route(base + '/api/**', handle)
            context.route_web_socket('**/api/live', lambda ws: None)
            page = context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
            try:
                page.goto(base + '/transactions')
                page.wait_for_load_state('networkidle')
                expect(page.get_by_role('heading', name='Transactions', exact=True)).to_be_visible()
                expect(page.get_by_text('Bought glass', exact=True)).to_have_count(0)
                expect(page.get_by_text('Bought-invoice glass', exact=True)).to_be_visible()
                expect(page.get_by_text('Sold-invoice glass', exact=True)).to_be_visible()
                rows = page.get_by_role('row') if width >= 1024 else page.locator('[data-slot="record-row"]')
                for invoice, label in [('Bought-invoice', 'Bought'), ('Sold-invoice', 'Sold')]:
                    expect(rows.filter(has_text=invoice + ' glass').first.get_by_text(label, exact=True)).to_be_visible()
                expect(page.get_by_role('button', name='Export', exact=True)).to_be_disabled()
                expect(page.get_by_text('Pick Bought or Sold to export', exact=True)).to_be_visible()
                assert page.locator('html').evaluate('(el) => el.scrollWidth <= innerWidth')
                page.get_by_role('tab', name='Bought', exact=True).click()
                expect(page.get_by_text('Sold-invoice glass', exact=True)).to_have_count(0)
                expect(page.get_by_text('Bought-invoice glass', exact=True)).to_be_visible()
                expect(page.get_by_role('button', name='Export', exact=True)).to_be_enabled()
                with page.expect_download(): page.get_by_role('button', name='Export', exact=True).click()
                assert any(path == '/exports/purchases' for path, _ in requests)
                page.get_by_role('tab', name='Sold', exact=True).click()
                expect(page.get_by_text('Bought-invoice glass', exact=True)).to_have_count(0)
                expect(page.get_by_text('Sold-invoice glass', exact=True)).to_be_visible()
                with page.expect_download(): page.get_by_role('button', name='Export', exact=True).click()
                assert any(path == '/exports/sales' for path, _ in requests)
                for old, filter in [('purchases', 'bought'), ('sales', 'sold')]:
                    page.goto(base + '/transactions/' + old)
                    page.wait_for_load_state('networkidle')
                    assert urlparse(page.url).path == '/transactions'
                    assert parse_qs(urlparse(page.url).query)['filter'] == [filter]
                page.goto(base + '/transactions/purchases?open=Bought-invoice')
                expect(page.get_by_role('heading', name='Invoice Bought-invoice', exact=True)).to_be_visible()
                assert '/transactions/Bought-invoice' in page.url
                user['role'] = 'staff'
                page.goto(base + '/transactions?filter=sold')
                page.wait_for_load_state('networkidle')
                expect(page.get_by_role('heading', name='All transactions', exact=True)).to_be_visible()
                expect(page.get_by_role('tab', name='Bought', exact=True)).to_have_count(0)
                expect(page.get_by_role('combobox', name='Transaction type', exact=True)).to_be_visible() if width >= 1024 else None
                user['role'] = 'collector'
                page.goto(base + '/transactions/sales')
                page.wait_for_load_state('networkidle')
                expect(page.get_by_role('heading', name='Sales', exact=True)).to_be_visible()
                assert urlparse(page.url).path == '/transactions/sales'
                expect(page.get_by_role('button', name='Export', exact=True)).to_have_count(0)
                assert not errors, errors
            finally:
                context.close()
    browser.close()
print('Transactions passed in light/dark on phone/desktop')
`;
