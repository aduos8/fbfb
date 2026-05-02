# Security Audit

## Scope

This pass reviewed the public API, account-linked API key lifecycle, API access policy, redaction enforcement, credit ledger behavior, admin user detail surfaces, and the new API documentation/admin pages.

## Fixed Findings

- Public API authentication now returns stable error codes for missing, invalid, denied, insufficient-credit, validation, rate-limit, and server-error cases.
- Public API search accepts the product-spec `q` alias while preserving the existing `query` field and `POST /api/v1/search` endpoint.
- API requests are rate-limited by API key or IP before search execution.
- API key `last_used_at` writes are throttled with in-memory metadata caching to avoid write amplification.
- API key names are normalized, active key count is capped, revoked keys remain denied, and one-time key reveal remains the only full secret exposure.
- Admin API access setting and user override changes are written to `audit_logs`.
- API access metadata uses short in-memory caches only for global settings and per-user access resolution; credit balances, deductions, sessions, search results, and redaction-resolved private content are not cached.
- Masked user history now returns explicit `[redacted]` values for username, display name, bio, and phone history instead of looking like missing data.
- Admin user transactions now select and return `reference`, so activity context remains visible in paginated transaction views.

## Existing Protections Verified

- Full redactions are filtered out server-side for normal viewers.
- Masked and partial redactions are resolved in backend search/lookup paths before React renders results.
- Search API page 1 deducts a credit from the API key owner; later pages require positive balance without double-charging.
- Credit balance changes are represented in `credit_transactions`.
- User-facing API routes avoid `/api/*`, preserving backend ownership of that prefix.

## Residual Risks

- The in-memory API rate limiter is per-process. Multi-instance deployments should move public API rate-limit state to Redis or an edge gateway.
- API access caches are intentionally short-lived. Admin changes may take up to the configured TTL to expire on other app processes until a shared cache invalidation layer exists.
- Redaction bypass rules should be reviewed whenever adding new admin exports or analytics views.
- Public API examples should be updated if the externally hosted domain or SDK conventions change.

## Verification

- Run targeted redaction, public API, and lookup tests after API/redaction changes.
- Run `bun run typecheck` and `bun run build` before release.
- Use code review graph on final changed files to review impacted flows.
