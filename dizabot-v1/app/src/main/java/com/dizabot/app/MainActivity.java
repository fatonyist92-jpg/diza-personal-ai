package com.dizabot.app;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.*;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.*;
import android.provider.MediaStore;
import android.speech.RecognizerIntent;
import android.view.*;
import android.widget.*;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.*;

public class MainActivity extends Activity {
    private static final int PICK_FILE=7401,PICK_IMAGE=7402,TAKE_PHOTO=7403,SPEECH=7404,PICK_AVATAR=7405,NOTIF_PERMISSION=7406;
    private static final int BLACK=Color.BLACK,PANEL=Color.rgb(18,18,18),PANEL2=Color.rgb(28,28,28),LINE=Color.rgb(48,48,48);
    private static final int WHITE=Color.rgb(245,245,245),MUTED=Color.rgb(145,145,145),DIM=Color.rgb(88,88,88),ACCENT=Color.WHITE;

    private AppStore store;
    private ProviderEngine providers;
    private FrameLayout host;
    private String screen="home",currentId="diza";
    private EditText chatInput;
    private int lastMessageCount=-1;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final Runnable refreshChat=new Runnable(){
        @Override public void run(){
            if(("chat".equals(screen)||"groupChat".equals(screen))&&store!=null){
                int n=store.messages(currentId).length();
                if(lastMessageCount>=0&&n!=lastMessageCount)render();
            }
            handler.postDelayed(this,2500);
        }
    };

    @Override protected void onCreate(Bundle b){
        super.onCreate(b);
        getWindow().setStatusBarColor(BLACK);
        getWindow().setNavigationBarColor(BLACK);
        store=new AppStore(this);
        providers=new ProviderEngine(this);
        BackgroundEngine.bootstrap(this);
        render();
        handler.post(refreshChat);
    }

    @Override protected void onDestroy(){handler.removeCallbacks(refreshChat);super.onDestroy();}

    private int dp(int v){return (int)(v*getResources().getDisplayMetrics().density+.5f);}
    private GradientDrawable bg(int color,int radius){GradientDrawable g=new GradientDrawable();g.setColor(color);g.setCornerRadius(dp(radius));return g;}
    private GradientDrawable stroke(int color,int radius,int strokeColor){GradientDrawable g=bg(color,radius);g.setStroke(dp(1),strokeColor);return g;}
    private TextView text(String s,int sp,int color){TextView t=new TextView(this);t.setText(s);t.setTextSize(sp);t.setTextColor(color);t.setGravity(Gravity.CENTER_VERTICAL);return t;}
    private LinearLayout v(){LinearLayout l=new LinearLayout(this);l.setOrientation(LinearLayout.VERTICAL);return l;}
    private LinearLayout h(){LinearLayout l=new LinearLayout(this);l.setOrientation(LinearLayout.HORIZONTAL);l.setGravity(Gravity.CENTER_VERTICAL);return l;}
    private Space gap(int w,int h){Space s=new Space(this);s.setLayoutParams(new LinearLayout.LayoutParams(dp(w),dp(h)));return s;}
    private void pad(View v,int l,int t,int r,int b){v.setPadding(dp(l),dp(t),dp(r),dp(b));}

    private Button circleButton(String s){
        Button b=new Button(this);b.setText(s);b.setTextColor(WHITE);b.setTextSize(23);b.setAllCaps(false);b.setPadding(0,0,0,0);
        b.setBackground(stroke(PANEL2,28,LINE));b.setLayoutParams(new LinearLayout.LayoutParams(dp(50),dp(50)));return b;
    }

    private TextView avatar(JSONObject bot,int size){
        String name=bot==null?"?":bot.optString("name","?");
        String color=bot==null?"#FFFFFF":bot.optString("color","#FFFFFF");
        String shape=bot==null?"circle":bot.optString("shape","circle");
        int radius="square".equals(shape)?12:("pill".equals(shape)?Math.max(16,size/3):("drop".equals(shape)?Math.max(14,size/4):size/2));
        TextView t=text(name.isEmpty()?"?":name.substring(0,1).toUpperCase(Locale.ROOT),Math.max(15,size/3),Color.BLACK);
        t.setGravity(Gravity.CENTER);t.setBackground(bg(Color.parseColor(color),radius));t.setLayoutParams(new LinearLayout.LayoutParams(dp(size),dp(size)));
        String uri=bot==null?"":bot.optString("avatarUri","");
        if(!uri.isEmpty()){
            try{
                android.graphics.drawable.Drawable d=android.graphics.drawable.Drawable.createFromStream(getContentResolver().openInputStream(Uri.parse(uri)),uri);
                if(d!=null){t.setText("");t.setBackground(d);}
            }catch(Exception ignored){}
        }
        return t;
    }

    private LinearLayout card(){LinearLayout c=v();c.setBackground(bg(PANEL,22));return c;}
    private View divider(){View x=new View(this);x.setBackgroundColor(LINE);x.setLayoutParams(new LinearLayout.LayoutParams(-1,dp(1)));return x;}
    private ScrollView scroll(View child){ScrollView s=new ScrollView(this);s.setFillViewport(true);s.setBackgroundColor(BLACK);s.addView(child,new ScrollView.LayoutParams(-1,-2));return s;}

    private void render(){
        host=new FrameLayout(this);host.setBackgroundColor(BLACK);setContentView(host);
        if("home".equals(screen))home();
        else if("settings".equals(screen))settings();
        else if("plugins".equals(screen))plugins();
        else if("usage".equals(screen))usage();
        else if("computer".equals(screen))computer();
        else if("chat".equals(screen))chat(false);
        else if("groupChat".equals(screen))chat(true);
        else if("profile".equals(screen))profile();
        else if("groupInfo".equals(screen))groupInfo();
        else home();
    }

    private void home(){
        LinearLayout page=v();pad(page,22,18,22,28);
        LinearLayout header=h();
        Button account=circleButton("A");account.setOnClickListener(x->{screen="settings";render();});header.addView(account);
        Space s1=new Space(this);header.addView(s1,new LinearLayout.LayoutParams(0,1,1));
        LinearLayout brand=v();brand.setGravity(Gravity.CENTER_HORIZONTAL);
        TextView logo=text("D",28,Color.BLACK);logo.setGravity(Gravity.CENTER);logo.setBackground(bg(WHITE,38));logo.setLayoutParams(new LinearLayout.LayoutParams(dp(76),dp(76)));brand.addView(logo);
        TextView bn=text("DIZAbot",16,MUTED);bn.setGravity(Gravity.CENTER);pad(bn,0,8,0,0);brand.addView(bn);header.addView(brand);
        Space s2=new Space(this);header.addView(s2,new LinearLayout.LayoutParams(0,1,1));
        Button search=circleButton("⌕");search.setOnClickListener(x->searchDialog());header.addView(search);header.addView(gap(8,1));
        Button plus=circleButton("+");plus.setOnClickListener(x->newMenu());header.addView(plus);
        page.addView(header);page.addView(gap(1,42));

        JSONArray bots=store.bots();
        for(int i=0;i<bots.length();i++){JSONObject o=bots.optJSONObject(i);if(o!=null)page.addView(homeRow(false,o));}
        JSONArray groups=store.groups();
        for(int i=0;i<groups.length();i++){JSONObject o=groups.optJSONObject(i);if(o!=null)page.addView(homeRow(true,o));}

        if(bots.length()==0&&groups.length()==0){
            TextView empty=text("No bots yet",17,DIM);empty.setGravity(Gravity.CENTER);pad(empty,0,80,0,0);page.addView(empty);
        }
        host.addView(scroll(page),new FrameLayout.LayoutParams(-1,-1));
    }

    private View homeRow(boolean group,JSONObject o){
        LinearLayout r=h();pad(r,8,10,2,10);r.setMinimumHeight(dp(74));
        TextView av=group?genericGroupAvatar(48):avatar(o,48);r.addView(av);
        LinearLayout c=v();pad(c,15,0,8,0);
        c.addView(text(o.optString("name",group?"Group":"Bot"),20,WHITE));
        String sub;
        if(group)sub="Group chat · "+(o.optJSONArray("members")==null?0:o.optJSONArray("members").length())+" members";
        else sub=latestPreview(o.optString("id"));
        c.addView(text(sub,15,MUTED));
        r.addView(c,new LinearLayout.LayoutParams(0,dp(56),1));
        TextView ch=text("›",28,DIM);ch.setGravity(Gravity.RIGHT|Gravity.CENTER_VERTICAL);r.addView(ch,new LinearLayout.LayoutParams(dp(28),dp(56)));
        r.setOnClickListener(x->{currentId=o.optString("id");screen=group?"groupChat":"chat";render();});
        return r;
    }

    private TextView genericGroupAvatar(int size){
        TextView t=text("G",Math.max(15,size/3),WHITE);t.setGravity(Gravity.CENTER);t.setBackground(stroke(PANEL2,size/2,LINE));t.setLayoutParams(new LinearLayout.LayoutParams(dp(size),dp(size)));return t;
    }

    private String latestPreview(String id){
        JSONArray a=store.messages(id);if(a.length()==0)return "Bot";
        JSONObject m=a.optJSONObject(a.length()-1);if(m==null)return "Bot";
        String s=m.optString("text");if(s.isEmpty())s=m.optString("attachment");
        return s.length()>42?s.substring(0,42)+"…":s;
    }

    private void newMenu(){
        showList(null,new String[]{"New Bot","New Group Chat"},(d,w)->{if(w==0)newBotDialog();else newGroupDialog();});
    }

    private void newBotDialog(){
        EditText e=input("Bot name","");
        AlertDialog d=builder("New Bot").setView(e).setNegativeButton("Cancel",null).setPositiveButton("Create",null).create();
        d.setOnShowListener(x->{styleDialog(d);d.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{String n=e.getText().toString().trim();if(n.isEmpty())return;String id=store.createBot(n);if(id!=null){currentId=id;screen="profile";d.dismiss();render();}});});d.show();
    }

    private void newGroupDialog(){
        LinearLayout box=v();pad(box,16,6,16,6);
        EditText name=input("Group name","");box.addView(name);box.addView(gap(1,10));
        JSONArray bots=store.bots();ArrayList<CheckBox> checks=new ArrayList<>();
        for(int i=0;i<bots.length();i++){
            JSONObject b=bots.optJSONObject(i);if(b==null)continue;
            CheckBox c=new CheckBox(this);c.setText(b.optString("name"));c.setTextColor(WHITE);c.setTag(b.optString("id"));box.addView(c);checks.add(c);
        }
        TextView note=text("Maximum 6 members",14,MUTED);pad(note,0,8,0,0);box.addView(note);
        AlertDialog d=builder("New Group Chat").setView(box).setNegativeButton("Cancel",null).setPositiveButton("Create",null).create();
        d.setOnShowListener(x->{styleDialog(d);d.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{
            String n=name.getText().toString().trim();if(n.isEmpty())return;
            JSONArray m=new JSONArray();for(CheckBox c:checks)if(c.isChecked()&&m.length()<6)m.put(String.valueOf(c.getTag()));
            String id=store.createGroup(n,m);if(id!=null){currentId=id;screen="groupInfo";d.dismiss();render();}
        });});d.show();
    }

    private void searchDialog(){
        EditText e=input("Search bots and groups","");
        AlertDialog d=builder("Search").setView(e).setNegativeButton("Cancel",null).setPositiveButton("Search",null).create();
        d.setOnShowListener(x->{styleDialog(d);d.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{
            JSONArray a=store.search(e.getText().toString().trim());ArrayList<String> rows=new ArrayList<>();
            for(int i=0;i<a.length();i++){JSONObject o=a.optJSONObject(i);if(o!=null)rows.add(o.optString("name"));}
            d.dismiss();showList("Results",rows.isEmpty()?new String[]{"No results"}:rows.toArray(new String[0]),null);
        });});d.show();
    }

    private void settings(){
        LinearLayout page=v();pad(page,22,18,22,30);
        Button close=circleButton("×");close.setOnClickListener(x->{screen="home";render();});page.addView(close);page.addView(gap(1,28));

        LinearLayout acct=card();acct.addView(settingRow("Account","Local DIZAbot profile",null));acct.addView(divider());
        acct.addView(settingRow("Usage","Hard Rp0 Lock · 10% reserve",x->{screen="usage";render();}));page.addView(acct);
        page.addView(gap(1,22));

        LinearLayout pl=card();pl.addView(settingRow("Plugins","AI providers, tools and skills",x->{screen="plugins";render();}));page.addView(pl);
        page.addView(section("Bot"));

        LinearLayout bot=card();
        bot.addView(toggleRow("Auto-review","Require approval for risky shell, MCP, and computer actions.","settings.autoReview",true,null));
        bot.addView(divider());bot.addView(settingRow("Auto-review Rules",rulesSummary(),x->rulesDialog()));
        bot.addView(divider());bot.addView(toggleRow("Set Time Zone Automatically","Follow this device's time zone.","settings.autoTimezone",true,x->{if(((Switch)x).isChecked())store.str("settings.timezone",TimeZone.getDefault().getID());}));
        bot.addView(divider());bot.addView(settingRow("Time Zone",store.bool("settings.autoTimezone",true)?TimeZone.getDefault().getID():store.str("settings.timezone","Asia/Jakarta"),x->timezoneDialog()));
        bot.addView(divider());bot.addView(settingRow("Bot Computer","Background tasks and recovery",x->{screen="computer";render();}));
        page.addView(bot);page.addView(gap(1,22));

        LinearLayout n=card();n.addView(toggleRow("Notifications","Notify when background replies finish.","settings.notifications",true,x->{if(((Switch)x).isChecked())requestNotifications();}));page.addView(n);
        host.addView(scroll(page),new FrameLayout.LayoutParams(-1,-1));
    }

    private TextView section(String s){TextView t=text(s,15,DIM);pad(t,8,28,0,9);return t;}

    private View settingRow(String title,String subtitle,View.OnClickListener onClick){
        LinearLayout r=h();pad(r,18,14,18,14);r.setMinimumHeight(dp(74));
        LinearLayout c=v();c.addView(text(title,19,WHITE));if(subtitle!=null&&!subtitle.isEmpty())c.addView(text(subtitle,14,MUTED));r.addView(c,new LinearLayout.LayoutParams(0,-2,1));
        if(onClick!=null){TextView ch=text("›",26,MUTED);ch.setGravity(Gravity.RIGHT|Gravity.CENTER_VERTICAL);r.addView(ch,new LinearLayout.LayoutParams(dp(28),dp(44)));r.setOnClickListener(onClick);}
        return r;
    }

    private View toggleRow(String title,String subtitle,String key,boolean def,View.OnClickListener after){
        LinearLayout r=h();pad(r,18,14,18,14);r.setMinimumHeight(dp(82));
        LinearLayout c=v();c.addView(text(title,19,WHITE));if(subtitle!=null&&!subtitle.isEmpty())c.addView(text(subtitle,14,MUTED));r.addView(c,new LinearLayout.LayoutParams(0,-2,1));
        Switch sw=new Switch(this);sw.setChecked(store.bool(key,def));sw.setOnCheckedChangeListener((b,on)->{store.bool(key,on);if(after!=null)after.onClick(sw);});r.addView(sw);return r;
    }

    private String rulesSummary(){
        int n=0;if(store.bool("rule.shell",false))n++;if(store.bool("rule.mcp",false))n++;if(store.bool("rule.computer",false))n++;return n==0?"None":n+" enabled";
    }

    private void rulesDialog(){
        String[] names={"Shell actions","MCP actions","Computer actions"};
        boolean[] vals={store.bool("rule.shell",false),store.bool("rule.mcp",false),store.bool("rule.computer",false)};
        AlertDialog d=builder("Auto-review Rules").setMultiChoiceItems(names,vals,(x,w,on)->vals[w]=on)
            .setNegativeButton("Cancel",null).setPositiveButton("Save",(x,w)->{
                store.bool("rule.shell",vals[0]);store.bool("rule.mcp",vals[1]);store.bool("rule.computer",vals[2]);
            }).create();showDialog(d);
    }

    private void timezoneDialog(){
        if(store.bool("settings.autoTimezone",true)){toast("Turn off automatic time zone first.");return;}
        EditText e=input("Time zone",store.str("settings.timezone","Asia/Jakarta"));
        AlertDialog d=builder("Time Zone").setView(e).setNegativeButton("Cancel",null).setPositiveButton("Save",(x,w)->store.str("settings.timezone",e.getText().toString().trim())).create();showDialog(d);
    }

    private void plugins(){
        LinearLayout page=v();pad(page,22,18,22,30);
        page.addView(backHeader("Plugins","settings"));page.addView(gap(1,20));
        TextView info=text("Provider Mesh",14,DIM);page.addView(info);page.addView(gap(1,8));
        LinearLayout list=card();
        for(int i=0;i<ProviderEngine.CATALOG.length;i++){
            ProviderEngine.Def d=ProviderEngine.CATALOG[i];JSONObject c=providers.config(d.id);
            final String id=d.id;
            String right=c.optBoolean("enabled")?c.optString("status","READY"):"Off";
            list.addView(providerRow(d.name,right,x->providerDialog(id)));
            if(i<ProviderEngine.CATALOG.length-1)list.addView(divider());
        }
        page.addView(list);
        JSONArray disc=providers.discoveryCandidates();
        if(disc.length()>0){
            page.addView(section("Discovered candidates"));
            LinearLayout dc=card();int max=Math.min(20,disc.length());
            for(int i=0;i<max;i++){dc.addView(settingRow(disc.optString(i),"Not active until verified",null));if(i<max-1)dc.addView(divider());}
            page.addView(dc);
        }
        host.addView(scroll(page),new FrameLayout.LayoutParams(-1,-1));
    }

    private View providerRow(String name,String status,View.OnClickListener click){
        LinearLayout r=h();pad(r,18,15,18,15);r.setMinimumHeight(dp(70));LinearLayout c=v();c.addView(text(name,18,WHITE));c.addView(text(status,13,MUTED));r.addView(c,new LinearLayout.LayoutParams(0,-2,1));TextView ch=text("›",25,MUTED);r.addView(ch);r.setOnClickListener(click);return r;
    }

    private void providerDialog(String id){
        JSONObject c=providers.config(id);
        LinearLayout box=v();pad(box,8,4,8,4);
        Switch enabled=new Switch(this);enabled.setText("Enabled");enabled.setTextColor(WHITE);enabled.setChecked(c.optBoolean("enabled"));box.addView(enabled);
        Switch free=new Switch(this);free.setText("Verified free-tier / billing disabled");free.setTextColor(WHITE);free.setChecked(c.optBoolean("verifiedFree"));box.addView(free);
        box.addView(gap(1,8));
        EditText endpoint=input("OpenAI-compatible chat endpoint",c.optString("endpoint"));box.addView(endpoint);
        box.addView(gap(1,8));EditText model=input("Model",c.optString("model"));box.addView(model);
        box.addView(gap(1,8));EditText key=input("API key",c.optBoolean("hasKey")?"••••••••":"");key.setInputType(0x00000081);box.addView(key);
        box.addView(gap(1,8));EditText req=input("Daily request limit (0 = unknown)",String.valueOf(c.optLong("requestLimit")));req.setInputType(2);box.addView(req);
        box.addView(gap(1,8));EditText tok=input("Daily token limit (0 = unknown)",String.valueOf(c.optLong("tokenLimit")));tok.setInputType(2);box.addView(tok);
        box.addView(gap(1,8));EditText prio=input("Priority",String.valueOf(c.optInt("priority")));prio.setInputType(2);box.addView(prio);
        TextView warning=text("Hard Rp0 Lock only routes providers marked verified-free. A provider removed from free tier is blocked on HTTP 402; paid fallback is never used.",13,MUTED);pad(warning,0,12,0,0);box.addView(warning);

        ScrollView sc=scroll(box);
        AlertDialog d=builder(c.optString("name")).setView(sc).setNegativeButton("Cancel",null).setNeutralButton("Clear key",null).setPositiveButton("Save",null).create();
        d.setOnShowListener(x->{styleDialog(d);
            d.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(v->{providers.clearKey(id);key.setText("");});
            d.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{
                if(enabled.isChecked()&&ProviderEngine.HARD_RP0_LOCK&&!free.isChecked()){toast("Hard Rp0 Lock: verify free-tier first.");return;}
                providers.saveConfig(id,enabled.isChecked(),free.isChecked(),endpoint.getText().toString(),model.getText().toString(),key.getText().toString(),
                    parseLong(req.getText().toString()),parseLong(tok.getText().toString()),(int)parseLong(prio.getText().toString()));
                d.dismiss();render();
            });
        });d.show();
    }

    private long parseLong(String s){try{return Long.parseLong(s.trim());}catch(Exception e){return 0;}}

    private void usage(){
        LinearLayout page=v();pad(page,22,18,22,30);page.addView(backHeader("Usage","settings"));page.addView(gap(1,22));
        TextView lock=text("HARD Rp0 LOCK",13,Color.BLACK);lock.setGravity(Gravity.CENTER);lock.setBackground(bg(WHITE,16));pad(lock,12,7,12,7);page.addView(lock,new LinearLayout.LayoutParams(-2,-2));page.addView(gap(1,14));
        TextView copy=text(providers.usageSummary(),16,WHITE);copy.setLineSpacing(0,1.25f);page.addView(copy);
        host.addView(scroll(page),new FrameLayout.LayoutParams(-1,-1));
    }

    private void computer(){
        LinearLayout page=v();pad(page,22,18,22,30);page.addView(backHeader("Bot Computer","settings"));page.addView(gap(1,20));
        String last=fmt(BackgroundEngine.lastRun(this)),audit=fmt(providers.lastAuditRun()),disc=fmt(providers.lastDiscoveryRun());
        LinearLayout c=card();
        c.addView(settingRow("Task queue",BackgroundEngine.pending(this)+" pending",null));c.addView(divider());
        c.addView(settingRow("Recovery worker","Every 15 minutes · last "+last,null));c.addView(divider());
        c.addView(settingRow("Free-tier audit","Around 00:00 Asia/Jakarta · last "+audit,null));c.addView(divider());
        c.addView(settingRow("Provider discovery","Every 2 days · last "+disc,null));
        page.addView(c);page.addView(gap(1,18));
        Button run=solidButton("Run maintenance now");run.setOnClickListener(x->{
            BackgroundEngine.enqueue(this,"manual-maintenance",new JSONObject());
            new Thread(()->{providers.auditConfiguredProviders();int n=providers.discoverProviders();runOnUiThread(()->{toast("Maintenance done · "+n+" discovery candidates");render();});}).start();
        });page.addView(run);
        page.addView(section("Queue"));
        JSONArray q=BackgroundEngine.queueSnapshot(this);LinearLayout qcard=card();
        if(q.length()==0)qcard.addView(settingRow("No queued tasks","",null));
        else{
            int start=Math.max(0,q.length()-12);
            for(int i=q.length()-1;i>=start;i--){JSONObject o=q.optJSONObject(i);if(o==null)continue;qcard.addView(settingRow(o.optString("type"),o.optString("status")+" · attempt "+o.optInt("attempt"),null));if(i>start)qcard.addView(divider());}
        }
        page.addView(qcard);
        host.addView(scroll(page),new FrameLayout.LayoutParams(-1,-1));
    }

    private String fmt(long ms){return ms<=0?"never":new SimpleDateFormat("dd MMM HH:mm",Locale.getDefault()).format(new Date(ms));}

    private View backHeader(String title,String back){
        LinearLayout h=h();Button b=circleButton("‹");b.setOnClickListener(x->{screen=back;render();});h.addView(b);TextView t=text(title,24,WHITE);pad(t,16,0,0,0);h.addView(t,new LinearLayout.LayoutParams(0,dp(50),1));return h;
    }

    private Button solidButton(String label){
        Button b=new Button(this);b.setText(label);b.setAllCaps(false);b.setTextSize(17);b.setTextColor(Color.BLACK);b.setBackground(bg(WHITE,22));b.setLayoutParams(new LinearLayout.LayoutParams(-1,dp(52)));return b;
    }

    private void chat(boolean group){
        JSONObject obj=group?store.group(currentId):store.bot(currentId);
        if(obj==null){screen="home";render();return;}
        String name=obj.optString("name",group?"Group":"Bot");
        LinearLayout page=v();

        LinearLayout header=h();pad(header,20,12,20,10);
        Button back=circleButton("‹");back.setOnClickListener(x->{screen="home";render();});header.addView(back);
        Space s1=new Space(this);header.addView(s1,new LinearLayout.LayoutParams(0,1,1));
        Button pill=new Button(this);pill.setText(name);pill.setTextColor(WHITE);pill.setTextSize(18);pill.setAllCaps(false);pill.setBackground(stroke(PANEL2,24,LINE));pill.setPadding(dp(18),0,dp(18),0);pill.setOnClickListener(x->{screen=group?"groupInfo":"profile";render();});header.addView(pill,new LinearLayout.LayoutParams(-2,dp(48)));
        Space s2=new Space(this);header.addView(s2,new LinearLayout.LayoutParams(0,1,1));
        Button pc=circleButton("▣");pc.setOnClickListener(x->{screen="computer";render();});header.addView(pc);page.addView(header);

        LinearLayout msgs=v();pad(msgs,24,8,24,30);JSONArray a=store.messages(currentId);lastMessageCount=a.length();
        if(a.length()==0){TextView e=text(group?"Start a group conversation":"Start a conversation with "+name,15,DIM);e.setGravity(Gravity.CENTER);pad(e,0,70,0,0);msgs.addView(e);}
        for(int i=0;i<a.length();i++){JSONObject m=a.optJSONObject(i);if(m!=null)msgs.addView(messageBubble(m));}
        ScrollView sc=scroll(msgs);page.addView(sc,new LinearLayout.LayoutParams(-1,0,1));

        LinearLayout composer=h();pad(composer,20,8,20,16);
        Button plus=circleButton("+");plus.setOnClickListener(x->attachmentMenu());composer.addView(plus);composer.addView(gap(9,1));
        chatInput=input(group?"Message "+name:"Ask "+name,"");chatInput.setSingleLine(false);chatInput.setMaxLines(4);composer.addView(chatInput,new LinearLayout.LayoutParams(0,dp(54),1));
        composer.addView(gap(8,1));Button mic=circleButton("♩");mic.setOnClickListener(x->speech());composer.addView(mic);
        composer.addView(gap(8,1));Button send=circleButton("↑");send.setOnClickListener(x->send(group));composer.addView(send);page.addView(composer);

        host.addView(page,new FrameLayout.LayoutParams(-1,-1));sc.post(()->sc.fullScroll(View.FOCUS_DOWN));
    }

    private View messageBubble(JSONObject m){
        String role=m.optString("role"),speaker=m.optString("speaker"),content=m.optString("text"),attachment=m.optString("attachment");
        if(content.isEmpty())content=attachment;
        LinearLayout wrap=v();pad(wrap,0,5,0,5);
        if(!speaker.isEmpty()&&!"user".equals(role)){TextView who=text(speaker,12,MUTED);pad(who,10,0,0,4);wrap.addView(who);}
        LinearLayout row=h();TextView bubble=text(content,17,WHITE);bubble.setMaxWidth(dp(320));bubble.setLineSpacing(0,1.12f);pad(bubble,14,11,14,11);
        boolean user="user".equals(role);bubble.setBackground(bg(user?Color.rgb(62,62,62):PANEL,18));
        if(user){Space s=new Space(this);row.addView(s,new LinearLayout.LayoutParams(0,1,1));row.addView(bubble);}
        else{row.addView(bubble);Space s=new Space(this);row.addView(s,new LinearLayout.LayoutParams(0,1,1));}
        wrap.addView(row);return wrap;
    }

    private void send(boolean group){
        String q=chatInput==null?"":chatInput.getText().toString().trim();if(q.isEmpty())return;
        store.addMessage(currentId,"user",q,"","");
        if(group){
            JSONObject g=store.group(currentId);JSONArray members=g==null?null:g.optJSONArray("members");
            if(members==null||members.length()==0){toast("Group has no bot members.");render();return;}
            for(int i=0;i<members.length();i++){String bid=members.optString(i);BackgroundEngine.enqueueChat(this,currentId,bid,q,store.botName(bid));}
        }else BackgroundEngine.enqueueChat(this,currentId,currentId,q,store.botName(currentId));
        render();
    }

    private void attachmentMenu(){
        showList(null,new String[]{"Choose File","Take Photo","Attach Image"},(d,w)->{
            try{
                if(w==0){Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");startActivityForResult(i,PICK_FILE);}
                else if(w==1){startActivityForResult(new Intent(MediaStore.ACTION_IMAGE_CAPTURE),TAKE_PHOTO);}
                else{Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*");startActivityForResult(i,PICK_IMAGE);}
            }catch(Exception e){toast("No compatible app found");}
        });
    }

    private void speech(){
        try{
            Intent i=new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE,"id-ID");
            startActivityForResult(i,SPEECH);
        }catch(Exception e){toast("Speech recognition unavailable");}
    }

    private void profile(){
        JSONObject b=store.bot(currentId);if(b==null){screen="home";render();return;}
        LinearLayout page=v();pad(page,22,16,22,30);
        LinearLayout top=h();Button back=circleButton("‹");back.setOnClickListener(x->{screen="chat";render();});top.addView(back);
        Space s=new Space(this);top.addView(s,new LinearLayout.LayoutParams(0,1,1));
        Button share=circleButton("⇧");share.setOnClickListener(x->shareBot(b));top.addView(share);top.addView(gap(8,1));top.addView(circleButton("⋯"));page.addView(top);
        page.addView(gap(1,24));

        LinearLayout avrow=h();Space a=new Space(this);avrow.addView(a,new LinearLayout.LayoutParams(0,1,1));TextView av=avatar(b,108);av.setTextSize(31);av.setOnClickListener(x->photoMenu());avrow.addView(av);Space c=new Space(this);avrow.addView(c,new LinearLayout.LayoutParams(0,1,1));page.addView(avrow);

        TextView name=text(b.optString("name"),27,WHITE);name.setGravity(Gravity.CENTER);pad(name,0,16,0,4);page.addView(name);
        page.addView(section("Character"));LinearLayout ch=card();pad(ch,18,18,18,18);
        TextView shapeTitle=text("Mark shape",15,MUTED);ch.addView(shapeTitle);LinearLayout shapes=h();String[] sh={"circle","square","pill","drop"};String[] sym={"●","■","▬","◆"};
        for(int si=0;si<sh.length;si++){String x=sh[si];Button z=new Button(this);z.setText(sym[si]);z.setTextColor(WHITE);z.setTextSize("circle".equals(x)?28:24);z.setAllCaps(false);z.setBackgroundColor(Color.TRANSPARENT);z.setOnClickListener(vv->{store.updateBot(currentId,"shape",x);render();});shapes.addView(z,new LinearLayout.LayoutParams(0,dp(50),1));}ch.addView(shapes);
        TextView colorTitle=text("Color",15,MUTED);pad(colorTitle,0,10,0,4);ch.addView(colorTitle);LinearLayout colors=h();String[] cs={"#FFFFFF","#A6A6A6","#FF453A","#FF9F0A","#FFD60A","#30D158","#64D2FF","#0A84FF","#BF5AF2","#FF375F"};
        for(String color:cs){Button sw=new Button(this);sw.setBackground(bg(Color.parseColor(color),18));sw.setOnClickListener(vv->{store.updateBot(currentId,"color",color);render();});colors.addView(sw,new LinearLayout.LayoutParams(0,dp(34),1));}ch.addView(colors);
        Button reset=new Button(this);reset.setText("Reset to default");reset.setAllCaps(false);reset.setTextColor(WHITE);reset.setTextSize(16);reset.setBackgroundColor(Color.TRANSPARENT);reset.setOnClickListener(x->{store.updateBot(currentId,"color","#FFFFFF");store.updateBot(currentId,"shape","circle");render();});ch.addView(reset);page.addView(ch);

        page.addView(gap(1,18));LinearLayout inst=card();inst.addView(settingRow("Instructions",shortText(b.optString("instructions","")),x->instructionsDialog()));page.addView(inst);
        page.addView(section("Routines"));LinearLayout rt=card();rt.addView(routineBlock("bot."+currentId));page.addView(rt);

        host.addView(scroll(page),new FrameLayout.LayoutParams(-1,-1));
    }

    private void photoMenu(){
        showList(null,new String[]{"Select from Gallery","Generate","Remove Photo"},(d,w)->{
            if(w==0){try{Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*");startActivityForResult(i,PICK_AVATAR);}catch(Exception e){toast("Gallery unavailable");}}
            else if(w==1)toast("Image generator plugin is not configured.");
            else{store.updateBot(currentId,"avatarUri","");toast("Photo removed");}
        });
    }

    private void shareBot(JSONObject b){
        Intent i=new Intent(Intent.ACTION_SEND);i.setType("text/plain");i.putExtra(Intent.EXTRA_TEXT,b.optString("name")+"\n"+b.optString("instructions",""));startActivity(Intent.createChooser(i,"Share Bot"));
    }

    private String shortText(String s){if(s==null||s.trim().isEmpty())return "None";return s.length()>36?s.substring(0,36)+"…":s;}

    private void instructionsDialog(){
        JSONObject b=store.bot(currentId);if(b==null)return;
        EditText e=input("Instructions",b.optString("instructions",""));e.setMinLines(6);e.setSingleLine(false);
        AlertDialog d=builder("Instructions").setView(e).setNegativeButton("Cancel",null).setPositiveButton("Save",(x,w)->{store.updateBot(currentId,"instructions",e.getText().toString());render();}).create();showDialog(d);
    }

    private View routineBlock(String owner){
        LinearLayout box=v();pad(box,18,14,18,14);JSONArray a=store.routines(owner);
        if(a.length()==0)box.addView(text("No routines yet",16,DIM));
        for(int i=0;i<a.length();i++){
            JSONObject r=a.optJSONObject(i);if(r==null)continue;
            LinearLayout row=h();LinearLayout c=v();c.addView(text(r.optString("name"),17,WHITE));c.addView(text(r.optString("time")+" · "+shortText(r.optString("prompt")),13,MUTED));row.addView(c,new LinearLayout.LayoutParams(0,-2,1));
            Switch sw=new Switch(this);sw.setChecked(r.optBoolean("enabled",true));final int ix=i;sw.setOnCheckedChangeListener((b,on)->{try{JSONArray z=store.routines(owner);z.getJSONObject(ix).put("enabled",on);store.saveRoutines(owner,z);}catch(Exception ignored){}});row.addView(sw);box.addView(row);
        }
        TextView add=text("＋  Add routine",17,WHITE);pad(add,0,16,0,5);add.setOnClickListener(x->routineDialog(owner));box.addView(add);return box;
    }

    private void routineDialog(String owner){
        LinearLayout box=v();pad(box,8,4,8,4);EditText n=input("Routine name","");EditText p=input("Prompt","");p.setMinLines(3);p.setSingleLine(false);EditText time=input("HH:mm","08:00");
        box.addView(n);box.addView(gap(1,8));box.addView(p);box.addView(gap(1,8));box.addView(time);
        AlertDialog d=builder("Add routine").setView(box).setNegativeButton("Cancel",null).setPositiveButton("Add",null).create();
        d.setOnShowListener(x->{styleDialog(d);d.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{
            String nn=n.getText().toString().trim(),pp=p.getText().toString().trim(),tt=time.getText().toString().trim();
            if(nn.isEmpty()||pp.isEmpty()||!tt.matches("([01]\\d|2[0-3]):[0-5]\\d")){toast("Use a name, prompt, and valid HH:mm.");return;}
            store.addRoutine(owner,nn,pp,tt);d.dismiss();render();
        });});d.show();
    }

    private void groupInfo(){
        JSONObject g=store.group(currentId);if(g==null){screen="home";render();return;}
        LinearLayout page=v();pad(page,22,16,22,30);page.addView(backHeader(g.optString("name"),"groupChat"));page.addView(gap(1,20));
        LinearLayout iconRow=h();iconRow.addView(new Space(this),new LinearLayout.LayoutParams(0,1,1));TextView icon=genericGroupAvatar(104);icon.setTextSize(30);iconRow.addView(icon);iconRow.addView(new Space(this),new LinearLayout.LayoutParams(0,1,1));page.addView(iconRow);
        page.addView(gap(1,24));

        JSONArray members=g.optJSONArray("members");if(members==null)members=new JSONArray();
        LinearLayout mc=card();
        for(int i=0;i<members.length();i++){
            String bid=members.optString(i);JSONObject b=store.bot(bid);if(b==null)continue;
            final String memberId=bid;
            LinearLayout row=h();pad(row,18,13,18,13);row.addView(avatar(b,34));TextView nm=text(b.optString("name"),18,WHITE);pad(nm,12,0,0,0);row.addView(nm,new LinearLayout.LayoutParams(0,dp(44),1));
            Button rm=new Button(this);rm.setText("Remove");rm.setAllCaps(false);rm.setTextColor(MUTED);rm.setTextSize(13);rm.setBackgroundColor(Color.TRANSPARENT);rm.setOnClickListener(x->{removeMember(memberId);});row.addView(rm);mc.addView(row);if(i<members.length()-1)mc.addView(divider());
        }
        if(members.length()==0)mc.addView(settingRow("No members","",null));
        page.addView(mc);
        TextView note=text("Group Chats can have up to 6 members.",14,DIM);pad(note,8,10,0,0);page.addView(note);
        Button add=solidButton("Add member");add.setOnClickListener(x->addMemberDialog());page.addView(gap(1,16));page.addView(add);
        page.addView(section("Routines"));LinearLayout rt=card();rt.addView(routineBlock("group."+currentId));page.addView(rt);
        host.addView(scroll(page),new FrameLayout.LayoutParams(-1,-1));
    }

    private void addMemberDialog(){
        JSONObject g=store.group(currentId);if(g==null)return;JSONArray existing=g.optJSONArray("members");if(existing==null)existing=new JSONArray();
        if(existing.length()>=6){toast("Maximum 6 members.");return;}
        Set<String> have=new HashSet<>();for(int i=0;i<existing.length();i++)have.add(existing.optString(i));
        JSONArray bots=store.bots();ArrayList<String> names=new ArrayList<>(),ids=new ArrayList<>();
        for(int i=0;i<bots.length();i++){JSONObject b=bots.optJSONObject(i);if(b!=null&&!have.contains(b.optString("id"))){names.add(b.optString("name"));ids.add(b.optString("id"));}}
        if(names.isEmpty()){toast("No more bots available.");return;}
        showList("Add member",names.toArray(new String[0]),(d,w)->{
            try{JSONObject gg=store.group(currentId);JSONArray m=gg.optJSONArray("members");if(m==null)m=new JSONArray();if(m.length()<6)m.put(ids.get(w));store.updateGroup(currentId,"members",m);render();}catch(Exception ignored){}
        });
    }

    private void removeMember(String bid){
        try{JSONObject g=store.group(currentId);JSONArray m=g.optJSONArray("members"),n=new JSONArray();if(m!=null)for(int i=0;i<m.length();i++)if(!bid.equals(m.optString(i)))n.put(m.optString(i));store.updateGroup(currentId,"members",n);render();}catch(Exception ignored){}
    }

    private EditText input(String hint,String value){
        EditText e=new EditText(this);e.setHint(hint);e.setHintTextColor(DIM);e.setTextColor(WHITE);e.setTextSize(16);e.setText(value);e.setSingleLine(true);e.setBackground(stroke(PANEL2,15,LINE));pad(e,14,9,14,9);return e;
    }

    private AlertDialog.Builder builder(String title){
        AlertDialog.Builder b=new AlertDialog.Builder(this,android.R.style.Theme_Material_Dialog_Alert);if(title!=null)b.setTitle(title);return b;
    }

    private void styleDialog(AlertDialog d){
        if(d.getWindow()!=null)d.getWindow().setBackgroundDrawable(bg(PANEL2,22));
        if(d.getButton(AlertDialog.BUTTON_POSITIVE)!=null)d.getButton(AlertDialog.BUTTON_POSITIVE).setTextColor(WHITE);
        if(d.getButton(AlertDialog.BUTTON_NEGATIVE)!=null)d.getButton(AlertDialog.BUTTON_NEGATIVE).setTextColor(MUTED);
        if(d.getButton(AlertDialog.BUTTON_NEUTRAL)!=null)d.getButton(AlertDialog.BUTTON_NEUTRAL).setTextColor(MUTED);
    }
    private void showDialog(AlertDialog d){d.show();styleDialog(d);}
    private void showList(String title,String[] items,DialogInterface.OnClickListener listener){
        AlertDialog d=builder(title).setItems(items,listener).create();d.show();styleDialog(d);
    }
    private void toast(String s){Toast.makeText(this,s,Toast.LENGTH_SHORT).show();}

    private void requestNotifications(){
        if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},NOTIF_PERMISSION);
    }

    @Override protected void onActivityResult(int req,int res,Intent data){
        super.onActivityResult(req,res,data);if(res!=RESULT_OK)return;
        if(req==SPEECH&&data!=null){
            ArrayList<String> r=data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);if(r!=null&&!r.isEmpty()&&chatInput!=null)chatInput.setText(r.get(0));return;
        }
        if(req==PICK_AVATAR&&data!=null&&data.getData()!=null){
            Uri u=data.getData();try{getContentResolver().takePersistableUriPermission(u,Intent.FLAG_GRANT_READ_URI_PERMISSION);}catch(Exception ignored){}
            store.updateBot(currentId,"avatarUri",u.toString());toast("Photo selected");render();return;
        }
        if(req==PICK_FILE&&data!=null&&data.getData()!=null){store.addMessage(currentId,"user","[File attached]","","file:"+data.getData());render();return;}
        if(req==PICK_IMAGE&&data!=null&&data.getData()!=null){store.addMessage(currentId,"user","[Image attached]","","image:"+data.getData());render();return;}
        if(req==TAKE_PHOTO){store.addMessage(currentId,"user","[Photo captured]","","camera");render();}
    }

    @Override public void onBackPressed(){
        if("home".equals(screen)){super.onBackPressed();return;}
        if("plugins".equals(screen)||"usage".equals(screen)||"computer".equals(screen))screen="settings";
        else if("profile".equals(screen))screen="chat";
        else if("groupInfo".equals(screen))screen="groupChat";
        else screen="home";
        render();
    }
}
