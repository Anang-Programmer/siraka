import test from 'node:test';
import assert from 'node:assert/strict';
import { component, supabase, one, text, NOW } from './harness.mjs';

const booking = {
  id: 'booking-1', requester_id: 'user-1', class_id: 'class-1', room_id: 'room-1',
  booking_type: 'regular', title: 'Study group', purpose: 'Coursework',
  participant_count: 20, status: 'pending',
  starts_at: new Date(NOW + 60000).toISOString(),
  ends_at: new Date(NOW + 3600000).toISOString(),
  created_at: new Date(NOW - 3600000).toISOString(), rejection_reason: null,
};
const room = { id: 'room-1', room_code: 'K01', room_name: 'Classroom', capacity: 20, is_active: true };
const approve = (view) => one(view.tree, (n) => n.type === 'button' && /Setujui/.test(text(n)));
const reject = (view) => one(view.tree, (n) => n.type === 'button' && text(n) === 'Tolak');

async function setup(t, overrides = {}, options = {}) {
  const db = supabase({
    bookings: [{ ...booking, ...overrides.booking }],
    profiles: [{ id: 'user-1', full_name: 'Komting' }],
    rooms: overrides.missingRoom ? [] : [{ ...room, ...overrides.room }],
    classes: [{ id: 'class-1', class_code: 'TI-1' }],
    krs_verifications: overrides.krs || [],
  });
  const result = component('src/components/admin/booking-management.tsx', db, options);
  t.after(() => result.view.unmount());
  await result.view.flush();
  assert.match(text(result.view.tree), /Study group/);
  return { ...result, db };
}

for (const [name, overrides, options, reason] of [
  ['expired', { booking: { starts_at: new Date(NOW - 1).toISOString() } }, {}, /sudah lewat/],
  ['exact start boundary', { booking: { starts_at: new Date(NOW).toISOString() } }, {}, /sudah lewat/],
  ['inactive room', { room: { is_active: false } }, {}, /nonaktif/],
  ['missing room', { missingRoom: true }, {}, /tidak ditemukan/],
  ['over capacity', { booking: { participant_count: 21 } }, {}, /melebihi kapasitas/],
  ['unknown current time', {}, { currentTime: null }, /Menunggu waktu/],
  ['missing KRS', { booking: { booking_type: 'krs_priority' } }, {}, /Dokumen KRS tidak ditemukan/],
  ['rejected KRS', { booking: { booking_type: 'krs_priority' }, krs: [{ booking_id: 'booking-1', status: 'rejected' }] }, {}, /KRS sudah ditolak/],
]) {
  test(`admin approval disabled for ${name}; rejection remains available`, async (t) => {
    const { view, db } = await setup(t, overrides, options);
    assert.equal(approve(view).props.disabled, true);
    assert.equal(reject(view).props.disabled, false);
    assert.match(text(view.tree), reason);
    // Even a stale/programmatic handler invocation must not reach the mutation.
    approve(view).props.onClick();
    await view.flush();
    assert.equal(db.rpcs.length, 0);
    assert.match(text(view.tree), reason);
  });
}

test('admin accepts future active room at exact capacity through actual RPC', async (t) => {
  const { view, db } = await setup(t);
  assert.equal(approve(view).props.disabled, false);
  approve(view).props.onClick();
  await view.flush();
  assert.equal(db.rpcs.length, 1);
  assert.equal(db.rpcs[0].name, 'admin_review_booking');
  assert.deepEqual({ ...db.rpcs[0].args }, {
    p_booking_id: 'booking-1', p_decision: 'approved', p_rejection_reason: null, p_krs_note: null,
  });
});

test('admin rechecks elapsed start time after confirmation dialog', async (t) => {
  let time;
  const { view, db, time: actualTime } = await setup(t, {}, {
    window: { confirm() { time.set(NOW + 60000); return true; } },
  });
  time = actualTime;
  assert.equal(approve(view).props.disabled, false);
  approve(view).props.onClick();
  await view.flush();
  assert.equal(db.rpcs.length, 0);
  assert.match(text(view.tree), /sudah lewat/);
});

test('expired booking can still be rejected with a reason', async (t) => {
  const { view, db } = await setup(t, { booking: { starts_at: new Date(NOW).toISOString() } });
  reject(view).props.onClick();
  await view.flush();
  assert.equal(db.rpcs.length, 1);
  assert.equal(db.rpcs[0].args.p_decision, 'rejected');
  assert.equal(db.rpcs[0].args.p_rejection_reason, 'Test rejection');
});
