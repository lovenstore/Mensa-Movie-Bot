const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const databasePath = path.resolve(process.env.DATABASE_PATH || "./database/mensa.sqlite");
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
const db = new Database(databasePath);
db.pragma("journal_mode = WAL");

function ensureDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      user_id TEXT PRIMARY KEY,
      guild_id TEXT,
      plan TEXT NOT NULL DEFAULT 'Movies',
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT PRIMARY KEY,
      voice_channel_id TEXT,
      control_channel_id TEXT,
      activity_url TEXT,
      bot_name TEXT,
      avatar_url TEXT,
      banner_url TEXT,
      activity_type TEXT,
      activity_text TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bot_instances (
      instance_id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL,
      bot_user_id TEXT,
      status TEXT NOT NULL DEFAULT 'available',
      user_id TEXT,
      guild_id TEXT,
      process_pid INTEGER,
      last_seen INTEGER,
      created_at INTEGER NOT NULL
    );
  `);
  try { db.exec("ALTER TABLE subscriptions ADD COLUMN bot_instance_id TEXT"); } catch {}
}

// The database module is also loaded by worker processes directly.
// Initialize the schema before preparing any statements.
ensureDatabase();

const queries = {
  saveSubscription: db.prepare(`INSERT INTO subscriptions (user_id, guild_id, plan, expires_at, created_at, bot_instance_id) VALUES (@userId, @guildId, @plan, @expiresAt, @createdAt, @botInstanceId)
    ON CONFLICT(user_id) DO UPDATE SET guild_id=excluded.guild_id, plan=excluded.plan, expires_at=excluded.expires_at,
    bot_instance_id=COALESCE(excluded.bot_instance_id, subscriptions.bot_instance_id)`),
  getSubscription: db.prepare("SELECT * FROM subscriptions WHERE user_id = ?"),
  getSubscriptionByGuild: db.prepare("SELECT * FROM subscriptions WHERE guild_id = ? AND expires_at > ? ORDER BY expires_at DESC LIMIT 1"),
  getGuild: db.prepare("SELECT * FROM guild_settings WHERE guild_id = ?"),
  saveGuild: db.prepare(`INSERT INTO guild_settings (guild_id, voice_channel_id, control_channel_id, activity_url, bot_name, avatar_url, banner_url, activity_type, activity_text, updated_at)
    VALUES (@guildId, @voiceChannelId, @controlChannelId, @activityUrl, @botName, @avatarUrl, @bannerUrl, @activityType, @activityText, @updatedAt)
    ON CONFLICT(guild_id) DO UPDATE SET voice_channel_id=excluded.voice_channel_id, control_channel_id=excluded.control_channel_id,
    activity_url=excluded.activity_url, bot_name=excluded.bot_name, avatar_url=excluded.avatar_url, banner_url=excluded.banner_url,
    activity_type=excluded.activity_type, activity_text=excluded.activity_text, updated_at=excluded.updated_at`),
  upsertBot: db.prepare(`INSERT INTO bot_instances (instance_id, token_hash, status, created_at) VALUES (@instanceId, @tokenHash, 'available', @createdAt)
    ON CONFLICT(instance_id) DO UPDATE SET token_hash=excluded.token_hash`),
  getAvailableBot: db.prepare("SELECT * FROM bot_instances WHERE status = 'available' ORDER BY created_at ASC LIMIT 1"),
  getBotForUser: db.prepare("SELECT * FROM bot_instances WHERE user_id = ? LIMIT 1"),
  getBotByInstance: db.prepare("SELECT * FROM bot_instances WHERE instance_id = ? LIMIT 1"),
  getBotForGuild: db.prepare("SELECT * FROM bot_instances WHERE guild_id = ? AND status = 'assigned' LIMIT 1"),
  updateBot: db.prepare(`UPDATE bot_instances SET bot_user_id=COALESCE(@botUserId, bot_user_id), status=COALESCE(@status, status),
    user_id=COALESCE(@userId, user_id), guild_id=COALESCE(@guildId, guild_id), process_pid=COALESCE(@processPid, process_pid),
    last_seen=COALESCE(@lastSeen, last_seen) WHERE instance_id=@instanceId`),
  clearBot: db.prepare("UPDATE bot_instances SET status='available', user_id=NULL, guild_id=NULL, process_pid=NULL, last_seen=? WHERE instance_id=?")
};

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + Number(months));
  return next.getTime();
}

function saveSubscription(userId, guildId, months, botInstanceId = null) {
  const current = queries.getSubscription.get(userId);
  const from = current && current.expires_at > Date.now() ? new Date(current.expires_at) : new Date();
  queries.saveSubscription.run({ userId, guildId, plan: "Movies", expiresAt: addMonths(from, months), createdAt: Date.now(), botInstanceId });
  return queries.getSubscription.get(userId);
}

function registerBotInstance(instanceId, tokenHash) {
  queries.upsertBot.run({ instanceId, tokenHash, createdAt: Date.now() });
}

function setBotState(instanceId, patch) {
  queries.updateBot.run({
    instanceId,
    botUserId: patch.botUserId ?? null,
    status: patch.status ?? null,
    userId: patch.userId ?? null,
    guildId: patch.guildId ?? null,
    processPid: patch.processPid ?? null,
    lastSeen: patch.lastSeen ?? null
  });
}

function claimBotForSubscription(userId, guildId, months) {
  const transaction = db.transaction(() => {
    const current = queries.getSubscription.get(userId);
    let bot = current?.bot_instance_id ? queries.getBotForUser.get(userId) : null;
    if (!bot) bot = queries.getAvailableBot.get();
    if (!bot) return null;
    const subscription = saveSubscription(userId, null, months, bot.instance_id);
    setBotState(bot.instance_id, { status: "assigned", userId, guildId: null });
    return { subscription, bot: queries.getBotForUser.get(userId) };
  });
  return transaction();
}

function bindBotToGuild(userId, guildId) {
  const bot = queries.getBotForUser.get(userId);
  if (!bot || bot.status !== "assigned") return null;
  const transaction = db.transaction(() => {
    db.prepare("UPDATE subscriptions SET guild_id=? WHERE user_id=?").run(guildId, userId);
    setBotState(bot.instance_id, { guildId, lastSeen: Date.now() });
    return queries.getBotForUser.get(userId);
  });
  return transaction();
}

function releaseExpiredBots() {
  const expired = db.prepare("SELECT * FROM bot_instances WHERE status='assigned' AND user_id IN (SELECT user_id FROM subscriptions WHERE expires_at <= ?)").all(Date.now());
  for (const bot of expired) {
    db.prepare("UPDATE subscriptions SET bot_instance_id=NULL WHERE user_id=?").run(bot.user_id);
    queries.clearBot.run(Date.now(), bot.instance_id);
  }
  return expired;
}

function setBotUserId(instanceId, botUserId) {
  setBotState(instanceId, { botUserId, status: "online", lastSeen: Date.now() });
}

function canWorkerOperate(instanceId, guildId, userId = null) {
  if (!instanceId) return true;
  const bot = queries.getBotForGuild.get(guildId);
  if (bot && bot.instance_id === instanceId) return true;
  if (userId) {
    const ownBot = queries.getBotForUser.get(userId);
    return Boolean(ownBot && ownBot.instance_id === instanceId && !ownBot.guild_id);
  }
  return false;
}

function isActive(userId) {
  const subscription = queries.getSubscription.get(userId);
  return Boolean(subscription && subscription.expires_at > Date.now());
}

function getGuildSettings(guildId) {
  return queries.getGuild.get(guildId) || {
    guild_id: guildId,
    activity_url: process.env.ACTIVITY_URL,
    activity_type: "Playing",
    activity_text: "Mensa Movie"
  };
}

function updateGuildSettings(guildId, patch) {
  const old = getGuildSettings(guildId);
  const row = {
    guildId,
    voiceChannelId: patch.voiceChannelId ?? old.voice_channel_id ?? null,
    controlChannelId: patch.controlChannelId ?? old.control_channel_id ?? null,
    activityUrl: patch.activityUrl ?? old.activity_url ?? process.env.ACTIVITY_URL,
    botName: patch.botName ?? old.bot_name ?? null,
    avatarUrl: patch.avatarUrl ?? old.avatar_url ?? null,
    bannerUrl: patch.bannerUrl ?? old.banner_url ?? null,
    activityType: patch.activityType ?? old.activity_type ?? "Playing",
    activityText: patch.activityText ?? old.activity_text ?? "Mensa Movie",
    updatedAt: Date.now()
  };
  queries.saveGuild.run(row);
  return getGuildSettings(guildId);
}

module.exports = {
  db, ensureDatabase, saveSubscription, claimBotForSubscription, bindBotToGuild, releaseExpiredBots, registerBotInstance, setBotState, setBotUserId,
  canWorkerOperate, isActive, getSubscription: queries.getSubscription.get.bind(queries.getSubscription),
  getSubscriptionByGuild: queries.getSubscriptionByGuild.get.bind(queries.getSubscriptionByGuild),
  getBotForUser: queries.getBotForUser.get.bind(queries.getBotForUser),
  getBotByInstance: queries.getBotByInstance.get.bind(queries.getBotByInstance),
  getBotForGuild: queries.getBotForGuild.get.bind(queries.getBotForGuild),
  getGuildSettings, updateGuildSettings
};