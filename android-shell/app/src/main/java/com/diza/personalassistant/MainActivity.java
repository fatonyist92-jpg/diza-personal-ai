package com.diza.personalassistant;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public final class MainActivity extends Activity {
    private static final String PREFS = "diza";
    private static final String KEY_SERVER = "server_url";
    private static final String KEY_COOKIE = "session_cookie";
    private WebView webView;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        webView.addJavascriptInterface(new DizaBridge(this), "DizaNative");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("file".equalsIgnoreCase(uri.getScheme())) return false;
                openExternal(uri);
                return true;
            }
        });

        if (state != null) {
            webView.restoreState(state);
        } else {
            webView.loadUrl("file:///android_asset/index.html");
        }
    }

    private void openExternal(Uri uri) {
        if (uri == null) return;
        String scheme = uri.getScheme();
        if (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme)) return;
        startActivity(new Intent(Intent.ACTION_VIEW, uri));
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.removeJavascriptInterface("DizaNative");
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
        }
        super.onDestroy();
    }

    private static final class DizaBridge {
        private final Context context;
        private final SharedPreferences prefs;

        DizaBridge(Context context) {
            this.context = context.getApplicationContext();
            this.prefs = context.getSharedPreferences(PREFS, MODE_PRIVATE);
        }

        @JavascriptInterface
        public String getServer() {
            return prefs.getString(KEY_SERVER, "");
        }

        @JavascriptInterface
        public String setServer(String value) {
            Uri uri = validHttps(value);
            if (uri == null) return envelope(400, "{\"error\":\"Gunakan URL HTTPS yang valid.\"}");
            String normalized = uri.toString();
            String old = prefs.getString(KEY_SERVER, "");
            SharedPreferences.Editor edit = prefs.edit().putString(KEY_SERVER, normalized);
            if (!normalized.equals(old)) edit.remove(KEY_COOKIE);
            edit.apply();
            return envelope(200, "{\"ok\":true}");
        }

        @JavascriptInterface
        public String clearServer() {
            prefs.edit().remove(KEY_SERVER).remove(KEY_COOKIE).apply();
            return envelope(200, "{\"ok\":true}");
        }

        @JavascriptInterface
        public String api(String method, String path, String body) {
            String base = prefs.getString(KEY_SERVER, "");
            Uri server = validHttps(base);
            if (server == null) return envelope(400, "{\"error\":\"Server DIZA belum diatur.\"}");
            if (path == null || !path.startsWith("/api/") || path.contains("..")) {
                return envelope(400, "{\"error\":\"Path API tidak valid.\"}");
            }

            HttpURLConnection connection = null;
            try {
                URL target = new URL(join(base, path));
                connection = (HttpURLConnection) target.openConnection();
                String verb = method == null ? "GET" : method.trim().toUpperCase();
                connection.setRequestMethod(verb);
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(180000);
                connection.setRequestProperty("Accept", "application/json");
                connection.setRequestProperty("Origin", origin(server));
                connection.setRequestProperty("Referer", origin(server) + "/");

                String cookie = prefs.getString(KEY_COOKIE, "");
                if (!cookie.isBlank()) connection.setRequestProperty("Cookie", cookie);

                if (!"GET".equals(verb) && !"HEAD".equals(verb)) {
                    connection.setDoOutput(true);
                    connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                    byte[] bytes = (body == null || body.isBlank() ? "{}" : body).getBytes(StandardCharsets.UTF_8);
                    connection.getOutputStream().write(bytes);
                }

                int status = connection.getResponseCode();
                captureSessionCookie(connection);
                InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
                String response = readAll(stream);
                if (response.isBlank()) response = "{}";
                return envelope(status, response);
            } catch (Exception error) {
                return envelope(599, new JSONObject().put("error", "Server DIZA tidak dapat dijangkau.").put("detail", error.getMessage()).toString());
            } finally {
                if (connection != null) connection.disconnect();
            }
        }

        @JavascriptInterface
        public void openExternal(String url) {
            try {
                Uri uri = Uri.parse(url);
                String scheme = uri.getScheme();
                if (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme)) return;
                Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
            } catch (Exception ignored) {}
        }

        private void captureSessionCookie(HttpURLConnection connection) {
            String setCookie = connection.getHeaderField("Set-Cookie");
            if (setCookie == null) return;
            String first = setCookie.split(";", 2)[0].trim();
            if (!first.startsWith("__Host-diza_session=")) return;
            if (first.equals("__Host-diza_session=")) prefs.edit().remove(KEY_COOKIE).apply();
            else prefs.edit().putString(KEY_COOKIE, first).apply();
        }

        private static Uri validHttps(String value) {
            if (value == null) return null;
            try {
                Uri uri = Uri.parse(value.trim());
                if (!"https".equalsIgnoreCase(uri.getScheme())) return null;
                if (uri.getHost() == null || uri.getHost().isBlank()) return null;
                return uri;
            } catch (Exception ignored) {
                return null;
            }
        }

        private static String origin(Uri uri) {
            int port = uri.getPort();
            String portPart = port > 0 && port != 443 ? ":" + port : "";
            return "https://" + uri.getHost() + portPart;
        }

        private static String join(String base, String path) {
            return base.endsWith("/") ? base.substring(0, base.length() - 1) + path : base + path;
        }

        private static String readAll(InputStream stream) throws Exception {
            if (stream == null) return "";
            StringBuilder out = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) out.append(line).append('\n');
            }
            return out.toString().trim();
        }

        private static String envelope(int status, String body) {
            try {
                return new JSONObject().put("status", status).put("body", body).toString();
            } catch (Exception ignored) {
                return "{\"status\":500,\"body\":\"{}\"}";
            }
        }
    }
}
