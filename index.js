// ===== Fake Port für Render =====
import express from "express";
import { Client, GatewayIntentBits, REST, Routes } from "discord.js";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

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

// ===== Helper: Rollenprüfung =====
function hasWhitelistMasterRole(member) {
  return member.roles.cache.some(r => r.name === "Whitelist Master");
}

// ===== Ready =====
client.once("ready", async () => {
  console.log(`🤖 Bot online als ${client.user.tag}`);

  const commands = [
    {
      name: "whitelist",
      description: "Trage dich selbst zur Minecraft-Whitelist ein",
      options: [
        {
          name: "name",
          description: "Dein Minecraft-Username",
          type: 3,
          required: true
        }
      ]
    },
    {
      name: "whitelist_remove",
      description: "Entfernt einen User aus der Whitelist (Whitelist Master)",
      options: [
        {
          name: "user",
          description: "Discord-User",
          type: 6,
          required: true
        }
      ]
    },
    {
      name: "whitelist_list",
      description: "Zeigt alle Whitelist-Einträge (Whitelist Master)"
    },
    {
      name: "whitelist_reset",
      description: "Leert die komplette Whitelist (Whitelist Master)"
    }
  ];

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands }
  );

  console.log("✅ Slash Commands registriert");
});

// ===== Interactions =====
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const member = interaction.member;

  // ===== /whitelist (EVERYONE) =====
  if (interaction.commandName === "whitelist") {
    await interaction.deferReply({ ephemeral: true });

    const mcName = interaction.options.getString("name");
    const discordId = interaction.user.id;

    if (!mcName || mcName.trim().length < 3) {
      return interaction.editReply("❌ Ungültiger Minecraft-Name.");
    }

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
      mcName.trim()
    );

    return interaction.editReply(
      `✅ **${mcName}** wurde zur Whitelist hinzugefügt!`
    );
  }

  // ===== AB HIER: NUR WHITELIST MASTER =====
  if (!hasWhitelistMasterRole(member)) {
    return interaction.reply({
      content: "❌ Dafür brauchst du die Rolle **Whitelist Master**.",
      ephemeral: true
    });
  }

  // ===== /whitelist_remove =====
  if (interaction.commandName === "whitelist_remove") {
    await interaction.deferReply({ ephemeral: true });

    const user = interaction.options.getUser("user");

    const result = await db.run(
      "DELETE FROM whitelist WHERE discord_id = ?",
      user.id
    );

    if (result.changes === 0) {
      return interaction.editReply("ℹ️ User war nicht auf der Whitelist.");
    }

    return interaction.editReply(
      `🗑️ Whitelist-Eintrag von **${user.tag}** gelöscht.`
    );
  }

  // ===== /whitelist_list =====
  if (interaction.commandName === "whitelist_list") {
    await interaction.deferReply({ ephemeral: true });

    const rows = await db.all("SELECT * FROM whitelist");

    if (rows.length === 0) {
      return interaction.editReply("📭 Whitelist ist leer.");
    }

    const list = rows
      .map(r => `• <@${r.discord_id}> → **${r.minecraft_name}**`)
      .join("\n");

    return interaction.editReply(`📋 **Whitelist:**\n${list}`);
  }

  // ===== /whitelist_reset =====
  if (interaction.commandName === "whitelist_reset") {
    await interaction.deferReply({ ephemeral: true });

    await db.run("DELETE FROM whitelist");

    return interaction.editReply("🧹 Whitelist wurde komplett geleert.");
  }
});

// ===== Login =====
client.login(process.env.DISCORD_TOKEN);
