-- Incremental migration for the application objects in migrations/schema.sql.
-- Apply as their existing trusted owner (normally postgres), not an API role.
-- All changes are atomic; an error requires ROLLBACK, not a partial retry.
BEGIN;

-- Keep approval validation at the shared status-transition boundary: both
-- admin_review_booking() and direct Admin status updates invoke this trigger.
-- Existing KRS, history, reservation and overlap checks remain transactional.
CREATE OR REPLACE FUNCTION public.validate_booking_status_update() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_krs_status public.krs_verification_status;
  v_admin boolean := (select public.is_admin());
  v_system_completion boolean := coalesce(current_setting('siraka.system_completion', true), 'off') = 'on';
  v_owner_komting boolean := false;
  v_room_capacity integer;
  v_room_active boolean;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if old.status = 'pending'::public.booking_status then
    if new.status not in (
      'under_review'::public.booking_status,
      'approved'::public.booking_status,
      'rejected'::public.booking_status,
      'cancelled'::public.booking_status
    ) then raise exception 'Invalid booking status transition.'; end if;
  elsif old.status = 'under_review'::public.booking_status then
    if new.status not in (
      'approved'::public.booking_status,
      'rejected'::public.booking_status,
      'cancelled'::public.booking_status
    ) then raise exception 'Invalid booking status transition.'; end if;
  elsif old.status = 'approved'::public.booking_status then
    if new.status not in (
      'cancelled'::public.booking_status,
      'completed'::public.booking_status
    ) then raise exception 'Invalid booking status transition.'; end if;
  else
    raise exception 'This booking has already reached a final status.';
  end if;

  if new.status = 'cancelled'::public.booking_status and not v_admin then
    v_owner_komting := (select public.is_komting()) and old.requester_id = (select auth.uid());
    if not v_owner_komting then
      raise exception 'Only the requesting komting or admin can cancel this booking.';
    end if;
  elsif new.status = 'completed'::public.booking_status then
    if old.status <> 'approved'::public.booking_status then
      raise exception 'Only an approved booking can be completed.';
    end if;
    if new.actual_ended_at is null
       or new.actual_ended_at <= old.starts_at
       or new.actual_ended_at > old.ends_at
       or new.actual_ended_at > statement_timestamp() then
      raise exception 'Invalid actual end time.';
    end if;
    if not v_admin and not v_system_completion
       and not ((select public.is_komting()) and old.requester_id = (select auth.uid())) then
      raise exception 'Only the requesting komting, admin, or scheduled system job can complete this booking.';
    end if;
  elsif not v_admin then
    raise exception 'Only admin can review, approve, or reject bookings.';
  end if;

  if new.status = 'approved'::public.booking_status then
    if old.starts_at <= statement_timestamp() then
      raise exception 'The booking start time has passed; it can no longer be approved.';
    end if;

    -- The booking row is already locked by UPDATE. FOR SHARE (unlike
    -- FOR KEY SHARE) also blocks non-key room capacity/is_active updates.
    -- Read and validate the same locked room version, holding the lock through
    -- KRS/history/reservation work until COMMIT or ROLLBACK. Validate NEW so
    -- a direct Admin UPDATE cannot change the room/count alongside approval
    -- while having only the previous room/count checked.
    select r.capacity, r.is_active
    into v_room_capacity, v_room_active
    from public.rooms r
    where r.id = new.room_id
    for share;

    if not found or v_room_active is not true then
      raise exception 'Room does not exist or is inactive.';
    end if;
    if new.participant_count is not null
       and new.participant_count > v_room_capacity then
      raise exception 'Participant count exceeds room capacity.';
    end if;

    if old.booking_type = 'krs_priority'::public.booking_type then
      select kv.status into v_krs_status
      from public.krs_verifications kv where kv.booking_id = old.id;
      if v_krs_status is distinct from 'verified'::public.krs_verification_status then
        raise exception 'KRS must be verified before approving this booking.';
      end if;
    end if;
    new.decided_by := (select auth.uid());
    new.decided_at := statement_timestamp();
  elsif new.status = 'rejected'::public.booking_status then
    new.decided_by := (select auth.uid());
    new.decided_at := statement_timestamp();
  end if;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.review_registration_request(p_request_id uuid, p_decision text, p_rejection_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id uuid := (select auth.uid());
  v_actor_role public.app_role;
  v_actor_class_id uuid;
  v_actor_active boolean;
  v_request public.registration_requests%rowtype;
  v_class_active boolean;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.';
  end if;

  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected.';
  end if;

  if p_decision = 'rejected' and nullif(trim(p_rejection_reason), '') is null then
    raise exception 'A rejection reason is required.';
  end if;

  select rr.* into v_request
  from public.registration_requests rr
  where rr.id = p_request_id
  for update;

  if not found then
    raise exception 'Registration request was not found.';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'This registration request has already been reviewed.';
  end if;

  -- Only approval needs an available, active class. Keep the class lock for
  -- approval serialization and protection against concurrent deactivation;
  -- rejection still requires the original authorized, active reviewer below.
  if p_decision = 'approved' then
    select c.is_active into v_class_active
    from public.classes c
    where c.id = v_request.class_id
    for update;

    if not found or v_class_active is not true then
      raise exception 'The selected class is inactive or unavailable.';
    end if;
  end if;

  select p.role, p.class_id, p.is_active
  into v_actor_role, v_actor_class_id, v_actor_active
  from public.profiles p
  where p.id = v_actor_id;

  if not found or v_actor_active is not true then
    raise exception 'Reviewer account is inactive.';
  end if;

  if v_request.requested_role = 'komting' then
    if v_actor_role <> 'admin'::public.app_role then
      raise exception 'Only an Admin can review a Komting registration.';
    end if;

    if p_decision = 'approved' and exists (
      select 1 from public.profiles p
      where p.class_id = v_request.class_id
        and p.role = 'komting'::public.app_role
        and p.is_active = true
    ) then
      raise exception 'This class already has an active Komting.';
    end if;

  elsif v_request.requested_role = 'mahasiswa' then
    if v_actor_role <> 'komting'::public.app_role
       or v_actor_class_id is distinct from v_request.class_id then
      raise exception 'Only the active Komting of the selected class can review this request.';
    end if;
  else
    raise exception 'Unsupported requested role.';
  end if;

  if p_decision = 'approved' then
    update public.profiles
    set role = v_request.requested_role::public.app_role,
        class_id = v_request.class_id,
        is_active = true
    where id = v_request.user_id
      and is_active = false;

    if not found then
      raise exception 'Applicant profile is already active or unavailable.';
    end if;

    update public.registration_requests
    set status = 'approved',
        reviewed_by = v_actor_id,
        reviewed_at = now(),
        rejection_reason = null
    where id = v_request.id;
  else
    -- The profile remains inactive and unassigned after rejection.
    update public.registration_requests
    set status = 'rejected',
        reviewed_by = v_actor_id,
        reviewed_at = now(),
        rejection_reason = trim(p_rejection_reason)
    where id = v_request.id;
  end if;

  return jsonb_build_object(
    'request_id', v_request.id,
    'user_id', v_request.user_id,
    'requested_role', v_request.requested_role,
    'class_id', v_request.class_id,
    'status', p_decision,
    'reviewed_by', v_actor_id
  );
end;
$$;

CREATE OR REPLACE FUNCTION public.submit_student_room_request(p_activity_title text, p_purpose text, p_preferred_date date, p_preferred_start_time time without time zone, p_preferred_end_time time without time zone, p_preferred_room_type text DEFAULT 'bebas'::text, p_participant_count integer DEFAULT NULL::integer, p_notes text DEFAULT NULL::text, p_preferred_room_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_class_id uuid;
  v_request_id uuid;
  v_role public.app_role;
  v_active boolean;
  v_selected_room_type text;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  -- Match the existing trimmed-length CHECK constraints, including NULL input.
  if p_activity_title is null
     or char_length(trim(p_activity_title)) not between 3 and 120 then
    raise exception 'Nama kegiatan harus terdiri dari 3 sampai 120 karakter.';
  end if;

  if p_purpose is null
     or char_length(trim(p_purpose)) not between 5 and 1000 then
    raise exception 'Kebutuhan atau tujuan harus terdiri dari 5 sampai 1000 karakter.';
  end if;

  if p_preferred_date is null
     or p_preferred_date <
       (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Tanggal kebutuhan tidak boleh di masa lalu.';
  end if;

  if p_preferred_start_time is null
     or p_preferred_end_time is null
     or p_preferred_end_time <= p_preferred_start_time then
    raise exception 'Rentang waktu kebutuhan tidak valid.';
  end if;

  if (p_preferred_date + p_preferred_start_time) <
     (now() at time zone 'Asia/Jakarta') then
    raise exception 'Waktu kebutuhan tidak boleh di masa lalu.';
  end if;

  if coalesce(p_preferred_room_type, 'bebas')
     not in ('kelas', 'laboratorium', 'bebas') then
    raise exception 'Jenis ruangan tidak valid.';
  end if;

  if p_participant_count is not null
     and p_participant_count <= 0 then
    raise exception 'Jumlah peserta harus lebih dari nol.';
  end if;

  -- Validasi ruangan pilihan.
  if p_preferred_room_id is not null then
    select r.room_type::text
      into v_selected_room_type
    from public.rooms r
    where r.id = p_preferred_room_id
      and r.is_active = true;

    if not found then
      raise exception 'Ruangan pilihan tidak ditemukan atau tidak aktif.';
    end if;

    if coalesce(p_preferred_room_type, 'bebas') <> 'bebas'
       and v_selected_room_type <> p_preferred_room_type then
      raise exception 'Jenis ruangan pilihan tidak sesuai dengan filter.';
    end if;
  end if;

  -- Validasi akun mahasiswa.
  select p.class_id, p.role, p.is_active
    into v_class_id, v_role, v_active
  from public.profiles p
  where p.id = v_user_id;

  if not found
     or v_role <> 'mahasiswa'::public.app_role
     or v_active is not true then
    raise exception 'Only active Mahasiswa accounts can submit room suggestions.';
  end if;

  if v_class_id is null then
    raise exception 'Akun belum terhubung dengan kelas.';
  end if;

  -- Pastikan kelas memiliki Komting aktif.
  if not exists (
    select 1
    from public.profiles p
    where p.class_id = v_class_id
      and p.role = 'komting'::public.app_role
      and p.is_active = true
  ) then
    raise exception 'Kelas belum memiliki Komting aktif.';
  end if;

  -- Simpan pengajuan.
  insert into public.student_room_requests (
    student_id,
    class_id,
    activity_title,
    purpose,
    preferred_date,
    preferred_start_time,
    preferred_end_time,
    preferred_room_type,
    preferred_room_id,
    participant_count,
    notes
  )
  values (
    v_user_id,
    v_class_id,
    trim(p_activity_title),
    trim(p_purpose),
    p_preferred_date,
    p_preferred_start_time,
    p_preferred_end_time,
    coalesce(p_preferred_room_type, 'bebas'),
    p_preferred_room_id,
    p_participant_count,
    nullif(trim(p_notes), '')
  )
  returning id into v_request_id;

  return v_request_id;
end;
$$;

-- RLS limits rows, not writable columns: profiles_update_own_name alone does
-- not stop a caller from changing their own role/class_id/is_active.
-- Table-level REVOKE does not remove old column grants. Enumerate every live
-- column (including any deployment-specific additions), then allow only name.
-- Do not revoke from trusted owners/service_role or change SECURITY DEFINER
-- ownership: registration, activation and auth-trigger updates still need it.
REVOKE UPDATE ON TABLE public.profiles FROM anon, authenticated, PUBLIC;

DO $$
declare
  v_columns text;
begin
  select string_agg(format('%I', a.attname), ', ' order by a.attnum)
  into v_columns
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.profiles'::regclass
    and a.attnum > 0
    and not a.attisdropped;

  execute format(
    'REVOKE UPDATE (%s) ON TABLE public.profiles FROM anon, authenticated, PUBLIC',
    v_columns
  );
end;
$$;

GRANT UPDATE (full_name) ON TABLE public.profiles TO authenticated;

-- Fail closed if a custom inherited role still grants UPDATE. Do not blindly
-- revoke privileges from parent roles, which could also own privileged RPCs.
-- Effective privilege checks include PUBLIC and inherited grants, not merely
-- the ACL entries directly attached to anon/authenticated.
DO $$
declare
  v_role text;
  v_column record;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    if pg_catalog.has_table_privilege(v_role, 'public.profiles', 'UPDATE') then
      raise exception 'Unsafe inherited profiles table UPDATE for role %; inspect role memberships/grants before retrying.', v_role;
    end if;

    for v_column in
      select a.attname
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.profiles'::regclass
        and a.attnum > 0
        and not a.attisdropped
    loop
      if (v_role = 'anon' or v_column.attname <> 'full_name')
         and pg_catalog.has_column_privilege(v_role, 'public.profiles', v_column.attname, 'UPDATE') then
        raise exception 'Unsafe inherited profiles.% UPDATE for role %; inspect role memberships/grants before retrying.', v_column.attname, v_role;
      end if;

      if pg_catalog.has_column_privilege(v_role, 'public.profiles', v_column.attname, 'UPDATE WITH GRANT OPTION') then
        raise exception 'Unsafe profiles.% UPDATE grant option for role %; inspect role memberships/grants before retrying.', v_column.attname, v_role;
      end if;
    end loop;
  end loop;
end;
$$;

COMMIT;
