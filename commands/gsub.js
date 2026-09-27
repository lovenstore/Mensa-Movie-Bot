const { SlashCommandBuilder } = require("discord.js");

module.exports = new SlashCommandBuilder()
  .setName("gsub")
  .setDescription("Give a Movies subscription")
  .addUserOption((option) => option.setName("user").setDescription("Subscriber").setRequired(true));