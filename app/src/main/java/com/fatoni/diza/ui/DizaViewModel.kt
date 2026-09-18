package com.fatoni.diza.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel

data class ChatLine(val who: String, val text: String)

class DizaViewModel : ViewModel() {
    var avatarState by mutableStateOf("idle")
    var messages by mutableStateOf(listOf<ChatLine>())
        private set

    var lastError by mutableStateOf("")
        private set

    fun addUserTranscript(text: String) {
        if (text.isBlank()) return
        messages = messages + ChatLine("Fatoni", text.trim())
    }

    fun addAssistantTranscript(text: String) {
        if (text.isBlank()) return
        messages = messages + ChatLine("Diza", text.trim())
    }

    fun setError(message: String) {
        lastError = message
        avatarState = "idle"
    }

    fun clearError() {
        lastError = ""
    }
}
