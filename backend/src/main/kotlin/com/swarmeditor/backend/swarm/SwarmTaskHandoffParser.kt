package com.swarmeditor.backend.swarm

import com.swarmeditor.common.model.SwarmTaskHandoff
import com.swarmeditor.common.model.SwarmTaskHandoffStatus

internal fun parseSwarmTaskHandoff(output: String): SwarmTaskHandoff {
    val sections = HandoffSection.entries.associateWith { StringBuilder() }.toMutableMap()
    val preamble = StringBuilder()
    var currentSection: HandoffSection? = null
    var recognizedHeadings = 0
    var activeFence: String? = null
    output.lineSequence().forEach { line ->
        val fence = fenceMarker(line)
        if (fence != null) {
            val target = currentSection?.let(sections::getValue) ?: preamble
            if (target.isNotEmpty()) target.appendLine()
            target.append(line)
            activeFence = if (activeFence == null) fence else if (activeFence == fence) null else activeFence
            return@forEach
        }
        val heading = if (activeFence == null) parseHeading(line) else null
        if (heading != null) {
            currentSection = heading
            recognizedHeadings += 1
        } else {
            val target = currentSection?.let(sections::getValue) ?: preamble
            if (target.isNotEmpty()) target.appendLine()
            target.append(line)
        }
    }
    if (recognizedHeadings == 0) {
        return SwarmTaskHandoff(
            outcome = boundedSection(output.trim()),
            status = SwarmTaskHandoffStatus.UNSTRUCTURED,
            missingSections = HandoffSection.entries.map(HandoffSection::canonicalName),
        )
    }
    val values = sections.mapValues { (_, content) -> boundedSection(content.toString().trim()) }.toMutableMap()
    preamble.toString().trim().takeIf(String::isNotBlank)?.let { prefix ->
        values[HandoffSection.OUTCOME] = listOf(prefix, values.getValue(HandoffSection.OUTCOME))
            .filter(String::isNotBlank)
            .joinToString("\n\n")
    }
    val missingSections = HandoffSection.entries
        .filter { section -> values.getValue(section).isBlank() }
        .map(HandoffSection::canonicalName)
    return SwarmTaskHandoff(
        outcome = values.getValue(HandoffSection.OUTCOME),
        evidence = values.getValue(HandoffSection.EVIDENCE),
        changes = values.getValue(HandoffSection.CHANGES),
        verification = values.getValue(HandoffSection.VERIFICATION),
        residualRisk = values.getValue(HandoffSection.RESIDUAL_RISK),
        downstreamHandoff = values.getValue(HandoffSection.DOWNSTREAM_HANDOFF),
        status = if (missingSections.isEmpty()) SwarmTaskHandoffStatus.COMPLETE else SwarmTaskHandoffStatus.PARTIAL,
        missingSections = missingSections,
    )
}

private fun fenceMarker(line: String): String? = when {
    line.trimStart().startsWith("```") -> "```"
    line.trimStart().startsWith("~~~") -> "~~~"
    else -> null
}

private fun parseHeading(line: String): HandoffSection? {
    val normalized = line.trim()
        .replaceFirst(markdownHeadingPrefix, "")
        .trim()
        .trim('*', '_', '`', ' ')
        .removeSuffix(":")
        .removeSuffix("：")
        .trim()
        .lowercase()
    return headingAliases[normalized]
}

private fun boundedSection(value: String): String {
    if (value.length <= MAX_HANDOFF_SECTION_CHARS) return value
    return value.take(MAX_HANDOFF_SECTION_CHARS) +
        "\n[truncated: ${value.length - MAX_HANDOFF_SECTION_CHARS} additional characters omitted]"
}

private enum class HandoffSection(val canonicalName: String) {
    OUTCOME("Outcome"),
    EVIDENCE("Evidence"),
    CHANGES("Changes"),
    VERIFICATION("Verification"),
    RESIDUAL_RISK("Residual Risk"),
    DOWNSTREAM_HANDOFF("Downstream Handoff"),
}

private val headingAliases = buildMap {
    put("outcome", HandoffSection.OUTCOME)
    put("result", HandoffSection.OUTCOME)
    put("结果", HandoffSection.OUTCOME)
    put("结论", HandoffSection.OUTCOME)
    put("evidence", HandoffSection.EVIDENCE)
    put("证据", HandoffSection.EVIDENCE)
    put("changes", HandoffSection.CHANGES)
    put("change", HandoffSection.CHANGES)
    put("变更", HandoffSection.CHANGES)
    put("修改", HandoffSection.CHANGES)
    put("verification", HandoffSection.VERIFICATION)
    put("验证", HandoffSection.VERIFICATION)
    put("residual risk", HandoffSection.RESIDUAL_RISK)
    put("residual risks", HandoffSection.RESIDUAL_RISK)
    put("remaining risk", HandoffSection.RESIDUAL_RISK)
    put("剩余风险", HandoffSection.RESIDUAL_RISK)
    put("残余风险", HandoffSection.RESIDUAL_RISK)
    put("downstream handoff", HandoffSection.DOWNSTREAM_HANDOFF)
    put("handoff", HandoffSection.DOWNSTREAM_HANDOFF)
    put("下游交付", HandoffSection.DOWNSTREAM_HANDOFF)
    put("交付", HandoffSection.DOWNSTREAM_HANDOFF)
}

private val markdownHeadingPrefix = Regex("^#{1,6}\\s*")
private const val MAX_HANDOFF_SECTION_CHARS = 12_000
