package com.fatoni.diza.core

enum class DizaWorld {
    PERSONAL, WORK, PRESENTATION, ENTERTAINMENT, LIFESTYLE, TRAVEL, LEARNING, PRIVATE_ROMANCE
}

enum class DizaCapability {
    VOICE, CHAT, ATTACHMENTS, PRESENTATION, WORKING_MODE, LOCAL_MEMORY,
    TASKS, AUTOMATION, PERSONAL_SEARCH, KNOWLEDGE_VAULT, PEOPLE_HUB,
    MEETING_COPILOT, COMMAND_CENTER, DECISION_JOURNAL, PROJECT_TIME_MACHINE,
    WHAT_IF_ENGINE, FINANCE_COCKPIT, COST_GOVERNOR, SALES_COPILOT,
    NEGOTIATION_WORKSPACE, DOCUMENT_FACTORY, LEARNING_ENGINE, IDEA_INCUBATOR,
    RESEARCH_NOTEBOOK, FAILURE_MEMORY, REGRESSION_GUARD, FEATURE_FLAGS,
    SELF_DIAGNOSTICS, PERMISSION_BRAIN, MULTI_DEVICE, NOTIFICATION_INTELLIGENCE,
    DAILY_BRIEFING, GOAL_ENGINE, PRIVATE_SCENE
}

data class DizaProfile(
    val world: DizaWorld = DizaWorld.PERSONAL,
    val privateModeUnlocked: Boolean = false,
    val enabled: Set<DizaCapability> = DizaCapability.entries.toSet()
)

class DizaDirector {
    fun route(input: String, profile: DizaProfile): DizaWorld {
        val q = input.lowercase()
        return when {
            profile.privateModeUnlocked && listOf("private", "romantis", "spicy").any(q::contains) -> DizaWorld.PRIVATE_ROMANCE
            listOf("presentasi", "slide", "tampilkan", "chart").any(q::contains) -> DizaWorld.PRESENTATION
            listOf("kerja", "build", "deploy", "project", "meeting", "client").any(q::contains) -> DizaWorld.WORK
            listOf("belajar", "jelaskan", "ajari", "riset").any(q::contains) -> DizaWorld.LEARNING
            listOf("travel", "hotel", "jalan", "trip").any(q::contains) -> DizaWorld.TRAVEL
            listOf("film", "musik", "game", "hiburan").any(q::contains) -> DizaWorld.ENTERTAINMENT
            listOf("fitness", "masak", "tidur", "lifestyle").any(q::contains) -> DizaWorld.LIFESTYLE
            else -> profile.world
        }
    }
}

class CapabilityRegistry(private val profile: DizaProfile) {
    fun has(capability: DizaCapability) = capability in profile.enabled
    fun all() = profile.enabled
}

data class DizaTask(val title: String, val done: Boolean = false)
data class DizaMemory(val key: String, val value: String)

class LocalDizaStore {
    private val memories = mutableListOf<DizaMemory>()
    private val tasks = mutableListOf<DizaTask>()
    private val failures = mutableListOf<String>()

    fun remember(key: String, value: String) { memories.removeAll { it.key == key }; memories += DizaMemory(key, value) }
    fun recall(key: String) = memories.lastOrNull { it.key == key }?.value
    fun addTask(title: String) { tasks += DizaTask(title) }
    fun tasks() = tasks.toList()
    fun recordFailure(value: String) { failures += value }
    fun failures() = failures.toList()
}
