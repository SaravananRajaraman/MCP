import { Chat } from "./chat.js";

export class CliChat extends Chat {
  constructor({ docClient, clients, claudeService }) {
    super({ claudeService, clients });
    this.docClient = docClient;
  }

  async listPrompts() {
    return await this.docClient.listPrompts();
  }

  async listDocIds() {
    return await this.docClient.readResource("docs://documents");
  }

  async getDocContent(docId) {
    return await this.docClient.readResource(`docs://documents/${docId}`);
  }

  async getPrompt(command, docId) {
    return await this.docClient.getPrompt(command, { doc_id: docId });
  }

  async _extractResources(query) {
    const mentions = query
      .split(/\s+/)
      .filter((w) => w.startsWith("@"))
      .map((w) => w.slice(1));

    const docIds = await this.listDocIds();
    const mentionedDocs = [];

    for (const docId of docIds) {
      if (mentions.includes(docId)) {
        const content = await this.getDocContent(docId);
        mentionedDocs.push({ docId, content });
      }
    }

    return mentionedDocs
      .map(({ docId, content }) => `\n<document id="${docId}">\n${content}\n</document>\n`)
      .join("");
  }

  async _processCommand(query) {
    if (!query.startsWith("/")) return false;

    const words = query.split(/\s+/);
    const command = words[0].replace("/", "");
    const docId = words[1];

    const promptMessages = await this.docClient.getPrompt(command, { doc_id: docId });
    const converted = convertPromptMessagesToMessageParams(promptMessages);
    this.messages.push(...converted);
    return true;
  }

  async _processQuery(query) {
    if (await this._processCommand(query)) return;

    const addedResources = await this._extractResources(query);

    const prompt = `The user has a question:
<query>
${query}
</query>

The following context may be useful in answering their question:
<context>
${addedResources}
</context>

Note the user's query might contain references to documents like "@report.docx". The "@" is only
included as a way of mentioning the doc. The actual name of the document would be "report.docx".
If the document content is included in this prompt, you don't need to use an additional tool to read the document.
Answer the user's question directly and concisely. Start with the exact information they need.
Don't refer to or mention the provided context in any way - just use it to inform your answer.`;

    this.messages.push({ role: "user", content: prompt });
  }
}

function convertPromptMessageToMessageParam(promptMessage) {
  const role = promptMessage.role === "user" ? "user" : "assistant";
  const content = promptMessage.content;

  if (content && typeof content === "object" && !Array.isArray(content)) {
    if (content.type === "text") {
      return { role, content: content.text ?? "" };
    }
  }

  if (Array.isArray(content)) {
    const textBlocks = content
      .filter((item) => item?.type === "text")
      .map((item) => ({ type: "text", text: item.text ?? "" }));
    if (textBlocks.length > 0) {
      return { role, content: textBlocks };
    }
  }

  return { role, content: "" };
}

function convertPromptMessagesToMessageParams(promptMessages) {
  return promptMessages.map(convertPromptMessageToMessageParam);
}
