const crypto = require("node:crypto");
const path = require("node:path");
const { fork } = require("node:child_process");
const {
  registerBotInstance,
  setBotState,
  releaseExpiredBots,
  getBotForUser,
  claimBotForSubscription
} = require("./database");

const workerFile = path.join(__dirname, "..", "worker.js");
const restartMs = Number(process.env.BOT_WORKER_RESTART_MS || 5000);
const processes = new Map();

function readPoolTokens() {
  return (process.env.BOT_TOKENS || "")
    .split("|")
    .map((token) => token.trim())
    .filter(Boolean);
}

function instanceIdFor(index, token) {
  return `pool-${String(index + 1).padStart(2, "0")}-${crypto.createHash("sha256").update(token).digest("hex").slice(0, 8)}`;
}

function startPool() {
  const tokens = readPoolTokens();
  if (!tokens.length) {
    console.warn("[Mensa Movie] BOT_TOKENS is empty. No customer workers were started.");
    return;
  }
  tokens.forEach((token, index) => {
    const instanceId = instanceIdFor(index, token);
    registerBotInstance(instanceId, crypto.createHash("sha256").update(token).digest("hex"));
    spawnWorker(instanceId, token);
  });
  setInterval(releaseExpiredBots, 60_000).unref();
  console.log(`[Mensa Movie] Customer bot pool ready: ${tokens.length} worker(s).`);
}

function spawnWorker(instanceId, token) {
  const child = fork(workerFile, [], {
    env: { ...process.env, BOT_TOKENS: "", DISCORD_TOKEN: "", WORKER_INSTANCE_ID: instanceId, WORKER_TOKEN: token },
    stdio: ["inherit", "inherit", "inherit", "ipc"]
  });
  processes.set(instanceId, child);
  setBotState(instanceId, { status: "starting", processPid: child.pid, lastSeen: Date.now() });
  child.on("message", (message) => {
    if (!message || message.instanceId !== instanceId) return;
    if (message.type === "ready") setBotState(instanceId, { botUserId: message.botUserId, status: "online", lastSeen: Date.now() });
    if (message.type === "heartbeat") setBotState(instanceId, { lastSeen: Date.now() });
  });
  child.on("exit", (code, signal) => {
    processes.delete(instanceId);
    setBotState(instanceId, { status: "offline", lastSeen: Date.now() });
    console.error(`[Mensa Movie] Worker ${instanceId} stopped (${code ?? signal}). Restarting in ${restartMs}ms.`);
    setTimeout(() => spawnWorker(instanceId, token), restartMs).unref();
  });
  child.on("error", (error) => console.error(`[Worker ${instanceId}]`, error.message));
}

function assignSubscription(userId, guildId, months) {
  const result = claimBotForSubscription(userId, guildId, months);
  if (!result) return null;
  const inviteUrl = result.bot.bot_user_id
    ? `https://discord.com/oauth2/authorize?client_id=${result.bot.bot_user_id}&scope=bot%20applications.commands&permissions=36700160`
    : null;
  return { ...result, inviteUrl };
}

function getAssignedBot(userId) {
  return getBotForUser(userId);
}

module.exports = { startPool, assignSubscription, getAssignedBot, readPoolTokens };