package com.swarmeditor.backend

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runTest

class BackendShutdownTest {
    @Test
    fun `shutdown releases every backend resource when its caller is canceled`() = runTest {
        val swarmCancellationStarted = CompletableDeferred<Unit>()
        val allowSwarmCancellation = CompletableDeferred<Unit>()
        val events = mutableListOf<String>()

        val shutdown = async {
            shutdownResources(
                cancelSwarm = {
                    swarmCancellationStarted.complete(Unit)
                    allowSwarmCancellation.await()
                    events += "swarm"
                },
                cancelSwarmScope = { events += "scope" },
                closeLsp = { events += "lsp" },
                shutdownPi = { events += "pi" },
            )
        }
        swarmCancellationStarted.await()
        shutdown.cancel()
        allowSwarmCancellation.complete(Unit)

        assertFailsWith<CancellationException> { shutdown.await() }
        assertEquals(listOf("swarm", "scope", "lsp", "pi"), events)
    }

    @Test
    fun `shutdown attempts every resource and retains all failures`() = runTest {
        val failure = assertFailsWith<IllegalStateException> {
            shutdownResources(
                cancelSwarm = { error("swarm failed") },
                cancelSwarmScope = { error("scope failed") },
                closeLsp = { error("lsp failed") },
                shutdownPi = { error("pi failed") },
            )
        }

        assertEquals("swarm failed", failure.message)
        assertEquals(
            listOf("scope failed", "lsp failed", "pi failed"),
            failure.suppressed.map { it.message },
        )
    }
}
