package com.diza.localvideo.smoke

import android.app.Activity
import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Debug
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.OpenableColumns
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest

class MainActivity : Activity() {
    private lateinit var status: TextView
    private lateinit var importButton: Button
    private lateinit var loadButton: Button
    private lateinit var cpuButton: Button
    private lateinit var openClButton: Button
    private lateinit var vulkanButton: Button
    private lateinit var copyButton: Button

    private var lastReport: String = ""
    private val handler = Handler(Looper.getMainLooper())
    private var activeRunId: Long? = null
    private var activeStartedAt: Long = 0L
    private var pollCount = 0

    private val modelDir by lazy { File(filesDir, "models/phantom").apply { mkdirs() } }

    companion object {
        private const val PICK_MODELS = 41
        private val EXPECTED = mapOf(
            "transformer.mnn" to Pair(
                1433184L,
                "934a20b6d46db253376dded722097f0bdd9cb052ff9836d9e73d7969c8e880ec"
            ),
            "transformer.mnn.weight" to Pair(
                1602075690L,
                "724935c8cfd58e220d9c0d0309ff41718a920efbe2e33708100c6ff126b05274"
            )
        )
        private val SPLIT_WEIGHT_PARTS =
            (0..5).map { "transformer.mnn.weight.part.%02d".format(it) }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(36, 48, 36, 48)
            setBackgroundColor(Color.rgb(13, 13, 15))
        }

        val title = TextView(this).apply {
            text = "DIZA Local Video · MNN Smoke v0.4"
            textSize = 24f
            setTextColor(Color.WHITE)
        }

        val subtitle = TextView(this).apply {
            text = "Phase-1 diagnostics now run in a separate :inference process. If MNN crashes or Android kills it, this screen should survive and report the exit reason."
            textSize = 14f
            setTextColor(Color.LTGRAY)
            setPadding(0, 12, 0, 28)
        }

        importButton = button("1. Import transformer smoke pack") { pickModels() }
        loadButton = button("2. Load model only · isolated") { runWorker("load", 0) }
        cpuButton = button("3. Test CPU · isolated") { runWorker("forward", 0) }
        openClButton = button("4. Test OpenCL GPU · isolated") { runWorker("forward", 1) }
        vulkanButton = button("Test Vulkan GPU · isolated") { runWorker("forward", 2) }
        copyButton = button("Copy laporan terakhir") { copyReport() }.apply { isEnabled = false }

        status = TextView(this).apply {
            textSize = 14f
            setTextColor(Color.WHITE)
            setPadding(0, 28, 0, 0)
            setTextIsSelectable(true)
        }

        root.addView(title)
        root.addView(subtitle)
        root.addView(importButton)
        root.addView(loadButton)
        root.addView(cpuButton)
        root.addView(openClButton)
        root.addView(vulkanButton)
        root.addView(copyButton)
        root.addView(status)

        setContentView(ScrollView(this).apply { addView(root) })
        refreshStatus()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

    private fun button(label: String, action: () -> Unit) = Button(this).apply {
        text = label
        isAllCaps = false
        setOnClickListener { action() }
        val p = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        )
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
        data.clipData?.let { clip ->
            for (i in 0 until clip.itemCount) uris += clip.getItemAt(i).uri
        }
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
        val byName = uris.associateBy { displayName(it) }
        val directMode = uris.size == 2 && byName.keys.containsAll(EXPECTED.keys)
        val splitMode = uris.size == 7 &&
            byName.containsKey("transformer.mnn") &&
            byName.keys.containsAll(SPLIT_WEIGHT_PARTS)

        require(directMode || splitMode) {
            "Pilih 2 file asli, atau 7 file split: transformer.mnn + 6 part weight"
        }

        val staging = File(filesDir, "models/importing").apply {
            deleteRecursively()
            mkdirs()
        }

        try {
            copyAndVerify(
                requireNotNull(byName["transformer.mnn"]),
                File(staging, "transformer.mnn"),
                EXPECTED.getValue("transformer.mnn"),
                "transformer.mnn"
            )

            if (directMode) {
                copyAndVerify(
                    requireNotNull(byName["transformer.mnn.weight"]),
                    File(staging, "transformer.mnn.weight"),
                    EXPECTED.getValue("transformer.mnn.weight"),
                    "transformer.mnn.weight"
                )
            } else {
                val out = File(staging, "transformer.mnn.weight")
                val digest = MessageDigest.getInstance("SHA-256")
                var copied = 0L

                FileOutputStream(out).use { output ->
                    val buf = ByteArray(8 * 1024 * 1024)
                    for (name in SPLIT_WEIGHT_PARTS) {
                        val uri = requireNotNull(byName[name]) { "Part hilang: $name" }
                        contentResolver.openInputStream(uri).use { input ->
                            requireNotNull(input) { "Tidak bisa membuka $name" }
                            while (true) {
                                val n = input.read(buf)
                                if (n < 0) break
                                if (n == 0) continue
                                output.write(buf, 0, n)
                                digest.update(buf, 0, n)
                                copied += n
                            }
                        }
                    }
                    output.fd.sync()
                }

                val spec = EXPECTED.getValue("transformer.mnn.weight")
                require(copied == spec.first) {
                    "Ukuran hasil gabung salah: $copied != ${spec.first}"
                }
                val sha = digest.digest().joinToString("") { "%02x".format(it) }
                require(sha == spec.second) {
                    "SHA-256 hasil gabung tidak cocok dengan Release #7"
                }
            }

            for (name in EXPECTED.keys) {
                val target = File(modelDir, name)
                if (target.exists()) target.delete()
                require(File(staging, name).renameTo(target)) {
                    "Gagal mengaktifkan $name"
                }
            }

            return if (splitMode) {
                "PASS import split: 6 part digabung dan exact Release #7 terverifikasi."
            } else {
                "PASS import: exact Release #7 terverifikasi."
            }
        } finally {
            staging.deleteRecursively()
        }
    }

    private fun copyAndVerify(
        uri: Uri,
        out: File,
        spec: Pair<Long, String>,
        name: String
    ) {
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

        require(copied == spec.first) {
            "Ukuran $name salah: $copied != ${spec.first}"
        }
        val sha = digest.digest().joinToString("") { "%02x".format(it) }
        require(sha == spec.second) {
            "SHA-256 $name tidak cocok dengan Release #7"
        }
    }

    private fun displayName(uri: Uri): String {
        contentResolver.query(
            uri,
            arrayOf(OpenableColumns.DISPLAY_NAME),
            null,
            null,
            null
        )?.use { c ->
            if (c.moveToFirst()) {
                val i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (i >= 0) return c.getString(i)
            }
        }
        return uri.lastPathSegment ?: ""
    }

    private fun runWorker(mode: String, backend: Int) {
        if (!File(modelDir, "transformer.mnn").exists() ||
            !File(modelDir, "transformer.mnn.weight").exists()
        ) {
            status.text = "FAIL: import model dulu."
            return
        }

        val runId = System.currentTimeMillis()
        activeRunId = runId
        activeStartedAt = runId
        pollCount = 0
        File(filesDir, "worker_result_$runId.json").delete()

        setBusy(
            true,
            if (mode == "load") {
                "Worker isolated: load model saja… layar utama harus tetap hidup jika worker crash."
            } else {
                "Worker isolated: ${backendName(backend)} forward… layar utama harus tetap hidup jika worker crash."
            }
        )

        val intent = Intent(this, InferenceService::class.java)
            .putExtra("mode", mode)
            .putExtra("backend", backend)
            .putExtra("runId", runId)

        runCatching { startService(intent) }.onFailure {
            activeRunId = null
            setBusy(false, "FAIL start worker: ${it.message}")
            return
        }

        pollWorker(runId, mode, backend)
    }

    private fun pollWorker(runId: Long, mode: String, backend: Int) {
        if (activeRunId != runId) return

        val resultFile = File(filesDir, "worker_result_$runId.json")
        if (resultFile.exists()) {
            val worker = runCatching { JSONObject(resultFile.readText()) }.getOrElse {
                JSONObject()
                    .put("ok", false)
                    .put("stage", "worker-result-read")
                    .put("error", it.message)
            }

            val report = JSONObject()
                .put("schema", "diza-phase1-isolated-v1")
                .put("mode", mode)
                .put("backendRequested", backendName(backend))
                .put("workerResult", worker)
                .put("deviceAfter", deviceSnapshot())

            finishWorkerReport(report)
            resultFile.delete()
            return
        }

        val exit = workerExitSince(activeStartedAt)
        if (exit != null) {
            val report = JSONObject()
                .put("schema", "diza-phase1-isolated-v1")
                .put("ok", false)
                .put("stage", "worker-process-exit")
                .put("mode", mode)
                .put("backendRequested", backendName(backend))
                .put("exit", exit)
                .put("deviceAfter", deviceSnapshot())

            finishWorkerReport(report)
            return
        }

        pollCount++
        if (pollCount >= 900) {
            val report = JSONObject()
                .put("schema", "diza-phase1-isolated-v1")
                .put("ok", false)
                .put("stage", "timeout")
                .put("mode", mode)
                .put("backendRequested", backendName(backend))
                .put("message", "No result after 15 minutes.")
                .put("deviceAfter", deviceSnapshot())
            finishWorkerReport(report)
            return
        }

        handler.postDelayed({ pollWorker(runId, mode, backend) }, 1000)
    }

    private fun finishWorkerReport(report: JSONObject) {
        activeRunId = null
        lastReport = report.toString(2)
        setBusy(false, lastReport)
        copyButton.isEnabled = true
    }

    private fun workerExitSince(startedAt: Long): JSONObject? {
        if (Build.VERSION.SDK_INT < 30) return null

        val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val exit = am.getHistoricalProcessExitReasons(packageName, 0, 20)
            .firstOrNull {
                (it.processName?.endsWith(":inference") == true) &&
                    it.timestamp >= startedAt
            } ?: return null

        return JSONObject()
            .put("processName", exit.processName)
            .put("reasonCode", exit.reason)
            .put("reasonLabel", exitReasonLabel(exit.reason))
            .put("description", exit.description ?: "")
            .put("timestamp", exit.timestamp)
            .put("pssMb", exit.pss / 1024.0)
            .put("rssMb", exit.rss / 1024.0)
            .put("importance", exit.importance)
    }

    private fun exitReasonLabel(reason: Int): String = when (reason) {
        ApplicationExitInfo.REASON_EXIT_SELF -> "exit-self"
        ApplicationExitInfo.REASON_SIGNALED -> "signaled"
        ApplicationExitInfo.REASON_LOW_MEMORY -> "low-memory"
        ApplicationExitInfo.REASON_CRASH -> "java-crash"
        ApplicationExitInfo.REASON_CRASH_NATIVE -> "native-crash"
        ApplicationExitInfo.REASON_ANR -> "anr"
        ApplicationExitInfo.REASON_INITIALIZATION_FAILURE -> "initialization-failure"
        ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE -> "excessive-resource"
        ApplicationExitInfo.REASON_USER_REQUESTED -> "user-requested"
        ApplicationExitInfo.REASON_DEPENDENCY_DIED -> "dependency-died"
        else -> "reason-$reason"
    }

    private fun backendName(backend: Int) = when (backend) {
        1 -> "OpenCL"
        2 -> "Vulkan"
        else -> "CPU"
    }

    private fun deviceSnapshot(): JSONObject {
        val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val system = ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }
        val app = Debug.MemoryInfo().also { Debug.getMemoryInfo(it) }

        val thermal = if (Build.VERSION.SDK_INT >= 29) {
            (getSystemService(Context.POWER_SERVICE) as PowerManager).currentThermalStatus
        } else {
            -1
        }

        return JSONObject()
            .put("manufacturer", Build.MANUFACTURER)
            .put("model", Build.MODEL)
            .put("device", Build.DEVICE)
            .put("sdk", Build.VERSION.SDK_INT)
            .put("abi", Build.SUPPORTED_ABIS.joinToString(","))
            .put("thermalStatus", thermal)
            .put("thermalLabel", thermalLabel(thermal))
            .put("appPssMb", app.totalPss / 1024.0)
            .put("systemAvailMb", system.availMem / 1048576.0)
            .put("systemThresholdMb", system.threshold / 1048576.0)
            .put("systemLowMemory", system.lowMemory)
    }

    private fun thermalLabel(v: Int): String {
        if (Build.VERSION.SDK_INT < 29) return "unsupported"

        return when (v) {
            PowerManager.THERMAL_STATUS_NONE -> "none"
            PowerManager.THERMAL_STATUS_LIGHT -> "light"
            PowerManager.THERMAL_STATUS_MODERATE -> "moderate"
            PowerManager.THERMAL_STATUS_SEVERE -> "severe"
            PowerManager.THERMAL_STATUS_CRITICAL -> "critical"
            PowerManager.THERMAL_STATUS_EMERGENCY -> "emergency"
            PowerManager.THERMAL_STATUS_SHUTDOWN -> "shutdown"
            else -> "unknown"
        }
    }

    private fun copyReport() {
        if (lastReport.isBlank()) return

        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(
            ClipData.newPlainText("DIZA Phase-1 report", lastReport)
        )
        Toast.makeText(this, "Laporan DIZA dicopy.", Toast.LENGTH_SHORT).show()
    }

    private fun refreshStatus(append: Boolean = false) {
        val s = runCatching {
            JSONObject(DizaNative.status(modelDir.absolutePath)).toString(2)
        }.getOrElse {
            "JNI status FAIL: ${it.message}"
        }

        status.text = if (append) {
            status.text.toString() + "\n\nEngine status:\n" + s
        } else {
            "Engine status:\n$s\n\nDevice:\n${deviceSnapshot().toString(2)}"
        }
    }

    private fun setBusy(busy: Boolean, message: String) {
        importButton.isEnabled = !busy
        loadButton.isEnabled = !busy
        cpuButton.isEnabled = !busy
        openClButton.isEnabled = !busy
        vulkanButton.isEnabled = !busy
        copyButton.isEnabled = !busy && lastReport.isNotBlank()
        status.text = message
    }
}
