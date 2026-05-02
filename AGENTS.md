# AGENTS.md

## Repo Commands
- Install dependencies with `bun install`.
- Run type checks with `bun run typecheck`.
- Run targeted tests with `bunx vitest --run --config vitest.config.ts <files>`.
- Run the production build with `bun run build`.
- Prefer targeted tests for touched routers/services first, then broaden when shared behavior changes.

## Code Review Graph
- Use code review graph when planning or reviewing non-trivial changes.
- Before finishing a feature, run review context on the final changed files and address high-risk findings.
- Treat graph output as review guidance, not a replacement for reading the source and running tests.

## Public API Ownership
- Public API routes live under `server/routes/publicApi.ts`.
- User API key lifecycle lives in `server/lib/db/apiKeys.ts` and `server/trpc/routers/account.ts`.
- API access policy lives in `server/lib/db/apiAccess.ts` and `server/trpc/routers/admin.ts`.
- Keep production endpoints stable: `POST /api/v1/search` and `GET /api/v1/credits`.
- Accept `X-API-Key` and `Authorization: Bearer <key>`.
- API keys are account-linked. Page 1 searches deduct one credit from the key owner; later pages require positive balance and must not double-charge.

## Frontend Routes
- Do not create frontend pages under `/api/*`; the backend owns the `/api` prefix.
- User-facing API pages should use `/api-docs` and `/api-access`.
- Admin API controls should use `/admin/api-access`.

## Redaction Rules
- Enforce redactions server-side before UI rendering, exports, analytics, or public API responses.
- Full redaction hides the record for normal viewers with no identifying trace.
- Masked redaction returns a visible redacted record where identity and content fields say `[redacted]`, `Data redacted`, or `Record unavailable`.
- Partial redaction only redacts configured fields, including bio, messages, display name history, bio history, profile photos, usernames, groups, and channels.
- Admin or owner bypass must be explicit and should remain audit-safe.

## Credit Ledger Rules
- Every credit balance change must create a `credit_transactions` row.
- Do not mutate balances without a matching transaction record and useful reference.
- Do not cache balances, deductions, purchases, payment sessions, or webhook state.

## Cache Rules
- In-memory cache may be used for safe metadata only: API access settings, per-user API access resolution, and throttled `last_used_at` writes.
- Never cache search results, sessions, credit balances, redaction-resolved private content, payment/webhook data, or authorization secrets.
- Cache failures should fail open for metadata reads where possible and must not skip security checks.

## UI Consistency
- Match the existing dark app shell: `#0F0F11`, radial purple page wash, compact dark cards, subtle borders, purple primary buttons, and restrained red/green status colors.
- Prefer existing components/utilities and `card-border-gradient` before adding new visual patterns.
- Keep API docs practical and compact; do not build a landing-page hero for tool/admin pages.
- Use compact tables and paginated data for ledger/admin history views.

## Security Expectations
- Validate all public API input with schema parsing.
- Return stable error codes for public API failures.
- Keep redaction enforcement on the server, not only in React.
- Record admin access-policy changes in `audit_logs`.
- Rate-limit public API requests by key or IP before search execution.
