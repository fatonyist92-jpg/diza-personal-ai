package com.diza.localvideo.smoke

import android.app.Service
import android.content.Intent
import android.os.IBinder
import org.json.JSONObject
import java.io.File

class InferenceService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val backend = intent?.getIntExtra("backend", 0) ?: 0
        val mode = intent?.getStringExtra("mode") ?: "forward"
        val runId = intent?.getLongExtra("runId", System.currentTimeMillis())
            ?: System.currentTimeMillis()

        Thread {
            val resultFile = File(filesDir, "worker_result_$runId.json")
            val modelDir = File(filesDir, "models/phantom")

            val result = runCatching {
                val raw = if (mode == "load") {
                    DizaNative.loadOnly(modelDir.absolutePath, backend)
                } else {
                    DizaNative.smoke(modelDir.absolutePath, backend)
                }
                JSONObject(raw)
                    .put("workerProcess", ":inference")
                    .put("mode", mode)
                    .put("runId", runId)
                    .toString()
            }.getOrElse {
                JSONObject()
                    .put("ok", false)
                    .put("stage", "worker-java")
                    .put("mode", mode)
                    .put("runId", runId)
                    .put("error", it.message ?: it.javaClass.simpleName)
                    .toString()
            }

            runCatching { resultFile.writeText(result) }
            stopSelf(startId)
        }.start()

        return START_NOT_STICKY
    }
}
