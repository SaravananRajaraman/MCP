import { ToolManager } from "./tools.js";

export class Chat {
  constructor({ claudeService, clients }) {
    this.claudeService = claudeService;
    this.clients = clients; // Record<string, MCPClient>
    this.messages = [];
  }

  async _processQuery(query) {
    this.messages.push({ role: "user", content: query });
  }

  async run(query) {
    let finalTextResponse = "";

    await this._processQuery(query);

    while (true) {
      const response = await this.claudeService.chat({
        messages: this.messages,
        tools: await ToolManager.getAllTools(this.clients),
      });

      this.claudeService.addAssistantMessage(this.messages, response);

      if (response.stop_reason === "tool_use") {
        const text = this.claudeService.textFromMessage(response);
        if (text) process.stdout.write(text + "\n");

        const toolResultParts = await ToolManager.executeToolRequests(
          this.clients,
          response
        );
        this.claudeService.addUserMessage(this.messages, toolResultParts);
      } else {
        finalTextResponse = this.claudeService.textFromMessage(response);
        break;
      }
    }

    return finalTextResponse;
  }
}
