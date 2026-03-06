# MCP Tools, Prompts & Resources — A Beginner's Guide

> This guide is for people who are new to the **Model Context Protocol (MCP)** and have limited Node.js experience. We'll use the `mcp_server.js` file from this project as our running example throughout.

---

## What Is MCP, in Plain English?

When you chat with Claude, it only knows what's in the conversation. MCP is a way to give Claude **superpowers** by connecting it to external capabilities — like the ability to read a file, run a database query, or call an API.

An **MCP server** is a small program that exposes three types of things to Claude:

| Concept | What it is | Analogy |
|---|---|---|
| **Tool** | An action Claude can perform | A function Claude can call |
| **Resource** | Data Claude can read | A file or URL Claude can open |
| **Prompt** | A pre-written instruction template | A saved command or slash command |

The MCP client (in `mcp_client.js`) is the bridge — it connects your chat app to the server and lets Claude discover and use everything the server exposes.

---

## The Big Picture: How It All Fits Together

```
Your Chat App (main.js)
        │
        ▼
  MCP Client (mcp_client.js)  ←——connects via stdio——→  MCP Server (mcp_server.js)
        │                                                        │
        ▼                                                  ┌─────┴─────┐
  Claude API                                           Tools  Resources  Prompts
```

When you type a message, the chat app sends it to Claude. Claude sees the list of available tools and may decide to call one. The result comes back through the client and gets added to the conversation.

---

## Setting Up the Server

Every `mcp_server.js` starts the same way — import the SDK, create a server, and connect it to **stdio** (standard input/output, which is how the client talks to it):

```js
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod"; // Used for validating inputs — more on this below

const server = new McpServer({
  name: "DocumentMCP",
  version: "1.0.0",
});

// ... register tools, resources, prompts here ...

const transport = new StdioServerTransport();
await server.connect(transport);
```

> **What is `zod`?** It's a library for describing and validating the shape of data. When Claude calls a tool, you want to make sure the input it provides is valid. Zod is how you define those rules.

---

## Part 1: Tools

### What is a Tool?

A **tool** is a function Claude can call during a conversation. Claude reads the tool's name and description, and decides on its own when it makes sense to call it.

Think of it like this: you give Claude a hammer, and it figures out when something needs hammering.

### Anatomy of a Tool

```js
server.tool(
  "tool_name",           // 1. The name Claude uses to call this tool
  "What this tool does", // 2. A description — Claude reads this!
  { /* input schema */ },// 3. What inputs the tool expects
  async (inputs) => {    // 4. The actual function that runs
    // ... do something ...
    return { content: [{ type: "text", text: "result here" }] };
  }
);
```

The **description** is critically important — it's how Claude knows *when* to use the tool. Write it clearly and specifically.

### Real Example: `read_doc_contents`

From our `mcp_server.js`:

```js
server.tool(
  "read_doc_contents",
  "Read the contents of a document and return it as a string.",
  { doc_id: z.string().describe("Id of the document to read") },
  async ({ doc_id }) => {
    if (!(doc_id in docs)) {
      throw new Error(`Doc with id '${doc_id}' not found`);
    }
    return { content: [{ type: "text", text: docs[doc_id] }] };
  }
);
```

Breaking it down:
- **Name:** `read_doc_contents` — short and descriptive
- **Description:** tells Claude exactly what it does
- **Input:** `doc_id` — a string, described so Claude knows what to pass
- **Handler:** looks up the doc and returns it, or throws an error if it's missing

The return value always has this shape:
```js
{ content: [{ type: "text", text: "your result string" }] }
```

### Real Example: `edit_document`

```js
server.tool(
  "edit_document",
  "Edit a document by replacing a string in the document's content with a new string.",
  {
    doc_id: z.string().describe("Id of the document that will be edited"),
    old_str: z.string().describe("The text to replace. Must match exactly, including whitespace"),
    new_str: z.string().describe("The new text to insert in place of the old text"),
  },
  async ({ doc_id, old_str, new_str }) => {
    if (!(doc_id in docs)) {
      throw new Error(`Doc with id '${doc_id}' not found`);
    }
    docs[doc_id] = docs[doc_id].replace(old_str, new_str);
    return { content: [{ type: "text", text: `Document '${doc_id}' updated successfully.` }] };
  }
);
```

This tool takes **three inputs**. Notice each one has a `.describe()` — these descriptions are passed to Claude so it knows what each parameter means.

### Input Schema Quick Reference (Zod)

```js
z.string()              // A text value
z.number()              // A number
z.boolean()             // true or false
z.enum(["a", "b", "c"]) // One of a fixed set of values
z.string().optional()   // Optional — Claude doesn't have to provide it
z.string().describe("hint for Claude") // Adds context for Claude
```

### Tips for Writing Good Tools

- **Be specific in descriptions.** "Reads a document" is worse than "Reads the full text content of a document by its ID and returns it as a string."
- **Throw errors for bad input.** Claude will see the error message and can retry or tell the user.
- **Keep tools focused.** One tool, one job. Don't make a tool that reads *and* edits.

---

## Part 2: Resources

### What is a Resource?

A **resource** is data Claude (or the user) can read by fetching a URI — similar to a URL in a browser. Resources are not called dynamically by Claude the way tools are; they are fetched directly by the client and injected into the conversation.

In this project, when you type `@deposition.md` in the chat, the client fetches the resource at `docs://documents/deposition.md` and includes its content in your message.

### Static Resources vs. Resource Templates

There are two kinds:

| Type | Use case | Example URI |
|---|---|---|
| **Static** | Always returns the same data | `docs://documents` |
| **Template** | Takes a variable in the URI | `docs://documents/{doc_id}` |

### Real Example: Static Resource

```js
server.resource(
  "all-documents",       // Internal name
  "docs://documents",    // The URI clients use to fetch it
  { mimeType: "application/json" },
  async () => ({
    contents: [{
      uri: "docs://documents",
      mimeType: "application/json",
      text: JSON.stringify(Object.keys(docs)), // Returns ["deposition.md", "report.pdf", ...]
    }],
  })
);
```

This always returns the list of all document IDs. The chat app uses this to power the `@` autocomplete feature.

### Real Example: Resource Template

```js
server.resource(
  "document-by-id",
  new ResourceTemplate("docs://documents/{doc_id}", { list: undefined }),
  { mimeType: "text/plain" },
  async (uri, { doc_id }) => {     // Note: the handler gets the full uri AND the extracted variables
    if (!(doc_id in docs)) {
      throw new Error(`Doc with id '${doc_id}' not found`);
    }
    return {
      contents: [{
        uri: uri.href,
        mimeType: "text/plain",
        text: docs[doc_id],
      }],
    };
  }
);
```

The `{doc_id}` in the URI template is automatically extracted and passed to your handler. So when the client fetches `docs://documents/report.pdf`, the handler receives `doc_id = "report.pdf"`.

### MIME Types

The `mimeType` tells the client how to interpret the data:

| mimeType | When to use |
|---|---|
| `"text/plain"` | Plain text content |
| `"application/json"` | JSON data (client will parse it) |
| `"text/markdown"` | Markdown text |

### Tips for Writing Good Resources

- **Use meaningful URIs.** Follow a pattern like `myapp://category/item` to keep things organized.
- **Return the right mimeType.** If you return JSON text, set `application/json` so the client can parse it correctly.
- **Static resources are great for indexes.** A resource that lists all available IDs is a common and useful pattern (as seen with `docs://documents`).

---

## Part 3: Prompts

### What is a Prompt?

A **prompt** is a pre-written instruction template stored on the server. Instead of typing a long, detailed instruction every time, a user can run `/format plan.md` and the server fills in the blanks and sends a fully-formed instruction to Claude.

Prompts are the "slash commands" of MCP.

### Anatomy of a Prompt

```js
server.prompt(
  "prompt_name",         // 1. Name used to call it (e.g., /format)
  "What this does",      // 2. Description
  { /* arguments */ },   // 3. Parameters the user provides
  ({ arg1 }) => ({       // 4. Returns a messages array
    messages: [{
      role: "user",
      content: { type: "text", text: `Your instruction here with ${arg1}` }
    }]
  })
);
```

The key difference from tools: a prompt **returns a message** rather than executing code. That message gets sent to Claude as the user's instruction.

### Real Example: `summarize`

```js
server.prompt(
  "summarize",
  "Summarizes the contents of a document.",
  { doc_id: z.string().describe("Id of the document to summarize") },
  ({ doc_id }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Please summarize the contents of the following document.

The id of the document you need to summarize is:
<document_id>
${doc_id}
</document_id>

Use the 'read_doc_contents' tool to read the document, then provide a concise summary.`,
      },
    }],
  })
);
```

When a user types `/summarize financials.docx`, the server fills `doc_id` with `"financials.docx"` and sends that full message to Claude. Notice it tells Claude *which tool to use* — that's intentional, so Claude has clear direction.

### Real Example: `format`

```js
server.prompt(
  "format",
  "Rewrites the contents of the document in Markdown format.",
  { doc_id: z.string().describe("Id of the document to format") },
  ({ doc_id }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Your goal is to reformat a document to be written with markdown syntax.

The id of the document you need to reformat is:
<document_id>
${doc_id}
</document_id>

Add in headers, bullet points, tables, etc as necessary. Feel free to add in extra text, but don't change the meaning of the report.
Use the 'edit_document' tool to edit the document. After the document has been edited, respond with the final version of the doc. Don't explain your changes.`,
      },
    }],
  })
);
```

This prompt instructs Claude to both read and edit a document in one shot — it chains tools together through natural language.

### Tips for Writing Good Prompts

- **Be explicit about which tools to use.** Claude can figure it out on its own, but telling it directly ("Use the `read_doc_contents` tool") saves back-and-forth.
- **Use XML tags for variable content.** Wrapping the `doc_id` in `<document_id>` tags makes it unambiguous.
- **Prompts are reusable workflows.** Think of them as saved recipes for common tasks.

---

## Summary: Tools vs. Resources vs. Prompts

| | Tool | Resource | Prompt |
|---|---|---|---|
| **Purpose** | Perform an action | Expose data | Pre-written instruction |
| **Called by** | Claude automatically | Client / user (`@mention`) | User explicitly (`/command`) |
| **Returns** | Result content | Data contents | A message for Claude |
| **Example** | `edit_document` | `docs://documents` | `/summarize` |
| **Analogous to** | A function | A file/URL | A saved command |

---

## Adding Your Own: A Quick Checklist

### New Tool
1. Think: what action should Claude be able to take?
2. Define the input schema with `z.string()`, `z.number()`, etc.
3. Write the handler — make it throw a clear error on bad input
4. Add a sharp, specific description

### New Resource
1. Decide: is this static data or does it need a variable URI?
2. Use a static resource for indexes/lists; use `ResourceTemplate` for individual items
3. Set the correct `mimeType`

### New Prompt
1. Write the instruction you'd normally type by hand
2. Identify which parts are variable (those become arguments)
3. Include explicit guidance on which tools Claude should use

---

## Testing Everything: MCP Inspector

Before connecting your server to the full chat app, test it in isolation with the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node mcp_server.js
```

Open the URL it prints (with the token included). You'll see three tabs — **Tools**, **Resources**, and **Prompts** — and can test each one interactively without writing any code.

> ⚠️ **One common gotcha:** never use `console.log()` inside `mcp_server.js`. The server communicates over stdout using JSON, and any stray text will corrupt the stream. Use `console.error()` for debug output instead — it goes to stderr and won't interfere.

---

## Where to Go Next

- Swap the in-memory `docs` object for a real database or file system read
- Add a tool that calls an external API
- Add a resource that returns live data (e.g., current weather, a database query)
- Chain multiple prompts together for multi-step workflows
