package com.tiviloom.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.content.res.ColorStateList;
import android.net.Uri;
import android.view.*;
import android.widget.*;
import androidx.media3.common.*;
import androidx.media3.exoplayer.*;
import androidx.media3.exoplayer.analytics.AnalyticsListener;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.ui.*;
import org.json.JSONObject;
import java.util.*;

/** Single native decoder with touch controls independent of the WebView layout. */
public final class NativePlayerHost {
 private final Activity owner;
 private final Runnable expand,exit;
 private final java.util.function.Consumer<String> event;
 private boolean fullscreen=false;
 private String sourceKey="";
 private org.json.JSONArray catalogue=new org.json.JSONArray(),history=new org.json.JSONArray();
 private ImageButton expandButton,previewPause;
 private TextView gestureHud;private boolean gestureVolume;private float gestureStart,originalBrightness;private android.media.AudioManager audioManager;
 public FrameLayout view(){return root;}
 private static final long STARTUP_TIMEOUT_MS=12000;
 private boolean firstFrameRendered=false,expectsVideo=true,expectsAudio=true,compatibilitySoftware=false,terminalError=false;
 private long attemptStarted;
 private final LinkedHashMap<String,Integer> successfulEngines=new LinkedHashMap<>(64,.75f,true);
 private final Runnable startupCheck=()->checkStartup();
 private ExoPlayer player;private CompatibilityPlayer compatibility;private JSONObject sourceData;private boolean compatibilityAttempted=false;
 private PlayerView playerView;
 private FrameLayout root,controls;
 private LinearLayout top,bottom;
 private ImageButton playButton,rewind,forward,lockButton;
 private TextView status,time,title;
 private SeekBar seek;
 private final Handler handler=new Handler(Looper.getMainLooper());
 private boolean locked=false,dragging=false,resumePlayback=true,dialogOpen=false,released=false;
 private int fit=0,retries=0;
 private boolean allowReconnect=true,fitConfigured=false;
 private long selectedAt;
 private long resumePosition=0;
 private TrackSelectionParameters savedTracks;
 private String channelName="TiviLoom";
 private final Runnable hide=()->{if(!dragging&&!dialogOpen&&isPlaying()){controls.setVisibility(View.GONE);if(!locked)lockButton.setVisibility(View.GONE);}};
 private final Runnable progress=new Runnable(){public void run(){if(released)return;sync();rememberSuccessfulEngine();handler.postDelayed(this,500);}};
 private final Runnable retry=()->{if(!released&&player!=null){firstFrameRendered=false;player.prepare();player.play();armStartup();}};
 private int dp(int n){return Math.round(n*owner.getResources().getDisplayMetrics().density);}
 public NativePlayerHost(Activity owner,Runnable expand,Runnable exit,java.util.function.Consumer<String> event){
  this.owner=owner;this.expand=expand;this.exit=exit;this.event=event;
  audioManager=(android.media.AudioManager)owner.getSystemService(android.content.Context.AUDIO_SERVICE);originalBrightness=owner.getWindow().getAttributes().screenBrightness;
  root=new PlayerTouchSurface(owner,new PlayerTouchSurface.Gestures(){public boolean enabled(){return fullscreen&&!locked&&!dialogOpen;}public void begin(boolean volume){gestureVolume=volume;if(volume)gestureStart=audioManager.getStreamVolume(android.media.AudioManager.STREAM_MUSIC)/(float)Math.max(1,audioManager.getStreamMaxVolume(android.media.AudioManager.STREAM_MUSIC));else{gestureStart=owner.getWindow().getAttributes().screenBrightness;if(gestureStart<0)gestureStart=android.provider.Settings.System.getInt(owner.getContentResolver(),android.provider.Settings.System.SCREEN_BRIGHTNESS,128)/255f;}handler.removeCallbacks(hideGesture);}public void move(float amount){adjustGesture(amount);}public void end(){handler.postDelayed(hideGesture,900);}});root.setBackgroundColor(Color.BLACK);
  playerView=new PlayerView(owner);playerView.setUseController(false);playerView.setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING);
  root.addView(playerView,new FrameLayout.LayoutParams(-1,-1));
  controls=new FrameLayout(owner);root.addView(controls,new FrameLayout.LayoutParams(-1,-1));
  controls.setOnClickListener(v->toggleControls());playerView.setOnClickListener(v->toggleControls());
  top=row();top.setGravity(Gravity.CENTER_VERTICAL);top.setPadding(dp(8),0,dp(72),0);top.setBackgroundColor(0xBB080C12);
  FrameLayout.LayoutParams tp=new FrameLayout.LayoutParams(-1,dp(64),Gravity.TOP);controls.addView(top,tp);
  top.addView(button(R.drawable.player_back,"Siyahıya qayıt",v->exit.run()),new LinearLayout.LayoutParams(dp(52),dp(52)));
  title=new TextView(owner);title.setTextColor(Color.WHITE);title.setTextSize(18);title.setSingleLine(true);title.setEllipsize(android.text.TextUtils.TruncateAt.END);title.setPadding(dp(12),0,dp(8),0);
  top.addView(title,new LinearLayout.LayoutParams(0,-2,1));
  LinearLayout middle=row();middle.setGravity(Gravity.CENTER);FrameLayout.LayoutParams mp=new FrameLayout.LayoutParams(-2,dp(76),Gravity.CENTER);controls.addView(middle,mp);
  rewind=button(R.drawable.player_rewind,"10 saniyə geri",v->jump(-10000));middle.addView(rewind,cell(56));
  playButton=button(R.drawable.player_pause,"Fasilə",v->togglePlayback());middle.addView(playButton,cell(72));
  forward=button(R.drawable.player_forward,"10 saniyə irəli",v->jump(10000));middle.addView(forward,cell(56));
  bottom=new LinearLayout(owner);bottom.setOrientation(LinearLayout.VERTICAL);bottom.setPadding(dp(16),dp(4),dp(16),dp(8));bottom.setBackgroundColor(0xCC080C12);
  controls.addView(bottom,new FrameLayout.LayoutParams(-1,-2,Gravity.BOTTOM));
  seek=new SeekBar(owner);seek.setMax(10000);seek.setProgressTintList(ColorStateList.valueOf(0xFF00CDEB));seek.setThumbTintList(ColorStateList.valueOf(0xFF00CDEB));seek.setContentDescription("Video vaxtı");bottom.addView(seek,new LinearLayout.LayoutParams(-1,dp(40)));
  seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){public void onStartTrackingTouch(SeekBar s){dragging=true;handler.removeCallbacks(hide);}public void onProgressChanged(SeekBar s,int p,boolean user){if(user)time.setText(clock(duration()*p/10000)+" / "+clock(duration()));}public void onStopTrackingTouch(SeekBar s){if(seekable())seekTo(duration()*s.getProgress()/10000);dragging=false;showControls();}});
  LinearLayout tools=row();tools.setGravity(Gravity.CENTER_VERTICAL);bottom.addView(tools,new LinearLayout.LayoutParams(-1,dp(52)));
  time=new TextView(owner);time.setTextColor(Color.WHITE);time.setTextSize(14);time.setSingleLine(true);time.setPadding(dp(8),0,dp(8),0);tools.addView(time,new LinearLayout.LayoutParams(0,-2,1));
  tools.addView(button(R.drawable.player_search,"Axtar",v->requestPanel("search")),cell(48));
  tools.addView(button(R.drawable.player_list,"Kanal siyahısı",v->requestPanel("channels")),cell(48));
  tools.addView(button(R.drawable.player_history,"Tarixçə",v->requestPanel("history")),cell(48));
  tools.addView(button(R.drawable.player_more,"Digər funksiyalar",v->more()),cell(48));
  tools.addView(button(R.drawable.player_audio,"Səs dilini seç",v->tracks(C.TRACK_TYPE_AUDIO,"Səs")),cell(48));
  tools.addView(button(R.drawable.player_subtitles,"Altyazı seç",v->tracks(C.TRACK_TYPE_TEXT,"Altyazı")),cell(48));
  tools.addView(button(R.drawable.player_fit,"Görüntü ölçüsü",v->{fit=(fit+1)%3;if(compatibility!=null)compatibility.fit(fit);playerView.setResizeMode(new int[]{AspectRatioFrameLayout.RESIZE_MODE_FIT,AspectRatioFrameLayout.RESIZE_MODE_ZOOM,AspectRatioFrameLayout.RESIZE_MODE_FILL}[fit]);event.accept("fit:"+new String[]{"contain","cover","fill"}[fit]);Toast.makeText(owner,new String[]{"Ölçüyə uyğun","Yaxınlaşdır","Ekranı doldur"}[fit],Toast.LENGTH_SHORT).show();showControls();}),cell(48));
  lockButton=button(R.drawable.player_lock,"Ekranı kilidlə",v->{locked=!locked;controls.setVisibility(locked?View.GONE:View.VISIBLE);lockButton.setImageResource(locked?R.drawable.player_unlock:R.drawable.player_lock);lockButton.setContentDescription(locked?"Ekran kilidini aç":"Ekranı kilidlə");showControls();});
  FrameLayout.LayoutParams lp=new FrameLayout.LayoutParams(dp(52),dp(52),Gravity.TOP|Gravity.RIGHT);lp.setMargins(dp(6),dp(6),dp(12),0);root.addView(lockButton,lp);
  status=new TextView(owner);status.setTextColor(Color.WHITE);status.setTextSize(14);status.setMaxLines(2);status.setGravity(Gravity.CENTER);status.setPadding(dp(12),dp(8),dp(12),dp(8));status.setBackgroundColor(0xBB080C12);
  FrameLayout.LayoutParams sp=new FrameLayout.LayoutParams(-2,-2,Gravity.TOP|Gravity.CENTER_HORIZONTAL);sp.topMargin=dp(70);root.addView(status,sp);
  root.setOnApplyWindowInsetsListener((v,insets)->{
   int left=0,right=0,upper=0,lower=0;
   if(fullscreen&&Build.VERSION.SDK_INT>=30){android.graphics.Insets i=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());left=i.left;right=i.right;upper=i.top;lower=i.bottom;}
   else if(fullscreen){left=insets.getSystemWindowInsetLeft();right=insets.getSystemWindowInsetRight();upper=insets.getSystemWindowInsetTop();lower=insets.getSystemWindowInsetBottom();if(Build.VERSION.SDK_INT>=28&&insets.getDisplayCutout()!=null){left=Math.max(left,insets.getDisplayCutout().getSafeInsetLeft());right=Math.max(right,insets.getDisplayCutout().getSafeInsetRight());}}
   controls.setPadding(left,upper,right,lower);FrameLayout.LayoutParams p=(FrameLayout.LayoutParams)lockButton.getLayoutParams();p.topMargin=upper+dp(6);p.rightMargin=right+dp(12);lockButton.setLayoutParams(p);FrameLayout.LayoutParams st=(FrameLayout.LayoutParams)status.getLayoutParams();st.topMargin=upper+dp(70);status.setLayoutParams(st);return insets;
  });
  expandButton=button(R.drawable.player_fit,"Tam ekran",v->expand.run());
  FrameLayout.LayoutParams ep=new FrameLayout.LayoutParams(dp(48),dp(48),Gravity.BOTTOM|Gravity.RIGHT);ep.setMargins(dp(8),dp(8),dp(8),dp(8));root.addView(expandButton,ep);
  previewPause=button(R.drawable.player_pause,"Önizləməni pauza et",v->togglePlayback());FrameLayout.LayoutParams pp=new FrameLayout.LayoutParams(dp(48),dp(48),Gravity.BOTTOM|Gravity.LEFT);pp.setMargins(dp(8),dp(8),dp(8),dp(8));root.addView(previewPause,pp);
  gestureHud=PlayerSheets.text(owner,"",16,PlayerSheets.FG);gestureHud.setGravity(Gravity.CENTER);gestureHud.setPadding(dp(20),dp(14),dp(20),dp(14));gestureHud.setBackground(PlayerSheets.panel(0xEE12263D,18,owner));FrameLayout.LayoutParams hp=new FrameLayout.LayoutParams(-2,-2,Gravity.CENTER);root.addView(gestureHud,hp);gestureHud.setVisibility(View.GONE);
  setFullscreen(false);handler.post(progress);
 }
 public void setFullscreen(boolean full){fullscreen=full;controls.setVisibility(full?View.VISIBLE:View.GONE);lockButton.setVisibility(full?View.VISIBLE:View.GONE);expandButton.setVisibility(full?View.GONE:View.VISIBLE);previewPause.setVisibility(full?View.GONE:View.VISIBLE);if(!full){gestureHud.setVisibility(View.GONE);restoreBrightness();}if(full)showControls();root.requestApplyInsets();}
 public void load(String payload)throws Exception{
  JSONObject data=new JSONObject(payload);catalogue=data.optJSONArray("catalogue");history=data.optJSONArray("history");if(catalogue==null)catalogue=new org.json.JSONArray();if(history==null)history=new org.json.JSONArray();
  Uri checked=Uri.parse(data.getString("url"));if(!Arrays.asList("http","https").contains(checked.getScheme())||checked.getUserInfo()!=null)throw new IllegalArgumentException();
  String headerValues=data.optString("userAgent")+data.optString("referer");if(headerValues.contains("\r")||headerValues.contains("\n"))throw new IllegalArgumentException();
  String key=data.getString("url")+"\n"+data.optString("userAgent")+"\n"+data.optString("referer");
  channelName=data.optString("name","TiviLoom");title.setText(channelName);
  if(compatibility!=null&&sourceKey.equals(key)){compatibility.setMuted(data.optBoolean("muted",false));return;}
  if(player!=null&&sourceKey.equals(key)){if(player.getPlayerError()!=null){retries=0;player.prepare();}player.setVolume(data.optBoolean("muted",false)?0:1);return;}
  if(compatibility!=null){root.removeView(compatibility.view);compatibility.release();compatibility=null;}compatibilityAttempted=false;sourceData=data;playerView.setVisibility(View.VISIBLE);
  handler.removeCallbacks(startupCheck);handler.removeCallbacks(retry);if(player!=null){playerView.setPlayer(null);player.release();player=null;}firstFrameRendered=false;terminalError=false;expectsVideo=true;expectsAudio=true;retries=0;resumePosition=0;savedTracks=null;resumePlayback=true;sourceKey=key;
  allowReconnect=data.optBoolean("autoReconnect",true);if(!fitConfigured){String mode=data.optString("fit","contain");fit=mode.equals("fill")?2:mode.equals("cover")||mode.equals("cinema-zoom")?1:0;fitConfigured=true;}
  Integer preferred=successfulEngines.get(key);if(preferred!=null){startCompatibility(preferred==2);return;}start(payload);
 }
 public void release(){if(compatibility!=null){compatibility.release();compatibility=null;}released=true;restoreBrightness();handler.removeCallbacksAndMessages(null);playerView.setPlayer(null);if(player!=null){player.release();player=null;}}
 public void pause(){handler.removeCallbacks(startupCheck);if(compatibility!=null)compatibility.mpPause();handler.removeCallbacks(retry);if(player!=null)player.pause();}
 public void back(){handleBack();}
 private LinearLayout row(){LinearLayout l=new LinearLayout(owner);l.setOrientation(LinearLayout.HORIZONTAL);return l;}
 private LinearLayout.LayoutParams cell(int size){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(dp(size),dp(size));p.setMargins(dp(4),0,dp(4),0);return p;}
 private ImageButton button(int icon,String label,View.OnClickListener action){ImageButton b=new ImageButton(owner);b.setImageResource(icon);b.setScaleType(ImageView.ScaleType.CENTER_INSIDE);b.setPadding(dp(14),dp(14),dp(14),dp(14));b.setContentDescription(label);b.setMinimumWidth(dp(48));b.setMinimumHeight(dp(48));GradientDrawable bg=new GradientDrawable();bg.setColor(0x99202A36);bg.setCornerRadius(dp(36));b.setBackground(new android.graphics.drawable.RippleDrawable(ColorStateList.valueOf(0x5500CDEB),bg,null));b.setOnClickListener(v->{action.onClick(v);showControls();});return b;}
 private void start(String payload)throws Exception{
  selectedAt=System.nanoTime();
  JSONObject data=new JSONObject(payload==null?"{}":payload);Uri uri=Uri.parse(data.getString("url"));if(!Arrays.asList("http","https").contains(uri.getScheme())||uri.getUserInfo()!=null)throw new IllegalArgumentException();
  channelName=data.optString("name","TiviLoom");title.setText(channelName);allowReconnect=data.optBoolean("autoReconnect",true);if(!fitConfigured){String mode=data.optString("fit","contain");fit=mode.equals("fill")?2:mode.equals("cover")||mode.equals("cinema-zoom")?1:0;fitConfigured=true;}playerView.setResizeMode(new int[]{AspectRatioFrameLayout.RESIZE_MODE_FIT,AspectRatioFrameLayout.RESIZE_MODE_ZOOM,AspectRatioFrameLayout.RESIZE_MODE_FILL}[fit]);
  String agent=data.optString("userAgent","");if(agent.isEmpty())agent="TiviLoom-Android/0.6.12";
  String referer=data.optString("referer","");if((agent+referer).contains("\r")||(agent+referer).contains("\n"))throw new IllegalArgumentException();
  Map<String,String> headers=new HashMap<>();headers.put("User-Agent",agent);if(!referer.isEmpty())headers.put("Referer",referer);
  DefaultHttpDataSource.Factory http=new DefaultHttpDataSource.Factory().setUserAgent(agent).setConnectTimeoutMs(8000).setReadTimeoutMs(12000).setAllowCrossProtocolRedirects(true).setDefaultRequestProperties(headers);
  DefaultLoadControl loadControl=new DefaultLoadControl.Builder().setBufferDurationsMs(1500,15000,500,1500).setPrioritizeTimeOverSizeThresholds(true).build();
  player=new ExoPlayer.Builder(owner).setRenderersFactory(new DefaultRenderersFactory(owner).setEnableDecoderFallback(true)).setMediaSourceFactory(new androidx.media3.exoplayer.source.DefaultMediaSourceFactory(http,new androidx.media3.extractor.DefaultExtractorsFactory().setTsExtractorFlags(androidx.media3.extractor.ts.DefaultTsPayloadReaderFactory.FLAG_ALLOW_NON_IDR_KEYFRAMES))).setLoadControl(loadControl).build();
  player.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(),true);player.setHandleAudioBecomingNoisy(true);player.setVolume(data.optBoolean("muted",false)?0f:1f);playerView.setPlayer(player);
  final ExoPlayer activePlayer=player;
  player.addListener(new Player.Listener(){
   @Override public void onTracksChanged(Tracks tracks){if(player!=activePlayer||compatibilityAttempted||released)return;if(!tracks.getGroups().isEmpty()){expectsVideo=tracks.getGroups().stream().anyMatch(g->g.getType()==C.TRACK_TYPE_VIDEO);expectsAudio=tracks.getGroups().stream().anyMatch(g->g.getType()==C.TRACK_TYPE_AUDIO);}boolean unsupported=false;for(int type:new int[]{C.TRACK_TYPE_AUDIO,C.TRACK_TYPE_VIDEO}){boolean present=false,supported=false;for(Tracks.Group g:tracks.getGroups())if(g.getType()==type){present=true;supported|=g.isSupported();}if(present&&!supported)unsupported=true;}if(unsupported){ExoPlayer expected=player;handler.post(()->{if(player==expected)startCompatibility();});}}

   @Override public void onPlaybackStateChanged(int state){if(player!=activePlayer||released)return;if(state==Player.STATE_BUFFERING){event.accept("phase:buffering");status.setVisibility(View.VISIBLE);status.setText("Yayım yüklənir…");}else if(state==Player.STATE_READY){event.accept(firstFrameRendered||!expectsVideo?"phase:playing":"phase:buffering");handler.removeCallbacks(retry);retries=0;status.setVisibility(firstFrameRendered||!expectsVideo?View.GONE:View.VISIBLE);}else if(state==Player.STATE_ENDED){status.setVisibility(View.VISIBLE);status.setText("Yayım bitdi");showControls();}sync();}
   @Override public void onIsPlayingChanged(boolean value){if(player!=activePlayer||released)return;if(!player.getPlayWhenReady())event.accept("phase:paused");else if(value&&(firstFrameRendered||!expectsVideo))event.accept("phase:playing");sync();if(!value)showControls();else showControls();}
   @Override public void onPlayerError(PlaybackException e){handlePlayerError(activePlayer,e);}
  });
  player.addAnalyticsListener(new AnalyticsListener(){@Override public void onRenderedFirstFrame(AnalyticsListener.EventTime e,Object output,long renderTimeMs){if(player!=activePlayer||released)return;firstFrameRendered=true;handler.removeCallbacks(startupCheck);status.setVisibility(View.GONE);event.accept("phase:playing");android.util.Log.i("TiviLoomPlayback","first_frame_ms="+(System.nanoTime()-selectedAt)/1000000L);}});
  MediaItem item=new MediaItem.Builder().setUri(uri).build();
  player.setMediaSource(BroadcastMediaSources.create(http,item));if(savedTracks!=null)player.setTrackSelectionParameters(savedTracks);if(resumePosition>0)player.seekTo(resumePosition);player.prepare();player.setPlayWhenReady(resumePlayback);armStartup();showControls();
 }
 private void handlePlayerError(ExoPlayer activePlayer,PlaybackException e){if(player!=activePlayer||released)return;handler.removeCallbacks(startupCheck);if(e.errorCode==PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW&&allowReconnect&&retries++<2){firstFrameRendered=false;player.seekToDefaultPosition();player.prepare();player.play();armStartup();return;}if(e.errorCode>=3000&&e.errorCode<6000&&!compatibilityAttempted){{ExoPlayer expected=player;handler.post(()->{if(player==expected)startCompatibility();});}return;}event.accept("phase:error");status.setVisibility(View.VISIBLE);boolean network=e.errorCode>=2000&&e.errorCode<3000&&e.errorCode!=PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS;if(allowReconnect&&network&&resumePlayback&&retries<2){retries++;status.setText("Bağlantı yenilənir · "+retries+"/2");handler.postDelayed(retry,retries*1000L);}else{status.setText(e.errorCode>=4000&&e.errorCode<5000?"Bu cihaz yayım formatını aça bilmədi":e.errorCode==PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS?httpFailure(e):"Yayım açıla bilmədi. Yenidən sınamaq üçün Oynat düyməsinə toxunun.");showControls();}}
 private String httpFailure(Throwable error){for(Throwable cause=error;cause!=null;cause=cause.getCause())if(cause instanceof androidx.media3.datasource.HttpDataSource.InvalidResponseCodeException)return "Provayder HTTP "+((androidx.media3.datasource.HttpDataSource.InvalidResponseCodeException)cause).responseCode+" qaytardı";return "Provayder yayımı təqdim etmədi";}
 private void more(){String[] labels={"Əvvəlki kanal","Növbəti kanal","Sevimlilərə əlavə et / çıxar","Ayarlar","Yuxu taymeri","Səsi aç / bağla"};String[] commands={"previous","next","favorite","settings","sleep","mute"};dialogOpen=true;showTrackDialog(PlayerSheets.choices(owner,"Digər funksiyalar",channelName,labels,-1,which->{if(commands[which].equals("mute")&&(player!=null||compatibility!=null)){boolean muted=compatibility!=null?compatibility.mp.getVolume()>0:player.getVolume()>0;if(compatibility!=null)compatibility.setMuted(muted);else player.setVolume(muted?0:1);event.accept("muted:"+muted);}else event.accept("command:"+commands[which]);}));}

 public void catalogue(String payload)throws Exception{JSONObject data=new JSONObject(payload);catalogue=data.getJSONArray("catalogue");history=data.getJSONArray("history");channelPanel(data.getString("mode"));}
 private void requestPanel(String mode){if(owner instanceof MainActivity)event.accept("panel:"+mode);else channelPanel(mode);}
 private void channelPanel(String mode){
  LinearLayout content=PlayerSheets.body(owner);content.setPadding(0,0,0,0);
  EditText query=new EditText(owner);query.setSingleLine(true);query.setTextColor(PlayerSheets.FG);query.setHintTextColor(PlayerSheets.MUTED);query.setTextSize(15);query.setPadding(dp(16),0,dp(16),0);query.setBackground(PlayerSheets.panel(0xFF0C192B,14,owner));query.setHint("Kanal və ya kateqoriya axtar");content.addView(query,new LinearLayout.LayoutParams(-1,dp(48)));
  ListView list=new ListView(owner);list.setDivider(new android.graphics.drawable.ColorDrawable(Color.TRANSPARENT));list.setDividerHeight(dp(6));list.setPadding(0,dp(10),0,0);list.setClipToPadding(false);list.setSelector(android.R.color.transparent);content.addView(list,new LinearLayout.LayoutParams(-1,Math.max(dp(90),Math.min(dp(290),(int)(owner.getResources().getDisplayMetrics().heightPixels*.38)))));
  TextView empty=PlayerSheets.text(owner,"Nəticə tapılmadı",14,PlayerSheets.MUTED);empty.setGravity(Gravity.CENTER);empty.setPadding(0,dp(16),0,dp(16));content.addView(empty);list.setEmptyView(empty);
  java.util.List<JSONObject> entries=new ArrayList<>();
  if(mode.equals("history")){for(int h=0;h<history.length();h++)for(int i=0;i<catalogue.length();i++){JSONObject c=catalogue.optJSONObject(i);if(c!=null&&c.optString("id").equals(history.optString(h)))entries.add(c);}}
  else for(int i=0;i<catalogue.length();i++){JSONObject c=catalogue.optJSONObject(i);if(c!=null)entries.add(c);}
  java.util.List<JSONObject> shown=new ArrayList<>();BaseAdapter adapter=new BaseAdapter(){public int getCount(){return shown.size();}public Object getItem(int p){return shown.get(p);}public long getItemId(int p){return p;}public View getView(int p,View reuse,android.view.ViewGroup parent){LinearLayout row=reuse instanceof LinearLayout?(LinearLayout)reuse:PlayerSheets.body(owner);row.removeAllViews();JSONObject c=shown.get(p);boolean active=c.optString("name").equals(channelName);row.setBackground(PlayerSheets.panel(active?0xFF164459:0xFF142338,14,owner));row.setPadding(dp(14),dp(10),dp(14),dp(10));TextView name=PlayerSheets.text(owner,(active?"●  ":"")+c.optString("name"),15,PlayerSheets.FG);name.setSingleLine(true);name.setEllipsize(android.text.TextUtils.TruncateAt.END);row.addView(name);TextView group=PlayerSheets.text(owner,c.optString("group"),12,PlayerSheets.MUTED);group.setSingleLine(true);group.setEllipsize(android.text.TextUtils.TruncateAt.END);row.addView(group);return row;}};list.setAdapter(adapter);
  Runnable filter=()->{String q=query.getText().toString().toLowerCase(Locale.ROOT).trim();shown.clear();for(JSONObject c:entries){String label=c.optString("name")+" "+c.optString("group");if(label.toLowerCase(Locale.ROOT).contains(q))shown.add(c);}android.view.ViewGroup.LayoutParams bounds=list.getLayoutParams();bounds.height=Math.min(Math.max(dp(90),Math.min(dp(290),(int)(owner.getResources().getDisplayMetrics().heightPixels*.38))),Math.max(dp(72),shown.size()*dp(72)+dp(10)));list.setLayoutParams(bounds);adapter.notifyDataSetChanged();};query.addTextChangedListener(new android.text.TextWatcher(){public void beforeTextChanged(CharSequence s,int st,int c,int a){}public void onTextChanged(CharSequence s,int st,int before,int count){filter.run();}public void afterTextChanged(android.text.Editable e){}});filter.run();
  android.app.Dialog dialog=PlayerSheets.dialog(owner,mode.equals("history")?"Tarixçə":mode.equals("search")?"Axtar":"Kanal siyahısı",entries.size()+" kanal · "+channelName,content);list.setOnItemClickListener((parent,v,position,id)->{JSONObject c=shown.get(position);dialog.dismiss();event.accept("channel:"+c.optString("id"));});dialogOpen=true;showTrackDialog(dialog);if(mode.equals("search"))query.requestFocus();
 }

 private void tracks(int type,String label){
  if(player==null&&compatibility==null)return;java.util.List<String> names=new ArrayList<>();java.util.List<Runnable> actions=new ArrayList<>();int selected=0;
  if(compatibility!=null){final CompatibilityPlayer active=compatibility;org.videolan.libvlc.MediaPlayer.TrackDescription[] tracks=type==C.TRACK_TYPE_AUDIO?active.mp.getAudioTracks():active.mp.getSpuTracks();int current=type==C.TRACK_TYPE_AUDIO?active.mp.getAudioTrack():active.mp.getSpuTrack();if(tracks!=null)for(org.videolan.libvlc.MediaPlayer.TrackDescription t:tracks){if(t.id==current)selected=names.size();names.add(t.id<0?"Söndür":t.name);final int id=t.id;actions.add(()->{if(compatibility==active){if(type==C.TRACK_TYPE_AUDIO)active.mp.setAudioTrack(id);else active.mp.setSpuTrack(id);}});}}
  else {final ExoPlayer active=player;names.add(type==C.TRACK_TYPE_TEXT?"Söndür":"Avtomatik");actions.add(()->{if(player==active)active.setTrackSelectionParameters(active.getTrackSelectionParameters().buildUpon().clearOverridesOfType(type).setTrackTypeDisabled(type,type==C.TRACK_TYPE_TEXT).build());});for(Tracks.Group g:active.getCurrentTracks().getGroups())if(g.getType()==type)for(int i=0;i<g.length;i++){if(!g.isTrackSupported(i))continue;final int index=i;Format f=g.getTrackFormat(i);String name=f.label;if(name==null||name.isEmpty())name=f.language==null?"Trek "+(i+1):Locale.forLanguageTag(f.language).getDisplayLanguage();if(type==C.TRACK_TYPE_AUDIO&&f.channelCount>0)name+=" · "+(f.channelCount>2?"Surround":f.channelCount==2?"Stereo":"Mono");names.add(name);if(g.isTrackSelected(i))selected=names.size()-1;actions.add(()->{if(player==active)active.setTrackSelectionParameters(active.getTrackSelectionParameters().buildUpon().setTrackTypeDisabled(type,false).setOverrideForType(new TrackSelectionOverride(g.getMediaTrackGroup(),index)).build());});}}
  if(names.isEmpty()){names.add("Seçim üçün trek yoxdur");actions.add(()->{});}dialogOpen=true;showTrackDialog(PlayerSheets.choices(owner,label,channelName+" · "+(names.size()==1?"Bu yayımda əlavə seçim yoxdur":"Yayımın mövcud trekləri"),names.toArray(new String[0]),selected,index->actions.get(index).run()));
 }

 private void showTrackDialog(android.app.Dialog dialog){
  if(Build.VERSION.SDK_INT>=33){
   android.window.OnBackInvokedCallback back=dialog::dismiss;
   dialog.setOnDismissListener(d->{dialog.getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(back);dialogOpen=false;showControls();});
   dialog.show();dialog.getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_OVERLAY,back);
  }else{
   dialog.setOnDismissListener(d->{dialogOpen=false;showControls();});
   dialog.setOnKeyListener((d,key,event)->{if(key!=KeyEvent.KEYCODE_BACK)return false;if(event.getAction()==KeyEvent.ACTION_UP)dialog.dismiss();return true;});dialog.show();
  }
  if(fullscreen&&dialog.getWindow()!=null){Window w=dialog.getWindow();if(Build.VERSION.SDK_INT>=30){w.setDecorFitsSystemWindows(false);WindowInsetsController c=w.getInsetsController();if(c!=null){c.hide(WindowInsets.Type.systemBars());c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);}}else w.getDecorView().setSystemUiVisibility(5894|512|1024);}
 }

 private void jump(long amount){if(seekable()){seekTo(Math.max(0,Math.min(duration(),position()+amount)));showControls();}}
 private String clock(long ms){long seconds=Math.max(0,ms/1000);return seconds>=3600?String.format(Locale.US,"%d:%02d:%02d",seconds/3600,seconds/60%60,seconds%60):String.format(Locale.US,"%d:%02d",seconds/60,seconds%60);}
 private boolean isPlaying(){return compatibility!=null?compatibility.mp.isPlaying():player!=null&&player.isPlaying();}
 private long duration(){return compatibility!=null?Math.max(0,compatibility.mp.getLength()):player==null?0:Math.max(0,player.getDuration());}
 private long position(){return compatibility!=null?Math.max(0,compatibility.mp.getTime()):player==null?0:player.getCurrentPosition();}
 private boolean seekable(){return compatibility!=null?compatibility.mp.isSeekable()&&duration()>0:player!=null&&player.isCurrentMediaItemSeekable()&&duration()>0;}
 private void seekTo(long value){if(compatibility!=null)compatibility.mp.setTime(value);else if(player!=null)player.seekTo(value);}
 private void armStartup(){terminalError=false;attemptStarted=android.os.SystemClock.elapsedRealtime();handler.removeCallbacks(startupCheck);handler.postDelayed(startupCheck,STARTUP_TIMEOUT_MS);}
 private void rememberSuccessfulEngine(){if(compatibility==null||terminalError)return;boolean video=!expectsVideo||compatibility.frame(),audio=!expectsAudio||compatibility.audioDecoded();if(video&&audio){handler.removeCallbacks(startupCheck);successfulEngines.put(sourceKey,compatibilitySoftware?2:1);while(successfulEngines.size()>64)successfulEngines.remove(successfulEngines.keySet().iterator().next());}}
 private void checkStartup(){
  if(released||terminalError)return;
  if(!root.isAttachedToWindow()||root.getVisibility()!=View.VISIBLE){handler.postDelayed(startupCheck,STARTUP_TIMEOUT_MS);return;}
  if(compatibility!=null){if(!compatibility.wantsPlayback())return;boolean video=!expectsVideo||compatibility.frame(),audio=!expectsAudio||compatibility.audioDecoded();if(video&&audio){rememberSuccessfulEngine();return;}if(android.os.SystemClock.elapsedRealtime()-attemptStarted<STARTUP_TIMEOUT_MS){handler.postDelayed(startupCheck,STARTUP_TIMEOUT_MS);return;}if(!compatibilitySoftware){startCompatibility(true);return;}terminalError=true;compatibility.mpPause();successfulEngines.remove(sourceKey);status.setVisibility(View.VISIBLE);status.setText("Yayım görüntü/səs vermədi. Başqa kanal seçin və ya yenidən Oynat düyməsinə toxunun.");event.accept("phase:error");showControls();return;}
  if(player==null||!player.getPlayWhenReady()||player.getPlayerError()!=null||firstFrameRendered||!expectsVideo)return;
  if(android.os.SystemClock.elapsedRealtime()-attemptStarted<STARTUP_TIMEOUT_MS){handler.postDelayed(startupCheck,STARTUP_TIMEOUT_MS);return;}startCompatibility(false);
 }
 private void startCompatibility(){startCompatibility(false);}
 private void startCompatibility(boolean software){
  if(released||sourceData==null||(!software&&compatibilityAttempted))return;
  compatibilityAttempted=true;compatibilitySoftware=software;handler.removeCallbacks(retry);handler.removeCallbacks(startupCheck);
  if(player!=null){playerView.setPlayer(null);player.release();player=null;}
  if(compatibility!=null){root.removeView(compatibility.view);compatibility.release();compatibility=null;}
  playerView.setVisibility(View.GONE);status.setVisibility(View.VISIBLE);status.setText("Yayım yüklənir…");
  try{compatibility=new CompatibilityPlayer(owner,sourceData,software,phase->{if(phase.equals("error")&&!compatibilitySoftware&&compatibility!=null&&compatibility.hasMediaData()){CompatibilityPlayer failed=compatibility;handler.removeCallbacks(startupCheck);handler.post(()->{if(compatibility==failed&&!released)startCompatibility(true);});return;}if(phase.equals("error")||phase.equals("ended")){terminalError=true;handler.removeCallbacks(startupCheck);successfulEngines.remove(sourceKey);}event.accept("phase:"+phase);status.setVisibility(phase.equals("playing")||phase.equals("paused")?View.GONE:View.VISIBLE);status.setText(phase.equals("error")?"Yayım açıla bilmədi":phase.equals("ended")?"Yayım bitdi":"Yayım yüklənir…");sync();});root.addView(compatibility.view,0,new FrameLayout.LayoutParams(-1,-1));compatibility.view.setOnClickListener(v->toggleControls());compatibility.fit(fit);compatibility.play();armStartup();}catch(Exception e){terminalError=true;successfulEngines.remove(sourceKey);status.setVisibility(View.VISIBLE);status.setText("Uyğunluq pleyeri açıla bilmədi");event.accept("phase:error");}
 }
 private void sync(){if((player==null&&compatibility==null)||released)return;boolean playing=compatibility!=null?compatibility.wantsPlayback()&&!terminalError:player.getPlayerError()==null&&player.getPlayWhenReady()&&player.getPlaybackState()!=Player.STATE_ENDED;playButton.setImageResource(playing?R.drawable.player_pause:R.drawable.player_play);previewPause.setImageResource(playing?R.drawable.player_pause:R.drawable.player_play);previewPause.setContentDescription(playing?"Önizləməni pauza et":"Önizləməni oynat");playButton.setContentDescription(playing?"Fasilə":"Oynat");boolean canSeek=seekable();rewind.setEnabled(canSeek);forward.setEnabled(canSeek);rewind.setAlpha(canSeek?1f:.35f);forward.setAlpha(canSeek?1f:.35f);seek.setVisibility(canSeek?View.VISIBLE:View.GONE);if(!dragging){if(canSeek){seek.setProgress((int)(10000L*position()/duration()));time.setText(clock(position())+" / "+clock(duration()));}else time.setText("CANLI");}}
 private void toggleControls(){if(!fullscreen){togglePlayback();return;}if(locked)return;if(controls.getVisibility()==View.VISIBLE){controls.setVisibility(View.GONE);lockButton.setVisibility(View.GONE);}else showControls();}
 private void showControls(){if(!fullscreen){controls.setVisibility(View.GONE);lockButton.setVisibility(View.GONE);return;}handler.removeCallbacks(hide);if(locked){controls.setVisibility(View.GONE);lockButton.setVisibility(View.VISIBLE);return;}controls.setVisibility(View.VISIBLE);lockButton.setVisibility(View.VISIBLE);handler.postDelayed(hide,4000);}
 private void hideSystemBars(){if(Build.VERSION.SDK_INT>=30){WindowInsetsController c=owner.getWindow().getInsetsController();if(c!=null){c.hide(WindowInsets.Type.systemBars());c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);}}else owner.getWindow().getDecorView().setSystemUiVisibility(5894|512|1024);}
 private void handleBack(){if(locked){locked=false;lockButton.setImageResource(R.drawable.player_lock);lockButton.setContentDescription("Ekranı kilidlə");showControls();}else exit.run();}
 private final Runnable hideGesture=()->{if(gestureHud!=null)gestureHud.setVisibility(View.GONE);};
 private void restoreBrightness(){WindowManager.LayoutParams p=owner.getWindow().getAttributes();p.screenBrightness=originalBrightness;owner.getWindow().setAttributes(p);}
 private void adjustGesture(float delta){float value=Math.max(gestureVolume?0:.02f,Math.min(1,gestureStart+delta));if(gestureVolume){int max=audioManager.getStreamMaxVolume(android.media.AudioManager.STREAM_MUSIC);audioManager.setStreamVolume(android.media.AudioManager.STREAM_MUSIC,Math.round(value*max),0);}else{WindowManager.LayoutParams p=owner.getWindow().getAttributes();p.screenBrightness=value;owner.getWindow().setAttributes(p);}gestureHud.setText((gestureVolume?"Səs":"Parlaqlıq")+"  "+Math.round(value*100)+"%");gestureHud.setVisibility(View.VISIBLE);}
 private void togglePlayback(){if(compatibility!=null){if(compatibility.wantsPlayback())compatibility.mpPause();else{compatibility.play();armStartup();}sync();return;}if(player==null)return;handler.removeCallbacks(retry);if(player.getPlayWhenReady()&&player.getPlayerError()==null)player.pause();else{if(player.getPlayerError()!=null){retries=0;player.prepare();}else if(player.getPlaybackState()==Player.STATE_ENDED)player.seekToDefaultPosition();player.play();if(!firstFrameRendered)armStartup();}sync();showControls();}

}
