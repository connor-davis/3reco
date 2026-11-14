import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createPortServer } from 'node:net';

test(
  'workspace picker switches businesses, clears page data and updates other tabs in both themes',
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
      cacheDir: 'node_modules/.vite-workspace-picker',
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
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

base = sys.argv[1]
out = Path('../../../mystuff/checks/workspace-picker-render')
out.mkdir(parents=True, exist_ok=True)
screenshots = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    for mode in ['light', 'dark']:
        for width in [360, 390, 1024, 1440]:
            context = browser.new_context(viewport={'width': width, 'height': 900}, color_scheme=mode)
            context.add_init_script("localStorage.setItem('vite-ui-theme', '" + mode + "')")
            user = {'id': 'person', 'name': 'Naledi Jacobs', 'email': 'naledi@example.test', 'role': 'business', 'active_business_id': 'a', 'business_role': 'owner', 'businessName': 'Alpha Recycling', 'profileComplete': True, 'emailVerified': True, 'agreedToTerms': True}
            businesses = [{'id': 'a', 'name': 'Alpha Recycling', 'role': 'owner', 'has_logo': False}, {'id': 'b', 'name': 'Beta Materials Recovery and Recycling Company', 'role': 'member', 'has_logo': False}]
            calls = []
            errors = []
            def handle(route):
                path = urlparse(route.request.url).path.removeprefix('/api')
                calls.append(path)
                body = {'items': [], 'has_more': False, 'count': 0}
                if path == '/auth/me': body = {'user': user}
                elif path == '/auth/sessions': body = {'sessions': []}
                elif path == '/businesses/mine': body = businesses
                elif path == '/businesses/b/select':
                    user.update(active_business_id='b', business_role='member', businessName=businesses[1]['name'])
                    body = {'user': user}
                elif path == '/team': body = {'members': [{'id': 'teammate', 'name': 'Old business teammate', 'email': user['email'], 'role': 'owner'}], 'invites': []}
                elif path == '/stock': body = {'items': [{'id': user['active_business_id'], 'owner_id': user['active_business_id'], 'material_id': 'glass', 'material_name': 'Alpha glass' if user['active_business_id'] == 'a' else 'Beta cardboard', 'weight': '10', 'available_weight': '10', 'price': '1', 'base_price': '1', 'is_listed': False, 'image_url': '', 'created_at': '2026-11-01T00:00:00Z'}], 'has_more': False}
                elif path.startswith('/dashboard/'):
                    body = {'from': '2026-11-01T00:00:00Z', 'to': '2026-11-14T00:00:00Z', 'totals': {'count': 0, 'weight': '0', 'value': '0', 'carbon_savings': '0'}, 'series': [], 'counterparties': []}
                elif path == '/stats': body = {'total_kg': '0', 'co2_kg': '0', 'deals': 0, 'top_stores': []}
                route.fulfill(status=200, content_type='application/json', body=json.dumps(body))
            context.route(base + '/api/**', handle)
            context.route_web_socket('**/api/live', lambda ws: None)
            page = context.new_page()
            page.set_default_timeout(10000)
            page.on('pageerror', lambda error: errors.append(str(error)))
            second = context.new_page()
            second.set_default_timeout(10000)
            try:
                page.goto(base + '/team')
                page.wait_for_load_state('networkidle')
                expect(page.get_by_text('Old business teammate', exact=True)).to_be_visible()
                trigger = page.get_by_role('button', name='Workspace: Alpha Recycling, Owner', exact=True)
                expect(trigger).to_be_visible()
                second.goto(base + '/stock')
                second.wait_for_load_state('networkidle')
                expect(second.get_by_role('button', name='Workspace: Alpha Recycling, Owner', exact=True)).to_be_visible()
                expect(second.get_by_text('Alpha glass', exact=True).first).to_be_visible()
                trigger.click()
                expect(page.get_by_role('menu')).to_be_visible()
                expect(page.get_by_label('Active workspace', exact=True)).to_be_visible()
                assert page.locator('html').evaluate('(el) => el.scrollWidth <= innerWidth'), 'Picker overflows'
                page.get_by_role('menu').evaluate('(el) => Promise.all(el.getAnimations().map((animation) => animation.finished))')
                target = out / f'{mode}-{width}.png'
                page.screenshot(path=str(target), full_page=True)
                screenshots.append(str(target))
                page.get_by_role('menuitem', name='Beta Materials Recovery and Recycling Company Member').click()
                page.wait_for_url(base + '/')
                expect(page.get_by_role('button', name='Workspace: Beta Materials Recovery and Recycling Company, Member', exact=True)).to_be_visible()
                expect(page.get_by_text('Old business teammate', exact=True)).to_have_count(0)
                expect(second.get_by_role('button', name='Workspace: Beta Materials Recovery and Recycling Company, Member', exact=True)).to_be_visible()
                expect(second.get_by_text('Alpha glass', exact=True)).to_have_count(0)
                expect(second.get_by_text('Beta cardboard', exact=True).first).to_be_visible()
                assert '/businesses/b/select' in calls and '/auth/me' in calls[calls.index('/businesses/b/select') + 1:]
                assert page.locator('html').evaluate('(el) => el.scrollWidth <= innerWidth'), 'Long business name overflows'
                assert not errors, errors
            finally:
                context.close()
    browser.close()
(out / 'report.json').write_text(json.dumps({'status': 'pass', 'themes': ['light', 'dark'], 'widths': [360, 390, 1024, 1440], 'screenshots': screenshots}, indent=2))
`;
