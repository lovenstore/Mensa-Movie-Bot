const { EmbedBuilder } = require("discord.js");
const { getGuildSettings, canWorkerOperate } = require("../lib/database");

function installVoiceRouter(client) {
  client.on("voiceStateUpdate", async (before, after) => {
    if (after.member?.user.bot || !after.channelId || before.channelId === after.channelId) return;
    if (client.workerInstanceId && !canWorkerOperate(client.workerInstanceId, after.guild.id)) return;
    const settings = getGuildSettings(after.guild.id);
    if (settings.voice_channel_id !== after.channelId) return;
    const channel = after.guild.channels.cache.get(settings.control_channel_id);
    if (!channel?.isTextBased()) return;
    const url = settings.activity_url || process.env.ACTIVITY_URL;
    const message = await channel.send({ content: `${after.member}`, embeds: [new EmbedBuilder().setColor(0x99e379).setTitle("Mensa Movie Activity").setDescription(`شغّل الفيلم من هنا:\n${url}`)] }).catch(() => null);
    if (message) setTimeout(() => message.delete().catch(() => {}), 60_000);
  });
}

module.exports = { installVoiceRouter };