import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer as createPortServer } from 'node:net';
import ts from 'typescript';
import { source } from './qa-round2-loader.mjs';

const require = createRequire(import.meta.url);
function compile(path, mocks = {}, expose = '', globals = {}) {
  const { outputText } = ts.transpileModule(source(path) + expose, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    URLSearchParams,
    AbortController,
    ...globals,
    require: (id) => {
      if (id in mocks) return mocks[id];
      if (id.startsWith('@/') || id.startsWith('.'))
        return new Proxy({}, { get: (_, name) => name });
      return require(id);
    },
  });
  return exports;
}
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
}
const react = {
  useState: (value) => [value, () => {}],
  useRef: (value) => ({ current: value }),
  useEffect: () => {},
};
const format = compile('lib/format.ts');
const access = compile('lib/access.ts');

test('A1/A6: removed counterparties have no Visit link; live parties and quantities remain', () => {
  for (const seller of [true, false]) {
    for (const removed of [true, false]) {
      const { DealAside, Availability } = compile(
        'components/chat/deal-aside.tsx',
        {
          '@/lib/auth/use-auth': {
            useAuth: () => ({ user: { id: seller ? 's' : 'b' } }),
          },
          '@/lib/format': format,
          './helpers': { requestLabel: () => 'Complete' },
          '@/lib/api/listings': {
            useListing: (id) =>
              id ? { data: { weight: '12.5', held_weight: '2' } } : {},
          },
        },
        '\nexports.Availability = Availability;'
      );
      const party = removed ? 'Removed account' : 'Live store';
      const request = {
        buyer: { id: 'b', name: seller ? party : 'Buyer' },
        seller: { id: 's', name: seller ? 'Seller' : party },
        items: [],
        created_at: '2026-11-08',
      };
      const link = nodes(DealAside({ request })).find((node) => node.props.to);
      assert.equal(!!link, !removed);
      if (link) assert.equal(link.props.params.sellerId, seller ? 'b' : 's');
      assert.equal(
        Availability({ stockId: '' }).props.children,
        'No longer listed'
      );
      const quantities = Availability({ stockId: 'stock' }).props.children.join(
        ''
      );
      assert.equal(quantities, '12.5 kg available · 2 kg held');
    }
  }
});

test('A2: phone role menu opens the picker; cancel writes nothing and confirm writes once', () => {
  const states = [];
  let stateIndex = 0;
  const person = {
    id: 'person',
    name: 'Zanele',
    role: 'collector',
    created_at: '2026-11-08',
  };
  const { UsersPage } = compile(
    'routes/admin/users.tsx',
    {
      react: {
        useState: (initial) => {
          const index = stateIndex++;
          if (!(index in states)) states[index] = initial;
          return [
            states[index],
            (value) => {
              states[index] = value;
            },
          ];
        },
      },
      '@tanstack/react-router': { createFileRoute: () => (route) => route },
      '@/lib/use-debounced': { useDebounced: (value) => value },
      '@/lib/auth/use-auth': { useAuth: () => ({ user: { id: 'self' } }) },
      '@/lib/access': access,
      '@/lib/api/admin': {
        useAdminUsers: () => ({ data: { items: [person] } }),
        useDeleteUser: () => ({}),
        useSetBusinessVerified: () => ({}),
      },
      '@/lib/api/exports': { useExport: () => ({}) },
      '@/lib/format': format,
    },
    '\nexports.UsersPage = UsersPage;'
  );
  const page = () => {
    stateIndex = 0;
    return nodes(UsersPage());
  };
  const table = () => page().find((node) => node.type === 'DataTable');
  const phone = table().props.renderCard(person);
  assert.equal(phone.type, 'ListRow');
  assert.equal(
    table().props.renderCard({ ...person, id: 'self' }).props.actions.length,
    0
  );
  const roleAction = phone.props.actions.find(
    (action) => action.label === 'Change role'
  );
  assert.ok(roleAction);
  roleAction.onSelect();
  const picker = page().find((node) => node.type === 'ResponsiveOverlay');
  assert.equal(picker.props.open, true);
  assert.equal(picker.props.children.props.user, person);
  picker.props.onOpenChange(false);
  assert.equal(
    page().find((node) => node.type === 'ResponsiveOverlay').props.open,
    false
  );

  let pending = null;
  const writes = [];
  const { RoleSelect } = compile(
    'routes/admin/users.tsx',
    {
      react: {
        useState: () => [
          pending,
          (value) => {
            pending = value;
          },
        ],
      },
      '@tanstack/react-router': { createFileRoute: () => (route) => route },
      '@/lib/access': access,
      '@/lib/api/admin': {
        useSetUserRole: () => ({ mutate: (value) => writes.push(value) }),
        useSetBusinessVerified: () => ({ mutate() {}, isPending: false }),
      },
    },
    '\nexports.RoleSelect = RoleSelect;'
  );
  const render = () =>
    nodes(
      RoleSelect({ user: { id: 'person', name: 'Zanele', role: 'collector' } })
    );
  const select = () =>
    render().find((node) => node.props.label === 'Role for Zanele');
  const dialog = () =>
    render().find((node) => node.props.confirmLabel === 'Change role');
  select().props.onChange('collector');
  assert.equal(dialog().props.open, false);
  select().props.onChange('staff');
  assert.equal(writes.length, 0);
  assert.equal(dialog().props.open, true);
  assert.match(dialog().props.description, /Zanele from Collector to Staff/);
  dialog().props.onOpenChange(false);
  assert.equal(writes.length, 0);
  assert.equal(dialog().props.open, false);
  select().props.onChange('business');
  dialog().props.onConfirm();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].role, 'business');
  assert.equal(dialog().props.open, false);
});

test('A3: staff cannot change any saved bank or wallet control; contact remains editable', () => {
  for (const method of ['bank', 'ewallet']) {
    let changes = 0;
    const { CollectorForm } = compile(
      'components/dialogs/collector-dialog.tsx',
      {
        react,
        '@/lib/auth/use-auth': { useAuth: () => ({ user: { role: 'staff' } }) },
        '@/lib/api/collectors': {
          useCreateCollector: () => ({}),
          useUpdateCollector: () => ({}),
        },
        '@/lib/format': format,
        '@/components/transactions/phone': compile(
          'components/transactions/phone.ts'
        ),
        'react-hook-form': {
          useForm: () => ({
            control: {},
            watch: () => method,
            handleSubmit: () => () => {},
          }),
        },
      },
      '\nexports.CollectorForm = CollectorForm;'
    );
    let tree = nodes(
      CollectorForm({
        open: true,
        collector: { id: 'collector', payout_method: method },
      })
    );
    const controller = tree.find((node) => node.props.name === 'payout_method');
    tree = [
      ...tree,
      ...nodes(
        controller.props.render({
          field: { value: method, onChange: () => changes++ },
        })
      ),
    ];
    const group = tree.find(
      (node) => node.props['aria-labelledby'] === 'collector-method-label'
    );
    assert.equal(group.props.disabled, true);
    group.props.onValueChange('none');
    assert.equal(changes, 0);
    for (const node of tree.filter((node) =>
      ['collector-none', 'collector-bank', 'collector-ewallet'].includes(
        node.props.id
      )
    )) {
      assert.equal(node.props.disabled, true);
    }
    const fields = tree.filter((node) =>
      /^(bank_|ewallet_)/.test(node.props.name ?? '')
    );
    assert.equal(fields.length, method === 'bank' ? 5 : 2);
    const fieldset = tree.find((node) => node.type === 'fieldset');
    assert.equal(fieldset.props.disabled, true);
    for (const field of fields) {
      if (!field.props.options) assert.equal(field.props.disabled, true);
    }
    assert.notEqual(
      tree.find((node) => node.props.name === 'name').props.disabled,
      true
    );
  }
});

test('A5: desktop shell has no breadcrumb; unavailable browser titles remain role-aware', () => {
  const nav = compile('lib/nav.ts', { '@/lib/access': access });
  for (const role of ['staff', 'admin', 'business', null]) {
    const { Topbar } = compile('components/shell/topbar.tsx', {
      '@tanstack/react-router': { useRouterState: () => '/admin/users' },
      '@/lib/auth/use-auth': { useAuth: () => ({ user: { role } }) },
      '@/lib/nav': nav,
      '@/lib/utils': { cn: (...values) => values.join(' ') },
    });
    const tree = nodes(Topbar({ onSearch: () => {} }));
    const expected = role === 'admin' ? 'User management' : 'Not available';
    assert.equal(nav.pageTitleFor('/admin/users', role), expected);
    assert.equal(
      tree.filter((node) => node.props.children === expected).length,
      0
    );
  }
  assert.match(
    source('components/shell/app-shell.tsx'),
    /pageTitleFor\(pathname, role\)/
  );
});

test('A7: removed sign-in has no trade tagline or unsupported contact instruction', () => {
  for (const reason of ['removed', 'ended', '']) {
    const { Route } = compile(
      'routes/sign-in.tsx',
      {
        react,
        '@tanstack/react-router': {
          createFileRoute: () => (route) => route,
          useNavigate: () => () => {},
        },
        '@/lib/api/auth': { useSignIn: () => ({}) },
        'react-hook-form': {
          useForm: () => ({ formState: {}, handleSubmit: () => () => {} }),
        },
      },
      '',
      { window: { location: { search: `?reason=${reason}` } } }
    );
    const shell = Route.component();
    assert.equal(
      shell.props.description,
      reason === 'removed' ? '' : 'Sign in to trade, chat and track your stock.'
    );
    if (reason === 'removed') assert.equal(shell.props.feedback, null);
  }
});

test('H2: million-kg axis ticks are compact and tooltip weights retain full precision', () => {
  const { ImpactChart, axisWeight } = compile(
    'routes/-dashboard/impact-chart.tsx',
    {
      '@/lib/format': format,
      '@/hooks/use-mobile': { useIsCompact: () => false },
    }
  );
  assert.match(axisWeight(1200000), /1[.,]2M kg/);
  const tree = nodes(
    ImpactChart({ series: [{ day: '2026-11-08', weight: '1200000' }] })
  );
  assert.equal(
    tree.find((node) => node.props.width === 80).props.tickFormatter,
    axisWeight
  );
  const tooltip = tree.find((node) => node.props.content).props.content;
  assert.equal(tooltip.props.formatter(1200000).props.children, '1 200 000 kg');
});

test('H3: collection title and submit action both say Record collection', () => {
  const dialog = source('components/dialogs/collection-dialog.tsx');
  assert.match(dialog, /title="Record collection"/);
  assert.doesNotMatch(dialog, /title="Record a collection"/);
  assert.match(source('routes/collections.tsx'), /Record collection/);
});

test('S2: cart subtitle follows the resolved store and loaded cart, including root URL and empty state', () => {
  for (const selected of [undefined, 'store']) {
    for (const state of [
      'populated',
      'empty',
      'loading',
      'error',
      'no-stores',
    ]) {
      const hasStore = state !== 'no-stores';
      let queried;
      const { CartPage } = compile(
        'routes/cart.tsx',
        {
          react,
          '@tanstack/react-router': {
            createFileRoute: () => () => ({
              useSearch: () => ({ seller_id: hasStore ? selected : undefined }),
            }),
            useNavigate: () => () => {},
          },
          '@/lib/api/cart': {
            useCartStores: () => ({
              data: { items: hasStore ? [{ id: 'store', name: 'Store' }] : [] },
            }),
            useCart: (id) => {
              queried = id;
              return {
                isPending: state === 'loading',
                isError: state === 'error',
                data: { items: state === 'populated' ? [{}] : [] },
              };
            },
          },
        },
        '\nexports.CartPage = CartPage;'
      );
      const header = nodes(CartPage()).find(
        (node) => node.props.title === 'Your cart'
      );
      assert.equal(queried, hasStore ? 'store' : '');
      assert.doesNotMatch(header.props.description, /Choose a store/);
      if (state === 'populated')
        assert.equal(
          header.props.description,
          'Review quantities before sending your request.'
        );
      if (state === 'empty')
        assert.equal(
          header.props.description,
          'Add materials from a listing to start a request.'
        );
    }
  }
});

test('S1: every auth publisher sends only an event, and receivers reset before re-guarding', async () => {
  const messages = [];
  const channels = [];
  class Channel {
    constructor(name) {
      this.name = name;
      channels.push(this);
    }
    postMessage(message) {
      messages.push(message);
    }
    close() {
      this.closed = true;
    }
  }
  let identity = { id: 'next', role: 'business' };
  const order = [];
  const client = {
    cancelQueries: async () => {
      order.push('cancel');
    },
    removeQueries: () => {
      order.push('remove');
    },
    setQueryData: (_, user) => {
      order.push(user ? user.id : 'signed-out');
    },
  };
  const location = {
    pathname: '/transactions/purchases',
    assign: (url) => {
      order.push(url);
    },
  };
  const auth = compile(
    'lib/api/auth.ts',
    {
      '@tanstack/react-query': {
        useQueryClient: () => client,
        useMutation: (options) => options,
      },
      './client': { api: async () => ({ user: identity }), json: () => ({}) },
    },
    '',
    { window: { BroadcastChannel: Channel, location } }
  );
  for (const name of [
    'useSignIn',
    'useSwitchSession',
    'useSignOut',
    'useSignOutAll',
    'useRevokeSession',
    'useRevokeOtherSessions',
    'useResetPassword',
  ]) {
    await auth[name]().onSuccess();
  }
  assert.equal(messages.length, 7);
  for (const message of messages)
    assert.equal(JSON.stringify(message), '{"type":"session-changed"}');
  assert.ok(channels.every((channel) => channel.closed));
  let checked;
  const rechecked = new Promise((resolve) => {
    checked = resolve;
  });
  const stop = auth.listenForSessionChanges(client, () => {
    order.push('guard');
    checked();
  });
  order.length = 0;
  channels.at(-1).onmessage({ data: { type: 'session-changed' } });
  await rechecked;
  assert.deepEqual(order, ['cancel', 'cancel', 'remove', 'next', 'guard']);
  identity = null;
  const signedOut = new Promise((resolve) => {
    location.assign = (url) => {
      order.push(url);
      resolve();
    };
  });
  channels.at(-1).onmessage({ data: { type: 'session-changed' } });
  await signedOut;
  assert.deepEqual(order.slice(-4), [
    'remove',
    'signed-out',
    'guard',
    '/sign-in',
  ]);
  stop();
  assert.equal(channels.at(-1).closed, true);
});

// Run the real app in Chromium, with isolated HTTP fixtures and browser cookies.
// No QA accounts or databases are changed by this regression.
test(
  'S1/H2: two real tabs share account changes at 1920x1080 in light and dark',
  { timeout: 180000 },
  async () => {
    const { createServer } = await import('vite');
    // Vite treats port 0 as its default port; reserve an actual free port first.
    const portServer = createPortServer();
    await new Promise((resolve) => portServer.listen(0, '127.0.0.1', resolve));
    const port = portServer.address().port;
    await new Promise((resolve, reject) =>
      portServer.close((error) => (error ? reject(error) : resolve()))
    );
    const server = await createServer({
      server: { host: '127.0.0.1', port, strictPort: true, hmr: false },
    });
    try {
      await server.listen();
      const address = server.httpServer.address();
      const result = await new Promise((resolve) => {
        const child = spawn(
          'python',
          ['-c', browserRegression, `http://127.0.0.1:${address.port}`],
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

const browserRegression = String.raw`
import sys, json, re
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

base = sys.argv[1]
with sync_playwright() as p:
    browser = p.chromium.launch()
    for mode in ['light', 'dark']:
        context = browser.new_context(viewport={'width': 1920, 'height': 1080}, color_scheme=mode)
        people = {key: {'id': key, 'name': name, 'email': key + '@example.test', 'role': key if key != 'buyer' else 'business', 'emailVerified': True, 'profileComplete': True, 'agreedToTerms': True} for key, name in [('buyer', 'Test Buyer'), ('staff', 'Test Staff')]}
        context.add_cookies([{'name': 'session', 'value': 'buyer', 'url': base}])
        errors = []
        requests = []
        payout = 'bank'
        def handle(route):
            request = route.request
            path = urlparse(request.url).path.removeprefix('/api')
            current = next((cookie['value'] for cookie in context.cookies() if cookie['name'] == 'session'), '')
            body, status, headers = {}, 200, {}
            if path == '/auth/me':
                body = {'user': people[current]} if current in people else {'code': 'unauthorized', 'message': 'Sign in again.'}
                status = 200 if current in people else 401
            elif path == '/auth/sessions':
                body = {'sessions': [{'id': key, 'userId': key, 'name': person['name'], 'email': person['email'], 'role': person['role'], 'current': key == current, 'createdAt': '2026-11-08T08:00:00Z'} for key, person in people.items()]}
            elif path == '/auth/sign-in':
                headers = {'Set-Cookie': 'session=buyer; Path=/; SameSite=Lax'}
                body = {'user': people['buyer']}
            elif path.endswith('/switch'):
                target = path.split('/')[-2]
                headers = {'Set-Cookie': 'session=' + target + '; Path=/; SameSite=Lax'}
                body = {'ok': True}
            elif path in ['/auth/sign-out', '/auth/sessions/sign-out-all']:
                headers = {'Set-Cookie': 'session=; Path=/; Max-Age=0'}
                body = {'ok': True}
            elif path.startswith('/transactions'):
                requests.append((current, path))
                if current == 'staff' and ('purchases' in path or 'kind=purchases' in request.url):
                    body, status = {'code': 'forbidden', 'message': 'You are not allowed to see these transactions.'}, 403
                elif path == '/transactions/totals': body = {'count': 0, 'weight': '0', 'value': '0', 'carbon_savings': '0'}
                else: body = {'items': [], 'has_more': False, 'next_cursor': None}
            elif path.startswith('/dashboard'):
                totals = {'count': 1, 'weight': '1000000', 'value': '1000000', 'carbon_savings': '1500000'}
                body = {'from': '2026-10-10', 'to': '2026-11-08', 'totals': totals, 'series': [dict(totals, day='2026-11-08')], 'counterparties': []}
            elif path == '/stats': body = {'total_kg': '0', 'co2_kg': '0', 'deals': 0, 'top_stores': []}
            elif path in ('/collectors', '/collectors/collector'):
                collector = {'id': 'collector', 'name': 'Zanele Both', 'email': 'zanele@example.test', 'phone': '+27820001010', 'street_address': '5 Dump Street', 'city': 'Soweto', 'area_code': 1818, 'province': 'Gauteng', 'payout_method': payout, 'bank_name': 'FNB', 'bank_account_type': 'Cheque', 'bank_account_holder_name': 'Zanele Both', 'bank_account_number': '******1222', 'bank_branch_code': '******0655', 'ewallet_platform_name': 'FNB eWallet', 'ewallet_payment_id': '******1010'}
                collector.update(can_edit=True, can_view_payout=True)
                body = collector if path.endswith('/collector') else {'items': [collector], 'has_more': False, 'next_cursor': None}
            elif path.endswith('/unread-count'): body = {'count': 0}
            else: body = {'items': [], 'has_more': False, 'next_cursor': None, 'count': 0}
            route.fulfill(status=status, content_type='application/json', body=json.dumps(body), headers=headers)
        context.route(base + '/api/**', handle)
        # Live updates are unrelated to the cookie/channel regression.
        context.route_web_socket('**/api/live', lambda ws: None)
        a, b = context.new_page(), context.new_page()
        for page in [a, b]:
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(base + '/transactions/purchases')
            try:
                expect(page.get_by_role('heading', name='Purchases', exact=True)).to_be_visible(timeout=15000)
            except Exception:
                print('INITIAL BODY:', page.locator('body').inner_text(), 'ERRORS:', errors, flush=True)
                raise
            expect(page.get_by_text('No purchases yet', exact=True)).to_be_visible()
        def switch(target):
            b.get_by_role('button', name='Account menu').click()
            b.get_by_role('menuitem', name='Accounts in this browser').hover()
            b.get_by_role('menuitem', name=re.compile('Test ' + target)).click()
        switch('Staff')
        expect(a.get_by_text('This page is in another workspace.', exact=True)).to_be_visible()
        expect(a.get_by_role('link', name='All transactions', exact=True)).to_be_visible()
        expect(a.get_by_role('link', name='Stock', exact=True)).to_have_count(0)
        expect(b.get_by_text('This page is in another workspace.', exact=True)).to_be_visible()
        # Staff can edit contact details, but no custom payout control can open.
        for method in ['bank', 'ewallet']:
            payout = method
            b.goto(base + '/collectors')
            b.get_by_role('button', name='Actions for Zanele Both', exact=True).click()
            b.get_by_role('menuitem', name='Edit', exact=True).click()
            dialog = b.get_by_role('dialog')
            expect(dialog.get_by_label('Full name', exact=True)).to_be_editable()
            for radio in dialog.get_by_role('radio').all():
                expect(radio).to_be_disabled()
            fields = ['Account holder', 'Bank', 'Account type', 'Account number', 'Branch code'] if method == 'bank' else ['Wallet provider', 'Wallet phone number']
            for label in fields:
                control = dialog.get_by_role('combobox', name=label, exact=True) if label in ['Bank', 'Account type', 'Wallet provider'] else dialog.get_by_label(label, exact=True)
                expect(control).to_be_disabled()
            dialog.get_by_role('button', name='Close', exact=True).click()
        b.goto(base + '/admin/users')
        expect(b.get_by_text('This page is in another workspace.', exact=True)).to_be_visible()
        expect(b.get_by_role('navigation', name='breadcrumb')).to_have_count(0)
        expect(b).to_have_title('Not available · 3REco')
        b.goto(base + '/transactions/purchases')
        switch('Buyer')
        expect(a.get_by_role('heading', name='Purchases', exact=True)).to_be_visible()
        expect(a.get_by_text('No purchases yet', exact=True)).to_be_visible()
        expect(a.get_by_role('link', name='Stock', exact=True)).to_be_visible()
        expect(a.get_by_role('link', name='All transactions', exact=True)).to_have_count(0)
        expect(a.get_by_text('You are not allowed to see these transactions.', exact=True)).to_have_count(0)
        assert a.url.endswith('/transactions/purchases')
        assert len([item for item in requests if item == ('buyer', '/transactions/purchases')]) >= 3
        # Reproduce the narrow half-width dashboard chart at desktop size.
        a.goto(base + '/')
        ticks = a.locator('.recharts-yAxis-tick-labels text')
        expect(a.get_by_role('application')).to_be_visible()
        expect(ticks.first).to_be_visible()
        for tick in ticks.all():
            assert tick.locator('tspan').count() <= 1, tick.inner_text()
            bounds = tick.bounding_box()
            svg = a.get_by_role('application').bounding_box()
            assert bounds['x'] >= svg['x'] and bounds['y'] >= svg['y'], (mode, tick.inner_text(), bounds, svg)
            assert bounds['width'] <= 80
        assert any('M kg' in text for text in ticks.all_text_contents())
        # Sign all out reconciles the other tab without a manual reload.
        b.get_by_role('button', name='Account menu').click()
        b.get_by_role('menuitem', name='Accounts in this browser').hover()
        b.get_by_role('menuitem', name='Sign all out', exact=True).click()
        expect(a).to_have_url(re.compile('/sign-in$'))
        expect(a.get_by_role('button', name='Sign in', exact=True)).to_be_visible()
        expect(b).to_have_url(re.compile('/sign-in$'))
        # A sign-in in one tab restores the signed-out tab, too.
        b.get_by_label('Email address', exact=True).fill('buyer@example.test')
        b.get_by_label('Password', exact=True).fill('LocalTestPassword1!')
        b.get_by_role('button', name='Sign in', exact=True).click()
        expect(a.get_by_role('button', name='Account menu')).to_be_visible()
        a.goto(base + '/transactions/purchases')
        expect(a.get_by_text('No purchases yet', exact=True)).to_be_visible()
        b.get_by_role('button', name='Account menu').click()
        b.get_by_role('menuitem', name='Sign out', exact=True).click()
        expect(a).to_have_url(re.compile('/sign-in$'))
        assert not errors, errors
        context.close()
    browser.close()
`;
