package com.tiviloom.mobile.test;
/** Lightweight HOME used only in the disposable acceptance emulator. */
public final class QaHomeActivity extends android.app.Activity {
 @Override public void onCreate(android.os.Bundle state){super.onCreate(state);android.widget.TextView text=new android.widget.TextView(this);text.setText("TiviLoom QA Home");text.setTextColor(0xffd7eaff);text.setBackgroundColor(0xff0b1528);text.setGravity(android.view.Gravity.CENTER);setContentView(text);}
}
