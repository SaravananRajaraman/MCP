import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export class MCPClient {
  constructor({ command, args = [] }) {
    this.command = command;
    this.args = args;
    this._client = null;
    this._transport = null;
  }

  async connect() {
    this._transport = new StdioClientTransport({
      command: this.command,
      args: this.args,
    });

    this._client = new Client(
      { name: "mcp-chat-client", version: "1.0.0" },
      { capabilities: {} }
    );

    await this._client.connect(this._transport);
  }

  _session() {
    if (!this._client) {
      throw new Error("MCPClient not connected. Call connect() first.");
    }
    return this._client;
  }

  async listTools() {
    const result = await this._session().listTools();
    return result.tools;
  }

  async callTool(toolName, toolInput) {
    return await this._session().callTool({ name: toolName, arguments: toolInput });
  }

  async listPrompts() {
    const result = await this._session().listPrompts();
    return result.prompts;
  }

  async getPrompt(promptName, args) {
    const result = await this._session().getPrompt({ name: promptName, arguments: args });
    return result.messages;
  }

  async readResource(uri) {
    const result = await this._session().readResource({ uri });
    const resource = result.contents[0];

    if (!resource) return null;

    if (resource.mimeType === "application/json") {
      return JSON.parse(resource.text);
    }

    return resource.text ?? null;
  }

  async cleanup() {
    if (this._client) {
      await this._client.close();
      this._client = null;
      this._transport = null;
    }
  }

  // Allow use as async context (manual open/close pattern)
  async [Symbol.asyncDispose]() {
    await this.cleanup();
  }
}

// For testing
if (process.argv[1].endsWith("mcp_client.js")) {
  const client = new MCPClient({ command: "node", args: ["mcp_server.js"] });
  try {
    await client.connect();
    const tools = await client.listTools();
    console.log("Tools:", tools.map((t) => t.name));
  } finally {
    await client.cleanup();
  }
}
