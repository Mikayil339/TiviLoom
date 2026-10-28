package com.tiviloom.mobile;
import androidx.media3.common.*;import androidx.media3.common.util.Util;import androidx.media3.datasource.DataSource;import androidx.media3.exoplayer.source.*;import androidx.media3.exoplayer.hls.*;import androidx.media3.extractor.*;import androidx.media3.extractor.ts.DefaultTsPayloadReaderFactory;
/** Accept broadcaster I pictures even when the encoder does not emit IDR NALs. */
public final class BroadcastMediaSources {
 private BroadcastMediaSources(){}
 public static MediaSource create(DataSource.Factory data,MediaItem item){int flags=DefaultTsPayloadReaderFactory.FLAG_ALLOW_NON_IDR_KEYFRAMES;if(Util.inferContentType(item.localConfiguration.uri)==C.CONTENT_TYPE_HLS)return new HlsMediaSource.Factory(data).setExtractorFactory(new DefaultHlsExtractorFactory(flags,true)).createMediaSource(item);return new DefaultMediaSourceFactory(data,new DefaultExtractorsFactory().setTsExtractorFlags(flags)).createMediaSource(item);}
}
