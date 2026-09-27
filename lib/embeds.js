const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const EMOJI = "1518757962745905343";
const MENU_EMOJI = "1528622445903220821";

function subscriptionEmbed(user, months = null) {
  const duration = months ? `${months} Month${months === 1 ? "" : "s"}` : "<month>";
  return new EmbedBuilder().setColor(0x99e379).setTitle("Give Movie Sub").setDescription(`User: ${user}\nUserId: ${user.id}\nSub: Movies\nFor: ${duration}`);
}

function durationRow(userId) {
  const options = Array.from({ length: 12 }, (_, index) => {
    const months = index + 1;
    return { label: `${months} Month${months === 1 ? "" : "s"}`, value: `${userId}:${months}`, description: `Give The User Movies Sub For ${months} Month${months === 1 ? "" : "s"}`, emoji: { id: EMOJI } };
  });
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`gsub:duration:${userId}`).setPlaceholder("Select subscription duration").addOptions(options));
}

function giveRow(userId, months) {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gsub:give:${userId}:${months}`).setLabel("Give").setStyle(ButtonStyle.Secondary));
}

function directMessageEmbed(months) {
  return new EmbedBuilder().setColor(0x99e379).setTitle("Movies Sub").setDescription(`Thank you to chose us\n\nFor: ${months} Month${months === 1 ? "" : "s"}`);
}

function controlEmbed(subscription) {
  const remaining = subscription ? require("./format").remainingTime(subscription.expires_at) : "No active subscription";
  return new EmbedBuilder().setColor(0x99e379).setTitle("Sub Control").setDescription(`**Sub:** Movies\n**Time:** ${remaining}`);
}

function controlRow() {
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("control:menu").setPlaceholder("Choose a control option").addOptions(
    { label: "Bot Status", value: "status", emoji: { id: MENU_EMOJI } },
    { label: "Bot Pfp", value: "pfp", emoji: { id: MENU_EMOJI } },
    { label: "Bot Banner", value: "banner", emoji: { id: MENU_EMOJI } },
    { label: "Bot Name", value: "name", emoji: { id: MENU_EMOJI } }
  ));
}

module.exports = { subscriptionEmbed, durationRow, giveRow, directMessageEmbed, controlEmbed, controlRow, MENU_EMOJI, EMOJI };