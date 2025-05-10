import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  const chat = new ChatOpenAI({
    temperature: 0.7,
    openAIApiKey: process.env.OPENAI_API_KEY,
  });

  const response = await chat.invoke([
    new HumanMessage("Tell me a joke about TypeScript."),
  ]);

  console.log(response.text);
}

main();