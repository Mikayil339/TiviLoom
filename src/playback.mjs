// A Luna bridge also exists in Simulator; it says nothing about media support.
export function nativeHLSSupported(video){
  return ['application/vnd.apple.mpegurl','application/x-mpegURL'].some(type=>!!video.canPlayType?.(type));
}
export function streamKind(value){
  const url=new URL(value,'https://local.invalid/');
  if(/\.m3u8?$/i.test(url.pathname)||/^(m3u8?|hls)$/i.test(url.searchParams.get('output')||url.searchParams.get('format')||''))return 'hls';
  if(/\.(ts|m2ts)$/i.test(url.pathname)||url.searchParams.get('output')==='ts')return 'ts';
  if(/\.(mp4|m4v|webm|mkv|mov|mp3|aac)$/i.test(url.pathname))return 'file';
  return 'unknown';
}
export function playbackEngine(video,url,{native=false,Hls,forceHls=false}={}){
  const kind=streamKind(url),mse=!!Hls?.isSupported?.();
  if(forceHls&&mse&&['hls','unknown'].includes(kind))return 'hlsjs';
  if(kind==='hls'&&mse&&(!native||!nativeHLSSupported(video)))return 'hlsjs';
  return 'native';
}
export function playbackError(error,{url='',hls=null}={}){
  const status=Number(hls?.response?.code||hls?.networkDetails?.status||0);
  const detail=String(hls?.details||'');
  const code=Number(error?.code||0);
  if(status===401||status===403)return `Yayım serveri girişi rədd etdi (HTTP ${status}). Abunəni və bağlantı limitini yoxlayın.`;
  if(status===404)return 'Yayım serverində bu kanal tapılmadı (HTTP 404). Pleylisti yeniləyin.';
  if(status>=500)return `Yayım serveri xəta qaytardı (HTTP ${status}). Sonra yenidən sınayın.`;
  if(error?.name==='NotAllowedError')return 'Oynatmaq üçün pultda OK / Play düyməsini basın.';
  if(hls?.type==='networkError'||code===2)return 'Yayım yüklənmədi. Server, şəbəkə və ya CORS məhdudiyyəti ola bilər. Bağlantını və abunəni yoxlayın.';
  if(streamKind(url)==='ts')return 'Bu TS yayımı hazırkı pleyerdə açıla bilmədi. Provayderin HLS / M3U8 çıxışını və ya Xtream girişini sınayın.';
  if(code===3||/bufferAddCodec|bufferAppend|fragParsing/.test(detail))return 'Video və ya səs kodeki bu mühitdə açıla bilmədi. H.264 + AAC formatlı HLS yayımı ilə yoxlayın.';
  if(code===4||error?.name==='NotSupportedError')return 'Yayım formatı tanınmadı və ya mənbə açılmadı (MEDIA 4). HLS / M3U8 çıxışı ilə yoxlayın; simulator və real TV dəstəyi fərqlənə bilər.';
  return 'Video açıla bilmədi. Mənbə, format və abunəni yoxlayın. Yenidən cəhd üçün ▶ düyməsini basın.';
}
