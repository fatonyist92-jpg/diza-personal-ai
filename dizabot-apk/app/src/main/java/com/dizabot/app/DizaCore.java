package com.dizabot.app;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.*;

public final class DizaCore {
    public static final String PREFS = "dizabot_core_v04";
    public static final double RESERVE_RATIO = 0.10;
    public static final boolean HARD_RP0_LOCK = true;

    public static final class Provider {
        public final String id;
        public final int priority;
        public final boolean local;
        Provider(String id, int priority, boolean local) {
            this.id = id; this.priority = priority; this.local = local;
        }
    }

    public static final Provider[] PROVIDERS = new Provider[]{
        new Provider("groq",10,false),
        new Provider("gemini",20,false),
        new Provider("cerebras",30,false),
        new Provider("zai",40,false),
        new Provider("cloudflare",50,false),
        new Provider("openrouter",60,false),
        new Provider("mistral",70,false),
        new Provider("cohere",80,false),
        new Provider("nvidia",90,false),
        new Provider("ibm",100,false),
        new Provider("alibaba",110,false),
        new Provider("awan",120,false),
        new Provider("kilo",130,false),
        new Provider("vercel",140,false),
        new Provider("huggingface",150,false),
        new Provider("local",999,true)
    };

    private DizaCore(){}

    private static SharedPreferences p(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static void bootstrap(Context c) {
        SharedPreferences sp = p(c);
        if (!sp.contains("provider.local.configured")) {
            sp.edit()
                .putBoolean("provider.local.configured", true)
                .putBoolean("provider.local.healthy", true)
                .putBoolean("hardRp0Lock", HARD_RP0_LOCK)
                .putFloat("reserveRatio", (float)RESERVE_RATIO)
                .apply();
        }
        maintenance(c);
    }

    public static Provider selectProvider(Context c) {
        SharedPreferences sp = p(c);
        ArrayList<Provider> list = new ArrayList<>(Arrays.asList(PROVIDERS));
        Collections.sort(list, Comparator.comparingInt(a -> a.priority));
        for (Provider pr : list) {
            boolean configured = pr.local || sp.getBoolean("provider."+pr.id+".configured", false);
            boolean healthy = sp.getBoolean("provider."+pr.id+".healthy", true);
            boolean paid = sp.getBoolean("provider."+pr.id+".paid", false);
            long limit = sp.getLong("quota."+pr.id+".limit", 0);
            long used = sp.getLong("quota."+pr.id+".used", 0);
            double remainingRatio = limit <= 0 ? 1.0 : Math.max(0.0, (double)(limit-used)/(double)limit);
            if (configured && healthy && !paid && remainingRatio > RESERVE_RATIO) return pr;
        }
        return PROVIDERS[PROVIDERS.length-1];
    }

    public static boolean canSpend(Context c, String providerId, long rupiahCost) {
        if (HARD_RP0_LOCK && rupiahCost > 0) return false;
        SharedPreferences sp = p(c);
        long limit = sp.getLong("quota."+providerId+".limit", 0);
        long used = sp.getLong("quota."+providerId+".used", 0);
        if (limit <= 0) return true;
        return ((double)(limit-used)/(double)limit) > RESERVE_RATIO;
    }

    public static void recordUsage(Context c, String providerId, long units) {
        SharedPreferences sp = p(c);
        long used = sp.getLong("quota."+providerId+".used", 0);
        sp.edit().putLong("quota."+providerId+".used", Math.max(0, used + units)).apply();
    }

    public static void enqueue(Context c, String type, JSONObject payload) {
        try {
            SharedPreferences sp = p(c);
            JSONArray q = queue(sp);
            JSONObject t = new JSONObject();
            t.put("id", type + ":" + UUID.randomUUID());
            t.put("type", type);
            t.put("payload", payload == null ? new JSONObject() : payload);
            t.put("status", "queued");
            t.put("attempt", 0);
            t.put("nextRunAt", System.currentTimeMillis());
            q.put(t);
            saveQueue(sp,q);
        } catch (Exception ignored) {}
    }

    public static void enqueueUnique(Context c, String id, String type, JSONObject payload) {
        try {
            SharedPreferences sp = p(c);
            JSONArray q = queue(sp);
            for (int i=0;i<q.length();i++) if (id.equals(q.getJSONObject(i).optString("id"))) return;
            JSONObject t = new JSONObject();
            t.put("id",id); t.put("type",type);
            t.put("payload", payload == null ? new JSONObject() : payload);
            t.put("status","queued"); t.put("attempt",0); t.put("nextRunAt",System.currentTimeMillis());
            q.put(t); saveQueue(sp,q);
        } catch (Exception ignored) {}
    }

    private static JSONArray queue(SharedPreferences sp) {
        try { return new JSONArray(sp.getString("queueJson","[]")); }
        catch (Exception e) { return new JSONArray(); }
    }

    private static void saveQueue(SharedPreferences sp, JSONArray q) {
        sp.edit().putString("queueJson", q.toString()).putInt("queueSize", q.length()).apply();
    }

    private static String jakartaDay() {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("Asia/Jakarta"));
        return f.format(new Date());
    }

    public static void maintenance(Context c) {
        SharedPreferences sp = p(c);
        String d = jakartaDay();
        String lastQuotaDay = sp.getString("quotaDay","");
        if (!d.equals(lastQuotaDay)) {
            SharedPreferences.Editor e=sp.edit().putString("quotaDay",d);
            for (Provider pr: PROVIDERS) {
                if ("daily".equals(sp.getString("quota."+pr.id+".period",""))) e.putLong("quota."+pr.id+".used",0);
            }
            e.apply();
        }
        if (!d.equals(sp.getString("lastAuditDay",""))) {
            enqueueUnique(c,"audit:"+d,"provider-free-tier-audit",new JSONObject());
            sp.edit().putString("lastAuditDay",d).apply();
        }
        long lastDiscovery = sp.getLong("lastDiscoveryAt",0);
        if (System.currentTimeMillis()-lastDiscovery >= 172800000L) {
            enqueueUnique(c,"discovery:"+d,"provider-discovery",new JSONObject());
            sp.edit().putLong("lastDiscoveryAt",System.currentTimeMillis()).apply();
        }
    }

    public static int pendingCount(Context c) {
        JSONArray q=queue(p(c)); int n=0;
        for(int i=0;i<q.length();i++) {
            String s=q.optJSONObject(i).optString("status");
            if (!"done".equals(s) && !"failed".equals(s)) n++;
        }
        return n;
    }

    public static long lastWorkerRun(Context c) { return p(c).getLong("lastWorkerRun",0); }

    public static final class CoreWorker extends Worker {
        public CoreWorker(@NonNull Context context, @NonNull WorkerParameters params) { super(context,params); }

        @NonNull @Override public Result doWork() {
            Context c=getApplicationContext();
            bootstrap(c);
            SharedPreferences sp=p(c);
            try {
                JSONArray q=queue(sp);
                long now=System.currentTimeMillis();
                for(int i=0;i<q.length();i++) {
                    JSONObject t=q.getJSONObject(i);
                    String status=t.optString("status","queued");
                    if ("done".equals(status)||"failed".equals(status)||now<t.optLong("nextRunAt",0)) continue;
                    String type=t.optString("type");
                    int attempt=t.optInt("attempt",0)+1;
                    t.put("attempt",attempt);
                    t.put("status","running");

                    if ("provider-free-tier-audit".equals(type)) {
                        // Connectivity/adapters plug in here. Scheduling and durable state are live now.
                        t.put("status","done");
                        sp.edit().putLong("lastAuditRunAt",now).apply();
                    } else if ("provider-discovery".equals(type)) {
                        t.put("status","done");
                        sp.edit().putLong("lastDiscoveryRunAt",now).apply();
                    } else if ("chat-request".equals(type)) {
                        Provider pr=selectProvider(c);
                        if (pr.local) {
                            t.put("status","waiting");
                            t.put("nextRunAt", now + 3600000L);
                            t.put("waitingFor","configured-free-provider");
                        } else {
                            t.put("status","queued");
                            t.put("nextRunAt", now + Math.min(3600000L, 60000L * attempt));
                            t.put("provider", pr.id);
                        }
                    } else {
                        t.put("status","done");
                    }
                    if (attempt>=12 && !"done".equals(t.optString("status"))) t.put("status","failed");
                }
                saveQueue(sp,q);
                sp.edit().putLong("lastWorkerRun",now).apply();
                return Result.success();
            } catch (Exception e) {
                return Result.retry();
            }
        }
    }
}
