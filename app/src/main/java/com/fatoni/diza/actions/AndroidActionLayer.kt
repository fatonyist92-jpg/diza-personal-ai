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

    fun execute(command: String): PhoneActionResult {
        val q = command.trim().lowercase()
        return when {
            q.startsWith("buka settings") || q.startsWith("buka pengaturan") ->
                if (launch(Intent(Settings.ACTION_SETTINGS))) PhoneActionResult.Done("Pengaturan dibuka")
                else PhoneActionResult.Unsupported("Pengaturan gagal dibuka")

            q.startsWith("buka wifi") ->
                if (launch(Intent(Settings.ACTION_WIFI_SETTINGS))) PhoneActionResult.Done("Pengaturan Wi-Fi dibuka")
                else PhoneActionResult.Unsupported("Wi-Fi settings gagal dibuka")

            q.startsWith("buka bluetooth") ->
                if (launch(Intent(Settings.ACTION_BLUETOOTH_SETTINGS))) PhoneActionResult.Done("Pengaturan Bluetooth dibuka")
                else PhoneActionResult.Unsupported("Bluetooth settings gagal dibuka")

            q.startsWith("buka kamera") ->
                if (launch(Intent("android.media.action.IMAGE_CAPTURE"))) PhoneActionResult.Done("Kamera dibuka")
                else PhoneActionResult.Unsupported("Kamera gagal dibuka")

            q.startsWith("buka whatsapp") ->
                if (launch(context.packageManager.getLaunchIntentForPackage("com.whatsapp") ?: Intent())) PhoneActionResult.Done("WhatsApp dibuka")
                else PhoneActionResult.Unsupported("WhatsApp tidak ditemukan")

            q.startsWith("buka youtube") ->
                if (launch(context.packageManager.getLaunchIntentForPackage("com.google.android.youtube") ?: Intent(Intent.ACTION_VIEW, Uri.parse("https://youtube.com")))) PhoneActionResult.Done("YouTube dibuka")
                else PhoneActionResult.Unsupported("YouTube gagal dibuka")

            q.startsWith("buka maps") || q.startsWith("buka google maps") ->
                if (launch(Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=")))) PhoneActionResult.Done("Maps dibuka")
                else PhoneActionResult.Unsupported("Maps gagal dibuka")

            q.startsWith("telepon ") || q.startsWith("telpon ") -> {
                val number = command.substringAfter(" ").filter { it.isDigit() || it == '+' }
                if (number.isBlank()) PhoneActionResult.Unsupported("Nomor telepon tidak ditemukan")
                else PhoneActionResult.NeedsConfirmation("Buka dialer untuk $number?") {
                    launch(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$number")))
                }
            }

            q.startsWith("cari ") -> {
                val query = command.substringAfter(" ").trim()
                if (query.isBlank()) PhoneActionResult.Unsupported("Kata pencarian kosong")
                else if (launch(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/search?q=" + Uri.encode(query))))) PhoneActionResult.Done("Pencarian dibuka")
                else PhoneActionResult.Unsupported("Browser gagal dibuka")
            }

            else -> PhoneActionResult.Unsupported("Perintah HP belum dikenali")
        }
    }
}
