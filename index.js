// ===== Fake Port für Render =====
import express from "express";
const app = express();

const PORT = process.env.PORT || 3000;
app.get("/", (req, res) => res.send("Bot läuft"));
app.listen(PORT, () => {
  console.log(`🌐 Fake Webserver aktiv auf Port ${PORT}`);
});

// ===== Discord + SQLite =====
import { Client, GatewayIntentBits, REST, Routes } from "discord.js";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

// ===== SQLite DB =====
const db = await open({
  filename: "./whitelist.db",
  driver: sqlite3.Database
});

await db.exec(`
  CREATE TABLE IF NOT EXISTS whitelist (
    discord_id TEXT PRIMARY KEY,
    minecraft_name TEXT NOT NULL
  )
`);

// ===== Discord Client =====
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("ready", async () => {
  console.log(`🤖 Bot online als ${client.user.tag}`);

  // Slash Command registrieren
  const commands = [
    {
      name: "whitelist",
      description: "Fügt dich zur Minecraft Whitelist hinzu",
      options: [
        {
          name: "name",
          description: "Dein Minecraft Username",
          type: 3,
          required: true
        }
      ]
    }
  ];

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands }
  );

  console.log("✅ Slash Command registriert");
});

// ===== Interaction =====
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "whitelist") return;

  await interaction.deferReply({ ephemeral: true });

  const discordId = interaction.user.id;
  const mcName = interaction.options.getString("name");

  const existing = await db.get(
    "SELECT * FROM whitelist WHERE discord_id = ?",
    discordId
  );

  if (existing) {
    return interaction.editReply(
      `❌ Du hast bereits **${existing.minecraft_name}** eingetragen.`
    );
  }

  await db.run(
    "INSERT INTO whitelist (discord_id, minecraft_name) VALUES (?, ?)",
    discordId,
    mcName
  );

  // 👉 HIER würdest du später RCON / Fabric Whitelist ausführen

  await interaction.editReply(
    `✅ **${mcName}** wurde zur Whitelist hinzugefügt!`
  );
});

// ===== Login =====
client.login(process.env.DISCORD_TOKEN);
