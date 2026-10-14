# Capability matrix

Verified 14 October 2026 against official documentation. A `supported` read capability means the documented read operation exists; it does not mean this workspace has user authorization or credentials.

| Provider / capability | Status | Evidence and boundary |
|---|---|---|
| Freelancer project/profile/portfolio/message reads | `unknown` | The official developer portal did not expose a readable endpoint contract during verification. No adapter request is sent. |
| Freelancer bid/profile/message writes | `unknown` | Endpoint, scopes, sandbox behavior, idempotency, and account approval are unverified. Writes are disabled. |
| GitHub selected repository content read | `supported` | Official Contents API supports GET; fine-grained access requires repository `Contents: read`. The local adapter reads the selected repository/branch only, caps sync at 100 eligible files and 100 KB per file, and has no cursor/incremental sync yet. No live GitHub credential was configured or used during verification. |
| LinkedIn member profile API | `unknown/manual-only` | Profile API access is restricted to approved developers and data terms; this app has no approval. Use only user-provided export/manual facts. |
| OpenCode CLI drafting | `supported, optional` | Official CLI documents `opencode run`, `--agent`, `--file`, and JSON output. The adapter was tested with a fake process runner; no real CLI/provider was configured. Fixture drafting remains the default. |
| Local simulated bid | `supported` | Deterministic policy check plus audit payload hash; never calls a marketplace endpoint and never marks a bid externally submitted. |

No live provider read or write was performed. GitHub and OpenCode adapters were verified using fixtures/mocked responses only.

## Sources

- [Freelancer developer portal](https://developer.freelancer.com/) and [API Terms](https://www.freelancer.com/about/apiterms).
- [GitHub repository contents API](https://docs.github.com/en/rest/repos/contents).
- [LinkedIn Profile API access requirements](https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/profile-api).
- [OpenCode CLI](https://dev.opencode.ai/docs/cli/).
