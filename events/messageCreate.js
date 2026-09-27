const { EmbedBuilder } = require("discord.js");
const { getGuildSettings, isActive, canWorkerOperate, bindBotToGuild } = require("../lib/database");
const { durationRow, subscriptionEmbed, controlEmbed, controlRow } = require("../lib/embeds");

function installMessageRouter(client) {
  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;
    if (client.workerInstanceId && !canWorkerOperate(client.workerInstanceId, message.guild.id, message.author.id)) return;
    const content = message.content.trim();
    const lower = content.toLowerCase();
    if (lower.startsWith("gsub") || lower.includes("gsub")) {
      const mentioned = message.mentions.users.first();
      if (!mentioned) return message.reply("استخدم الأمر بهذا الشكل: `gsub @user`");
      if (message.guild.id !== process.env.OWNER_GUILD_ID) return message.reply("هذا الأمر متاح في سيرفر الإدارة فقط.");
      client.pendingSubscriptions.set(message.author.id, { userId: mentioned.id, guildId: message.guild.id });
      return message.reply({ embeds: [subscriptionEmbed(mentioned)], components: [durationRow(mentioned.id)] });
    }
    if (lower.includes("setup")) return handleSetup(message, client);
    if (lower.includes("control")) return handleControl(message, client);
  });
}

async function handleSetup(message, client) {
  const voice = message.member?.voice?.channel;
  if (!voice) return message.reply("لازم تكون داخل روم صوتي أولًا.");
  const settings = getGuildSettings(message.guild.id);
  if (!isActive(message.author.id) && message.guild.id !== process.env.OWNER_GUILD_ID) return message.reply("لا يوجد اشتراك Movies فعال لهذا الحساب.");
  const { updateGuildSettings } = require("../lib/database");
  if (client.workerInstanceId) {
    const bound = bindBotToGuild(message.author.id, message.guild.id);
    if (!bound) return message.reply("هذا البوت غير مربوط بهذا الاشتراك أو انتهى الاشتراك.");
    for (const guild of client.guilds.cache.values()) {
      if (guild.id !== message.guild.id) guild.leave().catch(() => {});
    }
  }
  updateGuildSettings(message.guild.id, { voiceChannelId: voice.id, controlChannelId: message.channel.id });
  await joinVoice(voice);
  const activity = settings.activity_url || process.env.ACTIVITY_URL;
  return message.reply({ embeds: [new EmbedBuilder().setColor(0x99e379).setTitle("Mensa Movie").setDescription(`تم تثبيت البوت في ${voice}.\nعند دخول أي شخص سيرسل له رابط التشغيل:\n${activity}`)] });
}

async function joinVoice(channel) {
  const { joinVoiceChannel } = require("@discordjs/voice");
  return joinVoiceChannel({ channelId: channel.id, guildId: channel.guild.id, adapterCreator: channel.guild.voiceAdapterCreator, selfDeaf: false, selfMute: true });
}

async function handleControl(message) {
  const settings = getGuildSettings(message.guild.id);
  if (settings.control_channel_id && settings.control_channel_id !== message.channel.id) return;
  return message.channel.send({ embeds: [controlEmbed(require("../lib/database").getSubscription(message.author.id))], components: [controlRow()] });
}

module.exports = { installMessageRouter, joinVoice };