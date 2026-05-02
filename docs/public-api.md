# Public API

Enterprise and allowed-plan accounts can create account-linked API keys and use their own credit balance from external websites or tools. Admins control the global API toggle, allowed plans, and user-specific allow/block/default overrides from `/admin/api-access`.

## Authentication

Send the API key with either header:

```http
X-API-Key: fbfb_live_...
```

or:

```http
Authorization: Bearer fbfb_live_...
```

API access requires an active subscription on an allowed plan unless an admin override allows the user. Admin and owner accounts may use keys for internal testing.

## Search

```http
POST /api/v1/search
Content-Type: application/json
X-API-Key: fbfb_live_...
```

Body:

```json
{
  "type": "profile",
  "q": "example",
  "filters": {
    "display_name": "Example"
  },
  "page": 1,
  "limit": 25
}
```

`type` may be `profile`, `channel`, `group`, or `message`. Use either `q` or `query`. The response matches the app search response and includes `creditsRemaining`. Page 1 deducts one credit from the API key owner's account; later pages require a positive balance but do not deduct again.

Supported filter aliases follow the product spec:

- Profile: `username`, `display_name`, `number`, `bio`, `user_id`.
- Channel/group: `username`, `display_name`, `bio`, `chat_id`.
- Message: `username`, `user_id`, `chat_id`, `keyword`.

## Examples

```bash
curl -X POST https://your-domain.example/api/v1/search \
  -H "Content-Type: application/json" \
  -H "X-API-Key: fbfb_live_..." \
  -d '{"type":"message","q":"invoice","filters":{"chat_id":"123456789"},"page":1,"limit":25}'
```

```ts
const response = await fetch("/api/v1/search", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.FBFB_API_KEY}`,
  },
  body: JSON.stringify({ type: "profile", q: "alice", page: 1, limit: 25 }),
});

if (!response.ok) {
  throw new Error((await response.json()).error);
}
```

```py
import requests

response = requests.get(
    "https://your-domain.example/api/v1/credits",
    headers={"X-API-Key": "fbfb_live_..."},
    timeout=20,
)
response.raise_for_status()
print(response.json()["balance"])
```

## Credits

```http
GET /api/v1/credits
X-API-Key: fbfb_live_...
```

Returns the API key owner's current searchable credit balance.

## Errors

Public API errors include a stable `code` value:

- `invalid_search_request` for validation failures.
- `api_key_required` when no key is provided.
- `invalid_api_key` when the key is unknown, revoked, or tied to an inactive user.
- `api_access_denied` when global, plan, or user policy blocks access.
- `insufficient_credits` when page 1 cannot be charged or later pages have no positive balance.
- `rate_limited` when the key or IP exceeds the request window.
- `search_failed` for unexpected server failures.
- `server_error` for non-search server failures.
