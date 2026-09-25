package com.dizabot.app;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Locale;

public final class AppStore {
    private static final String PREFS="dizabot_v1_store";
    private final SharedPreferences p;

    public AppStore(Context c){ p=c.getSharedPreferences(PREFS,Context.MODE_PRIVATE); seed(); }

    private void seed(){
        if(!p.contains("bots")){
            try{
                JSONArray a=new JSONArray();
                a.put(new JSONObject()
                    .put("id","diza")
                    .put("name","Diza")
                    .put("color","#FFFFFF")
                    .put("shape","circle")
                    .put("instructions","")
                    .put("avatarUri",""));
                p.edit().putString("bots",a.toString()).apply();
            }catch(Exception ignored){}
        }
        if(!p.contains("groups")) p.edit().putString("groups","[]").apply();
        if(!p.contains("settings.notifications")) p.edit().putBoolean("settings.notifications",true).apply();
        if(!p.contains("settings.autoReview")) p.edit().putBoolean("settings.autoReview",true).apply();
        if(!p.contains("settings.autoTimezone")) p.edit().putBoolean("settings.autoTimezone",true).apply();
        if(!p.contains("settings.timezone")) p.edit().putString("settings.timezone","Asia/Jakarta").apply();
    }

    public SharedPreferences raw(){ return p; }

    private JSONArray arr(String key){
        try{return new JSONArray(p.getString(key,"[]"));}catch(Exception e){return new JSONArray();}
    }
    private void putArr(String key,JSONArray a){p.edit().putString(key,a.toString()).apply();}

    public JSONArray bots(){return arr("bots");}
    public JSONArray groups(){return arr("groups");}
    public JSONArray messages(String chatId){return arr("messages."+chatId);}
    public JSONArray routines(String ownerKey){return arr("routines."+ownerKey);}

    public JSONObject bot(String id){
        JSONArray a=bots();
        for(int i=0;i<a.length();i++){JSONObject o=a.optJSONObject(i);if(o!=null&&id.equals(o.optString("id")))return o;}
        return null;
    }
    public JSONObject group(String id){
        JSONArray a=groups();
        for(int i=0;i<a.length();i++){JSONObject o=a.optJSONObject(i);if(o!=null&&id.equals(o.optString("id")))return o;}
        return null;
    }

    public String createBot(String name){
        try{
            JSONArray a=bots();
            String id="bot-"+System.currentTimeMillis();
            a.put(new JSONObject()
                .put("id",id)
                .put("name",name)
                .put("color","#FFFFFF")
                .put("shape","circle")
                .put("instructions","")
                .put("avatarUri",""));
            putArr("bots",a);return id;
        }catch(Exception e){return null;}
    }

    public String createGroup(String name,JSONArray members){
        try{
            JSONArray a=groups();
            String id="group-"+System.currentTimeMillis();
            a.put(new JSONObject().put("id",id).put("name",name).put("members",members));
            putArr("groups",a);return id;
        }catch(Exception e){return null;}
    }

    public void updateBot(String id,String key,Object value){
        try{
            JSONArray a=bots();
            for(int i=0;i<a.length();i++){
                JSONObject o=a.getJSONObject(i);
                if(id.equals(o.optString("id"))){o.put(key,value);break;}
            }
            putArr("bots",a);
        }catch(Exception ignored){}
    }

    public void updateGroup(String id,String key,Object value){
        try{
            JSONArray a=groups();
            for(int i=0;i<a.length();i++){
                JSONObject o=a.getJSONObject(i);
                if(id.equals(o.optString("id"))){o.put(key,value);break;}
            }
            putArr("groups",a);
        }catch(Exception ignored){}
    }

    public void addMessage(String chatId,String role,String text,String speaker,String attachment){
        try{
            JSONArray a=messages(chatId);
            JSONObject m=new JSONObject()
                .put("role",role)
                .put("text",text==null?"":text)
                .put("speaker",speaker==null?"":speaker)
                .put("attachment",attachment==null?"":attachment)
                .put("at",System.currentTimeMillis());
            a.put(m);putArr("messages."+chatId,a);
        }catch(Exception ignored){}
    }

    public void addRoutine(String ownerKey,String name,String prompt,String hhmm){
        try{
            JSONArray a=routines(ownerKey);
            a.put(new JSONObject()
                .put("id","routine-"+System.currentTimeMillis())
                .put("name",name)
                .put("prompt",prompt)
                .put("time",hhmm)
                .put("enabled",true)
                .put("lastRunDay",""));
            putArr("routines."+ownerKey,a);
        }catch(Exception ignored){}
    }

    public void saveRoutines(String ownerKey,JSONArray a){putArr("routines."+ownerKey,a);}

    public boolean bool(String key,boolean def){return p.getBoolean(key,def);}
    public void bool(String key,boolean value){p.edit().putBoolean(key,value).apply();}
    public String str(String key,String def){return p.getString(key,def);}
    public void str(String key,String value){p.edit().putString(key,value).apply();}

    public String botName(String id){
        JSONObject b=bot(id);return b==null?id:b.optString("name",id);
    }

    public String instructions(String id){
        JSONObject b=bot(id);return b==null?"":b.optString("instructions","");
    }

    public JSONArray search(String q){
        JSONArray out=new JSONArray();String z=q.toLowerCase(Locale.ROOT);
        JSONArray b=bots();
        for(int i=0;i<b.length();i++){JSONObject o=b.optJSONObject(i);if(o!=null&&o.optString("name").toLowerCase(Locale.ROOT).contains(z))out.put(o);}
        JSONArray g=groups();
        for(int i=0;i<g.length();i++){JSONObject o=g.optJSONObject(i);if(o!=null&&o.optString("name").toLowerCase(Locale.ROOT).contains(z))out.put(o);}
        return out;
    }
}
