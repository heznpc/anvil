import { execa } from "execa";

// How long to give GitHub to register CI checks after `gh pr create`.
// Longer than strictly needed for a typical repo, but the cost of waiting
// is wall time, and the cost of not waiting is a false "no CI" classification
// that merges before the check can vote.
const CHECK_INITIAL_DELAY_MS = 3000;
const CHECK_POLL_INTERVAL_MS = 5000;
const CHECK_POLL_MAX_ATTEMPTS = 9;
// After this many "no checks reported" responses in a row, conclude the repo
// genuinely has no CI and skip the wait. Earlier iterations could be catching
// a racing PR indexing window rather than a CI-less repo.
const CHECK_EARLY_EXIT_AFTER = 2;

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
  await new Promise((r) => setTimeout(r, CHECK_INITIAL_DELAY_MS));

  let lastResult: { exitCode?: number; stdout?: string; stderr?: string } = {};
  let noChecksStreak = 0;
  for (let i = 0; i < CHECK_POLL_MAX_ATTEMPTS; i++) {
    const result = await execa("gh", ["pr", "checks"], { reject: false });
    lastResult = result;
    if (result.exitCode === 0 && result.stdout.trim()) return true;
    if (/no checks reported/i.test(result.stderr ?? "")) {
      noChecksStreak++;
      if (noChecksStreak >= CHECK_EARLY_EXIT_AFTER) return false;
    } else {
      noChecksStreak = 0;
    }
    if (i < CHECK_POLL_MAX_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, CHECK_POLL_INTERVAL_MS));
    }
  }
  const msg = lastResult.stderr || lastResult.stdout || "no output";
  throw new Error(
    `gh pr checks never produced a result after ${CHECK_POLL_MAX_ATTEMPTS} attempts: ${msg.trim()}`
  );
}
