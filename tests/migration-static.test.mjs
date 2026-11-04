import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { root } from './harness.mjs';

// Static tripwires only: these do NOT parse/execute SQL or prove database safety,
// permissions, trigger installation, locking, concurrency, or transactional behavior.
const sql = fs.readFileSync(path.join(root, 'migrations/20261104_harden_workflows.sql'), 'utf8')
  .replace(/--[^\r\n]*/g, '').replace(/\s+/g, ' ').trim();

test('SQL STATIC ONLY: hardening migration retains atomic envelope and hardened functions', () => {
  assert.match(sql, /^BEGIN;/i);
  assert.match(sql, /COMMIT;$/i);
  for (const name of ['validate_booking_status_update', 'review_registration_request', 'submit_student_room_request']) {
    assert.match(sql, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([^]*?LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''`, 'i'));
  }
});

test('SQL STATIC ONLY: booking approval retains time and locked NEW-room capacity checks', () => {
  assert.match(sql, /old\.starts_at <= statement_timestamp\(\)/i);
  assert.match(sql, /select r\.capacity, r\.is_active into v_room_capacity, v_room_active from public\.rooms r where r\.id = new\.room_id for share/i);
  assert.match(sql, /v_room_active is not true/i);
  assert.match(sql, /new\.participant_count > v_room_capacity/i);
});

test('SQL STATIC ONLY: profile privilege hardening retains column revoke and effective privilege checks', () => {
  assert.match(sql, /REVOKE UPDATE ON TABLE public\.profiles FROM anon, authenticated, PUBLIC/i);
  assert.match(sql, /REVOKE UPDATE \(%s\) ON TABLE public\.profiles FROM anon, authenticated, PUBLIC/i);
  assert.match(sql, /GRANT UPDATE \(full_name\) ON TABLE public\.profiles TO authenticated/i);
  assert.match(sql, /pg_catalog\.has_table_privilege/i);
  assert.match(sql, /pg_catalog\.has_column_privilege/i);
  assert.match(sql, /UPDATE WITH GRANT OPTION/i);
});
