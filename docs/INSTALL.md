# Install guide

This page covers installing `pr-review` on Windows. macOS and Linux installers
are on the roadmap; the source already builds on those platforms via CMake.

## Prerequisites

| Dependency | Minimum  | How to check                  |
| ---------- | -------- | ----------------------------- |
| Windows    | 10 / 11  | `winver`                      |
| Node.js    | 22 LTS   | `node --version`              |
| PowerShell | 5.1+     | `$PSVersionTable.PSVersion`   |

If Node is missing, install the LTS from
[nodejs.org](https://nodejs.org/en/download) or with
`winget install OpenJS.NodeJS.LTS`.

## Installing from a release

1. Open the [releases page](https://github.com/your-org/pr-agent/releases)
   and download the latest `pr-agent-windows-x64.zip`.
2. Right-click the zip and choose **Extract All**.
3. Open PowerShell in the extracted folder and run:

   ```powershell
   .\installer\install.ps1
   ```

   The script:
   - Copies the binary and the agent into `%LOCALAPPDATA%\pr-agent\`.
   - Adds that folder to your user `PATH`.
   - Verifies Node 22+ is on the `PATH`.
   - Prints the next-step commands.

4. Close and reopen your terminal so the new `PATH` is picked up, then check:

   ```powershell
   pr-review --version
   ```

## Configure

Run the interactive scaffold:

```powershell
pr-review init
```

It writes `~\.pr-agent\config.toml` with placeholders and opens it in your
default editor. Fill in:

- A GitHub Personal Access Token with `repo` (read) and `pull_request:write`.
- An Anthropic and/or OpenAI API key.

Full reference: [CONFIG.md](CONFIG.md).

## First review

```powershell
pr-review https://github.com/<owner>/<repo>/pull/<number>
```

You will be prompted to pick a provider and model unless you set
`[defaults]` in `config.toml`.

## Uninstall

```powershell
.\installer\install.ps1 -Uninstall
```

That removes the install folder and the `PATH` entry. Your `~\.pr-agent\`
folder is left in place so you do not lose your API keys on accident.

## Building from source

See [ARCHITECTURE.md](ARCHITECTURE.md#building-from-source).
