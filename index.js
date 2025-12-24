import { Client, GatewayIntentBits, SlashCommandBuilder, Events } from "discord.js";
import mysql from "mysql2/promise";
import { Rcon } from "rcon-client";
import express from "express";

/* Fake Webserver für Render (kostenlos) */
const app = express();
app.get("/", (_, res) => res.send("OK"));
app.listen(process.env.PORT || 3000);

/* Discord Client */
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

/* MySQL Pool */
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

/* Slash Command */
client.once(Events.ClientReady, async () => {
  console.log(`✅ Bot online als ${client.user.tag}`);

  const cmd = new SlashCommandBuilder()
    .setName("whitelist")
    .setDescription("Füge dich zur Minecraft Whitelist hinzu")
    .addStringOption(opt =>
      opt.setName("minecraftname")
        .setDescription("Dein Minecraft Username")
        .setRequired(true)
    );

  await client.application.commands.set([cmd]);
});

/* Command Handler */
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "whitelist") return;

  const mcName = interaction.options.getString("minecraftname");
  const discordId = interaction.user.id;

  const [rows] = await db.query(
    "SELECT * FROM whitelist WHERE discord_id = ?",
    [discordId]
  );

  if (rows.length > 0) {
    return interaction.reply({
      content: "❌ Du hast bereits einen Minecraft-Account whitelisted.",
      ephemeral: true
    });
  }

  try {
    const rcon = await Rcon.connect({
      host: process.env.RCON_HOST,
      port: Number(process.env.RCON_PORT),
      password: process.env.RCON_PASSWORD
    });

    await rcon.send(`whitelist add ${mcName}`);
    await rcon.end();

    await db.query(
      "INSERT INTO whitelist (discord_id, mc_name) VALUES (?, ?)",
      [discordId, mcName]
    );

    await interaction.reply({
      content: `✅ **${mcName}** wurde erfolgreich zur Whitelist hinzugefügt!`,
      ephemeral: true
    });

  } catch (err) {
    console.error(err);
    await interaction.reply({
      content: "❌ Fehler beim Whitelisten. Bitte später erneut versuchen.",
      ephemeral: true
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
