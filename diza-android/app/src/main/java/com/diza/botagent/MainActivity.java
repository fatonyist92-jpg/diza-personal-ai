package com.diza.botagent;

import android.app.Activity;
import android.graphics.Color;
import android.net.http.SslError;
import android.os.Bundle;
import android.view.View;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;
import android.view.Gravity;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final String ORIGIN = "https://diza-bot-agent.floot.app/";
    private WebView webView;
    private FrameLayout splash;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.BLACK);
        webView.setVisibility(View.INVISIBLE);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setTextZoom(100);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                webView.setVisibility(View.VISIBLE);
                splash.animate().alpha(0f).setDuration(180)
                    .withEndAction(() -> splash.setVisibility(View.GONE)).start();
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
            }
        });

        splash = makeSplash();
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        root.addView(splash, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);

        try (InputStream in = getAssets().open("index.html")) {
            String html = new String(in.readAllBytes(), StandardCharsets.UTF_8);
            webView.loadDataWithBaseURL(ORIGIN, html, "text/html", "UTF-8", null);
        } catch (Exception e) {
            TextView err = new TextView(this);
            err.setText("Diza Bot Agent failed to load");
            err.setTextColor(Color.WHITE);
            err.setGravity(Gravity.CENTER);
            root.addView(err, new FrameLayout.LayoutParams(-1, -1));
        }
    }

    private FrameLayout makeSplash() {
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(Color.BLACK);

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.diza_icon);
        logo.setScaleType(ImageView.ScaleType.CENTER_CROP);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(dp(92), dp(92));
        lp.gravity = Gravity.CENTER;
        lp.bottomMargin = dp(34);
        frame.addView(logo, lp);

        TextView title = new TextView(this);
        title.setText("Diza Bot Agent");
        title.setTextColor(Color.WHITE);
        title.setTextSize(18);
        title.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams tp = new FrameLayout.LayoutParams(-2, -2);
        tp.gravity = Gravity.CENTER;
        tp.topMargin = dp(104);
        frame.addView(title, tp);
        return frame;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    @Override public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
