import type { AgentTool } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai/compat";
import { Type } from "typebox";
import { describe, expect, it } from "vitest";
import { createAgentSession } from "../src/core/sdk.ts";
import { SessionManager } from "../src/core/session-manager.ts";
import {
	type StdioToolBrokerCancel,
	StdioToolBrokerClient,
	type StdioToolBrokerRequest,
} from "../src/core/tools/stdio-tool-broker.ts";

const nonce = "session_nonce_1234567890";

describe("stdio tool broker", () => {
	it("correlates one response and rejects duplicates", async () => {
		const output: Array<StdioToolBrokerRequest | StdioToolBrokerCancel> = [];
		const client = new StdioToolBrokerClient({ sessionNonce: nonce });
		client.bindOutput((message) => output.push(message as StdioToolBrokerRequest | StdioToolBrokerCancel));

		const pending = client.request("read", "access", { path: "src/main.ts" });
		const request = output[0] as StdioToolBrokerRequest;
		expect(request).toMatchObject({
			type: "tool_request",
			requestId: "tr-1",
			sessionNonce: nonce,
			tool: "read",
			operation: "access",
			arguments: { path: "src/main.ts" },
		});

		client.handleResponse({
			type: "tool_response",
			requestId: request.requestId,
			sessionNonce: nonce,
			success: true,
			result: { ok: true },
		});
		await expect(pending).resolves.toEqual({ ok: true });
		expect(() =>
			client.handleResponse({
				type: "tool_response",
				requestId: request.requestId,
				sessionNonce: nonce,
				success: true,
			}),
		).toThrow("Unknown or completed tool broker request");
	});

	it("emits cancellation and rejects late responses", async () => {
		const output: Array<StdioToolBrokerRequest | StdioToolBrokerCancel> = [];
		const client = new StdioToolBrokerClient({ sessionNonce: nonce });
		client.bindOutput((message) => output.push(message as StdioToolBrokerRequest | StdioToolBrokerCancel));
		const controller = new AbortController();
		const pending = client.request("bash", "exec", { command: "sleep 10" }, { signal: controller.signal });
		const request = output[0] as StdioToolBrokerRequest;

		controller.abort();

		await expect(pending).rejects.toThrow("aborted");
		expect(output[1]).toEqual({
			type: "tool_cancel",
			requestId: request.requestId,
			sessionNonce: nonce,
			reason: "aborted",
		});
		expect(() =>
			client.handleResponse({
				type: "tool_response",
				requestId: request.requestId,
				sessionNonce: nonce,
				success: true,
			}),
		).toThrow("Unknown or completed tool broker request");
	});

	it("uses SDK base tool overrides as the default active tools", async () => {
		const echoTool: AgentTool = {
			name: "echo",
			label: "Echo",
			description: "Echo input",
			parameters: Type.Object({ text: Type.String() }),
			execute: async (_id, args) => ({
				content: [{ type: "text", text: (args as { text: string }).text }],
				details: {},
			}),
		};
		const sessionManager = SessionManager.inMemory(process.cwd());
		const { session } = await createAgentSession({
			cwd: process.cwd(),
			model: getModel("anthropic", "claude-sonnet-4-5")!,
			sessionManager,
			baseToolsOverride: { echo: echoTool },
		});

		expect(session.getAllTools().map((tool) => tool.name)).toEqual(["echo"]);
		expect(session.getActiveToolNames()).toEqual(["echo"]);
		session.dispose();
	});
});
