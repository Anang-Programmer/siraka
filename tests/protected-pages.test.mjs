import test from 'node:test';
import assert from 'node:assert/strict';
import { loader, jsxRuntime, one } from './harness.mjs';

const pages = [
  ['komting', 'komting', '@/components/komting/komting-dashboard', 'src/app/dashboard/komting/page.tsx'],
  ['komting', 'komting', '@/components/komting/booking-form', 'src/app/dashboard/komting/bookings/new/page.tsx'],
  ['komting', 'komting', '@/components/komting/booking-history', 'src/app/dashboard/komting/bookings/page.tsx'],
  ['komting', 'komting', '@/components/komting/student-requests', 'src/app/dashboard/komting/student-requests/page.tsx'],
  ['komting', 'komting', '@/components/komting/student-list', 'src/app/dashboard/komting/students/page.tsx'],
  ['komting', 'komting', '@/components/komting/student-approval', 'src/app/dashboard/komting/registrations/page.tsx'],
  ['komting', 'komting', '@/components/komting/komting-settings', 'src/app/dashboard/komting/settings/page.tsx'],
  ['mahasiswa', 'mahasiswa', '@/components/mahasiswa/student-room-request', 'src/app/dashboard/mahasiswa/requests/page.tsx'],
];

for (const [role, , componentPath, pagePath] of pages) {
  for (const [name, profile, destination] of [
    ['correct role', { role }, null],
    ['missing profile', null, '/login'],
    ['wrong role', { role: 'admin' }, '/'],
  ]) {
    test(`${pagePath} awaits request connection before role check: ${name}`, async () => {
      const checks = [];
      function Content() {}
      const load = loader({
        react: { Suspense: Symbol('Suspense') },
        'react/jsx-runtime': jsxRuntime,
        'next/server': { connection: async () => { await Promise.resolve(); checks.push('connection'); } },
        [componentPath]: { __esModule: true, default: Content },
        '@/lib/auth/get-current-profile': { getCurrentProfile: async () => { checks.push('profile'); return profile ? { profile } : null; } },
        'next/navigation': { redirect: (url) => { throw new Error(`REDIRECT:${url}`); } },
      });
      const page = load(pagePath).default();
      assert.equal(checks.length, 0);
      const content = one(page, (node) => typeof node.type === 'function');
      const render = () => content.type(content.props);
      if (destination) {
        await assert.rejects(render, (error) => error.message === `REDIRECT:${destination}`);
      } else {
        assert.equal((await render()).type, Content);
      }
      assert.deepEqual(checks, ['connection', 'profile']);
    });
  }
}
