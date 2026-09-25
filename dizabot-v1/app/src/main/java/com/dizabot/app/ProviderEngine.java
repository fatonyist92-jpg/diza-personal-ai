package com.dizabot.app;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.*;

public final class ProviderEngine {
    public static final boolean HARD_RP0_LOCK=true;
    public static final double RESERVE_RATIO=0.10;
    private static final String PREFS="dizabot_v1_providers";
    private static final String DISCOVERY_URL="https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

    public static final class Def {
        public final String id,name,endpoint;
        public Def(String id,String name,String endpoint){this.id=id;this.name=name;this.endpoint=endpoint;}
    }

    public static final Def[] CATALOG=new Def[]{
        new Def("groq","Groq","https://api.groq.com/openai/v1/chat/completions"),
        new Def("gemini","Gemini","https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"),
        new Def("cerebras","Cerebras","https://api.cerebras.ai/v1/chat/completions"),
        new Def("zai","Z.AI",""),
        new Def("cloudflare","Cloudflare Workers AI",""),
        new Def("openrouter","OpenRouter","https://openrouter.ai/api/v1/chat/completions"),
        new Def("mistral","Mistral","https://api.mistral.ai/v1/chat/completions"),
        new Def("cohere","Cohere",""),
        new Def("nvidia","NVIDIA NIM","https://integrate.api.nvidia.com/v1/chat/completions"),
        new Def("ibm","IBM",""),
        new Def("alibaba","Alibaba","https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions"),
        new Def("awan","Awan",""),
        new Def("kilo","Kilo",""),
        new Def("vercel","Vercel",""),
        new Def("huggingface","Hugging Face","https://router.huggingface.co/v1/chat/completions"),
        new Def("local","Local model","")
    };

    public static final class ChatResult {
        public final boolean ok;
        public final String text,provider,error;
        public final int httpCode;
        ChatResult(boolean ok,String text,String provider,String error,int httpCode){
            this.ok=ok;this.text=text;this.provider=provider;this.error=error;this.httpCode=httpCode;
        }
    }

    private final Context context;
    private final SharedPreferences p;
    private final SecretStore secrets;

    public ProviderEngine(Context c){
        context=c.getApplicationContext();
        p=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
        secrets=new SecretStore(context);
        seed();
        resetDailyIfNeeded();
    }

    private void seed(){
        if(p.getBoolean("seeded",false))return;
        SharedPreferences.Editor e=p.edit().putBoolean("seeded",true);
        for(int i=0;i<CATALOG.length;i++){
            Def d=CATALOG[i];
            e.putInt(k(d.id,"priority"),(i+1)*10);
            e.putBoolean(k(d.id,"enabled"),false);
            e.putBoolean(k(d.id,"verifiedFree"),false);
            e.putString(k(d.id,"endpoint"),d.endpoint);
            e.putString(k(d.id,"model"),"");
            e.putString(k(d.id,"status"),"NOT_CONFIGURED");
            e.putLong(k(d.id,"requestLimit"),0);
            e.putLong(k(d.id,"tokenLimit"),0);
            e.putLong(k(d.id,"requestsUsed"),0);
            e.putLong(k(d.id,"tokensUsed"),0);
        }
        e.apply();
    }

    private static String k(String id,String field){return "provider."+id+"."+field;}
    private String jakartaDay(){
        SimpleDateFormat f=new SimpleDateFormat("yyyy-MM-dd",Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("Asia/Jakarta"));
        return f.format(new Date());
    }

    public void resetDailyIfNeeded(){
        String d=jakartaDay();
        if(d.equals(p.getString("quotaDay","")))return;
        SharedPreferences.Editor e=p.edit().putString("quotaDay",d);
        for(Def x:CATALOG){
            e.putLong(k(x.id,"requestsUsed"),0);
            e.putLong(k(x.id,"tokensUsed"),0);
            if("QUOTA_EXHAUSTED".equals(p.getString(k(x.id,"status"),"")))e.putString(k(x.id,"status"),"READY");
        }
        e.apply();
    }

    public JSONObject config(String id){
        try{
            Def d=def(id);
            return new JSONObject()
                .put("id",id)
                .put("name",d==null?id:d.name)
                .put("enabled",p.getBoolean(k(id,"enabled"),false))
                .put("verifiedFree",p.getBoolean(k(id,"verifiedFree"),false))
                .put("endpoint",p.getString(k(id,"endpoint"),d==null?"":d.endpoint))
                .put("model",p.getString(k(id,"model"),""))
                .put("priority",p.getInt(k(id,"priority"),999))
                .put("status",p.getString(k(id,"status"),"NOT_CONFIGURED"))
                .put("requestLimit",p.getLong(k(id,"requestLimit"),0))
                .put("tokenLimit",p.getLong(k(id,"tokenLimit"),0))
                .put("requestsUsed",p.getLong(k(id,"requestsUsed"),0))
                .put("tokensUsed",p.getLong(k(id,"tokensUsed"),0))
                .put("hasKey",secrets.has("provider."+id+".key"));
        }catch(Exception e){return new JSONObject();}
    }

    public void saveConfig(String id,boolean enabled,boolean verifiedFree,String endpoint,String model,String apiKey,long requestLimit,long tokenLimit,int priority){
        SharedPreferences.Editor e=p.edit()
            .putBoolean(k(id,"enabled"),enabled)
            .putBoolean(k(id,"verifiedFree"),verifiedFree)
            .putString(k(id,"endpoint"),endpoint==null?"":endpoint.trim())
            .putString(k(id,"model"),model==null?"":model.trim())
            .putLong(k(id,"requestLimit"),Math.max(0,requestLimit))
            .putLong(k(id,"tokenLimit"),Math.max(0,tokenLimit))
            .putInt(k(id,"priority"),priority);
        if(!enabled)e.putString(k(id,"status"),"DISABLED");
        else if(!verifiedFree)e.putString(k(id,"status"),"BLOCKED_NOT_FREE_VERIFIED");
        else e.putString(k(id,"status"),"READY");
        e.apply();
        if(apiKey!=null){
            String trimmed=apiKey.trim();
            if(!trimmed.isEmpty()&&!trimmed.equals("••••••••"))secrets.put("provider."+id+".key",trimmed);
        }
    }

    public void clearKey(String id){secrets.remove("provider."+id+".key");}

    private Def def(String id){for(Def d:CATALOG)if(d.id.equals(id))return d;return null;}

    private boolean reserveAvailable(String id){
        long rl=p.getLong(k(id,"requestLimit"),0),ru=p.getLong(k(id,"requestsUsed"),0);
        long tl=p.getLong(k(id,"tokenLimit"),0),tu=p.getLong(k(id,"tokensUsed"),0);
        boolean req=rl<=0 || ((double)(rl-ru)/(double)rl)>RESERVE_RATIO;
        boolean tok=tl<=0 || ((double)(tl-tu)/(double)tl)>RESERVE_RATIO;
        return req&&tok;
    }

    public List<String> candidates(){
        resetDailyIfNeeded();
        ArrayList<String> ids=new ArrayList<>();
        for(Def d:CATALOG){
            if("local".equals(d.id))continue;
            if(!p.getBoolean(k(d.id,"enabled"),false))continue;
            if(HARD_RP0_LOCK&&!p.getBoolean(k(d.id,"verifiedFree"),false))continue;
            if(!secrets.has("provider."+d.id+".key"))continue;
            if(p.getString(k(d.id,"endpoint"),"").trim().isEmpty())continue;
            if(p.getString(k(d.id,"model"),"").trim().isEmpty())continue;
            String st=p.getString(k(d.id,"status"),"");
            if("BILLING_BLOCKED".equals(st)||"AUTH_ERROR".equals(st)||"DISABLED".equals(st))continue;
            if(!reserveAvailable(d.id))continue;
            ids.add(d.id);
        }
        Collections.sort(ids,Comparator.comparingInt(a->p.getInt(k(a,"priority"),999)));
        return ids;
    }

    public ChatResult chat(String systemPrompt,String userText){
        List<String> ids=candidates();
        if(ids.isEmpty())return new ChatResult(false,"","","NO_VERIFIED_FREE_PROVIDER",0);
        StringBuilder errors=new StringBuilder();
        for(String id:ids){
            ChatResult r=callOpenAICompatible(id,systemPrompt,userText);
            if(r.ok)return r;
            if(errors.length()>0)errors.append(" | ");
            errors.append(id).append(":").append(r.error);
        }
        return new ChatResult(false,"","",errors.toString(),0);
    }

    private ChatResult callOpenAICompatible(String id,String systemPrompt,String userText){
        String endpoint=p.getString(k(id,"endpoint"),"");
        String model=p.getString(k(id,"model"),"");
        String key=secrets.get("provider."+id+".key");
        HttpURLConnection c=null;
        try{
            URL u=new URL(endpoint);
            c=(HttpURLConnection)u.openConnection();
            c.setConnectTimeout(15000);c.setReadTimeout(60000);
            c.setRequestMethod("POST");c.setDoOutput(true);
            c.setRequestProperty("Content-Type","application/json");
            c.setRequestProperty("Authorization","Bearer "+key);
            c.setRequestProperty("User-Agent","DIZAbot/1.0");
            JSONObject body=new JSONObject().put("model",model).put("stream",false);
            JSONArray msgs=new JSONArray();
            if(systemPrompt!=null&&!systemPrompt.trim().isEmpty())msgs.put(new JSONObject().put("role","system").put("content",systemPrompt));
            msgs.put(new JSONObject().put("role","user").put("content",userText));
            body.put("messages",msgs);
            byte[] bytes=body.toString().getBytes(StandardCharsets.UTF_8);
            c.setFixedLengthStreamingMode(bytes.length);
            try(OutputStream os=c.getOutputStream()){os.write(bytes);}
            int code=c.getResponseCode();
            String raw=read(c,code>=200&&code<300?c.getInputStream():c.getErrorStream(),1024*1024);
            if(code>=200&&code<300){
                JSONObject j=new JSONObject(raw);
                String text="";
                JSONArray choices=j.optJSONArray("choices");
                if(choices!=null&&choices.length()>0){
                    JSONObject msg=choices.optJSONObject(0).optJSONObject("message");
                    if(msg!=null)text=msg.optString("content","");
                }
                long tokens=0;JSONObject usage=j.optJSONObject("usage");if(usage!=null)tokens=usage.optLong("total_tokens",0);
                recordUsage(id,1,tokens);
                p.edit().putString(k(id,"status"),"READY").putString(k(id,"lastError"),"").putLong(k(id,"lastSuccess"),System.currentTimeMillis()).apply();
                if(text.trim().isEmpty())return new ChatResult(false,"",id,"EMPTY_RESPONSE",code);
                return new ChatResult(true,text,id,"",code);
            }
            onHttpError(id,code,raw);
            return new ChatResult(false,"",id,"HTTP_"+code,code);
        }catch(Exception e){
            p.edit().putString(k(id,"status"),"NETWORK_ERROR").putString(k(id,"lastError"),e.getClass().getSimpleName()+": "+e.getMessage()).apply();
            return new ChatResult(false,"",id,"NETWORK_ERROR",0);
        }finally{if(c!=null)c.disconnect();}
    }

    private void onHttpError(String id,int code,String raw){
        SharedPreferences.Editor e=p.edit().putString(k(id,"lastError"),"HTTP "+code+" "+trim(raw,400));
        if(code==429)e.putString(k(id,"status"),"QUOTA_EXHAUSTED");
        else if(code==401)e.putString(k(id,"status"),"AUTH_ERROR");
        else if(code==402){
            e.putString(k(id,"status"),"BILLING_BLOCKED");
            e.putBoolean(k(id,"verifiedFree"),false);
        }else e.putString(k(id,"status"),"HTTP_"+code);
        e.apply();
    }

    private void recordUsage(String id,long requests,long tokens){
        long ru=p.getLong(k(id,"requestsUsed"),0),tu=p.getLong(k(id,"tokensUsed"),0);
        p.edit().putLong(k(id,"requestsUsed"),ru+requests).putLong(k(id,"tokensUsed"),tu+tokens).apply();
        if(!reserveAvailable(id))p.edit().putString(k(id,"status"),"RESERVE_HELD").apply();
    }

    public void auditConfiguredProviders(){
        resetDailyIfNeeded();
        for(Def d:CATALOG){
            if(!p.getBoolean(k(d.id,"enabled"),false))continue;
            if(!p.getBoolean(k(d.id,"verifiedFree"),false))continue;
            if(!secrets.has("provider."+d.id+".key"))continue;
            String endpoint=p.getString(k(d.id,"endpoint"),"");
            if(endpoint.trim().isEmpty())continue;
            String models=modelsEndpoint(endpoint);
            if(models==null)continue;
            HttpURLConnection c=null;
            try{
                c=(HttpURLConnection)new URL(models).openConnection();
                c.setConnectTimeout(10000);c.setReadTimeout(20000);
                c.setRequestMethod("GET");
                c.setRequestProperty("Authorization","Bearer "+secrets.get("provider."+d.id+".key"));
                c.setRequestProperty("User-Agent","DIZAbot/1.0");
                int code=c.getResponseCode();
                if(code>=200&&code<300)p.edit().putString(k(d.id,"status"),"READY").putLong(k(d.id,"lastAudit"),System.currentTimeMillis()).apply();
                else onHttpError(d.id,code,read(c,c.getErrorStream(),4096));
            }catch(Exception e){
                p.edit().putString(k(d.id,"status"),"AUDIT_UNREACHABLE").putString(k(d.id,"lastError"),e.getMessage()).apply();
            }finally{if(c!=null)c.disconnect();}
        }
        p.edit().putLong("lastAuditRunAt",System.currentTimeMillis()).apply();
    }

    private String modelsEndpoint(String endpoint){
        int i=endpoint.indexOf("/chat/completions");
        if(i<0)return null;
        return endpoint.substring(0,i)+"/models";
    }

    public int discoverProviders(){
        HttpURLConnection c=null;
        try{
            c=(HttpURLConnection)new URL(DISCOVERY_URL).openConnection();
            c.setConnectTimeout(15000);c.setReadTimeout(45000);c.setRequestMethod("GET");c.setRequestProperty("User-Agent","DIZAbot/1.0");
            if(c.getResponseCode()!=200)return 0;
            String raw=read(c,c.getInputStream(),12*1024*1024);
            JSONObject j=new JSONObject(raw);
            LinkedHashSet<String> names=new LinkedHashSet<>();
            Iterator<String> keys=j.keys();
            while(keys.hasNext()&&names.size()<120){
                JSONObject m=j.optJSONObject(keys.next());if(m==null)continue;
                String v=m.optString("litellm_provider","").trim();
                if(v.isEmpty())continue;
                if(!known(v))names.add(v);
            }
            JSONArray a=new JSONArray();for(String n:names)a.put(n);
            p.edit().putString("discoveryCandidates",a.toString()).putLong("lastDiscoveryRunAt",System.currentTimeMillis()).apply();
            return a.length();
        }catch(Exception e){
            p.edit().putString("discoveryError",e.getClass().getSimpleName()+": "+e.getMessage()).apply();
            return 0;
        }finally{if(c!=null)c.disconnect();}
    }

    private boolean known(String x){
        String z=x.toLowerCase(Locale.ROOT);
        for(Def d:CATALOG)if(z.equals(d.id)||z.contains(d.id)||d.name.toLowerCase(Locale.ROOT).contains(z))return true;
        return false;
    }

    public JSONArray discoveryCandidates(){
        try{return new JSONArray(p.getString("discoveryCandidates","[]"));}catch(Exception e){return new JSONArray();}
    }

    public String usageSummary(){
        resetDailyIfNeeded();
        StringBuilder s=new StringBuilder();
        s.append("Hard Rp0 Lock: ON\nReserve: 10%\n\n");
        for(Def d:CATALOG){
            if(!p.getBoolean(k(d.id,"enabled"),false))continue;
            long ru=p.getLong(k(d.id,"requestsUsed"),0),rl=p.getLong(k(d.id,"requestLimit"),0);
            long tu=p.getLong(k(d.id,"tokensUsed"),0),tl=p.getLong(k(d.id,"tokenLimit"),0);
            s.append(d.name).append(" · ").append(p.getString(k(d.id,"status"),""))
             .append("\nRequests ").append(ru).append("/").append(rl==0?"∞":String.valueOf(rl))
             .append(" · Tokens ").append(tu).append("/").append(tl==0?"∞":String.valueOf(tl)).append("\n\n");
        }
        if(s.toString().endsWith("\n\n"))return s.substring(0,s.length()-2);
        return s.toString();
    }

    public long lastAuditRun(){return p.getLong("lastAuditRunAt",0);}
    public long lastDiscoveryRun(){return p.getLong("lastDiscoveryRunAt",0);}

    private static String read(HttpURLConnection c,InputStream in,int max) throws Exception{
        if(in==null)return "";
        ByteArrayOutputStream out=new ByteArrayOutputStream();
        byte[] b=new byte[8192];int n,total=0;
        while((n=in.read(b))>0){total+=n;if(total>max)throw new IOException("response too large");out.write(b,0,n);}
        return out.toString("UTF-8");
    }
    private static String trim(String s,int max){if(s==null)return "";return s.length()<=max?s:s.substring(0,max);}
}
