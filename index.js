import { Client, GatewayIntentBits } from "discord.js";
import express from "express";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (_, res) => res.send("Bot läuft"));
app.listen(PORT, () => console.log("Webserver läuft"));

const db = await open({
  filename: "./whitelist.db",
  driver: sqlite3.Database
});

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("ready", () => {
  console.log(`✅ Bot online als ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);
