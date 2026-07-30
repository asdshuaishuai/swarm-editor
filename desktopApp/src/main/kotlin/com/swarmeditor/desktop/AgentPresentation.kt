package com.swarmeditor.desktop

const val PRIMARY_AGENT_ID = "pi-default"
const val PRIMARY_AGENT_NAME = "主智能体"

fun agentDisplayName(agentId: String): String = if (agentId == PRIMARY_AGENT_ID) PRIMARY_AGENT_NAME else "智能体"
