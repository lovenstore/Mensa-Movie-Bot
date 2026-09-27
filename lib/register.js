const { REST, Routes } = require("discord.js");
const commands = [
  require("../commands/gsub"),
  require("../commands/setup"),
  require("../commands/control")
];

async function registerCommands() {
  const payload = commands.map((command) => command.toJSON());
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.OWNER_GUILD_ID), { body: payload });
  console.log(`[Mensa Movie] Registered ${payload.length} commands.`);
}

module.exports = { registerCommands };