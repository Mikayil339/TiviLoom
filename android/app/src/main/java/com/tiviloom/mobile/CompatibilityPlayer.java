package com.tiviloom.mobile;
import android.app.Activity;import android.content.*;import android.media.*;import android.os.*;import android.view.*;import org.json.JSONObject;import java.util.*;
import org.videolan.libvlc.*;import org.videolan.libvlc.util.VLCVideoLayout;
/** Only used when Android's platform decoder cannot handle an advertised track. */
final class CompatibilityPlayer {
 final VLCVideoLayout view;final LibVLC library;final org.videolan.libvlc.MediaPlayer mp;final Media media;
 private final Activity owner;private final AudioManager audio;private final AudioFocusRequest focus;private final BroadcastReceiver noisy;private boolean closed=false,muted;
 CompatibilityPlayer(Activity owner,JSONObject data,java.util.function.Consumer<String> state)throws Exception{
  this.owner=owner;muted=data.optBoolean("muted",false);audio=(AudioManager)owner.getSystemService(Context.AUDIO_SERVICE);
  focus=new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(new android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_MEDIA).setContentType(android.media.AudioAttributes.CONTENT_TYPE_MOVIE).build()).setOnAudioFocusChangeListener(change->{if(closed)return;if(change==AudioManager.AUDIOFOCUS_LOSS||change==AudioManager.AUDIOFOCUS_LOSS_TRANSIENT)mpPause();else if(change==AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK)mpVolume(20);else if(change==AudioManager.AUDIOFOCUS_GAIN)mpVolume(muted?0:100);}).build();
  ArrayList<String> options=new ArrayList<>();options.add("--network-caching=1000");options.add("--no-video-title-show");options.add("--no-audio-time-stretch");
  library=new LibVLC(owner,options);mp=new org.videolan.libvlc.MediaPlayer(library);view=new VLCVideoLayout(owner);
  mp.attachViews(view,null,true,true);mp.setEventListener(e->{if(closed)return;if(e.type==org.videolan.libvlc.MediaPlayer.Event.Playing)state.accept("playing");else if(e.type==org.videolan.libvlc.MediaPlayer.Event.Buffering)state.accept(e.getBuffering()<100?"buffering":"playing");else if(e.type==org.videolan.libvlc.MediaPlayer.Event.EncounteredError)state.accept("error");else if(e.type==org.videolan.libvlc.MediaPlayer.Event.EndReached)state.accept("ended");});
  media=new Media(library,android.net.Uri.parse(data.getString("url")));media.setHWDecoderEnabled(true,false);String ua=data.optString("userAgent","");if(!ua.isEmpty())media.addOption(":http-user-agent="+ua);String referer=data.optString("referer","");if(!referer.isEmpty())media.addOption(":http-referrer="+referer);
  mp.setMedia(media);mp.setVolume(muted?0:100);
  noisy=new BroadcastReceiver(){public void onReceive(Context c,Intent i){mpPause();}};if(Build.VERSION.SDK_INT>=33)owner.registerReceiver(noisy,new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY),Context.RECEIVER_NOT_EXPORTED);else owner.registerReceiver(noisy,new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY));
 }
 void mpPause(){if(!closed)mp.pause();}void mpVolume(int v){if(!closed)mp.setVolume(v);}void setMuted(boolean value){muted=value;mpVolume(value?0:100);}
 void play(){if(!closed&&audio.requestAudioFocus(focus)==AudioManager.AUDIOFOCUS_REQUEST_GRANTED){if(mp.getPlayerState()==org.videolan.libvlc.interfaces.IMedia.State.Error)mp.setMedia(media);mp.play();}}
 void fit(int value){mp.setVideoScale(new org.videolan.libvlc.MediaPlayer.ScaleType[]{org.videolan.libvlc.MediaPlayer.ScaleType.SURFACE_BEST_FIT,org.videolan.libvlc.MediaPlayer.ScaleType.SURFACE_FIT_SCREEN,org.videolan.libvlc.MediaPlayer.ScaleType.SURFACE_FILL}[value]);}
 boolean frame(){org.videolan.libvlc.interfaces.IMedia.Stats stats=media.getStats();return stats!=null&&stats.displayedPictures>0;}
 boolean audioDecoded(){org.videolan.libvlc.interfaces.IMedia.Stats stats=media.getStats();return stats!=null&&stats.decodedAudio>0&&mp.getAudioTrack()>=0;}
 void release(){if(closed)return;closed=true;owner.unregisterReceiver(noisy);audio.abandonAudioFocusRequest(focus);mp.setEventListener(null);mp.stop();mp.detachViews();mp.release();media.release();library.release();}
}
