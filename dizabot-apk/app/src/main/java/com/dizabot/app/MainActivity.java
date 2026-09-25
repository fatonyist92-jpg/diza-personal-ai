package com.dizabot.app;

import android.app.*;
import android.content.*;
import android.graphics.*;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.speech.RecognizerIntent;
import android.view.*;
import android.widget.*;
import androidx.work.*;
import org.json.*;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.concurrent.TimeUnit;

public class MainActivity extends Activity {
    private static final int PICK_FILE=7401, PICK_IMAGE=7402, TAKE_PHOTO=7403, SPEECH=7404;
    private static final int BG=Color.rgb(17,17,17), CARD=Color.rgb(32,32,32), PANEL=Color.rgb(44,44,46);
    private static final int TEXT=Color.rgb(245,245,246), SUB=Color.rgb(148,148,153), LINE=Color.rgb(58,58,60), BLUE=Color.rgb(20,124,255);

    private FrameLayout host;
    private SharedPreferences ui;
    private String screen="home", currentId="diza";
    private EditText chatInput;

    @Override protected void onCreate(Bundle b){
        super.onCreate(b);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        ui=getSharedPreferences("dizabot_ui_v04",MODE_PRIVATE);
        seed();
        DizaCore.bootstrap(this);
        scheduleWorker();
        render();
    }

    private void seed(){
        if(!ui.contains("bots")){
            try{
                JSONArray a=new JSONArray();
                a.put(new JSONObject().put("id","diza").put("name","Diza").put("color","#8A4DFF").put("shape",7).put("instructions",""));
                ui.edit().putString("bots",a.toString()).apply();
            }catch(Exception ignored){}
        }
        if(!ui.contains("groups")){
            try{
                JSONArray a=new JSONArray();
                a.put(new JSONObject().put("id","team-diza").put("name","Tim DIZAbot").put("members",new JSONArray().put("diza")));
                ui.edit().putString("groups",a.toString()).apply();
            }catch(Exception ignored){}
        }
    }

    private void scheduleWorker(){
        PeriodicWorkRequest w=new PeriodicWorkRequest.Builder(DizaCore.CoreWorker.class,15,TimeUnit.MINUTES).build();
        WorkManager.getInstance(this).enqueueUniquePeriodicWork("dizabot-core-worker",ExistingPeriodicWorkPolicy.KEEP,w);
    }

    private int dp(int v){return (int)(v*getResources().getDisplayMetrics().density+.5f);}
    private TextView t(String s,int sp,int c){TextView x=new TextView(this);x.setText(s);x.setTextSize(sp);x.setTextColor(c);x.setGravity(Gravity.CENTER_VERTICAL);return x;}
    private GradientDrawable bg(int c,int r){GradientDrawable g=new GradientDrawable();g.setColor(c);g.setCornerRadius(dp(r));return g;}
    private GradientDrawable stroke(int c,int r,int sc){GradientDrawable g=bg(c,r);g.setStroke(dp(1),sc);return g;}
    private LinearLayout v(){LinearLayout l=new LinearLayout(this);l.setOrientation(LinearLayout.VERTICAL);return l;}
    private LinearLayout h(){LinearLayout l=new LinearLayout(this);l.setOrientation(LinearLayout.HORIZONTAL);l.setGravity(Gravity.CENTER_VERTICAL);return l;}
    private void pad(View v,int l,int top,int r,int b){v.setPadding(dp(l),dp(top),dp(r),dp(b));}

    private Button round(String s){
        Button b=new Button(this);b.setText(s);b.setTextSize(25);b.setTextColor(TEXT);b.setAllCaps(false);b.setPadding(0,0,0,0);
        b.setBackground(stroke(PANEL,28,Color.rgb(74,74,77)));b.setLayoutParams(new LinearLayout.LayoutParams(dp(50),dp(50)));return b;
    }

    private TextView mark(String label,String color){
        TextView m=t(label,18,TEXT);m.setGravity(Gravity.CENTER);m.setBackground(bg(Color.parseColor(color),24));
        m.setLayoutParams(new LinearLayout.LayoutParams(dp(48),dp(48)));return m;
    }

    private JSONArray bots(){try{return new JSONArray(ui.getString("bots","[]"));}catch(Exception e){return new JSONArray();}}
    private JSONArray groups(){try{return new JSONArray(ui.getString("groups","[]"));}catch(Exception e){return new JSONArray();}}
    private JSONObject bot(String id){
        JSONArray a=bots();for(int i=0;i<a.length();i++){JSONObject o=a.optJSONObject(i);if(o!=null&&id.equals(o.optString("id")))return o;}return null;
    }
    private JSONObject group(String id){
        JSONArray a=groups();for(int i=0;i<a.length();i++){JSONObject o=a.optJSONObject(i);if(o!=null&&id.equals(o.optString("id")))return o;}return null;
    }
    private void saveBots(JSONArray a){ui.edit().putString("bots",a.toString()).apply();}
    private void saveGroups(JSONArray a){ui.edit().putString("groups",a.toString()).apply();}

    private void render(){
        host=new FrameLayout(this);host.setBackgroundColor(BG);setContentView(host);
        if("home".equals(screen))showHome();
        else if("settings".equals(screen))showSettings();
        else if("chat".equals(screen))showChat(false);
        else if("groupChat".equals(screen))showChat(true);
        else if("profile".equals(screen))showProfile();
        else if("groupInfo".equals(screen))showGroupInfo();
    }

    private ScrollView scroll(LinearLayout content){
        ScrollView s=new ScrollView(this);s.setFillViewport(true);s.setBackgroundColor(BG);s.addView(content,new ScrollView.LayoutParams(-1,-2));return s;
    }

    private void showHome(){
        LinearLayout page=v();pad(page,22,18,22,24);
        LinearLayout top=h();
        Button account=round("A");account.setOnClickListener(x->{screen="settings";render();});
        top.addView(account);
        Space left=new Space(this);top.addView(left,new LinearLayout.LayoutParams(0,1,1));
        LinearLayout title=v();TextView logo=mark("D"," #8A4DFF".trim());logo.setLayoutParams(new LinearLayout.LayoutParams(dp(72),dp(72)));title.setGravity(Gravity.CENTER_HORIZONTAL);title.addView(logo);
        TextView name=t("DIZA Bot",17,SUB);name.setGravity(Gravity.CENTER);title.addView(name);
        top.addView(title);
        Space right=new Space(this);top.addView(right,new LinearLayout.LayoutParams(0,1,1));
        Button search=round("⌕");Button plus=round("+");top.addView(search);top.addView(space(8,1));top.addView(plus);
        page.addView(top);
        page.addView(space(1,40));
        LinearLayout list=v();page.addView(list);

        search.setOnClickListener(x->searchDialog());
        plus.setOnClickListener(x->newMenu());

        JSONArray b=bots();
        for(int i=0;i<b.length();i++){JSONObject o=b.optJSONObject(i);if(o!=null)list.addView(homeRow(false,o));}
        JSONArray g=groups();
        for(int i=0;i<g.length();i++){JSONObject o=g.optJSONObject(i);if(o!=null)list.addView(homeRow(true,o));}
        host.addView(scroll(page),new FrameLayout.LayoutParams(-1,-1));
    }

    private View homeRow(boolean isGroup,JSONObject o){
        LinearLayout row=h();pad(row,8,9,4,9);row.setMinimumHeight(dp(74));
        String nm=o.optString("name",isGroup?"Group":"Bot");
        TextView av=mark(isGroup?"G":nm.substring(0,1).toUpperCase(Locale.ROOT),isGroup?"#3B3B40":o.optString("color","#8A4DFF"));
        row.addView(av);
        LinearLayout copy=v();pad(copy,16,0,8,0);TextView title=t(nm,20,TEXT);TextView sub=t(isGroup?"Group Chat":"Bot",16,SUB);copy.addView(title);copy.addView(sub);
        row.addView(copy,new LinearLayout.LayoutParams(0,dp(56),1));
        TextView meta=t("›",28,Color.rgb(95,95,100));meta.setGravity(Gravity.RIGHT|Gravity.CENTER_VERTICAL);row.addView(meta,new LinearLayout.LayoutParams(dp(30),dp(56)));
        row.setOnClickListener(x->{currentId=o.optString("id");screen=isGroup?"groupChat":"chat";render();});
        return row;
    }

    private void searchDialog(){
        final EditText e=new EditText(this);e.setHint("Search");e.setSingleLine(true);
        darkInput(e);
        AlertDialog d=dialogBuilder("Search Bots and Groups").setView(e).setNegativeButton("Cancel",null).setPositiveButton("Search",null).create();
        d.setOnShowListener(x->d.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{
            String q=e.getText().toString().trim().toLowerCase(Locale.ROOT);
            ArrayList<String> found=new ArrayList<>();
            JSONArray b=bots();for(int i=0;i<b.length();i++){JSONObject o=b.optJSONObject(i);if(o!=null&&o.optString("name").toLowerCase(Locale.ROOT).contains(q))found.add("Bot · "+o.optString("name"));}
            JSONArray g=groups();for(int i=0;i<g.length();i++){JSONObject o=g.optJSONObject(i);if(o!=null&&o.optString("name").toLowerCase(Locale.ROOT).contains(q))found.add("Group · "+o.optString("name"));}
            d.dismiss();showSimpleList("Search",found.isEmpty()?new String[]{"No results"}:found.toArray(new String[0]),null);
        }));showDialog(d);
    }

    private void newMenu(){
        String[] opts={"New Bot","New Group Chat"};
        showSimpleList(null,opts,(d,w)->{if(w==0)newBotDialog();else newGroupDialog();});
    }

    private void newBotDialog(){
        EditText e=new EditText(this);e.setHint("Bot name");darkInput(e);
        AlertDialog d=dialogBuilder("New Bot").setView(e).setNegativeButton("Cancel",null).setPositiveButton("Create",null).create();
        d.setOnShowListener(x->d.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{
            String n=e.getText().toString().trim();if(n.isEmpty())return;
            try{JSONArray a=bots();String id="bot-"+System.currentTimeMillis();a.put(new JSONObject().put("id",id).put("name",n).put("color","#8A4DFF").put("shape",0).put("instructions",""));saveBots(a);currentId=id;screen="profile";d.dismiss();render();}catch(Exception ignored){}
        }));showDialog(d);
    }

    private void newGroupDialog(){
        final LinearLayout box=v();pad(box,18,8,18,8);
        final EditText name=new EditText(this);name.setHint("Group name");darkInput(name);box.addView(name);
        box.addView(space(1,10));
        JSONArray bs=bots();ArrayList<CheckBox> checks=new ArrayList<>();
        for(int i=0;i<bs.length();i++){JSONObject o=bs.optJSONObject(i);CheckBox c=new CheckBox(this);c.setText(o.optString("name"));c.setTextColor(TEXT);c.setTag(o.optString("id"));box.addView(c);checks.add(c);}
        AlertDialog d=dialogBuilder("New Group Chat").setView(box).setNegativeButton("Cancel",null).setPositiveButton("Create",null).create();
        d.setOnShowListener(x->d.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{
            String n=name.getText().toString().trim();if(n.isEmpty())return;
            try{
                JSONArray m=new JSONArray();for(CheckBox c:checks)if(c.isChecked()&&m.length()<6)m.put(String.valueOf(c.getTag()));
                String id="group-"+System.currentTimeMillis();JSONArray gs=groups();gs.put(new JSONObject().put("id",id).put("name",n).put("members",m));saveGroups(gs);currentId=id;screen="groupInfo";d.dismiss();render();
            }catch(Exception ignored){}
        }));showDialog(d);
    }

    private void showSettings(){
        LinearLayout page=v();pad(page,22,18,22,30);
        Button close=round("×");close.setOnClickListener(x->{screen="home";render();});page.addView(close);
        page.addView(space(1,30));
        LinearLayout account=card();
        account.addView(settingRow("Local profile","DIZAbot account",null));
        account.addView(divider());
        account.addView(settingRow("Usage","100%",v->usageDialog()));
        page.addView(account);
        page.addView(space(1,24));
        LinearLayout plugins=card();plugins.addView(settingRow("Plugins","Tools and skills for DIZA Bot",v->showSimpleList("Plugins",new String[]{"No plugins connected"},null)));page.addView(plugins);
        page.addView(section("Bot"));
        LinearLayout botCard=card();
        botCard.addView(toggleRow("Auto-review","Require approval for risky shell, MCP, and computer actions.","autoReview",true));
        botCard.addView(divider());botCard.addView(settingRow("Auto-review Rules",rulesSummary()+" ›",v->rulesDialog()));
        botCard.addView(divider());botCard.addView(toggleRow("Set Time Zone Automatically","Your Bot's computer follows this device's time zone.","autoZone",true));
        botCard.addView(divider());botCard.addView(settingRow("Time Zone",TimeZone.getDefault().getID(),v->{}));
        botCard.addView(divider());botCard.addView(settingRow("Bot Computer","›",v->computerDialog()));
        page.addView(botCard);
        page.addView(space(1,24));
        LinearLayout not=card();not.addView(toggleRow("Notifications","","notifications",true));page.addView(not);
        host.addView(scroll(page),new FrameLayout.LayoutParams(-1,-1));
    }

    private LinearLayout card(){LinearLayout c=v();c.setBackground(bg(CARD,24));return c;}
    private TextView section(String s){TextView x=t(s,17,Color.rgb(95,95,99));pad(x,10,28,0,10);return x;}
    private View divider(){View v=new View(this);v.setBackgroundColor(LINE);v.setLayoutParams(new LinearLayout.LayoutParams(-1,dp(1)));return v;}

    private View settingRow(String title,String subtitle,View.OnClickListener click){
        LinearLayout r=h();pad(r,18,14,18,14);r.setMinimumHeight(dp(76));LinearLayout c=v();c.addView(t(title,20,TEXT));if(subtitle!=null&&!subtitle.isEmpty())c.addView(t(subtitle,16,SUB));
        r.addView(c,new LinearLayout.LayoutParams(0,-2,1));if(click!=null){TextView ch=t("›",27,SUB);ch.setGravity(Gravity.RIGHT|Gravity.CENTER_VERTICAL);r.addView(ch,new LinearLayout.LayoutParams(dp(30),dp(48)));r.setOnClickListener(click);}return r;
    }

    private View toggleRow(String title,String subtitle,String key,boolean def){
        LinearLayout r=h();pad(r,18,14,18,14);r.setMinimumHeight(dp(86));LinearLayout c=v();c.addView(t(title,20,TEXT));if(!subtitle.isEmpty())c.addView(t(subtitle,15,SUB));r.addView(c,new LinearLayout.LayoutParams(0,-2,1));
        Switch sw=new Switch(this);sw.setChecked(ui.getBoolean(key,def));sw.setOnCheckedChangeListener((b,on)->ui.edit().putBoolean(key,on).apply());r.addView(sw);return r;
    }

    private String rulesSummary(){
        int n=0;if(ui.getBoolean("ruleShell",false))n++;if(ui.getBoolean("ruleMcp",false))n++;if(ui.getBoolean("ruleComputer",false))n++;return n==0?"None":n+" enabled";
    }

    private void rulesDialog(){
        String[] labels={"Shell actions","MCP actions","Computer actions"};
        boolean[] values={ui.getBoolean("ruleShell",false),ui.getBoolean("ruleMcp",false),ui.getBoolean("ruleComputer",false)};
        AlertDialog d=dialogBuilder("Auto-review Rules").setMultiChoiceItems(labels,values,(x,w,on)->values[w]=on).setNegativeButton("Cancel",null).setPositiveButton("Save",(x,w)->ui.edit().putBoolean("ruleShell",values[0]).putBoolean("ruleMcp",values[1]).putBoolean("ruleComputer",values[2]).apply()).create();showDialog(d);
    }

    private void usageDialog(){
        DizaCore.Provider p=DizaCore.selectProvider(this);
        String msg="Hard Rp0 Lock: ON\nReserve: 10%\nActive route: "+p.id+"\nQueued tasks: "+DizaCore.pendingCount(this);
        showMessage("Usage",msg);
    }

    private void computerDialog(){
        long r=DizaCore.lastWorkerRun(this);String last=r==0?"Not run yet":new SimpleDateFormat("dd MMM HH:mm",Locale.getDefault()).format(new Date(r));
        showMessage("Bot Computer","Background task engine: active\nQueue: "+DizaCore.pendingCount(this)+"\nLast worker: "+last);
    }

    private void showChat(boolean isGroup){
        JSONObject obj=isGroup?group(currentId):bot(currentId);if(obj==null){screen="home";render();return;}
        String name=obj.optString("name");
        LinearLayout page=v();
        LinearLayout top=h();pad(top,20,12,20,10);Button back=round("‹");back.setOnClickListener(x->{screen="home";render();});top.addView(back);
        Space sp=new Space(this);top.addView(sp,new LinearLayout.LayoutParams(0,1,1));
        Button pill=new Button(this);pill.setText(name);pill.setTextColor(TEXT);pill.setTextSize(19);pill.setAllCaps(false);pill.setBackground(stroke(PANEL,25,Color.rgb(80,80,84)));pill.setPadding(dp(18),0,dp(18),0);pill.setOnClickListener(x->{screen=isGroup?"groupInfo":"profile";render();});top.addView(pill,new LinearLayout.LayoutParams(-2,dp(48)));
        Space sp2=new Space(this);top.addView(sp2,new LinearLayout.LayoutParams(0,1,1));
        Button pc=round("▣");pc.setOnClickListener(x->computerDialog());top.addView(pc);page.addView(top);

        LinearLayout messages=v();pad(messages,28,8,28,120);
        JSONArray ms=messages(currentId);
        if(ms.length()==0){TextView empty=t(isGroup?"Start a group conversation.":"Start a conversation with "+name+".",16,Color.rgb(90,90,95));empty.setGravity(Gravity.CENTER);pad(empty,0,60,0,0);messages.addView(empty);}
        for(int i=0;i<ms.length();i++){JSONObject m=ms.optJSONObject(i);if(m!=null)messages.addView(messageBubble(m.optString("role"),m.optString("text")));}
        ScrollView sc=scroll(messages);page.addView(sc,new LinearLayout.LayoutParams(-1,0,1));

        LinearLayout composer=h();pad(composer,20,10,20,16);
        Button plus=round("+");plus.setOnClickListener(x->attachmentMenu());composer.addView(plus);composer.addView(space(9,1));
        chatInput=new EditText(this);chatInput.setHint(isGroup?"Message "+name:"Ask "+name);chatInput.setHintTextColor(Color.rgb(105,105,110));chatInput.setTextColor(TEXT);chatInput.setSingleLine(false);chatInput.setMaxLines(4);chatInput.setBackground(stroke(PANEL,26,Color.rgb(80,80,84)));pad(chatInput,18,8,14,8);composer.addView(chatInput,new LinearLayout.LayoutParams(0,dp(52),1));
        Button mic=round("♩");mic.setOnClickListener(x->startSpeech());composer.addView(space(8,1));composer.addView(mic);
        Button send=round("↑");send.setOnClickListener(x->sendCurrent());composer.addView(space(8,1));composer.addView(send);
        page.addView(composer);
        host.addView(page,new FrameLayout.LayoutParams(-1,-1));
        sc.post(()->sc.fullScroll(View.FOCUS_DOWN));
    }

    private JSONArray messages(String id){try{return new JSONArray(ui.getString("messages."+id,"[]"));}catch(Exception e){return new JSONArray();}}
    private void addMessage(String id,String role,String text){
        try{JSONArray a=messages(id);a.put(new JSONObject().put("role",role).put("text",text).put("at",System.currentTimeMillis()));ui.edit().putString("messages."+id,a.toString()).apply();}catch(Exception ignored){}
    }

    private View messageBubble(String role,String text){
        LinearLayout wrap=h();pad(wrap,0,6,0,6);TextView b=t(text,18,TEXT);pad(b,15,11,15,11);boolean user="user".equals(role);b.setBackground(bg(user?Color.rgb(99,99,103):CARD,19));
        if(user){Space s=new Space(this);wrap.addView(s,new LinearLayout.LayoutParams(0,1,1));wrap.addView(b,new LinearLayout.LayoutParams(-2,-2));}
        else{wrap.addView(b,new LinearLayout.LayoutParams(-2,-2));Space s=new Space(this);wrap.addView(s,new LinearLayout.LayoutParams(0,1,1));}
        return wrap;
    }

    private void sendCurrent(){
        if(chatInput==null)return;String q=chatInput.getText().toString().trim();if(q.isEmpty())return;
        addMessage(currentId,"user",q);
        try{DizaCore.enqueue(this,"chat-request",new JSONObject().put("chatId",currentId).put("text",q));}catch(Exception ignored){}
        render();
    }

    private void attachmentMenu(){
        String[] a={"Choose File","Take Photo","Attach Image"};
        showSimpleList(null,a,(d,w)->{
            Intent i;
            try{
                if(w==0){i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("*/*");startActivityForResult(i,PICK_FILE);}
                else if(w==1){i=new Intent(MediaStore.ACTION_IMAGE_CAPTURE);startActivityForResult(i,TAKE_PHOTO);}
                else{i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("image/*");startActivityForResult(i,PICK_IMAGE);}
            }catch(Exception e){Toast.makeText(this,"No compatible app found",Toast.LENGTH_SHORT).show();}
        });
    }

    private void startSpeech(){
        try{Intent i=new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);i.putExtra(RecognizerIntent.EXTRA_LANGUAGE,"id-ID");startActivityForResult(i,SPEECH);}
        catch(Exception e){Toast.makeText(this,"Speech recognition unavailable",Toast.LENGTH_SHORT).show();}
    }

    @Override protected void onActivityResult(int req,int res,Intent data){
        super.onActivityResult(req,res,data);if(res!=RESULT_OK)return;
        if(req==SPEECH&&data!=null){ArrayList<String> r=data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);if(r!=null&&!r.isEmpty()&&chatInput!=null)chatInput.setText(r.get(0));return;}
        if(req==PICK_FILE){addMessage(currentId,"user","[File attached]");render();}
        if(req==PICK_IMAGE||req==TAKE_PHOTO){addMessage(currentId,"user","[Image attached]");render();}
    }

    private void showProfile(){
        JSONObject b=bot(currentId);if(b==null){screen="home";render();return;}
        LinearLayout page=v();pad(page,22,14,22,30);
        LinearLayout top=h();Button back=round("‹");back.setOnClickListener(x->{screen="chat";render();});top.addView(back);Space s=new Space(this);top.addView(s,new LinearLayout.LayoutParams(0,1,1));top.addView(round("⇧"));top.addView(space(8,1));top.addView(round("⋯"));page.addView(top);
        page.addView(space(1,20));
        TextView av=mark(b.optString("name","B").substring(0,1).toUpperCase(Locale.ROOT),b.optString("color","#8A4DFF"));av.setTextSize(30);av.setLayoutParams(new LinearLayout.LayoutParams(dp(110),dp(110)));
        LinearLayout avWrap=h();Space al=new Space(this),ar=new Space(this);avWrap.addView(al,new LinearLayout.LayoutParams(0,1,1));avWrap.addView(av);avWrap.addView(ar,new LinearLayout.LayoutParams(0,1,1));page.addView(avWrap);av.setOnClickListener(x->photoMenu());
        page.addView(section("Character"));
        LinearLayout charCard=card();pad(charCard,22,24,22,20);
        LinearLayout shapes=h();for(int i=0;i<4;i++){final int sh=i;Button z=new Button(this);z.setText("●");z.setTextColor(Color.parseColor("#8A4DFF"));z.setTextSize(28);z.setBackgroundColor(Color.TRANSPARENT);z.setOnClickListener(x->setBotField("shape",sh));shapes.addView(z,new LinearLayout.LayoutParams(0,dp(54),1));}charCard.addView(shapes);
        LinearLayout colors=h();String[] cs={"#FFFFFF","#A86F3E","#FF243F","#FF7300","#FF9D00","#00C96D","#10C4B6","#178DF5","#8A4DFF","#FF279A","#888888"};for(String c:cs){Button sw=new Button(this);sw.setBackground(bg(Color.parseColor(c),18));sw.setOnClickListener(x->setBotField("color",c));colors.addView(sw,new LinearLayout.LayoutParams(0,dp(36),1));}charCard.addView(colors);
        Button reset=new Button(this);reset.setText("Reset to default");reset.setAllCaps(false);reset.setTextColor(BLUE);reset.setTextSize(18);reset.setBackgroundColor(Color.TRANSPARENT);reset.setOnClickListener(x->{setBotField("color","#8A4DFF");setBotField("shape",0);});charCard.addView(reset);
        page.addView(charCard);
        TextView note=t("How this Bot's mark looks everywhere",16,Color.rgb(92,92,96));pad(note,8,10,0,20);page.addView(note);
        LinearLayout inst=card();inst.addView(settingRow("Instructions",summary(b.optString("instructions","")),v->instructionsDialog()));page.addView(inst);
        page.addView(section("Routines"));
        LinearLayout routines=card();routines.addView(routinesView("bot."+currentId));page.addView(routines);
        host.addView(scroll(page),new FrameLayout.LayoutParams(-1,-1));
    }

    private void photoMenu(){
        String[] a={"Select from Gallery","Generate","Remove Photo"};
        showSimpleList(null,a,(d,w)->{
            if(w==0){try{Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("image/*");startActivityForResult(i,PICK_IMAGE);}catch(Exception ignored){}}
            else if(w==1)showMessage("Generate","Image generation adapter is not configured yet.");
            else Toast.makeText(this,"Photo removed",Toast.LENGTH_SHORT).show();
        });
    }

    private String summary(String s){return s==null||s.trim().isEmpty()?"›":(s.length()>28?s.substring(0,28)+"…":s);}
    private void instructionsDialog(){
        JSONObject b=bot(currentId);if(b==null)return;EditText e=new EditText(this);e.setMinLines(5);e.setText(b.optString("instructions",""));darkInput(e);
        AlertDialog d=dialogBuilder("Instructions").setView(e).setNegativeButton("Cancel",null).setPositiveButton("Save",(x,w)->setBotField("instructions",e.getText().toString())).create();showDialog(d);
    }

    private void setBotField(String key,Object value){
        try{JSONArray a=bots();for(int i=0;i<a.length();i++){JSONObject o=a.getJSONObject(i);if(currentId.equals(o.optString("id"))){o.put(key,value);break;}}saveBots(a);render();}catch(Exception ignored){}
    }

    private View routinesView(String key){
        LinearLayout box=v();pad(box,18,14,18,14);JSONArray a=routines(key);
        if(a.length()==0)box.addView(t("No routines yet",18,Color.rgb(100,100,104)));
        for(int i=0;i<a.length();i++){JSONObject r=a.optJSONObject(i);if(r!=null)box.addView(t(r.optString("name"),18,TEXT));}
        TextView add=t("＋  Add routine",19,BLUE);pad(add,0,16,0,6);add.setOnClickListener(x->addRoutine(key));box.addView(add);return box;
    }

    private JSONArray routines(String key){try{return new JSONArray(ui.getString("routines."+key,"[]"));}catch(Exception e){return new JSONArray();}}
    private void addRoutine(String key){
        EditText e=new EditText(this);e.setHint("Routine name");darkInput(e);
        AlertDialog d=dialogBuilder("Add routine").setView(e).setNegativeButton("Cancel",null).setPositiveButton("Add",null).create();
        d.setOnShowListener(x->d.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{String n=e.getText().toString().trim();if(n.isEmpty())return;try{JSONArray a=routines(key);a.put(new JSONObject().put("name",n).put("enabled",true));ui.edit().putString("routines."+key,a.toString()).apply();d.dismiss();render();}catch(Exception ignored){}}));showDialog(d);
    }

    private void showGroupInfo(){
        JSONObject g=group(currentId);if(g==null){screen="home";render();return;}
        LinearLayout page=v();pad(page,22,14,22,30);
        LinearLayout top=h();Button back=round("‹");back.setOnClickListener(x->{screen="groupChat";render();});top.addView(back);Space s=new Space(this);top.addView(s,new LinearLayout.LayoutParams(0,1,1));top.addView(round("⋯"));page.addView(top);
        TextView icon=mark("G","#3B3B40");icon.setTextSize(30);icon.setLayoutParams(new LinearLayout.LayoutParams(dp(105),dp(105)));LinearLayout iw=h();iw.addView(new Space(this),new LinearLayout.LayoutParams(0,1,1));iw.addView(icon);iw.addView(new Space(this),new LinearLayout.LayoutParams(0,1,1));page.addView(iw);
        TextView nm=t(g.optString("name"),28,TEXT);nm.setGravity(Gravity.CENTER);nm.setBackground(bg(CARD,24));pad(nm,10,20,10,20);page.addView(nm);
        page.addView(space(1,22));
        LinearLayout members=card();JSONArray ids=g.optJSONArray("members");if(ids==null)ids=new JSONArray();
        for(int i=0;i<ids.length();i++){JSONObject b=bot(ids.optString(i));if(b!=null){TextView row=t(b.optString("name")+"                                      ›",19,TEXT);pad(row,18,16,18,16);members.addView(row);if(i<ids.length()-1)members.addView(divider());}}
        page.addView(members);
        TextView note=t("Group Chats can have up to 6 members.",16,Color.rgb(92,92,96));pad(note,10,12,0,0);page.addView(note);
        page.addView(section("Routines"));LinearLayout routines=card();routines.addView(routinesView("group."+currentId));page.addView(routines);
        host.addView(scroll(page),new FrameLayout.LayoutParams(-1,-1));
    }

    private void darkInput(EditText e){e.setTextColor(TEXT);e.setHintTextColor(SUB);e.setBackground(stroke(PANEL,14,LINE));pad(e,14,10,14,10);}

    private AlertDialog.Builder dialogBuilder(String title){
        AlertDialog.Builder b=new AlertDialog.Builder(this,android.R.style.Theme_Material_Dialog_Alert);if(title!=null)b.setTitle(title);return b;
    }

    private void showDialog(AlertDialog d){
        d.show();
        if(d.getWindow()!=null)d.getWindow().setBackgroundDrawable(bg(PANEL,22));
        if(d.getButton(AlertDialog.BUTTON_POSITIVE)!=null)d.getButton(AlertDialog.BUTTON_POSITIVE).setTextColor(BLUE);
        if(d.getButton(AlertDialog.BUTTON_NEGATIVE)!=null)d.getButton(AlertDialog.BUTTON_NEGATIVE).setTextColor(BLUE);
    }

    private void showSimpleList(String title,String[] items,DialogInterface.OnClickListener l){
        AlertDialog d=dialogBuilder(title).setItems(items,l).create();d.setOnShowListener(x->d.getWindow().setBackgroundDrawable(bg(PANEL,22)));d.show();
    }

    private void showMessage(String title,String msg){
        AlertDialog d=dialogBuilder(title).setMessage(msg).setPositiveButton("OK",null).create();showDialog(d);
    }

    @Override public void onBackPressed(){
        if("home".equals(screen)){super.onBackPressed();return;}
        if("profile".equals(screen)){screen="chat";}
        else if("groupInfo".equals(screen)){screen="groupChat";}
        else screen="home";
        render();
    }
}
