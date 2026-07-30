import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { Type } from "typebox";

const protocolVersion = "2024-11-05";
const configPath = process.env.SWARM_EDITOR_MCP_CONFIG;
const agentId = process.env.SWARM_PI_AGENT_ID || "";

class McpClient {

	constructor(server) {
		this.server = server;
		this.process = undefined;
		this.nextId = 1;
		this.buffer = "";
		this.pending = new Map();
	}

	async start() {
		this.process = spawn(this.server.command, this.server.args || [], {
			env: { ...process.env, ...(this.server.env || {}) },
			stdio: ["pipe", "pipe", "pipe"],
		});
		this.process.stderr?.on("data", (chunk) => {
			process.stderr.write(`[mcp:${this.server.id}] ${chunk}`);
		});
		this.process.stdout?.on("data", (chunk) => this.onData(chunk));
		this.process.on("error", (error) => this.failPending(error));
		this.process.on("exit", (code, signal) => {
			this.failPending(new Error(`MCP server ${this.server.name} exited (${code ?? signal ?? "unknown"})`));
		});

		await this.request("initialize", {
			protocolVersion,
			capabilities: {},
			clientInfo: { name: "swarm-editor", version: "0.1.0" },
		});
		this.notify("notifications/initialized", {});
		const result = await this.request("tools/list", {});
		return Array.isArray(result?.tools) ? result.tools : [];
	}

	request(method, params) {
		if (!this.process?.stdin?.writable) return Promise.reject(new Error("MCP server is not writable"));
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`MCP request timed out: ${method}`));
			}, 30_000);
			this.pending.set(id, { resolve, reject, timeout });
			this.write({ jsonrpc: "2.0", id, method, params });
		});
	}

	notify(method, params) {
		this.write({ jsonrpc: "2.0", method, params });
	}

	write(message) {
		this.process.stdin.write(`${JSON.stringify(message)}\n`);
	}

	onData(chunk) {
		this.buffer += chunk.toString();
		while (true) {
			const newline = this.buffer.indexOf("\n");
			if (newline < 0) return;
			const line = this.buffer.slice(0, newline).trim();
			this.buffer = this.buffer.slice(newline + 1);
			if (!line) continue;
			let message;
			try {
				message = JSON.parse(line);
			} catch {
				continue;
			}
			if (message.id === undefined || message.id === null) continue;
			const pending = this.pending.get(message.id);
			if (!pending) continue;
			this.pending.delete(message.id);
			clearTimeout(pending.timeout);
			if (message.error) pending.reject(new Error(message.error.message || "MCP request failed"));
			else pending.resolve(message.result || {});
		}
	}

	failPending(error) {
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timeout);
			pending.reject(error);
		}
		this.pending.clear();
	}

	async close() {
		this.failPending(new Error("MCP server closed"));
		this.process?.kill();
	}
}

function isEnabledForAgent(server) {
	if (server.disabled || server.type !== "stdio") return false;
	const enabledAgents = server.enabledAgents || {};
	return Object.keys(enabledAgents).length === 0 || enabledAgents[agentId] === true;
}

function toolSchema(inputSchema) {
	if (inputSchema && typeof inputSchema === "object") return Type.Unsafe(inputSchema);
	return Type.Object({});
}

function safeName(serverId, toolName) {
	return `mcp_${serverId}_${toolName}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

function contentToPiContent(content) {
	if (!Array.isArray(content) || content.length === 0) {
		return [{ type: "text", text: "MCP server returned no content" }];
	}
	return content.map((item) => {
		if (item?.type === "text") return { type: "text", text: String(item.text ?? "") };
		return { type: "text", text: JSON.stringify(item) };
	});
}

export default async function swarmMcpExtension(pi) {
	if (!configPath) return;
	let file;
	try {
		file = JSON.parse(await readFile(configPath, "utf8"));
	} catch (error) {
		console.error(`[swarm-mcp] unable to load config: ${error.message}`);
		return;
	}

	const clients = [];
	for (const [id, server] of Object.entries(file.servers || {})) {
		const configured = { id, ...server };
		if (!isEnabledForAgent(configured) || !configured.command) continue;
		const client = new McpClient(configured);
		try {
			const tools = await client.start();
			clients.push(client);
			for (const tool of tools) {
				const originalName = String(tool.name || "tool");
				const registeredName = safeName(id, originalName);
				pi.registerTool({
					name: registeredName,
					label: `${configured.name}: ${originalName}`,
					description: `${tool.description || originalName} (MCP: ${configured.name})`,
					promptSnippet: `MCP ${configured.name} tool ${originalName}`,
					parameters: toolSchema(tool.inputSchema),
					executionMode: "sequential",
					async execute(_toolCallId, params) {
						try {
							const result = await client.request("tools/call", {
								name: originalName,
								arguments: params || {},
							});
							return {
								content: contentToPiContent(result.content),
								isError: result.isError === true,
								details: { mcpServerId: id, mcpToolName: originalName },
							};
						} catch (error) {
							return {
								content: [{ type: "text", text: `MCP tool failed: ${error.message}` }],
								isError: true,
								details: { mcpServerId: id, mcpToolName: originalName },
							};
						}
					},
				});
			}
		} catch (error) {
			console.error(`[swarm-mcp] ${configured.name}: ${error.message}`);
			await client.close();
		}
	}

	pi.on("session_shutdown", async () => {
		await Promise.all(clients.map((client) => client.close()));
	});
}
