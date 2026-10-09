package app.diza.live.voice;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.ArrayAdapter;
import android.widget.TextView;
import android.widget.Toast;
import android.widget.AdapterView;
import android.widget.LinearLayout.LayoutParams;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Stage 02 standalone Android voice proof. No WebView and no old v19 APK.
 * SpeechRecognizer -> existing Bloks agent thread -> Android TTS -> auto listen.
 * Network polling is transitional; Stage 03 replaces it with realtime events.
 */
public final class MainActivity extends Activity implements RecognitionListener, TextToSpeech.OnInitListener {
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final VoiceCycle cycle = new VoiceCycle();
    private SecretStore secretStore;
    private BloksApi api;
    private SpeechRecognizer recognition;
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private boolean recognitionReady = false;
    private boolean recognitionStarting = false;
    private boolean engineConnected = false;
    private volatile int epoch = 0;
    private String agentId = "";
    private String lease = "";
    private String spokenTranscript = "";
    private EditText endpoint;
    private EditText pairingCode;
    private TextView status;
    private TextView transcript;
    private Spinner agentsSpinner;
    private Button startButton;
    private Button stopButton;
    private final ArrayList<String> agentIds = new ArrayList<>();

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().setStatusBarColor(Color.rgb(12, 12, 17));
        getWindow().setNavigationBarColor(Color.rgb(12, 12, 17));
        secretStore = new SecretStore(this);
        buildUI();
        if (SpeechRecognizer.isRecognitionAvailable(this)) {
            recognition = SpeechRecognizer.createSpeechRecognizer(this);
            recognition.setRecognitionListener(this);
            recognitionReady = true;
        } else {
            status("Android tidak menyediakan SpeechRecognizer. Cek layanan pengenal suara.");
        }
        tts = new TextToSpeech(this, this);
    }

    private TextView text(String value, int sp) {
        TextView t = new TextView(this);
        t.setText(value);
        t.setTextSize(sp);
        t.setTextColor(Color.WHITE);
        t.setPadding(0, 6, 0, 6);
        return t;
    }
    private Button button(String title, LinearLayout into, View.OnClickListener fn) {
        Button b = new Button(this);
        b.setAllCaps(false);
        b.setText(title);
        b.setOnClickListener(fn);
        into.addView(b, new LayoutParams(-1, -2));
        return b;
    }
    private EditText field(LinearLayout into, String placeholder, int type) {
        EditText field = new EditText(this);
        field.setSingleLine(true);
        field.setTextSize(15);
        field.setTextColor(Color.WHITE);
        field.setHintTextColor(Color.LTGRAY);
        field.setHint(placeholder);
        field.setInputType(type);
        into.addView(field, new LayoutParams(-1, -2));
        return field;
    }
    private void buildUI() {
        ScrollView outer = new ScrollView(this);
        outer.setFillViewport(true);
        outer.setBackgroundColor(Color.rgb(12, 12, 17));
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(26, 28, 26, 28);
        outer.addView(box);
        TextView title = text("DIZA LIVE  •  VOICE LAB", 23);
        title.setGravity(Gravity.CENTER);
        box.addView(title);
        TextView label = text("Stage 02 · Uji ngobrol langsung memakai Bloks Core", 13);
        label.setGravity(Gravity.CENTER);
        label.setTextColor(Color.LTGRAY);
        box.addView(label);
        box.addView(text("Server Bloks (HTTPS)", 14));
        endpoint = field(box, "https://server-bloks.example", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        endpoint.setText(secretStore.origin());
        box.addView(text("Kode pairing sekali (6 digit)", 14));
        pairingCode = field(box, "Masukkan kode dari pengaturan Bloks", InputType.TYPE_CLASS_NUMBER);
        button("1. Pasangkan perangkat", box, v -> pair());
        button("2. Hubungkan dan pilih agent", box, v -> connect());
        box.addView(text("Agent Bloks", 14));
        agentsSpinner = new Spinner(this);
        box.addView(agentsSpinner);
        status = text("Siap menghubungkan Bloks.", 16);
        status.setGravity(Gravity.CENTER);
        status.setMinHeight(85);
        box.addView(status);
        transcript = text("Transkrip percakapan akan terlihat di sini.", 14);
        transcript.setTextColor(Color.LTGRAY);
        transcript.setMinHeight(95);
        box.addView(transcript);
        startButton = button("🎙 MULAI LIVE VOICE", box, v -> requestStart());
        stopButton = button("■ AKHIRI PANGGILAN", box, v -> stopSession());
        stopButton.setEnabled(false);
        TextView note = text("Prototype Stage 2: suara→agent→suara. Belum barge-in, lip-sync, atau UI avatar final.", 12);
        note.setTextColor(Color.LTGRAY);
        box.addView(note);
        setContentView(outer);
    }
    private void status(String s) { if (status != null) ui.post(() -> status.setText(s)); }
    private void display(String s) { ui.post(() -> transcript.setText(s)); }
    private void error(Throwable e) {
        String s = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
        status("Gagal: " + s);
    }
    private BloksApi setupApi() {
        BloksApi result = new BloksApi(endpoint.getText().toString(), secretStore.token());
        secretStore.saveOrigin(result.origin);
        api = result;
        return result;
    }
    private void pair() {
        if (cycle.state() != VoiceCycle.State.STOPPED) {
            status("Akhiri sesi live sebelum mengganti pairing.");
            return;
        }
        String code = pairingCode.getText().toString().trim();
        if (!code.matches("[0-9]{6}")) { status("Butuh kode pairing 6 digit dari Bloks."); return; }
        BloksApi session;
        try { session = setupApi(); } catch (Exception e) { error(e); return; }
        status("Memasangkan perangkat...");
        io.execute(() -> {
            try {
                JSONObject response = session.pair(code);
                String token = response.getString("token");
                secretStore.saveToken(token);
                session.setToken(token);
                ui.post(() -> pairingCode.setText(""));
                status("Perangkat berhasil dipasangkan. Tekan Hubungkan.");
            } catch (Exception e) { error(e); }
        });
    }
    private void connect() {
        if (cycle.state() != VoiceCycle.State.STOPPED) { status("Akhiri panggilan lebih dulu."); return; }
        BloksApi session;
        try { session = setupApi(); } catch (Exception e) { error(e); return; }
        status("Menghubungkan ke Bloks...");
        engineConnected = false;
        io.execute(() -> {
            try {
                session.health();
                JSONArray found = session.agents();
                boolean ready = session.hasConnectedEngine();
                ArrayList<String> names = new ArrayList<>();
                ArrayList<String> ids = new ArrayList<>();
                for (int i=0; i<found.length(); i++) {
                    JSONObject agent=found.getJSONObject(i);
                    names.add(agent.optString("name", "Agent " + (i+1)));
                    ids.add(agent.getString("id"));
                }
                ui.post(() -> {
                    engineConnected = ready;
                    agentIds.clear();
                    agentIds.addAll(ids);
                    ArrayAdapter<String> adapter = new ArrayAdapter<>(this,
                        android.R.layout.simple_spinner_item, names);
                    adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
                    agentsSpinner.setAdapter(adapter);
                    agentsSpinner.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
                        @Override public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                            agentId = agentIds.get(position);
                        }
                        @Override public void onNothingSelected(AdapterView<?> parent) { agentId = ""; }
                    });
                    if (names.isEmpty()) status("Server tersambung, tetapi belum ada agent Bloks.");
                    else if (!ready) status("Pairing dan agent OK, tetapi engine AI belum tersambung di Bloks. Atur engine di server dulu.");
                    else status("Engine aktif. Pilih agent lalu Mulai Live.");
                });
            } catch (Exception e) { error(e); }
        });
    }
    private void requestStart() {
        if (api == null || agentId.isEmpty()) { status("Hubungkan dan pilih agent Bloks dahulu."); return; }
        if (!engineConnected) { status("Engine AI belum terhubung di Bloks. Hubungkan engine di server, lalu tekan Hubungkan lagi."); return; }
        if (!recognitionReady) { status("SpeechRecognizer tidak tersedia di HP ini."); return; }
        if (!ttsReady) { status("TextToSpeech Indonesia belum siap. Periksa voice pack Android."); return; }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 44);
            return;
        }
        startSession();
    }
    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == 44) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) startSession();
            else status("Izin mikrofon ditolak. Live Voice memerlukan mikrofon.");
        }
    }
    private void startSession() {
        if (cycle.state() != VoiceCycle.State.STOPPED) return;
        final int myEpoch = ++epoch;
        startButton.setEnabled(false);
        stopButton.setEnabled(true);
        status("Memulai sesi Bloks...");
        io.execute(() -> {
            try {
                String acquired = api.claim(agentId);
                if (myEpoch != epoch) { api.release(acquired); return; }
                lease = acquired;
                ui.post(() -> {
                    if (myEpoch != epoch) return;
                    cycle.begin();
                    startListening();
                });
                scheduleRenew(myEpoch);
            } catch (Exception e) {
                if (myEpoch == epoch) ui.post(() -> stopSessionWithError(e));
            }
        });
    }
    private void scheduleRenew(int myEpoch) {
        ui.postDelayed(() -> {
            if (myEpoch != epoch || lease.isEmpty()) return;
            String currentLease = lease;
            io.execute(() -> {
                try { api.renew(currentLease); }
                catch (Exception e) {
                    if (myEpoch == epoch) ui.post(() -> stopSessionWithError(e));
                }
            });
            scheduleRenew(myEpoch);
        }, 6500);
    }
    private void startListening() {
        if (cycle.state() != VoiceCycle.State.LISTENING || recognition == null) return;
        if (recognitionStarting) return;
        recognitionStarting = true;
        status("🎙 Mendengarkan... (selesai bicara, Diza akan menjawab)");
        try {
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "id-ID");
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            recognition.startListening(intent);
        } catch (Exception e) {
            recognitionStarting = false;
            stopSessionWithError(e);
        }
    }
    @Override public void onReadyForSpeech(Bundle p) { }
    @Override public void onBeginningOfSpeech() { status("Diza mendengar suara lu..."); }
    @Override public void onRmsChanged(float rms) { }
    @Override public void onBufferReceived(byte[] buffer) { }
    @Override public void onEndOfSpeech() { status("Memproses ucapan..."); }
    @Override public void onPartialResults(Bundle partial) {
        if (cycle.state() != VoiceCycle.State.LISTENING) return;
        ArrayList<String> lines=partial.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (lines != null && !lines.isEmpty()) display("Lu: " + lines.get(0));
    }
    @Override public void onResults(Bundle results) {
        recognitionStarting = false;
        ArrayList<String> lines=results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (lines == null || lines.isEmpty() || lines.get(0).trim().isEmpty()) {
            retryListening(650);
            return;
        }
        String said=lines.get(0).trim();
        if (!cycle.heard(said)) return;
        spokenTranscript = said;
        display("Lu: " + said);
        status("Bloks sedang berpikir...");
        int myEpoch=epoch;
        String id=agentId;
        io.execute(() -> {
            try {
                JSONObject agent=BloksApi.find(api.agents(), id);
                Set<String> baseline=BloksApi.existingReplies(agent);
                api.send(id, said);
                ui.post(() -> pollReply(myEpoch, id, baseline, System.currentTimeMillis()));
            } catch (Exception e) {
                if (myEpoch == epoch) ui.post(() -> stopSessionWithError(e));
            }
        });
    }
    private void pollReply(int myEpoch, String id, Set<String> baseline, long began) {
        if (myEpoch != epoch || cycle.state() != VoiceCycle.State.WAITING) return;
        if (System.currentTimeMillis() - began > 90000) {
            stopSessionWithError(new IllegalStateException("Bloks belum menjawab dalam 90 detik."));
            return;
        }
        io.execute(() -> {
            try {
                JSONObject agent=BloksApi.find(api.agents(), id);
                String reply=BloksApi.newReply(agent, baseline);
                String notice=reply == null ? BloksApi.newNotice(agent, baseline) : null;
                ui.post(() -> {
                    if (myEpoch != epoch || cycle.state() != VoiceCycle.State.WAITING) return;
                    if (reply != null && cycle.answered(reply)) say(reply, myEpoch);
                    else if (notice != null) {
                        display("Lu: " + spokenTranscript + "\\n\\nBloks: " + notice);
                        stopSessionWithError(new IllegalStateException(notice));
                    } else ui.postDelayed(() -> pollReply(myEpoch, id, baseline, began), 1150);
                });
            } catch (Exception e) {
                if (myEpoch == epoch) ui.post(() -> stopSessionWithError(e));
            }
        });
    }
    private void say(String reply, int myEpoch) {
        display("Lu: " + spokenTranscript + "\n\nDiza: " + reply);
        status("🔊 Diza berbicara...");
        Bundle opts = new Bundle();
        String utteranceId = "diza_" + myEpoch + "_" + cycle.turnsAccepted();
        int result=tts.speak(reply, TextToSpeech.QUEUE_FLUSH, opts, utteranceId);
        if (result != TextToSpeech.SUCCESS) stopSessionWithError(new IllegalStateException("TextToSpeech gagal memutar audio"));
    }
    private void retryListening(long delayMs) {
        if (cycle.state() == VoiceCycle.State.LISTENING) ui.postDelayed(this::startListening, delayMs);
    }
    @Override public void onError(int code) {
        recognitionStarting = false;
        if (cycle.state() != VoiceCycle.State.LISTENING) return;
        if (code == SpeechRecognizer.ERROR_NO_MATCH || code == SpeechRecognizer.ERROR_SPEECH_TIMEOUT
            || code == SpeechRecognizer.ERROR_CLIENT || code == SpeechRecognizer.ERROR_RECOGNIZER_BUSY) {
            status("Mikrofon menunggu suara...");
            retryListening(1100);
        } else {
            stopSessionWithError(new IllegalStateException("Android speech error " + code));
        }
    }
    @Override public void onEvent(int kind, Bundle params) { }
    @Override public void onInit(int result) {
        if (result != TextToSpeech.SUCCESS) {
            status("TextToSpeech Android tidak tersedia.");
            return;
        }
        int available=tts.setLanguage(Locale.forLanguageTag("id-ID"));
        ttsReady = available != TextToSpeech.LANG_MISSING_DATA && available != TextToSpeech.LANG_NOT_SUPPORTED;
        if (!ttsReady) status("Paket bahasa Indonesia TTS belum tersedia pada Android.");
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String id) { }
            @Override public void onDone(String id) {
                ui.post(() -> {
                    if (id == null || !id.startsWith("diza_" + epoch + "_")) return;
                    if (cycle.speechEnded()) {
                        status("Giliran selesai: " + cycle.turnsCompleted() + ". Mendengarkan lagi...");
                        ui.postDelayed(MainActivity.this::startListening, 350);
                    }
                });
            }
            @Override public void onError(String id) {
                ui.post(() -> {
                    if (id != null && id.startsWith("diza_" + epoch + "_")) {
                        stopSessionWithError(new IllegalStateException("TextToSpeech playback error"));
                    }
                });
            }
        });
    }
    private void stopSessionWithError(Throwable e) {
        if (cycle.state() == VoiceCycle.State.STOPPED) {
            error(e);
            startButton.setEnabled(true);
            stopButton.setEnabled(false);
            return;
        }
        stopSession();
        error(e);
    }
    private void stopSession() {
        ++epoch;
        cycle.stop();
        recognitionStarting = false;
        if (recognition != null) recognition.cancel();
        if (tts != null) tts.stop();
        String oldLease=lease;
        lease="";
        if (!oldLease.isEmpty() && api != null) io.execute(() -> {
            try { api.release(oldLease); } catch (Exception ignored) { }
        });
        startButton.setEnabled(true);
        stopButton.setEnabled(false);
        status("Panggilan berakhir. Selesai " + cycle.turnsCompleted() + " giliran.");
    }
    @Override protected void onDestroy() {
        stopSession();
        if (recognition != null) recognition.destroy();
        if (tts != null) tts.shutdown();
        io.shutdown();
        super.onDestroy();
    }
}
