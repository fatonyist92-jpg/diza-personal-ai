package com.diza.botagent;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.http.SslError;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.ProgressBar;
import android.widget.TextView;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://diza-bot-agent.floot.app";
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
        configureWebView();

        splash = buildSplash();

        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
        root.addView(splash, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));

        setContentView(root);
        webView.loadUrl(APP_URL);
    }

    private void configureWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                webView.setVisibility(View.VISIBLE);
                splash.animate().alpha(0f).setDuration(220).withEndAction(() -> splash.setVisibility(View.GONE)).start();
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
                showBlockingError("Secure connection failed");
            }

            @Override
            public void onReceivedError(WebView view, android.webkit.WebResourceRequest request,
                                        android.webkit.WebResourceError error) {
                if (request.isForMainFrame()) {
                    showBlockingError("Can't reach Diza Bot Agent");
                }
            }
        });
    }

    private FrameLayout buildSplash() {
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(Color.BLACK);

        ImageView logo = new ImageView(this);
        logo.setImageResource(com.diza.botagent.R.drawable.diza_icon);
        logo.setScaleType(ImageView.ScaleType.CENTER_CROP);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.rgb(10,10,10));
        bg.setCornerRadius(dp(28));
        bg.setStroke(dp(1), Color.rgb(36,36,36));
        logo.setBackground(bg);
        logo.setClipToOutline(true);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(dp(96), dp(96));
        lp.gravity = Gravity.CENTER;
        lp.bottomMargin = dp(44);
        frame.addView(logo, lp);

        TextView title = new TextView(this);
        title.setText("Diza Bot Agent");
        title.setTextColor(Color.WHITE);
        title.setTextSize(18);
        title.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams tp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT);
        tp.gravity = Gravity.CENTER;
        tp.topMargin = dp(92);
        frame.addView(title, tp);

        ProgressBar bar = new ProgressBar(this, null, android.R.attr.progressBarStyleSmall);
        bar.getIndeterminateDrawable().setTint(Color.rgb(159,140,255));
        FrameLayout.LayoutParams bp = new FrameLayout.LayoutParams(dp(22), dp(22));
        bp.gravity = Gravity.CENTER_HORIZONTAL | Gravity.BOTTOM;
        bp.bottomMargin = dp(54);
        frame.addView(bar, bp);
        return frame;
    }

    private void showBlockingError(String message) {
        webView.setVisibility(View.INVISIBLE);
        splash.setVisibility(View.VISIBLE);
        splash.setAlpha(1f);
        splash.removeAllViews();

        TextView text = new TextView(this);
        text.setText(message + "\n\nTap to retry");
        text.setTextColor(Color.rgb(210,210,214));
        text.setTextSize(16);
        text.setGravity(Gravity.CENTER);
        text.setPadding(dp(32), dp(32), dp(32), dp(32));
        text.setOnClickListener(v -> {
            splash.removeAllViews();
            splash.addView(buildSplash().getChildAt(0));
            webView.reload();
        });
        splash.addView(text, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
