import fs from "fs";
import express from "express";
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
         ModalBuilder, TextInputBuilder, TextInputStyle,
         ActionRowBuilder, InteractionType } from "discord.js";
import { Rcon } from "rcon-client";

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const RCON_CONFIG = {
  host: process.env.RCON_HOST,
  port: Number(process.env.RCON_PORT),
  password: process.env.RCON_PASSWORD
};

const DB_FILE = "./whitelist.json";

function loadDB() {
  return fs.existsSync(DB_FILE)
    ? JSON.parse(fs.readFileSync(DB_FILE))
    : {};
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function validName(name) {
  return /^[A-Za-z0-9_]{3,16}$/.test(name);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const command = new SlashCommandBuilder()
  .setName("whitelist")
  .setDescription("Füge deinen Minecraft-Namen zur Whitelist hinzu (1x)");

client.once("ready", async () => {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: [command.toJSON()] }
  );
  console.log(`✅ Bot online als ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const db = loadDB();
    if (db[interaction.user.id]) {
      return interaction.reply({
        content: `❌ Du hast bereits **${db[interaction.user.id]}** eingetragen.`,
        ephemeral: true
      });
    }

    const modal = new ModalBuilder()
      .setCustomId("whitelist_modal")
      .setTitle("Minecraft Whitelist");

    const input = new TextInputBuilder()
      .setCustomId("mcname")
      .setLabel("Minecraft-Username")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  if (interaction.type === InteractionType.ModalSubmit) {
    const name = interaction.fields.getTextInputValue("mcname").trim();
    if (!validName(name)) {
      return interaction.reply({
        content: "❌ Ungültiger Minecraft-Name.",
        ephemeral: true
      });
    }

    const db = loadDB();
    if (db[interaction.user.id]) {
      return interaction.reply({
        content: "❌ Du hast bereits einen Namen eingetragen.",
        ephemeral: true
      });
    }

    const rcon = await Rcon.connect(RCON_CONFIG);
    await rcon.send(`whitelist add ${name}`);
    rcon.end();

    db[interaction.user.id] = name;
    saveDB(db);

    return interaction.reply({
      content: `✅ **${name}** wurde gewhitelisted!`,
      ephemeral: true
    });
  }
});

// Fake Webserver für Render Free Plan
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Bot läuft.");
});

app.listen(PORT, () => {
  console.log(`🌐 Fake Webserver läuft auf Port ${PORT}`);
});


client.login(TOKEN);
