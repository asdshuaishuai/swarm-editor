package com.swarmeditor.backend.acp

import com.swarmeditor.common.model.AgentConfig
import com.swarmeditor.common.model.AgentStatus
import com.swarmeditor.common.model.AgentType
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import java.io.BufferedWriter
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import java.lang.reflect.Field
import kotlin.reflect.full.memberProperties
import kotlin.reflect.jvm.isAccessible

class AcpConnectionTest {

    private fun testConfig() = AgentConfig(
        id = "test-agent",
        name = "Test Agent",
        command = "echo",
        agentType = AgentType.CLAUDE_CODE,
        timeout = 1
    )

    // --- Reflection helpers to inject private state ---

    private fun AcpConnection.setProcess(p: Process?) {
        val prop = AcpConnection::class.memberProperties.find { it.name == "process" }!!
        prop.isAccessible = true
        (prop as kotlin.reflect.KMutableProperty1<AcpConnection, Process?>).set(this, p)
    }

    private fun AcpConnection.setWriter(w: BufferedWriter?) {
        val prop = AcpConnection::class.memberProperties.find { it.name == "writer" }!!
        prop.isAccessible = true
        (prop as kotlin.reflect.KMutableProperty1<AcpConnection, BufferedWriter?>).set(this, w)
    }

    private fun AcpConnection.setStatus(s: AgentStatus) {
        // status has `private set`, use Java reflection to bypass
        val field: Field = AcpConnection::class.java.getDeclaredField("status")
        field.isAccessible = true
        field.set(this, s)
    }

    private fun AcpConnection.addNotificationHandler(handler: (com.swarmeditor.common.protocol.JsonRpcNotification) -> Unit) {
        val prop = AcpConnection::class.memberProperties.find { it.name == "notificationHandlers" }!!
        prop.isAccessible = true
        @Suppress("UNCHECKED_CAST")
        val list = prop.getter.call(this) as MutableList<(com.swarmeditor.common.protocol.JsonRpcNotification) -> Unit>
        list.add(handler)
    }

    private fun AcpConnection.getNotificationHandlersSize(): Int {
        val prop = AcpConnection::class.memberProperties.find { it.name == "notificationHandlers" }!!
        prop.isAccessible = true
        @Suppress("UNCHECKED_CAST")
        val list = prop.getter.call(this) as MutableList<*>
        return list.size
    }

    // --- Tests ---

    @Test
    fun `close - gracefully destroys alive process and waits for exit`() {
        val process = mockk<Process>(relaxed = true)
        every { process.isAlive } returns true
        every { process.waitFor(2000, TimeUnit.MILLISECONDS) } returns true

        val conn = AcpConnection("test", testConfig())
        conn.setStatus(AgentStatus.CONNECTED)
        conn.setProcess(process)

        conn.close()

        verify(exactly = 1) { process.destroy() }
        verify(exactly = 0) { process.destroyForcibly() }
        assertEquals(AgentStatus.DISCONNECTED, conn.status)
    }

    @Test
    fun `close - destroys forcibly when process does not exit in time`() {
        val process = mockk<Process>(relaxed = true)
        every { process.isAlive } returns true
        every { process.waitFor(2000, TimeUnit.MILLISECONDS) } returns false

        val conn = AcpConnection("test", testConfig())
        conn.setStatus(AgentStatus.CONNECTED)
        conn.setProcess(process)

        conn.close()

        verify(exactly = 1) { process.destroy() }
        verify(exactly = 1) { process.destroyForcibly() }
    }

    @Test
    fun `close - second call is idempotent and does not throw`() {
        val process = mockk<Process>(relaxed = true)
        every { process.isAlive } returns true
        every { process.waitFor(2000, TimeUnit.MILLISECONDS) } returns true

        val conn = AcpConnection("test", testConfig())
        conn.setStatus(AgentStatus.CONNECTED)
        conn.setProcess(process)

        conn.close()
        // Second close should be a no-op
        conn.close()

        // destroy should only be called once (from first close)
        verify(exactly = 1) { process.destroy() }
    }

    @Test
    fun `close - skips destroy when process is already dead`() {
        val process = mockk<Process>(relaxed = true)
        every { process.isAlive } returns false

        val conn = AcpConnection("test", testConfig())
        conn.setProcess(process)

        conn.close()

        verify(exactly = 0) { process.destroy() }
        verify(exactly = 0) { process.destroyForcibly() }
    }

    @Test
    fun `close - clears notification handlers`() {
        val conn = AcpConnection("test", testConfig())
        conn.addNotificationHandler { _ -> }
        conn.addNotificationHandler { _ -> }
        assertTrue(conn.getNotificationHandlersSize() >= 2)

        conn.close()

        assertEquals(0, conn.getNotificationHandlersSize())
    }

    @Test
    fun `close - transitions CONNECTED status to DISCONNECTED`() {
        val conn = AcpConnection("test", testConfig())
        conn.setStatus(AgentStatus.CONNECTED)

        conn.close()

        assertEquals(AgentStatus.DISCONNECTED, conn.status)
    }

    @Test
    fun `close - does not change status when already DISCONNECTED`() {
        val conn = AcpConnection("test", testConfig())
        conn.setStatus(AgentStatus.DISCONNECTED)

        conn.close()

        assertEquals(AgentStatus.DISCONNECTED, conn.status)
    }

    @Test
    fun `close - closes writer without throwing`() {
        val writer = mockk<BufferedWriter>(relaxed = true)
        val conn = AcpConnection("test", testConfig())
        conn.setWriter(writer)

        conn.close()

        verify { writer.close() }
    }
}
