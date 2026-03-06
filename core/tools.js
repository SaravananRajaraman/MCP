export class ToolManager {
  /**
   * Gets all tools from all connected MCP clients.
   * @param {Record<string, import('../mcp_client.js').MCPClient>} clients
   */
  static async getAllTools(clients) {
    const tools = [];
    for (const client of Object.values(clients)) {
      const clientTools = await client.listTools();
      for (const t of clientTools) {
        tools.push({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema,
        });
      }
    }
    return tools;
  }

  /**
   * Finds the first client that has a tool with the given name.
   */
  static async _findClientWithTool(clients, toolName) {
    for (const client of clients) {
      const tools = await client.listTools();
      const found = tools.find((t) => t.name === toolName);
      if (found) return client;
    }
    return null;
  }

  static _buildToolResultPart(toolUseId, text, status) {
    return {
      tool_use_id: toolUseId,
      type: "tool_result",
      content: text,
      is_error: status === "error",
    };
  }

  /**
   * Executes all tool_use blocks in the response message.
   * @param {Record<string, import('../mcp_client.js').MCPClient>} clients
   * @param {import('@anthropic-ai/sdk').Message} message
   */
  static async executeToolRequests(clients, message) {
    const toolRequests = message.content.filter((b) => b.type === "tool_use");
    const toolResultBlocks = [];

    for (const toolRequest of toolRequests) {
      const { id: toolUseId, name: toolName, input: toolInput } = toolRequest;

      const client = await ToolManager._findClientWithTool(
        Object.values(clients),
        toolName
      );

      if (!client) {
        toolResultBlocks.push(
          ToolManager._buildToolResultPart(toolUseId, "Could not find that tool", "error")
        );
        continue;
      }

      let toolOutput;
      try {
        toolOutput = await client.callTool(toolName, toolInput);
        const contentList = (toolOutput?.content ?? [])
          .filter((item) => item.type === "text")
          .map((item) => item.text);

        toolResultBlocks.push(
          ToolManager._buildToolResultPart(
            toolUseId,
            JSON.stringify(contentList),
            toolOutput?.isError ? "error" : "success"
          )
        );
      } catch (e) {
        const errorMessage = `Error executing tool '${toolName}': ${e.message}`;
        console.error(errorMessage);
        toolResultBlocks.push(
          ToolManager._buildToolResultPart(
            toolUseId,
            JSON.stringify({ error: errorMessage }),
            "error"
          )
        );
      }
    }

    return toolResultBlocks;
  }
}
