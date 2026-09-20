package com.fatoni.diza.actions

import android.content.Context
import android.content.Intent

object ChatGptHandoff {
    fun send(context: Context, prompt: String): Boolean {
        if (prompt.isBlank()) return false
        val launch = context.packageManager.getLaunchIntentForPackage("com.openai.chatgpt") ?: return false
        context.getSharedPreferences("diza_chatgpt_handoff", Context.MODE_PRIVATE)
            .edit().putString("last_prompt", prompt.trim()).apply()
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
        clipboard.setPrimaryClip(android.content.ClipData.newPlainText("Diza prompt", prompt.trim()))
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(launch)
        return true
    }
}
