# Capability matrix

Verified 14 October 2026 against official documentation. A `supported` read capability means the documented read operation exists; it does not mean this workspace has user authorization or credentials.

| Provider / capability | Status | Evidence and boundary |
|---|---|---|
| Freelancer profile read | `supported` | The official SDK documents `GET /api/users/0.1/self/`; the saved account token returned a valid profile response in a live read-only check. The verifier keeps no profile fields. |
| Freelancer project read | `supported` | The official SDK documents active project search at `GET /api/projects/0.1/projects/active/`; the saved account token passed a one-result read-only check. Project content is not stored by the verifier. |
| Freelancer portfolio/message reads | `unknown` | These endpoints and their account scopes have not been verified in this workspace. |
| Freelancer bid/profile/message writes | `unknown` | Writes are disabled. Endpoint, scopes, sandbox behavior, idempotency, and account approval are not verified for this workspace. |
| GitHub selected repository content read | `supported` | Official Contents API supports GET; fine-grained access requires repository `Contents: read`. The local adapter reads the selected repository/branch only, caps sync at 100 eligible files and 100 KB per file, and has no cursor/incremental sync yet. No live GitHub credential was configured or used during verification. |
| LinkedIn OIDC lite profile | `pending` | Client credentials are encrypted locally. The member must complete OAuth consent; the LinkedIn app must have OIDC product access and accept the callback URL shown in the integration page. The connector uses the official 3-legged authorization-code flow because LinkedIn does not support the OIDC `openid` permission in its native PKCE flow. It requests only `openid profile` and verifies the official `userinfo` endpoint. Full profile, posts, and messages remain unavailable; user-provided exports/manual facts remain supported. |
| OpenCode CLI drafting | `supported, optional` | Official CLI documents `opencode run`, `--agent`, `--file`, and JSON output. The adapter was tested with a fake process runner; no real CLI/provider was configured. Fixture drafting remains the default. |
| Local simulated bid | `supported` | Deterministic policy check plus audit payload hash; never calls a marketplace endpoint and never marks a bid externally submitted. |

Freelancer verification performed two live read-only requests on 14 October 2026: the authenticated member endpoint and one active-project search result. No project or profile content was retained. No live write was performed. GitHub and OpenCode adapters were verified using fixtures/mocked responses only.

The LinkedIn developer app was inspected on 14 October 2026. Its OIDC product still shows `Request access`; LinkedIn says the app-to-company association must be verified before access can be requested. The Settings page currently associates the app with the Microsoft LinkedIn Page and marks that association unverified. The Auth page now lists `http://localhost:3001/api/linkedin/callback` as an authorized redirect URL. The first native-PKCE request was rejected because OIDC is unsupported for that flow. The 3-legged authorization-code request now reaches LinkedIn but returns an error before member consent. No product access was granted, no member consent was submitted, and no LinkedIn token was stored.

## Sources

- [Freelancer developer portal](https://developer.freelancer.com/), [official Python SDK](https://github.com/freelancer/freelancer-sdk-python), and [API Terms](https://www.freelancer.com/about/apiterms).
- [GitHub repository contents API](https://docs.github.com/en/rest/repos/contents).
- [LinkedIn 3-legged authorization-code flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow) and [OIDC profile endpoint](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2). The native PKCE attempt returned LinkedIn's error “Open ID permission is not supported for PKCE flows,” so the connector uses the documented client-secret exchange and a registered loopback callback.
- [OpenCode CLI](https://dev.opencode.ai/docs/cli/).
