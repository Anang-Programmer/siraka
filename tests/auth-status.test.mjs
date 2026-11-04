import test from 'node:test';
import assert from 'node:assert/strict';
import { component, supabase, one, nodes, text, submit, loader, jsxRuntime } from './harness.mjs';

function statusPage(db) {
  const redirects = [];
  const load = loader({
    react: { Suspense: Symbol('Suspense') },
    'react/jsx-runtime': jsxRuntime,
    'next/navigation': { redirect(destination) {
      redirects.push(destination);
      throw new Error(`REDIRECT:${destination}`);
    } },
    '@/lib/supabase/server': { createClient: async () => db.client },
    '@/components/auth/logout-button': { __esModule: true, default: function LogoutButton() {} },
  }, { console: { ...console, error() {} } });
  // Reach the private async content through the actual page's Suspense child;
  // no source extraction or added exports are needed.
  const page = load('src/app/registration-status/page.tsx').default();
  const content = one(page, (n) => typeof n.type === 'function');
  return { render: () => content.type(content.props), redirects };
}

for (const [name, profile, request] of [
  ['assigned student', { role: 'mahasiswa', class_id: 'class-1', is_active: false }, null],
  ['admin without registration', { role: 'admin', class_id: null, is_active: false }, null],
  ['previously approved applicant', { role: 'mahasiswa', class_id: null, is_active: false }, { status: 'approved', class_id: 'class-1', requested_role: 'mahasiswa' }],
]) {
  test(`disabled ${name} login leads to stable status, not a login loop`, async (t) => {
    const db = supabase({ profiles: profile, registration_requests: request, classes: { class_code: 'TI-1', class_name: 'Informatika' } });
    const destinations = [];
    let refreshes = 0;
    const router = { replace: (url) => destinations.push(url), refresh: () => { refreshes++; } };
    const { view } = component('src/app/login/login-form.tsx', db, {
      mocks: { 'next/navigation': { useRouter: () => router, useSearchParams: () => new URLSearchParams() } },
    });
    t.after(() => view.unmount());
    one(view.tree, (n) => n.type === 'input' && n.props.type === 'email').props.onChange({ target: { value: '  Student@Example.Test  ' } });
    one(view.tree, (n) => n.type === 'input' && n.props.type === 'password').props.onChange({ target: { value: 'password-for-test' } });
    await submit(view);
    assert.deepEqual(destinations, ['/registration-status']);
    assert.equal(refreshes, 1);
    assert.deepEqual({ ...db.client.credentials[0] }, { email: 'student@example.test', password: 'password-for-test' });

    const status = statusPage(db);
    for (let visit = 0; visit < 2; visit++) {
      const tree = await status.render();
      assert.match(text(tree), /Akun Nonaktif/);
      assert.match(text(one(tree, (n) => n.props.role === 'alert')), /Login ulang tidak akan mengaktifkan akun/);
      assert.equal(nodes(tree, (n) => n.props.href === '/login').length, 0);
      assert.equal(nodes(tree, (n) => n.type.name === 'LogoutButton').length, 1);
    }
    assert.deepEqual(status.redirects, []);
    assert.equal(db.client.credentials.length, 1, 'Status does not attempt another login');
  });
}

test('active status profile redirects home before reading registration requests', async () => {
  const db = supabase({ profiles: { is_active: true } });
  const status = statusPage(db);
  await assert.rejects(status.render, /REDIRECT:\//);
  assert.deepEqual(status.redirects, ['/']);
  assert.deepEqual(db.queries.map((q) => q.table), ['profiles']);
});

test('missing auth session redirects to login', async () => {
  const db = supabase({}, { session: { data: { user: null }, error: { name: 'AuthSessionMissingError' } } });
  const status = statusPage(db);
  await assert.rejects(status.render, /REDIRECT:\/login/);
  assert.deepEqual(status.redirects, ['/login']);
  assert.equal(db.queries.length, 0);
});

test('profile query failure surfaces an error instead of redirecting to login', async () => {
  const db = supabase({ profiles: { data: null, error: { message: 'Database unavailable' } } });
  const status = statusPage(db);
  await assert.rejects(status.render, /Gagal membaca profil/);
  assert.deepEqual(status.redirects, []);
});

test('pending applicant still sees registration status, not disabled-account warning', async () => {
  const db = supabase({
    profiles: { is_active: false, class_id: null, role: 'mahasiswa' },
    registration_requests: { status: 'pending', class_id: 'class-1', requested_role: 'mahasiswa' },
    classes: { class_code: 'TI-1', class_name: 'Informatika' },
  });
  const status = statusPage(db);
  const tree = await status.render();
  assert.match(text(tree), /Status Pendaftaran/);
  assert.match(text(tree), /PENDING/);
  assert.doesNotMatch(text(tree), /Akun Nonaktif/);
  assert.deepEqual(status.redirects, []);
});
