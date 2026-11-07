import test from 'node:test';
import assert from 'node:assert/strict';
import { loader, jsxRuntime, one, text } from './harness.mjs';

for (const [role, destination] of [
  [null, '/login'],
  ['admin', '/dashboard/admin'],
  ['komting', '/dashboard/komting'],
  ['mahasiswa', '/dashboard/mahasiswa'],
]) {
  test(`home awaits request connection before redirecting ${role ?? 'guest'}`, async () => {
    const calls = [];
    const load = loader({
      react: { Suspense: Symbol('Suspense') },
      'react/jsx-runtime': jsxRuntime,
      'next/server': { connection: async () => { await Promise.resolve(); calls.push('connection'); } },
      '@/lib/auth/get-current-profile': { getCurrentProfile: async () => { calls.push('profile'); return role ? { profile: { role } } : null; } },
      'next/navigation': { redirect: (url) => { calls.push(url); throw new Error(`REDIRECT:${url}`); } },
    });
    const page = load('src/app/page.tsx').default();
    assert.equal(page.props.fallback.type, 'main');
    assert.match(text(page.props.fallback), /Memuat dashboard/);
    assert.deepEqual(calls, []);
    const content = one(page, (node) => typeof node.type === 'function');
    await assert.rejects(() => content.type(content.props), (error) => error.message === `REDIRECT:${destination}`);
    assert.deepEqual(calls, ['connection', 'profile', destination]);
  });
}
