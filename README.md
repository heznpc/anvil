# anvil

**Atomic workflow recipes for Claude Code.** One MCP tool call runs the whole commit → push → PR → CI-wait → merge pipeline. Either all of it happens, or it errors cleanly. No more half-finished agent loops.

---

## Why this exists

Claude Code memory rules (`CLAUDE.md`) are advisory. The model routinely ignores procedural instructions like *"commit → push → open a PR → wait for CI → merge — no confirmation at each step."* [anthropics/claude-code#8059](https://github.com/anthropics/claude-code/issues/8059) is the canonical bug that every duplicate gets merged into.

Hooks can gate a single tool call but can't force a sequence across calls. The actual fix is to **move atomicity down a layer** — from the agent loop (where enforcement is impossible) to the tool call (where atomicity is native).

anvil exposes a single MCP tool (`ship`) that runs the entire pipeline inside one tool call. The model either invokes it end-to-end or errors. No partial state, no skipped steps, no approval fatigue.

## Install

```bash
npm install -g @heznpc/anvil
```

Then in your repo:

```bash
anvil init
```

This wires up `.claude/settings.json` to register anvil's MCP server for that project.

## Usage

In a Claude Code session:

```
> ship this as "fix auth redirect bug"
```

Claude calls the `ship` tool. Internally it runs:

1. `git add -A`
2. `git commit -m "<message>"`
3. `git push -u origin HEAD` (creates a branch if you're on `main`)
4. `gh pr create --base main --title "<message>"`
5. `gh pr checks --watch` (blocks until CI passes)
6. `gh pr merge --squash --delete-branch`

Any step failing aborts the whole pipeline. No half-shipped state.

### Arguments

| Arg | Required | Default | Description |
|-----|----------|---------|-------------|
| `message` | yes | — | Commit message and PR title |
| `branch` | no | `ship/<timestamp>` | Branch name, used when starting from the base branch |
| `strategy` | no | `squash` | Merge strategy: `squash` / `merge` / `rebase` |
| `base` | no | `main` | Base branch for the PR |

## Requirements

- Claude Code
- `git` with an authenticated remote
- `gh` CLI (run `gh auth status` to confirm)
- Node 18+

## Roadmap

- **v0.2** — Pre-flight guard (`Stop` hook): blocks session end if a ship started but didn't complete
- **v0.3** — Declarative recipe format: YAML for custom pipelines beyond `ship`
- **v0.4** — Cross-agent: compile recipes to Cursor rules + Copilot instructions
- **v1.0** — Public API for third-party recipe definitions

## How it compares

| | anvil | Claude hooks only | Slash commands | Spine-lite |
|---|---|---|---|---|
| Atomic multi-step workflows | ✅ tool-call level | ❌ per-call gate only | ⚠️ manual chain | ❌ single-call policy |
| Works without user remembering to type a command | ✅ | ⚠️ | ❌ | ⚠️ |
| CI wait + merge built in | ✅ | ❌ | ⚠️ DIY | ❌ |
| Cross-repo portable | ✅ | ⚠️ | ⚠️ | ⚠️ |

## License

MIT © heznpc
