import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { load, source } from './qa-round2-loader.mjs';

const access = load('lib/access.ts');
const nav = load('lib/nav.ts', { '@/lib/access': access });

test('Team navigation allows Owners and Managers of the active business', () => {
  for (const role of [
    'business',
    'collector',
    'admin',
    'staff',
    'guest',
    null,
  ]) {
    for (const businessRole of ['owner', 'manager', 'member', '', undefined]) {
      for (const activeBusinessId of ['business-a', '']) {
        const user = role
          ? {
              role,
              business_role: businessRole,
              active_business_id: activeBusinessId,
            }
          : null;
        const expected =
          !!role && businessRole === 'owner' && !!activeBusinessId;
        assert.equal(access.canManageTeam(user), expected);
        const visible =
          !!role &&
          ['owner', 'manager'].includes(businessRole) &&
          !!activeBusinessId;
        assert.equal(access.canSeeTeam(user), visible);
        const links = nav
          .navFor(role, businessRole, activeBusinessId)
          .flatMap((group) => group.links);
        assert.equal(
          links.some((link) => link.to === '/team'),
          visible
        );
      }
    }
  }
  // Generating an Owner's menu must not add Team to later personal menus.
  assert.equal(
    nav
      .navFor('staff')
      .flatMap((group) => group.links)
      .some((link) => link.to === '/team'),
    false
  );
  assert.equal(nav.isAuthPath('/accept-invite'), true);
});

test('Team events refresh the directory and membership events refresh identity', () => {
  const live = load('lib/live/connection.ts');
  assert.equal(
    JSON.stringify(live.keysFor('team')),
    JSON.stringify([['team']])
  );
  assert.equal(
    JSON.stringify(live.keysFor('membership')),
    JSON.stringify([['auth'], ['team']])
  );
});

test('invite sign-in redirect preserves the token and stays open to signed-in people', () => {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(source('lib/auth/redirect.ts'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    { exports, URL }
  );
  const destination = '/accept-invite?token=mailed-token';
  assert.equal(exports.authDestination(destination), destination);
  assert.equal(exports.guestAuthPages.includes('/accept-invite'), false);
});

test('Team writes use scoped routes, exact bodies and directory invalidation', () => {
  const team = load('lib/api/team.ts', {
    './resource': {
      idPath: encodeURIComponent,
      useWrite: (path, method, keys, body = (value) => value) => ({
        path,
        method,
        keys,
        body,
      }),
      useResource: (...args) => args,
    },
  });
  const role = team.useChangeTeamRole();
  assert.equal(role.path({ id: 'member/a' }), '/team/members/member%2Fa');
  assert.equal(role.method, 'PATCH');
  assert.equal(
    JSON.stringify(role.body({ id: 'person', role: 'manager' })),
    '{"role":"manager"}'
  );
  for (const [hook, method, path] of [
    ['useRemoveTeamMember', 'DELETE', '/team/members/person'],
    ['useResendInvite', 'POST', '/team/invites/person/resend'],
    ['useRevokeInvite', 'DELETE', '/team/invites/person'],
  ]) {
    const mutation = team[hook]();
    assert.equal(mutation.method, method);
    assert.equal(mutation.path('person'), path);
    assert.equal(mutation.body('person'), undefined);
    assert.equal(JSON.stringify(mutation.keys), '[["team"]]');
  }
  const query = team.useTeam('business-a');
  assert.equal(JSON.stringify(query[0]), '["team","business-a"]');
  assert.equal(query[2], true);
  assert.equal(team.useInvitePreview()[3], false);
});

test('membership loss refetches immediately and reconnects without ending the sign-in', async () => {
  const exports = {};
  const sockets = [];
  const timers = [];
  class Socket {
    constructor() {
      sockets.push(this);
    }
    close() {}
  }
  vm.runInNewContext(
    ts.transpileModule(source('lib/live/connection.ts'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      URL,
      WebSocket: Socket,
      window: { location: { href: 'http://localhost/team' } },
      setTimeout: (callback) => {
        timers.push(callback);
        return timers.length;
      },
      clearTimeout: () => {},
    }
  );
  let invalidations = 0;
  let ended = 0;
  let checked = 0;
  const connection = new exports.LiveConnection(
    {
      invalidateQueries: () => {
        invalidations++;
      },
    },
    () => {
      ended++;
    },
    async () => {
      checked++;
      return true;
    }
  );
  connection.start();
  sockets[0].onclose({ code: 4403, reason: 'membership-ended' });
  await Promise.resolve();
  assert.equal(invalidations, 1);
  assert.equal(checked, 1);
  assert.equal(ended, 0);
  timers[0]();
  assert.equal(sockets.length, 2);
  connection.stop();
});
