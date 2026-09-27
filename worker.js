require("dotenv").config();

const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { setBotUserId, canWorkerOperate, getBotByInstance } = require("./lib/database");
const { installInteractionRouter } = require("./events/interactionCreate");
const { installMessageRouter } = require("./events/messageCreate");
const { installVoiceRouter } = require("./events/voiceStateUpdate");
const { installReadyRouter } = require("./events/ready");

const token = process.env.WORKER_TOKEN;
const instanceId = process.env.WORKER_INSTANCE_ID;
if (!token || !instanceId) {
  console.error("[Mensa Movie worker] WORKER_TOKEN and WORKER_INSTANCE_ID are required.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});
client.workerInstanceId = instanceId;
client.pendingSubscriptions = new Map();

async function registerWorkerCommands(guild) {
  const commands = [
    require("./commands/setup"),
    require("./commands/control")
  ].map((command) => command.toJSON());
  await guild.commands.set(commands);
}

async function removeUnauthorizedGuild(guild) {
  if (canWorkerOperate(instanceId, guild.id)) {
    await registerWorkerCommands(guild).catch((error) => console.error(`[Worker ${instanceId}] command registration`, error.message));
    return;
  }
  const assignment = getBotByInstance(instanceId);
  if (assignment?.user_id && !assignment.guild_id) {
    await registerWorkerCommands(guild).catch((error) => console.error(`[Worker ${instanceId}] pending command registration`, error.message));
    return;
  }
  await guild.leave().catch((error) => console.error(`[Worker ${instanceId}] leave`, error.message));
}

installReadyRouter(client);
installInteractionRouter(client);
installMessageRouter(client);
installVoiceRouter(client);

client.once("ready", () => {
  setBotUserId(instanceId, client.user.id);
  process.send?.({ type: "ready", instanceId, botUserId: client.user.id });
  for (const guild of client.guilds.cache.values()) removeUnauthorizedGuild(guild);
  setInterval(() => process.send?.({ type: "heartbeat", instanceId }), 30_000).unref();
});
client.on("guildCreate", (guild) => removeUnauthorizedGuild(guild));
client.on("error", (error) => console.error(`[Worker ${instanceId}]`, error));

client.login(token).catch((error) => {
  console.error(`[Worker ${instanceId}] Login failed:`, error.message);
  process.exit(1);
});