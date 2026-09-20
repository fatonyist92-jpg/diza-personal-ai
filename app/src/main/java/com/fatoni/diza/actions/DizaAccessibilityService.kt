package com.fatoni.diza.actions

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.ComponentName
import android.content.Context
import android.graphics.Path
import android.graphics.Rect
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class DizaAccessibilityService : AccessibilityService() {
    private val handler = Handler(Looper.getMainLooper())
    private var scheduled = false

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event?.packageName?.toString() != CHATGPT_PACKAGE) return
        ChatGptBridge.pendingPrompt(this)?.let { prompt ->
            val root = rootInActiveWindow ?: return
            if (ChatGptBridge.setTextAndSend(root, prompt)) {
                ChatGptBridge.clearPrompt(this)
                handler.postDelayed({ captureBridgeResult() }, 2500L)
                handler.postDelayed({ captureBridgeResult() }, 5000L)
            }
            return
        }
        captureBridgeResult()
        if (!hasPendingRequest()) return
        if (scheduled) return
        scheduled = true

        listOf(350L, 850L, 1500L, 2400L).forEach { delay ->
            handler.postDelayed({
                if (hasPendingRequest() && clickVoiceButton()) {
                    clearPendingRequest()
                }
            }, delay)
        }

        handler.postDelayed({
            if (hasPendingRequest()) {
                tapVoiceFallback()
                clearPendingRequest()
            }
            scheduled = false
        }, 3300L)
    }

    override fun onInterrupt() = Unit

    private fun captureBridgeResult() {
        val root = rootInActiveWindow ?: return
        val text = ChatGptBridge.readLargestText(root)
        if (text.isNotBlank()) ChatGptBridge.publishResult(this, text)
    }

    private fun hasPendingRequest(): Boolean {
        val until = getSharedPreferences(PREFS, MODE_PRIVATE).getLong(KEY_PENDING_UNTIL, 0L)
        return until > System.currentTimeMillis()
    }

    private fun clearPendingRequest() {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().remove(KEY_PENDING_UNTIL).apply()
    }

    private fun clickVoiceButton(): Boolean {
        val root = rootInActiveWindow ?: return false
        val match = findVoiceNode(root) ?: return false
        var target: AccessibilityNodeInfo? = match
        while (target != null && !target.isClickable) target = target.parent
        return target?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true
    }

    private fun findVoiceNode(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        val label = listOfNotNull(node.contentDescription, node.text)
            .joinToString(" ")
            .lowercase()
        val voiceLabel = VOICE_LABELS.any { label.contains(it) }
        if (voiceLabel && (node.isClickable || node.parent?.isClickable == true)) return node

        for (index in 0 until node.childCount) {
            val child = node.getChild(index) ?: continue
            val found = findVoiceNode(child)
            if (found != null) return found
        }
        return null
    }

    private fun tapVoiceFallback() {
        val root = rootInActiveWindow ?: return
        val bounds = Rect()
        root.getBoundsInScreen(bounds)
        if (bounds.width() <= 0 || bounds.height() <= 0) return

        val path = Path().apply {
            moveTo(
                bounds.left + bounds.width() * 0.90f,
                bounds.top + bounds.height() * 0.91f
            )
        }
        dispatchGesture(
            GestureDescription.Builder()
                .addStroke(GestureDescription.StrokeDescription(path, 0L, 80L))
                .build(),
            null,
            null
        )
    }

    companion object {
        private const val CHATGPT_PACKAGE = "com.openai.chatgpt"
        private const val PREFS = "diza_accessibility"
        private const val KEY_PENDING_UNTIL = "pending_chatgpt_voice_until"
        private val VOICE_LABELS = listOf(
            "voice mode",
            "start voice",
            "mulai voice",
            "percakapan suara",
            "mode suara",
            "headphone"
        )

        fun queueChatGptVoice(context: Context) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putLong(KEY_PENDING_UNTIL, System.currentTimeMillis() + 15_000L)
                .apply()
        }

        fun isEnabled(context: Context): Boolean {
            val expected = ComponentName(context, DizaAccessibilityService::class.java)
            val enabled = Settings.Secure.getString(
                context.contentResolver,
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            ).orEmpty()

            return enabled.split(':').any {
                runCatching { ComponentName.unflattenFromString(it) }
                    .getOrNull() == expected
            }
        }
    }
}
