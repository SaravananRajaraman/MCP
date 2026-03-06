import "dotenv/config";
import { MCPClient } from "./mcp_client.js";
import { Claude } from "./core/claude.js";
import { CliChat } from "./core/cli_chat.js";
import { CliApp } from "./core/cli.js";

const claudeModel = process.env.CLAUDE_MODEL;
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

if (!claudeModel) {
  console.error("Error: CLAUDE_MODEL cannot be empty. Update .env");
  process.exit(1);
}
if (!anthropicApiKey) {
  console.error("Error: ANTHROPIC_API_KEY cannot be empty. Update .env");
  process.exit(1);
}

async function main() {
  const claudeService = new Claude({ model: claudeModel });

  // Extra server scripts passed as CLI args (node main.js server1.js server2.js ...)
  const serverScripts = process.argv.slice(2);

  const docClient = new MCPClient({ command: "node", args: ["mcp_server.js"] });
  await docClient.connect();

  const clients = { doc_client: docClient };

  for (let i = 0; i < serverScripts.length; i++) {
    const script = serverScripts[i];
    const clientId = `client_${i}_${script}`;
    const client = new MCPClient({ command: "node", args: [script] });
    await client.connect();
    clients[clientId] = client;
  }

  try {
    const chat = new CliChat({ docClient, clients, claudeService });
    const cli = new CliApp(chat);

    await cli.initialize();
    await cli.run();
  } finally {
    // Clean up all clients on exit
    for (const client of Object.values(clients)) {
      await client.cleanup().catch(() => {});
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
