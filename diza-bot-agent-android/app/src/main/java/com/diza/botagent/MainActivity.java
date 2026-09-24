package com.diza.botagent;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
  private static final String CONFIG_URL = "https://raw.githubusercontent.com/fatonyist92-jpg/diza-personal-ai/diza-bot-agent/diza-bot-agent/config/backend.json";
  private static final String DEFAULT_BACKEND_URL = "https://diza-bot-agent.floot.app";
  private final ExecutorService io = Executors.newSingleThreadExecutor();
  private final Handler main = new Handler(Looper.getMainLooper());
  private WebView webView;

  @Override protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getWindow().setStatusBarColor(Color.BLACK);
    getWindow().setNavigationBarColor(Color.BLACK);

    webView = new WebView(this);
    webView.setBackgroundColor(Color.BLACK);
    setContentView(webView);

    WebSettings s = webView.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setDatabaseEnabled(true);
    s.setAllowFileAccess(false);
    s.setAllowContentAccess(false);
    s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    s.setMediaPlaybackRequiresUserGesture(true);
    s.setSupportZoom(false);
    s.setBuiltInZoomControls(false);

    webView.setWebViewClient(new WebViewClient() {
      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        String u = request.getUrl().toString();
        if (u.equals("diza://retry")) { resolveBackend(); return true; }
        return false;
      }
    });

    showConnecting("Menghubungkan Diza…", "Sinkronisasi backend aman");
    resolveBackend();
  }

  private void resolveBackend() {
    showConnecting("Menghubungkan Diza…", "Mencari server aktif");
    io.submit(() -> {
      String backend = DEFAULT_BACKEND_URL;
      try {
        HttpURLConnection c = (HttpURLConnection) new URL(CONFIG_URL + "?v=" + System.currentTimeMillis()).openConnection();
        c.setConnectTimeout(12000);
        c.setReadTimeout(12000);
        c.setRequestProperty("Accept", "application/json");
        c.setRequestProperty("Cache-Control", "no-cache");
        int code = c.getResponseCode();
        if (code >= 200 && code < 300) {
          BufferedReader br = new BufferedReader(new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8));
          StringBuilder sb = new StringBuilder();
          String line;
          while ((line = br.readLine()) != null) sb.append(line);
          String configured = new JSONObject(sb.toString()).optString("backendUrl", "").trim();
          if (configured.startsWith("https://")) backend = configured;
        }
        c.disconnect();
      } catch (Exception ignored) {}
      final String target = backend;
      main.post(() -> {
        if (target.startsWith("https://")) webView.loadUrl(target);
        else showOffline();
      });
    });
  }

  private void showConnecting(String title, String subtitle) {
    String html = page(title, subtitle,
      "<div class='pulse'></div><div class='tiny'>DIZA BOT AGENT</div>");
    webView.loadDataWithBaseURL("https://diza.local/", html, "text/html", "UTF-8", null);
  }

  private void showOffline() {
    String html = page("Backend sedang disiapkan", "APK sudah siap. Server akan tersambung otomatis saat endpoint aktif.",
      "<a class='retry' href='diza://retry'>Coba lagi</a><div class='tiny'>Tidak perlu install ulang APK</div>");
    webView.loadDataWithBaseURL("https://diza.local/", html, "text/html", "UTF-8", null);
  }

  private String page(String title, String subtitle, String extra) {
    return "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1,viewport-fit=cover'>"+
      "<meta name='color-scheme' content='dark'><style>"+
      "*{box-sizing:border-box}html,body{margin:0;background:#000;color:#f5f5f7;font-family:system-ui,-apple-system,sans-serif;height:100%;overflow:hidden}"+
      "body{display:grid;place-items:center;padding:28px}.box{width:min(390px,100%);text-align:center}.logo{width:92px;height:92px;margin:auto;border-radius:27px;object-fit:cover;border:1px solid #2a2a2f;box-shadow:0 18px 55px #000}"+
      "h1{font-size:25px;letter-spacing:-.04em;margin:22px 0 8px}p{margin:0 auto 22px;color:#85858e;max-width:320px;line-height:1.55;font-size:13px}"+
      ".pulse{width:8px;height:8px;border-radius:50%;background:#8f74ff;margin:24px auto;box-shadow:0 0 0 0 rgba(143,116,255,.4);animation:p 1.5s infinite}"+
      "@keyframes p{70%{box-shadow:0 0 0 14px rgba(143,116,255,0)}100%{box-shadow:0 0 0 0 rgba(143,116,255,0)}}"+
      ".retry{display:inline-block;text-decoration:none;background:#f2f2f4;color:#050506;padding:13px 20px;border-radius:13px;font-weight:750;margin:4px 0 18px}.tiny{color:#505059;font-size:10px;letter-spacing:.12em;text-transform:uppercase}"+
      "</style></head><body><div class='box'><img class='logo' src='file:///android_res/drawable/diza_icon.webp'><h1>"+title+"</h1><p>"+subtitle+"</p>"+extra+"</div></body></html>";
  }

  @Override public void onBackPressed() {
    if (webView.canGoBack()) webView.goBack(); else super.onBackPressed();
  }

  @Override protected void onDestroy() {
    io.shutdownNow();
    if (webView != null) { webView.stopLoading(); webView.destroy(); }
    super.onDestroy();
  }
}
