# TiviMate, Televizo və TiviLoom: davranış və sürət təhlili

27 oktyabr 2026. Mənbə araşdırması və TiviLoom 0.6.7 kodunun yoxlanması.

## Təhlilin sərhədi

TiviMate və Televizo bu sessiyada real Android cihazında işə salınmayıb. Onların daxili verilənlər bazası, keş siyasəti, hazırkı player versiyası və dəqiq bufer parametrləri təsdiqlənməyib. Aşağıda məhsulun sənədləşdirilmiş imkanları, ayardan asılı davranışlar və TiviLoom üçün mühəndislik təklifləri ayrılır. Bu sənəd tam praktik düymə sınağının əvəzi deyil.

## 1. TiviMate interfeysinin əsas məntiqi

TiviMate böyük ekran və pult üçün hazırlanır. Onun rəsmi tətbiq təsviri EPG cədvəli, çoxsaylı playlist, sevimlilər, axtarış, arxiv, yazma və multiview imkanlarını göstərir. Bunların bəzisi ödənişə, cihazın imkanına və provayderə bağlıdır. [Rəsmi tətbiq təsviri](https://play.google.com/store/apps/details?id=ar.tvplayer.tv).

İnterfeysi anlamaq üçün üç ayrı anlayış vacibdir:

- **Fokus:** pultla üzərində dayandığın düymə və ya kanal.
- **Seçim:** haqqında EPG və təsvir göstərilən kanal/proqram.
- **Oynayan kanal:** hazırda playerə verilən yayım.

Bunlar bir kanal ola bilər, amma məcbur deyil. A kanalına baxarkən B kanalının proqramına baxmaq üçün A-nın bağlantısını kəsmək lazım deyil. TiviLoom üçün əsas tələb də budur: fokus dəyişməsi playerə yeni URL göndərməməlidir.

Əsas istifadə axınını belə oxumaq olar: mənbə seçimi → kanal qrupu → kanal/proqram cədvəli → baxış → əlavə əməliyyatlar. Qrup səviyyəsi böyük siyahını daraldır. Kanal səviyyəsi baxılacaq yayımı seçir. EPG səviyyəsi zaman üzrə proqramı seçir. Kontekst menyusu gündəlik naviqasiyanı əlavə əməliyyatlardan ayırır.

EPG cədvəlində şaquli istiqamət kanalları, üfüqi istiqamət vaxtı ifadə edir. Hazırkı proqram, keçmiş veriliş və gələcək proqram eyni əməliyyat deyil: hazırkı kanal izlənir, arxiv provayderdə varsa keçmiş proqram oynadıla bilər, gələcək proqram üçün xatırlatma/yazma əməliyyatı təklif oluna bilər. Arxiv sadəcə videonu geri çəkmək deyil; ayrıca provayder ünvanı tələb edə bilər.

## 2. Pult düymələri: nəyi dəqiq demək olar?

TiviMate-də vahid, bütün versiyalara və cihazlara aid dəyişməz düymə xəritəsi vermək düzgün deyil. Player və TV guide üçün ayrıca təyinatlar mövcud olub; tərtibatçının buraxılış müzakirələrində bu fərq görünür. [Tərtibatçının buraxılış müzakirəsi](https://www.reddit.com/r/TiviMate/comments/f0osni/).

Aşağıdakı cədvəl kontekstə görə əməliyyat xəritəsidir. Playerdə konkret qısa/uzun basmanın hansı əməliyyata bağlandığını quraşdırılmış versiyanın Remote control ayarı ilə yoxlamaq lazımdır.

| Düymə | Siyahı və EPG daxilində | Tam ekran playerdə |
|---|---|---|
| ↑ / ↓ | Kanal və ya menyu sətrini dəyişmək | Kanal dəyişmə və ya panel açma təyinatı ola bilər |
| ← / → | EPG vaxtı və panellər arasında hərəkət | Kanal siyahısı, qruplar və məlumat əməliyyatlarına təyin oluna bilər |
| Qısa OK | Seçilən elementin əsas əməliyyatı | Məlumat, tarixçə və ya idarəetmə paneli təyinatdan asılıdır |
| Uzun OK | Kanal/proqram kontekst əməliyyatlarına giriş | Sürətli menyu və ya başqa təyin edilmiş əməliyyat |
| Back | Açıq qat/paneldən əvvəlki səviyyəyə dönüş | Guide-a dönüş və ya açıq panelin bağlanması; ayardan asılıdır |
| CH+ / CH− | Səhifələmə üçün istifadə oluna bilər | Əvvəlki/növbəti kanal üçün istifadə oluna bilər |
| Rəqəmlər | Kanal nömrəsi ilə keçid | Nömrə ilə kanal seçimi; nömrələmə ayarı vacibdir |
| Play/Pause | Seçilən məzmun və kontekstdən asılıdır | Player əməliyyatı; canlı yayımda pause həmişə arxiv/timeshift demək deyil |
| Home | Android sisteminə aid əməliyyat | Tətbiqdən sistem ekranına çıxır |

Əlavə rəngli düymələri və uzun basmaları əsas funksiyaya çatmağın yeganə yolu etmək olmaz: bütün pultlarda bu düymələr yoxdur. Uzun basmadan sonra qısa OK-nin də icra olunmasının qarşısı alınmalıdır. Əks halda menyu açılan anda kanal da dəyişər.

## 3. TiviMate hissini yaradan interfeys qərarları

TiviLoom üçün təklif olunan davranış:

1. Siyahıya qayıdanda əvvəlki qrup, kanal, sürüşmə mövqeyi və fokus bərpa edilsin.
2. Kanal üzərində dayanmaq yalnız məlumatı yeniləsin. Avtomatik preview və fokus əsasında yayım hazırlama olmasın.
3. OK açıq təsdiq olsun. Birinci OK ilə nə baş verdiyi ekrandakı işarə ilə aydın görünsün.
4. Menyu açılıb bağlananda oynayan kanal eyni playerdə qalsın.
5. Back əvvəlcə açıq alt menyunu, sonra paneli bağlasın. Tətbiqdən çıxış ən son səviyyə olsun.
6. Gələcək proqramda OK kanalı təsadüfən dəyişməsin; proqram əməliyyatları açılsın.
7. Axtarışdan kanala keçib geri qayıdanda sorğu və nəticə mövqeyi itməsin.

Bunlar təsdiqlənmiş TiviMate standart düymə xəritəsi kimi deyil, TiviLoom üçün təklif olunan konkret müqavilə kimi qəbul edilməlidir.

## 4. Televizo-nun Android iş prinsipi

Rəsmi təsvirə görə Televizo istifadəçinin playlistlərini oynadan tətbiqdir: çoxsaylı playlist, EPG, catch-up, axtarış/sıralama, sevimlilər, valideyn nəzarəti və audio/video/altyazı seçimi var. Telefon, planşet və TV üçün təqdim edilir. [Rəsmi Google Play səhifəsi](https://play.google.com/store/apps/details?id=com.ottplay.ottplay).

Funksional axın belədir: playlist məlumatı alınır → kanallar qruplaşdırılır → istifadəçi kanal seçir → həmin yayım açılır. EPG və loqo kanalın öz yayımından ayrı məlumatdır. Bunları eyni yükləmə kimi bağlamaq istifadəçini lazımsız gözlədə bilər. Bu ayrılıq məhsulun funksiyalarından çıxarılan mühəndislik modelidir; Televizo-nun daxili koduna baxılıb təsdiqlənməyib.

Androiddə tipik uyğun player quruluşu şəbəkə mənbəyi → formatın ayrılması → bufer → dekoder → ekran/səs çıxışıdır. Media3/ExoPlayer bufer siyasətini və mənbələri ayrıca idarə etməyə imkan verir. Bu, Androidin imkanını izah edir; hər iki tətbiqin hazırkı versiyada eyni komponentlər və ayarlarla işlədiyini sübut etmir. [Android player sənədləri](https://developer.android.com/media/media3/exoplayer), [LoadControl](https://developer.android.com/reference/androidx/media3/exoplayer/LoadControl).

## 5. Niyə tez açılırlar?

Ölçmədən tək səbəb demək olmaz. Üç ayrı vaxt ölçülməlidir:

| Ölçü | Başlanğıc → son | Gecikmənin mümkün mənbəyi |
|---|---|---|
| İnterfeysin açılması | Tətbiq startı → pultla işlənən ekran | İlkin kod, yerli məlumatın oxunması, böyük render, süni gözləmə |
| Kanalın açılması | OK → ilk görüntü və səs | Şəbəkə, yönləndirmə, playlist/manifest, ilk uyğun kadr, bufer, dekoder |
| Pult reaksiyası | Düymə → görünən fokus dəyişikliyi | Siyahı qurulması, EPG axtarışı, şəkillər, yaddaş yazısı |

Sürətli IPTV player üçün məntiqli üsullar: saxlanmış kanal kataloqunu dərhal göstərmək; EPG yenilənməsini ilk ekranın önünə qoymamaq; yalnız görünən sətirləri çəkmək; loqoları sonradan yükləmək; hər düymədə bütün kataloqu kopyalamamaq; playeri menyu keçidlərində yenidən yaratmamaq. Bunlar tətbiqlərə aid təsdiqlənmiş daxili fakt deyil, TiviLoom üçün yoxlanmalı optimallaşdırma üsullarıdır. Androidin TV siyahı sənədləri də fokusla işləyən lazy siyahıları tövsiyə edir. [Android TV siyahıları](https://developer.android.com/training/tv/playback/compose/lists).

Buferi azaltmaq ilk görüntünü sürətləndirə bilər, amma zəif şəbəkədə donmanı artıra bilər. Fokusda gizli kanal bağlantısı açmaq isə provayderin eyni vaxtda bağlantı limitini poza bilər. TiviLoom-da sürət üçün fokus əsaslı preview/preload tətbiq edilməməlidir.

## 6. LG webOS üçün fərq

Androidin player komponentini sadəcə IPK-yə yerləşdirməklə eyni nəticə almaq olmaz. TiviLoom webOS proqramıdır; HTML/JavaScript interfeysi və LG-nin media imkanları ilə işləyir. webOS nəsillərində brauzer mühərriki dəyişir. [LG mühərrik cədvəli](https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine).

LG rəsmi olaraq HTTP/HTTPS və HLS dəstəyini, həmçinin HLS məhdudiyyətlərini göstərir. Ona görə Androiddə açılan mənbənin eyni URL ilə LG-də işləməsi ayrıca yoxlanmalıdır. Mənbə cavabı uğurlu olsa da kodek, audio və manifest uyğunsuzluğu qala bilər. [LG yayım spesifikasiyası](https://webostv.developer.lge.com/develop/specifications/streaming-protocol-drm).

## 7. TiviLoom kodunda tapılan konkret vəziyyət

- 0.6.7-də `ready()` məlumat hazır olanda belə splash üçün minimum 3000 ms gözlədirdi. 0.6.8-də bu məcburi gözləmə çıxarıldı. Splash və logo şəkilləri saxlanıldı.
- Guide artıq görünən kanal hissəsini çəkən mexanizmə malikdir; buna görə layihəni sıfırdan yazmaq əsaslandırılmır.
- Seçim zamanı gecikdirilmiş yaddaş yazısı və əvvəlki fokus optimallaşdırmaları mövcuddur. Onların real LG-də nəticəsi ölçülməlidir.
- Telefon ötürməsi UI, xidmət, lokal server, LAN/HTTPS relay, QR kitabxanası və ayrıca testlərə yayılmışdı. Bu funksiyanın kodu çıxarıldı. Telefon vasitəsilə backup/restore yolu da onunla birlikdə çıxarıldı.
- Android layihəsi və ona məxsus responsive görünüş silinmədi; APK inkişafı dayandırılmış qalır.

## 8. Real TV qəbul sınağı

Eyni playlist və eyni şəbəkə ilə ən azı 10 təkrar ölçmə aparılmalıdır: soyuq start, təkrar açılış, kanal dəyişmə, 100 sürətli pult keçidi, qrup dəyişmə, axtarışdan geri dönüş, şəbəkənin kəsilib bərpası. İlk görüntü və ilk səs ayrı qeyd olunmalıdır. 1000 və 10000 kanallı siyahılarla yaddaş və fokus davranışı müqayisə edilməlidir.

Avtomatik test və IPK build nəticəsi real LG-də axıcı playback, düzgün fokus və problemsiz istifadə təsdiqi deyil. Yeni interfeys genişləndirilməzdən əvvəl bu davranış və ölçmə müqaviləsi əsas götürülməlidir.
