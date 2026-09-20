package com.fatoni.diza.actions

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings

sealed class PhoneActionResult {
    data class Done(val message: String): PhoneActionResult()
    data class NeedsConfirmation(val message: String, val action: () -> Unit): PhoneActionResult()
    data class Unsupported(val message: String): PhoneActionResult()
}

class AndroidActionLayer(private val context: Context) {
    private fun launch(intent: Intent): Boolean = runCatching {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        true
    }.getOrDefault(false)

    private fun openChatGptLive(): PhoneActionResult {
        if (!DizaAccessibilityService.isEnabled(context)) {
            launch(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            return PhoneActionResult.Done(
                "Aktifkan layanan Kontrol Diza, lalu ucapkan buka GPT Live sekali lagi"
            )
        }

        val chatGpt = context.packageManager.getLaunchIntentForPackage(CHATGPT_PACKAGE)
            ?: return PhoneActionResult.Unsupported("Aplikasi ChatGPT tidak ditemukan")

        DizaAccessibilityService.queueChatGptVoice(context)
        return if (launch(chatGpt)) {
            PhoneActionResult.Done("ChatGPT dibuka, Diza menyalakan Live Voice")
        } else {
            PhoneActionResult.Unsupported("ChatGPT gagal dibuka")
        }
    }

    private fun normalize(command: String): String =
        command.trim().lowercase()
            .replace("what's up", "whatsapp")
            .replace("what up", "whatsapp")
            .replace("chat gpt", "chatgpt")
            .replace(Regex("[^a-z0-9+ ]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()

    private fun hasAny(q: String, vararg words: String): Boolean =
        words.any { q.contains(it) }

    private fun wantsOpen(q: String): Boolean =
        hasAny(q, "buka", "bukain", "bukaan", "open", "aktifkan", "nyalakan")

    private fun commandScore(command: String): Int {
        val q = normalize(command)
        return when {
            hasAny(q, "chatgpt", "gpt") && hasAny(q, "live", "voice", "suara") -> 100
            hasAny(q, "whatsapp", "watsap", "wasap") || Regex("\\bwa\\b").containsMatchIn(q) -> 95
            hasAny(q, "youtube", "you tube", "yutub") -> 90
            hasAny(q, "google maps", "maps", "map") -> 88
            hasAny(q, "kamera", "camera") -> 86
            hasAny(q, "bluetooth", "blutut", "blue tooth") -> 84
            hasAny(q, "wifi", "wi fi", "wireless") -> 82
            hasAny(q, "settings", "setting", "pengaturan") -> 80
            hasAny(q, "telepon", "telpon", "telefon", "call") -> 78
            hasAny(q, "cari", "search", "google") -> 70
            else -> 0
        }
    }

    fun pickBest(candidates: List<String>): String {
        if (candidates.isEmpty()) return ""
        val best = candidates.maxByOrNull(::commandScore).orEmpty()
        return if (commandScore(best) > 0) best else candidates.first()
    }

    fun execute(command: String): PhoneActionResult {
        val q = normalize(command)
        return when {
            (q.contains("gpt") || q.contains("chat gpt") || q.contains("chatgpt")) &&
                (q.contains("live") || q.contains("voice") || q.contains("suara")) ->
                openChatGptLive()

            wantsOpen(q) && hasAny(q, "settings", "setting", "pengaturan") ->
                if (launch(Intent(Settings.ACTION_SETTINGS))) PhoneActionResult.Done("Pengaturan dibuka")
                else PhoneActionResult.Unsupported("Pengaturan gagal dibuka")

            wantsOpen(q) && hasAny(q, "wifi", "wi fi", "wireless") ->
                if (launch(Intent(Settings.ACTION_WIFI_SETTINGS))) PhoneActionResult.Done("Pengaturan Wi-Fi dibuka")
                else PhoneActionResult.Unsupported("Wi-Fi settings gagal dibuka")

            wantsOpen(q) && hasAny(q, "bluetooth", "blutut", "blue tooth") ->
                if (launch(Intent(Settings.ACTION_BLUETOOTH_SETTINGS))) PhoneActionResult.Done("Pengaturan Bluetooth dibuka")
                else PhoneActionResult.Unsupported("Bluetooth settings gagal dibuka")

            wantsOpen(q) && hasAny(q, "kamera", "camera") ->
                if (launch(Intent("android.media.action.IMAGE_CAPTURE"))) PhoneActionResult.Done("Kamera dibuka")
                else PhoneActionResult.Unsupported("Kamera gagal dibuka")

            wantsOpen(q) &&
                (hasAny(q, "whatsapp", "watsap", "wasap") || Regex("\\bwa\\b").containsMatchIn(q)) ->
                if (launch(context.packageManager.getLaunchIntentForPackage("com.whatsapp") ?: Intent())) PhoneActionResult.Done("WhatsApp dibuka")
                else PhoneActionResult.Unsupported("WhatsApp tidak ditemukan")

            wantsOpen(q) && hasAny(q, "youtube", "you tube", "yutub") ->
                if (launch(context.packageManager.getLaunchIntentForPackage("com.google.android.youtube") ?: Intent(Intent.ACTION_VIEW, Uri.parse("https://youtube.com")))) PhoneActionResult.Done("YouTube dibuka")
                else PhoneActionResult.Unsupported("YouTube gagal dibuka")

            wantsOpen(q) && hasAny(q, "google maps", "maps", "map") ->
                if (launch(Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=")))) PhoneActionResult.Done("Maps dibuka")
                else PhoneActionResult.Unsupported("Maps gagal dibuka")

            hasAny(q, "telepon ", "telpon ", "telefon ", "call ") -> {
                val number = command.substringAfter(" ").filter { it.isDigit() || it == '+' }
                if (number.isBlank()) PhoneActionResult.Unsupported("Nomor telepon tidak ditemukan")
                else PhoneActionResult.NeedsConfirmation("Buka dialer untuk $number?") {
                    launch(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$number")))
                }
            }

            hasAny(q, "cari ", "search ", "google ") -> {
                val query = command.substringAfter(" ").trim()
                if (query.isBlank()) PhoneActionResult.Unsupported("Kata pencarian kosong")
                else if (launch(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/search?q=" + Uri.encode(query))))) PhoneActionResult.Done("Pencarian dibuka")
                else PhoneActionResult.Unsupported("Browser gagal dibuka")
            }

            else -> PhoneActionResult.Unsupported("Perintah HP belum dikenali")
        }
    }

    private companion object {
        const val CHATGPT_PACKAGE = "com.openai.chatgpt"
    }
}
