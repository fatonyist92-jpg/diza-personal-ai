package com.dizabot.app;

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

public final class SecretStore {
    private static final String ALIAS="dizabot_v1_master";
    private static final String PREFS="dizabot_v1_secrets";
    private final SharedPreferences p;

    public SecretStore(Context c){p=c.getSharedPreferences(PREFS,Context.MODE_PRIVATE);ensureKey();}

    private void ensureKey(){
        try{
            KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);
            if(!ks.containsAlias(ALIAS)){
                KeyGenerator kg=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
                kg.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .build());
                kg.generateKey();
            }
        }catch(Exception ignored){}
    }

    private SecretKey key() throws Exception{
        KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);
        return ((KeyStore.SecretKeyEntry)ks.getEntry(ALIAS,null)).getSecretKey();
    }

    public void put(String name,String value){
        try{
            if(value==null||value.isEmpty()){p.edit().remove(name).apply();return;}
            Cipher c=Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE,key());
            byte[] iv=c.getIV();
            byte[] enc=c.doFinal(value.getBytes(StandardCharsets.UTF_8));
            String pack=Base64.encodeToString(iv,Base64.NO_WRAP)+"."+Base64.encodeToString(enc,Base64.NO_WRAP);
            p.edit().putString(name,pack).apply();
        }catch(Exception ignored){}
    }

    public String get(String name){
        try{
            String pack=p.getString(name,"");
            if(pack==null||pack.isEmpty())return "";
            String[] parts=pack.split("\\.",2);
            if(parts.length!=2)return "";
            byte[] iv=Base64.decode(parts[0],Base64.NO_WRAP);
            byte[] enc=Base64.decode(parts[1],Base64.NO_WRAP);
            Cipher c=Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,iv));
            return new String(c.doFinal(enc),StandardCharsets.UTF_8);
        }catch(Exception e){return "";}
    }

    public boolean has(String name){String v=p.getString(name,"");return v!=null&&!v.isEmpty();}
    public void remove(String name){p.edit().remove(name).apply();}
}
