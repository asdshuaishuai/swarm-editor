import { isAbsolute, relative, sep } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { createBashTool } from "./bash.ts";
import { createEditTool } from "./edit.ts";
import { createReadTool } from "./read.ts";
import { createWriteTool } from "./write.ts";

export type StdioToolBrokerTool = "read" | "bash" | "edit" | "write";

export interface StdioToolBrokerRequest {
	type: "tool_request";
	requestId: string;
	sessionNonce: string;
	tool: StdioToolBrokerTool;
	operation: string;
	arguments: Record<string, unknown>;
	deadlineMillis: number;
}

export interface StdioToolBrokerCancel {
	type: "tool_cancel";
	requestId: string;
	sessionNonce: string;
	reason: "aborted" | "timeout" | "disposed";
}

export interface StdioToolBrokerResponse {
	id?: string;
	type: "tool_response";
	requestId: string;
	sessionNonce: string;
	success: boolean;
	result?: unknown;
	error?: string;
	auditId?: string;
}

export interface StdioToolBrokerProtocolError {
	type: "tool_broker_error";
	requestId?: string;
	error: string;
}

type BrokerOutput = (message: StdioToolBrokerRequest | StdioToolBrokerCancel | StdioToolBrokerProtocolError) => void;

interface PendingRequest {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timeoutId: ReturnType<typeof setTimeout>;
	signal?: AbortSignal;
	onAbort?: () => void;
}

export interface StdioToolBrokerClientOptions {
	sessionNonce: string;
	requestTimeoutMillis?: number;
	maxRequestBytes?: number;
	maxResponseBytes?: number;
}

export class StdioToolBrokerClient {
	private readonly sessionNonce: string;
	private readonly requestTimeoutMillis: number;
	private readonly maxRequestBytes: number;
	private readonly maxResponseBytes: number;
	private readonly pending = new Map<string, PendingRequest>();
	private nextRequestId = 1;
	private output?: BrokerOutput;
	private disposed = false;

	constructor(options: StdioToolBrokerClientOptions) {
		if (!/^[a-zA-Z0-9_-]{16,256}$/.test(options.sessionNonce)) {
			throw new Error("Tool broker session nonce must contain 16-256 safe characters");
		}
		this.sessionNonce = options.sessionNonce;
		this.requestTimeoutMillis = options.requestTimeoutMillis ?? 30_000;
		this.maxRequestBytes = options.maxRequestBytes ?? 1024 * 1024;
		this.maxResponseBytes = options.maxResponseBytes ?? 4 * 1024 * 1024;
		if (this.requestTimeoutMillis <= 0 || this.maxRequestBytes <= 0 || this.maxResponseBytes <= 0) {
			throw new Error("Tool broker limits must be positive");
		}
	}

	bindOutput(output: BrokerOutput): () => void {
		if (this.disposed) throw new Error("Tool broker client is disposed");
		if (this.output) throw new Error("Tool broker output is already bound");
		this.output = output;
		return () => {
			if (this.output === output) this.output = undefined;
		};
	}

	request(
		tool: StdioToolBrokerTool,
		operation: string,
		argumentsValue: Record<string, unknown>,
		options?: { signal?: AbortSignal; timeoutMillis?: number },
	): Promise<unknown> {
		if (this.disposed) return Promise.reject(new Error("Tool broker client is disposed"));
		if (!this.output) return Promise.reject(new Error("Tool broker output is not bound"));
		if (!operation) return Promise.reject(new Error("Tool broker operation cannot be empty"));
		if (options?.signal?.aborted) return Promise.reject(new Error("aborted"));
		const timeoutMillis = options?.timeoutMillis ?? this.requestTimeoutMillis;
		if (!Number.isFinite(timeoutMillis) || timeoutMillis <= 0) {
			return Promise.reject(new Error("Tool broker timeout must be positive"));
		}
		const requestId = `tr-${this.nextRequestId++}`;
		const request: StdioToolBrokerRequest = {
			type: "tool_request",
			requestId,
			sessionNonce: this.sessionNonce,
			tool,
			operation,
			arguments: argumentsValue,
			deadlineMillis: Date.now() + timeoutMillis,
		};
		this.requireBounded(request, this.maxRequestBytes, "Tool broker request");

		return new Promise((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				if (!this.pending.delete(requestId)) return;
				this.output?.({
					type: "tool_cancel",
					requestId,
					sessionNonce: this.sessionNonce,
					reason: "timeout",
				});
				reject(new Error(`Tool broker request timed out: ${requestId}`));
			}, timeoutMillis);
			const pending: PendingRequest = { resolve, reject, timeoutId, signal: options?.signal };
			if (options?.signal) {
				pending.onAbort = () => {
					if (!this.pending.delete(requestId)) return;
					clearTimeout(timeoutId);
					this.output?.({
						type: "tool_cancel",
						requestId,
						sessionNonce: this.sessionNonce,
						reason: "aborted",
					});
					reject(new Error("aborted"));
				};
				options.signal.addEventListener("abort", pending.onAbort, { once: true });
			}
			this.pending.set(requestId, pending);
			try {
				this.output?.(request);
			} catch (error) {
				this.completePending(requestId);
				reject(error instanceof Error ? error : new Error(String(error)));
			}
		});
	}

	handleResponse(response: StdioToolBrokerResponse): void {
		if (response.sessionNonce !== this.sessionNonce) {
			throw new Error("Tool broker response session nonce mismatch");
		}
		this.requireBounded(response, this.maxResponseBytes, "Tool broker response");
		const pending = this.completePending(response.requestId);
		if (!pending) throw new Error(`Unknown or completed tool broker request: ${response.requestId}`);
		if (response.success) {
			pending.resolve(response.result);
			return;
		}
		pending.reject(new Error(response.error?.trim() || "Tool broker request failed"));
	}

	dispose(reason = "Tool broker client disposed"): void {
		if (this.disposed) return;
		this.disposed = true;
		for (const [requestId, pending] of this.pending) {
			this.output?.({
				type: "tool_cancel",
				requestId,
				sessionNonce: this.sessionNonce,
				reason: "disposed",
			});
			clearTimeout(pending.timeoutId);
			if (pending.signal && pending.onAbort) pending.signal.removeEventListener("abort", pending.onAbort);
			pending.reject(new Error(reason));
		}
		this.pending.clear();
		this.output = undefined;
	}

	private completePending(requestId: string): PendingRequest | undefined {
		const pending = this.pending.get(requestId);
		if (!pending) return undefined;
		this.pending.delete(requestId);
		clearTimeout(pending.timeoutId);
		if (pending.signal && pending.onAbort) pending.signal.removeEventListener("abort", pending.onAbort);
		return pending;
	}

	private requireBounded(value: unknown, limit: number, label: string): void {
		const bytes = Buffer.byteLength(JSON.stringify(value), "utf8");
		if (bytes > limit) throw new Error(`${label} exceeds ${limit} bytes`);
	}
}

export function createStdioToolBrokerTools(cwd: string, client: StdioToolBrokerClient): Record<string, AgentTool> {
	const workspacePath = (absolutePath: string): string => {
		const relativePath = relative(cwd, absolutePath);
		if (relativePath === "") return ".";
		if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
			throw new Error(`Tool broker path escapes workspace: ${absolutePath}`);
		}
		return relativePath.split(sep).join("/");
	};
	const expectObject = (value: unknown): Record<string, unknown> => {
		if (!value || typeof value !== "object" || Array.isArray(value)) {
			throw new Error("Tool broker returned an invalid result");
		}
		return value as Record<string, unknown>;
	};
	const decodeBuffer = (value: unknown): Buffer => {
		const result = expectObject(value);
		if (typeof result.base64 !== "string") throw new Error("Tool broker read result is missing base64");
		return Buffer.from(result.base64, "base64");
	};
	const requestPath = (tool: StdioToolBrokerTool, operation: string, path: string) =>
		client.request(tool, operation, { path: workspacePath(path) });

	return {
		read: createReadTool(cwd, {
			operations: {
				readFile: async (path) => decodeBuffer(await requestPath("read", "readFile", path)),
				access: async (path) => {
					await requestPath("read", "access", path);
				},
				detectImageMimeType: async (path) => {
					const result = expectObject(await requestPath("read", "detectImageMimeType", path));
					if (result.mimeType === null || result.mimeType === undefined) return null;
					if (typeof result.mimeType !== "string") throw new Error("Tool broker MIME result is invalid");
					return result.mimeType;
				},
			},
		}),
		bash: createBashTool(cwd, {
			operations: {
				exec: async (command, commandCwd, options) => {
					const timeoutMillis = options.timeout === undefined ? undefined : options.timeout * 1000;
					const result = expectObject(
						await client.request(
							"bash",
							"exec",
							{ command, cwd: workspacePath(commandCwd), timeoutSeconds: options.timeout },
							{ signal: options.signal, timeoutMillis },
						),
					);
					if (typeof result.output !== "string") throw new Error("Tool broker bash result is missing output");
					if (result.exitCode !== null && typeof result.exitCode !== "number") {
						throw new Error("Tool broker bash result has an invalid exit code");
					}
					if (result.output) options.onData(Buffer.from(result.output, "utf8"));
					return { exitCode: result.exitCode as number | null };
				},
			},
		}),
		edit: createEditTool(cwd, {
			operations: {
				readFile: async (path) => decodeBuffer(await requestPath("edit", "readFile", path)),
				writeFile: async (path, content) => {
					await client.request("edit", "writeFile", { path: workspacePath(path), content });
				},
				access: async (path) => {
					await requestPath("edit", "access", path);
				},
			},
		}),
		write: createWriteTool(cwd, {
			operations: {
				writeFile: async (path, content) => {
					await client.request("write", "writeFile", { path: workspacePath(path), content });
				},
				mkdir: async (path) => {
					await client.request("write", "mkdir", { path: workspacePath(path) });
				},
			},
		}),
	};
}
