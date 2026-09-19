package com.fatoni.diza

import android.Manifest
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
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import kotlinx.coroutines.delay
import java.util.Locale
import kotlin.math.abs

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { DizaApp() }
    }
}

private enum class AppStage { SPLASH, MAIN }

@Composable
fun DizaApp() {
    val context = LocalContext.current
    val handler = remember { Handler(Looper.getMainLooper()) }

    var stage by remember { mutableStateOf(AppStage.SPLASH) }
    val splashAlpha = remember { Animatable(0f) }
    val uiAlpha = remember { Animatable(0f) }
    val controlsProgress = remember { Animatable(0f) }

    LaunchedEffect(Unit) {
        splashAlpha.animateTo(
            targetValue = 1f,
            animationSpec = tween(420, easing = FastOutSlowInEasing)
        )
        delay(900)
        splashAlpha.animateTo(
            targetValue = 0f,
            animationSpec = tween(480, easing = FastOutSlowInEasing)
        )
        stage = AppStage.MAIN
    }

    LaunchedEffect(stage) {
        if (stage == AppStage.MAIN) {
            uiAlpha.snapTo(0f)
            controlsProgress.snapTo(0f)

            delay(80)

            uiAlpha.animateTo(
                targetValue = 1f,
                animationSpec = tween(520, easing = FastOutSlowInEasing)
            )

            controlsProgress.animateTo(
                targetValue = 1f,
                animationSpec = tween(560, easing = FastOutSlowInEasing)
            )
        }
    }

    var testMode by remember { mutableStateOf(false) }
    var listening by remember { mutableStateOf(false) }
    var speaking by remember { mutableStateOf(false) }
    var transcript by remember { mutableStateOf("Diza siap") }
    var speaker by remember { mutableStateOf("Diza") }
    var errorText by remember { mutableStateOf("") }
    var micLevel by remember { mutableFloatStateOf(0f) }
    var ttsLevel by remember { mutableFloatStateOf(0f) }
    var recognizer by remember { mutableStateOf<SpeechRecognizer?>(null) }
    var tts by remember { mutableStateOf<TextToSpeech?>(null) }

    fun recognizerIntent() = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(
            RecognizerIntent.EXTRA_LANGUAGE_MODEL,
            RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
        )
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, "id-ID")
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
    }

    fun startListening() {
        if (stage != AppStage.MAIN || !testMode || speaking) return
        listening = true
        errorText = ""
        runCatching {
            recognizer?.startListening(recognizerIntent())
        }.onFailure {
            listening = false
            errorText = "Mic test gagal: " + (it.message ?: "unknown")
        }
    }

    fun stopListening() {
        listening = false
        micLevel = 0f
        runCatching { recognizer?.cancel() }
    }

    fun audioLevel(audio: ByteArray?): Float {
        if (audio == null || audio.size < 2) return 0f

        var total = 0L
        var count = 0
        var i = 0

        while (i + 1 < audio.size) {
            val lo = audio[i].toInt() and 0xFF
            val hi = audio[i + 1].toInt()
            val sample = ((hi shl 8) or lo).toShort().toInt()

            total += abs(sample).toLong()
            count++
            i += 2
        }

        if (count == 0) return 0f

        val average = total.toFloat() / count
        return (average / 7000f).coerceIn(0f, 1f)
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

    DisposableEffect(Unit) {
        val speech = SpeechRecognizer.createSpeechRecognizer(context)
        recognizer = speech

        speech.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                listening = true
            }

            override fun onBeginningOfSpeech() {
                listening = true
            }

            override fun onRmsChanged(rmsdB: Float) {
                micLevel = ((rmsdB + 2f) / 12f).coerceIn(0f, 1f)
            }

            override fun onBufferReceived(buffer: ByteArray?) = Unit

            override fun onEndOfSpeech() {
                micLevel = 0f
            }

            override fun onError(error: Int) {
                micLevel = 0f
                listening = false

                if (stage == AppStage.MAIN && testMode && !speaking) {
                    handler.postDelayed({ startListening() }, 450)
                }
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

                if (stage == AppStage.MAIN && testMode && !speaking) {
                    handler.postDelayed({ startListening() }, 250)
                }
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

        engine?.setOnUtteranceProgressListener(
            object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) {
                    handler.post {
                        stopListening()
                        ttsLevel = 0f
                        speaking = true
                    }
                }

                override fun onAudioAvailable(
                    utteranceId: String?,
                    audio: ByteArray?
                ) {
                    val level = audioLevel(audio)

                    handler.post {
                        ttsLevel =
                            (ttsLevel * 0.42f + level * 0.58f)
                                .coerceIn(0f, 1f)
                    }
                }

                override fun onDone(utteranceId: String?) {
                    handler.post {
                        ttsLevel = 0f
                        speaking = false

                        if (stage == AppStage.MAIN && testMode) {
                            handler.postDelayed({ startListening() }, 280)
                        }
                    }
                }

                @Deprecated("Deprecated in Java")
                override fun onError(utteranceId: String?) {
                    onDone(utteranceId)
                }

                override fun onError(
                    utteranceId: String?,
                    errorCode: Int
                ) {
                    onDone(utteranceId)
                }
            }
        )

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

    val rawVoiceLevel = when {
        listening -> micLevel
        speaking -> ttsLevel
        else -> 0f
    }

    val voiceLevel by animateFloatAsState(
        targetValue = rawVoiceLevel,
        animationSpec = tween(
            durationMillis = 70,
            easing = LinearEasing
        ),
        label = "voice-level"
    )

    MaterialTheme {
        if (stage == AppStage.SPLASH) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.graphicsLayer {
                        alpha = splashAlpha.value
                    }
                ) {
                    Text(
                        text = "DIZA",
                        color = Color.White,
                        fontSize = 64.sp,
                        fontWeight = FontWeight.ExtraBold,
                        letterSpacing = 6.sp,
                        textAlign = TextAlign.Center
                    )

                    Text(
                        text = "AI Personal Assistant",
                        color = Color.White.copy(alpha = 0.78f),
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Medium,
                        letterSpacing = 1.8.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                }
            }
        } else {
            // Keep one constant full-screen viewport for BOTH the video and
            // the static final frame. All controls are overlays, so the image
            // never resizes when UI appears.
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .clipToBounds()
                    .background(Color.Black)
            ) {
                Box(modifier = Modifier.fillMaxSize().background(Color(0xFF111318)))\n\n                if (stage == AppStage.MAIN) {
                    // Professional glass-style transcript card.
                    Surface(
                        shape = RoundedCornerShape(22.dp),
                        color = Color(0xB8000000),
                        border = BorderStroke(
                            1.dp,
                            Color.White.copy(alpha = 0.14f)
                        ),
                        shadowElevation = 8.dp,
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .padding(
                                start = 18.dp,
                                end = 18.dp,
                                bottom = 176.dp
                            )
                            .fillMaxWidth()
                            .graphicsLayer {
                                alpha = uiAlpha.value
                                translationY = -voiceLevel * 5f
                                scaleX = 1f + voiceLevel * 0.008f
                                scaleY = 1f + voiceLevel * 0.020f
                            }
                    ) {
                        Column(
                            modifier = Modifier.padding(
                                horizontal = 18.dp,
                                vertical = 14.dp
                            )
                        ) {
                            Text(
                                text = speaker.uppercase(),
                                color = Color.White.copy(alpha = 0.60f),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                                letterSpacing = 1.5.sp
                            )

                            Spacer(
                                modifier = Modifier.height(5.dp)
                            )

                            Text(
                                text = transcript,
                                color = Color.White,
                                fontSize = 18.sp,
                                lineHeight = 24.sp,
                                fontWeight = FontWeight.Medium,
                                maxLines = 3,
                                overflow = TextOverflow.Ellipsis,
                                style = TextStyle(
                                    shadow = Shadow(
                                        color = Color.Black.copy(alpha = 0.45f),
                                        offset = Offset(0f, 2f),
                                        blurRadius = 8f
                                    )
                                )
                            )
                        }
                    }

                    Canvas(
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .fillMaxWidth(0.76f)
                            .height(46.dp)
                            .padding(bottom = 2.dp)
                            .offset(y = (-142).dp)
                            .graphicsLayer {
                                alpha = uiAlpha.value
                            }
                    ) {
                        val count = 36
                        val gap = size.width / count
                        val centerY = size.height / 2f
                        val maxH = size.height * 0.82f

                        repeat(count) { i ->
                            val center = (count - 1) / 2f
                            val distance = abs(i - center) / center
                            val shape =
                                0.34f +
                                    (1f - distance) * 0.66f
                            val harmonic =
                                0.62f +
                                    0.38f *
                                    abs(
                                        kotlin.math.sin(
                                            i * 0.71f +
                                                voiceLevel * 7.0f
                                        )
                                    )
                            val h =
                                3f +
                                    maxH *
                                    voiceLevel *
                                    shape *
                                    harmonic
                            val x =
                                gap * i +
                                    gap / 2f

                            drawLine(
                                color = if (voiceLevel > 0.02f) {
                                    Color.White
                                } else {
                                    Color.White.copy(alpha = 0.24f)
                                },
                                start = Offset(
                                    x,
                                    centerY - h / 2f
                                ),
                                end = Offset(
                                    x,
                                    centerY + h / 2f
                                ),
                                strokeWidth = 3f
                            )
                        }
                    }

                    // Bottom control panel slides up after the video instead
                    // of resizing the media viewport.
                    Surface(
                        shape = RoundedCornerShape(
                            topStart = 30.dp,
                            topEnd = 30.dp,
                            bottomStart = 0.dp,
                            bottomEnd = 0.dp
                        ),
                        color = Color(0xE90B0D12),
                        border = BorderStroke(
                            1.dp,
                            Color.White.copy(alpha = 0.10f)
                        ),
                        shadowElevation = 18.dp,
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .fillMaxWidth()
                            .graphicsLayer {
                                alpha = controlsProgress.value
                                translationY =
                                    (1f - controlsProgress.value) *
                                        180f
                            }
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier.padding(
                                start = 16.dp,
                                end = 16.dp,
                                top = 10.dp,
                                bottom = 14.dp
                            )
                        ) {
                            Surface(
                                shape = RoundedCornerShape(99.dp),
                                color = Color.White.copy(alpha = 0.25f),
                                modifier = Modifier
                                    .width(40.dp)
                                    .height(4.dp)
                            ) {}

                            Spacer(
                                modifier = Modifier.height(12.dp)
                            )

                            if (errorText.isNotBlank()) {
                                Text(
                                    text = errorText,
                                    color = Color(0xFFFFB4AB),
                                    fontSize = 12.sp,
                                    modifier = Modifier.padding(
                                        bottom = 8.dp
                                    )
                                )
                            }

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement =
                                    Arrangement.spacedBy(10.dp)
                            ) {
                                Button(
                                    modifier = Modifier.weight(1f),
                                    shape = RoundedCornerShape(18.dp),
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor =
                                            if (testMode) {
                                                Color(0xFF252A33)
                                            } else {
                                                Color.White
                                            },
                                        contentColor =
                                            if (testMode) {
                                                Color.White
                                            } else {
                                                Color.Black
                                            }
                                    ),
                                    onClick = {
                                        if (testMode) {
                                            testMode = false
                                            stopListening()
                                            transcript = "Diza siap"
                                            speaker = "Diza"
                                        } else {
                                            val granted =
                                                ContextCompat
                                                    .checkSelfPermission(
                                                        context,
                                                        Manifest.permission
                                                            .RECORD_AUDIO
                                                    ) ==
                                                    PackageManager
                                                        .PERMISSION_GRANTED

                                            if (granted) {
                                                testMode = true
                                                handler.postDelayed(
                                                    { startListening() },
                                                    120
                                                )
                                            } else {
                                                micPermission.launch(
                                                    Manifest.permission
                                                        .RECORD_AUDIO
                                                )
                                            }
                                        }
                                    }
                                ) {
                                    Text(
                                        if (testMode) {
                                            "Stop Test"
                                        } else {
                                            "Test Mode"
                                        },
                                        fontWeight = FontWeight.SemiBold
                                    )
                                }

                                Button(
                                    modifier = Modifier.weight(1f),
                                    shape = RoundedCornerShape(18.dp),
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = Color(0xFF252A33),
                                        contentColor = Color.White
                                    ),
                                    onClick = {
                                        val demo =
                                            "Hai Fatoni. Diza siap."

                                        transcript = demo
                                        speaker = "Diza"

                                        val result =
                                            tts?.speak(
                                                demo,
                                                TextToSpeech.QUEUE_FLUSH,
                                                null,
                                                "diza-demo"
                                            )

                                        if (
                                            result ==
                                            TextToSpeech.ERROR
                                        ) {
                                            errorText =
                                                "TTS Android di HP ini belum siap."
                                        }
                                    }
                                ) {
                                    Text(
                                        "Diza Bicara",
                                        fontWeight = FontWeight.SemiBold
                                    )
                                }
                            }

                            Spacer(
                                modifier = Modifier.height(8.dp)
                            )

                            Text(
                                text =
                                    "Live Avatar Preview · zero-cost build",
                                color = Color.White.copy(alpha = 0.38f),
                                fontSize = 10.sp,
                                textAlign = TextAlign.Center
                            )
                        }
                    }
                }
            }
        }
    }
}
