import { pathToFileURL } from "node:url";

const [, , extensionPath, toolName, inputJson] = process.argv;
const tools = new Map();
let shutdown;
const pi = {
    registerTool(tool) {
        tools.set(tool.name, tool);
    },
    on(event, handler) {
        if (event === "session_shutdown") shutdown = handler;
    },
};

const { default: extension } = await import(pathToFileURL(extensionPath).href);
await extension(pi);
const tool = tools.get(toolName);
if (!tool) throw new Error(`Tool not registered: ${toolName}`);

try {
    const result = await tool.execute("integration-call", JSON.parse(inputJson));
    process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
    await shutdown?.();
}
