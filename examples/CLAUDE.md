# Shipping this repo

To ship changes (stage → commit → push → open PR → wait for CI → merge), call the **anvil `ship` MCP tool**.

```
ship(message="fix auth redirect bug")
```

The pipeline is atomic — it either completes end-to-end or errors. Do **not** invoke `git` or `gh` commands separately for shipping; the tool is the atomic unit.

Arguments:
- `message` (required) — commit message and PR title
- `branch` (optional) — defaults to `ship/<timestamp>` when starting from `main`
- `strategy` (optional) — `squash` (default) / `merge` / `rebase`
- `base` (optional) — base branch for the PR, defaults to `main`
