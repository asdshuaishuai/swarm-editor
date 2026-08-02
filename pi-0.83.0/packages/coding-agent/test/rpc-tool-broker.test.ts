import { afterEach, describe, expect, test, vi } from "vitest";
import type { AgentSessionRuntime } from "../src/core/agent-session-runtime.ts";
import { StdioToolBrokerClient, type StdioToolBrokerRequest } from "../src/core/tools/stdio-tool-broker.ts";
import { runRpcMode } from "../src/modes/rpc/rpc-mode.ts";
import { createHarness, type Harness } from "./suite/harness.ts";

const rpcIo = vi.hoisted(() => ({
	outputLines: [] as string[],
	lineHandler: undefined as ((line: string) => void) | undefined,
}));

vi.mock("../src/core/output-guard.js", () => ({
	flushRawStdout: vi.fn(async () => {}),
	takeOverStdout: vi.fn(),
	waitForRawStdoutBackpressure: vi.fn(async () => {}),
	writeRawStdout: (line: string) => rpcIo.outputLines.push(line),
}));

vi.mock("../src/modes/interactive/theme/theme.js", () => ({ theme: {} }));

vi.mock("../src/modes/rpc/jsonl.js", () => ({
	attachJsonlLineReader: vi.fn((_stream: NodeJS.ReadableStream, onLine: (line: string) => void) => {
		rpcIo.lineHandler = onLine;
		return () => {
			rpcIo.lineHandler = undefined;
		};
	}),
	serializeJsonLine: (value: unknown) => `${JSON.stringify(value)}\n`,
}));

type NodeListener = Parameters<typeof process.on>[1];

function createRuntimeHost(harness: Harness): AgentSessionRuntime {
	return {
		session: harness.session,
		newSession: vi.fn(async () => ({ cancelled: true })),
		switchSession: vi.fn(async () => ({ cancelled: true })),
		fork: vi.fn(async () => ({ cancelled: true, selectedText: "" })),
		dispose: vi.fn(async () => {}),
		setRebindSession: vi.fn(),
	} as unknown as AgentSessionRuntime;
}

function parseOutput(): Array<Record<string, unknown>> {
	return rpcIo.outputLines
		.flatMap((line) => line.split("\n"))
		.filter(Boolean)
		.map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("RPC tool broker dispatch", () => {
	afterEach(() => {
		rpcIo.outputLines = [];
		rpcIo.lineHandler = undefined;
	});

	test("routes tool responses without a competing stdin reader", async () => {
		const stdinEndListeners = process.stdin.listeners("end") as NodeListener[];
		const signalNames: NodeJS.Signals[] = process.platform === "win32" ? ["SIGTERM"] : ["SIGTERM", "SIGHUP"];
		const signalListeners = new Map(
			signalNames.map((signal) => [signal, process.listeners(signal) as NodeListener[]]),
		);
		const harness = await createHarness();
		const client = new StdioToolBrokerClient({ sessionNonce: "rpc_session_nonce_1234" });

		try {
			void runRpcMode(createRuntimeHost(harness), { toolBrokerClient: client });
			await vi.waitFor(() => expect(rpcIo.lineHandler).toBeDefined());

			const pending = client.request("read", "access", { path: "src/main.ts" });
			await vi.waitFor(() => expect(parseOutput().some((entry) => entry.type === "tool_request")).toBe(true));
			const request = parseOutput().find(
				(entry) => entry.type === "tool_request",
			) as unknown as StdioToolBrokerRequest;
			rpcIo.lineHandler?.(
				JSON.stringify({
					type: "tool_response",
					requestId: request.requestId,
					sessionNonce: request.sessionNonce,
					success: true,
					result: { readable: true },
				}),
			);

			await expect(pending).resolves.toEqual({ readable: true });

			rpcIo.lineHandler?.(
				JSON.stringify({
					type: "tool_response",
					requestId: request.requestId,
					sessionNonce: request.sessionNonce,
					success: true,
				}),
			);
			await vi.waitFor(() => {
				expect(parseOutput()).toContainEqual({
					type: "tool_broker_error",
					requestId: request.requestId,
					error: `Unknown or completed tool broker request: ${request.requestId}`,
				});
			});
		} finally {
			client.dispose();
			harness.cleanup();
			for (const listener of process.stdin.listeners("end") as NodeListener[]) {
				if (!stdinEndListeners.includes(listener)) process.stdin.off("end", listener);
			}
			for (const [signal, previous] of signalListeners) {
				for (const listener of process.listeners(signal) as NodeListener[]) {
					if (!previous.includes(listener)) process.off(signal, listener);
				}
			}
		}
	});
});
