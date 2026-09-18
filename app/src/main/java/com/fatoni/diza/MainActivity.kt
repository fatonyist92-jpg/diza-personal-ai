package com.fatoni.diza

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Base64
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.util.Locale

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { DizaApp() }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun DizaApp() {
    val context = androidx.compose.ui.platform.LocalContext.current
    val handler = remember { Handler(Looper.getMainLooper()) }
    val prefs = remember { context.getSharedPreferences("diza_avatar", 0) }

    var webView by remember { mutableStateOf<WebView?>(null) }
    var testMode by remember { mutableStateOf(false) }
    var dizaSpeaking by remember { mutableStateOf(false) }
    var errorText by remember { mutableStateOf("") }
    var speechRecognizer by remember { mutableStateOf<SpeechRecognizer?>(null) }
    var tts by remember { mutableStateOf<TextToSpeech?>(null) }

    fun js(code: String) {
        webView?.evaluateJavascript(code, null)
    }

    fun pushAvatar(uri: Uri, target: WebView? = webView) {
        val view = target ?: return
        runCatching {
            val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                ?: error("Foto tidak bisa dibaca")
            val mime = context.contentResolver.getType(uri) ?: "image/jpeg"
            val dataUri = "data:" + mime + ";base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
            view.evaluateJavascript(
                "window.DizaAvatar?.setAvatarData(" + JSONObject.quote(dataUri) + ");",
                null
            )
        }.onFailure {
            errorText = "Avatar gagal dimuat: " + (it.message ?: "unknown")
        }
    }

    fun recognizerIntent() = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, "id-ID")
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
    }

    fun startListening() {
        if (!testMode || dizaSpeaking) return
        errorText = ""
        js("window.DizaAvatar?.setListening(true);")
        runCatching { speechRecognizer?.startListening(recognizerIntent()) }
            .onFailure { errorText = "Mic test gagal: " + (it.message ?: "unknown") }
    }

    fun stopListening() {
        runCatching { speechRecognizer?.cancel() }
        js("window.DizaAvatar?.setInputLevel(0);window.DizaAvatar?.setListening(false);")
    }

    val micPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { ok ->
        if (ok) {
            testMode = true
            handler.postDelayed({ startListening() }, 150)
        } else {
            errorText = "Izin mikrofon dibutuhin buat Test Mode."
        }
    }

    val pickAvatar = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri != null) {
            runCatching {
                context.contentResolver.takePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION
                )
            }
            prefs.edit().putString("uri", uri.toString()).apply()
            pushAvatar(uri)
            errorText = ""
        }
    }

    DisposableEffect(Unit) {
        val recognizer = SpeechRecognizer.createSpeechRecognizer(context)
        speechRecognizer = recognizer

        recognizer.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                js("window.DizaAvatar?.setListening(true);")
            }

            override fun onBeginningOfSpeech() {
                js("window.DizaAvatar?.setListening(true);")
            }

            override fun onRmsChanged(rmsdB: Float) {
                val level = ((rmsdB + 2f) / 12f).coerceIn(0f, 1f)
                val levelText = String.format(Locale.US, "%.3f", level)
                js("window.DizaAvatar?.setInputLevel(" + levelText + ");")
            }

            override fun onBufferReceived(buffer: ByteArray?) = Unit

            override fun onEndOfSpeech() {
                js("window.DizaAvatar?.setInputLevel(0);")
            }

            override fun onError(error: Int) {
                js("window.DizaAvatar?.setInputLevel(0);")
                if (testMode && !dizaSpeaking) {
                    handler.postDelayed({ startListening() }, 450)
                }
            }

            override fun onResults(results: Bundle?) {
                val text = results
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                    ?.trim()
                    .orEmpty()

                if (text.isNotBlank()) {
                    js(
                        "window.DizaAvatar?.setTranscript(" +
                            JSONObject.quote(text) + "," + JSONObject.quote("Fatoni") + ");"
                    )
                }
                if (testMode && !dizaSpeaking) {
                    handler.postDelayed({ startListening() }, 280)
                }
            }

            override fun onPartialResults(partialResults: Bundle?) {
                val text = partialResults
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                    ?.trim()
                    .orEmpty()

                if (text.isNotBlank()) {
                    js(
                        "window.DizaAvatar?.setTranscript(" +
                            JSONObject.quote(text) + "," + JSONObject.quote("Fatoni") + ");"
                    )
                }
            }

            override fun onEvent(eventType: Int, params: Bundle?) = Unit
        })

        var engine: TextToSpeech? = null
        engine = TextToSpeech(context) { status ->
            if (status == TextToSpeech.SUCCESS) {
                engine?.language = Locale("id", "ID")
                engine?.setSpeechRate(0.84f)
                engine?.setPitch(1.08f)
            }
        }

        engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {
                handler.post {
                    dizaSpeaking = true
                    stopListening()
                    js("window.DizaAvatar?.setSpeaking(true);")
                }
            }

            override fun onDone(utteranceId: String?) {
                handler.post {
                    dizaSpeaking = false
                    js("window.DizaAvatar?.setSpeaking(false);")
                    if (testMode) handler.postDelayed({ startListening() }, 300)
                }
            }

            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) {
                onDone(utteranceId)
            }

            override fun onError(utteranceId: String?, errorCode: Int) {
                onDone(utteranceId)
            }
        })
        tts = engine

        onDispose {
            runCatching { recognizer.cancel() }
            recognizer.destroy()
            speechRecognizer = null
            engine.stop()
            engine.shutdown()
            tts = null
            webView?.destroy()
            webView = null
        }
    }

    MaterialTheme {
        Column(
            Modifier
                .fillMaxSize()
                .background(Color(0xFF07080B))
        ) {
            AndroidView(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                factory = { ctx ->
                    WebView(ctx).apply {
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.allowFileAccess = true
                        setBackgroundColor(android.graphics.Color.BLACK)
                        webViewClient = object : WebViewClient() {
                            override fun onPageFinished(view: WebView?, url: String?) {
                                prefs.getString("uri", null)?.let { saved ->
                                    runCatching { pushAvatar(Uri.parse(saved), view) }
                                }
                            }
                        }
                        loadUrl("file:///android_asset/avatar/index.html")
                        webView = this
                    }
                },
                update = { webView = it }
            )

            if (errorText.isNotBlank()) {
                Text(
                    "⚠ " + errorText,
                    color = Color(0xFFFFB4AB),
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp)
                )
            }

            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 10.dp, vertical = 5.dp)
            ) {
                Button(
                    modifier = Modifier.weight(1f),
                    onClick = { pickAvatar.launch(arrayOf("image/*")) }
                ) {
                    Text("Pilih Avatar HD")
                }

                Button(
                    modifier = Modifier
                        .weight(1f)
                        .padding(start = 8.dp),
                    onClick = {
                        if (testMode) {
                            testMode = false
                            stopListening()
                            js("window.DizaAvatar?.setMode('idle');")
                        } else {
                            val granted = ContextCompat.checkSelfPermission(
                                context,
                                Manifest.permission.RECORD_AUDIO
                            ) == PackageManager.PERMISSION_GRANTED

                            if (granted) {
                                testMode = true
                                js("window.DizaAvatar?.setMode('test');")
                                handler.postDelayed({ startListening() }, 120)
                            } else {
                                micPermission.launch(Manifest.permission.RECORD_AUDIO)
                            }
                        }
                    }
                ) {
                    Text(if (testMode) "Stop Test" else "Test Mode")
                }
            }

            Button(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 10.dp, vertical = 4.dp),
                onClick = {
                    val demo = "Hai Fatoni. Ini Diza lagi tes gerak avatar dan waveform tanpa API."
                    js(
                        "window.DizaAvatar?.setTranscript(" +
                            JSONObject.quote(demo) + "," + JSONObject.quote("Diza") + ");"
                    )
                    val result = tts?.speak(
                        demo,
                        TextToSpeech.QUEUE_FLUSH,
                        null,
                        "diza-demo"
                    )
                    if (result == TextToSpeech.ERROR) {
                        errorText = "TTS Android di HP ini belum siap."
                    }
                }
            ) {
                Text("Diza ngomong")
            }

            Text(
                "v0.3.2 · Test Mode lokal · avatar dipilih dari Gallery tanpa recompress",
                color = Color(0xFF9EA2AD),
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)
            )
        }
    }
}
