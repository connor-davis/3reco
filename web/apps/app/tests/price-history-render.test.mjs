import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createPortServer } from 'node:net';

test(
  'price trend renders gaps, states and exact prices in light/dark on phone/desktop',
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
      cacheDir: 'node_modules/.vite-price-history',
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
from datetime import date, timedelta
from playwright.sync_api import sync_playwright, expect

base = sys.argv[1]
with sync_playwright() as p:
    browser = p.chromium.launch()
    for mode in ['light', 'dark']:
        for width in [390, 1440]:
            context = browser.new_context(viewport={'width': width, 'height': 1000}, color_scheme=mode)
            state = {'kind': 'empty', 'role': 'business', 'calls': 0, 'loading': False}
            errors = []
            def handle(route):
                path = urlparse(route.request.url).path.removeprefix('/api')
                body, code = {'items': [], 'has_more': False}, 200
                if path == '/auth/me':
                    role = state['role']
                    body = {'user': {'id': 'buyer', 'name': 'Buyer', 'email': 'buyer@example.test', 'role': role, 'emailVerified': True, 'profileComplete': True, 'agreedToTerms': True, 'business_verified': True, 'active_business_id': 'buyer' if role == 'business' else '', 'business_role': 'owner' if role == 'business' else ''}}
                elif path == '/auth/sessions': body = {'sessions': []}
                elif path == '/businesses/mine': body = []
                elif path == '/materials':
                    body = [{'id': 'glass', 'name': 'Glass', 'price': '5', 'carbon_factor': '1', 'gw_code': 'GL'}]
                elif path.endswith('/price-history'):
                    state['calls'] += 1
                    if state['kind'] == 'error':
                        body, code = {'message': 'Unavailable'}, 400
                    else:
                        body = {'weeks': [{'period': str(date(2026, 8, 31) + timedelta(weeks=i)), 'avg_price': '6.00' if i % 2 == 0 and state['kind'] == 'prices' else None, 'status': 'available' if i % 2 == 0 and state['kind'] == 'prices' else 'not_enough_deals'} for i in range(12)]}
                elif path == '/market/distance': body = {'enabled': True, 'has_origin': True}
                elif path == '/stats': body = {'total_kg': '0', 'co2_kg': '0', 'deals': 0}
                elif path in ['/favourites/ids', '/follows/ids']: body = {'ids': []}
                elif path.endswith('/unread-count'): body = {'count': 0}
                route.fulfill(status=code, content_type='application/json', body=json.dumps(body))
            context.route(base + '/api/**', handle)
            context.route_web_socket('**/api/live', lambda ws: None)
            page = context.new_page()
            page.set_default_timeout(15000)
            page.on('pageerror', lambda error: errors.append(str(error)))
            # The deliberate 400 response is checked below; other console errors fail.
            page.on('console', lambda message: errors.append(message.text) if message.type == 'error' and '400 (Bad Request)' not in message.text else None)
            page.goto(base + '/market?material_id=glass')
            page.wait_for_load_state('networkidle')
            trend = page.get_by_role('button', name='See trend', exact=True)
            # Too few deals: no card, no empty text, no trend line.
            expect(trend).to_have_count(0)
            expect(page.get_by_text('Not enough deals', exact=False)).to_have_count(0)
            expect(page.get_by_role('heading', name='Price trend', exact=True)).to_have_count(0)
            expect(page.locator('html')).to_have_class(mode)
            assert page.locator('html').evaluate('(el) => el.scrollWidth <= innerWidth'), (mode, width, 'empty overflow')
            state['kind'] = 'prices'
            page.reload()
            page.wait_for_load_state('networkidle')
            expect(page.get_by_text('Avg R 6.00/kg, week of', exact=False)).to_be_visible()
            expect(page.locator('[data-chart]')).to_have_count(0)
            trend.click()
            expect(page.get_by_role('heading', name='Price trend', exact=True)).to_be_visible()
            expect(page.locator('[data-chart]')).to_be_visible()
            for path in page.locator('.recharts-line path').all():
                shape = path.get_attribute('d') or ''
                assert 'L' not in shape, ('isolated points must not be joined across suppressed weeks', shape)
            expect(page.locator('.recharts-line-dots circle')).to_have_count(6)
            expect(page.get_by_role('list', name='Weekly prices')).to_contain_text('R 6.00 / kg')
            expect(page.get_by_role('list', name='Weekly prices')).to_contain_text('Not enough deals')
            dot = page.locator('.recharts-line-dots circle').first
            dot.hover(force=True)
            expect(page.locator('.recharts-tooltip-wrapper')).to_contain_text('R 6.00 / kg')
            assert page.locator('html').evaluate('(el) => el.scrollWidth <= innerWidth'), (mode, width, 'chart overflow')
            state['kind'] = 'error'
            page.reload()
            page.wait_for_load_state('networkidle')
            expect(trend).to_have_count(0)
            expect(page.get_by_text('Price trends could not be loaded.', exact=True)).to_have_count(0)
            calls = state['calls']
            page.goto(base + '/market')
            page.wait_for_load_state('networkidle')
            expect(trend).to_have_count(0)
            assert state['calls'] == calls
            state['role'] = 'collector'
            page.goto(base + '/market?material_id=glass')
            page.wait_for_load_state('networkidle')
            expect(trend).to_have_count(0)
            assert state['calls'] == calls
            assert not errors, errors
            context.close()
    browser.close()
`;
