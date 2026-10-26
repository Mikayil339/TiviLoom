package com.tiviloom.mobile;

import android.app.Activity;
import android.os.Bundle;
import android.view.WindowManager;
import android.graphics.Color;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Build;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.analytics.AnalyticsListener;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.ui.PlayerView;
import org.json.JSONObject;
import java.util.HashMap;
import java.util.Map;

/** Native Media3 playback host. Separate Activity keeps the existing WebView UI intact. */
public final class NativePlaybackActivity extends Activity {
    private ExoPlayer player;
    private PlayerView playerView;
    private TextView status;
    private boolean released = false;
    private long selectedAt;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(Color.rgb(3,16,41));
        getWindow().setNavigationBarColor(Color.rgb(3,16,41));
        hideSystemBars();
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        playerView = new PlayerView(this);
        playerView.setUseController(true);
        playerView.setControllerAutoShow(true);
        playerView.setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS);
        root.addView(playerView, new FrameLayout.LayoutParams(-1,-1));
        status = new TextView(this);
        status.setTextColor(Color.WHITE);
        status.setBackgroundColor(0x99031029);
        status.setTextSize(14);
        status.setPadding(24,12,24,12);
        FrameLayout.LayoutParams sp = new FrameLayout.LayoutParams(-1,-2, android.view.Gravity.TOP);
        root.addView(status, sp);
        setContentView(root);
        selectedAt = System.nanoTime();
        try { start(getIntent().getStringExtra("payload")); }
        catch (Exception e) { status.setText("Yayım başlada bilmədi: " + safe(e)); }
    }

    private void start(String payload) throws Exception {
        JSONObject data = new JSONObject(payload == null ? "{}" : payload);
        String url = data.getString("url");
        Uri uri = Uri.parse(url);
        if (!"http".equals(uri.getScheme()) && !"https".equals(uri.getScheme()) && !"file".equals(uri.getScheme())) throw new IllegalArgumentException("Unsupported stream URL");
        Map<String,String> headers = new HashMap<>();
        String agent = data.optString("userAgent", "TiviLoom-Android/0.6.6");
        String referer = data.optString("referer", "");
        if (!agent.isEmpty()) headers.put("User-Agent", agent);
        if (!referer.isEmpty()) headers.put("Referer", referer);
        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
            .setUserAgent(agent.isEmpty() ? "TiviLoom-Android/0.6.6" : agent)
            .setConnectTimeoutMs(10000).setReadTimeoutMs(15000)
            .setAllowCrossProtocolRedirects(true).setDefaultRequestProperties(headers);
        DefaultLoadControl loadControl = new DefaultLoadControl.Builder()
            .setBufferDurationsMs(1500, 15000, 500, 1000).build();
        player = new ExoPlayer.Builder(this).setMediaSourceFactory(
            new androidx.media3.exoplayer.source.DefaultMediaSourceFactory(http))
            .setLoadControl(loadControl).build();
        playerView.setPlayer(player);
        player.addListener(new Player.Listener() {
            @Override public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_BUFFERING) status.setText("Yayım yüklənir…");
                else if (state == Player.STATE_READY) status.setText("Hazır · " + urlLabel(url));
                else if (state == Player.STATE_ENDED) status.setText("Yayım bitdi");
            }
            @Override public void onPlayerError(PlaybackException error) {
                status.setVisibility(View.VISIBLE);
                status.setText("Oynatma xətası: " + error.errorCodeName + " — " + safe(error));
            }
        });
        player.addAnalyticsListener(new AnalyticsListener() {
            @Override public void onRenderedFirstFrame(AnalyticsListener.EventTime eventTime, Object output, long renderTimeMs) {
                long ms = (System.nanoTime() - selectedAt) / 1_000_000L;
                runOnUiThread(() -> {
                    status.setText("Video başladı · ilk kadr " + ms + " ms");
                    status.postDelayed(() -> { if (status != null) status.setVisibility(View.GONE); }, 2500);
                });
            }
        });
        player.setMediaItem(new MediaItem.Builder().setUri(uri).build());
        player.prepare();
        player.play();
    }

    private String urlLabel(String url) { try { return Uri.parse(url).getHost(); } catch (Exception e) { return "mənbə"; } }
    private String safe(Throwable e) { String m=e.getMessage(); return m == null ? e.getClass().getSimpleName() : m.substring(0, Math.min(180,m.length())); }
    private void hideSystemBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) { c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars()); c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE); }
        } else getWindow().getDecorView().setSystemUiVisibility(5894 | 512 | 1024);
    }
    @Override protected void onPause() { super.onPause(); if(player!=null) player.pause(); }
    @Override protected void onResume() { super.onResume(); if(player!=null) player.play(); hideSystemBars(); }
    @Override protected void onDestroy() { released=true; if(playerView!=null) playerView.setPlayer(null); if(player!=null){player.release();player=null;} super.onDestroy(); }
}
