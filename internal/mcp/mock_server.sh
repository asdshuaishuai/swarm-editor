#!/bin/bash
# Mock MCP Server for testing
# This script acts as a simple JSON-RPC server that responds to MCP requests

# Process JSON-RPC requests line by line
while IFS= read -r line; do
    # Skip empty lines
    [[ -z "$line" ]] && continue

    # Extract the method using a simple pattern match
    if [[ "$line" =~ '"method":"([^"]+)"' ]]; then
        method="${BASH_REMATCH[1]}"

        # Extract the request ID (number only for simplicity)
        if [[ "$line" =~ '"id":([0-9]+)' ]]; then
            req_id="${BASH_REMATCH[1]}"
        else
            req_id=""
        fi

        case "$method" in
            "initialize")
                cat <<INITRESP
{"jsonrpc":"2.0","id":$req_id,"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{"listChanged":false},"resources":{},"prompts":{}},"serverInfo":{"name":"mock-mcp-server","version":"1.0.0"}}}
INITRESP
                ;;
            "tools/list")
                cat <<TOOLSLIST
{"jsonrpc":"2.0","id":$req_id,"result":{"tools":[{"name":"test_tool","description":"A test tool","inputSchema":{"type":"object","properties":{"input":{"type":"string","description":"Input parameter"}},"required":["input"]}}]}}
TOOLSLIST
                ;;
            "tools/call")
                cat <<TOOLCALL
{"jsonrpc":"2.0","id":$req_id,"result":{"content":[{"type":"text","text":"Mock tool result: executed successfully"}],"isError":false}}
TOOLCALL
                ;;
            "ping")
                cat <<PINGRESP
{"jsonrpc":"2.0","id":$req_id,"result":{}}
PINGRESP
                ;;
            "notifications/initialized")
                # Notification, no response needed
                :
                ;;
            *)
                # Unknown method - return empty result for requests, ignore notifications
                if [[ -n "$req_id" ]]; then
                    cat <<DEFAULTRESP
{"jsonrpc":"2.0","id":$req_id,"result":{}}
DEFAULTRESP
                fi
                ;;
        esac
    fi
done
