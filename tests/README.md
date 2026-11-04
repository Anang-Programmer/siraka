# Offline regression tests

From the `siraka` project root, with the existing development dependencies installed:

```sh
node --test tests/*.test.mjs
```

No package changes, builds, live services, credentials, network, or new dependencies
are needed. Tests use `node:test` and the already installed `typescript` package.

## What runs

- The actual `getErrorMessage` module, including native Error, plain PostgREST
  errors, invalid messages, and caller fallbacks.
- The actual student request TSX component: initial mocked data loading, validation
  through rendered form handlers, room-type selection reset/filtering, fresh room
  checks, RPC payloads, successful form reset, and plain RPC error display.
- The actual admin booking TSX component: approval disabled for expired bookings,
  inactive/missing rooms, capacity overflow, unavailable current time, and missing
  or rejected KRS; rejection remains possible. Positive approval and expiration
  during confirmation exercise the mutation handlers too.
- The actual login and registration-status modules together: disabled accounts
  reach a stable status page rather than another login redirect. Active, missing
  session, pending registration, and profile query error paths are also covered.
- SQL **static sanity only**: recognizable migration guardrails. These checks do
  not execute or parse PostgreSQL and cannot establish RLS/privilege correctness,
  trigger installation, locking, concurrency, or transactional behavior.

## Harness boundaries

`harness.mjs` transpiles complete application modules in memory using
`transpileModule`, then evaluates CommonJS output in a VM with allowlisted mocks.
It does not extract/reimplement private application helpers. Aliased local imports
resolve to actual source; Supabase clients and unmocked external imports fail
closed. No Node `require`, process, fetch, or real database client is exposed to
application code. This is an offline test boundary, not a security sandbox for
untrusted code.

The lightweight JSX representation and hook runner support state, refs,
dependency-aware callbacks/memo/effects, rerendering, and cleanup. Tests select
rendered controls by IDs/type/text, not hook indexes or source regexes. A fixed
clock makes Jakarta time checks independent of wall-clock date and host timezone.
Supabase query chains return explicit in-memory fixtures and record RPC calls.
Unexpected tables/imports fail the test. Expected error logging is captured.

This is component-logic coverage, not React DOM, browser constraint validation,
Strict Mode/concurrent rendering, Next middleware, or end-to-end coverage.
TypeScript transpilation checks syntax but is not a full typecheck. Any future
browser/database integration suite should supplement these tests, not be inferred
from their success.
