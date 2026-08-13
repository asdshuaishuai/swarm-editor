package com.swarmeditor.backend.skill

import java.io.File
import kotlin.io.path.createTempDirectory
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest

class ProjectSkillTrustStoreTest {
    @Test
    fun `trust is bound to the current project fingerprint and survives reload`() = runTest {
        val directory = createTempDirectory("project-skill-trust-").toFile()
        try {
            val project = File(directory, "project").apply { mkdirs() }
            val file = File(directory, "trust.json")
            val store = ProjectSkillTrustStore(file)

            assertFalse(store.status(project, "fingerprint-a").trusted)
            store.trust(project, "fingerprint-a")
            assertTrue(store.status(project, "fingerprint-a").trusted)
            assertFalse(store.status(project, "fingerprint-b").trusted)

            val reloaded = ProjectSkillTrustStore(file).also { it.load() }
            assertTrue(reloaded.status(project, "fingerprint-a").trusted)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `revoke removes project skill trust`() = runTest {
        val directory = createTempDirectory("project-skill-revoke-").toFile()
        try {
            val project = File(directory, "project").apply { mkdirs() }
            val store = ProjectSkillTrustStore(File(directory, "trust.json"))

            store.trust(project, "fingerprint")
            store.revoke(project)

            assertFalse(store.status(project, "fingerprint").trusted)
        } finally {
            directory.deleteRecursively()
        }
    }
}
