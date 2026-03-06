# MCP Chat (Node.js)

A Node.js port of the MCP Chat CLI app. Interactive terminal chat with Claude, backed by an MCP server for document retrieval, tools, and prompts.

## Prerequisites

- Node.js 18+
- An Anthropic API key

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your values:

```
ANTHROPIC_API_KEY="sk-ant-..."
CLAUDE_MODEL="claude-sonnet-4-20250514"
```

### 3. Run

```bash
npm start
# or
node main.js
```

To attach additional MCP servers:

```bash
node main.js my_other_server.js
```

## Usage

### Basic chat

Just type your message and press Enter.

### Document mentions (`@`)

Reference a document inline to inject its content into the prompt:

```
> Tell me about @deposition.md
```

Press **Tab** after `@` to autocomplete document IDs.

### Commands (`/`)

Run an MCP prompt against a document:

```
> /format report.pdf
> /summarize financials.docx
```

Press **Tab** after `/` to autocomplete the command name, then press **Tab** again to autocomplete the document ID.

## Project structure

```
.
├── main.js              # Entry point
├── mcp_server.js        # MCP server (tools, resources, prompts)
├── mcp_client.js        # MCP client wrapper
├── core/
│   ├── claude.js        # Anthropic API wrapper
│   ├── tools.js         # Tool execution manager
│   ├── chat.js          # Base chat loop
│   ├── cli_chat.js      # CLI-specific chat (doc mentions, commands)
│   └── cli.js           # readline CLI with tab autocomplete
├── package.json
└── .env.example
```

## Adding documents

Edit the `docs` object in `mcp_server.js`:

```js
const docs = {
  "my-doc.md": "Content of my document.",
  // ...
};
```

## Adding MCP tools / prompts / resources

Everything is in `mcp_server.js`. Use `server.tool()`, `server.prompt()`, and `server.resource()` from the `@modelcontextprotocol/sdk`.
