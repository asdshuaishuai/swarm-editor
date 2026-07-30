import readline from "node:readline";

const lines = readline.createInterface({ input: process.stdin });

lines.on("line", (line) => {
    const request = JSON.parse(line);
    if (request.method === "notifications/initialized") return;
    let result = {};
    if (request.method === "initialize") {
        result = {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "fake-mcp", version: "1.0.0" },
        };
    } else if (request.method === "tools/list") {
        result = {
            tools: [
                {
                    name: "echo",
                    description: "Echo text from the fake MCP server",
                    inputSchema: {
                        type: "object",
                        properties: { text: { type: "string" } },
                        required: ["text"],
                    },
                },
            ],
        };
    } else if (request.method === "tools/call") {
        result = { content: [{ type: "text", text: String(request.params?.arguments?.text ?? "") }] };
    }
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id, result })}\n`);
});
