package com.tiviloom.mobile;
import android.content.Context;import android.view.*;import android.widget.FrameLayout;

/** Intercept only deliberate vertical edge swipes; leave buttons and horizontal drags alone. */
final class PlayerTouchSurface extends FrameLayout {
 interface Gestures {boolean enabled();void begin(boolean volume);void move(float fraction);void end();}
 private final Gestures gestures;private float x,y;private boolean candidate,swiping;
 PlayerTouchSurface(Context c,Gestures g){super(c);gestures=g;}
 @Override public boolean onInterceptTouchEvent(android.view.MotionEvent e){
  if(e.getActionMasked()==MotionEvent.ACTION_DOWN){x=e.getX();y=e.getY();swiping=false;candidate=gestures.enabled()&&e.getPointerCount()==1&&(x<getWidth()*.4f||x>getWidth()*.6f)&&y>getHeight()*.18f&&y<getHeight()*.75f;}
  if(e.getActionMasked()==MotionEvent.ACTION_POINTER_DOWN)candidate=false;
  if(e.getActionMasked()==MotionEvent.ACTION_MOVE&&candidate&&Math.abs(e.getY()-y)>getResources().getDisplayMetrics().density*18&&Math.abs(e.getY()-y)>Math.abs(e.getX()-x)*1.3f){swiping=true;gestures.begin(x>getWidth()/2f);gestures.move((y-e.getY())/Math.max(1,getHeight()*.6f));return true;}
  return super.onInterceptTouchEvent(e);
 }
 @Override public boolean onTouchEvent(MotionEvent e){if(!swiping)return super.onTouchEvent(e);if(e.getActionMasked()==MotionEvent.ACTION_MOVE)gestures.move((y-e.getY())/Math.max(1,getHeight()*.6f));if(e.getActionMasked()==MotionEvent.ACTION_UP||e.getActionMasked()==MotionEvent.ACTION_CANCEL){swiping=false;gestures.end();}return true;}
}
