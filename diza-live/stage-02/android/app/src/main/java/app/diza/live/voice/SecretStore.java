package app.diza.live.voice;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** AndroidKeyStore-backed token, never packaged with APK or logged. */
final class SecretStore {
    private static final String ALIAS = "diza_live_pairing_stage2_v1";
    private final SharedPreferences prefs;
    SecretStore(Context context) {
        prefs = context.getSharedPreferences("diza_live_config", Context.MODE_PRIVATE);
    }
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(ALIAS)) return ((KeyStore.SecretKeyEntry) store.getEntry(ALIAS, null)).getSecretKey();
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build());
        return generator.generateKey();
    }
    void saveOrigin(String origin) { prefs.edit().putString("origin", origin).apply(); }
    String origin() { return prefs.getString("origin", ""); }
    void saveToken(String token) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] bytes = cipher.doFinal(token.getBytes(StandardCharsets.UTF_8));
        prefs.edit()
            .putString("token_iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
            .putString("token_data", Base64.encodeToString(bytes, Base64.NO_WRAP)).apply();
    }
    String token() {
        try {
            String iv = prefs.getString("token_iv", "");
            String data = prefs.getString("token_data", "");
            if (iv.isEmpty() || data.isEmpty()) return "";
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
            return new String(cipher.doFinal(Base64.decode(data, Base64.NO_WRAP)), StandardCharsets.UTF_8);
        } catch (Exception ignored) {
            return "";
        }
    }
    void clearToken() { prefs.edit().remove("token_iv").remove("token_data").apply(); }
}
