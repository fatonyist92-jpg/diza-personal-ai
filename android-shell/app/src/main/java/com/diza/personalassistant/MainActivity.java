package com.diza.personalassistant;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.view.inputmethod.InputMethodManager;
import android.content.Context;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private static final String PREFS = "diza";
    private static final String KEY_SERVER = "server_url";

    private WebView webView;
    private Uri home;
    private AlertDialog serverDialog;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        home = configuredServer();

        webView = new WebView(this);
        setContentView(webView);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, false);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return openOutsideWhenExternal(request.getUrl());
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame()) showServerDialog("Server DIZA belum bisa dijangkau.");
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                super.onReceivedHttpError(view, request, response);
                if (!request.isForMainFrame()) return;
                int status = response.getStatusCode();
                if (status == 404 || status == 410 || status == 502 || status == 503 || status == 504) {
                    showServerDialog("Tunnel DIZA tidak aktif atau alamatnya berubah.");
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                WebView popup = new WebView(MainActivity.this);
                popup.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView popupView, WebResourceRequest request) {
                        openExternal(request.getUrl());
                        popupView.destroy();
                        return true;
                    }
                });
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(popup);
                resultMsg.sendToTarget();
                return true;
            }
        });

        if (state != null && home != null) {
            webView.restoreState(state);
        } else if (home != null) {
            webView.loadUrl(home.toString());
        } else {
            showServerDialog("Masukkan URL HTTPS yang muncul di laptop saat DIZA Server dinyalakan.");
        }
    }

    private Uri configuredServer() {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        Uri saved = validHttps(prefs.getString(KEY_SERVER, ""));
        if (saved != null) return saved;

        Uri built = validHttps(BuildConfig.DIZA_SERVER_URL);
        if (built != null && !"example.invalid".equalsIgnoreCase(built.getHost())) return built;
        return null;
    }

    private Uri validHttps(String value) {
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

    private void showServerDialog(String message) {
        if (isFinishing() || isDestroyed()) return;
        if (serverDialog != null && serverDialog.isShowing()) return;

        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setHint("https://xxxxxxxx.hostc.app");
        input.setSelectAllOnFocus(true);
        if (home != null) input.setText(home.toString());

        AlertDialog.Builder builder = new AlertDialog.Builder(this)
            .setTitle("Server DIZA")
            .setMessage(message)
            .setView(input)
            .setPositiveButton("Simpan & buka", null);

        if (home != null) {
            builder.setNegativeButton("Coba lagi", (dialog, which) -> webView.loadUrl(home.toString()));
        }

        serverDialog = builder.create();
        serverDialog.setOnShowListener(dialog -> {
            serverDialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
                Uri next = validHttps(input.getText().toString());
                if (next == null) {
                    input.setError("Gunakan URL HTTPS yang valid.");
                    return;
                }
                getSharedPreferences(PREFS, MODE_PRIVATE)
                    .edit()
                    .putString(KEY_SERVER, next.toString())
                    .apply();
                home = next;
                webView.stopLoading();
                webView.clearHistory();
                webView.loadUrl(home.toString());
                InputMethodManager keyboard = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
                keyboard.hideSoftInputFromWindow(input.getWindowToken(), 0);
                serverDialog.dismiss();
            });
        });
        serverDialog.setOnDismissListener(dialog -> serverDialog = null);
        serverDialog.show();
    }

    private boolean sameDizaOrigin(Uri uri) {
        if (uri == null || home == null) return false;
        return "https".equalsIgnoreCase(uri.getScheme())
            && home.getHost() != null
            && home.getHost().equalsIgnoreCase(uri.getHost())
            && effectivePort(home) == effectivePort(uri);
    }

    private int effectivePort(Uri uri) {
        if (uri.getPort() != -1) return uri.getPort();
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }

    private boolean openOutsideWhenExternal(Uri uri) {
        if (sameDizaOrigin(uri)) return false;
        openExternal(uri);
        return true;
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
        if (webView != null && home != null) webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onDestroy() {
        if (serverDialog != null) serverDialog.dismiss();
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
        }
        super.onDestroy();
    }
}
