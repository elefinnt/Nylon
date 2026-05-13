# Config reference

`pr-review` reads a single TOML file at `~/.pr-agent/config.toml` (on Windows
that resolves to `%USERPROFILE%\.pr-agent\config.toml`). The file is created
for you when you run `pr-review init`.

## Template

```toml
[github]
# Personal Access Token. Needs the following scopes:
#   - repo (read access for private repos; public_repo if you only review public PRs)
#   - pull_request:write (to post the review back)
token = "ghp_replace_me"

# Cursor uses your existing Pro / Pro+ plan instead of a separate AI bill.
# Mint a personal API key at https://cursor.com/dashboard/integrations
# and monitor SDK spend at https://cursor.com/dashboard/usage.
[providers.cursor]
api_key = "cursor_replace-me"
default_model = "composer-2"

[providers.anthropic]
api_key = "sk-ant-replace-me"
# Optional. Falls back to the latest Claude model the SDK knows about.
default_model = "claude-opus-4.5"

[providers.openai]
api_key = "sk-replace-me"
# Optional. Falls back to the latest GPT model the SDK knows about.
default_model = "gpt-5"

[defaults]
# Optional. If both are set the interactive picker is skipped.
# provider = "anthropic"
# model = "claude-opus-4.5"
post_review = true
```

## Sections

### `[github]`

| Key     | Required | Notes                                              |
| ------- | -------- | -------------------------------------------------- |
| `token` | yes      | A GitHub PAT. Classic or fine-grained both work.   |

#### Minting a token

1. Go to <https://github.com/settings/tokens>.
2. **Personal access tokens (classic)** -> **Generate new token (classic)**.
3. Tick `repo` and `workflow` if you want to review CI-related PRs.
4. Copy the token (it is only shown once) and paste it into `config.toml`.

For fine-grained tokens, grant **Pull requests: read and write** plus
**Contents: read** on the repos you want to review.

### `[providers.<id>]`

One block per provider you want to enable. `id` must match a provider known
to the agent (see `pr-review providers ls`).

| Key             | Required | Notes                                                  |
| --------------- | -------- | ------------------------------------------------------ |
| `api_key`       | yes      | Provider API key.                                      |
| `default_model` | no       | Model id used when `--model` is not given.             |
| `base_url`      | no       | Override the API base URL (for proxies / Azure).       |

### `[defaults]`

| Key            | Default | Notes                                                                 |
| -------------- | ------- | --------------------------------------------------------------------- |
| `provider`     | unset   | Skips the provider picker.                                            |
| `model`        | unset   | Skips the model picker (requires `provider` to also be set).          |
| `post_review` | `true`  | Set to `false` to print the review to stdout without posting.         |

## File permissions

The installer sets `config.toml` to user-only read/write
(`icacls config.toml /inheritance:r /grant:r "$env:USERNAME:F"` on Windows).
If you create the file by hand, run that command yourself so other accounts
on the machine cannot read your tokens.
