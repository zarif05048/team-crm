// Ship the CRM — the ONE way to do it, for the owner's agent Hermes (server
// PC) and for Claude (owner's laptop) alike (owner, 2 Nov 2026). Vercel
// deploys every push to master, so a push IS a release.
//
//   node scripts/ship.mjs            check, test, push, then watch the deploy
//   node scripts/ship.mjs --status   how the last ship from THIS PC went
//
// Before the push: committed, on master, not behind GitHub, the live commit is
// in this history and the previous deploy has finished (that is the lock
// between the laptop and the server), types check, offline tests pass.
// After it: a watcher (Task Scheduler — Hermes's terminal stops at 180 s)
// waits up to 15 minutes for /api/version to report the new commit, then
// loads the login page and both web chats. If the deploy never arrives or a
// page fails, it pushes a commit whose files are the last good ones, so the
// site and GitHub match again. A failed Vercel build never replaced the live
// site; the rollback only brings master back in line with it.
import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, existsSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://team-crm-one.vercel.app";
const PAGES = ["/login", "/chat/dungun", "/chat/paka"];
// Offline only. Left out: test-pipeline-actions (needs a running server) and
// test-tca-sheet (signs in to Google).
const TESTS = ["test-booking-pipeline", "test-booking-writers", "test-bot-rules", "test-cms-booking-sync", "test-contact-phones",
  "test-openrouter-adapter", "test-panel-size", "test-pipeline-follow-up", "test-theme", "test-weight-loss-pipeline"];
const WATCH_MINUTES = 15;
const STATUS = join(ROOT, ".ship-status.json");

function die(msg) { console.error("REFUSED: " + msg); process.exit(1); }
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const gitOk = (...args) => { try { git(...args); return true; } catch { return false; } };
const who = () => { try { return git("config", "user.name"); } catch { return "unknown"; } };
const log = (msg) => { const line = `${new Date().toISOString()} ${msg}`; console.log(line); try { appendFileSync(join(ROOT, "ship.log"), line + "\n"); } catch {} };
const readStatus = () => { try { return JSON.parse(readFileSync(STATUS, "utf8")); } catch { return null; } };
const writeStatus = (s) => writeFileSync(STATUS, JSON.stringify(s, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The commit the site runs: a sha, null (endpoint up, sha unknown) or undefined (no endpoint yet). */
async function liveSha() {
  try {
    const r = await fetch(`${SITE}/api/version`, { redirect: "manual", cache: "no-store" });
    if (!r.ok) return undefined;
    return (await r.json()).sha ?? null;
  } catch { return undefined; }
}
async function pagesOk() {
  const bad = [];
  for (const p of PAGES) {
    try { const r = await fetch(SITE + p, { redirect: "manual", cache: "no-store" }); if (r.status >= 400) bad.push(`${p} ${r.status}`); }
    catch (e) { bad.push(`${p} ${e.message}`); }
  }
  return bad;
}

function startWatcher() {
  const tr = `"${process.execPath}" "${join(ROOT, "scripts", "ship.mjs")}" --watch`;
  try {
    execFileSync("schtasks", ["/Create", "/F", "/TN", "HijraaCrmShipWatch", "/SC", "ONCE", "/ST", "00:00", "/TR", tr], { stdio: "ignore" });
    execFileSync("schtasks", ["/Run", "/TN", "HijraaCrmShipWatch"], { stdio: "ignore" });
    return;
  } catch { /* no Task Scheduler — detached child instead */ }
  const out = openSync(join(ROOT, "ship.log"), "a");
  spawn(process.execPath, [join(ROOT, "scripts", "ship.mjs"), "--watch"], { cwd: ROOT, detached: true, stdio: ["ignore", out, out], windowsHide: true }).unref();
}

function run(label, file, args) {
  try { execFileSync(process.execPath, [file, ...args], { cwd: ROOT, stdio: "pipe", timeout: 180_000 }); return null; }
  catch (e) { return `${label}:\n${String(e.stdout || "") + String(e.stderr || "")}`.split("\n").filter((l) => !/^\s+at /.test(l)).slice(-15).join("\n"); }
}

async function ship() {
  if (git("status", "--porcelain", "--untracked-files=no")) die("uncommitted changes — commit them first");
  if (git("rev-parse", "--abbrev-ref", "HEAD") !== "master") die("not on the master branch");
  git("fetch", "-q", "origin");
  if (!gitOk("merge-base", "--is-ancestor", "origin/master", "HEAD")) die("GitHub has newer commits — run: git pull --rebase");
  const head = git("rev-parse", "HEAD");
  const origin = git("rev-parse", "origin/master");
  if (head === origin) die("nothing new to ship");
  const live = await liveSha();
  const first = process.argv.includes("--first");
  if (live === undefined && !first) die(`${SITE}/api/version does not answer — the site may be down; ask Claude`);
  if (live === null) die("the site does not report its commit (VERCEL_GIT_COMMIT_SHA) — ask Claude");
  if (live && live !== origin) die(`the previous push (${origin.slice(0, 7)}) is not live yet (site runs ${live.slice(0, 7)}) — wait, then check again`);
  console.log("Type-checking and running the offline tests…");
  const failed = [run("type check", join(ROOT, "node_modules/typescript/bin/tsc"), ["--noEmit", "-p", "."])];
  for (const t of TESTS) failed.push(run(t, join(ROOT, "scripts", `${t}.mjs`), []));
  const fails = failed.filter(Boolean);
  if (fails.length) die(`${fails.length} check(s) failed — nothing was pushed:\n\n${fails.join("\n\n")}`);
  console.log(`Types and ${TESTS.length} tests pass.`);
  git("push", "-q", "origin", "HEAD:master");
  const subject = git("log", "-1", "--format=%s");
  writeStatus({ state: "watching", commit: head, prev: live || origin, subject, by: who(), at: new Date().toISOString() });
  log(`SHIPPED ${head.slice(0, 7)} "${subject}" by ${who()}`);
  startWatcher();
  console.log(`\nPushed. Vercel deploys in ~2–4 minutes; the watcher rolls back by itself if ${head.slice(0, 7)} is not live and healthy within ${WATCH_MINUTES} minutes.\nCheck the outcome: node scripts/ship.mjs --status`);
}

async function watch() {
  const s = readStatus();
  if (s?.state !== "watching") return;
  const until = Date.parse(s.at) + WATCH_MINUTES * 60_000;
  let seen;
  while (Date.now() < until) {
    seen = await liveSha();
    if (seen === s.commit) break;
    if (seen === null) { writeStatus({ ...s, state: "unverified", why: "the site stopped reporting its commit" }); log("UNVERIFIED: no commit id from the site"); return; }
    await sleep(20_000);
  }
  let why = seen === s.commit ? null : `${s.commit.slice(0, 7)} never went live (Vercel build failed?)`;
  if (!why) {
    await sleep(10_000);
    const bad = await pagesOk();
    if (bad.length) why = `pages failing after the deploy: ${bad.join(", ")}`;
  }
  if (!why) { writeStatus({ ...s, state: s.rollbackOf ? "rolled-back" : "live", liveAt: new Date().toISOString() }); log(`${s.commit.slice(0, 7)} is live and healthy`); return; }
  if (s.rollbackOf) { writeStatus({ ...s, state: "stuck", why: `${s.why}; the rollback failed too: ${why}` }); log(`STUCK: ${why} — a person must look`); return; }
  // Files of the last good commit, on top of what GitHub has now.
  git("fetch", "-q", "origin");
  const msg = `Roll back ${s.commit.slice(0, 7)}: ${why}`;
  const sha = execFileSync("git", ["commit-tree", `${s.prev}^{tree}`, "-p", git("rev-parse", "origin/master"), "-m", msg], { cwd: ROOT, encoding: "utf8" }).trim();
  git("push", "-q", "origin", `${sha}:master`);
  writeStatus({ state: "watching", rollbackOf: s.commit, why, commit: sha, prev: s.prev, subject: msg, by: "ship.mjs rollback", at: new Date().toISOString() });
  log(`ROLLED BACK ${s.commit.slice(0, 7)}: ${why} — pushed ${sha.slice(0, 7)}`);
  await watch();
}

const arg = process.argv[2];
if (arg === "--status") console.log(JSON.stringify({ ...readStatus(), siteRuns: await liveSha() }, null, 2));
else if (arg === "--watch") await watch();
else if (!arg || arg === "--first") await ship();
else die(`unknown option ${arg}`);
if (!existsSync(STATUS) && arg === "--status") console.log("(nothing shipped from this PC yet)");
