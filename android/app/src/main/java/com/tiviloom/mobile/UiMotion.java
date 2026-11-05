package com.tiviloom.mobile;
import android.view.View;import android.provider.Settings;
final class UiMotion {
 static boolean enabled=true;
 static boolean allowed(View v){return enabled&&Settings.Global.getFloat(v.getContext().getContentResolver(),Settings.Global.ANIMATOR_DURATION_SCALE,1f)>0;}
 static void visibility(View v,boolean visible){
  boolean showing=v.getVisibility()==View.VISIBLE;v.animate().cancel();
  if(!allowed(v)||!v.isAttachedToWindow()){v.setAlpha(1);v.setVisibility(visible?View.VISIBLE:View.GONE);return;}
  if(visible){v.setClickable(true);v.setVisibility(View.VISIBLE);if(!showing)v.setAlpha(0);v.animate().alpha(1).setDuration(150).start();}
  else if(showing){v.setClickable(false);v.animate().alpha(0).setDuration(130).withEndAction(()->{v.setVisibility(View.GONE);v.setAlpha(1);v.setClickable(true);}).start();}
 }
}
