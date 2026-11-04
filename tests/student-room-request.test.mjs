import test from 'node:test';
import assert from 'node:assert/strict';
import { component, supabase, one, nodes, text, change, submit } from './harness.mjs';

const rooms = [
  { id: 'classroom', room_code: 'K01', room_name: 'Classroom', room_type: 'kelas', capacity: 30, is_active: true },
  { id: 'lab', room_code: 'L01', room_name: 'Laboratory', room_type: 'laboratorium', capacity: 20, is_active: true },
  { id: 'inactive', room_code: 'X01', room_name: 'Inactive', room_type: 'kelas', capacity: 30, is_active: false },
];

async function setup(t, options = {}) {
  const db = supabase({
    profiles: { role: 'mahasiswa', class_id: 'class-1', is_active: true },
    classes: { class_code: 'TI-1', class_name: 'Informatika' },
    student_room_requests: [],
    rooms: (query) => query.steps.some(([method]) => method === 'maybeSingle')
      ? (options.selectedRoom === undefined ? rooms[0] : options.selectedRoom)
      : rooms,
  }, options);
  const { view } = component('src/components/mahasiswa/student-room-request.tsx', db);
  t.after(() => view.unmount());
  await view.flush();
  assert.match(text(view.tree), /TI-1/); // Initial effect really loaded through the mocked client.
  return { db, view };
}

function valid(view) {
  for (const [id, value] of Object.entries({
    'activity-title': '  Study group  ', purpose: '  Discuss coursework  ',
    'preferred-date': '2030-01-16', 'start-time': '11:00', 'end-time': '12:00',
    'participant-count': '10',
  })) change(view, id, value);
}

const invalidCases = [
  ['missing required value', 'activity-title', ' ', /Lengkapi seluruh/],
  ['short trimmed title', 'activity-title', ' ab ', /3 sampai 120/],
  ['long title', 'activity-title', 'x'.repeat(121), /3 sampai 120/],
  ['short trimmed purpose', 'purpose', ' abcd ', /5 sampai 1000/],
  ['long purpose', 'purpose', 'x'.repeat(1001), /5 sampai 1000/],
  ['equal end time', 'end-time', '11:00', /Jam selesai/],
  ['earlier end time', 'end-time', '10:59', /Jam selesai/],
  ['past Jakarta date', 'preferred-date', '2030-01-14', /masa depan/],
  ['zero participants', 'participant-count', '0', /bilangan lebih dari nol/],
  ['negative participants', 'participant-count', '-1', /bilangan lebih dari nol/],
  ['fractional participants', 'participant-count', '1.5', /bilangan lebih dari nol/],
  ['nonnumeric participants', 'participant-count', 'NaN', /bilangan lebih dari nol/],
];
for (const [name, id, value, message] of invalidCases) {
  test(`student validation rejects ${name} without an RPC`, async (t) => {
    const { db, view } = await setup(t);
    valid(view);
    change(view, id, value);
    await submit(view);
    assert.match(text(one(view.tree, (n) => n.props.role === 'alert')), message);
    assert.equal(db.rpcs.length, 0);
  });
}

test('student validation rejects same-minute Jakarta start time', async (t) => {
  const { db, view } = await setup(t);
  valid(view);
  change(view, 'preferred-date', '2030-01-15');
  change(view, 'start-time', '10:00');
  await submit(view);
  assert.match(text(one(view.tree, (n) => n.props.role === 'alert')), /masa depan/);
  assert.equal(db.rpcs.length, 0);
});

test('changing room type clears selected room and filters active options', async (t) => {
  const { db, view } = await setup(t);
  valid(view);
  change(view, 'room-type', 'kelas');
  change(view, 'preferred-room', 'classroom');
  assert.equal(one(view.tree, (n) => n.props.id === 'preferred-room').props.value, 'classroom');
  change(view, 'room-type', 'laboratorium');
  const select = one(view.tree, (n) => n.props.id === 'preferred-room');
  assert.equal(select.props.value, '');
  assert.deepEqual(nodes(select, (n) => n.type === 'option').map((n) => n.props.value), ['', 'lab']);
  await submit(view);
  assert.equal(db.rpcs.length, 1);
  assert.equal(db.rpcs[0].args.p_preferred_room_id, null);
  assert.equal(db.rpcs[0].args.p_preferred_room_type, 'laboratorium');
  assert.equal(db.rpcs[0].args.p_activity_title, 'Study group');
  assert.equal(db.rpcs[0].args.p_purpose, 'Discuss coursework');
  assert.equal(db.rpcs[0].args.p_participant_count, 10);
  assert.equal(db.rpcs[0].args.p_notes, null);
  assert.match(text(one(view.tree, (n) => n.props.role === 'status')), /berhasil dikirim/);
});

for (const [name, room, message] of [
  ['missing room', null, /tidak tersedia/],
  ['inactive room', { ...rooms[0], is_active: false }, /nonaktif/],
  ['changed type', { ...rooms[0], room_type: 'laboratorium' }, /sesuai jenis/],
  ['reduced capacity', { ...rooms[0], capacity: 9 }, /kapasitas/],
]) {
  test(`student submit rechecks ${name} before RPC`, async (t) => {
    const { db, view } = await setup(t, { selectedRoom: room });
    valid(view);
    change(view, 'room-type', 'kelas');
    change(view, 'preferred-room', 'classroom');
    await submit(view);
    assert.match(text(one(view.tree, (n) => n.props.role === 'alert')), message);
    assert.equal(db.rpcs.length, 0);
  });
}

test('valid selected room submits actual RPC payload and resets form', async (t) => {
  const { db, view } = await setup(t);
  valid(view);
  change(view, 'room-type', 'kelas');
  change(view, 'preferred-room', 'classroom');
  await submit(view);
  assert.equal(db.rpcs.length, 1);
  assert.equal(db.rpcs[0].name, 'submit_student_room_request');
  assert.equal(db.rpcs[0].args.p_preferred_room_id, 'classroom');
  assert.equal(one(view.tree, (n) => n.props.id === 'activity-title').props.value, '');
  assert.equal(one(view.tree, (n) => n.props.id === 'preferred-room').props.value, '');
  assert.equal(one(view.tree, (n) => n.props.id === 'room-type').props.value, 'bebas');
});

test('student RPC plain PostgREST error is shown and form remains editable', async (t) => {
  const { db, view } = await setup(t, { rpc: () => ({ error: { message: 'Request denied', code: '42501' } }) });
  valid(view);
  await submit(view);
  assert.equal(db.rpcs.length, 1);
  assert.equal(text(one(view.tree, (n) => n.props.role === 'alert')), 'Request denied');
  assert.equal(one(view.tree, (n) => n.props.id === 'activity-title').props.value, '  Study group  ');
  assert.equal(one(view.tree, (n) => n.type === 'button' && n.props.type === 'submit').props.disabled, false);
});
