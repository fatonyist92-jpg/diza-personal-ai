package com.fatoni.diza

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.webkit.WebViewAssetLoader
import com.fatoni.diza.ui.DizaViewModel
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { DizaApp() }
    }
}

private class DizaJsBridge(
    private val vm: DizaViewModel,
    private val onConnected: (Boolean) -> Unit
) {
    private val main = Handler(Looper.getMainLooper())

    @android.webkit.JavascriptInterface
    fun onState(state: String) = main.post { vm.avatarState = state }

    @android.webkit.JavascriptInterface
    fun onUserTranscript(text: String) = main.post { vm.addUserTranscript(text) }

    @android.webkit.JavascriptInterface
    fun onAssistantTranscript(text: String) =
        main.post { vm.addAssistantTranscript(text) }

    @android.webkit.JavascriptInterface
    fun onRealtimeConnected(connected: Boolean) =
        main.post { onConnected(connected) }

    @android.webkit.JavascriptInterface
    fun onError(message: String) = main.post { vm.setError(message) }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun DizaApp(vm: DizaViewModel = viewModel()) {
    val context = LocalContext.current
    var realtimeConnected by remember { mutableStateOf(false) }
    var avatarWebView by remember { mutableStateOf<WebView?>(null) }
    val backendUrl = remember { BuildConfig.DIZA_REALTIME_BACKEND_URL }

    val avatarBitmap = remember {
        runCatching {
            val encoded = context.assets
                .open("avatar/diza_reference.b64")
                .bufferedReader()
                .use { it.readText() }
                .trim()

            val bytes = Base64.decode(encoded, Base64.DEFAULT)
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
        }.getOrNull()
    }

    val avatarScale by animateFloatAsState(
        targetValue = when (vm.avatarState) {
            "speaking" -> 1.025f
            "listening" -> 1.012f
            "thinking", "connecting" -> 1.006f
            else -> 1f
        },
        animationSpec = tween(260),
        label = "avatarScale"
    )

    fun startRealtime() {
        val webView = avatarWebView ?: return
        val quoted = JSONObject.quote(backendUrl)
        webView.evaluateJavascript(
            "window.DizaRealtime?.configure({backendUrl:$quoted});window.DizaRealtime?.start();",
            null
        )
    }

    fun stopRealtime() {
        avatarWebView?.evaluateJavascript("window.DizaRealtime?.stop();", null)
    }

    val micPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { ok ->
        if (ok) startRealtime()
        else vm.setError("Izin mikrofon dibutuhin buat voice real-time.")
    }

    DisposableEffect(Unit) {
        onDispose {
            avatarWebView?.evaluateJavascript("window.DizaRealtime?.stop();", null)
            avatarWebView?.destroy()
            avatarWebView = null
        }
    }

    MaterialTheme {
        Column(
            Modifier
                .fillMaxSize()
                .background(Color(0xFF090A0D))
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .background(Color(0xFF11131A))
            ) {
                if (avatarBitmap != null) {
                    Image(
                        bitmap = avatarBitmap,
                        contentDescription = "Diza",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .fillMaxSize()
                            .graphicsLayer(
                                scaleX = avatarScale,
                                scaleY = avatarScale
                            )
                    )
                } else {
                    Text(
                        "Avatar Diza gagal dimuat",
                        color = Color.White,
                        modifier = Modifier.align(Alignment.Center)
                    )
                }

                Text(
                    text = when (vm.avatarState) {
                        "speaking" -> "Diza · ngomong"
                        "listening" -> "Diza · dengerin"
                        "thinking" -> "Diza · mikir"
                        "connecting" -> "Diza · nyambungin…"
                        else -> "Diza · siap"
                    },
                    color = Color.White,
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(16.dp)
                        .background(Color(0x99000000))
                        .padding(horizontal = 12.dp, vertical = 8.dp)
                )

                AndroidView(
                    modifier = Modifier
                        .size(2.dp)
                        .alpha(0.01f)
                        .align(Alignment.BottomEnd),
                    factory = { ctx ->
                        val assetLoader = WebViewAssetLoader.Builder()
                            .addPathHandler(
                                "/assets/",
                                WebViewAssetLoader.AssetsPathHandler(ctx)
                            )
                            .build()

                        WebView(ctx).apply {
                            settings.javaScriptEnabled = true
                            settings.domStorageEnabled = true
                            settings.mediaPlaybackRequiresUserGesture = false
                            setBackgroundColor(android.graphics.Color.TRANSPARENT)

                            webViewClient = object : WebViewClient() {
                                override fun shouldInterceptRequest(
                                    view: WebView?,
                                    request: WebResourceRequest
                                ): WebResourceResponse? {
                                    return assetLoader.shouldInterceptRequest(request.url)
                                }

                                @Deprecated("Deprecated in Java")
                                override fun shouldInterceptRequest(
                                    view: WebView?,
                                    url: String?
                                ): WebResourceResponse? {
                                    return url?.let {
                                        assetLoader.shouldInterceptRequest(Uri.parse(it))
                                    }
                                }

                                override fun onPageFinished(view: WebView?, url: String?) {
                                    val quoted = JSONObject.quote(backendUrl)
                                    view?.evaluateJavascript(
                                        "window.DizaRealtime?.configure({backendUrl:$quoted});",
                                        null
                                    )
                                }
                            }

                            webChromeClient = object : WebChromeClient() {
                                override fun onPermissionRequest(request: PermissionRequest) {
                                    val audioRequested = request.resources.contains(
                                        PermissionRequest.RESOURCE_AUDIO_CAPTURE
                                    )
                                    val granted = ContextCompat.checkSelfPermission(
                                        ctx,
                                        Manifest.permission.RECORD_AUDIO
                                    ) == PackageManager.PERMISSION_GRANTED

                                    if (audioRequested && granted) {
                                        request.grant(
                                            arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                                        )
                                    } else {
                                        request.deny()
                                    }
                                }
                            }

                            addJavascriptInterface(
                                DizaJsBridge(vm) { realtimeConnected = it },
                                "DizaAndroid"
                            )

                            loadUrl(
                                "https://appassets.androidplatform.net/assets/avatar/index.html"
                            )
                            avatarWebView = this
                        }
                    },
                    update = { avatarWebView = it }
                )
            }

            Text(
                text = when {
                    vm.lastError.isNotBlank() -> "⚠ ${vm.lastError}"
                    realtimeConnected && vm.avatarState == "listening" ->
                        "GPT Voice Realtime · listening"
                    realtimeConnected && vm.avatarState == "speaking" ->
                        "GPT Voice Realtime · speaking"
                    realtimeConnected -> "GPT Voice Realtime tersambung"
                    backendUrl.isBlank() ->
                        "Backend belum diisi"
                    else -> "Siap untuk GPT Voice Realtime"
                },
                color = if (vm.lastError.isBlank()) {
                    Color.White
                } else {
                    Color(0xFFFFB4AB)
                },
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
            )

            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 140.dp)
                    .padding(horizontal = 16.dp)
            ) {
                items(vm.messages.takeLast(6)) { m ->
                    Text(
                        "${m.who}: ${m.text}",
                        color = Color(0xFFECECF1),
                        modifier = Modifier.padding(vertical = 3.dp)
                    )
                }
            }

            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
            ) {
                Button(
                    enabled = backendUrl.isNotBlank(),
                    onClick = {
                        vm.clearError()

                        if (realtimeConnected) {
                            stopRealtime()
                        } else {
                            val granted = ContextCompat.checkSelfPermission(
                                context,
                                Manifest.permission.RECORD_AUDIO
                            ) == PackageManager.PERMISSION_GRANTED

                            if (granted) startRealtime()
                            else micPermission.launch(Manifest.permission.RECORD_AUDIO)
                        }
                    }
                ) {
                    Text(
                        if (realtimeConnected) "Putus voice"
                        else "Ngobrol realtime"
                    )
                }

                Text(
                    "  v0.2.3",
                    color = Color.Gray,
                    modifier = Modifier.padding(top = 12.dp)
                )
            }
        }
    }
}
