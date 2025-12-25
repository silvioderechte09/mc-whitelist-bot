// ===== Fake Port (Render) =====
import express from "express";
import { Client, GatewayIntentBits, REST, Routes } from "discord.js";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { Rcon } from "rcon-client";

const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (_, res) => res.send("Bot läuft"));
app.listen(PORT, () => console.log(`🌐 Fake Webserver auf Port ${PORT}`));

// ===== SQLite =====
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
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// ===== Rollencheck =====
function isWhitelistMaster(member) {
  return member.roles.cache.some(r => r.name === "Whitelist Master");
}

// ===== RCON (STABIL!) =====
async function runRcon(commands = []) {
  const rcon = await Rcon.connect({
    host: process.env.RCON_HOST,
    port: Number(process.env.RCON_PORT),
    password: process.env.RCON_PASSWORD
  });

  for (const cmd of commands) {
    const res = await rcon.send(cmd);
    console.log("RCON:", cmd, "=>", res);
  }

  await rcon.end();
}

// ===== Ready =====
client.once("ready", async () => {
  console.log(`🤖 Bot online als ${client.user.tag}`);

  const commands = [
    {
      name: "whitelist",
      description: "Trage dich selbst zur Whitelist ein",
      options: [
        {
          name: "name",
          description: "Minecraft-Name",
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

  if (interaction.commandName === "whitelist") {
    await interaction.deferReply({ ephemeral: true });

    const mcName = interaction.options.getString("name").trim();
    const discordId = interaction.user.id;

    if (mcName.length < 3) {
      return interaction.editReply("❌ Ungültiger Minecraft-Name.");
    }

    const existing = await db.get(
      "SELECT * FROM whitelist WHERE discord_id = ?",
      discordId
    );

    if (existing) {
      return interaction.editReply(
        `❌ Du bist bereits als **${existing.minecraft_name}** eingetragen.`
      );
    }

    // DB
    await db.run(
      "INSERT INTO whitelist (discord_id, minecraft_name) VALUES (?, ?)",
      discordId,
      mcName
    );

    // 🔥 RCON – KORREKT & STABIL
    await runRcon([
      `whitelist add ${mcName}`,
      `whitelist reload`
    ]);

    await interaction.editReply(
      `✅ **${mcName}** wurde erfolgreich zur Whitelist hinzugefügt!`
    );
  }
});

// ===== Login =====
client.login(process.env.DISCORD_TOKEN);
