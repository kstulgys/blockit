import { openai } from "@ai-sdk/openai";
import { Agent } from "@convex-dev/agent";

import { components } from "./_generated/api";

export const chatAgent = new Agent(components.agent, {
  name: "Chat Agent",
  languageModel: openai("gpt-4o"),
  instructions:
    "You are a helpful AI assistant. Be concise and friendly in your responses.",
});
