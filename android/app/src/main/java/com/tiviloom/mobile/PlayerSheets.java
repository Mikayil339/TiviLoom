package com.tiviloom.mobile;

import android.app.*;import android.graphics.Color;import android.graphics.Typeface;import android.graphics.drawable.GradientDrawable;import android.content.res.ColorStateList;import android.view.*;import android.widget.*;

/** Shared branded surfaces for playback menus; selection never replaces the decoder. */
final class PlayerSheets {
 static final int FG=0xFFF1F6FF,MUTED=0xFF94A9BF,ACCENT=0xFF29D8EE;
 static int dp(Activity a,int n){return Math.round(n*a.getResources().getDisplayMetrics().density);}
 static GradientDrawable panel(int color,int radius,Activity a){GradientDrawable b=new GradientDrawable();b.setColor(color);b.setCornerRadius(dp(a,radius));b.setStroke(dp(a,1),0xFF2A3B53);return b;}
 static TextView text(Activity a,String value,int size,int color){TextView t=new TextView(a);t.setText(value);t.setTextSize(size);t.setTextColor(color);return t;}
 static LinearLayout body(Activity a){LinearLayout l=new LinearLayout(a);l.setOrientation(1);l.setPadding(dp(a,20),dp(a,8),dp(a,20),dp(a,16));return l;}
 static Dialog dialog(Activity a,String title,String subtitle,android.view.View content){
  Dialog d=new Dialog(a);LinearLayout shell=body(a);GradientDrawable bg=new GradientDrawable(GradientDrawable.Orientation.TL_BR,new int[]{0xFF14263D,0xFF0B1528});bg.setCornerRadius(dp(a,24));bg.setStroke(dp(a,1),0xFF31455F);shell.setBackground(bg);
  LinearLayout header=new LinearLayout(a);header.setGravity(Gravity.CENTER_VERTICAL);LinearLayout headings=body(a);headings.setPadding(0,dp(a,12),dp(a,12),dp(a,12));TextView brand=text(a,"TIVILOOM  /  PLAYER",10,ACCENT);brand.setLetterSpacing(.14f);headings.addView(brand);TextView name=text(a,title,22,FG);name.setTypeface(null,Typeface.BOLD);name.setPadding(0,dp(a,6),0,dp(a,4));headings.addView(name);TextView hint=text(a,subtitle,12,MUTED);hint.setMaxLines(2);headings.addView(hint);header.addView(headings,new LinearLayout.LayoutParams(0,-2,1));
  Button close=new Button(a);close.setText("×");close.setTextColor(FG);close.setTextSize(26);close.setPadding(0,0,0,0);close.setMinWidth(0);close.setBackground(panel(0xFF203249,16,a));close.setContentDescription("Bağla");close.setOnClickListener(v->d.dismiss());header.addView(close,new LinearLayout.LayoutParams(dp(a,48),dp(a,48)));shell.addView(header);shell.addView(content);d.setContentView(shell);
  Window w=d.getWindow();w.setBackgroundDrawableResource(android.R.color.transparent);w.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);WindowManager.LayoutParams p=w.getAttributes();p.dimAmount=.68f;p.width=Math.min(dp(a,560),a.getResources().getDisplayMetrics().widthPixels-dp(a,40));p.height=-2;w.setAttributes(p);return d;
 }
 static TextView choice(Activity a,String label,boolean selected){TextView t=text(a,(selected?"●  ":"○  ")+label,15,selected?FG:MUTED);t.setMinHeight(dp(a,52));t.setGravity(Gravity.CENTER_VERTICAL);t.setPadding(dp(a,16),dp(a,10),dp(a,16),dp(a,10));t.setBackground(panel(selected?0xFF164459:0xFF142338,14,a));return t;}
 static Dialog choices(Activity a,String title,String subtitle,String[] labels,int selected,java.util.function.IntConsumer action){LinearLayout items=body(a);items.setPadding(0,0,0,0);Dialog[] holder=new Dialog[1];for(int i=0;i<labels.length;i++){final int index=i;TextView t=choice(a,labels[i],i==selected);LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.bottomMargin=dp(a,6);items.addView(t,p);t.setOnClickListener(v->{holder[0].dismiss();action.accept(index);});}ScrollView scroll=new ScrollView(a);scroll.setFillViewport(false);scroll.addView(items);int available=Math.max(dp(a,96),(int)(a.getResources().getDisplayMetrics().heightPixels*.72)-dp(a,125));scroll.setLayoutParams(new LinearLayout.LayoutParams(-1,Math.min(labels.length*dp(a,58),available)));holder[0]=dialog(a,title,subtitle,scroll);return holder[0];}
}
