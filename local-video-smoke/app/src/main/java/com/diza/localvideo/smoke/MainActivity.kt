package com.diza.localvideo.smoke

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest

class MainActivity : Activity() {
    private lateinit var status: TextView
    private lateinit var importButton: Button
    private lateinit var cpuButton: Button
    private lateinit var openClButton: Button
    private lateinit var vulkanButton: Button
    private val modelDir by lazy { File(filesDir, "models/phantom").apply { mkdirs() } }

    companion object {
        private const val PICK_MODELS = 41
        private val EXPECTED = mapOf(
            "transformer.mnn" to Pair(1433184L, "934a20b6d46db253376dded722097f0bdd9cb052ff9836d9e73d7969c8e880ec"),
            "transformer.mnn.weight" to Pair(1602075690L, "724935c8cfd58e220d9c0d0309ff41718a920efbe2e33708100c6ff126b05274")
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(36, 48, 36, 48)
            setBackgroundColor(Color.rgb(13, 13, 15))
        }
        val title = TextView(this).apply {
            text = "DIZA Local Video · MNN Smoke"
            textSize = 24f
            setTextColor(Color.WHITE)
        }
        val subtitle = TextView(this).apply {
            text = "Gate: load + forward Phantom transformer MNN INT8 di Android. Tidak ada cloud, login, audio, atau INTERNET permission."
            textSize = 14f
            setTextColor(Color.LTGRAY)
            setPadding(0, 12, 0, 28)
        }
        importButton = button("1. Import transformer smoke pack") { pickModels() }
        cpuButton = button("2. Test CPU") { runSmoke(0) }
        openClButton = button("3. Test OpenCL GPU") { runSmoke(1) }
        vulkanButton = button("4. Test Vulkan GPU") { runSmoke(2) }
        status = TextView(this).apply {
            textSize = 14f
            setTextColor(Color.WHITE)
            setPadding(0, 28, 0, 0)
            setTextIsSelectable(true)
        }
        root.addView(title)
        root.addView(subtitle)
        root.addView(importButton)
        root.addView(cpuButton)
        root.addView(openClButton)
        root.addView(vulkanButton)
        root.addView(status)
        setContentView(ScrollView(this).apply { addView(root) })
        refreshStatus()
    }

    private fun button(label: String, action: () -> Unit) = Button(this).apply {
        text = label
        isAllCaps = false
        setOnClickListener { action() }
        val p = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        p.setMargins(0, 8, 0, 8)
        layoutParams = p
        gravity = Gravity.CENTER
    }

    private fun pickModels() {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        }
        startActivityForResult(intent, PICK_MODELS)
    }

    @Deprecated("Legacy picker is intentional for a dependency-free smoke APK")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != PICK_MODELS || resultCode != RESULT_OK || data == null) return
        val uris = mutableListOf<Uri>()
        data.clipData?.let { clip -> for (i in 0 until clip.itemCount) uris += clip.getItemAt(i).uri }
        data.data?.let { if (it !in uris) uris += it }
        setBusy(true, "Mengimpor dan verifikasi SHA-256…")
        Thread {
            val result = runCatching { importExactPack(uris) }
            runOnUiThread {
                setBusy(false, result.fold({ it }, { "FAIL import: ${it.message}" }))
                refreshStatus(append = true)
            }
        }.start()
    }

    private fun importExactPack(uris: List<Uri>): String {
        require(uris.size == 2) { "Pilih tepat 2 file sekaligus: transformer.mnn dan transformer.mnn.weight" }
        val byName = uris.associateBy { displayName(it) }
        require(byName.keys.containsAll(EXPECTED.keys)) { "Nama file harus persis transformer.mnn + transformer.mnn.weight" }
        val staging = File(filesDir, "models/importing").apply { deleteRecursively(); mkdirs() }
        try {
            for ((name, spec) in EXPECTED) {
                val uri = requireNotNull(byName[name])
                val out = File(staging, name)
                val digest = MessageDigest.getInstance("SHA-256")
                var copied = 0L
                contentResolver.openInputStream(uri).use { input ->
                    requireNotNull(input) { "Tidak bisa membuka $name" }
                    FileOutputStream(out).use { output ->
                        val buf = ByteArray(8 * 1024 * 1024)
                        while (true) {
                            val n = input.read(buf)
                            if (n < 0) break
                            if (n == 0) continue
                            output.write(buf, 0, n)
                            digest.update(buf, 0, n)
                            copied += n
                        }
                        output.fd.sync()
                    }
                }
                require(copied == spec.first) { "Ukuran $name salah: $copied != ${spec.first}" }
                val sha = digest.digest().joinToString("") { "%02x".format(it) }
                require(sha == spec.second) { "SHA-256 $name tidak cocok dengan Release #7" }
            }
            for (name in EXPECTED.keys) {
                val target = File(modelDir, name)
                if (target.exists()) target.delete()
                require(File(staging, name).renameTo(target)) { "Gagal mengaktifkan $name" }
            }
            return "PASS import: exact Release #7 terverifikasi."
        } finally {
            staging.deleteRecursively()
        }
    }

    private fun displayName(uri: Uri): String {
        contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) {
                val i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (i >= 0) return c.getString(i)
            }
        }
        return uri.lastPathSegment ?: ""
    }

    private fun runSmoke(backend: Int) {
        setBusy(true, "Menjalankan native forward. Jangan tutup app…")
        Thread {
            val result = runCatching { DizaNative.smoke(modelDir.absolutePath, backend) }
                .getOrElse { JSONObject().put("ok", false).put("stage", "jni").put("error", it.message).toString() }
            runOnUiThread { setBusy(false, pretty(result)) }
        }.start()
    }

    private fun pretty(raw: String): String = runCatching { JSONObject(raw).toString(2) }.getOrDefault(raw)

    private fun refreshStatus(append: Boolean = false) {
        val s = runCatching { pretty(DizaNative.status(modelDir.absolutePath)) }.getOrElse { "JNI status FAIL: ${it.message}" }
        status.text = if (append) status.text.toString() + "\n\nEngine status:\n" + s else "Engine status:\n$s"
    }

    private fun setBusy(busy: Boolean, message: String) {
        importButton.isEnabled = !busy
        cpuButton.isEnabled = !busy
        openClButton.isEnabled = !busy
        vulkanButton.isEnabled = !busy
        status.text = message
    }
}
