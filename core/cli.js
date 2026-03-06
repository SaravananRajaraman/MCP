import readline from "readline";

export class CliApp {
  constructor(agent) {
    this.agent = agent;
    this.docIds = [];
    this.prompts = [];
  }

  async initialize() {
    await this._refreshResources();
    await this._refreshPrompts();
  }

  async _refreshResources() {
    try {
      this.docIds = (await this.agent.listDocIds()) ?? [];
    } catch (e) {
      console.error("Error refreshing resources:", e.message);
    }
  }

  async _refreshPrompts() {
    try {
      this.prompts = (await this.agent.listPrompts()) ?? [];
    } catch (e) {
      console.error("Error refreshing prompts:", e.message);
    }
  }

  /**
   * Tab-completion function for readline.
   * Handles two cases:
   *  - "/" prefix: autocomplete command names, then doc IDs as the second word
   *  - "@" anywhere: autocomplete doc IDs after the @
   */
  _completer(line) {
    // Case 1: completing @doc mentions
    const atIndex = line.lastIndexOf("@");
    if (atIndex !== -1) {
      const prefix = line.slice(atIndex + 1);
      const hits = this.docIds.filter((id) => id.startsWith(prefix));
      const completions = hits.map((id) => line.slice(0, atIndex + 1) + id);
      return [completions.length ? completions : [], line];
    }

    // Case 2: completing /command <doc_id>
    if (line.startsWith("/")) {
      const withoutSlash = line.slice(1);
      const parts = withoutSlash.split(/\s+/);

      // Still typing the command name
      if (parts.length <= 1 && !line.endsWith(" ")) {
        const cmdPrefix = parts[0] ?? "";
        const hits = this.prompts
          .filter((p) => p.name.startsWith(cmdPrefix))
          .map((p) => "/" + p.name);
        return [hits.length ? hits : [], line];
      }

      // Command typed, now completing doc ID
      if (parts.length >= 1 && (parts.length === 1 ? line.endsWith(" ") : true)) {
        const docPrefix = parts[parts.length - 1] ?? "";
        const hits = this.docIds
          .filter((id) => id.startsWith(docPrefix))
          .map((id) => "/" + parts[0] + " " + id);
        return [hits.length ? hits : [], line];
      }
    }

    return [[], line];
  }

  async run() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      completer: (line) => this._completer(line),
      prompt: "> ",
    });

    rl.prompt();

    // Wrap line handling in a promise loop
    await new Promise((resolve) => {
      rl.on("line", async (input) => {
        const query = input.trim();
        if (!query) {
          rl.prompt();
          return;
        }

        // Pause input while waiting for response
        rl.pause();
        try {
          const response = await this.agent.run(query);
          console.log(`\nResponse:\n${response}\n`);
        } catch (e) {
          console.error("Error:", e.message);
        } finally {
          rl.resume();
          rl.prompt();
        }
      });

      rl.on("close", () => {
        console.log("\nGoodbye!");
        resolve();
      });

      rl.on("SIGINT", () => {
        rl.close();
      });
    });
  }
}
