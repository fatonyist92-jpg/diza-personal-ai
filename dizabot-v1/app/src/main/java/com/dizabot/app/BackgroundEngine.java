package com.dizabot.app;

import android.Manifest;
import android.app.*;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.*;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.concurrent.TimeUnit;

public final class BackgroundEngine {
    private static final String PREFS="dizabot_v1_tasks";
    private static final String CHANNEL="dizabot_tasks";
    private static final Object LOCK=new Object();

    private BackgroundEngine(){}

    private static SharedPreferences p(Context c){return c.getSharedPreferences(PREFS,Context.MODE_PRIVATE);}
    private static JSONArray queue(Context c){
        try{return new JSONArray(p(c).getString("queue","[]"));}catch(Exception e){return new JSONArray();}
    }
    private static void save(Context c,JSONArray a){p(c).edit().putString("queue",a.toString()).putInt("pending",countPending(a)).apply();}
    private static int countPending(JSONArray a){
        int n=0;for(int i=0;i<a.length();i++){JSONObject t=a.optJSONObject(i);if(t==null)continue;String s=t.optString("status");if(!"done".equals(s)&&!"failed".equals(s))n++;}return n;
    }

    public static void bootstrap(Context c){
        Context app=c.getApplicationContext();
        createChannel(app);
        scheduleRecovery(app);
        scheduleAudit(app);
        scheduleDiscovery(app);
        scheduleRoutines(app);
    }

    public static String enqueueChat(Context c,String chatId,String botId,String prompt,String speaker){
        try{
            JSONObject payload=new JSONObject()
                .put("chatId",chatId).put("botId",botId).put("prompt",prompt).put("speaker",speaker==null?"":speaker);
            return enqueue(c,"chat-request",payload);
        }catch(Exception e){return null;}
    }

    public static String enqueue(Context c,String type,JSONObject payload){
        synchronized(LOCK){
            try{
                JSONArray q=queue(c);
                String id=type+":"+System.currentTimeMillis()+":"+UUID.randomUUID();
                q.put(new JSONObject()
                    .put("id",id).put("type",type).put("payload",payload==null?new JSONObject():payload)
                    .put("status","queued").put("attempt",0).put("nextRunAt",System.currentTimeMillis())
                    .put("createdAt",System.currentTimeMillis()));
                save(c,q);kick(c);return id;
            }catch(Exception e){return null;}
        }
    }

    public static int pending(Context c){return p(c).getInt("pending",0);}
    public static long lastRun(Context c){return p(c).getLong("lastWorkerRun",0);}

    public static JSONArray queueSnapshot(Context c){synchronized(LOCK){return queue(c);}}

    private static void kick(Context c){
        OneTimeWorkRequest w=new OneTimeWorkRequest.Builder(TaskWorker.class).setConstraints(networkConstraint()).build();
        WorkManager.getInstance(c).enqueueUniqueWork("dizabot-task-now",ExistingWorkPolicy.APPEND_OR_REPLACE,w);
    }

    private static Constraints networkConstraint(){return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();}

    private static void scheduleRecovery(Context c){
        PeriodicWorkRequest w=new PeriodicWorkRequest.Builder(TaskWorker.class,15,TimeUnit.MINUTES)
            .setConstraints(networkConstraint()).build();
        WorkManager.getInstance(c).enqueueUniquePeriodicWork("dizabot-task-recovery",ExistingPeriodicWorkPolicy.KEEP,w);
    }

    private static void scheduleRoutines(Context c){
        PeriodicWorkRequest w=new PeriodicWorkRequest.Builder(RoutineWorker.class,15,TimeUnit.MINUTES).build();
        WorkManager.getInstance(c).enqueueUniquePeriodicWork("dizabot-routines",ExistingPeriodicWorkPolicy.KEEP,w);
    }

    private static void scheduleDiscovery(Context c){
        PeriodicWorkRequest w=new PeriodicWorkRequest.Builder(DiscoveryWorker.class,48,TimeUnit.HOURS)
            .setConstraints(networkConstraint()).build();
        WorkManager.getInstance(c).enqueueUniquePeriodicWork("dizabot-provider-discovery",ExistingPeriodicWorkPolicy.KEEP,w);
    }

    public static void scheduleAudit(Context c){
        long delay=millisUntilNextJakartaMidnight();
        OneTimeWorkRequest w=new OneTimeWorkRequest.Builder(AuditWorker.class)
            .setInitialDelay(delay,TimeUnit.MILLISECONDS).setConstraints(networkConstraint()).build();
        WorkManager.getInstance(c).enqueueUniqueWork("dizabot-provider-audit",ExistingWorkPolicy.REPLACE,w);
    }

    private static long millisUntilNextJakartaMidnight(){
        Calendar now=Calendar.getInstance(TimeZone.getTimeZone("Asia/Jakarta"));
        Calendar next=(Calendar)now.clone();
        next.add(Calendar.DAY_OF_MONTH,1);
        next.set(Calendar.HOUR_OF_DAY,0);next.set(Calendar.MINUTE,0);next.set(Calendar.SECOND,0);next.set(Calendar.MILLISECOND,0);
        return Math.max(60000,next.getTimeInMillis()-now.getTimeInMillis());
    }

    public static final class TaskWorker extends Worker {
        public TaskWorker(@NonNull Context c,@NonNull WorkerParameters p){super(c,p);}
        @NonNull @Override public Result doWork(){
            Context c=getApplicationContext();
            ProviderEngine pe=new ProviderEngine(c);
            AppStore store=new AppStore(c);
            int handled=0;
            synchronized(LOCK){
                try{
                    JSONArray q=queue(c);
                    long now=System.currentTimeMillis();
                    for(int i=0;i<q.length()&&handled<4;i++){
                        JSONObject t=q.optJSONObject(i);if(t==null)continue;
                        String state=t.optString("status","queued");
                        if("done".equals(state)||"failed".equals(state)||now<t.optLong("nextRunAt",0))continue;
                        if(!"chat-request".equals(t.optString("type"))){t.put("status","done");continue;}
                        handled++;
                        int attempt=t.optInt("attempt",0)+1;t.put("attempt",attempt).put("status","running");
                        JSONObject x=t.optJSONObject("payload");if(x==null)x=new JSONObject();
                        String chatId=x.optString("chatId"),botId=x.optString("botId"),prompt=x.optString("prompt"),speaker=x.optString("speaker");
                        ProviderEngine.ChatResult r=pe.chat(store.instructions(botId),prompt);
                        if(r.ok){
                            String who=speaker.isEmpty()?store.botName(botId):speaker;
                            store.addMessage(chatId,"assistant",r.text,who,"");
                            t.put("status","done").put("provider",r.provider).put("completedAt",System.currentTimeMillis());
                            notifyReply(c,who,r.text);
                        }else{
                            t.put("lastError",r.error);
                            if("NO_VERIFIED_FREE_PROVIDER".equals(r.error)){
                                t.put("status","waiting").put("nextRunAt",System.currentTimeMillis()+3600000L);
                            }else if(attempt>=6){
                                t.put("status","failed").put("failedAt",System.currentTimeMillis());
                            }else{
                                long delay=Math.min(3600000L,(long)Math.pow(2,Math.min(attempt,5))*60000L);
                                t.put("status","queued").put("nextRunAt",System.currentTimeMillis()+delay);
                            }
                        }
                    }
                    save(c,q);
                    p(c).edit().putLong("lastWorkerRun",System.currentTimeMillis()).apply();
                }catch(Exception e){return Result.retry();}
            }
            return Result.success();
        }
    }

    public static final class AuditWorker extends Worker {
        public AuditWorker(@NonNull Context c,@NonNull WorkerParameters p){super(c,p);}
        @NonNull @Override public Result doWork(){
            Context c=getApplicationContext();
            new ProviderEngine(c).auditConfiguredProviders();
            scheduleAudit(c);
            return Result.success();
        }
    }

    public static final class DiscoveryWorker extends Worker {
        public DiscoveryWorker(@NonNull Context c,@NonNull WorkerParameters p){super(c,p);}
        @NonNull @Override public Result doWork(){
            new ProviderEngine(getApplicationContext()).discoverProviders();
            return Result.success();
        }
    }

    public static final class RoutineWorker extends Worker {
        public RoutineWorker(@NonNull Context c,@NonNull WorkerParameters p){super(c,p);}
        @NonNull @Override public Result doWork(){
            Context c=getApplicationContext();AppStore s=new AppStore(c);
            String day=day(),hhmm=hhmm();
            JSONArray bots=s.bots();
            for(int i=0;i<bots.length();i++){
                JSONObject b=bots.optJSONObject(i);if(b!=null)runOwner(c,s,"bot."+b.optString("id"),b.optString("id"),b.optString("id"),b.optString("name"),hhmm,day);
            }
            JSONArray groups=s.groups();
            for(int i=0;i<groups.length();i++){
                JSONObject g=groups.optJSONObject(i);if(g==null)continue;
                String gid=g.optString("id");JSONArray members=g.optJSONArray("members");if(members==null)continue;
                JSONArray routines=s.routines("group."+gid);
                boolean changed=false;
                for(int j=0;j<routines.length();j++){
                    JSONObject r=routines.optJSONObject(j);if(r==null||!r.optBoolean("enabled",true))continue;
                    if(!hhmm.equals(r.optString("time"))||day.equals(r.optString("lastRunDay")))continue;
                    String prompt=r.optString("prompt");
                    for(int m=0;m<members.length();m++){String bid=members.optString(m);enqueueChat(c,gid,bid,prompt,s.botName(bid));}
                    r.put("lastRunDay",day);changed=true;
                }
                if(changed)s.saveRoutines("group."+gid,routines);
            }
            return Result.success();
        }

        private void runOwner(Context c,AppStore s,String ownerKey,String chatId,String botId,String speaker,String hhmm,String day){
            JSONArray routines=s.routines(ownerKey);boolean changed=false;
            for(int j=0;j<routines.length();j++){
                JSONObject r=routines.optJSONObject(j);if(r==null||!r.optBoolean("enabled",true))continue;
                if(!hhmm.equals(r.optString("time"))||day.equals(r.optString("lastRunDay")))continue;
                enqueueChat(c,chatId,botId,r.optString("prompt"),speaker);r.put("lastRunDay",day);changed=true;
            }
            if(changed)s.saveRoutines(ownerKey,routines);
        }

        private String day(){
            SimpleDateFormat f=new SimpleDateFormat("yyyy-MM-dd",Locale.US);f.setTimeZone(TimeZone.getTimeZone("Asia/Jakarta"));return f.format(new Date());
        }
        private String hhmm(){
            SimpleDateFormat f=new SimpleDateFormat("HH:mm",Locale.US);f.setTimeZone(TimeZone.getTimeZone("Asia/Jakarta"));return f.format(new Date());
        }
    }

    private static void createChannel(Context c){
        if(Build.VERSION.SDK_INT>=26){
            NotificationManager nm=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
            nm.createNotificationChannel(new NotificationChannel(CHANNEL,"DIZAbot tasks",NotificationManager.IMPORTANCE_DEFAULT));
        }
    }

    private static void notifyReply(Context c,String title,String text){
        AppStore s=new AppStore(c);if(!s.bool("settings.notifications",true))return;
        if(Build.VERSION.SDK_INT>=33&&c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return;
        Intent i=new Intent(c,MainActivity.class);PendingIntent pi=PendingIntent.getActivity(c,0,i,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n=new NotificationCompat.Builder(c,CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title).setContentText(text.length()>100?text.substring(0,100)+"…":text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(pi).setAutoCancel(true).build();
        ((NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE)).notify((int)(System.currentTimeMillis()%100000),n);
    }
}
