import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createPortServer } from 'node:net';

test(
  'saved searches save, reopen and delete on phone/desktop in light/dark',
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
      cacheDir: 'node_modules/.vite-saved-searches',
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
            searches = []
            writes = []
            errors = []
            state = {'fail_next': False, 'saw_loading': False}
            def handle(route):
                path = urlparse(route.request.url).path.removeprefix('/api')
                body = {'items': [], 'has_more': False, 'next_cursor': None, 'count': 0}
                code = 200
                if path == '/auth/me':
                    body = {'user': {'id': 'buyer', 'name': 'Buyer', 'email': 'buyer@example.test', 'role': 'business', 'emailVerified': True, 'profileComplete': True, 'agreedToTerms': True, 'business_verified': True, 'active_business_id': 'buyer', 'business_role': 'owner'}}
                elif path == '/auth/sessions':
                    body = {'sessions': []}
                elif path == '/saved-searches':
                    if route.request.method == 'POST':
                        data = route.request.post_data_json
                        writes.append(data)
                        searches.append(dict(data, id='search', material_name='Glass', created_at='2026-11-16T08:00:00Z'))
                        body, code = {'id': 'search'}, 201
                    elif state['fail_next']:
                        expect(page.locator('[aria-busy="true"]').first).to_be_visible()
                        state['saw_loading'] = True
                        state['fail_next'] = False
                        body, code = {'message': 'Searches are unavailable.'}, 400
                    else:
                        body = {'items': searches}
                elif path == '/saved-searches/search':
                    searches.clear()
                    body = {'ok': True}
                elif path == '/materials':
                    body = [{'id': 'glass', 'name': 'Glass', 'price': '5', 'carbon_factor': '1', 'gw_code': 'GL'}]
                elif path == '/businesses/mine':
                    body = []
                elif path == '/market/distance':
                    body = {'enabled': True, 'has_origin': True}
                elif path == '/stats':
                    body = {'total_kg': '0', 'co2_kg': '0', 'deals': 0}
                elif path in ['/favourites/ids', '/follows/ids']:
                    body = {'ids': []}
                elif path.endswith('/unread-count'):
                    body = {'count': 0}
                route.fulfill(status=code, content_type='application/json', body=json.dumps(body))
            context.route(base + '/api/**', handle)
            context.route_web_socket('**/api/live', lambda ws: None)
            page = context.new_page()
            page.set_default_timeout(15000)
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
            page.goto(base + '/market?material_id=glass&min_price=7.0100&max_price=9.9900&max_km=25&q=local')
            page.wait_for_load_state('networkidle')
            assert not errors, errors
            expect(page.locator('html')).to_have_class('dark' if mode == 'dark' else 'light')
            # Phones keep Save inside the Filters sheet; wide screens have it in the results row.
            if width < 1024:
                page.get_by_role('button', name='Filters (4)', exact=True).click()
                save = page.get_by_role('button', name='Save this search', exact=True)
            else:
                save = page.get_by_role('button', name='Save search', exact=True)
            expect(save).to_be_enabled()
            save.click()
            expect(page.get_by_text('Search saved. Manage it in Saved.', exact=True)).to_be_visible()
            assert writes == [{'material_id': 'glass', 'min_price': '7.0100', 'max_price': '9.9900'}], writes
            page.goto(base + '/saved')
            page.wait_for_load_state('networkidle')
            page.get_by_role('tab', name='Searches', exact=True).click()
            link = page.get_by_role('link', name='Glass R 7.0100 – R 9.9900 per kg', exact=True)
            expect(link).to_be_visible()
            assert page.locator('html').evaluate('(el) => el.scrollWidth <= innerWidth'), (mode, width, 'saved overflow')
            delete = page.get_by_role('button', name='Delete saved search for Glass', exact=True)
            assert delete.bounding_box()['height'] >= 44
            link.click()
            page.wait_for_load_state('networkidle')
            query = parse_qs(urlparse(page.url).query)
            assert set(query) == {'material_id', 'min_price', 'max_price'}, query
            page.get_by_role('button', name='Filters (3)', exact=True).click()
            expect(page.get_by_role('textbox', name='Lowest R / kg', exact=True)).to_have_value('7.0100')
            expect(page.get_by_role('textbox', name='Highest R / kg', exact=True)).to_have_value('9.9900')
            page.goto(base + '/saved')
            page.get_by_role('tab', name='Searches', exact=True).click()
            page.get_by_role('button', name='Delete saved search for Glass', exact=True).click()
            expect(page.get_by_text('No saved searches yet', exact=True)).to_be_visible()
            page.goto(base + '/market')
            if width < 1024:
                page.get_by_role('button', name='Filters', exact=True).click()
                expect(page.get_by_role('button', name='Save this search', exact=True)).to_be_disabled()
            else:
                expect(page.get_by_role('button', name='Save search', exact=True)).to_have_count(0)
            assert page.locator('html').evaluate('(el) => el.scrollWidth <= innerWidth'), (mode, width, 'market overflow')
            assert not errors, errors
            # Observe loading before the response arrives, then fail it and retry.
            state['fail_next'] = True
            page.goto(base + '/saved', wait_until='domcontentloaded')
            page.get_by_role('tab', name='Searches', exact=True).click()
            expect(page.get_by_text('Searches are unavailable.', exact=True)).to_be_visible()
            assert state['saw_loading']
            page.get_by_role('button', name='Try again', exact=True).click()
            expect(page.get_by_text('No saved searches yet', exact=True)).to_be_visible()
            context.close()
    browser.close()
`;
