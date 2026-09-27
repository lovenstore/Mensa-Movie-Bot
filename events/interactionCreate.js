const { ActivityType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { getSubscription, updateGuildSettings, isActive, canWorkerOperate, bindBotToGuild } = require("../lib/database");
const { subscriptionEmbed, giveRow, directMessageEmbed, controlEmbed, controlRow } = require("../lib/embeds");
const { assignSubscription } = require("../lib/botPool");

function installInteractionRouter(client) {
  client.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) return onCommand(interaction);
      if (interaction.isStringSelectMenu()) return onSelect(interaction);
      if (interaction.isButton()) return onButton(interaction);
      if (interaction.isModalSubmit()) return onModal(interaction);
    } catch (error) {
      console.error("[Interaction error]", error);
      const payload = { content: "حدث خطأ أثناء تنفيذ الطلب.", ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => {});
      else await interaction.reply(payload).catch(() => {});
    }
  });
}

async function onCommand(interaction) {
  if (interaction.client.workerInstanceId && !canWorkerOperate(interaction.client.workerInstanceId, interaction.guildId, interaction.user.id)) return;
  if (interaction.commandName === "gsub") {
    if (interaction.guildId !== process.env.OWNER_GUILD_ID) return interaction.reply({ content: "هذا الأمر متاح في سيرفر الإدارة فقط.", ephemeral: true });
    const user = interaction.options.getUser("user");
    return interaction.reply({ embeds: [subscriptionEmbed(user)], components: [require("../lib/embeds").durationRow(user.id)] });
  }
  if (interaction.commandName === "setup") {
    const voice = interaction.member?.voice?.channel;
    if (!voice) return interaction.reply({ content: "لازم تكون داخل روم صوتي أولًا.", ephemeral: true });
    updateGuildSettings(interaction.guildId, { voiceChannelId: voice.id, controlChannelId: interaction.channelId });
    if (interaction.client.workerInstanceId) {
      const bound = bindBotToGuild(interaction.user.id, interaction.guildId);
      if (!bound) return interaction.reply({ content: "هذا البوت غير مربوط بهذا الاشتراك أو انتهى الاشتراك.", ephemeral: true });
      for (const guild of interaction.client.guilds.cache.values()) {
        if (guild.id !== interaction.guildId) guild.leave().catch(() => {});
      }
    }
    const { joinVoice } = require("./messageCreate");
    await joinVoice(voice);
    return interaction.reply({ content: `تم تثبيت Mensa Movie في ${voice}.`, ephemeral: true });
  }
  if (interaction.commandName === "control") return interaction.reply({ embeds: [controlEmbed(getSubscription(interaction.user.id))], components: [controlRow()] });
}

async function onSelect(interaction) {
  if (interaction.customId.startsWith("gsub:duration:")) {
    const userId = interaction.customId.split(":")[2];
    const months = Number(interaction.values[0].split(":")[1]);
    const user = await interaction.client.users.fetch(userId);
    return interaction.update({ embeds: [subscriptionEmbed(user, months)], components: [giveRow(userId, months)] });
  }
  if (interaction.customId === "control:menu") {
    const option = interaction.values[0];
    if (option === "status") return interaction.reply({ content: "يرجى تحديد الحالة المطلوبة", components: [statusRow()], ephemeral: true });
    const fields = { pfp: ["Bot Pfp", "اكتب رابط الصورة المطلوبة"], banner: ["Bot Banner", "اكتب رابط البنر المطلوب"], name: ["Bot Name", "اكتب اسم البوت الجديد"] };
    const [title, label] = fields[option];
    const modal = new ModalBuilder().setCustomId(`control:modal:${option}`).setTitle(title).addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("value").setLabel(label).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(500)));
    return interaction.showModal(modal);
  }
  if (interaction.customId === "control:status") {
    const option = interaction.values[0];
    const modal = new ModalBuilder().setCustomId(`control:modal:status:${option}`).setTitle(`${option} status`).addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("value").setLabel("اكتب الحالة").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(128)));
    return interaction.showModal(modal);
  }
}

function statusRow() {
  const { StringSelectMenuBuilder, ActionRowBuilder } = require("discord.js");
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("control:status").setPlaceholder("Select status").addOptions(
    { label: "Streaming", value: "Streaming", emoji: { id: "1518757962745905343" } },
    { label: "Playing", value: "Playing", emoji: { id: "1518757962745905343" } },
    { label: "Listening", value: "Listening", emoji: { id: "1518757962745905343" } },
    { label: "Watching", value: "Watching", emoji: { id: "1518757962745905343" } }
  ));
}

async function onButton(interaction) {
  if (!interaction.customId.startsWith("gsub:give:")) return;
  const [, , userId, monthsText] = interaction.customId.split(":");
  const months = Number(monthsText);
  const assignment = assignSubscription(userId, interaction.guildId, months);
  if (!assignment) return interaction.reply({ content: "لا توجد بوتات متاحة حاليًا في المخزون. أضف توكنات BOT_TOKENS ثم أعد التشغيل.", ephemeral: true });
  const { subscription, bot, inviteUrl } = assignment;
  const user = await interaction.client.users.fetch(userId);
  const dmComponents = inviteUrl
    ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel("Movie").setStyle(ButtonStyle.Link).setURL(inviteUrl))]
    : [];
  await user.send({ embeds: [directMessageEmbed(months)], components: dmComponents }).catch(() => {});
  const botText = bot.bot_user_id ? `\nالبوت المخصص: <@${bot.bot_user_id}>` : "\nسيظهر رابط البوت بعد اتصاله.";
  return interaction.update({ content: `تم إعطاء الاشتراك إلى ${user}.${botText}`, embeds: [subscriptionEmbed(user, months)], components: [] });
}

async function onModal(interaction) {
  if (!interaction.customId.startsWith("control:modal:")) return;
  if (!isActive(interaction.user.id) && interaction.guildId !== process.env.OWNER_GUILD_ID) return interaction.reply({ content: "لا يوجد اشتراك Movies فعال لهذا الحساب.", ephemeral: true });
  const parts = interaction.customId.split(":");
  const setting = parts[2];
  const value = interaction.fields.getTextInputValue("value");
  if (setting === "status") {
    const type = parts[3] || "Playing";
    const activityType = { Playing: ActivityType.Playing, Streaming: ActivityType.Streaming, Listening: ActivityType.Listening, Watching: ActivityType.Watching }[type] || ActivityType.Playing;
    updateGuildSettings(interaction.guildId, { activityType: type, activityText: value });
    interaction.client.user.setPresence({ activities: [{ name: value, type: activityType, url: type === "Streaming" ? "https://twitch.tv/" : undefined }], status: "online" });
  } else if (setting === "name") {
    updateGuildSettings(interaction.guildId, { botName: value });
    await interaction.guild.members.me?.setNickname(value).catch(() => {});
  } else if (setting === "pfp") {
    updateGuildSettings(interaction.guildId, { avatarUrl: value });
    await interaction.client.user.setAvatar(value).catch(() => {});
  } else if (setting === "banner") {
    updateGuildSettings(interaction.guildId, { bannerUrl: value });
  }
  return interaction.reply({ content: `تم حفظ إعداد ${setting} لهذا السيرفر.`, ephemeral: true });
}

module.exports = { installInteractionRouter };