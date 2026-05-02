export const AGENTS_PLACEHOLDERS = {
  apiKeyEnvVar: "YOUR_API_KEY",
};

export function buildPublicApiAgentsTemplate(baseUrl: string) {
  return `# AGENTS.md

## Purpose
- Integrate this public API into this application without changing the production API contract.
- Use the stable endpoints exactly as documented below.

## Base URL And Auth
- Base URL: \`${baseUrl}\`
- Read the API key from an environment variable such as \`${AGENTS_PLACEHOLDERS.apiKeyEnvVar}\`
- Treat API keys as secrets. Do not log them, expose them to clients unnecessarily, or hardcode them in source control.
- Support either auth header:
  - \`X-API-Key: <key>\`
  - \`Authorization: Bearer <key>\`

## Stable Endpoints
- \`POST /api/v1/search\`
- \`GET /api/v1/credits\`

## Search Contract
- The search endpoint accepts \`type\` values: \`profile\`, \`channel\`, \`group\`, \`message\`
- The request may send either \`q\` or \`query\`. Prefer \`q\` for public API examples, but accept either when building abstractions.
- Keep \`page >= 1\`
- Keep \`limit <= 100\`
- Preserve filter aliases exactly as documented for each search type.

## Credit Semantics
- Page 1 searches deduct one credit from the API key owner.
- Later pages must not trigger a duplicate charge for the same query flow.
- Later pages still require a positive balance to execute.
- Avoid accidental duplicate page-1 searches caused by automatic retries, double submissions, or eager refetches.

## Error Handling
- Handle stable error codes explicitly:
  - \`invalid_search_request\`
  - \`api_key_required\`
  - \`invalid_api_key\`
  - \`insufficient_credits\`
  - \`api_access_denied\`
  - \`rate_limited\`
  - \`search_failed\`
  - \`server_error\`
- If the API returns \`rate_limited\`, respect the \`Retry-After\` header before retrying.
- Surface non-2xx API failures clearly to the caller with the returned \`code\`, \`error\`, and any validation issues.

## Redactions And Access
- Respect redacted responses. Do not try to infer or reconstruct hidden data from partial or masked fields.
- Assume redaction and access policy are enforced server-side and preserve those results in downstream UI and logs.

## Integration Shape
- Prefer a typed request builder and a small API client wrapper over ad hoc fetch calls spread throughout the codebase.
- Keep search and credits lookup in separate client methods.
- Return parsed JSON on success and structured errors on failure.

## Example Requests
\`\`\`ts
const response = await fetch("${baseUrl}/api/v1/search", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": process.env.${AGENTS_PLACEHOLDERS.apiKeyEnvVar}!,
  },
  body: JSON.stringify({
    type: "profile",
    q: "alice",
    filters: { display_name: "Alice" },
    page: 1,
    limit: 25,
  }),
});
\`\`\`

\`\`\`ts
const creditsResponse = await fetch("${baseUrl}/api/v1/credits", {
  headers: {
    Authorization: \`Bearer \${process.env.${AGENTS_PLACEHOLDERS.apiKeyEnvVar}}\`,
  },
});
\`\`\`

## Delivery Expectations
- Build against the existing public API instead of introducing new endpoints.
- Keep runtime error messages clear and actionable.
- Add request deduping or submission guards where a UI could accidentally trigger duplicate page-1 searches.
`;
}
