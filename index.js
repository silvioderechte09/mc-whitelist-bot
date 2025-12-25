// ===== Fake Port (Render Free) =====
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

// ===== RCON Helper (mit Timeout) =====
async function rconCommand(command) {
  const rcon = await Rcon.connect({
    host: process.env.RCON_HOST,
    port: Number(process.env.RCON_PORT),
    password: process.env.RCON_PASSWORD,
    timeout: 5000
  });

  await rcon.send(command);
  await rcon.end();
}

// ===== Backup posten =====
async function postBackup() {
  const channel = client.channels.cache.find(c => c.name === "whitelist_admin");
  if (!channel) return;

  const rows = await db.all("SELECT * FROM whitelist");
  if (rows.length === 0) {
    await channel.send("📭 Whitelist ist leer.");
    return;
  }

  const text = rows.map(r => `${r.discord_id}|${r.minecraft_name}`).join("\n");
  await channel.send("📦 **Whitelist Backup**:\n```text\n" + text + "\n```");
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
    },
    {
      name: "whitelist_remove",
      description: "Entfernt einen User aus der Whitelist (Admin)",
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
      name: "whitelist_edit",
      description: "Erstellt oder ändert einen Eintrag (Admin)",
      options: [
        {
          name: "user",
          description: "Discord-User",
          type: 6,
          required: true
        },
        {
          name: "name",
          description: "Minecraft-Name",
          type: 3,
          required: true
        }
      ]
    },
    {
      name: "whitelist_list",
      description: "Zeigt die komplette Whitelist (Admin)"
    },
    {
      name: "whitelist_restore",
      description: "Stellt die Whitelist aus einem Backup wieder her",
      options: [
        {
          name: "data",
          description: "Backup (ID|Name getrennt durch Leerzeichen oder Zeilen)",
          type: 3,
          required: true
        }
      ]
    }
  ];

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });

  console.log("✅ Slash Commands registriert");
});

// ===== Interactions (TIMEOUT-SAFE) =====
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // ⏱️ SOFORT antworten (wichtig!)
  await interaction.deferReply({ ephemeral: true });

  try {
    // ===== /whitelist =====
    if (interaction.commandName === "whitelist") {
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
          `❌ Du hast bereits **${existing.minecraft_name}** eingetragen.`
        );
      }

      await db.run(
        "INSERT INTO whitelist (discord_id, minecraft_name) VALUES (?, ?)",
        discordId,
        mcName
      );

      await rconCommand(`minecraft:whitelist add ${mcName}`);
      await rconCommand(`minecraft:whitelist reload`);

      await interaction.editReply(`✅ **${mcName}** wurde hinzugefügt.`);
      await postBackup();
      return;
    }

    // ===== Admin-Check =====
    if (!isWhitelistMaster(interaction.member)) {
      return interaction.editReply(
        "❌ Dafür brauchst du die Rolle **Whitelist Master**."
      );
    }

    // ===== /whitelist_remove =====
    if (interaction.commandName === "whitelist_remove") {
      const user = interaction.options.getUser("user");
      await db.run("DELETE FROM whitelist WHERE discord_id = ?", user.id);
      await interaction.editReply(`🗑️ **${user.tag}** entfernt.`);
      await postBackup();
      return;
    }

    // ===== /whitelist_edit =====
    if (interaction.commandName === "whitelist_edit") {
      const user = interaction.options.getUser("user");
      const mcName = interaction.options.getString("name").trim();

      await db.run(
        "INSERT INTO whitelist (discord_id, minecraft_name) VALUES (?, ?)\n" +
        "ON CONFLICT(discord_id) DO UPDATE SET minecraft_name=excluded.minecraft_name",
        user.id,
        mcName
      );

      await rconCommand(`minecraft:whitelist add ${mcName}`);
      await rconCommand(`minecraft:whitelist reload`);

      await interaction.editReply(
        `✏️ **${user.tag}** → **${mcName}**`
      );
      await postBackup();
      return;
    }

    // ===== /whitelist_list =====
    if (interaction.commandName === "whitelist_list") {
      const rows = await db.all("SELECT * FROM whitelist");
      if (rows.length === 0) {
        return interaction.editReply("📭 Whitelist ist leer.");
      }

      const list = rows
        .map(r => `<@${r.discord_id}> → **${r.minecraft_name}**`)
        .join("\n");

      return interaction.editReply("📋 **Whitelist:**\n" + list);
    }

    // ===== /whitelist_restore =====
    if (interaction.commandName === "whitelist_restore") {
      const raw = interaction.options.getString("data").trim();
      const entries = raw.split(/\s+/);

      await db.run("DELETE FROM whitelist");

      let count = 0;
      for (const entry of entries) {
        const [id, name] = entry.split("|");
        if (!id || !name) continue;

        await db.run(
          "INSERT INTO whitelist (discord_id, minecraft_name) VALUES (?, ?)",
          id.trim(),
          name.trim()
        );

        await rconCommand(`minecraft:whitelist add ${name.trim()}`);
        count++;
      }

      await rconCommand(`minecraft:whitelist reload`);

      await interaction.editReply(
        `✅ Whitelist wiederhergestellt (${count} Einträge).`
      );
      await postBackup();
      return;
    }
  } catch (err) {
    console.error("❌ Fehler:", err);
    await interaction.editReply(
      "❌ Interner Fehler – bitte erneut versuchen."
    );
  }
});

// ===== Login =====
client.login(process.env.DISCORD_TOKEN);
