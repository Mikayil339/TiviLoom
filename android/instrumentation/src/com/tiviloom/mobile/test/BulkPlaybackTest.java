package com.tiviloom.mobile.test;
import android.app.*;import android.content.*;import android.os.*;import org.json.*;import java.lang.reflect.*;
/** Private catalogue supplied at runtime. Reports names/counters only, never URLs. */
public final class BulkPlaybackTest extends NativePlayerTest {
 Bundle arguments;
 @Override public void onCreate(Bundle a){arguments=a;super.onCreate(a);}
 int counter(String track)throws Exception{Object p=field("player");if(p==null)return 0;Class<?> exo=Class.forName("androidx.media3.exoplayer.ExoPlayer",true,activity.getClassLoader());Object c=exo.getMethod("get"+track+"DecoderCounters").invoke(p);return c==null?0:c.getClass().getField("renderedOutputBufferCount").getInt(c);}
 boolean decoded(String method)throws Exception{Object c=field("compatibility");if(c==null)return false;Method m=c.getClass().getDeclaredMethod(method);m.setAccessible(true);return (boolean)m.invoke(c);}
 boolean picture()throws Exception{return field("compatibility")!=null?decoded("frame"):counter("Video")>0;}
 boolean sound()throws Exception{return field("compatibility")!=null?decoded("audioDecoded"):counter("Audio")>0;}
 @Override public void onStart(){try{
 JSONArray channels=new JSONArray(new String(android.util.Base64.decode(arguments.getString("catalogue"),0),"UTF-8"));
 for(int i=0;i<channels.length();i++){
  JSONObject channel=channels.getJSONObject(i);String payload=channel.toString();if(activity==null)activity=startActivitySync(new Intent().setClassName("com.tiviloom.mobile","com.tiviloom.mobile.NativePlaybackActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).putExtra("payload",payload));else onMain(()->{Object h=host();h.getClass().getMethod("load",String.class).invoke(h,payload);return true;});
  long begin=SystemClock.uptimeMillis(),limit=Long.parseLong(arguments.getString("timeout","45000"));boolean ok=false;while(SystemClock.uptimeMillis()-begin<limit){dismissSystemOverlays();if(onMain(()->picture()&&sound())){ok=true;break;}SystemClock.sleep(200);}
  final boolean result=ok;final long elapsed=SystemClock.uptimeMillis()-begin;
  onMain(()->{report.append(result?"PASS ":"FAIL ").append(channel.optString("name")).append(" elapsed_ms=").append(elapsed).append(" engine=").append(field("compatibility")!=null?"compatibility":"platform").append(" picture=").append(picture()).append(" audio=").append(sound());Object p=field("player");if(p!=null){report.append(" state=").append(playerCall("getPlaybackState"));Object error=playerCall("getPlayerError");if(error!=null){report.append(" errorCode=").append(error.getClass().getField("errorCode").getInt(error));for(Throwable cause=(Throwable)error;cause!=null;cause=cause.getCause()){if(cause instanceof androidx.media3.datasource.HttpDataSource.InvalidResponseCodeException){androidx.media3.datasource.HttpDataSource.InvalidResponseCodeException http=(androidx.media3.datasource.HttpDataSource.InvalidResponseCodeException)cause;report.append(" httpStatus=").append(http.responseCode).append(" requestKind=").append(http.dataSpec.uri.getPath().endsWith(".m3u8")?"manifest":"segment");}}}}report.append('\n');return true;});if(ok)passed++;else failed++;Bundle status=new Bundle();status.putString("stream",report.toString());sendStatus(0,status);
 }
 }catch(Throwable e){failed++;report.append("FATAL ").append(e.getClass().getSimpleName()).append('\n');}finally{if(activity!=null)runOnMainSync(()->activity.finish());}Bundle out=new Bundle();out.putString("stream",report+"\nPASSED="+passed+" FAILED="+failed+"\n");finish(failed==0?-1:0,out);}
}
