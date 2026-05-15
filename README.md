<p align="center">
  <img src="docs/assets/nylon-banner.png" alt="NYLON" width="550"/>
</p>

<p align="center">
  <em>A CLI tool &mdash; AI pull-request reviews on GitHub, with task-tracker sync on the way.</em>
</p>

<p align="center">
  <a href="#installation-windows"><strong>Install</strong></a> ·
  <a href="#quick-start"><strong>Quick start</strong></a> ·
  <a href="#review-skills-the-3-pass-pipeline"><strong>Skills</strong></a> ·
  <a href="#interactive-menu"><strong>Menu</strong></a> ·
  <a href="#document-extract-nylon-extract"><strong>Extract</strong></a> ·
  <a href="docs/ARCHITECTURE.md"><strong>Architecture</strong></a>
</p>

---

# Nylon (`nylon`)

`nylon` is a command-line tool that posts AI-generated code reviews on GitHub
pull requests. You pass a PR URL; it downloads the diff, asks a model (Anthropic
Claude, OpenAI GPT, or Cursor Composer) to review it, then posts a real GitHub
review with inline comments on flagged lines.

With **review skills** enabled, a single invocation runs a three-pass pipeline
(intent → inline comments → synthesis), which tends to produce tighter reviews
on large PRs.

```
$ nylon https://github.com/acme/widgets/pull/42
? Provider:  > Cursor    Anthropic Claude    OpenAI
? Model:     > composer-2
  Fetching PR ............ 12 files, 480 lines
  pass 1/3: intent analysis
  pass 2/3: inline review
  pass 3/3: synthesis
  Posting review ......... done   (label: needs-fixes)

Posted review: https://github.com/acme/widgets/pull/42#pullrequestreview-...
```

---

## Contents

| | |
|--|--|
| [Quick start](#quick-start) | Install, configure, run your first review |
| [What Nylon does](#what-nylon-does) | Audience and terminology |
| [How it works](#how-it-works) | CLI + agent, high-level flow |
| [Review skills](#review-skills-the-3-pass-pipeline) | 3-pass pipeline and config |
| [Interactive menu](#interactive-menu) | Bare `nylon` in a TTY |
| [Document extract](#document-extract-nylon-extract) | SOW → tasks (ClickUp) from a file |
| [Installation (Windows)](#installation-windows) | Prerequisites and installer |
| [Configuration](#configuration) | `config.toml`, PAT, providers, ClickUp |
| [Daily use](#daily-use) | First review and common commands |
| [Building from source](#building-from-source) | Agent and C++ CLI |
| [Repository layout](#repository-layout) | Folders and key modules |
| [Troubleshooting](#troubleshooting) | Frequent failures |
| [Status and roadmap](#status-and-roadmap) | Recent work and planned work |
| [Licence](#licence) | MIT |

---

## Quick start

1. **[Install](#installation-windows)** &mdash; prebuilt zip + `installer\install.ps1` on Windows (Node 22+ required).
2. **`nylon init`** &mdash; scaffolds `~\.nylon\config.toml` (GitHub token + at least one AI provider).
3. **`nylon https://github.com/<owner>/<repo>/pull/<n>`** &mdash; pick provider/model if prompted, wait for progress, open the printed review URL.

Use **`nylon <url> --dry`** to run the pipeline without posting. For **documents → ClickUp**, see **`nylon extract`** in [Document extract](#document-extract-nylon-extract). Full install and config detail live in [docs/INSTALL.md](docs/INSTALL.md) and [docs/CONFIG.md](docs/CONFIG.md).

---

## What Nylon does

A **pull request** is a request to merge proposed changes; reviewing it means
reading the diff and commenting. Nylon automates that first pass with an LLM so
humans can focus on tricky judgement calls.

Install `nylon`, add API keys, then `nylon <pr-url>` is enough to leave a review
on GitHub.

> **Terminology:** “LLM” / “AI model” means a hosted service (e.g. Anthropic or
> OpenAI). The tool sends the diff over HTTPS and receives text. It does **not**
> train models on your code; it calls public APIs only.

---

## How it works

The tool has **two parts**: a small **C++ `nylon.exe`** CLI and a **Node.js
TypeScript agent**. They communicate with **NDJSON** over stdin/stdout; see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for message types.

```mermaid
flowchart LR
    User([You, in a terminal])
    CLI["nylon.exe<br/>(C++ binary)"]
    Agent["agent<br/>(Node.js + TypeScript)"]
    GH["GitHub REST API"]
    Prov["AI provider<br/>(Claude / GPT / Cursor)"]

    User -- "nylon &lt;url&gt;" --> CLI
    CLI -- "spawns + sends JSON" --> Agent
    Agent -- "JSON progress events" --> CLI
    CLI -- "pretty progress" --> User
    Agent -- "download PR + post review" --> GH
    Agent -- "send diff, stream review" --> Prov
    Prov -- "review text" --> Agent
```

**Typical run:** the CLI parses args, optionally shows provider/model pickers,
starts the agent, streams progress, then the agent reads the PAT, fetches the
PR, calls the AI (single pass or skill pipeline), and posts the GitHub review.
Errors propagate as NDJSON `error` messages with a matching exit code.

**Why split?** The C++ side ships as one fast `.exe` with an FTXUI TUI and no
Node startup cost. The agent uses mature SDKs (GitHub, providers, Zod). The CLI
is the front desk; the agent is the kitchen.

---

## Review skills: the 3-pass pipeline

Three **review skills** can replace one monolithic prompt with a pipeline:

| # | Skill ID | Role |
|---|----------|------|
| 1 | `intent-analysis` | PR title, description, file list → short intent doc |
| 2 | `inline-reviewer` | Intent + unified diff → inline comments |
| 3 | `review-synthesis` | Intent + comments → summary, risk, follow-ups |

Sources: [`agent/src/skills/`](agent/src/skills/). On **Cursor**, all three
enable full pipeline mode. On Anthropic / OpenAI they still tighten the prompt;
native multi-pass for those providers is on the roadmap.

In `~\.nylon\config.toml`:

```toml
[review]
skills = ["intent-analysis", "inline-reviewer", "review-synthesis"]
request_changes_on_issue = false
labels = false
```

Browse the catalogue: run **`nylon`** and open **Skills** (IDs and descriptions).

---

## Interactive menu

```powershell
nylon
```

Sections:

- **PR agent** → **Review a pull request** (`nylon review <url>` equivalent).
- **Task exporter** → **ClickUp** when `[integrations.clickup]` is configured
  (via `config.toml` or values `nylon init` picked up from env). Chooses export
  format, runs a fixed five-stage extraction pipeline, optionally creates ClickUp
  tasks. Without a token, Nylon uses a scripted demo flow. Monday.com / Jira are
  not implemented yet.
- **Skills** → catalogue of review lenses and SOW extraction stages (`[review].skills`;
  extraction stages themselves are fixed, not individually toggled in config).

Navigation: arrows or number keys, Enter to confirm, Ctrl+C to quit. Requires a
TTY; otherwise use subcommands directly.

---

## Document extract (`nylon extract`)

Headless entry point for the same **Task exporter → ClickUp** pipeline as the
interactive flow: ingest a **local** document (not a URL), run the fixed
five-agent SOW pass, optionally push the resulting ticket tree to ClickUp.

```powershell
nylon extract .\scope\statement-of-work.md
nylon extract .\spec.pdf --dry
nylon extract .\brief.docx -p openai -m gpt-5
```

Supported file kinds follow **`[extract].include`** in config (typically **md,
pdf, docx**; plain **txt** is also common). Overrides: **`-p` / `--provider`**,
**`-m` / `--model`**.

| Flag | Effect |
|------|--------|
| **`-n`**, **`--dry`**, **`--dry-run`** | Run extraction only; print a plan preview. **Nothing** is sent to ClickUp. Always works without a ClickUp token. |
| Without `--dry` | Needs **`[integrations.clickup].token`** and an **interactive terminal** so you can confirm before tasks are created. If stdin is not a TTY (automation / CI), use **`--dry`** or rely on **`nylon` → Task exporter** locally. |

Config reference: **`[extract]`** and **`[integrations.clickup]`** in [Configuration](#configuration). Focused CLI help:

```powershell
nylon help extract
```

---

## Installation (Windows)

Supported path today: **[releases](https://github.com/elefinnt/nylon/releases)** →
download **`nylon-windows-x64.zip`**, extract, then from that folder:

```powershell
.\installer\install.ps1
```

Installs `%LOCALAPPDATA%\nylon\` (binary + bundled agent), adds it to **user**
`PATH`, checks Node **22+**, and tightens `config.toml` permissions if present.
Uninstall: `.\installer\install.ps1 -Uninstall`. Open a **new** terminal after
install; **`nylon --version`** should print a version.

| Prerequisite | Minimum | Check |
|--------------|---------|--------|
| Windows | 10 or 11 | `winver` |
| Node.js | 22 LTS | `node --version` |
| PowerShell | 5.1+ | `$PSVersionTable.PSVersion` |

```powershell
winget install OpenJS.NodeJS.LTS
```

Extended walkthrough: [docs/INSTALL.md](docs/INSTALL.md).

---

## Configuration

Nylon needs:

1. A **GitHub PAT** (read PR + post review).
2. At least **one AI provider** key (Cursor, Anthropic, or OpenAI).
3. Optional defaults and `[review]` / integration blocks.

Everything lives in **`~\.nylon\config.toml`**. Scaffold it with:

```powershell
nylon init
```

Abbreviated example:

```toml
[github]
token = "ghp_replace_me"

[providers.cursor]
api_key = "cursor_replace_me"
default_model = "composer-2"

[providers.anthropic]
api_key = "sk-ant-replace_me"
default_model = "claude-opus-4-7"

[providers.openai]
api_key = "sk-replace_me"
default_model = "gpt-5"

[defaults]
post_review = true

[review]
skills = ["intent-analysis", "inline-reviewer", "review-synthesis"]
request_changes_on_issue = false
labels = false

# Optional — Task exporter → ClickUp (Settings → Apps, personal token).
# [integrations.clickup]
# token = "pk_replace_me"
# default_list_id = ""

# Optional — Document ingestion before the fixed five-agent SOW pipeline.
# [extract]
# include = ["md", "pdf", "docx", "txt"]
# pdf_strategy = "auto"
# max_chars_per_doc = 80000
```

### GitHub token

Classic: **repo** scope (private PRs); **public_repo** is enough if you only touch public repos.

Fine-grained: **Pull requests: read and write** and **Contents: read** on target repos.

<https://github.com/settings/tokens>

### ClickUp and `[extract]`

The Task exporter reads a document, runs **five** AI stages in a fixed order, then optionally pushes tasks to ClickUp. Stages cannot be reordered via config; legacy `extract.skills` entries are ignored if present.

| Block | Purpose |
|-------|---------|
| `[integrations.clickup]` | `token`; optional `default_list_id` to skip list picking |
| `[extract]` | `include`, `pdf_strategy` (`auto` prefers text extraction), `max_chars_per_doc` |

### Environment overrides (optional)

Override file-based secrets when set at startup:

- GitHub: `NYLON_GITHUB_TOKEN`, `GITHUB_TOKEN`, `GH_TOKEN`
- Anthropic: `ANTHROPIC_API_KEY`, `NYLON_ANTHROPIC_KEY`
- OpenAI: `OPENAI_API_KEY`, `NYLON_OPENAI_KEY`
- Cursor: `CURSOR_API_KEY`, `NYLON_CURSOR_KEY`
- ClickUp: `CLICKUP_API_KEY`, `NYLON_CLICKUP_TOKEN` (also picked up by **`nylon init`** for templating); live export still expects `[integrations.clickup]` in config
- Default provider: `NYLON_PROVIDER`

A **`.env`** in the current working directory is loaded automatically (useful for CI or per-repo credentials).

Full reference (proxies, base URLs): [docs/CONFIG.md](docs/CONFIG.md). If docs lag, prefer comments in your on-disk template from **`nylon init`**.

---

## Daily use

```powershell
nylon https://github.com/<owner>/<repo>/pull/<number>
nylon https://github.com/<owner>/<repo>/pull/<number> --dry
```

Posted reviews append `_Reviewed by Nylon._` for visibility.

**Common commands:**

| Command | Effect |
|---------|--------|
| `nylon` | Interactive main menu (TTY only) |
| `nylon init` | Config scaffold |
| `nylon providers` | Lists providers/models |
| `nylon extract <path>` | Document → tasks (see [above](#document-extract-nylon-extract)) |
| `nylon extract <path> --dry` | Extract pipeline only; no ClickUp push |
| `nylon <pr-url>` | Review and post |
| `nylon <pr-url> --dry` | No GitHub POST |
| `nylon <pr-url> -p anthropic -m claude-opus-4-7` | Explicit provider/model |
| `nylon --verbose <pr-url>` | Agent debug logs on stderr |
| `nylon --help` / `nylon help review` / `nylon help extract` | CLI help |

---

## Building from source

### Agent (Node + TypeScript)

From repo root (uses workspace package **`@nylon/agent`**):

```powershell
pnpm install
pnpm build
```

Or equivalently **`pnpm -F @nylon/agent build`**. Watch mode: **`pnpm dev`**.

Tests:

```powershell
pnpm -F @nylon/agent test
```

### CLI (C++)

- CMake **3.25+**
- **C++20** (MSVC on Windows; GCC **12+** / Clang **15+** elsewhere)
- **vcpkg** with **`VCPKG_ROOT`** set

```powershell
cd cli
cmake --preset windows-x64
cmake --build --preset windows-x64 --config Release
```

Binary: **`cli\build\windows-x64\Release\nylon.exe`**.

**Local wiring:** builds do not locate the agent automatically. Example:

```powershell
$env:NYLON_AGENT_PATH = "C:\path\to\repo\agent\dist\index.js"
.\cli\build\windows-x64\Release\nylon.exe --version
```

Released zips bundle the agent next to `nylon.exe`; no env var needed there.

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Repository layout

| Path | Role |
|------|------|
| `cli/` | C++20 CLI (CMake + vcpkg + FTXUI) |
| `agent/` | TypeScript backend (`pnpm`, `tsc`): GitHub, providers, NDJSON IPC, menu, extraction |
| `installer/` | `install.ps1` (install / uninstall Windows layout) |
| `docs/` | Architecture, install, config reference |
| `bin/` | Dev convenience scripts |
| `.github/` | CI and releases |

Both halves build independently; the standalone agent accepts NDJSON on stdin/stdout for scripting.

Notable **`agent/src/`** paths:

| Path | Contents |
|------|----------|
| `cli/menu/` | Main menu and submenus |
| `cli/anim/` | Banner, spinners, progress, typewriter helpers |
| `skills/` | Skill types, registry, review skills and SOW stages |
| `integrations/clickup/` | ClickUp client, list picker, export |
| `pipeline/` | PR review orchestration, document extraction |
| `providers/` | Anthropic, OpenAI, Cursor adapters |
| `providers/prompts/pipeline.ts` | Intent / inline / synthesis prompts |
| `github/review.ts` | Post reviews, labels, REQUEST_CHANGES |

---

## Troubleshooting

| Symptom | What to try |
|---------|--------------|
| `nylon` not recognised | Close all terminals; reopen. If stuck, sign out of Windows |
| Node 22+ missing/warning | Install LTS Node; new terminal afterward |
| `PROVIDER_NOT_CONFIGURED` | Set `providers.<id>.api_key` or matching env var |
| Unknown skill ID | Warning ignored; run **`nylon`**, open **Skills** for canonical IDs |
| Interactive UI needs TTY | On CI/non-TTY use **`init`**, **`review`**, **`providers`**, **`extract --dry`**, bare PR URL |
| GitHub **403** / **404** | PAT scopes: classic **repo**, or fine-grained PR read/write + contents read |
| Opaque failures | **`--verbose`** for agent stderr logs |

Contribution test plan: [TESTING.md](TESTING.md).

---

## Status and roadmap

**Shipped:**

- Three-pass Cursor pipeline (`intent-analysis` → `inline-reviewer` → `review-synthesis`).
- `[review]` with `skills`, `labels`, `request_changes_on_issue`.
- Derived labels (`high-risk`, `needs-fixes`, `follow-up-needed`) and **REQUEST_CHANGES** when warranted.
- Interactive menu (PR agent, Task exporter, Skills) with animated banner.
- **ClickUp** export when configured, backed by fixed five-agent document processing and **`[extract]`** ingestion knobs.

**Planned:**

- Full 3-pass on Anthropic / OpenAI (skills currently enrich single-pass prompts).
- Monday.com and Jira exporters.
- macOS / Linux installers (code is portable; mainly packaging CI).

Deferrals and broader scope notes: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Licence

MIT &mdash; see [LICENSE](LICENSE).
