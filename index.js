require("dotenv").config();

const { Client, Collection, GatewayIntentBits, Partials } = require("discord.js");
const { ensureDatabase } = require("./lib/database");
const { registerCommands } = require("./lib/register");
const { installInteractionRouter } = require("./events/interactionCreate");
const { installMessageRouter } = require("./events/messageCreate");
const { installVoiceRouter } = require("./events/voiceStateUpdate");
const { installReadyRouter } = require("./events/ready");
const { startPool } = require("./lib/botPool");
const { startPortal } = require("./portal");

const required = ["DISCORD_TOKEN", "CLIENT_ID", "OWNER_GUILD_ID", "ACTIVITY_URL"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`[Mensa Movie] Missing environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

ensureDatabase();
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

client.commands = new Collection();
client.pendingSubscriptions = new Map();

installReadyRouter(client);
installInteractionRouter(client);
installMessageRouter(client);
installVoiceRouter(client);

client.on("error", (error) => console.error("[Discord client error]", error));
process.on("unhandledRejection", (error) => console.error("[Unhandled rejection]", error));
process.on("uncaughtException", (error) => console.error("[Uncaught exception]", error));

registerCommands().catch((error) => console.error("[Command registration error]", error));
startPool();
startPortal();
client.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error("[Login error] Check DISCORD_TOKEN and the bot intents.", error);
  process.exit(1);
});
