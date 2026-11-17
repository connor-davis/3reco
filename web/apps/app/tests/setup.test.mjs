import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { spawn } from 'node:child_process';
import { createServer as createPortServer } from 'node:net';

// lib/setup.ts only needs isAuthPath from the nav file.
const exports = {};
const source = readFileSync(
  new URL('../src/lib/setup.ts', import.meta.url),
  'utf8'
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: 'ES2022' },
});
vm.runInNewContext(outputText, {
  exports,
  require: () => ({ isAuthPath: (path) => path === '/sign-in' }),
});
const { needsSetup } = exports;

const user = (role, profileComplete) => ({ role, profileComplete });

test('a guest goes to setup from anywhere but the open pages', () => {
  assert.equal(needsSetup(user('guest', false), '/'), true);
  assert.equal(needsSetup(user('guest', false), '/market'), true);
  assert.equal(needsSetup(user(null, false), '/stock'), true);
  for (const path of [
    '/setup',
    '/profile',
    '/profile/x',
    '/about',
    '/terms',
    '/privacy',
    '/sign-in',
  ]) {
    assert.equal(needsSetup(user('guest', false), path), false, path);
  }
});

test('a business or collector with an unfinished profile goes to setup', () => {
  assert.equal(needsSetup(user('business', false), '/'), true);
  assert.equal(needsSetup(user('collector', false), '/market'), true);
  assert.equal(needsSetup(user('business', true), '/'), false);
});

test('admin, staff and signed-out visitors are never sent to setup', () => {
  assert.equal(needsSetup(user('admin', false), '/'), false);
  assert.equal(needsSetup(user('staff', false), '/'), false);
  assert.equal(needsSetup(null, '/'), false);
});

test(
  'setup has two detail screens in both roles, themes and viewport sizes',
  { timeout: 240000 },
  async () => {
    const { createServer } = await import('vite');
    const reservation = createPortServer();
    await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    const server = await createServer({
      cacheDir: 'node_modules/.vite-setup',
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
out = Path('../../../mystuff/checks/pr13-render')
out.mkdir(parents=True, exist_ok=True)
cells = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    for mode in ['light', 'dark']:
        for width in [360, 1440]:
            for role in ['business', 'collector']:
                for guest in [True, False]:
                    context = browser.new_context(viewport={'width': width, 'height': 900}, color_scheme=mode)
                    context.add_init_script("localStorage.setItem('vite-ui-theme', '" + mode + "')")
                    user = {'id': 'person', 'name': 'Zanele Dlamini', 'email': 'zanele@example.test', 'role': 'guest' if guest else role, 'profileComplete': False, 'emailVerified': True, 'agreedToTerms': True}
                    profile = {'name': user['name'], 'first_name': 'Zanele', 'last_name': 'Dlamini', 'phone': '0821234567', 'id_number': '', 'bank_account_holder_name': '', 'bank_name': '', 'bank_account_number': '', 'bank_branch_code': '', 'bank_account_type': 'Savings', 'street_address': '', 'city': '', 'province': '', 'area_code': None}
                    company = dict(profile, business_name='', business_registration_number='')
                    writes = []
                    errors = []
                    fail_save = [False]
                    fail_finish = [True]
                    def handle(route):
                        path = urlparse(route.request.url).path.removeprefix('/api')
                        body = {'items': [], 'has_more': False}
                        if route.request.method in ['PATCH', 'POST']:
                            sent = route.request.post_data_json
                            writes.append((path, sent))
                            if path == '/profile/setup':
                                if fail_finish[0]:
                                    fail_finish[0] = False
                                    route.fulfill(status=400, content_type='application/json', body=json.dumps({'message': 'Finish failed. Try again.'}))
                                    return
                                user.update(role=role, profileComplete=True)
                            elif fail_save[0] and 'street_address' in sent and role == 'business':
                                fail_save[0] = False
                                route.fulfill(status=400, content_type='application/json', body=json.dumps({'message': 'Address could not be saved.'}))
                                return
                            else:
                                (company if path == '/business' else profile).update(sent)
                            body = {'ok': True}
                        elif path == '/auth/me': body = {'user': user}
                        elif path == '/profile': body = profile
                        elif path == '/business': body = company
                        elif path == '/stats': body = {'total_kg': '0', 'co2_kg': '0', 'deals': 0, 'top_stores': []}
                        route.fulfill(status=200, content_type='application/json', body=json.dumps(body))
                    context.route(base + '/api/**', handle)
                    context.route_web_socket('**/api/live', lambda ws: None)
                    page = context.new_page()
                    page.set_default_timeout(10000)
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' and '400 (Bad Request)' not in message.text else None)
                    try:
                        page.goto(base + '/setup')
                        page.wait_for_load_state('networkidle')
                        if guest:
                            expect(page.get_by_text('Step 1 of 2', exact=True)).to_have_count(0)
                            page.get_by_role('button', name='I run a business' if role == 'business' else 'I collect materials').click()
                        expect(page.get_by_text('Step 1 of 2', exact=True)).to_be_visible()
                        expect(page.get_by_label('First name', exact=True)).to_be_visible()
                        page.get_by_label('Phone number', exact=True).fill('123')
                        page.get_by_role('button', name='Continue', exact=True).click()
                        expect(page.get_by_text('Use a South African phone number, such as 0825550148.', exact=True)).to_be_visible()
                        assert not writes, writes
                        page.get_by_label('Phone number', exact=True).fill('0821234567')
                        if role == 'business':
                            page.get_by_role('button', name='Continue', exact=True).click()
                            expect(page.get_by_text('Enter the business name.', exact=True)).to_be_visible()
                            assert not writes, writes
                            page.get_by_label('Business name', exact=True).fill('Zanele Recycling')
                            page.get_by_label('Registration number', exact=True).fill('2020/123456/07')
                        assert page.locator('html').evaluate('(el) => el.scrollWidth <= innerWidth'), 'About screen overflows'
                        page.screenshot(path=str(out / f'{mode}-{width}-{role}-{guest}-about.png'), full_page=True)
                        page.get_by_label('Phone number', exact=True).press('Enter')
                        expect(page.get_by_text('Step 2 of 2', exact=True)).to_be_visible()
                        page.get_by_label('Account holder', exact=True).fill('Z Dlamini')
                        page.get_by_label('Bank', exact=True).fill('FNB')
                        page.get_by_label('Branch code', exact=True).fill('250655')
                        page.get_by_label('Street address', exact=True).fill('1 Main Road')
                        page.get_by_label('City / suburb', exact=True).fill('Pretoria')
                        page.get_by_label('Area / postal code', exact=True).fill('0123')
                        page.get_by_label('Province', exact=True).click()
                        page.get_by_role('option', name='Gauteng', exact=True).click()
                        page.get_by_label('Account number', exact=True).fill('123')
                        before = len(writes)
                        page.get_by_role('button', name='Finish setup', exact=True).click()
                        expect(page.get_by_text('The account number is 6 to 16 digits.', exact=True)).to_be_visible()
                        assert len(writes) == before, writes
                        page.get_by_label('Account number', exact=True).fill('62123456789')
                        assert page.locator('html').evaluate('(el) => el.scrollWidth <= innerWidth'), 'Details screen overflows'
                        page.screenshot(path=str(out / f'{mode}-{width}-{role}-{guest}-details.png'), full_page=True)
                        if role == 'business':
                            fail_save[0] = True
                            page.get_by_role('button', name='Finish setup', exact=True).click()
                            expect(page.get_by_text('Address could not be saved.', exact=True)).to_be_visible()
                            assert not any(path == '/profile/setup' for path, _ in writes)
                        page.get_by_role('button', name='Finish setup', exact=True).click()
                        expect(page.get_by_text('Finish failed. Try again.', exact=True)).to_be_visible()
                        expect(page.get_by_text('Step 2 of 2', exact=True)).to_be_visible()
                        page.get_by_role('button', name='Back', exact=True).click()
                        expect(page.get_by_text('Step 1 of 2', exact=True)).to_be_visible()
                        expect(page.get_by_label('First name', exact=True)).to_have_value('Zanele')
                        page.get_by_role('button', name='Continue', exact=True).click()
                        expect(page.get_by_label('Account number', exact=True)).to_have_value('')
                        page.get_by_role('button', name='Finish setup', exact=True).click()
                        page.wait_for_url(base + '/')
                        finish_calls = [sent for path, sent in writes if path == '/profile/setup']
                        assert finish_calls == ([{'role': role}] * 2 if guest else [{}, {}]), finish_calls
                        detail_path = '/business' if role == 'business' else '/profile'
                        assert any(path == detail_path and sent.get('area_code') == 123 for path, sent in writes)
                        assert not errors, errors
                        cells.append({'mode': mode, 'width': width, 'role': role, 'guest': guest})
                    finally:
                        context.close()
    browser.close()
(out / 'report.json').write_text(json.dumps({'status': 'pass', 'mocked_api': True, 'cells': cells}, indent=2))
`;
