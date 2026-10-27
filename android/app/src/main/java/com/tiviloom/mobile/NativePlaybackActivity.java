package com.tiviloom.mobile;
import android.app.Activity;import android.os.Bundle;import android.os.Build;
/** Compatibility entry point. MainActivity owns the persistent preview/fullscreen host. */
public final class NativePlaybackActivity extends Activity {
 private NativePlayerHost host;
 @Override public void onCreate(Bundle saved){super.onCreate(saved);getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);if(Build.VERSION.SDK_INT>=30)getWindow().setDecorFitsSystemWindows(false);host=new NativePlayerHost(this,()->{},()->finish(),value->{});setContentView(host.view());host.setFullscreen(true);try{host.load(getIntent().getStringExtra("payload"));}catch(Exception e){finish();}if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,()->host.back());}
 @Override public void onBackPressed(){host.back();}
 @Override protected void onPause(){if(host!=null)host.pause();super.onPause();}
 @Override protected void onDestroy(){if(host!=null)host.release();super.onDestroy();}
}
