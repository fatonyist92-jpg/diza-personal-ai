package com.fatoni.diza

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import java.io.File
import java.util.Locale
import kotlin.math.abs
import kotlin.math.sin

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { DizaNativeApp() }
    }
}

private fun decodeAvatar(file: File): Bitmap? {
    if (!file.exists() || file.length() <= 0L) return null
    return runCatching {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val source = ImageDecoder.createSource(file)
            ImageDecoder.decodeBitmap(source) { decoder, _, _ ->
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                decoder.isMutableRequired = false
            }
        } else {
            BitmapFactory.decodeFile(file.absolutePath)
        }
    }.getOrNull()
}

@Composable
fun DizaNativeApp() {
    val context = LocalContext.current
    val handler = remember { Handler(Looper.getMainLooper()) }
    val avatarFile = remember { File(context.filesDir, "diza_avatar_original") }

    var avatarVersion by remember { mutableIntStateOf(0) }
    val avatarBitmap = remember(avatarVersion) { decodeAvatar(avatarFile) }

    var testMode by remember { mutableStateOf(false) }
    var listening by remember { mutableStateOf(false) }
    var speaking by remember { mutableStateOf(false) }
    var transcript by remember {
        mutableStateOf(if (avatarBitmap == null) "Pilih foto Diza dari Gallery sekali" else "Diza siap")
    }
    var speaker by remember { mutableStateOf("") }
    var errorText by remember { mutableStateOf("") }
    var micLevel by remember { mutableFloatStateOf(0f) }
    var recognizer by remember { mutableStateOf<SpeechRecognizer?>(null) }
    var tts by remember { mutableStateOf<TextToSpeech?>(null) }

    fun recognizerIntent() = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, "id-ID")
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
    }

    fun startListening() {
        if (!testMode || speaking) return
        listening = true
        errorText = ""
        runCatching { recognizer?.startListening(recognizerIntent()) }
            .onFailure {
                listening = false
                errorText = "Mic test gagal: " + (it.message ?: "unknown")
            }
    }

    fun stopListening() {
        listening = false
        micLevel = 0f
        runCatching { recognizer?.cancel() }
    }

    val micPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { ok ->
        if (ok) {
            testMode = true
            handler.postDelayed({ startListening() }, 120)
        } else {
            errorText = "Izin mikrofon dibutuhin buat Test Mode."
        }
    }

    val pickAvatar = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri != null) {
            runCatching {
                context.contentResolver.openInputStream(uri)?.use { input ->
                    avatarFile.outputStream().use { output -> input.copyTo(output) }
                } ?: error("Foto tidak bisa dibaca")
                avatarVersion += 1
                transcript = "Avatar HD loaded"
                speaker = "Diza"
                errorText = ""
            }.onFailure {
                errorText = "Gagal buka foto: " + (it.message ?: "unknown")
            }
        }
    }

    DisposableEffect(Unit) {
        val speech = SpeechRecognizer.createSpeechRecognizer(context)
        recognizer = speech

        speech.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) { listening = true }
            override fun onBeginningOfSpeech() { listening = true }

            override fun onRmsChanged(rmsdB: Float) {
                micLevel = ((rmsdB + 2f) / 12f).coerceIn(0f, 1f)
            }

            override fun onBufferReceived(buffer: ByteArray?) = Unit
            override fun onEndOfSpeech() { micLevel = 0f }

            override fun onError(error: Int) {
                micLevel = 0f
                listening = false
                if (testMode && !speaking) handler.postDelayed({ startListening() }, 450)
            }

            override fun onResults(results: Bundle?) {
                val value = results
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                    ?.trim()
                    .orEmpty()

                if (value.isNotBlank()) {
                    transcript = value
                    speaker = "Fatoni"
                }

                listening = false
                micLevel = 0f
                if (testMode && !speaking) handler.postDelayed({ startListening() }, 250)
            }

            override fun onPartialResults(partialResults: Bundle?) {
                val value = partialResults
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                    ?.trim()
                    .orEmpty()

                if (value.isNotBlank()) {
                    transcript = value
                    speaker = "Fatoni"
                }
            }

            override fun onEvent(eventType: Int, params: Bundle?) = Unit
        })

        var engine: TextToSpeech? = null
        engine = TextToSpeech(context) { status ->
            if (status == TextToSpeech.SUCCESS) {
                engine?.language = Locale("id", "ID")
                engine?.setSpeechRate(0.82f)
                engine?.setPitch(1.08f)
            }
        }

        engine?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {
                handler.post {
                    stopListening()
                    speaking = true
                }
            }

            override fun onDone(utteranceId: String?) {
                handler.post {
                    speaking = false
                    if (testMode) handler.postDelayed({ startListening() }, 280)
                }
            }

            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) { onDone(utteranceId) }

            override fun onError(utteranceId: String?, errorCode: Int) { onDone(utteranceId) }
        })

        tts = engine

        onDispose {
            runCatching { speech.cancel() }
            speech.destroy()
            recognizer = null
            engine?.stop()
            engine?.shutdown()
            tts = null
        }
    }

    val motion = rememberInfiniteTransition(label = "diza-motion")
    val phase by motion.animateFloat(
        initialValue = 0f,
        targetValue = 6.2831855f,
        animationSpec = infiniteRepeatable(
            animation = tween(3200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "phase"
    )

    val talkPulse = if (speaking) abs(sin(phase * 5.2f)) * 0.9f + 0.1f else 0f
    val translateX = sin(phase) * if (speaking) 2.2f else 1.2f
    val translateY = sin(phase * 0.74f) * 1.6f - talkPulse * 0.8f
    val rotation = sin(phase * 0.55f) * if (speaking) 0.32f else 0.14f
    val scale = 1.006f + abs(sin(phase * 0.45f)) * 0.003f + talkPulse * 0.003f

    MaterialTheme {
        Column(
            Modifier
                .fillMaxSize()
                .background(Color(0xFF08090C))
        ) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .clipToBounds()
                    .background(Color(0xFF11131A))
            ) {
                avatarBitmap?.let { bitmap ->
                    Image(
                        bitmap = bitmap.asImageBitmap(),
                        contentDescription = "Diza",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .fillMaxSize()
                            .graphicsLayer(
                                translationX = translateX,
                                translationY = translateY,
                                rotationZ = rotation,
                                scaleX = scale,
                                scaleY = scale + talkPulse * 0.0025f
                            )
                    )
                }

                if (avatarBitmap == null) {
                    Text(
                        "Tap “Pilih Avatar HD” di bawah",
                        color = Color.White,
                        fontSize = 20.sp,
                        modifier = Modifier.align(Alignment.Center)
                    )
                }

                Text(
                    text = buildString {
                        if (speaker.isNotBlank()) append(speaker).append(" · ")
                        append(transcript)
                    },
                    color = Color.White,
                    fontSize = 20.sp,
                    lineHeight = 25.sp,
                    style = TextStyle(
                        shadow = Shadow(
                            color = Color.Black,
                            offset = Offset(0f, 2f),
                            blurRadius = 12f
                        )
                    ),
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .padding(horizontal = 22.dp, vertical = 22.dp)
                )

                Text(
                    text = when {
                        speaking -> "● Diza lagi ngomong"
                        listening -> "● Diza dengerin Fatoni"
                        testMode -> "● Test Mode"
                        else -> "● Diza siap"
                    },
                    color = Color.White,
                    fontSize = 12.sp,
                    style = TextStyle(
                        shadow = Shadow(
                            color = Color.Black,
                            offset = Offset(0f, 2f),
                            blurRadius = 8f
                        )
                    ),
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(start = 16.dp, bottom = 74.dp)
                )

                val waveformLevel = when {
                    listening -> micLevel
                    speaking -> 0.18f + talkPulse * 0.72f
                    else -> 0f
                }

                Canvas(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth(0.78f)
                        .height(56.dp)
                        .padding(bottom = 8.dp)
                ) {
                    val count = 36
                    val gap = size.width / count
                    val centerY = size.height / 2f
                    val maxH = size.height * 0.82f

                    repeat(count) { i ->
                        val center = (count - 1) / 2f
                        val distance = abs(i - center) / center
                        val shape = 0.34f + (1f - distance) * 0.66f
                        val jitter = 0.55f + 0.45f * abs(sin(phase * 7.5f + i * 0.73f))
                        val h = 3f + maxH * waveformLevel * shape * jitter
                        val x = gap * i + gap / 2f

                        drawLine(
                            color = if (waveformLevel > 0.02f) Color.White else Color.White.copy(alpha = 0.28f),
                            start = Offset(x, centerY - h / 2f),
                            end = Offset(x, centerY + h / 2f),
                            strokeWidth = 3f
                        )
                    }
                }
            }

            if (errorText.isNotBlank()) {
                Text(
                    "⚠ " + errorText,
                    color = Color(0xFFFFB4AB),
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp)
                )
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 10.dp, vertical = 5.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    modifier = Modifier.weight(1f),
                    onClick = { pickAvatar.launch(arrayOf("image/*")) }
                ) { Text("Pilih Avatar HD") }

                Button(
                    modifier = Modifier.weight(1f),
                    onClick = {
                        if (testMode) {
                            testMode = false
                            stopListening()
                        } else {
                            val granted = ContextCompat.checkSelfPermission(
                                context,
                                Manifest.permission.RECORD_AUDIO
                            ) == PackageManager.PERMISSION_GRANTED

                            if (granted) {
                                testMode = true
                                handler.postDelayed({ startListening() }, 120)
                            } else {
                                micPermission.launch(Manifest.permission.RECORD_AUDIO)
                            }
                        }
                    }
                ) { Text(if (testMode) "Stop Test" else "Test Mode") }
            }

            Button(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 10.dp, vertical = 4.dp),
                onClick = {
                    val demo = "Hai Fatoni. Ini Diza lagi tes gerak avatar dan waveform tanpa API."
                    transcript = demo
                    speaker = "Diza"

                    val result = tts?.speak(demo, TextToSpeech.QUEUE_FLUSH, null, "diza-demo")
                    if (result == TextToSpeech.ERROR) errorText = "TTS Android di HP ini belum siap."
                }
            ) { Text("Diza ngomong") }

            Text(
                text = avatarBitmap?.let {
                    "v0.3.4 · Native Android avatar · " + it.width + "×" + it.height + " · no WebView"
                } ?: "v0.3.4 · Native Android avatar · pilih foto sekali",
                color = Color(0xFF9EA2AD),
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)
            )
        }
    }
}
