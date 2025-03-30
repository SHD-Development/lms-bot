import { LMStudioClient, Chat } from "@lmstudio/sdk";
import * as fs from "fs";
import { config } from "./config";
import { Client, GatewayIntentBits } from "discord.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const lmStudioClient = new LMStudioClient({
  baseUrl: "ws://127.0.0.1:1234",
});

const channelModels = new Map();

client.on("ready", async () => {
  console.log(`Logged in as ${client.user?.tag}!`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.author.id === client.user?.id) return;
  if (!config.channels.includes(message.channel.id)) return;

  if (message.content.startsWith(`${config.prefix}model`)) {
    const args = message.content.slice(config.prefix.length).trim().split(/ +/);
    args.shift();

    if (args.length === 0) {
      const modelList = config.models
        .map((model, index) => {
          const parts = model.split("/");
          const modelName = parts[parts.length - 1].split(".")[0];
          return `${index + 1}. ${modelName}`;
        })
        .join("\n");

      return message.reply(
        `List of available models:\n${modelList}\n\nUsage: ${config.prefix}model <Model ID>`
      );
    }

    const modelIndex = parseInt(args[0]) - 1;
    if (
      isNaN(modelIndex) ||
      modelIndex < 0 ||
      modelIndex >= config.models.length
    ) {
      return message.reply(
        `Invalid model ID, please use ${config.prefix}model to check the list of models.`
      );
    }

    const selectedModel = config.models[modelIndex];
    channelModels.set(message.channel.id, selectedModel);

    const modelParts = selectedModel.split("/");
    const friendlyName = modelParts[modelParts.length - 1].split(".")[0];

    return message.reply(
      `Model for this channel has been set to: ${friendlyName}.`
    );
  }

  if (
    config.owners.includes(message.author.id) &&
    message.content.startsWith(`${config.prefix}reset`)
  ) {
    fs.rmSync(`./src/chats/${message.channel.id}.json`, {
      force: true,
    });
    return message.reply("Done.");
  }

  if (!fs.existsSync(`./src/chats/${message.channel.id}.json`)) {
    fs.copyFileSync(
      "./src/prompts.json",
      `./src/chats/${message.channel.id}.json`
    );
  }

  const messages = JSON.parse(
    fs.readFileSync(`./src/chats/${message.channel.id}.json`, "utf8")
  );

  const chat = Chat.from(messages);

  chat.append("user", `[${message.author.username}]: ${message.content}`);

  await message.channel.sendTyping();

  const modelPath =
    channelModels.get(message.channel.id) || config.defaultModel;

  try {
    const model = await lmStudioClient.llm.model(modelPath);
    const prediction = model.respond(chat);

    let responseText = "";
    for await (const fragment of prediction) {
      responseText += fragment.content;
    }

    const result = await prediction.result();

    const modelParts = modelPath.split("/");
    const friendlyName =
      result.modelInfo?.displayName ||
      modelParts[modelParts.length - 1].split(".")[0];

    message.reply(responseText + "\n-# Model: " + friendlyName);

    chat.append("assistant", responseText);
    const chatData = JSON.parse(JSON.stringify(chat));

    fs.writeFileSync(
      `./src/chats/${message.channel.id}.json`,
      JSON.stringify(chatData.data)
    );
  } catch (error: unknown) {
    console.error(`Error occurred while using model ${modelPath}:`, error);
    message.reply(
      `Failed to load / use the selected model: ${
        error instanceof Error ? error.message : "Unknown error."
      }`
    );
  }
});

client.login(config.token);
