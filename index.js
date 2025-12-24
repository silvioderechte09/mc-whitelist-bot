import { Client, GatewayIntentBits, SlashCommandBuilder } from 'discord.js';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

// ====== DISCORD CLIENT ======
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ====== SQLITE SETUP ======
const db = await open({
  filename: './whitelist.db',
  driver: sqlite3.Database
});

await db.exec(`
  CREATE TABLE IF NOT EXISTS whitelist (
    discord_id TEXT PRIMARY KEY,
    mc_name TEXT NOT NULL
  );
`);

// ====== READY ======
client.once('ready', async () => {
  console.log(`✅ Bot online als ${client.user.tag}`);

  const command = new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('Füge dich zur Minecraft-Whitelist hinzu')
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Dein Minecraft Username')
        .setRequired(true)
    );

  await client.application.commands.set([command]);
  console.log('✅ Slash Command registriert');
});

// ====== INTERACTION ======
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'whitelist') return;

  // ⛑️ WICHTIG gegen "Anwendung reagiert nicht"
  await interaction.deferReply({ ephemeral: true });

  try {
    const mcName = interaction.options.getString('name');
    const discordId = interaction.user.id;

    // prüfen ob User schon existiert
    const existing = await db.get(
      'SELECT mc_name FROM whitelist WHERE discord_id = ?',
      discordId
    );

    if (existing) {
      return interaction.editReply(
        `❌ Du bist bereits mit **${existing.mc_name}** auf der Whitelist.`
      );
    }

    // eintragen
    await db.run(
      'INSERT INTO whitelist (discord_id, mc_name) VALUES (?, ?)',
      discordId,
      mcName
    );

    await interaction.editReply(
      `✅ **${mcName}** wurde erfolgreich zur Whitelist hinzugefügt!`
    );

  } catch (err) {
    console.error(err);
    await interaction.editReply('❌ Ein interner Fehler ist aufgetreten.');
  }
});

// ====== LOGIN ======
client.login(process.env.DISCORD_TOKEN);
