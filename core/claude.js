import Anthropic from "@anthropic-ai/sdk";

export class Claude {
  constructor({ model }) {
    this.client = new Anthropic();
    this.model = model;
  }

  addUserMessage(messages, message) {
    const content =
      message && typeof message === "object" && message.content !== undefined
        ? message.content
        : message;
    messages.push({ role: "user", content });
  }

  addAssistantMessage(messages, message) {
    const content =
      message && typeof message === "object" && message.content !== undefined
        ? message.content
        : message;
    messages.push({ role: "assistant", content });
  }

  textFromMessage(message) {
    return message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
  }

  async chat({
    messages,
    system = null,
    temperature = 1.0,
    stopSequences = [],
    tools = null,
  }) {
    const params = {
      model: this.model,
      max_tokens: 8000,
      messages,
      temperature,
      stop_sequences: stopSequences,
    };

    if (tools && tools.length > 0) {
      params.tools = tools;
    }

    if (system) {
      params.system = system;
    }

    return await this.client.messages.create(params);
  }
}
