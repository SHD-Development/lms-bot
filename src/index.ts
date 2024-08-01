import { LMStudioClient } from "@lmstudio/sdk";
const fs = require("fs");
const config = require("./config.ts");
const {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
} = require("discord.js");
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});
const lmStudioClient = new LMStudioClient({
  baseUrl: "ws://127.0.0.1:125",
});
let model: any;
client.on("ready", async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  model = await lmStudioClient.llm.load(config.model);
});

client.on("messageCreate", async (message: any) => {
  if (message.author.bot) return;
  if (
    config.owners.includes(message.author.id) &&
    message.content.startsWith(`${config.prefix}reset`)
  ) {
    fs.rmSync(`./src/chats/${message.channel.id}.json`, {
      force: true,
    });
    return message.reply("已重置");
  }
  if (message.author.id === client.user.id) return;
  if (!config.channels.includes(message.channel.id)) return;
  if (!fs.existsSync(`./src/chats/${message.channel.id}.json`)) {
    fs.copyFileSync(
      "./src/prompts.json",
      `./src/chats/${message.channel.id}.json`
    );
  }

  const prompts = JSON.parse(
    fs.readFileSync(`./src/chats/${message.channel.id}.json`)
  );
  prompts.push({
    role: "user",
    content: `[${message.author.username}]: ${message.content}`,
  });
  await message.channel.sendTyping();

  const prediction = model.respond(prompts);

  let response = "";
  for await (const text of prediction) {
    response += text;
  }
  message.reply(response);

  prompts.push({ role: "assistant", content: response });
  fs.writeFileSync(
    `./src/chats/${message.channel.id}.json`,
    JSON.stringify(prompts)
  );
});

client.login(config.token);
