# Incremental database migrations

`schema.sql` is a reference snapshot of an existing Supabase database, **not an
installation or rollback script**. It contains managed schemas and is not a
migration history. Do not restore that dump into an existing Supabase project.
Do not edit it to apply these fixes.

## `20261104_harden_workflows.sql`

This migration targets the application objects and signatures in `schema.sql`.
It does not create a database from scratch, repair existing records, change room
visibility, or integrate a new frontend API.

### Changes

- **Booking approval:** replaces `validate_booking_status_update()`, the existing
  shared trigger used by `admin_review_booking()` and permitted direct Admin
  status updates. Approval rechecks the target room's current `is_active` and
  capacity using the actual row being approved (`NEW.room_id` and
  `NEW.participant_count`). The booking update holds its booking-row lock, and
  `SELECT ... FOR SHARE` holds the room-row lock until transaction end. Unlike
  `FOR KEY SHARE`, this blocks concurrent non-key updates of room capacity or
  activation. If a room edit wins the lock first, approval waits and revalidates
  its result (or PostgreSQL raises a serialization error at stricter isolation).
  If approval wins first, the room edit waits until approval finishes.
- **Registration review:** replaces `review_registration_request()`. Only
  approval requires and locks an active class. Rejection is possible after class
  deactivation, but still requires a rejection reason and the original active,
  authorized reviewer: Admin for Komting applicants, or that class's Komting for
  Mahasiswa applicants. Rejection does not activate or assign the applicant.
- **Student room requests:** replaces `submit_student_room_request()` to validate
  trimmed titles at **3–120 characters** and purposes at **5–1000 characters**,
  matching existing table constraints. Null, empty and too-short inputs receive
  explicit RPC errors instead of reaching a constraint error. Other validation
  and insertion behavior is unchanged.
- **Profile self-update:** revokes table-level `UPDATE` and **all existing
  column-level `UPDATE` grants** on `public.profiles` from `anon`,
  `authenticated` and `PUBLIC`, then grants only `UPDATE (full_name)` to
  `authenticated`. Column enumeration covers `id`, `email`, `student_number`,
  `role`, `class_id`, `is_active`, timestamps and any additional existing columns.
  The existing self-row RLS policy remains in force; column privileges and RLS
  must both allow an update. Even an authenticated Admin must use trusted RPCs,
  not direct profile updates, to change protected fields.

The replacement functions keep their signatures, defaults, return types,
`SECURITY DEFINER` and empty `search_path`. `CREATE OR REPLACE` retains existing
ownership and execution ACLs. The migration does not broaden RPC execution
permissions or change RLS policies. Existing booking transitions, KRS verification,
expiry checks, history, reservations and the reservation exclusion constraint
remain in place. A failed approval rolls back changes from that RPC call,
including any earlier KRS verification, history and reservation changes.

### Profile security decisions and limits

A row-level policy named `profiles_update_own_name` does **not** restrict writable
columns. Revoking table `UPDATE` alone is also insufficient if column grants
already exist. This migration removes both before adding the single-column
allowlist; it does not assume the dump contains the deployed database's ACLs.

PostgreSQL grants are additive, including inherited roles and `PUBLIC`. The
migration checks effective table/column privileges for `anon` and
`authenticated`, including grant options, and **aborts the whole transaction** if
custom inherited privileges still expose protected updates. Investigate those
memberships/grants with the database administrator before retrying. It does not
revoke indiscriminately from parent roles, change owners, use `CASCADE`, or touch
`service_role` grants. Dependent grants that prevent revocation also cause a safe
transaction failure and need administrator review.

No profile guard trigger is added: checking JWT identity in such a trigger could
also reject legitimate `SECURITY DEFINER` RPC updates, since those retain the
caller's JWT identity. Column privileges protect invoker updates while trusted
function/table owners retain the ability to run `review_registration_request()`,
`admin_set_user_active()`, `set_komting_student_active()` and
`handle_new_auth_user()`. These must remain owned by trusted server roles, not
`anon` or `authenticated`. The existing timestamp trigger can still set
`updated_at` during a permitted name update; the caller must not include that
column in its own update payload.

This is not protection against privileged owners, leaked service-role credentials,
future unsafe grants/memberships, or other unsafe definer functions. Do not grant
API roles membership in trusted server roles (including memberships allowing
`SET ROLE`), and retain the column allowlist in future migrations. Custom
non-inherited role-switching arrangements require separate administrator review;
the effective-privilege assertions are not an audit of every possible role switch.

### Apply manually in Supabase SQL Editor

1. Review the migration against the target database's actual objects, function
   owners, grants and role memberships. Take an appropriate backup and record
   the original definitions and profile ACLs if a later reversal may be needed.
   Test first in a disposable/local or isolated staging project.
2. In the intended project's **Supabase SQL Editor**, use the existing trusted
   object owner, normally `postgres`. Confirm the project and selected role.
   Do not run this as `anon`, `authenticated` or from browser/client code.
3. Paste and run the **entire** `20261104_harden_workflows.sql`, including `BEGIN`
   and `COMMIT`, as one script. Do not paste or restore `schema.sql`. The migration
   changes definitions/privileges only; it does not call application RPCs,
   impersonate users, or modify authentication records.
4. If it fails, issue `ROLLBACK;` if the SQL Editor session still has an open or
   aborted transaction. Diagnose the failure before rerunning the entire file.
   Never apply the remaining statements piecemeal or bypass the privilege check.
5. Record the successful application in your deployment notes. No automatic
   migration ledger is created. The definitions and privilege normalization can
   be reapplied, but rerunning also removes any later API-role profile grants.

**Rollback:** before a successful `COMMIT`, `ROLLBACK;` cancels every change.
After commit, `ROLLBACK;` cannot undo the migration. Use a separately reviewed
transaction restoring the exact pre-application function definitions and ACLs
from your backup, or preferably a corrective forward migration. Restoring broad
profile grants or the old approval checks reintroduces the vulnerabilities; do
not use a blanket `GRANT UPDATE` as a rollback. No automatic insecure down
migration is supplied.

### Validation and regression checklist

No SQL was executed and no Supabase connection was made while authoring this
migration. Runtime SQL validation requires a PostgreSQL/Supabase test environment;
JavaScript lint is not SQL validation. The checks in `../tests/` include only
static SQL guardrails; they do not execute this migration or verify database behavior.

Use disposable fixtures in an isolated test database, not production accounts.
Keep fixture creation, any simulated authentication settings, RPC calls and
assertions inside a transaction ending in **`ROLLBACK`**, with savepoints or
caught exceptions for expected failures. Do not use external Auth API calls to
create test users: those are outside that rollback. Real user-session application
tests belong only in an isolated staging project. Suggested cases:

- A pending/under-review booking with an inactive room or a reduced capacity below
  its participant count cannot be approved; booking status, KRS status, history
  and reservations remain unchanged. At-capacity and null-count approvals retain
  their original behavior. Test both the Admin RPC and a permitted direct Admin
  status transition, including simultaneous room/count changes.
- Valid regular and KRS approvals still work. Missing/rejected KRS, elapsed start
  times, invalid transitions, non-Admin reviewers and overlapping reservations
  still fail. A reservation conflict must also undo any KRS update in the call.
- In **two isolated test sessions**, use explicit transactions to interleave a
  room deactivation/capacity reduction and an approval. Test both lock orders;
  confirm blocking and post-wait validation, then roll back both sessions.
  Locks protect the approval transaction, not an indefinite promise: an Admin
  may still change a room after approval commits. Existing approved bookings
  are not retroactively invalidated or repaired.
- An inactive class's pending registration can be rejected by the proper active
  reviewer, but not approved. Wrong-role, wrong-class and inactive reviewers,
  missing reasons and repeated reviews must still fail. Active-class approvals
  and the one-active-Komting rule must still work.
- Request title lengths 0/1/2/121 and purpose lengths 0/1/4/1001, null inputs and
  whitespace-only inputs fail. Valid 3/120 and 5/1000 boundaries pass with otherwise
  valid fixtures. Leading/trailing spaces are trimmed consistently with checks.
- Under actual `anon`/`authenticated` database privileges (not just an owner
  session with a JWT setting), verify that only `authenticated` can update its
  own `full_name`. Attempts to update someone else's name fail RLS; attempts to
  set protected columns, even to their existing values, fail privileges. Include
  mixed `full_name` + protected-field payloads and inactive users attempting to
  self-activate. Verify activation/registration/auth-trigger server paths still
  work as their trusted owners.
- In a rollback-only test setup, seed both table and column grants to API roles
  and `PUBLIC`; confirm the migration removes them. Seed an inherited protected
  update grant; confirm the migration aborts rather than silently leaving access.

Historical room visibility is deliberately unchanged. This migration neither
widens the rooms SELECT policy nor adds an unintegrated room-summary RPC.
