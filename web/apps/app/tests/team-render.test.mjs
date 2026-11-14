import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createPortServer } from 'node:net';

test(
  'Team and invite journeys render in light and dark on phone and desktop',
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
      cacheDir: 'node_modules/.vite-team',
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
import sys, json, re, os
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

base = sys.argv[1]
sys.stdout.reconfigure(encoding='utf-8')
with sync_playwright() as p:
    browser = p.chromium.launch()
    for mode in ['light', 'dark']:
        for width in [390, 1440]:
            context = browser.new_context(viewport={'width': width, 'height': 1000}, color_scheme=mode)
            context.add_init_script("localStorage.setItem('vite-ui-theme', '" + mode + "')")
            user = {'id': 'owner', 'name': 'Naledi Jacobs', 'email': 'naledi@example.test', 'role': 'collector', 'active_business_id': 'business-a', 'business_role': 'owner', 'profileComplete': True, 'emailVerified': True, 'agreedToTerms': True}
            members = [{'id': 'owner', 'name': 'Naledi Jacobs', 'email': user['email'], 'role': 'owner'}, {'id': 'member', 'name': 'Thandi Mokoena', 'email': 'thandi@example.test', 'role': 'member'}]
            invites = []
            requests = []
            sockets = []
            errors = []
            def handle(route):
                path = urlparse(route.request.url).path.removeprefix('/api')
                method = route.request.method
                body = {'items': [], 'has_more': False, 'count': 0}
                status = 200
                if path == '/auth/me':
                    body = {'user': user}
                    if user is None: status = 401; body = {'code': 'unauthorized', 'message': 'Sign in.', 'fields': None}
                elif path == '/auth/sessions': body = {'sessions': []}
                elif path == '/team' and method == 'GET': body = {'members': members, 'invites': invites}
                elif path == '/team/invites' and method == 'POST':
                    data = route.request.post_data_json
                    requests.append((path, data))
                    invites.append(dict(data, id='invite', expires_at='2099-11-20T08:00:00Z', created_at='2026-11-13T08:00:00Z'))
                    body = {'ok': True}
                elif path.startswith('/auth/invites/') and method == 'GET':
                    body = {'business_name': 'Greenloop', 'role': 'manager', 'email': 'n***@example.test'}
                    if path.endswith('expired'): status = 400; body = {'code': 'bad_request', 'message': 'This link is not valid any more. Ask for a new one.', 'fields': None}
                elif path == '/auth/invites/accept': requests.append((path, route.request.post_data_json)); body = {'ok': True}
                elif path == '/stats': body = {'total_kg': '10', 'co2_kg': '5', 'deals': 1, 'top_stores': []}
                route.fulfill(status=status, content_type='application/json', body=json.dumps(body))
            context.route(base + '/api/**', handle)
            context.route_web_socket('**/api/live', lambda ws: sockets.append(ws))
            page = context.new_page()
            page.set_default_timeout(10000)
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('console', lambda message: errors.append(message.text) if message.type == 'error' and not (user is None and '401 (Unauthorized)' in message.text) else None)
            try:
                page.goto(base + '/team')
                page.wait_for_load_state('networkidle')
                expect(page.get_by_role('heading', name='Team', exact=True)).to_be_visible()
                expect(page.get_by_text('Thandi Mokoena', exact=True)).to_be_visible()
                assert page.locator('html').evaluate('(el) => el.scrollWidth <= innerWidth'), 'Team overflows'
                if width == 1440:
                    table = page.locator('[data-slot="table-container"]')
                    assert table.evaluate('(el) => el.clientWidth > 950'), 'Team width is capped'
                    expect(page.get_by_role('link', name='Team', exact=True)).to_be_visible()
                else:
                    page.get_by_role('button', name='More', exact=True).click()
                    expect(page.get_by_role('link', name='Team', exact=True)).to_be_visible()
                    page.keyboard.press('Escape')
                page.get_by_role('button', name='Actions for Naledi Jacobs', exact=True).click()
                expect(page.get_by_role('menuitem', name='Remove from team')).to_be_disabled()
                expect(page.get_by_role('menuitem', name='Change role')).to_be_disabled()
                page.keyboard.press('Escape')
                page.get_by_role('button', name='Invite someone', exact=True).click()
                overlay = page.get_by_role('dialog', name='Invite someone', exact=True)
                expect(overlay).to_be_visible()
                expect(overlay.get_by_text('Role', exact=True)).to_be_visible()
                role_select = overlay.get_by_role('combobox', name='Team role', exact=True)
                email_input = overlay.get_by_label('Email address', exact=True)
                page.wait_for_function("""() => {
                    const dialog = document.querySelector('[role="dialog"]');
                    const select = dialog.querySelector('[role="combobox"]');
                    const input = dialog.querySelector('input[type="email"]');
                    return Math.abs(select.getBoundingClientRect().width - input.getBoundingClientRect().width) < 2;
                }""")
                overlay.get_by_label('Email address', exact=True).fill('new@example.test')
                overlay.get_by_role('button', name='Send invitation', exact=True).click()
                expect(overlay).not_to_be_visible()
                page.get_by_role('tab', name='Invitations', exact=True).click()
                expect(page.get_by_text('new@example.test', exact=True)).to_be_visible()
                assert requests[-1][1] == {'email': 'new@example.test', 'role': 'member'}
                # A WebSocket event updates the directory without navigation or polling.
                invites.append({'id': 'live', 'email': 'live@example.test', 'role': 'owner', 'expires_at': '2099-11-20T08:00:00Z', 'created_at': '2026-11-13T08:00:00Z'})
                assert sockets
                sockets[-1].send(json.dumps({'type': 'changed', 'kind': 'team', 'id': 'business-a'}))
                expect(page.get_by_text('live@example.test', exact=True)).to_be_visible()
                if os.environ.get('THREERECO_TEAM_SHOTS'):
                    shots = Path(os.environ['THREERECO_TEAM_SHOTS']); shots.mkdir(parents=True, exist_ok=True)
                    page.screenshot(path=str(shots / f'team-{mode}-{width}.png'), full_page=True)
                user['business_role'] = 'manager'
                user['id'] = 'manager'
                members.append({'id': 'manager', 'name': 'Sipho Dlamini', 'email': 'sipho@example.test', 'role': 'manager'})
                members.append({'id': 'peer-manager', 'name': 'Lerato Ndlovu', 'email': 'lerato@example.test', 'role': 'manager'})
                page.reload(); page.wait_for_load_state('networkidle')
                expect(page.get_by_role('button', name='Invite someone', exact=True)).to_be_visible()
                expect(page.get_by_role('button', name='Actions for Naledi Jacobs', exact=True)).to_have_count(0)
                expect(page.get_by_role('button', name='Actions for Sipho Dlamini', exact=True)).to_have_count(0)
                expect(page.get_by_role('button', name='Actions for Lerato Ndlovu', exact=True)).to_have_count(0)
                page.get_by_role('button', name='Actions for Thandi Mokoena', exact=True).click()
                page.get_by_role('menuitem', name='Change role', exact=True).click()
                overlay = page.get_by_role('dialog', name='Change role for Thandi Mokoena', exact=True)
                role_select = overlay.get_by_role('combobox')
                assert role_select.bounding_box()['width'] > overlay.bounding_box()['width'] - 60, 'Change role does not fill width'
                role_select.click()
                expect(page.get_by_role('option', name='Owner', exact=True)).to_have_count(0)
                expect(page.get_by_role('option', name='Manager', exact=True)).to_be_visible()
                page.keyboard.press('Escape'); page.keyboard.press('Escape')
                page.get_by_role('tab', name='Invitations', exact=True).click()
                expect(page.get_by_text('live@example.test', exact=True)).to_be_visible()
                expect(page.get_by_role('button', name='Actions for live@example.test', exact=True)).to_have_count(0)
                page.get_by_role('button', name='Invite someone', exact=True).click()
                overlay = page.get_by_role('dialog', name='Invite someone', exact=True)
                overlay.get_by_role('combobox', name='Team role', exact=True).click()
                expect(page.get_by_role('option', name='Owner', exact=True)).to_have_count(0)
                expect(page.get_by_role('option', name='Manager', exact=True)).to_be_visible()
                page.keyboard.press('Escape'); page.keyboard.press('Escape')
                # Signed-in invite acceptance also works for a personal platform role.
                page.goto(base + '/accept-invite?token=existing')
                page.wait_for_load_state('networkidle')
                expect(page.get_by_role('button', name='Accept invitation', exact=True)).to_be_visible()
                page.get_by_role('button', name='Accept invitation', exact=True).click()
                expect(page.get_by_role('heading', name='You have joined the team.', exact=True)).to_be_visible()
                assert requests[-1] == ('/auth/invites/accept', {'token': 'existing'})
                user = None
                page.goto(base + '/accept-invite?token=new')
                page.wait_for_load_state('networkidle')
                page.get_by_label('Full name', exact=True).fill('New Teammate')
                page.get_by_label('Password', exact=True).fill('SafePassword123!')
                page.get_by_role('checkbox').check()
                assert page.locator('html').evaluate('(el) => el.scrollWidth <= innerWidth'), 'Invite overflows'
                if os.environ.get('THREERECO_TEAM_SHOTS'):
                    page.screenshot(path=str(shots / f'invite-{mode}-{width}.png'), full_page=True)
                page.get_by_role('button', name='Create account and join', exact=True).click()
                expect(page.get_by_role('heading', name='You have joined the team.', exact=True)).to_be_visible()
                assert requests[-1][1] == {'token': 'new', 'name': 'New Teammate', 'password': 'SafePassword123!', 'accepted_terms_version': '2026-11'}
                # 400 is an expected failed preview, so record only unexpected errors here.
                assert not errors, errors
                page.goto(base + '/accept-invite?token=expired')
                expect(page.get_by_text('This link is not valid any more. Ask for a new one.', exact=True)).to_be_visible()
                expect(page.get_by_role('button', name='Create account and join')).to_have_count(0)
            except Exception:
                shots = Path('../../../mystuff/checks/team-shots'); shots.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=str(shots / 'failure.png'), full_page=True)
                print(page.locator('body').inner_text(), flush=True)
                print(errors, flush=True)
                raise
            finally:
                context.close()
    browser.close()
print('Team and invite journeys passed in all four viewport/theme combinations')
`;
