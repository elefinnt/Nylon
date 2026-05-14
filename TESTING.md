# Testing Nylon (early access)

Thanks for trying this out. The polished installer isn't ready yet, so for
now you'll run the agent through a thin wrapper. It takes about five
minutes.

## What you need

- **Node.js 22 or newer.** Check with `node --version`. If you don't have it,
  grab the LTS from <https://nodejs.org> or `winget install OpenJS.NodeJS.LTS`
  on Windows / `brew install node` on macOS.
- **A GitHub Personal Access Token** with the `repo` scope. Mint one at
  <https://github.com/settings/tokens> -> Generate new token (classic). Copy
  it the moment it shows; you won't see it again.
- **An AI API key**, one of:
  - **Cursor** (uses your Pro / Pro+ plan, no separate AI bill):
    <https://cursor.com/dashboard/integrations>
  - **OpenAI**: <https://platform.openai.com/api-keys>
    (billing must be set up: <https://platform.openai.com/settings/organization/billing/overview>)
  - **Anthropic**: <https://console.anthropic.com/settings/keys>
- **A pull request on a repo you own.** Make a throwaway repo with a small PR
  if you don't already have one. Do NOT test against someone else's PR while
  the tool is still in early access.

## Get the code

### If you were sent a zip

Extract it anywhere, then open a terminal in the extracted folder.

### If you were given the repo

```bash
git clone <repo-url> nylon
cd nylon
```

## Install (one time)

From the project root (the folder containing this `TESTING.md`):

```powershell
npm install -g pnpm     # if you don't already have pnpm
pnpm install
pnpm -F @nylon/agent build
```

That last command produces `agent/dist/index.js`, which is what the
`nylon` wrapper runs.

### Get a `nylon` command on PATH

Pick whichever you prefer. Both work; you only need one.

**Option A - shim folder (no install):** add `<repo>\bin` to your `PATH`.
On Windows PowerShell:

```powershell
$env:Path = "$PWD\bin;$env:Path"   # this session only
# or, for permanent:
[Environment]::SetEnvironmentVariable(
  "Path",
  "$PWD\bin;" + [Environment]::GetEnvironmentVariable("Path", "User"),
  "User"
)
```

**Option B - global pnpm link:**

```powershell
pnpm -F @nylon/agent link --global
```

Either way, confirm it's wired up:

```powershell
nylon --version
```

## Configure (interactive)

Run the setup wizard. It asks for your GitHub token, lets you pick a
provider, then asks for that provider's API key. Keys you type are masked.

```powershell
nylon init
```

It writes `C:\Users\<you>\.nylon\config.toml` (or `~/.nylon/config.toml`
on macOS / Linux). Rerun `nylon init` any time to overwrite.

## Dry run (does NOT post anything)

Pick a PR on a repo you own and run:

```powershell
nylon https://github.com/YOU/YOUR_REPO/pull/1 --dry
```

You'll see a stream of progress lines as the agent fetches the PR and
streams the review from the model, then a `Summary` block at the bottom.
Nothing is posted to GitHub on a dry run.

To override the configured provider/model for a single run:

```powershell
nylon https://github.com/YOU/YOUR_REPO/pull/1 --dry -p openai -m gpt-5
```

## Post for real

Same command without `--dry`:

```powershell
nylon https://github.com/YOU/YOUR_REPO/pull/1
```

The final line includes the URL of the posted review.

## Other useful commands

```powershell
nylon --help              # full usage
nylon help review         # help for a specific subcommand
nylon providers           # list providers + models the agent knows about
nylon --verbose <url>     # surface debug logs from the agent
```

## If something goes wrong

The CLI prints a line that starts with `✗ <CODE>: <message>`. Send that to
the project owner. Common ones:

| `code`                     | Means                                                    |
| -------------------------- | -------------------------------------------------------- |
| `CONFIG_MISSING`           | Run `nylon init`.                                        |
| `CONFIG_PLACEHOLDER`       | A `replace_me` is still in `config.toml`. Rerun init.    |
| `PROVIDER_NOT_CONFIGURED`  | Picked a provider that has no key. Rerun init.           |
| `Bad credentials` (GitHub) | PAT is wrong or missing the `repo` scope.                |
| `Model ... does not exist` | Your account doesn't have that model. Try `gpt-4o`.      |
| `Resource not accessible by integration` | PR is in a repo your PAT can't read/write. |

## What to report back

Even if everything works, the project owner would love to know:

1. Which OS / Node version you used.
2. Which provider + model you tested with.
3. The PR you reviewed (link is fine if it's yours).
4. Whether the inline comments landed on sensible lines.
5. Whether the summary was useful, useless, or somewhere in between.
6. Any rough edges in the setup steps above.
