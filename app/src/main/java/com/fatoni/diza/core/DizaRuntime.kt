package com.fatoni.diza.core

enum class DizaSurface { PHONE, TABLET_DESKTOP, SMART_GLASSES, SECOND_SCREEN, CAR, INDUSTRIAL_PANEL, AR }
enum class PrivateLevel { OFF, FLIRTY, ROMANTIC, SPICY }

data class PermissionState(
    val microphone: Boolean = false,
    val camera: Boolean = false,
    val files: Boolean = false,
    val notifications: Boolean = false
)

data class DizaRuntime(
    val surface: DizaSurface = DizaSurface.PHONE,
    val privateLevel: PrivateLevel = PrivateLevel.OFF,
    val permissions: PermissionState = PermissionState(),
    val activeProject: String? = null,
    val working: Boolean = false,
    val presenting: Boolean = false
)

class FeatureFlags {
    private val values = mutableMapOf(
        "dynamicPresentation" to true,
        "workingMode" to true,
        "localMemory" to true,
        "privateScene" to false,
        "androidActions" to false,
        "cloudBrain" to false
    )
    fun enabled(name: String) = values[name] == true
    fun set(name: String, enabled: Boolean) { values[name] = enabled }
    fun snapshot() = values.toMap()
}

class RegressionGuard {
    private val checks = linkedMapOf<String, Boolean>()
    fun report(name: String, passed: Boolean) { checks[name] = passed }
    fun healthy() = checks.values.all { it }
    fun snapshot() = checks.toMap()
}

class CostGovernor {
    var cloudCalls: Int = 0
        private set
    fun recordCloudCall() { cloudCalls++ }
    fun preferLocal() = true
}
