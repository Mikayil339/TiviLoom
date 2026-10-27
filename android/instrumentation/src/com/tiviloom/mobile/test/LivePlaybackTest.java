package com.tiviloom.mobile.test;
import android.app.*;import android.content.*;import android.os.*;import org.json.*;import java.lang.reflect.*;
/** Provider URL is supplied at runtime only and never printed in reports. */
public final class LivePlaybackTest extends NativePlayerTest {
 Bundle arguments;
 @Override public void onCreate(Bundle args){arguments=args;super.onCreate(args);}
 @Override public void onStart(){try{
 Intent intent=new Intent().setClassName("com.tiviloom.mobile","com.tiviloom.mobile.NativePlaybackActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);intent.putExtra("payload",new JSONObject().put("url",arguments.getString("url")).put("name","Private provider test").toString());activity=startActivitySync(intent);
 check("provider native video renders",()->waitFor(()->{Object compat=field("compatibility");if(compat!=null){java.lang.reflect.Method m=compat.getClass().getDeclaredMethod("frame");m.setAccessible(true);return (boolean)m.invoke(compat);}Object size=playerCall("getVideoSize");return playing()&&size.getClass().getField("width").getInt(size)>0;}));
 check("provider audio track supported and selected",()->{Object compat=field("compatibility");if(compat!=null){waitFor(()->{java.lang.reflect.Method m=compat.getClass().getDeclaredMethod("audioDecoded");m.setAccessible(true);return (boolean)m.invoke(compat);});report.append("Compatibility audio decoded and selected\n");return;}Object tracks=onMainTracks();java.util.List<?> groups=(java.util.List<?>)tracks.getClass().getMethod("getGroups").invoke(tracks);boolean audio=false;for(Object g:groups){Class<?> c=g.getClass();if((int)c.getMethod("getType").invoke(g)!=1)continue;boolean supported=(boolean)c.getMethod("isSupported").invoke(g),selected=(boolean)c.getMethod("isSelected").invoke(g);report.append("AUDIO supported=").append(supported).append(" selected=").append(selected).append('\n');audio|=supported&&selected;}require(audio,"No supported selected audio track");});
 }catch(Throwable e){failed++;report.append("Live test failed: ").append(e.getClass().getSimpleName());}finally{if(activity!=null)runOnMainSync(()->activity.finish());}Bundle result=new Bundle();result.putString("stream",report+"\nPASSED="+passed+" FAILED="+failed+"\n");finish(failed==0?-1:0,result);}
 Object onMainTracks()throws Exception{Object[] t={null};onMain(()->{t[0]=playerCall("getCurrentTracks");return true;});return t[0];}
}
