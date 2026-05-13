# pr-agent

`pr-review` is a small command-line tool that posts AI-generated code reviews
straight onto GitHub pull requests. You type `pr-review <pr-url>`, pick a
provider, and the agent fetches the PR, runs it through Anthropic Claude or
OpenAI, and posts a real GitHub review with inline line comments.

```
$ pr-review https://github.com/acme/widgets/pull/42
? Provider:  > Anthropic Claude    OpenAI
? Model:     > claude-opus-4.5
  Fetching PR ........... 12 files, 480 lines
  Reviewing ............. 3,210 tokens in, 580 tokens out
  Posting review ....... done

Posted review: https://github.com/acme/widgets/pull/42#pullrequestreview-...
```

## Quick start

1. Install **Node 22+** ([nodejs.org](https://nodejs.org)).
2. Download the latest release zip from the
   [releases page](https://github.com/your-org/pr-agent/releases).
3. Run `installer\install.ps1` from an elevated PowerShell prompt.
4. Run `pr-review init` and fill in your GitHub PAT plus the API key(s) you
   want to use.
5. Run `pr-review <pull-request-url>`.

See [docs/INSTALL.md](docs/INSTALL.md) for the long version and
[docs/CONFIG.md](docs/CONFIG.md) for the full config reference.

## How it works

The CLI is a tiny C++ binary that spawns a local Node + TypeScript "agent" as a
subprocess. The agent owns everything network and AI related, the C++ side
owns the terminal UI. The two halves talk over newline-delimited JSON on the
child's standard input and output.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the diagram and the full
protocol specification.

## Repository layout

| Path        | Contents                                                      |
| ----------- | ------------------------------------------------------------- |
| `cli/`      | The C++20 binary, built with CMake + vcpkg.                   |
| `agent/`    | The Node + TypeScript backend, built with `pnpm` and `tsc`.   |
| `installer/`| PowerShell installer for Windows.                             |
| `docs/`     | User-facing and architectural documentation.                  |
| `.github/`  | CI and release workflows.                                     |

## Useful commands

```powershell
pr-review init                       # scaffold ~/.pr-agent/config.toml
pr-review providers                  # list providers and models known to the agent
pr-review <pr-url>                   # default flow: pick + review + post
pr-review <pr-url> -p anthropic -m claude-opus-4.5
pr-review <pr-url> --dry-run         # run the review without posting
pr-review --verbose <pr-url>         # surface agent debug logs on stderr
```

## Status

v1 is Windows-first. macOS and Linux installers are deferred but the
underlying C++ and TypeScript code is already portable, so it is mostly a CI
job. See the plan in `docs/ARCHITECTURE.md` for the full "what is in" and
"what is deferred" lists.

## Licence

MIT. See [LICENSE](LICENSE).
