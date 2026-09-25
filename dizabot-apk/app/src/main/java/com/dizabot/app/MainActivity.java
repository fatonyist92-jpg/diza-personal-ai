package com.dizabot.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.TimeUnit;

public class MainActivity extends Activity {
    private static final int PICK_FILE = 7401;
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(android.graphics.Color.rgb(17,17,17));
        getWindow().setNavigationBarColor(android.graphics.Color.rgb(17,17,17));

        webView = new WebView(this);
        webView.setBackgroundColor(android.graphics.Color.rgb(17,17,17));
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setTextZoom(100);

        webView.addJavascriptInterface(new DizaBridge(this), "DizaNative");
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                Intent i;
                try { i = params.createIntent(); }
                catch (Exception e) {
                    i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("*/*");
                }
                startActivityForResult(i, PICK_FILE);
                return true;
            }
        });

        Constraints c = new Constraints.Builder().setRequiredNetworkType(NetworkType.NOT_REQUIRED).build();
        PeriodicWorkRequest work = new PeriodicWorkRequest.Builder(CoreWorker.class, 15, TimeUnit.MINUTES)
            .setConstraints(c).build();
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "dizabot-core-worker", ExistingPeriodicWorkPolicy.KEEP, work);

        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_FILE && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
        }
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    public static class DizaBridge {
        private final SharedPreferences prefs;
        DizaBridge(Context c) { prefs = c.getSharedPreferences("dizabot_core", Context.MODE_PRIVATE); }

        @JavascriptInterface public void enqueueTask(String json) {
            Set<String> q = new HashSet<>(prefs.getStringSet("queue", new HashSet<>()));
            q.add(json);
            prefs.edit().putStringSet("queue", q).putInt("queueSize", q.size()).apply();
        }

        @JavascriptInterface public String getCoreStatus() {
            return "{\"hardRp0Lock\":true,\"reserveRatio\":0.10,\"lastWorkerRun\":" +
                prefs.getLong("lastWorkerRun",0L) + ",\"queueSize\":" + prefs.getInt("queueSize",0) + "}";
        }
    }

    public static class CoreWorker extends Worker {
        public CoreWorker(@NonNull Context c, @NonNull WorkerParameters p) { super(c,p); }
        @NonNull @Override public Result doWork() {
            SharedPreferences prefs = getApplicationContext().getSharedPreferences("dizabot_core", Context.MODE_PRIVATE);
            Set<String> q = new HashSet<>(prefs.getStringSet("queue", new HashSet<>()));
            prefs.edit().putLong("lastWorkerRun", System.currentTimeMillis()).putInt("queueSize", q.size()).apply();
            return Result.success();
        }
    }
}
