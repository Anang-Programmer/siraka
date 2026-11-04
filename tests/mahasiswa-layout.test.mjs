import test from 'node:test';
import assert from 'node:assert/strict';
import { hooks, loader, jsxRuntime, one, text } from './harness.mjs';

for (const [name, profile, destination] of [
  ['active student', { role: 'mahasiswa', full_name: 'Test Student' }, null],
  ['missing or inactive profile', null, '/registration-status'],
  ['wrong role', { role: 'admin', full_name: 'Admin' }, '/'],
]) {
  test(`mahasiswa layout verifies on the server: ${name}`, async () => {
    const checks = [];
    function MahasiswaShell() {}
    const load = loader({
      react: { Suspense: Symbol('Suspense') },
      'react/jsx-runtime': jsxRuntime,
      'next/server': { connection: async () => { await Promise.resolve(); checks.push('connection'); } },
      '@/components/mahasiswa/mahasiswa-shell': { __esModule: true, default: MahasiswaShell },
      '@/lib/auth/get-current-profile': { getCurrentProfile: async () => { checks.push('profile'); return profile ? { profile } : null; } },
      'next/navigation': { redirect: (url) => { throw new Error(`REDIRECT:${url}`); } },
    });
    const child = { type: 'section', props: { children: 'Student page content' } };
    const layout = load('src/app/dashboard/mahasiswa/layout.tsx').default({ children: child });
    assert.match(text(layout.props.fallback), /Memuat dashboard/);
    assert.deepEqual(checks, []);
    const content = one(layout, (node) => typeof node.type === 'function');
    const render = () => content.type(content.props);
    if (destination) {
      await assert.rejects(render, (error) => error.message === `REDIRECT:${destination}`);
    } else {
      const shell = await render();
      assert.equal(shell.type, MahasiswaShell);
      assert.equal(shell.props.fullName, 'Test Student');
      assert.equal(shell.props.children, child);
    }
    assert.deepEqual(checks, ['connection', 'profile']);
  });
}

test('mahasiswa shell renders children immediately and keeps them after a logout failure', async (t) => {
  const view = hooks();
  t.after(() => view.unmount());
  const load = loader({
    react: view.react,
    'react/jsx-runtime': jsxRuntime,
    'next/link': { __esModule: true, default: function Link() {} },
    'next/navigation': {
      usePathname: () => '/dashboard/mahasiswa',
      useRouter: () => ({ replace() { throw new Error('Unexpected redirect'); }, refresh() {} }),
    },
    '@/lib/supabase/client': { createClient: () => ({ auth: { signOut: async () => ({ error: { message: 'Logout unavailable' } }) } }) },
  }, { console: { ...console, error() {} } });
  const Shell = load('src/components/mahasiswa/mahasiswa-shell.tsx').default;
  const child = { type: 'section', props: { children: 'Student page content' } };
  view.mount(() => Shell({ fullName: 'Test Student', children: child }));
  assert.equal(one(view.tree, (node) => node.type === 'main').props.children.includes(child), true);
  assert.match(text(view.tree), /Test Student/);
  await one(view.tree, (node) => node.type === 'button' && /Keluar/.test(text(node))).props.onClick();
  await view.flush();
  assert.match(text(one(view.tree, (node) => node.props.role === 'alert')), /Logout unavailable/);
  assert.equal(one(view.tree, (node) => node.type === 'main').props.children.includes(child), true);
});
