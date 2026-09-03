import { createHmac, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

// The configuration contains the project-specific webhook secret and stays outside Git.
const configPath = process.argv[2] || process.env.AMVERA_DEPLOY_CONFIG;
if (!configPath) throw new Error("Pass the path to the private Amvera deployment configuration.");
const config = JSON.parse(await readFile(configPath, "utf8"));
const webhook = new URL(config.webhookUrl);
if (webhook.protocol !== "https:" || webhook.hostname !== "webhook.git.msk0.amvera.ru") {
  throw new Error("Expected the Moscow Amvera webhook endpoint.");
}
if (config.repository !== "mgolnev/split-checkout" || config.branch !== "main" || !config.secret) {
  throw new Error("Expected the split-checkout main deployment configuration.");
}
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const sha = git("rev-parse", "HEAD");
const remoteSha = git("ls-remote", "origin", "refs/heads/main").split(/\s+/)[0];
if (sha !== remoteSha) throw new Error("Push this commit to origin/main before deploying.");
const [message, timestamp, authorName, authorEmail] = git(
  "show", "-s", "--format=%s%x00%cI%x00%an%x00%ae", "HEAD",
).split("\0");
const repositoryUrl = `https://github.com/${config.repository}`;
const headCommit = {
  id: sha,
  message,
  timestamp,
  url: `${repositoryUrl}/commit/${sha}`,
  author: { name: authorName, email: authorEmail },
};
const body = JSON.stringify({
  ref: "refs/heads/main",
  before: git("rev-parse", "HEAD^"),
  after: sha,
  created: false,
  deleted: false,
  forced: false,
  repository: {
    id: 1207199460,
    name: "split-checkout",
    full_name: config.repository,
    private: false,
    url: repositoryUrl,
    html_url: repositoryUrl,
    clone_url: `${repositoryUrl}.git`,
    default_branch: "main",
    owner: { name: "mgolnev", login: "mgolnev" },
  },
  pusher: { name: "mgolnev" },
  sender: { login: "mgolnev" },
  commits: [headCommit],
  head_commit: headCommit,
});
const signature = (algorithm) => createHmac(algorithm, config.secret).update(body).digest("hex");
const response = await fetch(webhook, {
  method: "POST",
  redirect: "error",
  signal: AbortSignal.timeout(30000),
  headers: {
    "Content-Type": "application/json",
    "User-Agent": "split-checkout-deploy",
    "X-GitHub-Event": "push",
    "X-GitHub-Delivery": randomUUID(),
    "X-Hub-Signature": `sha1=${signature("sha1")}`,
    "X-Hub-Signature-256": `sha256=${signature("sha256")}`,
  },
  body,
});
if (!response.ok) {
  throw new Error(`Amvera rejected the deployment request (HTTP ${response.status}). Check the webhook settings.`);
}
console.log(`Amvera accepted ${sha.slice(0, 7)} (HTTP ${response.status}). Check build logs and /api/health before considering deployment complete.`);
