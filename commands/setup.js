const { SlashCommandBuilder } = require("discord.js");

module.exports = new SlashCommandBuilder()
  .setName("setup")
  .setDescription("Connect the bot to your current voice channel");