import { execa } from "execa";

export interface ShipArgs {
  message: string;
  branch?: string;
  strategy?: "squash" | "merge" | "rebase";
  base?: string;
}

export async function ship(args: ShipArgs): Promise<string> {
  if (!args?.message) {
    throw new Error("ship requires a `message` argument.");
  }

  const strategy = args.strategy ?? "squash";
  const base = args.base ?? "main";
  const branch = args.branch ?? `ship/${Date.now()}`;
  const log: string[] = [];
  const step = (name: string) => log.push(`→ ${name}`);

  try {
    await execa("git", ["rev-parse", "--is-inside-work-tree"]);

    step("git add -A");
    await execa("git", ["add", "-A"]);

    const { stdout: status } = await execa("git", ["status", "--porcelain"]);
    if (!status.trim()) {
      const { stdout: ahead } = await execa("git", [
        "rev-list",
        "--count",
        `origin/${base}..HEAD`,
      ]).catch(() => ({ stdout: "0" }));
      if (ahead.trim() === "0") {
        return "No changes to ship. Working tree and remote are in sync.";
      }
    }

    const { stdout: currentBranch } = await execa("git", [
      "rev-parse",
      "--abbrev-ref",
      "HEAD",
    ]);
    if (currentBranch === base) {
      step(`git checkout -b ${branch}`);
      await execa("git", ["checkout", "-b", branch]);
    }

    if (status.trim()) {
      step(`git commit -m ${JSON.stringify(args.message)}`);
      await execa("git", ["commit", "-m", args.message]);
    }

    step("git push -u origin HEAD");
    await execa("git", ["push", "-u", "origin", "HEAD"]);

    step(`gh pr create --base ${base}`);
    await execa("gh", [
      "pr",
      "create",
      "--base",
      base,
      "--title",
      args.message,
      "--body",
      "Shipped via anvil.",
    ]);

    step("gh pr checks --watch");
    await execa("gh", ["pr", "checks", "--watch"]);

    step(`gh pr merge --${strategy} --delete-branch`);
    await execa("gh", ["pr", "merge", `--${strategy}`, "--delete-branch"]);

    log.push("✓ Shipped");
    return log.join("\n");
  } catch (e: unknown) {
    const err = e as { shortMessage?: string; message?: string; stderr?: string };
    log.push(`✗ Failed: ${err.shortMessage ?? err.message ?? "unknown error"}`);
    if (err.stderr) log.push(`stderr: ${err.stderr}`);
    throw new Error(log.join("\n"));
  }
}
