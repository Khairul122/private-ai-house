# Capability matrix

Reviewed 15 October 2026 against provider documentation, local implementation, and live read-only checks from this workspace. An account capability changes to `supported` only after the corresponding authenticated request succeeds. Mock tests verify adapter contracts; they do not prove account authorization.

| Provider / capability | Status | Evidence and boundary |
|---|---|---|
| Freelancer profile read | `supported` | `POST /api/freelancer/verify` successfully called `GET /api/users/0.1/self/` with the encrypted account token. The verifier retained no profile fields. |
| Freelancer project read | `supported` | A live read-only search of active TypeScript projects returned 25 valid projects; all 25 were synced locally and none were invalid. The provider response did not include a project deadline, so the UI reports it as unavailable. |
| Freelancer portfolio/message reads | `unknown` | These endpoint contracts and the account's scopes have not been verified. |
| Freelancer bid/profile/message writes | `unknown` | Writes remain disabled. Endpoint, scopes, sandbox behavior, idempotency, and account approval have not been verified. |
| GitHub selected repository content read | `unknown` for the current repository; adapter is implemented | A public read-only sync of the configured remote returned HTTP 403 without a token, and no content was indexed. The response does not distinguish a private repository from a GitHub permission/rate limit. Public repositories can be read without a token; a private repository needs a server token with `Contents: read`. The adapter caps sync at 100 eligible files and 100 KB per file. |
| LinkedIn OIDC lite profile | `connected` | The local secure store contains an unexpired member token (shown in the UI through 13 December 2026). The OAuth callback validates the official `userinfo` response before storing a token. Page-load status checks stored-token presence and expiry; it does not revalidate `userinfo` on every request. Full profile, posts, and messages remain unavailable. |
| Hermes Agent CLI drafting | `configured, consent required` | Hermes CLI v0.21.7 and profile `private-ai-house` are installed; the profile status command succeeds. No model prompt was run. Drafting stays disabled while `FVH_AI_DATA_CONSENT=false`. |
| Local simulated bid | `supported` | Deterministic policy check plus audit payload hash; never calls a marketplace endpoint and never marks a bid externally submitted. |

## Live verification record

- Freelancer read-only profile verification succeeded, and active-project search returned 25 projects. The local workspace stores those provider results; it contains no seeded demo projects.
- The UI displays `Belum dicantumkan` for all 25 deadlines because the provider did not supply a project deadline. Policy simulation blocks a project with an unknown deadline using `deadline_unknown`.
- LinkedIn shows connected based on the successful OAuth flow and its currently unexpired encrypted member token. This is limited to OIDC `openid profile`.
- API health reports local SQLite mode, Hermes `disabled`, and `liveWrites: false`. No Freelancer bid, message, or profile update was sent.
- GitHub sync for the configured project remote returned HTTP 403 without a token; no repository content was stored. The UI now leaves the live capability as `Belum diverifikasi` until a sync succeeds.
- Unit, adapter, persistence, server, and smoke tests pass; workspace typecheck, lint, and build pass. The production build reports a large Three.js chunk warning, but completes successfully.

## Sources

- [Freelancer developer portal](https://developer.freelancer.com/), [official Python SDK](https://github.com/freelancer/freelancer-sdk-python), and [API Terms](https://www.freelancer.com/about/apiterms).
- [GitHub repository contents API](https://docs.github.com/en/rest/repos/contents).
- [LinkedIn 3-legged authorization-code flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow) and [OIDC profile endpoint](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2).
- [Hermes CLI](https://hermes-agent.nousresearch.com/docs/user-guide/cli), [profiles](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/profiles.md), and [toolsets](https://hermes-agent.nousresearch.com/docs/reference/toolsets-reference).
