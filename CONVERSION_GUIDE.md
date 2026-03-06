# MCP Chat: Python → Node.js Conversion Guide

A complete reference for the migration of this project from Python (using `FastMCP` + `uv`) to Node.js (using `@modelcontextprotocol/sdk`), and how to test your Node.js MCP server with MCP Inspector.

---

## Table of Contents

1. [Why Switch to Node.js?](#why-switch-to-nodejs)
2. [Project Structure Comparison](#project-structure-comparison)
3. [Dependency Mapping](#dependency-mapping)
4. [File-by-File Conversion Notes](#file-by-file-conversion-notes)
5. [Key Code Differences](#key-code-differences)
6. [Testing with MCP Inspector](#testing-with-mcp-inspector)
7. [Running the App](#running-the-app)
8. [Gotchas & Tips](#gotchas--tips)

---

## Why Switch to Node.js?

| Reason | Detail |
|---|---|
| **Ecosystem** | The official `@modelcontextprotocol/sdk` is TypeScript/JS-first — Node.js gets features earliest |
| **No virtual envs** | No `uv`, no `venv`, no `--break-system-packages` — just `npm install` |
| **Simpler tooling** | `npx` makes running MCP Inspector trivial without extra setup |
| **Better IDE support** | Richer autocomplete and type inference in JS/TS editors |
| **Single runtime** | Server + client + CLI all run under the same `node` process |

---

## Project Structure Comparison

```
Python (before)                  Node.js (after)
─────────────────────────────    ─────────────────────────────
main.py                      →   main.js
mcp_server.py                →   mcp_server.js
mcp_client.py                →   mcp_client.js
core/
  claude.py                  →   core/claude.js
  chat.py                    →   core/chat.js
  cli_chat.py                →   core/cli_chat.js
  cli.py                     →   core/cli.js
  tools.py                   →   core/tools.js
pyproject.toml               →   package.json
.env                         →   .env  (same)
```

---

## Dependency Mapping

| Python Package | Node.js Package | Purpose |
|---|---|---|
| `anthropic` | `@anthropic-ai/sdk` | Anthropic API client |
| `mcp[cli]` | `@modelcontextprotocol/sdk` | MCP server + client |
| `python-dotenv` | `dotenv` | Load `.env` file |
| `pydantic` / `Field` | `zod` | Schema validation for tool inputs |
| `prompt-toolkit` | `readline` (built-in) | Interactive CLI with tab autocomplete |
| `uv` | `node` / `npx` | Runtime / package runner |
| `asyncio` | Native `async/await` | Async execution |

Install all Node.js dependencies with:

```bash
npm install
```

---

## File-by-File Conversion Notes

### `mcp_server.py` → `mcp_server.js`

The Python version used `FastMCP` from the `mcp` package. The Node.js version uses `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`.

**Python:**
```python
from mcp.server.fastmcp import FastMCP
from pydantic import Field

mcp = FastMCP("DocumentMCP")

@mcp.tool(name="read_doc_contents", description="...")
def read_document(doc_id: str = Field(description="Id of the document")):
    return docs[doc_id]

if __name__ == "__main__":
    mcp.run(transport="stdio")
```

**Node.js:**
```js
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "DocumentMCP", version: "1.0.0" });

server.tool(
  "read_doc_contents",
  "Read the contents of a document.",
  { doc_id: z.string().describe("Id of the document") },
  async ({ doc_id }) => ({
    content: [{ type: "text", text: docs[doc_id] }],
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

Key differences:
- `FastMCP` decorators → `server.tool()`, `server.resource()`, `server.prompt()` method calls
- `pydantic Field` → `zod` schema objects
- `mcp.run(transport="stdio")` → `await server.connect(new StdioServerTransport())`
- Resources now use `ResourceTemplate` for dynamic URI patterns like `docs://documents/{doc_id}`

---

### `mcp_client.py` → `mcp_client.js`

Python used `AsyncExitStack` and Python's async context manager protocol. Node.js uses a plain class with explicit `connect()` and `cleanup()` methods.

**Python:**
```python
async with MCPClient(command="python", args=["mcp_server.py"]) as client:
    tools = await client.list_tools()
```

**Node.js:**
```js
const client = new MCPClient({ command: "node", args: ["mcp_server.js"] });
await client.connect();
const tools = await client.listTools();
await client.cleanup();
```

Key differences:
- `list_tools()` → `listTools()` (camelCase throughout)
- `call_tool()` → `callTool()`
- `read_resource()` → `readResource()`
- `AnyUrl(uri)` wrapping is not needed — just pass the string URI directly
- No `AsyncExitStack`; manage lifecycle manually or use `try/finally`

---

### `core/claude.py` → `core/claude.js`

Straightforward translation. The Anthropic SDK API is nearly identical between Python and Node.js.

**Python:**
```python
message = self.client.messages.create(**params)
```

**Node.js:**
```js
return await this.client.messages.create(params);
```

Key difference: The Node.js SDK is always async — every call to `messages.create()` returns a Promise and must be awaited. The Python SDK exposes a synchronous interface by default.

---

### `core/cli.py` → `core/cli.js`

Python used the `prompt-toolkit` library which provides rich autocomplete, history, and keybindings out of the box. Node.js uses the built-in `readline` module, which requires implementing the `completer` function manually.

**Python (prompt-toolkit):**
```python
session = PromptSession(completer=UnifiedCompleter(), key_bindings=kb)
user_input = await session.prompt_async("> ")
```

**Node.js (readline):**
```js
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: (line) => this._completer(line),
});
```

The `completer` function returns `[completions[], originalLine]`. Tab-completion logic handles:
- `@` prefix → autocomplete document IDs
- `/` prefix → autocomplete command names, then document IDs as the second word

---

### `core/tools.py` → `core/tools.js`

A static class in both languages. The logic is identical — find which client owns a tool, call it, and wrap the result.

Python used `isinstance(item, TextContent)` to filter content. Node.js filters by `item.type === "text"`.

---

## Key Code Differences

### Naming Conventions

| Python | JavaScript |
|---|---|
| `snake_case` methods | `camelCase` methods |
| `list_tools()` | `listTools()` |
| `call_tool()` | `callTool()` |
| `read_resource()` | `readResource()` |
| `list_prompts()` | `listPrompts()` |
| `get_prompt()` | `getPrompt()` |

### Module System

Python uses relative imports:
```python
from core.claude import Claude
```

Node.js uses ES modules (because `"type": "module"` is set in `package.json`):
```js
import { Claude } from "./core/claude.js";
```

> ⚠️ The `.js` extension is **required** in Node.js ES module imports, even for `.js` files.

### Running the Server

| | Python | Node.js |
|---|---|---|
| Command | `python mcp_server.py` or `uv run mcp_server.py` | `node mcp_server.js` |
| In MCPClient | `command="uv", args=["run", "mcp_server.py"]` | `command: "node", args: ["mcp_server.js"]` |

---

## Testing with MCP Inspector

MCP Inspector is a browser-based UI for interactively testing your MCP server — calling tools, reading resources, and running prompts without needing the full chat app.

### Python (what you used before)

With Python + `uv`, you ran the inspector like this:

```bash
npx @modelcontextprotocol/inspector uv run mcp_server.py
```

### Node.js (the new way)

With Node.js, replace `uv run mcp_server.py` with `node mcp_server.js`:

```bash
npx @modelcontextprotocol/inspector node mcp_server.js
```

That's the only change needed.

---

### Step-by-Step: Running MCP Inspector on the Node.js Server

**Step 1 — Install dependencies first (if not done yet):**

```bash
npm install
```

**Step 2 — Launch Inspector:**

```bash
npx @modelcontextprotocol/inspector node mcp_server.js
```

You'll see output like:

```
Starting MCP inspector...
⚙️  Proxy server listening on port 6277
🔍 MCP Inspector is up and running at http://127.0.0.1:6274
🔑 Session token: abc123...
🚀 Open inspector with token pre-filled:
   http://localhost:6274/?MCP_PROXY_AUTH_TOKEN=abc123...
```

**Step 3 — Open the URL** with the token pre-filled (copy the full URL from the terminal output).

**Step 4 — Connect to the server:**
- Transport type should already be set to **Stdio**
- Click **Connect**

You'll now see all your server's tools, resources, and prompts in the left panel.

---

### What You Can Test in the Inspector

#### Tools tab
Test `read_doc_contents` and `edit_document` interactively:

| Tool | Input | Expected Output |
|---|---|---|
| `read_doc_contents` | `doc_id: "deposition.md"` | Returns the deposition text |
| `read_doc_contents` | `doc_id: "fake.txt"` | Returns an error |
| `edit_document` | `doc_id: "plan.md"`, `old_str: "steps"`, `new_str: "phases"` | Updates the document |

#### Resources tab
- `docs://documents` — lists all document IDs as a JSON array
- `docs://documents/report.pdf` — returns the content of a specific document

#### Prompts tab
- `format` — enter a `doc_id` and see the prompt message it generates
- `summarize` — enter a `doc_id` and see the summarize prompt

---

### Adding an `inspect` Script to `package.json`

For convenience, add this to your `package.json` scripts:

```json
{
  "scripts": {
    "start": "node main.js",
    "inspect": "npx @modelcontextprotocol/inspector node mcp_server.js"
  }
}
```

Then just run:

```bash
npm run inspect
```

---

### Passing Environment Variables to the Inspector

If your server reads from `.env`, pass vars inline:

```bash
ANTHROPIC_API_KEY=sk-ant-... npx @modelcontextprotocol/inspector node mcp_server.js
```

Or use a `.env` file — since `mcp_server.js` imports `dotenv/config` at the top, it will load automatically when the Inspector spawns the server process.

---

### Inspector Ports

| Component | Default Port | Override |
|---|---|---|
| Inspector UI (browser) | `6274` | `CLIENT_PORT=8080` |
| Proxy server | `6277` | `SERVER_PORT=9000` |

Custom ports example:

```bash
CLIENT_PORT=8080 SERVER_PORT=9000 npx @modelcontextprotocol/inspector node mcp_server.js
```

---

### Important: Keep `console.log` off stdout in your server

The MCP protocol communicates over **stdout** using JSON-RPC. Any stray `console.log()` output in `mcp_server.js` will corrupt the protocol stream and break the connection.

**Wrong:**
```js
console.log("Server started"); // ❌ breaks stdio transport
```

**Right:**
```js
console.error("Server started"); // ✅ goes to stderr, safe
```

---

## Running the App

```bash
# Install dependencies
npm install

# Copy and fill in your API key
cp .env.example .env

# Start the chat app
npm start

# Test the MCP server in the browser inspector
npm run inspect
```

### Example interactions

```
> What is in @deposition.md?
> /format plan.md
> /summarize financials.docx
> Tell me about @report.pdf and @outlook.pdf
```

---

## Gotchas & Tips

| Gotcha | Fix |
|---|---|
| Import paths need `.js` extension | `import { X } from "./core/x.js"` not `"./core/x"` |
| `console.log` in server breaks stdio | Use `console.error` for debug output in `mcp_server.js` |
| MCP Inspector needs a session token | Copy the full URL with `?MCP_PROXY_AUTH_TOKEN=...` from the terminal |
| `readResource` returns `null` for unknown URIs | Always check for `null` before using the result |
| Node.js ES modules need `"type": "module"` in `package.json` | Already included — don't remove it |
| `await` is needed at the top level in `mcp_server.js` | Works because it's a module (`"type": "module"`) |
