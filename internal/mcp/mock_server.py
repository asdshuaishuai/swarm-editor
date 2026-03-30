#!/usr/bin/env python3
"""
Mock MCP Server for testing.
This script acts as a simple JSON-RPC server that responds to MCP requests.
"""

import sys
import json

def handle_request(line):
    """Handle a single JSON-RPC request"""
    try:
        msg = json.loads(line)
        method = msg.get("method", "")
        req_id = msg.get("id")

        if method == "initialize":
            return json.dumps({
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {
                        "tools": {"listChanged": False},
                        "resources": {},
                        "prompts": {}
                    },
                    "serverInfo": {
                        "name": "mock-mcp-server",
                        "version": "1.0.0"
                    }
                }
            })

        elif method == "tools/list":
            return json.dumps({
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "tools": [{
                        "name": "test_tool",
                        "description": "A test tool",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "input": {
                                    "type": "string",
                                    "description": "Input parameter"
                                }
                            },
                            "required": ["input"]
                        }
                    }]
                }
            })

        elif method == "tools/call":
            return json.dumps({
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [{
                        "type": "text",
                        "text": "Mock tool result: executed successfully"
                    }],
                    "isError": False
                }
            })

        elif method == "ping":
            return json.dumps({
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {}
            })

        elif method == "notifications/initialized":
            # Notification, no response needed
            return None

        elif method == "resources/list":
            return json.dumps({
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {"resources": []}
            })

        elif method == "resources/read":
            return json.dumps({
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [{
                        "type": "text",
                        "text": "Mock resource content"
                    }]
                }
            })

        elif method == "prompts/list":
            return json.dumps({
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {"prompts": []}
            })

        elif method == "prompts/get":
            return json.dumps({
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [{
                        "type": "text",
                        "text": "Mock prompt content"
                    }]
                }
            })

        else:
            # Unknown method - return empty result for requests
            if req_id is not None:
                return json.dumps({
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {}
                })
            return None

    except json.JSONDecodeError:
        return None
    except Exception:
        return None

def main():
    """Main loop: read JSON-RPC requests line by line"""
    # Line-buffered output
    sys.stdout.reconfigure(line_buffering=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        response = handle_request(line)
        if response:
            print(response)
            sys.stdout.flush()

if __name__ == "__main__":
    main()
