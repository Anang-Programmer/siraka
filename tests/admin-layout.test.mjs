import test from 'node:test';
import assert from 'node:assert/strict';
import { hooks, loader, jsxRuntime, one, text } from './harness.mjs';

function layoutWithProfile(profile) {
  const checks = [];
  const load = loader({
    react: { Suspense: Symbol('Suspense') },
    'react/jsx-runtime': jsxRuntime,
    'next/server': { connection: async () => { await Promise.resolve(); checks.push('connection'); } },
    '@/components/admin/admin-shell': { __esModule: true, default: function AdminShell() {} },
    '@/lib/auth/get-current-profile': { getCurrentProfile: async () => { checks.push('profile'); return profile ? { profile } : null; } },
    'next/navigation': { redirect: (destination) => { throw new Error(`REDIRECT:${destination}`); } },
  });
  const child = { type: 'section', props: { children: 'Admin page content' } };
  const tree = load('src/app/dashboard/admin/layout.tsx').default({ children: child });
  const protectedShell = one(tree, (node) => typeof node.type === 'function');
  return { checks, child, render: () => protectedShell.type(protectedShell.props) };
}

test('admin layout verifies role on the server and passes page content and name to shell', async () => {
  const layout = layoutWithProfile({ role: 'admin', full_name: 'Test Admin' });
  assert.deepEqual(layout.checks, []);
  const shell = await layout.render();
  assert.deepEqual(layout.checks, ['connection', 'profile']);
  assert.equal(shell.props.adminName, 'Test Admin');
  assert.equal(shell.props.children, layout.child);
});

for (const [name, profile, destination] of [
  ['missing or inactive profile', null, '/login'],
  ['wrong role', { role: 'mahasiswa', full_name: 'Student' }, '/'],
]) {
  test(`admin layout redirects ${name} before returning the shell`, async () => {
    const layout = layoutWithProfile(profile);
    await assert.rejects(layout.render, (error) => error.message === `REDIRECT:${destination}`);
    assert.deepEqual(layout.checks, ['connection', 'profile']);
  });
}

for (const [route, componentPath, fallback] of [
  ['bookings', '@/components/admin/booking-management', /Memuat halaman persetujuan booking/],
  ['users', '@/components/admin/user-management', /Memuat manajemen pengguna/],
]) {
  for (const [name, profile, destination] of [
    ['active admin', { role: 'admin', full_name: 'Test Admin' }, null],
    ['missing profile', null, '/login'],
    ['wrong role', { role: 'mahasiswa', full_name: 'Student' }, '/'],
  ]) {
    test(`${route} page awaits request connection before role check: ${name}`, async () => {
      const checks = [];
      function Management() {}
      const load = loader({
        react: { Suspense: Symbol('Suspense') },
        'react/jsx-runtime': jsxRuntime,
        'next/server': { connection: async () => { await Promise.resolve(); checks.push('connection'); } },
        [componentPath]: { __esModule: true, default: Management },
        '@/lib/auth/get-current-profile': { getCurrentProfile: async () => { checks.push('profile'); return profile ? { profile } : null; } },
        'next/navigation': { redirect: (url) => { throw new Error(`REDIRECT:${url}`); } },
      });
      const page = load(`src/app/dashboard/admin/${route}/page.tsx`).default();
      assert.match(text(page.props.fallback), fallback);
      assert.deepEqual(checks, []);
      const content = one(page, (node) => typeof node.type === 'function');
      const render = () => content.type(content.props);
      if (destination) {
        await assert.rejects(render, (error) => error.message === `REDIRECT:${destination}`);
      } else {
        assert.equal((await render()).type, Management);
      }
      assert.deepEqual(checks, ['connection', 'profile']);
    });
  }
}

for (const [name, profile, destination] of [
  ['active komting', { role: 'komting' }, null],
  ['missing profile', null, '/login'],
  ['wrong role', { role: 'admin' }, '/'],
]) {
  test(`komting layout awaits request connection before role check: ${name}`, async () => {
    const checks = [];
    function KomtingShell() {}
    const load = loader({
      react: { Suspense: Symbol('Suspense') },
      'react/jsx-runtime': jsxRuntime,
      'next/server': { connection: async () => { await Promise.resolve(); checks.push('connection'); } },
      '@/components/komting/komting-shell': { __esModule: true, default: KomtingShell },
      '@/lib/auth/get-current-profile': { getCurrentProfile: async () => { checks.push('profile'); return profile ? { profile } : null; } },
      'next/navigation': { redirect: (url) => { throw new Error(`REDIRECT:${url}`); } },
    });
    const child = { type: 'section', props: { children: 'Komting page content' } };
    const layout = load('src/app/dashboard/komting/layout.tsx').default({ children: child });
    assert.match(text(layout.props.fallback), /Memuat dashboard/);
    assert.deepEqual(checks, []);
    const content = one(layout, (node) => typeof node.type === 'function');
    const render = () => content.type(content.props);
    if (destination) {
      await assert.rejects(render, (error) => error.message === `REDIRECT:${destination}`);
    } else {
      const shell = await render();
      assert.equal(shell.type, KomtingShell);
      assert.equal(shell.props.children, child);
    }
    assert.deepEqual(checks, ['connection', 'profile']);
  });
}

test('admin shell renders children immediately and keeps them after a logout failure', async (t) => {
  const view = hooks();
  t.after(() => view.unmount());
  const load = loader({
    react: view.react,
    'react/jsx-runtime': jsxRuntime,
    'next/link': { __esModule: true, default: function Link() {} },
    'next/navigation': { usePathname: () => '/dashboard/admin', useRouter: () => ({ replace() { throw new Error('Unexpected redirect'); }, refresh() {} }) },
    '@/lib/supabase/client': { createClient: () => ({ auth: { signOut: async () => ({ error: { message: 'Logout unavailable' } }) } }) },
  }, { console: { ...console, error() {} } });
  const AdminShell = load('src/components/admin/admin-shell.tsx').default;
  const child = { type: 'section', props: { children: 'Admin page content' } };
  view.mount(() => AdminShell({ adminName: 'Test Admin', children: child }));
  assert.equal(one(view.tree, (node) => node.type === 'main').props.children.includes(child), true);
  assert.match(text(view.tree), /Test Admin/);
  await one(view.tree, (node) => node.type === 'button' && text(node) === 'Logout').props.onClick();
  await view.flush();
  assert.match(text(one(view.tree, (node) => node.props.role === 'alert')), /Logout unavailable/);
  assert.equal(one(view.tree, (node) => node.type === 'main').props.children.includes(child), true);
  assert.equal(one(view.tree, (node) => node.type === 'button').props.disabled, false);
});
