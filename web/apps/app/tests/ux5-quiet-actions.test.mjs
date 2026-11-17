import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createPortServer } from 'node:net';
import { source } from './qa-round2-loader.mjs';

test('quiet actions preserve shared state, role gates and scrolling contracts', () => {
  const listing = source('routes/market/listing/$listingId.tsx');
  assert.match(listing, /action=\{[\s\S]*<FavouriteButton/);
  assert.match(listing, /weight\.trim\(\) && !problem/);
  assert.match(
    source('components/moderation-actions.tsx'),
    /canSeeTeam\(user\) && user\?\.active_business_id !== partyId/
  );
  assert.match(
    source('routes/wanted.tsx'),
    /defaultValue=\{user\?\.business_verified \? 'browse' : 'mine'\}/
  );
  assert.match(
    source('routes/-components/wanted-form.tsx'),
    /form\.reset\(\{ \.\.\.empty, area: suggested \}\)/
  );
  const saved = source('routes/saved.tsx');
  assert.equal((saved.match(/keepMounted/g) ?? []).length, 3);
  assert.equal((saved.match(/<Pager/g) ?? []).length, 2);
  assert.match(
    source('components/filters.tsx'),
    /<TabsList aria-label=\{label\} className=\{className\}/
  );
  assert.match(
    source('components/chat/inbox.tsx'),
    /lg:\[mask-image:linear-gradient/
  );
  assert.match(source('components/ui/tabs-variants.ts'), /max-lg:\[mask-image/);
});

test(
  'quiet actions work by role at 390px and desktop in light and dark',
  { timeout: 360000 },
  async () => {
    const { createServer } = await import('vite');
    const reservation = createPortServer();
    await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    const server = await createServer({
      cacheDir: 'node_modules/.vite-ux5',
      server: { host: '127.0.0.1', port, strictPort: true, hmr: false },
    });
    try {
      await server.listen();
      const result = await new Promise((resolve) => {
        const child = spawn('python', ['-', `http://127.0.0.1:${port}`], {
          windowsHide: true,
        });
        child.stdin.end(regression);
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
stamp = '2026-11-16T08:00:00Z'
listing = dict(id='stock', seller_id='seller', seller_name='Greenloop', seller_verified=True, material_id='glass', material_name='Clear glass', weight='100', price='8.00', average_rating=None, review_count=0, image_urls=[], created_at=stamp)
store = dict(id='seller', name='Greenloop', business_verified=True, created_at=stamp, city='Pretoria', province='Gauteng')
reports = [dict(id=str(i), reporter_name='Reporter Recycling', reporter_id='buyer', party_id='seller', party_name='Greenloop', target_kind=kind, target_name='Clear glass' if kind == 'listing' else 'Greenloop', target_id='stock' if kind == 'listing' else 'seller', reason='spam', details='', status=status, suspended=suspended, party_report_count=count, created_at=stamp) for i, kind, status, suspended, count in [(1,'listing','open',False,3),(2,'party','open',False,11),(3,'party','dismissed',False,1),(4,'party','suspended',True,22)]]
out = Path('../../../mystuff/checks/ux5-render')
out.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch()
    for mode in ['light', 'dark']:
        for width in [390, 1440]:
            for role, owner, verified, team in [('business',False,True,'owner'),('collector',False,False,None),('business',True,True,'owner'),('admin',False,False,None),('business',False,False,'member'),('business',False,True,'manager')]:
                context = browser.new_context(viewport={'width':width,'height':900}, color_scheme=mode)
                user_id = 'seller' if owner else 'buyer'
                writes, errors, reads = [], [], []
                saved = {'listings': [], 'stores': [], 'searches': []}
                def handle(route):
                    path = urlparse(route.request.url).path.removeprefix('/api').rstrip('/')
                    reads.append(route.request.url)
                    body = {'items':[], 'has_more':False, 'next_cursor':None, 'count':0}
                    if path == '/auth/me':
                        body = {'user':dict(id=user_id, name='Test Person', email='test@example.test', role=role, emailVerified=True, profileComplete=True, agreedToTerms=True, business_verified=verified, active_business_id=user_id if role == 'business' else None, business_role=team)}
                    elif path == '/auth/sessions': body = {'sessions':[]}
                    elif path == '/businesses/mine': body = []
                    elif path == '/business': body = dict(city='Pretoria', province='Gauteng')
                    elif path == '/materials': body = [dict(id='glass', name='Clear glass', price='8', carbon_factor='1', gw_code='GL')]
                    elif path == '/stats': body = dict(total_kg='0', co2_kg='0', deals=0)
                    elif path in ['/favourites/ids','/follows/ids']: body = {'ids':[]}
                    elif path == '/market/listings/stock': body = listing
                    elif path == '/market/listings': body['items'] = [listing]
                    elif path == '/stores/seller': body = store
                    elif path == '/stores/seller/listings': body['items'] = [listing]
                    elif path.endswith('/reviews/summary'): body = {'count':0,'average':None}
                    elif path == '/cart': body = {'items':[]}
                    elif path == '/reports' and route.request.method == 'POST':
                        writes.append((path, route.request.post_data_json)); body = {'id':'report'}
                    elif path == '/admin/reports': body['items'] = reports
                    elif path == '/wanted' and route.request.method == 'POST':
                        writes.append((path, route.request.post_data_json)); body = {'id':'post'}
                    elif path == '/favourites':
                        body['items'] = saved['listings']
                        if saved['listings'] and not urlparse(route.request.url).query: body.update(has_more=True,next_cursor='second')
                    elif path == '/follows': body['items'] = saved['stores']
                    elif path == '/saved-searches': body['items'] = saved['searches']
                    elif path == '/saved-searches/search' and route.request.method == 'DELETE':
                        saved['searches'] = []; body = {'ok':True}
                    route.fulfill(status=200, content_type='application/json', body=json.dumps(body))
                context.route(base + '/api/**', handle)
                context.route_web_socket('**/api/live', lambda ws: None)
                page = context.new_page()
                page.set_default_timeout(15000)
                page.on('pageerror', lambda error: errors.append(str(error)))
                def visit(path):
                    page.goto(base + path)
                    page.wait_for_load_state('networkidle')
                    assert page.locator('html').evaluate('(el) => el.scrollWidth <= innerWidth'), (mode,width,role,path,'overflow')
                visit('/market/listing/stock')
                expect(page.get_by_role('button',name='View store',exact=True)).to_be_visible()
                buyer = role == 'business' and not owner
                expect(page.get_by_role('textbox',name='Quantity (kg)',exact=True)).to_have_count(1 if buyer else 0)
                expect(page.get_by_role('button',name='Add to cart',exact=True)).to_have_count(1 if buyer else 0)
                expect(page.get_by_text('Estimated total',exact=False)).to_have_count(0)
                if buyer:
                    page.get_by_role('textbox',name='Quantity (kg)',exact=True).fill('2')
                    expect(page.get_by_text('Estimated total',exact=False)).to_be_visible()
                    expect(page.get_by_role('button',name='Add to cart',exact=True)).to_be_enabled()
                    page.get_by_role('textbox',name='Quantity (kg)',exact=True).fill('999')
                    expect(page.get_by_text('Estimated total',exact=False)).to_have_count(0)
                    expect(page.get_by_role('button',name='Add to cart',exact=True)).to_be_disabled()
                if owner: expect(page.get_by_text('This is your own lot. Edit it from Stock.',exact=True)).to_be_visible()
                page.get_by_role('button',name='Actions for Greenloop',exact=True).click()
                expect(page.get_by_role('menuitem',name='Share on WhatsApp',exact=True)).to_be_visible()
                moderate = role == 'business' and team in ['owner','manager'] and not owner
                expect(page.get_by_role('menuitem',name='Report',exact=True)).to_have_count(1 if moderate else 0)
                if moderate:
                    page.get_by_role('menuitem',name='Report',exact=True).click()
                    send = page.get_by_role('button',name='Send report',exact=True)
                    expect(send).to_be_disabled()
                    reason = page.get_by_role('combobox',name='Reason',exact=True)
                    expect(reason).to_contain_text('Choose a reason')
                    reason.click()
                    page.get_by_role('option',name='Spam',exact=True).click()
                    expect(send).to_be_enabled()
                    send.click()
                    expect(send).to_have_count(0)
                    assert writes[-1][1]['reason'] == 'spam'
                else: page.keyboard.press('Escape')
                visit('/market/store/seller')
                expect(page.get_by_role('heading',name='Store details',exact=True)).to_have_count(0)
                expect(page.locator('header').filter(has=page.locator('h1')).get_by_role('button',name='Cart',exact=True)).to_have_count(0)
                expect(page.get_by_role('button',name='Message store',exact=True)).to_have_count(1 if buyer else 0)
                if owner: expect(page.get_by_role('button',name='Follow Greenloop',exact=True)).to_have_count(0)
                if role in ['business','collector'] and not owner:
                    expect(page.get_by_role('button',name='Follow Greenloop',exact=True)).to_be_visible()
                page.get_by_role('button',name='Actions for Greenloop',exact=True).click()
                expect(page.get_by_role('menuitem',name='Share on WhatsApp',exact=True)).to_be_visible()
                expect(page.get_by_role('menuitem',name='Report',exact=True)).to_have_count(1 if moderate else 0)
                page.keyboard.press('Escape')
                expect(page.get_by_role('menu')).to_have_count(0)
                assert page.get_by_role('button',name='Actions for Greenloop',exact=True).bounding_box()['width'] >= 44
                page.screenshot(path=str(out / f'{mode}-{width}-{role}-{owner}-{team}-store.png'),full_page=True)
                if role == 'business' and not owner and team == 'owner':
                    visit('/wanted')
                    expect(page.get_by_role('tab',name='Buyers want these',exact=True)).to_have_attribute('aria-selected','true')
                    empty = page.get_by_text('Nothing wanted right now. New posts will appear here.',exact=True)
                    expect(empty).to_be_visible()
                    assert empty.bounding_box()['height'] < 100
                    page.get_by_role('tab',name='My posts',exact=True).click()
                    page.get_by_role('button',name='Post what you want',exact=True).click()
                    page.get_by_role('textbox',name='Rough area',exact=True).fill('Durban')
                    page.get_by_role('textbox',name='Weight (kg)',exact=True).fill('4,25')
                    expect(page.get_by_role('button',name='Post it',exact=True)).to_be_disabled()
                    # Close from outside the overlay on both drawer and dialog.
                    page.mouse.click(5,5)
                    expect(page.get_by_role('textbox',name='Rough area',exact=True)).to_have_count(0)
                    page.get_by_role('tab',name='Buyers want these',exact=True).click()
                    page.get_by_role('tab',name='My posts',exact=True).click()
                    page.get_by_role('button',name='Post what you want',exact=True).click()
                    expect(page.get_by_role('textbox',name='Rough area',exact=True)).to_have_value('Durban')
                    expect(page.get_by_role('textbox',name='Weight (kg)',exact=True)).to_have_value('4,25')
                    page.get_by_role('combobox',name='Material',exact=True).click()
                    page.get_by_role('option',name='Clear glass',exact=True).click()
                    page.get_by_role('button',name='Post it',exact=True).click()
                    expect(page.get_by_role('textbox',name='Rough area',exact=True)).to_have_count(0)
                    assert writes[-1][1]['weight'] == '4.25' and writes[-1][1]['area'] == 'Durban'
                    page.get_by_role('button',name='Post what you want',exact=True).click()
                    expect(page.get_by_role('textbox',name='Weight (kg)',exact=True)).to_have_value('')
                if role == 'business' and not verified:
                    visit('/wanted')
                    expect(page.get_by_role('tab',name='My posts',exact=True)).to_have_attribute('aria-selected','true')
                    expect(page.get_by_role('tab',name='Buyers want these',exact=True)).to_have_count(0)
                if role in ['business','collector'] and not owner and team != 'manager':
                    visit('/saved')
                    for tab, text in [('Listings','Nothing saved yet'),('Searches','No saved searches yet'),('Stores',"You don't follow any stores")]:
                        page.get_by_role('tab',name=tab,exact=True).click()
                        empty = page.get_by_text(text,exact=True)
                        expect(empty).to_be_visible()
                        assert empty.bounding_box()['height'] < 80
                    expect(page.get_by_role('switch')).to_have_count(0)
                    saved['listings'] = [listing]
                    saved['stores'] = [store]
                    saved['searches'] = [dict(id='search',material_id='glass',material_name='Clear glass',min_price='1',max_price='9',created_at=stamp)]
                    visit('/saved')
                    page.get_by_role('button',name='Next page',exact=True).click()
                    expect(page.get_by_role('button',name='First page',exact=True)).to_be_visible()
                    assert any('cursor=second' in url for url in reads)
                    page.get_by_role('tab',name='Stores',exact=True).click()
                    expect(page.get_by_role('button',name='Follow Greenloop',exact=True)).to_be_visible()
                    page.get_by_role('tab',name='Listings',exact=True).click()
                    expect(page.get_by_role('button',name='First page',exact=True)).to_be_visible()
                    page.get_by_role('tab',name='Searches',exact=True).click()
                    expect(page.get_by_text('Get one alert when a new listing matches a material and price range.',exact=True)).to_be_visible()
                    page.get_by_role('button',name='Delete saved search for Clear glass',exact=True).click()
                    expect(page.get_by_text('No saved searches yet',exact=True)).to_be_visible()
                if role == 'admin':
                    visit('/admin/reports')
                    expect(page.get_by_text('Reported by Reporter Recycling',exact=True)).to_have_count(4)
                    for text in ['3rd report on this business','11th report on this business','22nd report on this business']:
                        expect(page.get_by_text(text,exact=True)).to_be_visible()
                    expect(page.get_by_text('1st report on this business',exact=True)).to_have_count(0)
                    for label, count in [('Dismiss report',2),('Remove listing',1),('Suspend business',2),('Unsuspend business',1)]:
                        expect(page.get_by_role('button',name=label,exact=True)).to_have_count(count)
                    page.get_by_role('button',name='Remove listing',exact=True).click()
                    expect(page.get_by_role('alertdialog')).to_be_visible()
                    page.screenshot(path=str(out / f'{mode}-{width}-admin-confirm.png'),full_page=True)
                if width == 1440 and (role == 'admin' or moderate):
                    visit('/messages')
                    tabs = page.get_by_role('tablist',name='Filter conversations',exact=True)
                    expect(tabs).to_be_visible()
                    assert 'linear-gradient' in tabs.evaluate('(el) => getComputedStyle(el).maskImage')
                    assert tabs.evaluate('(el) => getComputedStyle(el).overflowX') == 'auto'
                    expect(page.get_by_role('tab',name='Unread',exact=True)).to_have_count(0 if role == 'admin' else 1)
                    page.get_by_role('tab',name='All',exact=True).focus()
                    page.keyboard.press('End')
                    expect(page.get_by_role('tab',name='Finished',exact=True)).to_be_focused()
                assert not errors, errors
                context.close()
    for mode in ['light','dark']:
        for width in [390,1440]:
            for role in ['business','collector','guest']:
                context = browser.new_context(viewport={'width':width,'height':844},color_scheme=mode)
                profile = dict(name='Zanele Dlamini',first_name='Zanele',last_name='Dlamini',phone='',id_number='Saved ID',bank_account_holder_name='',bank_name='',bank_account_number='',bank_branch_code='',bank_account_type='Savings',street_address='',city='',province='',area_code=None)
                setup_writes = []
                def setup_handle(route):
                    path = urlparse(route.request.url).path.removeprefix('/api')
                    body = {'items':[]}
                    if route.request.method in ['PATCH','POST']:
                        setup_writes.append(route.request.post_data_json); body = {'ok':True}
                    elif path == '/auth/me': body = {'user':dict(id='person',name='Zanele Dlamini',email='zanele@example.test',role=role,profileComplete=False,emailVerified=True,agreedToTerms=True)}
                    elif path == '/profile': body = profile
                    elif path == '/business': body = dict(profile,business_name='Zanele Recycling',business_registration_number='2020/123456/07')
                    elif path == '/stats': body = dict(total_kg='0',co2_kg='0',deals=0)
                    route.fulfill(status=200,content_type='application/json',body=json.dumps(body))
                context.route(base + '/api/**',setup_handle)
                context.route_web_socket('**/api/live',lambda ws: None)
                page = context.new_page()
                page.goto(base + '/setup')
                if role == 'guest': page.get_by_role('button',name='I collect materials',exact=False).click()
                progress = page.get_by_text('Step 1 of 2',exact=True)
                phone = page.get_by_label('Phone number',exact=True)
                identity = page.get_by_label('South African ID',exact=True)
                expect(progress).to_be_visible()
                expect(phone).to_be_visible()
                assert 0 <= progress.bounding_box()['y'] < 844
                phone_box, id_box = phone.bounding_box(), identity.bounding_box()
                assert (phone_box['y'],phone_box['x']) < (id_box['y'],id_box['x'])
                expect(page.get_by_role('alert')).to_have_count(0)
                phone.fill('123')
                expect(page.get_by_role('alert')).to_have_count(0)
                page.get_by_role('button',name='Continue',exact=True).click()
                expect(page.get_by_text('Use a South African phone number, such as 0825550148.',exact=True)).to_be_visible()
                assert not setup_writes
                if width == 390:
                    page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
                    assert progress.bounding_box()['y'] >= 0
                phone.fill('0821234567')
                page.get_by_role('button',name='Continue',exact=True).click()
                expect(page.get_by_text('Step 2 of 2',exact=True)).to_be_visible()
                assert all('id_number' not in write for write in setup_writes)
                context.close()
    browser.close()
`;
