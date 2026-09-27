const { ActivityType } = require("discord.js");
const { getGuildSettings, canWorkerOperate } = require("../lib/database");

function installReadyRouter(client) {
  client.once("ready", () => {
    console.log(`[Mensa Movie] Logged in as ${client.user.tag}`);
    client.user.setPresence({ activities: [{ name: "Mensa Movie", type: ActivityType.Playing }], status: "online" });
    for (const guild of client.guilds.cache.values()) {
      if (client.workerInstanceId && !canWorkerOperate(client.workerInstanceId, guild.id)) continue;
      restoreVoice(guild, client).catch((error) => console.error("[Voice restore]", error.message));
    }
  });
}

async function restoreVoice(guild, client) {
  const settings = getGuildSettings(guild.id);
  if (!settings.voice_channel_id) return;
  const channel = await guild.channels.fetch(settings.voice_channel_id).catch(() => null);
  if (!channel || !channel.isVoiceBased()) return;
  const { joinVoiceChannel } = require("@discordjs/voice");
  joinVoiceChannel({ channelId: channel.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator, selfDeaf: false, selfMute: true });
}

module.exports = { installReadyRouter };