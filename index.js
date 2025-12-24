import { Client, GatewayIntentBits } from "discord.js";
import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (_, res) => res.send("Bot läuft"));
app.listen(PORT, () => console.log("Webserver läuft"));

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("ready", () => {
  console.log(`✅ Bot online als ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);
