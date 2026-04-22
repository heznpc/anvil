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

    // Wait for CI to register before calling --watch. Otherwise gh exits 1
    // with "no checks reported" on a brand-new PR and the pipeline dies
    // even though CI is about to start.
    const hasChecks = await waitForChecksToRegister();
    if (hasChecks) {
      step("gh pr checks --watch");
      await execa("gh", ["pr", "checks", "--watch"]);
    } else {
      step("(no CI configured on this repo — skipping check wait)");
    }

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

async function waitForChecksToRegister(): Promise<boolean> {
  // PRs take a moment to index on GitHub after `gh pr create`, and CI
  // takes additional time to register checks. Poll up to 45s. Returns
  // true if checks appear, false if the final attempt confirms no CI at
  // all. Tolerates transient gh failures during the window.
  const maxAttempts = 9;
  const intervalMs = 5000;
  await new Promise((r) => setTimeout(r, 3000));

  let lastResult: { exitCode?: number; stdout?: string; stderr?: string } = {};
  for (let i = 0; i < maxAttempts; i++) {
    const result = await execa("gh", ["pr", "checks"], { reject: false });
    lastResult = result;
    if (result.exitCode === 0 && result.stdout.trim()) return true;
    // On non-final attempts, any failure (no checks, transient API, PR not
    // yet indexed) simply waits and retries.
    if (i < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, intervalMs));
      continue;
    }
    // Final attempt: "no checks reported" = the repo has no CI; anything
    // else = something genuinely wrong.
    if (/no checks reported/i.test(result.stderr ?? "")) return false;
  }
  const msg = lastResult.stderr || lastResult.stdout || "no output";
  throw new Error(
    `gh pr checks never produced a result after ${maxAttempts} attempts: ${msg.trim()}`
  );
}
