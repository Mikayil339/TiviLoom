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
public final class NativePlaybackActivity extends Activity {
 private ExoPlayer player;
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
 private final Runnable hide=()->{if(!dragging&&!dialogOpen&&player!=null&&player.isPlaying()){controls.setVisibility(View.GONE);if(!locked)lockButton.setVisibility(View.GONE);}};
 private final Runnable progress=new Runnable(){public void run(){if(released)return;sync();handler.postDelayed(this,500);}};
 private final Runnable retry=()->{if(!released&&player!=null){player.prepare();player.play();}};
 private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
 @Override public void onCreate(Bundle saved){
  super.onCreate(saved);getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
  getWindow().setNavigationBarColor(Color.BLACK);getWindow().setStatusBarColor(Color.BLACK);
  if(Build.VERSION.SDK_INT>=30)getWindow().setDecorFitsSystemWindows(false);
  else getWindow().getDecorView().setSystemUiVisibility(5894|512|1024);
  root=new FrameLayout(this);root.setBackgroundColor(Color.BLACK);
  playerView=new PlayerView(this);playerView.setUseController(false);playerView.setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING);
  root.addView(playerView,new FrameLayout.LayoutParams(-1,-1));
  controls=new FrameLayout(this);root.addView(controls,new FrameLayout.LayoutParams(-1,-1));
  controls.setOnClickListener(v->toggleControls());playerView.setOnClickListener(v->toggleControls());
  top=row();top.setGravity(Gravity.CENTER_VERTICAL);top.setPadding(dp(8),0,dp(72),0);top.setBackgroundColor(0xBB080C12);
  FrameLayout.LayoutParams tp=new FrameLayout.LayoutParams(-1,dp(64),Gravity.TOP);controls.addView(top,tp);
  top.addView(button(R.drawable.player_back,"Siyahıya qayıt",v->finish()),new LinearLayout.LayoutParams(dp(52),dp(52)));
  title=new TextView(this);title.setTextColor(Color.WHITE);title.setTextSize(18);title.setSingleLine(true);title.setEllipsize(android.text.TextUtils.TruncateAt.END);title.setPadding(dp(12),0,dp(8),0);
  top.addView(title,new LinearLayout.LayoutParams(0,-2,1));
  LinearLayout middle=row();middle.setGravity(Gravity.CENTER);FrameLayout.LayoutParams mp=new FrameLayout.LayoutParams(-2,dp(76),Gravity.CENTER);controls.addView(middle,mp);
  rewind=button(R.drawable.player_rewind,"10 saniyə geri",v->jump(-10000));middle.addView(rewind,cell(56));
  playButton=button(R.drawable.player_pause,"Fasilə",v->{if(player==null)return;handler.removeCallbacks(retry);if(player.isPlaying())player.pause();else if(player.getPlayerError()!=null){retries=0;player.prepare();player.play();}else if(player.getPlaybackState()==Player.STATE_ENDED){player.seekToDefaultPosition();player.play();}else player.play();sync();showControls();});middle.addView(playButton,cell(72));
  forward=button(R.drawable.player_forward,"10 saniyə irəli",v->jump(10000));middle.addView(forward,cell(56));
  bottom=new LinearLayout(this);bottom.setOrientation(LinearLayout.VERTICAL);bottom.setPadding(dp(16),dp(4),dp(16),dp(8));bottom.setBackgroundColor(0xCC080C12);
  controls.addView(bottom,new FrameLayout.LayoutParams(-1,-2,Gravity.BOTTOM));
  seek=new SeekBar(this);seek.setMax(10000);seek.setProgressTintList(ColorStateList.valueOf(0xFF00CDEB));seek.setThumbTintList(ColorStateList.valueOf(0xFF00CDEB));seek.setContentDescription("Video vaxtı");bottom.addView(seek,new LinearLayout.LayoutParams(-1,dp(40)));
  seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){public void onStartTrackingTouch(SeekBar s){dragging=true;handler.removeCallbacks(hide);}public void onProgressChanged(SeekBar s,int p,boolean user){if(user&&player!=null)time.setText(clock(player.getDuration()*p/10000)+" / "+clock(player.getDuration()));}public void onStopTrackingTouch(SeekBar s){if(player!=null&&player.isCurrentMediaItemSeekable())player.seekTo(player.getDuration()*s.getProgress()/10000);dragging=false;showControls();}});
  LinearLayout tools=row();tools.setGravity(Gravity.CENTER_VERTICAL);bottom.addView(tools,new LinearLayout.LayoutParams(-1,dp(52)));
  time=new TextView(this);time.setTextColor(Color.WHITE);time.setTextSize(14);time.setSingleLine(true);time.setPadding(dp(8),0,dp(8),0);tools.addView(time,new LinearLayout.LayoutParams(0,-2,1));
  tools.addView(button(R.drawable.player_audio,"Səs dilini seç",v->tracks(C.TRACK_TYPE_AUDIO,"Səs")),cell(48));
  tools.addView(button(R.drawable.player_subtitles,"Altyazı seç",v->tracks(C.TRACK_TYPE_TEXT,"Altyazı")),cell(48));
  tools.addView(button(R.drawable.player_fit,"Görüntü ölçüsü",v->{fit=(fit+1)%3;playerView.setResizeMode(new int[]{AspectRatioFrameLayout.RESIZE_MODE_FIT,AspectRatioFrameLayout.RESIZE_MODE_ZOOM,AspectRatioFrameLayout.RESIZE_MODE_FILL}[fit]);Toast.makeText(this,new String[]{"Ölçüyə uyğun","Yaxınlaşdır","Ekranı doldur"}[fit],Toast.LENGTH_SHORT).show();showControls();}),cell(48));
  lockButton=button(R.drawable.player_lock,"Ekranı kilidlə",v->{locked=!locked;controls.setVisibility(locked?View.GONE:View.VISIBLE);lockButton.setImageResource(locked?R.drawable.player_unlock:R.drawable.player_lock);lockButton.setContentDescription(locked?"Ekran kilidini aç":"Ekranı kilidlə");showControls();});
  FrameLayout.LayoutParams lp=new FrameLayout.LayoutParams(dp(52),dp(52),Gravity.TOP|Gravity.RIGHT);lp.setMargins(dp(6),dp(6),dp(12),0);root.addView(lockButton,lp);
  status=new TextView(this);status.setTextColor(Color.WHITE);status.setTextSize(14);status.setMaxLines(2);status.setGravity(Gravity.CENTER);status.setPadding(dp(12),dp(8),dp(12),dp(8));status.setBackgroundColor(0xBB080C12);
  FrameLayout.LayoutParams sp=new FrameLayout.LayoutParams(-2,-2,Gravity.TOP|Gravity.CENTER_HORIZONTAL);sp.topMargin=dp(70);root.addView(status,sp);
  root.setOnApplyWindowInsetsListener((v,insets)->{
   int left=0,right=0,upper=0,lower=0;
   if(Build.VERSION.SDK_INT>=30){android.graphics.Insets i=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());left=i.left;right=i.right;upper=i.top;lower=i.bottom;}
   else{left=insets.getSystemWindowInsetLeft();right=insets.getSystemWindowInsetRight();upper=insets.getSystemWindowInsetTop();lower=insets.getSystemWindowInsetBottom();if(Build.VERSION.SDK_INT>=28&&insets.getDisplayCutout()!=null){left=Math.max(left,insets.getDisplayCutout().getSafeInsetLeft());right=Math.max(right,insets.getDisplayCutout().getSafeInsetRight());}}
   controls.setPadding(left,upper,right,lower);FrameLayout.LayoutParams p=(FrameLayout.LayoutParams)lockButton.getLayoutParams();p.topMargin=upper+dp(6);p.rightMargin=right+dp(12);lockButton.setLayoutParams(p);FrameLayout.LayoutParams st=(FrameLayout.LayoutParams)status.getLayoutParams();st.topMargin=upper+dp(70);status.setLayoutParams(st);return insets;
  });
  setContentView(root);if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,()->handleBack());hideSystemBars();root.requestApplyInsets();selectedAt=System.nanoTime();
  try{start(getIntent().getStringExtra("payload"));}catch(Exception e){status.setText("Yayım ünvanı açılmadı");}

 }
 private LinearLayout row(){LinearLayout l=new LinearLayout(this);l.setOrientation(LinearLayout.HORIZONTAL);return l;}
 private LinearLayout.LayoutParams cell(int size){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(dp(size),dp(size));p.setMargins(dp(4),0,dp(4),0);return p;}
 private ImageButton button(int icon,String label,View.OnClickListener action){ImageButton b=new ImageButton(this);b.setImageResource(icon);b.setScaleType(ImageView.ScaleType.CENTER_INSIDE);b.setPadding(dp(14),dp(14),dp(14),dp(14));b.setContentDescription(label);b.setMinimumWidth(dp(48));b.setMinimumHeight(dp(48));GradientDrawable bg=new GradientDrawable();bg.setColor(0x99202A36);bg.setCornerRadius(dp(36));b.setBackground(new android.graphics.drawable.RippleDrawable(ColorStateList.valueOf(0x5500CDEB),bg,null));b.setOnClickListener(v->{action.onClick(v);showControls();});return b;}
 private void start(String payload)throws Exception{
  selectedAt=System.nanoTime();
  JSONObject data=new JSONObject(payload==null?"{}":payload);Uri uri=Uri.parse(data.getString("url"));if(!Arrays.asList("http","https").contains(uri.getScheme())||uri.getUserInfo()!=null)throw new IllegalArgumentException();
  channelName=data.optString("name","TiviLoom");title.setText(channelName);allowReconnect=data.optBoolean("autoReconnect",true);if(!fitConfigured){String mode=data.optString("fit","contain");fit=mode.equals("fill")?2:mode.equals("cover")||mode.equals("cinema-zoom")?1:0;fitConfigured=true;}playerView.setResizeMode(new int[]{AspectRatioFrameLayout.RESIZE_MODE_FIT,AspectRatioFrameLayout.RESIZE_MODE_ZOOM,AspectRatioFrameLayout.RESIZE_MODE_FILL}[fit]);
  String agent=data.optString("userAgent","");if(agent.isEmpty())agent="TiviLoom-Android/0.6.9";
  String referer=data.optString("referer","");if((agent+referer).contains("\r")||(agent+referer).contains("\n"))throw new IllegalArgumentException();
  Map<String,String> headers=new HashMap<>();headers.put("User-Agent",agent);if(!referer.isEmpty())headers.put("Referer",referer);
  DefaultHttpDataSource.Factory http=new DefaultHttpDataSource.Factory().setUserAgent(agent).setConnectTimeoutMs(8000).setReadTimeoutMs(12000).setAllowCrossProtocolRedirects(true).setDefaultRequestProperties(headers);
  DefaultLoadControl loadControl=new DefaultLoadControl.Builder().setBufferDurationsMs(1500,15000,500,1500).setPrioritizeTimeOverSizeThresholds(true).build();
  player=new ExoPlayer.Builder(this).setRenderersFactory(new DefaultRenderersFactory(this).setEnableDecoderFallback(true)).setMediaSourceFactory(new androidx.media3.exoplayer.source.DefaultMediaSourceFactory(http)).setLoadControl(loadControl).build();
  player.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(),true);player.setHandleAudioBecomingNoisy(true);player.setVolume(data.optBoolean("muted",false)?0f:1f);playerView.setPlayer(player);
  player.addListener(new Player.Listener(){
   @Override public void onPlaybackStateChanged(int state){if(state==Player.STATE_BUFFERING){status.setVisibility(View.VISIBLE);status.setText("Yayım yüklənir…");}else if(state==Player.STATE_READY){handler.removeCallbacks(retry);retries=0;status.setVisibility(View.GONE);}else if(state==Player.STATE_ENDED){status.setVisibility(View.VISIBLE);status.setText("Yayım bitdi");showControls();}sync();}
   @Override public void onIsPlayingChanged(boolean value){sync();if(!value)showControls();else showControls();}
   @Override public void onPlayerError(PlaybackException e){status.setVisibility(View.VISIBLE);boolean network=e.errorCode>=2000&&e.errorCode<3000&&e.errorCode!=PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS;if(allowReconnect&&network&&resumePlayback&&retries<2){retries++;status.setText("Bağlantı yenilənir · "+retries+"/2");handler.postDelayed(retry,retries*1000L);}else{status.setText(e.errorCode>=4000&&e.errorCode<5000?"Bu cihaz yayım formatını aça bilmədi":e.errorCode==PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS?"Provayder yayımı təqdim etmədi":"Yayım açıla bilmədi. Yenidən sınamaq üçün Oynat düyməsinə toxunun.");showControls();}}
  });
  player.addAnalyticsListener(new AnalyticsListener(){@Override public void onRenderedFirstFrame(AnalyticsListener.EventTime e,Object output,long renderTimeMs){android.util.Log.i("TiviLoomPlayback","first_frame_ms="+(System.nanoTime()-selectedAt)/1000000L);}});
  player.setMediaItem(new MediaItem.Builder().setUri(uri).build());if(savedTracks!=null)player.setTrackSelectionParameters(savedTracks);if(resumePosition>0)player.seekTo(resumePosition);player.prepare();player.setPlayWhenReady(resumePlayback);showControls();
 }
 private void tracks(int type,String label){
  if(player==null)return;handler.removeCallbacks(hide);dialogOpen=true;
  android.app.Dialog dialog;
  if(player.getCurrentTracks().getGroups().stream().noneMatch(g->g.getType()==type))dialog=new AlertDialog.Builder(this).setTitle(label).setMessage("Bu yayımda seçim üçün trek yoxdur.").setPositiveButton("OK",null).create();
  else dialog=new TrackSelectionDialogBuilder(this,label,player,type).setTheme(androidx.appcompat.R.style.Theme_AppCompat_Dialog_Alert).setShowDisableOption(type==C.TRACK_TYPE_TEXT).setIsDisabled(player.getTrackSelectionParameters().disabledTrackTypes.contains(type)).build();
  showTrackDialog(dialog);
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
 }

 private void jump(long amount){if(player!=null&&player.isCurrentMediaItemSeekable()){player.seekTo(Math.max(0,Math.min(player.getDuration(),player.getCurrentPosition()+amount)));showControls();}}
 private String clock(long ms){long seconds=Math.max(0,ms/1000);return seconds>=3600?String.format(Locale.US,"%d:%02d:%02d",seconds/3600,seconds/60%60,seconds%60):String.format(Locale.US,"%d:%02d",seconds/60,seconds%60);}
 private void sync(){if(player==null||released)return;boolean playing=player.getPlayerError()==null&&player.getPlayWhenReady()&&player.getPlaybackState()!=Player.STATE_ENDED;playButton.setImageResource(playing?R.drawable.player_pause:R.drawable.player_play);playButton.setContentDescription(playing?"Fasilə":"Oynat");boolean canSeek=player.isCurrentMediaItemSeekable()&&player.getDuration()>0;rewind.setEnabled(canSeek);forward.setEnabled(canSeek);rewind.setAlpha(canSeek?1f:.35f);forward.setAlpha(canSeek?1f:.35f);seek.setVisibility(canSeek?View.VISIBLE:View.GONE);if(!dragging){if(canSeek){seek.setProgress((int)(10000L*player.getCurrentPosition()/player.getDuration()));time.setText(clock(player.getCurrentPosition())+" / "+clock(player.getDuration()));}else time.setText(player.isCurrentMediaItemLive()?"CANLI":"Yayım");}}
 private void toggleControls(){if(locked)return;if(controls.getVisibility()==View.VISIBLE){controls.setVisibility(View.GONE);lockButton.setVisibility(View.GONE);}else showControls();}
 private void showControls(){handler.removeCallbacks(hide);if(locked){controls.setVisibility(View.GONE);lockButton.setVisibility(View.VISIBLE);return;}controls.setVisibility(View.VISIBLE);lockButton.setVisibility(View.VISIBLE);handler.postDelayed(hide,4000);}
 private void hideSystemBars(){if(Build.VERSION.SDK_INT>=30){WindowInsetsController c=getWindow().getInsetsController();if(c!=null){c.hide(WindowInsets.Type.systemBars());c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);}}else getWindow().getDecorView().setSystemUiVisibility(5894|512|1024);}
 @Override public void onBackPressed(){handleBack();}
 private void handleBack(){if(locked){locked=false;lockButton.setImageResource(R.drawable.player_lock);lockButton.setContentDescription("Ekranı kilidlə");showControls();}else finish();}
 @Override public void onWindowFocusChanged(boolean focus){super.onWindowFocusChanged(focus);if(focus)hideSystemBars();}
 @Override protected void onPause(){resumePlayback=player!=null&&player.getPlayWhenReady();handler.removeCallbacks(retry);handler.removeCallbacks(progress);handler.removeCallbacks(hide);if(player!=null){resumePosition=player.isCurrentMediaItemLive()?0:player.getCurrentPosition();savedTracks=player.getTrackSelectionParameters();player.pause();}super.onPause();}
 @Override protected void onStop(){if(playerView!=null)playerView.setPlayer(null);if(player!=null){player.release();player=null;}super.onStop();}
 @Override protected void onStart(){super.onStart();if(playerView!=null&&player==null&&!released){try{start(getIntent().getStringExtra("payload"));}catch(Exception e){status.setText("Yayımı davam etdirmək mümkün olmadı");}}}
 @Override protected void onResume(){super.onResume();if(player!=null)player.setPlayWhenReady(resumePlayback);handler.removeCallbacks(progress);handler.post(progress);hideSystemBars();}
 @Override protected void onDestroy(){released=true;handler.removeCallbacksAndMessages(null);if(playerView!=null)playerView.setPlayer(null);if(player!=null){player.release();player=null;}super.onDestroy();}
}
