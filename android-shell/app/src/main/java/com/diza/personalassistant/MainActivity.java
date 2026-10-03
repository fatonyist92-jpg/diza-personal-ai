package com.diza.personalassistant;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final String PREFS = "diza";
    private static final String KEY_SERVER = "server_url";
    private static final String KEY_COOKIE = "session_cookie";
    private static final String APP_HOST = "appassets.androidplatform.net";

    private WebView webView;
    private WebViewAssetLoader assetLoader;
    private DizaBridge bridge;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);

        webView = new WebView(this);
        setContentView(webView);

        assetLoader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();

        bridge = new DizaBridge(this, webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        webView.addJavascriptInterface(bridge, "DizaNative");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (APP_HOST.equalsIgnoreCase(uri.getHost()) && uri.getPath() != null && uri.getPath().startsWith("/api/")) {
                    String method = request.getMethod() == null ? "GET" : request.getMethod().toUpperCase(Locale.ROOT);
                    if ("GET".equals(method) || "HEAD".equals(method)) {
                        return bridge.proxyGet(uri, request.getRequestHeaders(), "HEAD".equals(method));
                    }
                }
                WebResourceResponse local = assetLoader.shouldInterceptRequest(uri);
                return local != null ? local : super.shouldInterceptRequest(view, request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (APP_HOST.equalsIgnoreCase(uri.getHost())) return false;
                openExternal(uri);
                return true;
            }
        });

        if (state != null) {
            webView.restoreState(state);
        } else {
            webView.loadUrl("https://" + APP_HOST + "/assets/index.html");
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
        if (bridge != null) bridge.shutdown();
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
        private final WebView webView;
        private final SharedPreferences prefs;
        private final ExecutorService executor = Executors.newCachedThreadPool();

        DizaBridge(Context context, WebView webView) {
            this.context = context.getApplicationContext();
            this.webView = webView;
            this.prefs = context.getSharedPreferences(PREFS, MODE_PRIVATE);
        }

        @JavascriptInterface
        public String getServer() {
            return serverBase();
        }

        @JavascriptInterface
        public String setServer(String value) {
            Uri uri = validHttps(value);
            if (uri == null) return envelope(400, "{\"error\":\"Gunakan URL HTTPS yang valid.\"}");
            String normalized = trimSlash(uri.toString());
            String old = serverBase();
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
        public void request(String id, String method, String path, String headersJson, String bodyBase64) {
            executor.execute(() -> {
                String payload;
                HttpURLConnection connection = null;
                try {
                    String base = serverBase();
                    Uri server = validHttps(base);
                    if (server == null) {
                        payload = responseEnvelope(400, "application/json; charset=utf-8",
                            "{\"content-type\":\"application/json; charset=utf-8\"}",
                            "{\"error\":\"Server DIZA belum diatur.\"}".getBytes(StandardCharsets.UTF_8));
                        deliver(id, payload);
                        return;
                    }
                    if (!validApiPath(path)) {
                        payload = responseEnvelope(400, "application/json; charset=utf-8",
                            "{\"content-type\":\"application/json; charset=utf-8\"}",
                            "{\"error\":\"Path API tidak valid.\"}".getBytes(StandardCharsets.UTF_8));
                        deliver(id, payload);
                        return;
                    }

                    connection = open(server, path, method, headersJson);
                    if (bodyBase64 != null && !bodyBase64.isEmpty() && !"GET".equalsIgnoreCase(method) && !"HEAD".equalsIgnoreCase(method)) {
                        connection.setDoOutput(true);
                        byte[] bytes = Base64.decode(bodyBase64, Base64.DEFAULT);
                        connection.getOutputStream().write(bytes);
                    }

                    int status = connection.getResponseCode();
                    captureSessionCookie(connection);
                    InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
                    byte[] bytes = readBytes(stream);
                    payload = responseEnvelope(status, connection.getContentType(), responseHeadersJson(connection), bytes);
                } catch (Exception error) {
                    payload = responseEnvelope(
                        599,
                        "application/json; charset=utf-8",
                        "{\"content-type\":\"application/json; charset=utf-8\"}",
                        "{\"error\":\"Server DIZA tidak dapat dijangkau.\"}".getBytes(StandardCharsets.UTF_8)
                    );
                } finally {
                    if (connection != null) connection.disconnect();
                }
                deliver(id, payload);
            });
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

        WebResourceResponse proxyGet(Uri localUri, Map<String, String> requestHeaders, boolean head) {
            String base = serverBase();
            Uri server = validHttps(base);
            if (server == null) return jsonError(400, "Server DIZA belum diatur.");

            String path = localUri.getEncodedPath();
            String query = localUri.getEncodedQuery();
            if (query != null && !query.isEmpty()) path += "?" + query;
            if (!validApiPath(path)) return jsonError(400, "Path API tidak valid.");

            try {
                HttpURLConnection connection = open(server, path, head ? "HEAD" : "GET", requestHeaders);
                int status = connection.getResponseCode();
                captureSessionCookie(connection);
                String contentType = connection.getContentType();
                String mime = mime(contentType);
                String encoding = charset(contentType);
                Map<String, String> headers = responseHeaders(connection);
                InputStream raw = head
                    ? new ByteArrayInputStream(new byte[0])
                    : (status >= 400 ? connection.getErrorStream() : connection.getInputStream());
                if (raw == null) raw = new ByteArrayInputStream(new byte[0]);
                InputStream body = new DisconnectingInputStream(raw, connection);
                String reason = connection.getResponseMessage();
                if (reason == null || reason.isEmpty()) reason = status >= 400 ? "Error" : "OK";
                return new WebResourceResponse(mime, encoding, status, reason, headers, body);
            } catch (Exception error) {
                return jsonError(599, "Server DIZA tidak dapat dijangkau.");
            }
        }

        private HttpURLConnection open(Uri server, String path, String method, String headersJson) throws Exception {
            Map<String, String> headers = new HashMap<>();
            if (headersJson != null && !headersJson.isEmpty()) {
                JSONObject object = new JSONObject(headersJson);
                Iterator<String> keys = object.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    headers.put(key, object.optString(key, ""));
                }
            }
            return open(server, path, method, headers);
        }

        private HttpURLConnection open(Uri server, String path, String method, Map<String, String> headers) throws Exception {
            URL target = new URL(join(serverBase(), path));
            HttpURLConnection connection = (HttpURLConnection) target.openConnection();
            connection.setRequestMethod(method == null ? "GET" : method.toUpperCase(Locale.ROOT));
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(180000);
            connection.setInstanceFollowRedirects(false);

            if (headers != null) {
                for (Map.Entry<String, String> entry : headers.entrySet()) {
                    String key = entry.getKey();
                    if (key == null) continue;
                    String lower = key.toLowerCase(Locale.ROOT);
                    if (lower.equals("host") || lower.equals("cookie") || lower.equals("origin") ||
                        lower.equals("referer") || lower.equals("content-length") || lower.equals("accept-encoding")) {
                        continue;
                    }
                    connection.setRequestProperty(key, entry.getValue());
                }
            }

            connection.setRequestProperty("Origin", origin(server));
            connection.setRequestProperty("Referer", origin(server) + "/");
            String cookie = prefs.getString(KEY_COOKIE, "");
            if (!cookie.isEmpty()) connection.setRequestProperty("Cookie", cookie);
            return connection;
        }

        private String serverBase() {
            String saved = prefs.getString(KEY_SERVER, "");
            Uri savedUri = validHttps(saved);
            if (savedUri != null) return trimSlash(savedUri.toString());

            Uri built = validHttps(BuildConfig.DIZA_SERVER_URL);
            if (built != null && !"example.invalid".equalsIgnoreCase(built.getHost())) return trimSlash(built.toString());
            return "";
        }

        private void captureSessionCookie(HttpURLConnection connection) {
            Map<String, List<String>> fields = connection.getHeaderFields();
            if (fields == null) return;
            for (Map.Entry<String, List<String>> entry : fields.entrySet()) {
                if (entry.getKey() == null || !"set-cookie".equalsIgnoreCase(entry.getKey())) continue;
                for (String raw : entry.getValue()) {
                    if (raw == null) continue;
                    String first = raw.split(";", 2)[0].trim();
                    if (!first.startsWith("__Host-diza_session=")) continue;
                    if (first.equals("__Host-diza_session=")) prefs.edit().remove(KEY_COOKIE).apply();
                    else prefs.edit().putString(KEY_COOKIE, first).apply();
                    return;
                }
            }
        }

        private void deliver(String id, String payload) {
            webView.post(() -> webView.evaluateJavascript(
                "window.__dizaNativeResponse && window.__dizaNativeResponse(" +
                    JSONObject.quote(id) + "," + JSONObject.quote(payload) + ");",
                null
            ));
        }

        void shutdown() {
            executor.shutdownNow();
        }

        private static WebResourceResponse jsonError(int status, String message) {
            byte[] bytes = ("{\"error\":" + JSONObject.quote(message) + "}").getBytes(StandardCharsets.UTF_8);
            Map<String, String> headers = new HashMap<>();
            headers.put("content-type", "application/json; charset=utf-8");
            return new WebResourceResponse(
                "application/json",
                "utf-8",
                status,
                status >= 500 ? "Server Error" : "Bad Request",
                headers,
                new ByteArrayInputStream(bytes)
            );
        }

        private static boolean validApiPath(String path) {
            return path != null && path.startsWith("/api/") && !path.contains("..");
        }

        private static Uri validHttps(String value) {
            if (value == null) return null;
            try {
                Uri uri = Uri.parse(value.trim());
                if (!"https".equalsIgnoreCase(uri.getScheme())) return null;
                if (uri.getHost() == null || uri.getHost().isEmpty()) return null;
                return uri;
            } catch (Exception ignored) {
                return null;
            }
        }

        private static String trimSlash(String value) {
            String out = value == null ? "" : value.trim();
            while (out.endsWith("/")) out = out.substring(0, out.length() - 1);
            return out;
        }

        private static String origin(Uri uri) {
            int port = uri.getPort();
            String portPart = port > 0 && port != 443 ? ":" + port : "";
            return "https://" + uri.getHost() + portPart;
        }

        private static String join(String base, String path) {
            return trimSlash(base) + path;
        }

        private static byte[] readBytes(InputStream stream) throws IOException {
            if (stream == null) return new byte[0];
            try (InputStream in = stream; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
                return out.toByteArray();
            }
        }

        private static String responseEnvelope(int status, String contentType, String headersJson, byte[] bytes) throws Exception {
            JSONObject env = new JSONObject();
            env.put("status", status);
            if (contentType != null) env.put("contentType", contentType);
            env.put("headers", new JSONObject(headersJson == null || headersJson.isEmpty() ? "{}" : headersJson));
            env.put("base64", Base64.encodeToString(bytes == null ? new byte[0] : bytes, Base64.NO_WRAP));
            return env.toString();
        }

        private static String responseHeadersJson(HttpURLConnection connection) {
            return new JSONObject(responseHeaders(connection)).toString();
        }

        private static Map<String, String> responseHeaders(HttpURLConnection connection) {
            Map<String, String> out = new HashMap<>();
            Map<String, List<String>> fields = connection.getHeaderFields();
            if (fields == null) return out;
            for (Map.Entry<String, List<String>> entry : fields.entrySet()) {
                if (entry.getKey() == null || entry.getValue() == null || entry.getValue().isEmpty()) continue;
                if ("set-cookie".equalsIgnoreCase(entry.getKey())) continue;
                out.put(entry.getKey(), String.join(", ", entry.getValue()));
            }
            return out;
        }

        private static String mime(String contentType) {
            if (contentType == null || contentType.isEmpty()) return "application/octet-stream";
            int semicolon = contentType.indexOf(';');
            return (semicolon >= 0 ? contentType.substring(0, semicolon) : contentType).trim();
        }

        private static String charset(String contentType) {
            if (contentType == null) return "utf-8";
            String lower = contentType.toLowerCase(Locale.ROOT);
            int at = lower.indexOf("charset=");
            if (at < 0) return "utf-8";
            return contentType.substring(at + 8).trim().replace("\"", "");
        }

        private static String envelope(int status, String body) {
            try {
                return new JSONObject().put("status", status).put("body", body).toString();
            } catch (Exception ignored) {
                return "{\"status\":500,\"body\":\"{}\"}";
            }
        }
    }

    private static final class DisconnectingInputStream extends FilterInputStream {
        private final HttpURLConnection connection;

        DisconnectingInputStream(InputStream in, HttpURLConnection connection) {
            super(in);
            this.connection = connection;
        }

        @Override
        public void close() throws IOException {
            try {
                super.close();
            } finally {
                connection.disconnect();
            }
        }
    }
}
