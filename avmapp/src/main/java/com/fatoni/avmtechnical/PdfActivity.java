package com.fatoni.avmtechnical;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.widget.Button;
import android.widget.EditText;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

public class PdfActivity extends Activity {
    private final Set<String> allowed = new HashSet<>(Arrays.asList(
            "Electrical Drawing.PDF",
            "Pneumatic & Hydraulic Drawing.PDF",
            "Main Panel Drawing.PDF",
            "Manual User.PDF"
    ));

    private PdfRenderer renderer;
    private ParcelFileDescriptor descriptor;
    private ImageView image;
    private TextView pageText;
    private TextView titleText;
    private Bitmap bitmap;
    private int pageIndex = 0;
    private float zoom = 1.0f;
    private String fileName;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        w.setStatusBarColor(Color.WHITE);
        w.setNavigationBarColor(Color.WHITE);
        w.getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        );

        fileName = getIntent().getStringExtra("file");
        pageIndex = Math.max(0, getIntent().getIntExtra("page", 1) - 1);
        if (!allowed.contains(fileName)) {
            Toast.makeText(this, "Dokumen tidak valid", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        buildUi();
        try {
            File f = prepareAsset(fileName);
            descriptor = ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY);
            renderer = new PdfRenderer(descriptor);
            pageIndex = Math.min(pageIndex, Math.max(0, renderer.getPageCount() - 1));
            renderPage();
        } catch (Exception e) {
            Toast.makeText(this, "PDF belum tersedia di paket aplikasi", Toast.LENGTH_LONG).show();
            finish();
        }
    }

    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(dp(8), dp(8), dp(8), dp(8));

        Button back = button("‹");
        back.setOnClickListener(v -> finish());
        top.addView(back, new LinearLayout.LayoutParams(dp(52), dp(48)));

        titleText = new TextView(this);
        titleText.setText(fileName);
        titleText.setTextColor(Color.rgb(25,25,25));
        titleText.setTextSize(15);
        titleText.setGravity(Gravity.CENTER_VERTICAL);
        titleText.setSingleLine(true);
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(0, dp(48), 1);
        tp.setMargins(dp(6), 0, dp(6), 0);
        top.addView(titleText, tp);

        pageText = new TextView(this);
        pageText.setTextColor(Color.rgb(70,70,70));
        pageText.setTextSize(12);
        pageText.setGravity(Gravity.CENTER);
        pageText.setPadding(dp(6), 0, dp(6), 0);
        top.addView(pageText, new LinearLayout.LayoutParams(dp(84), dp(48)));

        root.addView(top, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        ScrollView vertical = new ScrollView(this);
        vertical.setFillViewport(true);
        HorizontalScrollView horizontal = new HorizontalScrollView(this);
        horizontal.setFillViewport(true);
        image = new ImageView(this);
        image.setBackgroundColor(Color.rgb(245,245,245));
        image.setAdjustViewBounds(true);
        image.setScaleType(ImageView.ScaleType.FIT_CENTER);
        horizontal.addView(image, new HorizontalScrollView.LayoutParams(
                HorizontalScrollView.LayoutParams.WRAP_CONTENT,
                HorizontalScrollView.LayoutParams.WRAP_CONTENT
        ));
        vertical.addView(horizontal, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT,
                ScrollView.LayoutParams.WRAP_CONTENT
        ));
        root.addView(vertical, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));

        LinearLayout controls = new LinearLayout(this);
        controls.setOrientation(LinearLayout.HORIZONTAL);
        controls.setGravity(Gravity.CENTER);
        controls.setPadding(dp(8), dp(8), dp(8), dp(10));

        Button prev = button("‹ Prev");
        Button jump = button("Page");
        Button next = button("Next ›");
        Button minus = button("−");
        Button plus = button("+");

        prev.setOnClickListener(v -> { if (pageIndex > 0) { pageIndex--; renderPage(); }});
        next.setOnClickListener(v -> { if (renderer != null && pageIndex < renderer.getPageCount()-1) { pageIndex++; renderPage(); }});
        jump.setOnClickListener(v -> showJumpDialog());
        minus.setOnClickListener(v -> { zoom = Math.max(0.65f, zoom - 0.25f); renderPage(); });
        plus.setOnClickListener(v -> { zoom = Math.min(3.0f, zoom + 0.25f); renderPage(); });

        LinearLayout.LayoutParams wp = new LinearLayout.LayoutParams(0, dp(48), 1);
        wp.setMargins(dp(3), 0, dp(3), 0);
        controls.addView(prev, wp);
        controls.addView(minus, new LinearLayout.LayoutParams(dp(48), dp(48)));
        controls.addView(jump, wp);
        controls.addView(plus, new LinearLayout.LayoutParams(dp(48), dp(48)));
        controls.addView(next, wp);

        root.addView(controls, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        setContentView(root);
    }

    private Button button(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setTextSize(12);
        b.setAllCaps(false);
        b.setTextColor(Color.rgb(28,28,28));
        b.setBackgroundColor(Color.rgb(244,244,244));
        return b;
    }

    private File prepareAsset(String name) throws Exception {
        File dir = new File(getCacheDir(), "avm_pdfs");
        if (!dir.exists()) dir.mkdirs();
        File out = new File(dir, name.replaceAll("[^A-Za-z0-9._-]", "_"));
        if (out.exists() && out.length() > 1024) return out;
        try (InputStream in = getAssets().open("pdfs/" + name);
             FileOutputStream fos = new FileOutputStream(out)) {
            byte[] buf = new byte[1024 * 64];
            int n;
            while ((n = in.read(buf)) > 0) fos.write(buf, 0, n);
        }
        return out;
    }

    private void renderPage() {
        if (renderer == null || renderer.getPageCount() == 0) return;
        PdfRenderer.Page page = renderer.openPage(pageIndex);
        int screenW = getResources().getDisplayMetrics().widthPixels;
        float base = Math.max(1.0f, (screenW - dp(16)) / (float) page.getWidth());
        float scale = base * zoom;
        int w = Math.max(1, (int)(page.getWidth() * scale));
        int h = Math.max(1, (int)(page.getHeight() * scale));
        if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
        bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        bitmap.eraseColor(Color.WHITE);
        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
        page.close();

        image.setImageBitmap(bitmap);
        image.getLayoutParams().width = w;
        image.getLayoutParams().height = h;
        image.requestLayout();
        pageText.setText((pageIndex + 1) + " / " + renderer.getPageCount());
    }

    private void showJumpDialog() {
        if (renderer == null) return;
        EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_NUMBER);
        input.setHint("1 - " + renderer.getPageCount());
        input.setText(String.valueOf(pageIndex + 1));
        new AlertDialog.Builder(this)
                .setTitle("Buka halaman")
                .setView(input)
                .setNegativeButton("Batal", null)
                .setPositiveButton("Buka", (d, w) -> {
                    try {
                        int p = Integer.parseInt(input.getText().toString().trim());
                        if (p >= 1 && p <= renderer.getPageCount()) {
                            pageIndex = p - 1;
                            renderPage();
                        }
                    } catch (Exception ignored) {}
                }).show();
    }

    private int dp(int v) {
        return (int)(v * getResources().getDisplayMetrics().density + 0.5f);
    }

    @Override
    protected void onDestroy() {
        if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
        try { if (renderer != null) renderer.close(); } catch (Exception ignored) {}
        try { if (descriptor != null) descriptor.close(); } catch (Exception ignored) {}
        super.onDestroy();
    }
}
