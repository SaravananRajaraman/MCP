import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "DocumentMCP",
  version: "1.0.0",
});

// In-memory document store
const docs = {
  "deposition.md": "This deposition covers the testimony of Angela Smith, P.E.",
  "report.pdf": "The report details the state of a 20m condenser tower.",
  "financials.docx": "These financials outline the project's budget and expenditures.",
  "outlook.pdf": "This document presents the projected future performance of the system.",
  "plan.md": "The plan outlines the steps for the project's implementation.",
  "spec.txt": "These specifications define the technical requirements for the equipment.",
};

// --- Tools ---

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

// --- Resources ---

server.resource(
  "all-documents",
  "docs://documents",
  { mimeType: "application/json" },
  async () => ({
    contents: [{
      uri: "docs://documents",
      mimeType: "application/json",
      text: JSON.stringify(Object.keys(docs)),
    }],
  })
);

server.resource(
  "document-by-id",
  new ResourceTemplate("docs://documents/{doc_id}", { list: undefined }),
  { mimeType: "text/plain" },
  async (uri, { doc_id }) => {
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

// --- Prompts ---

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

// --- Start server ---
const transport = new StdioServerTransport();
await server.connect(transport);
