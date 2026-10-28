(() => {
  // src/version.mjs
  var VERSION = "0.6.10";

  // src/library-store.mjs
  function createLibraryStore({ indexedDB: indexedDB2, storage, timeout = 5e3 } = {}) {
    const KEY = "tl-library-fallback-v1";
    let opening;
    function recovery() {
      try {
        const raw = storage == null ? void 0 : storage.getItem(KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        if (e.name === "SecurityError") return null;
        throw Error("Saved library recovery cannot be read.");
      }
    }
    function open() {
      if (opening) return opening;
      opening = new Promise((resolve, reject) => {
        let req, done = false;
        const timer = setTimeout(() => fail(Error("Database open timeout")), timeout);
        function fail(e) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          reject(e);
        }
        try {
          if (!indexedDB2) throw Error("IndexedDB unavailable");
          req = indexedDB2.open("TiviLoom", 1);
          req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains("library")) req.result.createObjectStore("library");
          };
          req.onerror = () => fail(req.error);
          req.onblocked = () => fail(Error("Database blocked"));
          req.onsuccess = () => {
            if (done) {
              req.result.close();
              return;
            }
            done = true;
            clearTimeout(timer);
            req.result.onversionchange = () => {
              req.result.close();
              opening = null;
            };
            resolve(req.result);
          };
        } catch (e) {
          fail(e);
        }
      });
      return opening;
    }
    async function transaction(action, value) {
      const db = await open();
      return new Promise((resolve, reject) => {
        let tx, result;
        const timer = setTimeout(() => {
          try {
            tx == null ? void 0 : tx.abort();
          } catch {
          }
          reject(Error("Database transaction timeout"));
        }, timeout);
        try {
          tx = db.transaction("library", action === "get" ? "readonly" : "readwrite");
          const store = tx.objectStore("library"), req = action === "get" ? store.get("active") : action === "delete" ? store.delete("active") : store.put(value, "active");
          req.onsuccess = () => result = req.result;
          tx.oncomplete = () => {
            clearTimeout(timer);
            resolve(result);
          };
          tx.onerror = tx.onabort = () => {
            clearTimeout(timer);
            reject(tx.error || req.error || Error("Database transaction failed"));
          };
        } catch (e) {
          clearTimeout(timer);
          reject(e);
        }
      });
    }
    return { async get() {
      const value = recovery();
      return value || transaction("get");
    }, async put(value) {
      try {
        await transaction("put", value);
        storage == null ? void 0 : storage.removeItem(KEY);
        return { backend: "indexedDB" };
      } catch (primary) {
        try {
          if (!storage) throw Error("localStorage unavailable");
          const json = JSON.stringify(value);
          storage.setItem(KEY, json);
          if (storage.getItem(KEY) !== json) throw Error("Write verification failed");
          return { backend: "localStorage" };
        } catch (secondary) {
          throw Error("Playlist was not saved. IndexedDB: " + primary.name + "; local storage: " + secondary.name + ". Storage may be blocked or full.");
        }
      }
    }, async delete() {
      await transaction("delete");
      storage == null ? void 0 : storage.removeItem(KEY);
    } };
  }

  // src/core.mjs
  function parseM3U(text, base = "") {
    if (!/^\s*#EXTM3U/i.test(text.replace(/^\uFEFF/, ""))) throw Error("Bu fayl M3U pleylisti deyil. \u0130lk s\u0259tir #EXTM3U olmal\u0131d\u0131r.");
    const channels = [];
    let pending = null;
    let epg = "";
    const attr = (s) => Object.fromEntries([...s.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g)].map((m) => {
      var _a4, _b3, _c;
      return [m[1].toLowerCase(), (_c = (_b3 = (_a4 = m[2]) != null ? _a4 : m[3]) != null ? _b3 : m[4]) != null ? _c : ""];
    }));
    const resolve = (s) => {
      if (!s) return "";
      try {
        const u = new URL(s.trim().replace(/&amp;/g, "&"), base || void 0);
        return ["http:", "https:"].includes(u.protocol) ? u.href : "";
      } catch {
        return "";
      }
    };
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith("#EXTM3U")) {
        const a = attr(line);
        epg = resolve(a["url-tvg"] || a["x-tvg-url"] || "");
      } else if (line.startsWith("#EXTINF:")) {
        const a = attr(line);
        let quote = "", comma = -1;
        for (let i = 0; i < line.length; i++) {
          if (quote) {
            if (line[i] === quote) quote = "";
          } else if (line[i] === '"' || line[i] === "'") quote = line[i];
          else if (line[i] === ",") {
            comma = i;
            break;
          }
        }
        pending = { name: comma >= 0 ? line.slice(comma + 1).trim() : "Kanal", epgId: a["tvg-id"] || "", logo: resolve(a["tvg-logo"] || a.logo || a["tvg-logo-small"] || ""), group: a["group-title"] || "\xDCmumi", poster: resolve(a["tvg-logo"] || ""), catchup: a.catchup || "", catchupSource: a["catchup-source"] || a["timeshift-source"] || "", catchupDays: Number(a["catchup-days"] || a["timeshift-days"] || 0), type: /^(series|episode)$/i.test(a["tvg-type"] || "") || /series|serial|season|episode/i.test(a["group-title"] || "") ? "series" : a["tvg-type"] === "movie" || /vod|film|movie/i.test(a["group-title"] || "") ? "movie" : "tv" };
      } else if (line.startsWith("#EXTVLCOPT:") && pending) {
        const m = /^#EXTVLCOPT:http-(user-agent|referrer|referer)=(.*)$/i.exec(line);
        if (m) pending[m[1].toLowerCase() === "user-agent" ? "userAgent" : "referer"] = m[2].trim();
      } else if (line.startsWith("#EXTGRP:") && pending) pending.group = line.slice(8).trim() || pending.group;
      else if (!line.startsWith("#") && pending) {
        const [address, headerText] = line.split("|", 2);
        if (headerText) {
          const h = new URLSearchParams(headerText);
          pending.userAgent = h.get("User-Agent") || h.get("user-agent") || pending.userAgent;
          pending.referer = h.get("Referer") || h.get("referer") || pending.referer;
        }
        const url = resolve(address);
        if (url) {
          pending.type = /\/movie\//i.test(url) ? "movie" : /\/series\//i.test(url) ? "series" : pending.type;
          channels.push({ ...pending, id: "ch-" + hash(url + "|" + pending.epgId), url });
        }
        pending = null;
      }
    }
    if (!channels.length) throw Error("Pleylistd\u0259 d\u0259st\u0259kl\u0259n\u0259n HTTP/HTTPS kanal \xFCnvan\u0131 tap\u0131lmad\u0131.");
    const unique = [...new Map(channels.map((c) => [c.id, c])).values()];
    return { channels: unique, epg };
  }
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return (h >>> 0).toString(36);
  }
  function xmlDate(s) {
    const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4}|Z)?/.exec(s || "");
    if (!m) return NaN;
    const zone = m[7] || "+0000";
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    if (zone === "Z") return t;
    const minutes = (+zone.slice(1, 3) * 60 + +zone.slice(3, 5)) * (zone[0] === "-" ? -1 : 1);
    return t - minutes * 6e4;
  }
  function parseXMLTV(text, Parser = globalThis.DOMParser) {
    var _a4, _b3, _c;
    const doc = new Parser().parseFromString(text, "text/xml");
    if (doc.querySelector("parsererror") || !doc.querySelector("tv")) throw Error("XMLTV fayl\u0131 oxunmad\u0131. D\xFCzg\xFCn XMLTV fayl\u0131 se\xE7in.");
    const names = {};
    doc.querySelectorAll("channel").forEach((c) => {
      var _a5;
      names[c.id] = ((_a5 = c.querySelector("display-name")) == null ? void 0 : _a5.textContent) || c.id;
    });
    const programs = [];
    for (const p of doc.querySelectorAll("programme")) {
      const start = xmlDate(p.getAttribute("start")), end = xmlDate(p.getAttribute("stop"));
      if (Number.isFinite(start) && end > start) programs.push({ channel: p.getAttribute("channel"), start, end, title: ((_a4 = p.querySelector("title")) == null ? void 0 : _a4.textContent) || "Ads\u0131z proqram", description: ((_b3 = p.querySelector("desc")) == null ? void 0 : _b3.textContent) || "", category: ((_c = p.querySelector("category")) == null ? void 0 : _c.textContent) || "" });
    }
    if (!programs.length) throw Error("XMLTV-d\u0259 etibarl\u0131 proqram vaxt\u0131 tap\u0131lmad\u0131.");
    return { names, programs };
  }
  function demoData(now = Date.now()) {
    const names = ["Loom One", "Loom Cinema", "Loom Sport", "Loom Nature", "Loom News", "Loom Music", "Loom Junior", "Loom Travel", "Loom Science", "Loom Culture", "Loom Living", "Loom Mix"];
    const groups = ["\xDCmumi", "Filml\u0259r v\u0259 seriallar", "\u0130dman", "S\u0259n\u0259dli", "X\u0259b\u0259rl\u0259r", "Musiqi", "U\u015Faq", "S\u0259yah\u0259t", "S\u0259n\u0259dli", "M\u0259d\u0259niyy\u0259t", "H\u0259yat t\u0259rzi", "\xDCmumi"];
    const titles = [["S\u0259h\u0259rin ritmi", "\u015E\u0259h\u0259rin hekay\u0259l\u0259ri", "Ax\u015Fam g\xF6r\xFC\u015F\xFC", "G\xFCn\xFCn i\xE7ind\u0259n"], ["Sonuncu i\u015F\u0131q", "B\xF6y\xFCk s\u0259yah\u0259t", "Kino g\xFCnd\u0259liyi", "S\u0259ssiz \u015F\u0259h\u0259r"], ["Oyundan \u0259vv\u0259l", "Arena: h\u0259ft\u0259nin icmal\u0131", "Q\u0259l\u0259b\u0259y\u0259 do\u011Fru", "\u0130dman saat\u0131"], ["Da\u011Flar\u0131n o \xFCz\xFCnd\u0259", "T\u0259bi\u0259tin s\u0259si", "Okean\u0131n d\u0259rinlikl\u0259ri", "V\u0259h\u015Fi d\xFCnya"], ["G\xFCn\xFCn x\u0259b\u0259rl\u0259ri", "D\xFCnya bu g\xFCn", "\u0130qtisadi bax\u0131\u015F", "X\u0259b\u0259r vaxt\u0131"], ["Canl\u0131 s\u0259hn\u0259", "Akustik ax\u015Fam", "Ritml\u0259r", "Yeni s\u0259sl\u0259r"], ["Balaca k\u0259\u015Ff\xE7il\u0259r", "R\u0259ngli d\xFCnya", "Na\u011F\u0131llar al\u0259mi", "Dostlarla birlikd\u0259"], ["Uzaq yollar", "Yeni \xFCf\xFCql\u0259r", "S\u0259yah\u0259t g\xFCnd\u0259liyi", "D\xFCnyan\u0131n dad\u0131"], ["Sabah\u0131n d\xFCnyas\u0131", "Kosmosa bax\u0131\u015F", "Bir k\u0259\u015Ffin izi", "Elm saat\u0131"], ["S\u0259n\u0259tin izind\u0259", "A\xE7\u0131q s\u0259hn\u0259", "Tarixin s\u0259si", "M\u0259d\u0259niyy\u0259t g\xFCnd\u0259liyi"], ["Evd\u0259 bir g\xFCn", "Yeni ba\u015Flan\u011F\u0131c", "Ki\xE7ik ba\u011F", "M\u0259tb\u0259xd\u0259"], ["G\xFCn\xFCn se\xE7imi", "Ax\u015Fam s\xF6hb\u0259ti", "H\u0259ft\u0259nin r\u0259ngl\u0259ri", "Birlikd\u0259"]];
    const channels = names.map((name, i) => ({ id: "demo-" + i, name, epgId: "demo-" + i, group: groups[i], url: "assets/demo.mp4", logo: "", type: "tv", demo: true, color: ["#79b9a3", "#c29568", "#98a9ca", "#87ac80", "#b98e87", "#a495c5"][i % 6] }));
    const anchor = Math.floor(now / 36e5) * 36e5;
    const programs = [];
    channels.forEach((c, i) => {
      for (let j = -5; j < 27; j++) {
        const start = anchor + j * 18e5;
        programs.push({ channel: c.id, start, end: start + 18e5, title: titles[i][((j + i) % 4 + 4) % 4], description: "TiviLoom \xFC\xE7\xFCn haz\u0131rlanm\u0131\u015F n\xFCmun\u0259 TV proqram\u0131. Bu c\u0259dv\u0259l v\u0259 video yaln\u0131z interfeysi, pultu v\u0259 oynatma davran\u0131\u015Flar\u0131n\u0131 s\u0131naqdan ke\xE7irm\u0259k \xFC\xE7\xFCnd\xFCr.", category: groups[i] });
      }
    });
    const films = ["Sonuncu i\u015F\u0131q", "Mavi \xFCf\xFCq", "S\u0259ssiz \u015F\u0259h\u0259r", "B\xF6y\xFCk s\u0259yah\u0259t", "Ulduzlara do\u011Fru", "Pay\u0131z m\u0259ktublar\u0131", "\u015Eimal k\xFCl\u0259yi", "Bir yay g\xFCn\xFC"];
    films.forEach((name, i) => channels.push({ id: "film-" + i, name, group: "N\xFCmun\u0259 filml\u0259r", url: "assets/demo.mp4", type: "movie", demo: true, poster: "assets/poster-" + i + ".svg", year: 2020 + i % 6, description: "Orijinal n\xFCmun\u0259 film kart\u0131. Oynat d\xFCym\u0259si yerli s\u0131naq videosunu a\xE7\u0131r; kommersiya filmi daxil edilm\u0259yib." }));
    return { channels, programs };
  }

  // src/parse-playlist.mjs
  async function parsePlaylist(text, base = "") {
    if (text.length < 512 * 1024 || typeof Worker === "undefined") return parseM3U(text, base);
    const data = await new Promise((resolve) => {
      let worker, timer, done = false;
      const end = (value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        worker == null ? void 0 : worker.terminate();
        resolve(value);
      };
      try {
        worker = new Worker("assets/playlist-worker.js");
        timer = setTimeout(() => end({ unavailable: true }), 3e4);
        worker.onerror = () => end({ unavailable: true });
        worker.onmessage = (e) => end(e.data);
        worker.postMessage({ text, base });
      } catch {
        end({ unavailable: true });
      }
    });
    if (data.error) throw Error(data.error);
    if (data.result) return data.result;
    await new Promise((r) => setTimeout(r, 0));
    return parseM3U(text, base);
  }

  // src/media-library.mjs
  function parseEpisode(name) {
    const s = String(name || "");
    const m = s.match(/(?:S(\d{1,2})\s*E(\d{1,3})|(?:season|mövsüm)\s*(\d+)\s*(?:episode|ep|bölüm)\s*(\d+))/i);
    if (!m) return { title: s, season: 1, episode: 1, identified: false };
    return { title: s.slice(0, m.index).replace(/[-_:\s]+$/, "").trim() || s, season: Number(m[1] || m[3]), episode: Number(m[2] || m[4]), identified: true };
  }
  function seriesCatalog(channels) {
    var _a4, _b3;
    const shows = /* @__PURE__ */ new Map();
    for (const c of channels) {
      if (c.type !== "series") continue;
      const e = parseEpisode(c.name), key = (c.seriesShowName || (((_a4 = c.xtream) == null ? void 0 : _a4.seriesId) ? c.name : e.identified ? e.title : c.group)).toLocaleLowerCase();
      if (!shows.has(key)) shows.set(key, { id: key, name: c.seriesShowName || (((_b3 = c.xtream) == null ? void 0 : _b3.seriesId) ? c.name : e.identified ? e.title : c.group), poster: c.poster || c.logo || "", episodes: [] });
      shows.get(key).episodes.push({ ...c, season: c.season || e.season, episode: c.episode || e.episode });
    }
    for (const s of shows.values()) s.episodes.sort((a, b) => a.season - b.season || a.episode - b.episode);
    return [...shows.values()];
  }
  function canSeek(media) {
    return !!media && Number.isFinite(media.duration) && media.duration > 0;
  }
  function resumeOffset(seconds, duration) {
    const at = Number(seconds) || 0;
    return Number.isFinite(duration) && duration > 0 && at > 10 && at < duration - 20 ? at : 0;
  }
  function nextEpisode(episodes, id) {
    const index = episodes.findIndex((e) => e.id === id);
    return index < 0 ? null : episodes[index + 1] || null;
  }

  // src/catchup.mjs
  function archiveURL(channel, programme, now = Date.now()) {
    if (!channel || !programme || !channel.catchupSource || !programme.start || !programme.end || programme.end > now) return null;
    const duration = Math.max(1, Math.round((programme.end - programme.start) / 1e3));
    const begin = Math.floor(programme.start / 1e3);
    if (channel.catchupDays > 0 && now - programme.start > channel.catchupDays * 864e5) return null;
    let url = channel.catchupSource.replace(/\{(utc|start|timestamp)\}/gi, String(begin)).replace(/\{(duration|length)\}/gi, String(duration)).replace(/\{(offset)\}/gi, String(Math.round((now - programme.start) / 1e3)));
    try {
      const result = new URL(url, channel.url);
      return ["http:", "https:"].includes(result.protocol) ? result.href : null;
    } catch {
      return null;
    }
  }

  // src/source-diagnostics.mjs
  function describeProbe(result) {
    if (!result) return "No diagnostic response";
    const status = Number(result.status) || 0;
    if (status === 401 || status === 403) return `Server access denied (HTTP ${status}); credentials, expired token, connection limit or required User-Agent/Referer. A 403 alone cannot identify which.`;
    if (status === 404) return "Source link missing or expired (HTTP 404).";
    if (status === 410) return "Source link expired or removed (HTTP 410).";
    if (status === 429) return "Provider rate/connection limit (HTTP 429).";
    if (status >= 500) return `Provider server returned HTTP ${status}.`;
    if (status >= 200 && status < 400) return `Server reachable (HTTP ${status}); codec/playback still unverified${result.contentType ? " \xB7 " + result.contentType : ""}.`;
    return `Source could not be reached${result.message ? " \xB7 " + result.message : ""}.`;
  }

  // src/display-mode.mjs
  var displayModes = [["contain", "Normal"], ["fill", "Full"], ["cover", "Zoom"], ["cinema-zoom", "Zoom - 2.35:1"], ["reduced", "Reduced"], ["4:3", "4:3"], ["16:9", "16:9"], ["2.35:1", "2.35:1"]];
  function displayRect(mode, width, height) {
    let w = width, h = height, fit = mode === "cover" ? "cover" : mode === "fill" ? "fill" : "contain", scale = mode === "reduced" ? 0.8 : mode === "cinema-zoom" ? 1.32 : 1;
    const ratio = { "4:3": 4 / 3, "16:9": 16 / 9, "2.35:1": 2.35 }[mode];
    if (ratio) {
      w = Math.min(width, height * ratio);
      h = w / ratio;
      fit = "fill";
    }
    return { width: w, height: h, left: (width - w) / 2, top: (height - h) / 2, fit, scale };
  }
  function applyDisplayMode(video, host, mode) {
    const r = displayRect(mode, host.clientWidth || 1280, host.clientHeight || 720);
    Object.assign(video.style, { width: r.width + "px", height: r.height + "px", left: r.left + "px", top: r.top + "px", right: "auto", bottom: "auto", objectFit: r.fit, transform: r.scale === 1 ? "none" : "scale(" + r.scale + ")", transformOrigin: "center" });
  }

  // src/dialog-stack.mjs
  var DialogStack = class {
    constructor() {
      this.key = null;
      this.frames = [];
    }
    enter(key, capture) {
      if (key === this.key) return;
      const earlier = this.frames.findIndex((frame) => frame.key === key);
      if (earlier >= 0) this.frames = this.frames.slice(0, earlier);
      else if (this.key !== null) this.frames.push({ key: this.key, value: capture() });
      this.key = key;
    }
    back() {
      var _a4, _b3;
      const frame = this.frames.pop();
      this.key = (_a4 = frame == null ? void 0 : frame.key) != null ? _a4 : null;
      return (_b3 = frame == null ? void 0 : frame.value) != null ? _b3 : null;
    }
    clear() {
      this.key = null;
      this.frames = [];
    }
  };

  // src/video-surface.mjs
  function createVideoSurface(video, stage, error, onLayout = () => {
  }) {
    const host = document.createElement("div");
    host.id = "video-surface";
    host.append(video, error);
    stage.append(host);
    let target = document.querySelector("#preview"), frame = 0, until = 0;
    function layout() {
      frame = 0;
      const base = stage.getBoundingClientRect(), box = target == null ? void 0 : target.getBoundingClientRect();
      if (!box || !base.width || !box.width || !box.height) {
        host.hidden = true;
        return;
      }
      host.hidden = false;
      const sx = base.width / stage.offsetWidth, sy = base.height / stage.offsetHeight;
      Object.assign(host.style, { left: (box.left - base.left) / sx + "px", top: (box.top - base.top) / sy + "px", width: box.width / sx + "px", height: box.height / sy + "px", borderRadius: target.id === "preview" ? "11px" : "0px" });
      onLayout();
      if (performance.now() < until) frame = requestAnimationFrame(layout);
    }
    function refresh() {
      until = performance.now() + 250;
      if (!frame) frame = requestAnimationFrame(layout);
    }
    function place(next, full = false) {
      target = next;
      host.classList.toggle("full-surface", full);
      host.style.zIndex = (target == null ? void 0 : target.id) === "mini-video-host" ? "25" : (target == null ? void 0 : target.id) === "list-preview" ? "25" : full ? "19" : "1";
      refresh();
    }
    const resize = new ResizeObserver(refresh);
    resize.observe(stage);
    document.querySelector("#app").addEventListener("transitionrun", refresh);
    window.addEventListener("resize", refresh);
    refresh();
    return { place, refresh, host };
  }

  // src/xtream.mjs
  function xtreamApi(server, username, password, action, id = null) {
    const url = new URL(server);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw Error("Invalid Xtream server.");
    url.pathname = url.pathname.replace(/\/$/, "") + "/player_api.php";
    url.search = "";
    url.searchParams.set("username", username);
    url.searchParams.set("password", password);
    url.searchParams.set("action", action);
    if (id !== null) url.searchParams.set(action === "get_series_info" ? "series_id" : "vod_id", String(id));
    return url.href;
  }
  function xtreamMovie(item, credentials) {
    const id = Number(item.stream_id);
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    const ext = String(item.container_extension || "mp4").replace(/[^a-zA-Z0-9]/g, "") || "mp4";
    const root = credentials.server.replace(/\/$/, "");
    return { id: "vod-" + hash(root + "|" + credentials.username + "|" + id), name: String(item.name || "Movie"), group: String(item.category_name || "Movies"), type: "movie", url: root + "/movie/" + encodeURIComponent(credentials.username) + "/" + encodeURIComponent(credentials.password) + "/" + id + "." + ext, poster: String(item.stream_icon || item.cover || ""), added: Number(item.added) || 0, year: item.year || "", description: String(item.plot || ""), xtream: { server: root, username: credentials.username, password: credentials.password, vodId: id } };
  }
  function xtreamSeries(item, credentials) {
    const id = Number(item.series_id);
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    const root = credentials.server.replace(/\/$/, "");
    return { id: "series-show-" + hash(root + "|" + credentials.username + "|" + id), name: String(item.name || "Series"), group: String(item.category_name || "Series"), type: "series", url: "", poster: String(item.cover || item.stream_icon || ""), xtream: { ...credentials, server: root, seriesId: id } };
  }
  function xtreamEpisodes(raw, show) {
    var _a4;
    const seasons = (raw == null ? void 0 : raw.episodes) || {};
    const all = [];
    for (const [season, parts] of Object.entries(seasons)) {
      if (!Array.isArray(parts)) continue;
      for (const e of parts) {
        if (!e || !e.id) continue;
        const ext = String(e.container_extension || "mp4").replace(/[^a-zA-Z0-9]/g, "") || "mp4";
        const cr = show.xtream;
        all.push({ id: "ep-" + hash(cr.server + "|" + cr.username + "|" + e.id), name: String(e.title || show.name + " S" + season + " E" + (e.episode_num || 1)), group: show.group, seriesShowName: show.name, type: "series", url: cr.server + "/series/" + encodeURIComponent(cr.username) + "/" + encodeURIComponent(cr.password) + "/" + encodeURIComponent(e.id) + "." + ext, poster: String(((_a4 = e.info) == null ? void 0 : _a4.movie_image) || show.poster || ""), season: Number(season) || 1, episode: Number(e.episode_num) || 1 });
      }
    }
    return all.sort((a, b) => a.season - b.season || a.episode - b.episode);
  }

  // src/playback-status.mjs
  var labels = { loading: "Loading", playing: "Now playing", paused: "Paused", buffering: "Buffering", error: "Playback failed" };
  function playbackPresentation(state, id) {
    const phase = state.playing === id ? state.playbackPhase || "loading" : "idle";
    return { phase, active: phase !== "idle", label: labels[phase] || "" };
  }
  function syncPlaybackRows(root, state) {
    var _a4;
    for (const row of root.querySelectorAll(".channel-name")) {
      const p = playbackPresentation(state, row.dataset.channel), marker = row.querySelector("[data-playback-indicator]");
      row.classList.toggle("is-tuned", p.active);
      row.classList.toggle("is-playing", p.phase === "playing");
      if (p.active) row.setAttribute("aria-current", "true");
      else row.removeAttribute("aria-current");
      const name = ((_a4 = row.querySelector(".label")) == null ? void 0 : _a4.textContent) || "";
      row.setAttribute("aria-label", name + (p.label ? " \xB7 " + p.label : ""));
      if (marker) {
        marker.hidden = !p.active;
        marker.dataset.phase = p.phase;
        marker.setAttribute("title", p.label);
        marker.setAttribute("aria-label", p.label);
      }
    }
  }
  function favoriteNumberLookup(state, value) {
    const text = String(value), favorites = new Set(state.favorites || []), hidden = new Set(state.hiddenChannels || []), groups = new Set(state.hiddenGroups || []);
    const candidates = state.channels.filter((c) => {
      var _a4;
      return c.type === "tv" && favorites.has(c.id) && !hidden.has(c.id) && !groups.has(c.group) && Number.isInteger((_a4 = state.channelNumbers) == null ? void 0 : _a4[c.id]) && String(state.channelNumbers[c.id]).startsWith(text);
    });
    return { exact: candidates.find((c) => String(state.channelNumbers[c.id]) === text) || null, candidates };
  }

  // src/usability.mjs
  var remoteChoices = ["favorite", "guide", "search", "context", "last-channel", "playlists", "favorites", "mute"];
  function numberKey(e) {
    if (/^[0-9]$/.test(e.key || "")) return e.key;
    const c = e.keyCode || e.which;
    return c >= 48 && c <= 57 ? String(c - 48) : c >= 96 && c <= 105 ? String(c - 96) : null;
  }
  function assignNumber(numbers, id, value, favorites) {
    if (!favorites.includes(id)) throw Error("Add this channel to Favorites first.");
    const result = { ...numbers };
    delete result[id];
    if (value === "") return result;
    if (!/^[1-9]\d{0,3}$/.test(String(value))) throw Error("Choose a number from 1 to 9999.");
    const n = Number(value);
    if (Object.entries(result).some(([key, v]) => key !== id && Number(v) === n)) throw Error("This number is already assigned to another favorite.");
    result[id] = n;
    return result;
  }
  function cleanOptions(options = {}, channels = [], favorites = []) {
    const ids = new Set(channels.map((c) => c.id)), groups = new Set(channels.map((c) => c.group)), numbers = {}, used = /* @__PURE__ */ new Set();
    for (const [id, value] of Object.entries(options.channelNumbers || {})) if (ids.has(id) && favorites.includes(id) && Number.isInteger(value) && value > 0 && value <= 9999 && !used.has(value)) {
      numbers[id] = value;
      used.add(value);
    }
    const clean = (value) => [...new Set(Array.isArray(value) ? value : [])].filter((id) => ids.has(id)), logos = {};
    for (const [id, url] of Object.entries(options.logoOverrides || {})) {
      if (!ids.has(id) || typeof url !== "string") continue;
      try {
        const u = new URL(url);
        if (["http:", "https:"].includes(u.protocol) && !u.username && !u.password) logos[id] = u.href;
      } catch {
      }
    }
    const groupNames = {}, groupPins = {};
    for (const [group, name] of Object.entries(options.groupNames || {})) if (groups.has(group) && typeof name === "string" && name.trim() && name.trim().length <= 80) groupNames[group] = name.trim();
    for (const [group, record] of Object.entries(options.groupPins || {})) if (groups.has(group) && record && Array.isArray(record.salt) && record.salt.length === 16 && /^[a-f0-9]{64}$/.test(record.hash || "")) groupPins[group] = record;
    return { channelNumbers: numbers, hiddenChannels: clean(options.hiddenChannels), lockedChannels: clean(options.lockedChannels), hiddenGroups: [...new Set(Array.isArray(options.hiddenGroups) ? options.hiddenGroups : [])].filter((g) => groups.has(g)), logoOverrides: logos, groupNames, groupPins };
  }
  function moveFavorite(favorites, id, delta) {
    const next = [...favorites], i = next.indexOf(id), j = i + delta;
    if (i >= 0 && j >= 0 && j < next.length) [next[i], next[j]] = [next[j], next[i]];
    return next;
  }
  function normalizeSearch(value) {
    return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/ı/g, "i").replace(/ə/g, "e");
  }
  function reconnectDelay(attempt) {
    return attempt < 1 || attempt > 3 ? null : [1500, 3500, 7e3][attempt - 1];
  }
  function validSourceSettings(data) {
    const name = String(data.name || "").trim();
    if (!name || name.length > 80) throw Error("Playlist name must be 1\u201380 characters.");
    const url = String(data.sourceURL || "").trim(), epg = String(data.epgURL || "").trim();
    for (const value of [url, epg].filter(Boolean)) {
      const u = new URL(value);
      if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) throw Error("Use an HTTP or HTTPS address.");
    }
    const userAgent = String(data.userAgent || "").trim();
    if (userAgent.length > 200 || /[\r\n]/.test(userAgent)) throw Error("Invalid User-Agent.");
    const updateHours = Number(data.updateHours || 0);
    if (![0, 1, 3, 6, 12, 24, 48, 168].includes(updateHours)) throw Error("Invalid update interval.");
    return { name, sourceURL: url, epgURL: epg, userAgent, updateHours, updateOnStart: !!data.updateOnStart, enabled: data.enabled !== false };
  }
  async function hashPIN(pin, salt) {
    if (!/^\d{4,6}$/.test(pin)) throw Error("PIN must contain 4\u20136 digits.");
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: Uint8Array.from(salt), iterations: 1e5 }, key, 256);
    return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  async function makePIN(pin) {
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)));
    return { salt, hash: await hashPIN(pin, salt) };
  }
  async function checkPIN(pin, record) {
    try {
      return !!record && await hashPIN(pin, record.salt) === record.hash;
    } catch {
      return false;
    }
  }

  // src/playlists.mjs
  var list = (value) => Array.isArray(value) ? value : [];
  function emptyCatalog() {
    return { version: 2, activeId: null, playlists: [] };
  }
  function playlistSnapshot(state, resume = {}) {
    return {
      name: state.source || "Playlist",
      channels: list(state.channels),
      programs: list(state.programs),
      epgNames: state.epgNames || {},
      imported: !!state.imported,
      sourceURL: state.sourceURL || "",
      epgURL: state.epgURL || "",
      favorites: list(state.favorites),
      history: list(state.history),
      reminders: list(state.reminders),
      savedPrograms: list(state.savedPrograms),
      resume: { ...resume },
      enabled: state.enabled !== false,
      userAgent: state.userAgent || "",
      updateHours: Number(state.updateHours) || 0,
      updateOnStart: !!state.updateOnStart,
      lastUpdated: Number(state.lastUpdated) || 0,
      ...cleanOptions(state, state.channels, state.favorites)
    };
  }
  function loadCatalog(value, legacyState = {}, legacyResume = {}) {
    var _a4, _b3;
    if ((value == null ? void 0 : value.version) === 2 && Array.isArray(value.playlists)) {
      const seen = /* @__PURE__ */ new Set(), playlists = value.playlists.filter((p) => {
        if (!p || typeof p.id !== "string" || !Array.isArray(p.channels) || !p.channels.length || seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
      return { version: 2, activeId: playlists.some((p) => p.id === value.activeId && p.enabled !== false) ? value.activeId : ((_a4 = playlists.find((p) => p.enabled !== false)) == null ? void 0 : _a4.id) || null, playlists };
    }
    if ((value == null ? void 0 : value.imported) && ((_b3 = value.channels) == null ? void 0 : _b3.length)) {
      const playlist = { ...playlistSnapshot({ ...legacyState, ...value }, legacyResume), id: "legacy-active" };
      return { version: 2, activeId: playlist.id, playlists: [playlist] };
    }
    return emptyCatalog();
  }
  function activePlaylist(catalog) {
    return catalog.playlists.find((p) => p.id === catalog.activeId) || null;
  }
  function captureActive(catalog, state, resume) {
    if (!catalog.activeId) return catalog;
    return { ...catalog, playlists: catalog.playlists.map((p) => p.id === catalog.activeId ? { ...p, ...playlistSnapshot(state, resume) } : p) };
  }
  function addPlaylist(catalog, data, id) {
    if (!id || catalog.playlists.some((p) => p.id === id)) throw Error("Playlist identity already exists.");
    if (!Array.isArray(data.channels) || !data.channels.length) throw Error("Playlist has no channels.");
    const playlist = { ...playlistSnapshot({ ...data, source: data.name || data.source }, data.resume), id };
    return { ...catalog, version: 2, activeId: id, playlists: [...catalog.playlists, playlist] };
  }
  function choosePlaylist(catalog, id) {
    if (!catalog.playlists.some((p) => p.id === id && p.enabled !== false)) throw Error("Playlist was not found or is disabled.");
    return { ...catalog, activeId: id };
  }
  function overlayPlaylist(playlist, saved) {
    if (!saved || saved.version !== 1) return playlist;
    const ids = new Set(playlist.channels.map((c) => c.id));
    const filter = (value) => list(value).filter((id) => ids.has(id));
    const favorites = filter(saved.favorites);
    return { ...playlist, favorites, history: filter(saved.history), reminders: list(saved.reminders), savedPrograms: list(saved.savedPrograms || playlist.savedPrograms).filter((p) => p && ids.has(p.channelId)), resume: { ...playlist.resume, ...saved.resume }, ...cleanOptions({ ...playlist, ...saved }, playlist.channels, favorites) };
  }
  function editPlaylist(catalog, id, patch) {
    var _a4;
    if (!catalog.playlists.some((p) => p.id === id)) throw Error("Playlist was not found.");
    const playlists = catalog.playlists.map((p) => p.id === id ? { ...p, ...patch, id: p.id } : p);
    return { ...catalog, playlists, activeId: playlists.some((p) => p.id === catalog.activeId && p.enabled !== false) ? catalog.activeId : ((_a4 = playlists.find((p) => p.enabled !== false)) == null ? void 0 : _a4.id) || null };
  }
  function deletePlaylist(catalog, id) {
    var _a4;
    const playlists = catalog.playlists.filter((p) => p.id !== id);
    return { ...catalog, playlists, activeId: playlists.some((p) => p.id === catalog.activeId && p.enabled !== false) ? catalog.activeId : ((_a4 = playlists.find((p) => p.enabled !== false)) == null ? void 0 : _a4.id) || null };
  }

  // src/advanced-ui.mjs
  function mountAdvanced(ctx) {
    const { state, $, $$, esc, toast, platform: platform2 } = ctx;
    let editingId = null, channelId = null, pinAction = null, unlockedUntil = 0, pinFailures = 0, pinBlockedUntil = 0, digits = "", digitTimer, hudTimer, refreshBusy = false;
    const refreshAttempts = /* @__PURE__ */ new Map();
    const button = (label, action2, extra = "") => ["settings-root", "playlists"].includes(action2) ? "" : `<button class="setting-row" data-adv="${action2}" ${extra}><span class="setting-text">${label}</span><span>\u203A</span></button>`;
    function panel(title, body, section = "root", route = title, resume = null) {
      ctx.modal(title, body, "", { panel: true, key: route, resume: resume || (title === "Playlists" ? () => settings("sources") : null) });
      $(".settings-panel").dataset.tvSettings = section;
    }
    function error(text) {
      const target = $("#adv-status");
      if (target) target.textContent = text;
      else toast(text);
    }
    function optionList(selected) {
      const names = { favorite: "Favorites", guide: "TV guide", search: "Search", context: "Channel menu", "last-channel": "Last watched channel", playlists: "Playlists", favorites: "Favorite channels", mute: "Mute / unmute" };
      return remoteChoices.map((v) => `<option value="${v}" ${v === selected ? "selected" : ""}>${names[v]}</option>`).join("");
    }
    function guard(kind, action2, c) {
      var _a4;
      const protectedItem = kind === "pin" ? true : kind === "settings" ? state.prefs.lockSettings : (_a4 = state.lockedChannels) == null ? void 0 : _a4.includes(c == null ? void 0 : c.id);
      if (!state.prefs.parental || !protectedItem || Date.now() < unlockedUntil) return false;
      pinAction = action2;
      ctx.modal("Enter PIN", '<form id="pin-form"><label>PIN<input id="pin-input" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></label><p id="adv-status" role="status"></p><button class="primary" type="submit">Unlock</button></form>', '<button class="secondary" data-action="close">Cancel</button>');
      return true;
    }
    async function verifyLocalPIN(pin) {
      return platform2.native ? (await platform2.request("verifyPIN", { pin, record: state.prefs.parental })).valid : checkPIN(pin, state.prefs.parental);
    }
    async function verifyPIN() {
      if (Date.now() < pinBlockedUntil) return error("Too many attempts. Wait 30 seconds.");
      const field = $("#pin-input"), pendingAction = pinAction, valid = await verifyLocalPIN(field.value);
      if (!field.isConnected || pinAction !== pendingAction) return;
      if (valid) {
        pinFailures = 0;
        unlockedUntil = Date.now() + 5 * 6e4;
        const action2 = pinAction;
        pinAction = null;
        ctx.closeModal();
        action2 == null ? void 0 : action2();
      } else {
        pinFailures++;
        if (pinFailures >= 3) {
          pinBlockedUntil = Date.now() + 3e4;
          pinFailures = 0;
        }
        error("Incorrect PIN.");
      }
    }
    function settings(section) {
      var _a4;
      if (section === "sources") {
        const catalog = ctx.getCatalog();
        panel("Playlists", button("Back to settings", "settings-root") + `<div class="settings-section-title">Saved playlists \xB7 ${catalog.playlists.length}</div>` + catalog.playlists.map((p) => `<div class="playlist-entry"><button class="setting-row playlist-row" data-tv="playlist-select" data-id="${esc(p.id)}" aria-pressed="${p.id === catalog.activeId}" ${p.enabled === false ? "disabled" : ""}><span class="setting-text">${esc(p.name)}<small>${p.channels.length} channels \xB7 ${p.enabled === false ? "Disabled" : p.id === catalog.activeId ? "Active" : "Saved"}</small></span><span>${p.id === catalog.activeId ? "\u2713" : "\u203A"}</span></button><button class="playlist-options" data-adv="playlist-details" data-id="${esc(p.id)}" aria-label="Options for ${esc(p.name)}">\u22EF</button></div>`).join("") + `<div class="menu-list"><button data-tv="import">\uFF0B Add playlist</button><button data-action="epg">EPG for active playlist</button><button data-tv="sample">Load sample playlist</button></div>`, "sources");
        (_a4 = $('.playlist-row[aria-pressed="true"]') || $('[data-tv="import"]')) == null ? void 0 : _a4.focus();
        return true;
      }
      if (section === "library") {
        panel("General", button("Back to settings", "settings-root") + `<label class="setting-row startup-setting"><span class="setting-text">Turn on last channel on app start</span><input type="checkbox" data-pref="autoplay" ${state.prefs.autoplay ? "checked" : ""}></label>` + button("Manage favorites and numbers", "favorites") + '<button class="setting-row" data-tv="favorite-folders">Favorite folders \u203A</button><button class="setting-row" data-tv="health-check">Channel Health Check \u203A</button>' + button("Channels and groups", "visibility") + button("Last watched channel", "last-channel") + `<div class="menu-list"><button data-action="clear-history">Clear history</button></div>`, "library");
        return true;
      }
      if (section === "playback") {
        panel("Playback", button("Back to settings", "settings-root") + `<label class="setting-row startup-setting"><span class="setting-text">Auto reconnect<small>Retry interrupted streams up to 3 times</small></span><input type="checkbox" data-pref="autoReconnect" ${state.prefs.autoReconnect !== false ? "checked" : ""}></label><label class="setting-row startup-setting"><span class="setting-text">Mute playback</span><input type="checkbox" data-pref="muted" ${state.prefs.muted ? "checked" : ""}></label><label class="setting-row"><span>Display mode</span><select data-pref="fit">${["contain", "cover", "fill", "cinema-zoom", "reduced", "4:3", "16:9", "2.35:1"].map((v) => `<option ${state.prefs.fit === v ? "selected" : ""} value="${v}">${{ contain: "Normal", cover: "Zoom", fill: "Full", "cinema-zoom": "Zoom - 2.35:1", reduced: "Reduced" }[v] || v}</option>`).join("")}</select></label>` + button("Last watched channel", "last-channel") + `<div class="menu-list"><button data-action="sleep">Sleep timer</button></div>`, "playback");
        return true;
      }
      if (section === "remote") {
        const defaults = { favorite: "favorite", guide: "guide", search: "search", context: "context" };
        panel("Remote control", button("Back to settings", "settings-root") + Object.entries(defaults).map(([key, v], i) => {
          var _a5;
          return `<label class="setting-row"><span class="setting-text">${["Red", "Green", "Yellow", "Blue"][i]} button</span><select data-remote="${key}">${optionList(((_a5 = state.prefs.remoteActions) == null ? void 0 : _a5[key]) || v)}</select></label>`;
        }).join("") + `<label class="setting-row"><span class="setting-text">Long OK</span><select data-long-ok>${optionList(state.prefs.longOK || "context")}</select></label><p class="panel-note">Type a favorite number, then OK, or wait one second. Back clears the typed number.</p>`, "remote");
        return true;
      }
      if (section === "parental") {
        panel("Parental controls", button("Back to settings", "settings-root") + `<form id="parental-form"><label>${state.prefs.parental ? "New PIN" : "Create PIN"}<input id="new-pin" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></label><label>Confirm PIN<input id="confirm-pin" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></label><label class="setting-row startup-setting"><span>Protect settings</span><input id="lock-settings" type="checkbox" ${state.prefs.lockSettings ? "checked" : ""}></label><button class="primary" type="submit">Save PIN</button></form>${state.prefs.parental ? button("Remove PIN protection", "remove-pin") : ""}<p class="panel-note">Use the channel menu to lock individual channels. The PIN is kept on this TV and is not included in backups.</p><p id="adv-status" role="status"></p>`, "parental");
        return true;
      }
      if (section === "status") {
        panel("Other", button("Back to settings", "settings-root") + '<div class="settings-section-title">Available</div><p class="panel-note">Multiple playlists \xB7 Playlist editing and updates \xB7 Favorites, order and numbers \xB7 Hidden channels and groups \xB7 Logo cache and manual logo URL \xB7 Last channel \xB7 Auto reconnect \xB7 Remote button actions \xB7 Parental PIN</p><div class="settings-section-title">Not available</div><p class="panel-note">Multiview \xB7 OS picture-in-picture \xB7 Stalker Portal \xB7 DRM playback \xB7 Cloud sync</p>', "status");
        return true;
      }
      if (section === "group-manage") return groupPanel();
      return false;
    }
    function playlistDetails(playlistId) {
      if (guard("settings", () => playlistDetails(playlistId))) return;
      editingId = playlistId;
      const p = ctx.getCatalog().playlists.find((p2) => p2.id === playlistId);
      if (!p) return settings("sources");
      const detail = (label, value, action2, extra = "") => button(label + `<small>${esc(value)}</small>`, action2, extra);
      panel(p.name, `<button class="setting-row" data-adv="toggle-playlist"><span class="setting-text">Enable playlist</span><span class="setting-switch ${p.enabled !== false ? "on" : ""}" aria-hidden="true"></span></button>` + detail("Playlist name", p.name, "edit-playlist", 'data-field="pl-name"') + detail("Playlist URL", p.sourceURL || "Not set", "edit-playlist", 'data-field="pl-url"') + detail("EPG sources", p.epgURL ? "1 source" : "Not set", "edit-playlist", 'data-field="pl-epg"') + detail("User-Agent", p.userAgent || "Not set", "edit-playlist", 'data-field="pl-agent"') + button("Manage groups \xB7 rename / PIN", "group-manager", `data-id="${esc(p.id)}"`) + `<div class="settings-section-title">Update options</div>` + detail("Update interval, hours", p.updateHours || "None", "edit-playlist", 'data-field="pl-interval"') + `<label class="setting-row startup-setting"><span class="setting-text">Update on app start</span><input type="checkbox" data-update-start="${esc(p.id)}" ${p.updateOnStart ? "checked" : ""}></label>` + button("Update playlist", "refresh-playlist") + `<p class="playlist-updated">${p.channels.length} channels${p.lastUpdated ? " \xB7 " + esc(new Date(p.lastUpdated).toLocaleString()) : ""}</p>` + button("Delete playlist", "delete-playlist"), "sources", "playlist:" + p.id, () => playlistDetails(p.id));
    }
    function editForm(focus = "pl-name") {
      var _a4;
      const p = ctx.getCatalog().playlists.find((p2) => p2.id === editingId);
      if (!p) return;
      panel("Edit playlist", `<form id="playlist-edit-form"><label>Playlist name<input id="pl-name" value="${esc(p.name)}" maxlength="80" required></label><label>Playlist URL<input id="pl-url" type="url" value="${esc(p.sourceURL || "")}" autocomplete="off"></label><label>EPG URL<input id="pl-epg" type="url" value="${esc(p.epgURL || "")}" autocomplete="off"></label><label>Playlist User-Agent<input id="pl-agent" value="${esc(p.userAgent || "")}" maxlength="200" autocomplete="off"></label><label>Update interval<select id="pl-interval">${[0, 1, 3, 6, 12, 24, 48, 168].map((n) => `<option value="${n}" ${Number(p.updateHours || 0) === n ? "selected" : ""}>${n ? n + " hours" : "Off"}</option>`).join("")}</select></label><label class="setting-row startup-setting"><span>Update on app start</span><input id="pl-start" type="checkbox" ${p.updateOnStart ? "checked" : ""}></label><button class="primary" type="submit">Save playlist</button></form><p class="panel-note">A changed playlist URL is loaded before saving. Scheduled updates run while TiviLoom is open.</p><p id="adv-status" role="status"></p>`, "sources", "playlist-edit:" + p.id);
      (_a4 = $("#" + focus)) == null ? void 0 : _a4.focus();
    }
    async function parsedSource(p) {
      var _a4;
      if (!p.sourceURL) throw Error("Enter the playlist URL in Edit playlist first.");
      const text = await ctx.api("source", { url: p.sourceURL, userAgent: p.userAgent });
      const parsed = await ctx.parsePlaylist(text, platform2.sourceBase(p.sourceURL));
      const cr = (_a4 = p.channels.find((c) => {
        var _a5;
        return (_a5 = c.xtream) == null ? void 0 : _a5.server;
      })) == null ? void 0 : _a4.xtream;
      if (cr) {
        const additions = [];
        for (const [action2, convert] of [["get_vod_streams", xtreamMovie], ["get_series", xtreamSeries]]) {
          try {
            const rows = JSON.parse(await ctx.api("source", { url: xtreamApi(cr.server, cr.username, cr.password, action2) }));
            if (!Array.isArray(rows)) throw Error("Invalid catalog");
            for (const row of rows) {
              const item = convert(row, cr);
              if (item) additions.push(item);
            }
          } catch {
            additions.push(...p.channels.filter((c) => {
              var _a5, _b3;
              return action2 === "get_vod_streams" ? (_a5 = c.xtream) == null ? void 0 : _a5.vodId : (_b3 = c.xtream) == null ? void 0 : _b3.seriesId;
            }));
            toast("Provider catalog unavailable; saved catalog retained.");
          }
        }
        const urls = new Set(additions.map((c) => c.url).filter(Boolean));
        parsed.channels = parsed.channels.filter((c) => !urls.has(c.url));
        parsed.channels.push(...additions);
      }
      let epg = { programs: p.programs || [], names: p.epgNames || {} };
      const epgURL = p.epgURL || parsed.epg;
      if (epgURL) {
        try {
          epg = await ctx.api("epg", { url: epgURL, userAgent: p.userAgent });
        } catch {
          toast("Channels loaded. EPG could not be updated; the previous guide was kept.");
        }
      }
      return { channels: parsed.channels, programs: epg.programs, epgNames: epg.names, epgURL, lastUpdated: Date.now() };
    }
    async function refreshPlaylist(playlistId, silent = false) {
      if (refreshBusy) return;
      const initiatedPanel = $(".settings-panel");
      refreshBusy = true;
      refreshAttempts.set(playlistId, Date.now());
      try {
        const p = ctx.getCatalog().playlists.find((p2) => p2.id === playlistId);
        if (!p || p.enabled === false) return;
        if (!silent) toast("Updating playlist\u2026");
        const data = await parsedSource(p);
        const fresh = ctx.getCatalog();
        if (!fresh.playlists.some((p2) => p2.id === playlistId)) return;
        await ctx.commitCatalog(editPlaylist(fresh, playlistId, data), playlistId === fresh.activeId);
        if (!silent) {
          toast("Playlist updated.");
          if (initiatedPanel == null ? void 0 : initiatedPanel.isConnected) playlistDetails(playlistId);
        }
      } catch (e) {
        if (!silent) error(e.message);
      } finally {
        refreshBusy = false;
      }
    }
    async function savePlaylist() {
      const form = $("#playlist-edit-form");
      const p = ctx.getCatalog().playlists.find((p2) => p2.id === editingId);
      if (!p) return;
      const data = validSourceSettings({ ...p, name: $("#pl-name").value, sourceURL: $("#pl-url").value, epgURL: $("#pl-epg").value, userAgent: $("#pl-agent").value, updateHours: $("#pl-interval").value, updateOnStart: $("#pl-start").checked });
      let patch = data;
      if (data.sourceURL !== p.sourceURL && data.sourceURL) {
        error("Loading the new playlist\u2026");
        patch = { ...data, ...await parsedSource({ ...p, ...data }) };
      }
      if (!form.isConnected) return;
      await ctx.commitCatalog(editPlaylist(ctx.getCatalog(), editingId, patch), patch.channels !== void 0 && editingId === ctx.getCatalog().activeId);
      playlistDetails(editingId);
      toast("Playlist saved.");
    }
    function channelTools(c) {
      var _a4, _b3;
      if (!c) return;
      channelId = c.id;
      const fav = state.favorites.includes(c.id), locked = (_a4 = state.lockedChannels) == null ? void 0 : _a4.includes(c.id), p = state.channel === c.id && state.selected ? state.selected : ctx.programAt(c);
      ctx.menu(c.name, [["Search", () => {
        ctx.closeModal();
        ctx.doAction("search");
      }], ["Settings", () => ctx.settings("root")], { heading: p.empty ? c.name : p.title }, ["Watch channel", () => {
        ctx.closeModal();
        ctx.play(c, true);
      }], ["Add to My list", () => {
        ctx.bookmarkProgram(p, c);
        ctx.modalBack();
      }], ["Program description", () => ctx.programDetails(p, c)], ...p.start > Date.now() ? [["Remind", () => ctx.reminder(p, c)]] : [], { heading: c.name }, [fav ? "Remove from Favorites" : "Add to Favorites", () => {
        ctx.favorite(c);
        channelTools(c);
      }], ["Favorite number" + (((_b3 = state.channelNumbers) == null ? void 0 : _b3[c.id]) ? " \xB7 " + state.channelNumbers[c.id] : ""), () => numberDialog(c)], ["Move favorite up", () => reorder(c, -1)], ["Move favorite down", () => reorder(c, 1)], [locked ? "Unblock channel" : "Block channel", () => {
        if (!state.prefs.parental) return settings("parental");
        if (guard("channel", () => lockChannel(c), c)) return;
        lockChannel(c);
      }], ["Hide channel", async () => {
        state.hiddenChannels = [.../* @__PURE__ */ new Set([...state.hiddenChannels || [], c.id])];
        if (state.playing === c.id) ctx.stopMedia();
        await saveOptions();
        ctx.closeModal();
        ctx.refresh();
      }], ["Edit channel logo", () => logoDialog(c)], { heading: c.group || "All channels" }, ["Manage Favorites", () => favoritesPanel()], ["Manage visibility", () => {
        editingId = ctx.getCatalog().activeId;
        visibilityPanel();
      }], ["Playlist settings", () => playlistDetails(ctx.getCatalog().activeId)]], { context: true, key: "channel-menu:" + c.id });
    }
    async function saveOptions() {
      ctx.saveLocalOptions();
      if (!await ctx.persistLibrary()) throw Error("Changes could not be saved. Check TV storage.");
      ctx.refresh();
    }
    async function reorder(c, delta) {
      if (!state.favorites.includes(c.id)) return toast("Add this channel to Favorites first.");
      state.favorites = moveFavorite(state.favorites, c.id, delta);
      ctx.save("favorites");
      await saveOptions();
      favoritesPanel();
    }
    async function lockChannel(c) {
      const a = state.lockedChannels || [];
      state.lockedChannels = a.includes(c.id) ? a.filter((id) => id !== c.id) : [...a, c.id];
      if (state.playing === c.id && state.lockedChannels.includes(c.id)) {
        unlockedUntil = 0;
        ctx.stopMedia();
      }
      await saveOptions();
      channelTools(c);
    }
    function numberDialog(c) {
      var _a4;
      if (!state.favorites.includes(c.id)) return toast("Add this channel to Favorites first.");
      channelId = c.id;
      ctx.modal("Favorite number", `<form id="number-form"><p>${esc(c.name)}</p><label>Number (1\u20139999)<input id="favorite-number" inputmode="numeric" maxlength="4" value="${((_a4 = state.channelNumbers) == null ? void 0 : _a4[c.id]) || ""}"></label><p class="note">Leave blank to remove the number. Each favorite has a unique number in this playlist.</p><p id="adv-status" role="status"></p><button class="primary" type="submit">Save number</button></form>`);
    }
    function logoDialog(c) {
      var _a4;
      channelId = c.id;
      ctx.modal("Channel logo", `<form id="logo-form"><label>Logo URL<input id="channel-logo-url" type="url" value="${esc(((_a4 = state.logoOverrides) == null ? void 0 : _a4[c.id]) || c.logo || "")}" autocomplete="off"></label><p id="adv-status" role="status"></p><button class="primary" type="submit">Save logo</button></form>`);
    }
    function favoritesPanel() {
      panel("Favorites", button("Back to settings", "settings-root") + state.favorites.map((id, i) => {
        var _a4;
        const c = state.channels.find((c2) => c2.id === id);
        return c ? `<div class="favorite-entry"><button class="setting-row" data-adv="favorite-tools" data-id="${esc(id)}"><span class="favorite-identity">${ctx.renderLogo(c)}<span class="favorite-name">${esc(c.name)}</span></span><small>${((_a4 = state.channelNumbers) == null ? void 0 : _a4[id]) ? "#" + state.channelNumbers[id] : "Set number"}</small></button><button class="favorite-reorder" data-adv="favorite-up" data-id="${esc(id)}" ${i === 0 ? "disabled" : ""} aria-label="Move ${esc(c.name)} up"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 14 6-6 6 6"/></svg></button><button class="favorite-reorder" data-adv="favorite-down" data-id="${esc(id)}" ${i === state.favorites.length - 1 ? "disabled" : ""} aria-label="Move ${esc(c.name)} down"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 10 6 6 6-6"/></svg></button></div>` : "";
      }).join("") + (!state.favorites.length ? '<p class="panel-note">Add channels to Favorites from the channel menu.</p>' : ""), "library");
    }
    let visibilityKind = "groups", visibilityQuery = "";
    function visibilityPanel(kind = visibilityKind, q = visibilityQuery) {
      visibilityKind = kind;
      visibilityQuery = q;
      const p = ctx.getCatalog().playlists.find((p2) => p2.id === (editingId || ctx.getCatalog().activeId));
      if (!p) return toast("Add a playlist first.");
      const hidden = kind === "groups" ? p.hiddenGroups || [] : p.hiddenChannels || [];
      const all = kind === "groups" ? [...new Set(p.channels.map((c) => c.group))].map((name) => ({ id: name, name })) : p.channels;
      const filtered = all.filter((c) => normalizeSearch(c.name).includes(normalizeSearch(q)));
      panel("Channels and groups", button("Back to playlists", "playlists") + `<div class="menu-list"><button data-adv="show-groups">Groups</button><button data-adv="show-channels">Channels</button></div><label>Search<input id="visibility-search" value="${esc(q)}" placeholder="Filter ${kind}"></label><p class="panel-note">${Math.min(150, filtered.length)} / ${filtered.length} \xB7 Select a row to show or hide it.</p>` + filtered.slice(0, 150).map((c) => button(esc(c.name) + (hidden.includes(c.id) ? " \xB7 Hidden" : " \xB7 Visible"), "toggle-visible", `data-id="${esc(c.id)}"`)).join(""), "sources");
    }
    async function toggleVisibility(value) {
      const catalog = ctx.getCatalog(), target = editingId || catalog.activeId, p = catalog.playlists.find((p2) => p2.id === target);
      if (!p) return;
      const key = visibilityKind === "groups" ? "hiddenGroups" : "hiddenChannels", a = p[key] || [], next = a.includes(value) ? a.filter((x) => x !== value) : [...a, value];
      await ctx.commitCatalog(editPlaylist(catalog, target, { [key]: next }), false);
      visibilityPanel();
    }
    let managingGroup = "", groupFail = 0, groupBlockedUntil = 0, groupUnlocks = /* @__PURE__ */ new Map();
    let activeIdCache = null, channelsForCache = null;
    function activeGroupPlaylistId() {
      if (channelsForCache !== state.channels) {
        channelsForCache = state.channels;
        activeIdCache = ctx.getCatalog().activeId;
      }
      return activeIdCache;
    }
    function groupKey(group, playlistId) {
      return (playlistId || activeGroupPlaylistId()) + "|" + group;
    }
    function groupPlaylist(playlistId) {
      if (!playlistId || playlistId === activeGroupPlaylistId()) return { groupPins: state.groupPins || {}, groupNames: state.groupNames || {} };
      return ctx.getCatalog().playlists.find((p) => p.id === playlistId);
    }
    function isGroupLocked(group, playlistId) {
      var _a4, _b3;
      return !!((_b3 = (_a4 = groupPlaylist(playlistId)) == null ? void 0 : _a4.groupPins) == null ? void 0 : _b3[group]);
    }
    function groupAccessible(group, playlistId) {
      return !isGroupLocked(group, playlistId) || (groupUnlocks.get(groupKey(group, playlistId)) || 0) > Date.now();
    }
    function guardGroup(group, whenAllowed, playlistId = activeGroupPlaylistId()) {
      var _a4, _b3;
      if (groupAccessible(group, playlistId)) return false;
      pinAction = null;
      const label = ((_b3 = (_a4 = groupPlaylist(playlistId)) == null ? void 0 : _a4.groupNames) == null ? void 0 : _b3[group]) || group;
      ctx.modal("\u{1F512} " + label, `<form id="group-unlock-form"><p>Enter the group PIN to open this group.</p><label>Group PIN<input id="group-unlock-pin" type="password" inputmode="numeric" maxlength="6" autocomplete="off" required></label><p id="adv-status" role="status"></p><button type="submit" class="primary">Unlock group</button></form>`, `<button data-action="close" class="secondary">Cancel</button>`);
      groupPending = { group, whenAllowed, playlistId };
      return true;
    }
    let groupPending = null, groupExpiry = null;
    function scheduleExpiry() {
      clearTimeout(groupExpiry);
      const deadlines = [...groupUnlocks.values()];
      if (!deadlines.length) return;
      groupExpiry = setTimeout(() => {
        for (const [key, until] of groupUnlocks) if (until <= Date.now()) groupUnlocks.delete(key);
        const c = state.channels.find((c2) => c2.id === state.playing);
        if (c && !groupAccessible(c.group)) ctx.stopMedia();
        ctx.closeModal();
        ctx.refresh();
        scheduleExpiry();
      }, Math.max(1, Math.min(...deadlines) - Date.now()));
    }
    function selectGroup(group) {
      if (guardGroup(group, () => selectGroup(group))) return true;
      state.group = group;
      state.selected = null;
      ctx.refresh();
      document.dispatchEvent(new CustomEvent("tiviloom:group-selected", { detail: { group } }));
      return true;
    }
    async function verifyGroup() {
      var _a4, _b3;
      if (!groupPending) return;
      if (Date.now() < groupBlockedUntil) throw Error("Too many attempts. Wait 30 seconds.");
      const pin = $("#group-unlock-pin").value, pending = groupPending, record = (_b3 = (_a4 = groupPlaylist(pending.playlistId)) == null ? void 0 : _a4.groupPins) == null ? void 0 : _b3[pending.group];
      const valid = platform2.native ? (await platform2.request("verifyPIN", { pin, record })).valid : await checkPIN(pin, record);
      if (groupPending !== pending) return;
      if (!valid) {
        groupFail++;
        if (groupFail >= 3) {
          groupBlockedUntil = Date.now() + 3e4;
          groupFail = 0;
        }
        throw Error("Incorrect group PIN.");
      }
      groupFail = 0;
      groupUnlocks.set(groupKey(pending.group, pending.playlistId), Date.now() + 5 * 6e4);
      scheduleExpiry();
      groupPending = null;
      ctx.closeModal();
      pending.whenAllowed();
    }
    function openGroupProperties(group) {
      const playlist = ctx.getCatalog(), active = playlist.activeId;
      if (!active || !group || ["Ham\u0131s\u0131", "Sevimlil\u0259r", "History", "programs", "reminders"].includes(group)) {
        toast("Select a playlist category to edit its name or PIN.");
        return false;
      }
      editingId = active;
      managingGroup = group;
      if (guardGroup(group, () => groupPanel(), editingId)) return true;
      groupPanel();
      return true;
    }
    function groupList() {
      editingId = editingId || ctx.getCatalog().activeId;
      const p = ctx.getCatalog().playlists.find((x) => x.id === editingId);
      if (!p) return settings("sources");
      const groups = [...new Set(p.channels.map((c) => c.group))];
      panel("Manage groups", button("Back to playlists", "playlists") + '<p class="panel-note">Rename groups without changing the original source. A PIN protects entry and hides its channels outside the unlocked group.</p>' + groups.map((g) => {
        var _a4, _b3;
        return button(esc(((_a4 = p.groupNames) == null ? void 0 : _a4[g]) || g) + (((_b3 = p.groupPins) == null ? void 0 : _b3[g]) ? " \u{1F512}" : "") + `<small>${esc(g)}</small>`, "group-detail", `data-id="${esc(g)}"`);
      }).join(""), "sources");
    }
    function groupPanel() {
      var _a4, _b3, _c, _d;
      const p = ctx.getCatalog().playlists.find((x) => x.id === editingId), g = managingGroup;
      if (!p || !g) return groupList();
      panel("Group: " + (((_a4 = p.groupNames) == null ? void 0 : _a4[g]) || g), button("Back to groups", "group-list") + `<form id="group-rename-form"><label>Display name<input id="group-name" maxlength="80" value="${esc(((_b3 = p.groupNames) == null ? void 0 : _b3[g]) || g)}" required></label><button class="primary" type="submit">Save group name</button></form><form id="group-pin-form"><label>${((_c = p.groupPins) == null ? void 0 : _c[g]) ? "Change" : "Set"} group PIN (4\u20136 digits)<input id="group-new-pin" type="password" inputmode="numeric" maxlength="6" required></label><label>Confirm PIN<input id="group-confirm-pin" type="password" inputmode="numeric" maxlength="6" required></label><button class="primary" type="submit">Save group PIN</button></form>${((_d = p.groupPins) == null ? void 0 : _d[g]) ? button("Remove group PIN", "group-pin-remove") : ""}<p id="adv-status" role="status"></p>`, "sources");
    }
    async function groupChange(patch) {
      const c = ctx.getCatalog(), p = c.playlists.find((x) => x.id === editingId);
      if (!p) throw Error("Playlist missing.");
      await ctx.commitCatalog(editPlaylist(c, editingId, patch), false);
      if (c.activeId === editingId) {
        Object.assign(state, patch);
        groupUnlocks.clear();
        ctx.refresh();
      }
      groupPanel();
    }
    async function saveGroupRename() {
      const value = $("#group-name").value.trim();
      if (!value || value.length > 80) throw Error("Group name must contain 1\u201380 characters.");
      const p = ctx.getCatalog().playlists.find((x) => x.id === editingId);
      await groupChange({ groupNames: { ...p.groupNames, [managingGroup]: value } });
    }
    async function saveGroupPIN() {
      const pin = $("#group-new-pin").value;
      if (!/^\d{4,6}$/.test(pin) || pin !== $("#group-confirm-pin").value) throw Error("Enter matching 4\u20136 digit PINs.");
      const p = ctx.getCatalog().playlists.find((x) => x.id === editingId);
      const record = platform2.native ? (await platform2.request("hashPIN", { pin })).record : await makePIN(pin);
      await groupChange({ groupPins: { ...p.groupPins, [managingGroup]: record } });
    }
    async function removeGroupPIN() {
      const p = ctx.getCatalog().playlists.find((x) => x.id === editingId), next = { ...p.groupPins };
      delete next[managingGroup];
      await groupChange({ groupPins: next });
    }
    function lastChannel() {
      const previous = state.history.find((id) => id !== state.playing && state.channels.some((c) => c.id === id && c.type === "tv"));
      if (!previous) return toast("No previous channel yet.");
      ctx.closeModal();
      ctx.play(state.channels.find((c) => c.id === previous), state.full);
    }
    function remoteAction2(action2) {
      var _a4;
      const saved = (_a4 = state.prefs.remoteActions) == null ? void 0 : _a4[action2], mapped = remoteChoices.includes(saved) ? saved : action2;
      if (mapped === "last-channel") {
        lastChannel();
        return true;
      }
      if (mapped === "playlists") {
        ctx.settings("sources");
        return true;
      }
      if (mapped !== action2) {
        ctx.doAction(mapped);
        return true;
      }
      return false;
    }
    async function action(a, el) {
      if (["edit-playlist", "refresh-playlist", "toggle-playlist", "delete-playlist", "confirm-delete", "toggle-visible", "remove-pin"].includes(a) && guard(a === "remove-pin" ? "pin" : "settings", () => action(a, el))) return;
      if (a === "settings-root") return ctx.settings("root");
      if (a === "playlists") return ctx.settings("sources");
      if (a === "playlist-details") return playlistDetails(el.dataset.id);
      if (a === "edit-playlist") return editForm(el.dataset.field || "pl-name");
      if (a === "refresh-playlist") return refreshPlaylist(editingId);
      if (a === "toggle-playlist") {
        const c = ctx.getCatalog(), p = c.playlists.find((p2) => p2.id === editingId);
        await ctx.commitCatalog(editPlaylist(c, editingId, { enabled: p.enabled === false }), c.activeId === editingId);
        return playlistDetails(editingId);
      }
      if (a === "delete-playlist") {
        const p = ctx.getCatalog().playlists.find((p2) => p2.id === editingId);
        return ctx.modal("Delete playlist?", `<p>${esc(p.name)}</p><p>This removes the saved playlist, favorites and its local settings from this TV.</p>`, `<button class="primary" data-adv="confirm-delete">Delete playlist</button><button class="secondary" data-adv="cancel-delete">Cancel</button>`);
      }
      if (a === "cancel-delete") return playlistDetails(editingId);
      if (a === "confirm-delete") {
        await ctx.commitCatalog(deletePlaylist(ctx.getCatalog(), editingId), true);
        editingId = null;
        return settings("sources");
      }
      if (a === "visibility") {
        editingId = el.dataset.id || ctx.getCatalog().activeId;
        return visibilityPanel();
      }
      if (a === "show-groups") return visibilityPanel("groups", "");
      if (a === "show-channels") return visibilityPanel("channels", "");
      if (a === "toggle-visible") return toggleVisibility(el.dataset.id);
      if (a === "favorites") return favoritesPanel();
      if (a === "favorite-tools") return channelTools(state.channels.find((c) => c.id === el.dataset.id));
      if (a === "favorite-up" || a === "favorite-down") return reorder(state.channels.find((c) => c.id === el.dataset.id), a === "favorite-up" ? -1 : 1);
      if (a === "group-manager") {
        editingId = el.dataset.id || ctx.getCatalog().activeId;
        return groupList();
      }
      if (a === "group-list") return groupList();
      if (a === "group-detail") {
        managingGroup = el.dataset.id;
        if (guardGroup(managingGroup, () => groupPanel(), editingId)) return;
        return groupPanel();
      }
      if (a === "group-pin-remove") {
        if (guardGroup(managingGroup, () => removeGroupPIN(), editingId)) return;
        return removeGroupPIN();
      }
      if (a === "last-channel") return lastChannel();
      if (a === "remove-pin") {
        state.prefs.parental = null;
        state.prefs.lockSettings = false;
        ctx.save("prefs");
        await ctx.commitCatalog({ ...ctx.getCatalog(), playlists: ctx.getCatalog().playlists.map((p) => ({ ...p, lockedChannels: [] })) }, false);
        return settings("parental");
      }
    }
    document.addEventListener("click", (e) => {
      const el = e.target.closest("[data-adv]");
      if (!el) return;
      e.preventDefault();
      Promise.resolve(action(el.dataset.adv, el)).catch((e2) => error(e2.message));
    });
    document.addEventListener("submit", (e) => {
      const form = e.target;
      if (!["playlist-edit-form", "number-form", "logo-form", "pin-form", "parental-form", "group-rename-form", "group-pin-form", "group-unlock-form"].includes(form.id)) return;
      e.preventDefault();
      const submit = form.querySelector('[type="submit"]');
      if (submit.disabled) return;
      submit.disabled = true;
      (async () => {
        if (form.id === "playlist-edit-form") return savePlaylist();
        if (form.id === "pin-form") return verifyPIN();
        if (form.id === "group-unlock-form") return verifyGroup();
        if (form.id === "group-rename-form") return saveGroupRename();
        if (form.id === "group-pin-form") return saveGroupPIN();
        if (form.id === "number-form") {
          state.channelNumbers = assignNumber(state.channelNumbers || {}, channelId, $("#favorite-number").value.trim(), state.favorites);
          await saveOptions();
          ctx.closeModal();
          return toast("Favorite number saved.");
        }
        if (form.id === "logo-form") {
          const url = $("#channel-logo-url").value.trim();
          if (url) {
            const u = new URL(url);
            if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) throw Error("Use an HTTP or HTTPS logo address.");
          }
          state.logoOverrides = { ...state.logoOverrides, [channelId]: url };
          await saveOptions();
          ctx.closeModal();
          return;
        }
        const pin = $("#new-pin").value;
        if (pin !== $("#confirm-pin").value) throw Error("PIN values do not match.");
        const pinForm = $("#new-pin").closest("form"), lock = $("#lock-settings").checked, record = platform2.native ? (await platform2.request("hashPIN", { pin })).record : await makePIN(pin);
        if (!pinForm.isConnected) return;
        state.prefs.parental = record;
        state.prefs.lockSettings = lock;
        unlockedUntil = Date.now() + 5 * 6e4;
        ctx.save("prefs");
        settings("parental");
        toast("PIN protection saved.");
      })().catch((e2) => error(e2.message)).finally(() => {
        if (submit.isConnected) submit.disabled = false;
      });
    });
    document.addEventListener("change", (e) => {
      if (e.target.dataset.updateStart) {
        ctx.commitCatalog(editPlaylist(ctx.getCatalog(), e.target.dataset.updateStart, { updateOnStart: e.target.checked }), false).catch((e2) => error(e2.message));
      }
      if (e.target.dataset.remote) {
        state.prefs.remoteActions = { ...state.prefs.remoteActions, [e.target.dataset.remote]: e.target.value };
        ctx.save("prefs");
      }
      if (e.target.matches("[data-long-ok]")) {
        state.prefs.longOK = e.target.value;
        ctx.save("prefs");
      }
    });
    document.addEventListener("input", (e) => {
      if (e.target.id === "visibility-search") {
        const value = e.target.value;
        clearTimeout(e.target._timer);
        e.target._timer = setTimeout(() => {
          if (!e.target.isConnected) return;
          visibilityPanel(visibilityKind, value);
          const f = $("#visibility-search");
          f.focus();
          f.setSelectionRange(value.length, value.length);
        }, 350);
      }
    });
    document.addEventListener("keydown", (e) => {
      var _a4, _b3;
      if (e.target.matches("#modal-root input") && e.key === "Enter") {
        const submit = (_a4 = e.target.closest("form")) == null ? void 0 : _a4.querySelector('[type="submit"]');
        if (submit) {
          e.preventDefault();
          e.stopImmediatePropagation();
          const fields = [...e.target.closest("form").querySelectorAll("input,select,button")].filter((x) => !x.disabled);
          (_b3 = fields[fields.indexOf(e.target) + 1]) == null ? void 0 : _b3.focus();
        }
      }
    }, true);
    function clearDigits() {
      var _a4;
      digits = "";
      clearTimeout(digitTimer);
      clearTimeout(hudTimer);
      (_a4 = $("#number-hud")) == null ? void 0 : _a4.remove();
    }
    function numberHUD(value, lookup, committing = false) {
      clearTimeout(hudTimer);
      let hud = $("#number-hud");
      if (!hud) {
        hud = document.createElement("section");
        hud.id = "number-hud";
        hud.setAttribute("role", "status");
        $("#tv-screen").append(hud);
      }
      const c = lookup.exact;
      hud.classList.toggle("unassigned", !c);
      hud.innerHTML = '<span class="number-hud-digits">' + esc(value) + "</span>" + (c ? ctx.renderLogo(c) : '<span class="number-hud-placeholder" aria-hidden="true">\u2014</span>') + '<span class="number-hud-copy"><strong>' + esc(c ? c.name : lookup.candidates.length ? "Continue entering number" : "Unassigned number") + "</strong><small>" + esc(committing ? "Switching channel\u2026" : c ? "OK to watch \xB7 or wait" : lookup.candidates.length ? "Enter the remaining digits" : "Choose a number in Favorites") + "</small></span>";
    }
    function commitDigits() {
      const value = digits, lookup = favoriteNumberLookup(state, value), c = lookup.exact;
      digits = "";
      clearTimeout(digitTimer);
      if (c) {
        numberHUD(value, lookup, true);
        ctx.closeModal();
        ctx.focusNumberChannel(c);
        ctx.play(c, state.full);
        hudTimer = setTimeout(() => {
          var _a4;
          return (_a4 = $("#number-hud")) == null ? void 0 : _a4.remove();
        }, 2200);
      } else {
        clearDigits();
        toast("No favorite is assigned to " + Number(value) + ".");
      }
    }
    window.addEventListener("keydown", (e) => {
      if (e.target.matches("input,textarea,select") || $("#modal-root").children.length || !$("#wizard").hidden || !$("#welcome").hidden) return;
      if (digits && (e.key === "Enter" || e.keyCode === 13)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return commitDigits();
      }
      if (digits && ["Escape", "Backspace", "Unidentified"].includes(e.key) && (e.key !== "Unidentified" || e.keyCode === 461)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return clearDigits();
      }
      const digit = numberKey(e);
      if (digit === null) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      digits = (digits + digit).slice(-4);
      numberHUD(digits, favoriteNumberLookup(state, digits));
      clearTimeout(digitTimer);
      digitTimer = setTimeout(commitDigits, 1100);
    }, true);
    const due = (p) => p.enabled !== false && p.sourceURL && p.updateHours > 0 && Date.now() - (p.lastUpdated || 0) >= p.updateHours * 36e5 && Date.now() - (refreshAttempts.get(p.id) || 0) > 6e5;
    const schedule = setInterval(() => {
      if (document.hidden || $("#modal-root").children.length || !$("#wizard").hidden) return;
      const p = ctx.getCatalog().playlists.find(due);
      if (p) refreshPlaylist(p.id, true);
    }, 6e4);
    function start() {
      const p = activePlaylist(ctx.getCatalog());
      if ((p == null ? void 0 : p.updateOnStart) && p.sourceURL) refreshPlaylist(p.id, true);
    }
    function suspend() {
      unlockedUntil = 0;
      groupUnlocks.clear();
      clearTimeout(groupExpiry);
      clearDigits();
    }
    return { settings, playlistDetails, channelTools, openGroupProperties, guard, guardGroup, isGroupLocked, groupAccessible, selectGroup, remoteAction: remoteAction2, lastChannel, start, suspend, longOK: () => {
      const a = remoteChoices.includes(state.prefs.longOK) ? state.prefs.longOK : "context";
      if (a === "context") ctx.context();
      else if (a === "last-channel") lastChannel();
      else ctx.doAction(a);
    } };
  }

  // src/logos.mjs
  function mountLogos(platform2) {
    const memory = /* @__PURE__ */ new Map(), pending = [], seen = /* @__PURE__ */ new WeakSet();
    let active = 0;
    const db = new Promise((resolve) => {
      try {
        const req = indexedDB.open("TiviLoomLogos", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("images", { keyPath: "url" });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    async function cached(url) {
      try {
        const d = await db;
        if (!d) return null;
        return await new Promise((resolve) => {
          const req = d.transaction("images").objectStore("images").get(url);
          req.onsuccess = () => {
            var _a4;
            return resolve(((_a4 = req.result) == null ? void 0 : _a4.expires) > Date.now() ? req.result.data : null);
          };
          req.onerror = () => resolve(null);
        });
      } catch {
        return null;
      }
    }
    async function store(url, data) {
      try {
        const d = await db;
        if (!d) return;
        const tx = d.transaction("images", "readwrite"), s = tx.objectStore("images");
        s.put({ url, data, expires: Date.now() + 7 * 864e5 });
        const keys = s.getAllKeys();
        keys.onsuccess = () => {
          for (const key of keys.result.slice(0, Math.max(0, keys.result.length - 200))) s.delete(key);
        };
      } catch {
      }
    }
    async function fetchLogo(url) {
      const ticket = await platform2.request("fetchImage", { url });
      const parts = [];
      try {
        for (let i = 0; i < ticket.chunks; i++) parts.push((await platform2.request("readSource", { ticket: ticket.ticket, index: i })).text);
        return parts.join("");
      } finally {
        platform2.request("releaseSource", { ticket: ticket.ticket }).catch(() => {
        });
      }
    }
    async function process(img) {
      const url = img.dataset.logoUrl;
      if (!url) return;
      let data = memory.get(url);
      if ((data == null ? void 0 : data.failed) && data.until > Date.now()) return;
      if ((data == null ? void 0 : data.direct) && data.until > Date.now()) {
        img.referrerPolicy = "no-referrer";
        img.src = data.direct;
        return;
      }
      if (!data || data.failed || data.direct) {
        data = await cached(url);
        if (!data) {
          try {
            data = await fetchLogo(url);
            store(url, data);
          } catch {
            memory.set(url, { direct: url, until: Date.now() + 30 * 6e4 });
            img.referrerPolicy = "no-referrer";
            img.src = url;
            return;
          }
        }
        memory.set(url, data);
        while (memory.size > 200) memory.delete(memory.keys().next().value);
      }
      if (img.isConnected) img.src = data;
    }
    function drain() {
      while (active < 3 && pending.length) {
        const img = pending.shift();
        if (!img.isConnected) continue;
        active++;
        process(img).catch(() => {
        }).finally(() => {
          active--;
          drain();
        });
      }
    }
    const observer = new IntersectionObserver((items) => {
      for (const item of items) if (item.isIntersecting) {
        observer.unobserve(item.target);
        pending.push(item.target);
      }
      drain();
    }, { rootMargin: "100px" });
    function scan() {
      document.querySelectorAll("img[data-logo-url]").forEach((img) => {
        if (seen.has(img)) return;
        seen.add(img);
        img.onload = () => {
          img.parentElement.classList.add("logo-ready");
        };
        img.onerror = () => {
          memory.set(img.dataset.logoUrl, { failed: true, until: Date.now() + 30 * 6e4 });
          img.hidden = true;
          img.parentElement.classList.remove("logo-ready");
        };
        observer.observe(img);
      });
    }
    let queued = false;
    new MutationObserver(() => {
      if (!queued) {
        queued = true;
        queueMicrotask(() => {
          queued = false;
          scan();
        });
      }
    }).observe(document.querySelector("#tv-screen"), { childList: true, subtree: true });
    scan();
    return { refresh: scan };
  }

  // src/press-gesture.mjs
  function createPressGesture({ short, long, repeat = () => {
  }, delay = 650, setTimer = setTimeout, clearTimer = clearTimeout }) {
    let held = null, timer = null;
    function cancel() {
      if (timer !== null) clearTimer(timer);
      timer = null;
      held = null;
    }
    function down(key, target) {
      if ((held == null ? void 0 : held.key) === key) {
        if (held.long) repeat(key, held.target);
        return;
      }
      cancel();
      const current = held = { key, target, long: false };
      timer = setTimer(() => {
        timer = null;
        if (held !== current) return;
        current.long = true;
        long(key, target);
      }, delay);
    }
    function up(key) {
      if ((held == null ? void 0 : held.key) !== key) return false;
      const current = held;
      cancel();
      if (!current.long) short(key, current.target);
      return true;
    }
    return { down, up, cancel, isHeld: (key) => (held == null ? void 0 : held.key) === key };
  }

  // src/playback.mjs
  function nativeHLSSupported(video) {
    return ["application/vnd.apple.mpegurl", "application/x-mpegURL"].some((type) => {
      var _a4;
      return !!((_a4 = video.canPlayType) == null ? void 0 : _a4.call(video, type));
    });
  }
  function streamKind(value) {
    const url = new URL(value, "https://local.invalid/");
    if (/\.m3u8?$/i.test(url.pathname) || /^(m3u8?|hls)$/i.test(url.searchParams.get("output") || url.searchParams.get("format") || "")) return "hls";
    if (/\.(ts|m2ts)$/i.test(url.pathname) || url.searchParams.get("output") === "ts") return "ts";
    if (/\.(mp4|m4v|webm|mkv|mov|mp3|aac)$/i.test(url.pathname)) return "file";
    return "unknown";
  }
  function playbackEngine(video, url, { native: native2 = false, Hls: Hls2, forceHls = false } = {}) {
    var _a4;
    const kind = streamKind(url), mse = !!((_a4 = Hls2 == null ? void 0 : Hls2.isSupported) == null ? void 0 : _a4.call(Hls2));
    if (forceHls && mse && ["hls", "unknown"].includes(kind)) return "hlsjs";
    if (kind === "hls" && mse && (!native2 || !nativeHLSSupported(video))) return "hlsjs";
    return "native";
  }
  function playbackError(error, { url = "", hls = null } = {}) {
    var _a4, _b3;
    const status = Number(((_a4 = hls == null ? void 0 : hls.response) == null ? void 0 : _a4.code) || ((_b3 = hls == null ? void 0 : hls.networkDetails) == null ? void 0 : _b3.status) || 0);
    const detail = String((hls == null ? void 0 : hls.details) || "");
    const code = Number((error == null ? void 0 : error.code) || 0);
    if (status === 401 || status === 403) return `Yay\u0131m serveri giri\u015Fi r\u0259dd etdi (HTTP ${status}). Abun\u0259ni v\u0259 ba\u011Flant\u0131 limitini yoxlay\u0131n.`;
    if (status === 404) return "Yay\u0131m serverind\u0259 bu kanal tap\u0131lmad\u0131 (HTTP 404). Pleylisti yenil\u0259yin.";
    if (status >= 500) return `Yay\u0131m serveri x\u0259ta qaytard\u0131 (HTTP ${status}). Sonra yenid\u0259n s\u0131nay\u0131n.`;
    if ((error == null ? void 0 : error.name) === "NotAllowedError") return "Oynatmaq \xFC\xE7\xFCn pultda OK / Play d\xFCym\u0259sini bas\u0131n.";
    if ((hls == null ? void 0 : hls.type) === "networkError" || code === 2) return "Yay\u0131m y\xFCkl\u0259nm\u0259di. Server, \u015F\u0259b\u0259k\u0259 v\u0259 ya CORS m\u0259hdudiyy\u0259ti ola bil\u0259r. Ba\u011Flant\u0131n\u0131 v\u0259 abun\u0259ni yoxlay\u0131n.";
    if (streamKind(url) === "ts") return "Bu TS yay\u0131m\u0131 haz\u0131rk\u0131 pleyerd\u0259 a\xE7\u0131la bilm\u0259di. Provayderin HLS / M3U8 \xE7\u0131x\u0131\u015F\u0131n\u0131 v\u0259 ya Xtream giri\u015Fini s\u0131nay\u0131n.";
    if (code === 3 || /bufferAddCodec|bufferAppend|fragParsing/.test(detail)) return "Video v\u0259 ya s\u0259s kodeki bu m\xFChitd\u0259 a\xE7\u0131la bilm\u0259di. H.264 + AAC formatl\u0131 HLS yay\u0131m\u0131 il\u0259 yoxlay\u0131n.";
    if (code === 4 || (error == null ? void 0 : error.name) === "NotSupportedError") return "Yay\u0131m format\u0131 tan\u0131nmad\u0131 v\u0259 ya m\u0259nb\u0259 a\xE7\u0131lmad\u0131 (MEDIA 4). HLS / M3U8 \xE7\u0131x\u0131\u015F\u0131 il\u0259 yoxlay\u0131n; simulator v\u0259 real TV d\u0259st\u0259yi f\u0259rql\u0259n\u0259 bil\u0259r.";
    return "Video a\xE7\u0131la bilm\u0259di. M\u0259nb\u0259, format v\u0259 abun\u0259ni yoxlay\u0131n. Yenid\u0259n c\u0259hd \xFC\xE7\xFCn \u25B6 d\xFCym\u0259sini bas\u0131n.";
  }

  // src/platform.mjs
  var SERVICE = "luna://com.tiviloom.app.source";
  function remoteAction(code) {
    return { 461: "back", 415: "play", 19: "pause", 413: "stop", 417: "forward", 412: "rewind", 33: "previous", 34: "next", 403: "favorite", 404: "guide", 405: "search", 406: "context" }[code] || null;
  }
  function validMediaURL(value, base = location.href) {
    const local = value.startsWith("/assets/") ? value.slice(1) : value;
    const url = new URL(local, base), appRoot = new URL("./", base).href;
    if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) return url.href;
    if (url.protocol === "file:" && url.href.startsWith(appRoot + "assets/")) return url.href;
    throw Error("Unsupported media address.");
  }
  var isPhone = !!window.TiviLoomNative || new URLSearchParams(location.search).get("layout") === "phone";
  var _a, _b;
  (_b = (_a = globalThis.document) == null ? void 0 : _a.documentElement) == null ? void 0 : _b.classList.toggle("phone", isPhone);
  if (isPhone && globalThis.document) document.title = "TiviLoom";
  var native = !!(window.PalmServiceBridge || window.PalmSystem || window.webOSSystem);
  if (native && !isPhone) document.documentElement.classList.add("low-power-tv");
  var sourceBases = /* @__PURE__ */ new Map();
  var nativeSequence = 0;
  var nativePending = /* @__PURE__ */ new Map();
  var _a2;
  (_a2 = window.addEventListener) == null ? void 0 : _a2.call(window, "TiviLoomNativeResult", (event) => {
    const data = event.detail, entry = nativePending.get(data == null ? void 0 : data.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    nativePending.delete(data.id);
    if (data.error) entry.reject(Error(data.error));
    else entry.resolve(data.result);
  });
  function request(method, parameters = {}) {
    const requestTimeout = method === "fetchSource" ? 15e4 : 35e3;
    if (window.TiviLoomNative) return new Promise((resolve, reject) => {
      const id = String(++nativeSequence);
      const timer = setTimeout(() => {
        nativePending.delete(id);
        reject(Error("The request timed out. Check your connection."));
      }, requestTimeout);
      nativePending.set(id, { resolve, reject, timer });
      try {
        window.TiviLoomNative.invoke(id, method, JSON.stringify(parameters));
      } catch {
        clearTimeout(timer);
        nativePending.delete(id);
        reject(Error("The source service is unavailable."));
      }
    });
    if (!native && /^https?:$/.test(location.protocol)) return fetch("/__service/" + method, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parameters) }).then(async (r) => {
      const data = await r.json();
      if (!r.ok || data.returnValue === false) throw Error(data.errorText || "Source service failed.");
      return data;
    });
    return new Promise((resolve, reject) => {
      var _a4, _b3;
      if (!((_b3 = (_a4 = window.webOS) == null ? void 0 : _a4.service) == null ? void 0 : _b3.request)) return reject(Error("The TV source service is unavailable. Install the complete TiviLoom package."));
      let handle;
      const timer = setTimeout(() => {
        handle == null ? void 0 : handle.cancel();
        reject(Error("The TV source service did not respond. Try again."));
      }, requestTimeout);
      handle = webOS.service.request(SERVICE, { method, parameters, onSuccess: (data) => {
        clearTimeout(timer);
        if (data.returnValue === false) reject(Error(data.errorText));
        else resolve(data);
      }, onFailure: (error) => {
        clearTimeout(timer);
        reject(Error(error.errorText || "The TV source service is unavailable."));
      } });
    });
  }
  async function loadSource(url, options = {}) {
    const source = await request("fetchSource", { url, ...options });
    sourceBases.set(url, source.finalURL || url);
    if (!source.ticket || !Number.isInteger(source.chunks) || source.chunks < 0 || source.chunks > 5e3) throw Error("Invalid source service response.");
    const parts = new Array(source.chunks);
    let index = 0;
    try {
      const worker = async () => {
        while (index < source.chunks) {
          const i = index++;
          const part = await request("readSource", { ticket: source.ticket, index: i });
          parts[i] = part.text;
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, source.chunks) }, worker));
      return parts.join("");
    } finally {
      await request("releaseSource", { ticket: source.ticket }).catch(() => {
      });
    }
  }
  var platform = {
    isTV: !isPhone,
    isPhone,
    native,
    fileSupport: isPhone,
    get nativeHLS() {
      return nativeHLSSupported(document.createElement("video"));
    },
    sourceBase: (url) => sourceBases.get(url) || url,
    request,
    async api(path, body) {
      if (path === "source") return loadSource(body.url, { userAgent: body.userAgent || "" });
      if (path === "epg") return JSON.parse(await loadSource(body.url, { userAgent: body.userAgent || "", kind: "epg" }));
      if (path === "epgFile" && window.TiviLoomNative) return JSON.parse(await loadSource("", { kind: "epg", localFileName: body.name }));
      if (path === "media") {
        const url = validMediaURL(body.url);
        return window.TiviLoomNative ? request("prepareMedia", { url, userAgent: body.userAgent || "", referer: body.referer || "" }) : { url };
      }
      if (path === "probe") return request("probeMedia", { url: body.url, userAgent: body.userAgent || "", referer: body.referer || "" });
      throw Error("Unknown TV action.");
    },
    assetURL: (value) => validMediaURL(value),
    exit() {
      var _a4;
      if (window.TiviLoomNative) return window.TiviLoomNative.close();
      if (native && ((_a4 = window.webOS) == null ? void 0 : _a4.platformBack)) webOS.platformBack();
      else {
        const toast = document.querySelector("#toast");
        toast.textContent = "LG TV: exit confirmation opens here.";
        toast.hidden = false;
        setTimeout(() => {
          toast.hidden = true;
        }, 3500);
      }
    }
  };
  function bindRemote(handlers) {
    window.addEventListener("TiviLoomAndroidBack", () => handlers.back());
    window.addEventListener("TiviLoomAndroidSuspend", () => handlers.suspend());
    window.addEventListener("TiviLoomAndroidResume", () => handlers.resume());
    let previewFocus = null;
    const backPress = createPressGesture({ short: () => handlers.back(), long: () => {
      var _a4;
      return ((_a4 = handlers.longBack) == null ? void 0 : _a4.call(handlers)) || void 0;
    } });
    if (!native) document.addEventListener("focusin", (event) => {
      if (event.target.matches("button,input,select,textarea")) previewFocus = event.target;
    });
    window.addEventListener("keydown", (event) => {
      const action = remoteAction(event.keyCode || event.which) || (!native && event.key === "Escape" ? "back" : null);
      if (!action) return;
      if (action !== "back" && (event.target.matches("input,textarea,select") || document.querySelector("#modal-root").children.length || !document.querySelector("#wizard").hidden || !document.querySelector("#welcome").hidden)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (action === "back") backPress.down("back", event.target);
      else if (!event.repeat) handlers.action(action);
    }, true);
    window.addEventListener("keyup", (event) => {
      if (remoteAction(event.keyCode || event.which) === "back" || !native && event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        backPress.up("back");
      }
    }, true);
    window.addEventListener("blur", () => backPress.cancel());
    let hidden = false;
    const changed = () => {
      var _a4, _b3;
      if ((_b3 = (_a4 = window.TiviLoomNative) == null ? void 0 : _a4.isPickingFile) == null ? void 0 : _b3.call(_a4)) return;
      const value = !!(document.hidden || document.webkitHidden);
      if (value && !hidden) {
        hidden = true;
        backPress.cancel();
        handlers.suspend();
      } else if (!value && hidden) {
        hidden = false;
        handlers.resume();
      }
    };
    document.addEventListener("visibilitychange", changed);
    document.addEventListener("webkitvisibilitychange", changed);
    document.addEventListener("webOSRelaunch", () => {
      if (hidden) {
        hidden = false;
        handlers.resume();
      }
    });
    if (!native) window.addEventListener("message", (event) => {
      var _a4, _b3;
      if (event.origin !== location.origin || event.source !== window.parent || ((_a4 = event.data) == null ? void 0 : _a4.type) !== "TiviLoomPreview") return;
      if (event.data.action === "suspend") {
        handlers.suspend();
        return;
      }
      if (event.data.action === "resume") {
        handlers.resume();
        return;
      }
      const code = Number(event.data.code), keys = { 13: "Enter", 37: "ArrowLeft", 38: "ArrowUp", 39: "ArrowRight", 40: "ArrowDown", 461: "Unidentified", 415: "MediaPlay", 19: "Pause", 413: "MediaStop", 403: "ColorF0Red", 404: "ColorF1Green", 405: "ColorF2Yellow", 406: "ColorF3Blue" };
      if (code >= 48 && code <= 57) keys[code] = String(code - 48);
      if (!keys[code]) return;
      const target = (previewFocus == null ? void 0 : previewFocus.isConnected) && previewFocus.offsetParent !== null ? previewFocus : document.activeElement || document.body;
      (_b3 = target.focus) == null ? void 0 : _b3.call(target, { preventScroll: true });
      const down = new KeyboardEvent("keydown", { key: keys[code], keyCode: code, which: code, bubbles: true, cancelable: true });
      target.dispatchEvent(down);
      if (code === 13 && !down.defaultPrevented && target.matches("button")) target.click();
      target.dispatchEvent(new KeyboardEvent("keyup", { key: keys[code], keyCode: code, which: code, bubbles: true, cancelable: true }));
    });
    if (!native && window.parent !== window) window.parent.postMessage({ type: "TiviLoomPreviewReady" }, location.origin);
  }

  // src/recent-channels.mjs
  function recentChannels(channels, history, current, { hiddenChannels = [], hiddenGroups = [] } = {}) {
    const byId = new Map(channels.filter((c) => c.type === "tv" && !hiddenChannels.includes(c.id) && !hiddenGroups.includes(c.group)).map((c) => [c.id, c]));
    return [...new Set(history)].filter((id) => id !== current && byId.has(id)).slice(0, 20).map((id) => byId.get(id));
  }

  // src/tv-ui.mjs
  function mountTVUI(ctx) {
    const { state, $, $$, esc, fmt, mins, programAt, channelPrograms, currentChannel, visibleChannels, api, persistLibrary, video, toast } = ctx;
    const stage = $("#tv-screen"), app = $("#app");
    const paths = { microphone: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>', search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>', tv: '<rect x="2" y="4" width="20" height="14" rx="1"/><path d="M8 21h8M12 18v3"/>', film: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4"/>', bookmark: '<path d="M5 3h14v19l-7-5-7 5z"/>', trash: '<path d="M5 6h14M9 3h6M7 6v15h10V6M10 10v7M14 10v7"/>', settings: '<path d="M9.5 3h5l.5 2.5 2 1.2 2.4-.8 2.5 4.2-1.9 1.7v2.4l1.9 1.7-2.5 4.2-2.4-.8-2 1.2-.5 2.5h-5L9 20.5l-2-1.2-2.4.8-2.5-4.2L4 14.2v-2.4l-1.9-1.7 2.5-4.2 2.4.8 2-1.2z" transform="translate(0 -1)"/><circle cx="12" cy="12" r="3"/>', list: '<path d="M8 5h14M8 12h14M8 19h14"/><circle cx="3" cy="5" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="3" cy="19" r="1"/>', star: '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>', history: '<path d="M3 11a9 9 0 1 1 1 6M3 5v6h6M12 7v6l4 2"/>', grid: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/>', pip: '<rect x="2" y="4" width="20" height="16" rx="1"/><path d="M12 11h7v6h-7z"/>', play: '<path d="m8 4 13 8-13 8z"/>', pause: '<path d="M8 4v16M16 4v16"/>', volume: '<path d="M3 9h4l5-5v16l-5-5H3zM16 7a7 7 0 0 1 0 10M19 4a11 11 0 0 1 0 16"/>', screen: '<rect x="2" y="5" width="20" height="14" rx="1"/>', captions: '<rect x="2" y="5" width="20" height="14" rx="1"/><path d="M10 9H7v6h3M18 9h-3v6h3"/>', link: '<path d="M10 5H7a7 7 0 0 0 0 14h3M14 5h3a7 7 0 0 1 0 14h-3M7 12h10"/>', add: '<path d="M1 4h15M1 10h15M1 16h10M19 10v14M12 17h14"/>', download: '<path d="M9 1h6v12h5l-8 8-8-8h5zM4 24h16"/>', chevron: '<path d="m9 4 8 8-8 8z"/>' };
    const icon = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[n] || paths.tv}</svg>`;
    const localDate = (t) => {
      const d = new Date(t);
      return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()] + ", " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()] + " " + d.getDate() + ", " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    };
    let seriesShown = [], mediaPage = 0, mediaSignature = "", seriesEpisodes = [], seriesName = "";
    const PAGE_SIZE = 60;
    let wizardOrigin = "guide";
    let nav = 0, welcome = false, wizard = null, wizardCounter = 0, listMode = false, listOrigin = false;
    function scale() {
      stage.style.setProperty("--tv-scale", Math.min(innerWidth / 1280, innerHeight / 720));
    }
    window.addEventListener("resize", scale);
    scale();
    $(".rail").innerHTML = `<button class="drawer-brand" data-tv="home" aria-label="TiviLoom home"><img src="assets/logo.png" alt=""><span class="word">TiviLoom</span></button>${[["search", "Search"], ["guide", "TV"], ["movies", "Movies"], ["series", "Series"], ["favorites", "My list"]].map(([a, l]) => `<button data-tv="nav-${a}" class="${a === "guide" ? "active" : ""}" aria-label="${l}">${icon({ guide: "tv", movies: "film", favorites: "bookmark" }[a] || a)}<span>${l}</span></button>`).join("")}<div class="rail-spacer"></div><button class="drawer-bottom" data-tv="settings" aria-label="Settings">${icon("settings")}<span>Settings</span></button>`;
    if (ctx.platform.isPhone) {
      $(".rail").innerHTML = `<button data-tv="nav-guide" class="active" aria-label="Live TV">${icon("tv")}<span>Live TV</span></button><button data-tv="nav-series" aria-label="Series">${icon("film")}<span>Series</span></button><button data-tv="nav-movies" aria-label="Movies">${icon("film")}<span>Movies</span></button><button data-tv="nav-search" aria-label="Search">${icon("search")}<span>Search</span></button>`;
      const header = document.createElement("header");
      header.id = "mobile-header";
      header.innerHTML = `<button data-tv="groups" aria-label="Channel groups">${icon("list")}</button><button class="mobile-brand" data-tv="home"><img src="assets/logo.png" alt="TiviLoom"></button><button data-tv="settings" aria-label="Settings">${icon("settings")}</button>`;
      app.prepend(header);
      document.addEventListener("click", (event) => {
        const tools = event.target.closest("[data-mobile-channel-tools]");
        if (tools) {
          const c = state.channels.find((c2) => c2.id === tools.dataset.mobileChannelTools);
          if (c) ctx.advanced.channelTools(c);
          return;
        }
        if (!event.target.closest('[data-mobile="favorites"]')) return;
        ctx.navigate("guide");
        state.group = "Sevimlil\u0259r";
        ctx.refresh();
        setNav(0, false);
      });
      let touchStart = null, suppressTapUntil = 0;
      const touchPress = createPressGesture({ short: () => {
      }, long: (_, button) => {
        suppressTapUntil = Date.now() + 1e3;
        const c = state.channels.find((c2) => c2.id === button.dataset.channel);
        if (c) ctx.advanced.channelTools(c);
      } });
      document.addEventListener("pointerdown", (event) => {
        const button = event.target.closest(".channel-name");
        if (!button || event.pointerType === "mouse") return;
        touchStart = { x: event.clientX, y: event.clientY };
        touchPress.down("touch", button);
      });
      document.addEventListener("pointermove", (event) => {
        if (touchStart && Math.hypot(event.clientX - touchStart.x, event.clientY - touchStart.y) > 10) {
          touchPress.cancel();
          touchStart = null;
        }
      }, { passive: true });
      document.addEventListener("pointerup", () => {
        touchPress.up("touch");
        touchStart = null;
      });
      document.addEventListener("pointercancel", () => {
        touchPress.cancel();
        touchStart = null;
      });
      document.addEventListener("click", (event) => {
        if (Date.now() < suppressTapUntil && event.target.closest(".channel-name")) {
          event.preventDefault();
          event.stopImmediatePropagation();
          suppressTapUntil = 0;
        }
      }, true);
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
          touchPress.cancel();
          touchStart = null;
        }
      });
    }
    if (ctx.platform.isPhone) {
      const scrim = document.createElement("button");
      scrim.id = "phone-group-scrim";
      scrim.setAttribute("aria-label", "Close channel groups");
      scrim.hidden = true;
      app.append(scrim);
      scrim.addEventListener("click", () => setNav(0, false));
      document.addEventListener("tiviloom:group-selected", () => setNav(0, false));
      $("#preview-play").dataset.action = "expand-player";
      $("#preview-play").setAttribute("aria-label", "Full screen");
      $("#preview-play").textContent = "\u26F6";
    }
    const edge = document.createElement("button");
    edge.className = "edge-menu";
    edge.dataset.tv = "groups";
    edge.setAttribute("aria-label", "Show channel groups");
    edge.textContent = "\u2039";
    app.append(edge);
    function setNav(n, focus = true) {
      var _a4, _b3, _c;
      nav = Math.max(0, Math.min(ctx.platform.isPhone ? 1 : 2, n));
      if (!ctx.platform.isPhone && nav === 1 && !state.prefs.groups) nav = 2;
      app.dataset.nav = nav;
      const scrim = $("#phone-group-scrim");
      if (scrim) scrim.hidden = nav === 0;
      if (focus) {
        if (nav === 1) (_a4 = $("#groups .group-button.active") || $("#groups .group-button")) == null ? void 0 : _a4.focus({ preventScroll: true });
        if (nav === 2) (_b3 = $(".rail button.active")) == null ? void 0 : _b3.focus({ preventScroll: true });
        if (nav === 0) (_c = $(".movie-card") || $$(".programme.selected")[0]) == null ? void 0 : _c.focus({ preventScroll: true });
      }
    }
    function groupLabel(g) {
      var _a4;
      if (g === "programs") return "My TV programs";
      if (g === "reminders") return "My reminders";
      if (state.view === "movies" && g === "Sevimlil\u0259r") return "My list";
      return g === "Ham\u0131s\u0131" ? state.view === "movies" ? "All movies" : state.view === "series" ? "All series" : "All channels" : g === "Sevimlil\u0259r" ? "Favorites" : ((_a4 = state.groupNames) == null ? void 0 : _a4[g]) || g;
    }
    let lastGroupMarkup = "";
    let groupCache = null;
    function groups() {
      const hidden = state.hiddenGroups || [];
      const signature = state.view + "|" + hidden.join("");
      if (groupCache && groupCache.channels === state.channels && groupCache.signature === signature) return groupCache.value;
      let result;
      if (state.view === "mylist") result = ["programs", "reminders"];
      else {
        const seen = /* @__PURE__ */ new Set(), type = state.view === "movies" ? "movie" : state.view === "series" ? "series" : "tv", hiddenSet = new Set(hidden);
        for (const c of state.channels) if (c.type === type && !hiddenSet.has(c.group)) seen.add(c.group);
        result = ["Sevimlil\u0259r", ...["movies", "series"].includes(state.view) ? ["Continue Watching", ...state.view === "movies" ? ["History", "Recently Added"] : []] : [], "Ham\u0131s\u0131", ...seen];
      }
      groupCache = { channels: state.channels, signature, value: result };
      return result;
    }
    function renderGroups() {
      var _a4, _b3, _c, _d, _e, _f;
      $('.rail [data-tv="nav-movies"]').hidden = !state.channels.some((c) => c.type === "movie");
      stage.classList.toggle("movie-view", state.view === "movies" || state.view === "series" || state.view === "history");
      stage.classList.toggle("search-view", state.view === "search");
      (_a4 = $(".rail button.active")) == null ? void 0 : _a4.classList.remove("active");
      if (ctx.platform.isPhone) (_b3 = $('.rail [data-mobile="favorites"]')) == null ? void 0 : _b3.classList.toggle("active", state.view === "guide" && state.group === "Sevimlil\u0259r");
      (_c = $(`[data-tv="nav-${state.view === "guide" ? ctx.platform.isPhone && state.group === "Sevimlil\u0259r" ? "none" : "guide" : state.view === "mylist" ? "favorites" : state.view}"]`)) == null ? void 0 : _c.classList.add("active");
      stage.classList.toggle("mylist-view", state.view === "mylist");
      const markup = (state.view === "mylist" ? "" : `<button class="group-button playlist-selector" data-tv="playlists" aria-label="Switch playlist"><span>${esc(state.source)}</span><span>\u2304</span></button>`) + groups().map((g) => `<button class="group-button" data-group="${esc(g)}" aria-label="${esc(groupLabel(g))}; long OK for properties"><span>${ctx.advanced.isGroupLocked(g) ? "\u{1F512} " : ""}${esc(groupLabel(g))}</span></button>`).join("") + '<div class="group-hint">Hold OK on a group: Rename / PIN</div>';
      const pane = $("#groups");
      if (markup !== lastGroupMarkup) {
        const focused = (_e = (_d = document.activeElement) == null ? void 0 : _d.closest("#groups [data-group]")) == null ? void 0 : _e.dataset.group;
        const scroll = pane.scrollTop;
        pane.innerHTML = markup;
        lastGroupMarkup = markup;
        pane.scrollTop = scroll;
        if (focused && nav === 1) (_f = $$("#groups [data-group]").find((b) => b.dataset.group === focused)) == null ? void 0 : _f.focus({ preventScroll: true });
      }
      for (const b of $$("#groups [data-group]")) b.classList.toggle("active", b.dataset.group === state.group);
    }
    function logo(c) {
      return ctx.renderLogo(c);
    }
    let identityChannel = null;
    function syncPlaybackStatus() {
      var _a4;
      syncPlaybackRows(stage, state);
      let chip = $("#playback-identity");
      if (!chip) {
        chip = document.createElement("div");
        chip.id = "playback-identity";
        chip.setAttribute("role", "status");
        $("#video-surface").append(chip);
      }
      const c = state.channels.find((c2) => c2.id === state.playing), visible = !!c && c.type === "tv";
      chip.hidden = !visible;
      if (!visible) {
        identityChannel = null;
        return;
      }
      const key = c.id + "|" + (((_a4 = state.logoOverrides) == null ? void 0 : _a4[c.id]) || c.logo || "");
      if (identityChannel !== key) {
        identityChannel = key;
        chip.innerHTML = logo(c) + '<span class="playback-identity-text"><strong></strong><small></small></span>';
        chip.querySelector("strong").textContent = c.name;
      }
      const p = playbackPresentation(state, c.id);
      chip.dataset.phase = p.phase;
      const status = chip.querySelector("small");
      if (status.textContent !== p.label) status.textContent = p.label;
    }
    function renderInfo() {
      syncPlaybackStatus();
      if (state.view === "mylist") return;
      const c = currentChannel();
      if (!c || state.view === "guide" && c.type !== "tv") {
        for (const id of ["program-title", "program-meta", "program-time", "program-description"]) $("#" + id).textContent = "";
        return;
      }
      const p = state.selected || programAt(c), now = Date.now();
      $("#program-title").textContent = c.type === "movie" ? c.name + (c.year ? " (" + c.year + ")" : "") : p.empty ? c.name : p.title;
      $("#program-meta").textContent = c.type === "movie" ? "" : p.category || c.group;
      $("#program-time").innerHTML = p.empty ? '<span class="epg-unavailable">No programme information</span>' : `<span>${fmt(p.start)} \u2013 ${fmt(p.end)}</span><div class="progress-track"><i style="width:${Math.min(100, Math.max(0, (now - p.start) / (p.end - p.start) * 100))}%"></i></div><span>${p.start > now ? mins(p.start - now) + " min" : mins(p.end - now) + " min"}</span>`;
      $("#program-description").textContent = c.type === "movie" ? c.description || "" : p.empty ? "" : p.description || "";
      let star = $(".info-star");
      if (!star) {
        star = document.createElement("button");
        star.className = "info-star";
        star.dataset.action = "favorite";
        star.setAttribute("aria-label", "Add to favorites");
        $(".program-info").append(star);
      }
      star.setAttribute("aria-label", state.favorites.includes(c.id) ? "Remove from favorites" : "Add to favorites");
      star.setAttribute("aria-pressed", String(state.favorites.includes(c.id)));
      star.innerHTML = icon("star");
      star.classList.toggle("active", state.favorites.includes(c.id));
      $("#foot-status").textContent = state.source;
      if (c.type === "movie") movieBackdrop(c);
    }
    let lastGuideChannel = "", guideSource = null, guideGroup = "", guideScroll = 0, guideActive = null;
    function renderGuide() {
      var _a4, _b3;
      const a = visibleChannels(), start = state.window, unit = 213.333333, now = Date.now(), rowHeight = ctx.platform.isPhone ? 76 : state.prefs.compact ? 47 : 52;
      if (a.length && !a.some((c) => c.id === state.channel)) {
        state.channel = a[0].id;
        state.selected = programAt(a[0]);
      }
      let scroll = (_b3 = (_a4 = $(".guide-scroll")) == null ? void 0 : _a4.scrollTop) != null ? _b3 : guideScroll;
      if (guideSource !== state.channels || guideGroup !== state.group) {
        scroll = 0;
        guideSource = state.channels;
        guideGroup = state.group;
      }
      const selectedIndex = a.findIndex((c) => c.id === state.channel);
      if (lastGuideChannel !== state.channel) {
        if (selectedIndex * rowHeight < scroll) scroll = selectedIndex * rowHeight;
        else if ((selectedIndex + 1) * rowHeight > scroll + 400) scroll = Math.max(0, (selectedIndex + 1) * rowHeight - 400);
      }
      lastGuideChannel = state.channel;
      $("#content").innerHTML = `<div class="guide-wrap"><div class="timeline"><button class="guide-date" data-action="now" title="Return to current time">${localDate(now)}</button><div class="time-slots">${[0, 1, 2, 3, 4, 5].map((i) => `<span>${fmt(start + i * 18e5)}</span>`).join("")}</div>${now >= start ? `<i class="now-head" style="left:${340 + (now - start) / 18e5 * unit}px"></i>` : ""}</div><div class="guide-scroll"><div class="guide-virtual" style="height:${a.length * rowHeight}px;position:relative"></div></div></div>`;
      const scroller = $(".guide-scroll"), inner = $(".guide-virtual");
      let lastFirst = -1;
      function draw() {
        var _a5, _b4;
        const first = Math.max(0, Math.floor(scroller.scrollTop / rowHeight) - 4);
        guideScroll = scroller.scrollTop;
        if (first === lastFirst) return;
        lastFirst = first;
        const focused = (_a5 = document.activeElement) == null ? void 0 : _a5.classList.contains("programme");
        inner.innerHTML = a.slice(first, first + 22).map((c, offset) => {
          const i = first + offset;
          let ps = channelPrograms(c).filter((p) => p.end > start && p.start < start + 108e5);
          if (!ps.length) ps = [{ ...programAt(c, start), start, end: start + 108e5 }];
          return `<div class="guide-row" data-row="${esc(c.id)}" style="position:absolute;top:${i * rowHeight}px;left:0;right:0"><button class="channel-name ${c.id === state.channel ? "is-selected" : ""}" data-channel="${esc(c.id)}" title="${esc(c.name)}"><span class="num">${ctx.channelNumber(c, i)}</span>${logo(c)}<span class="label">${esc(c.name)}</span><span class="channel-status"><span class="playback-indicator" data-playback-indicator hidden></span>${icon("history")}</span></button>${ctx.platform.isPhone ? `<button class="phone-row-menu" data-mobile-channel-tools="${esc(c.id)}" aria-label="Options for ${esc(c.name)}">\u22EF</button>` : ""}<div class="programs">${ps.map((p) => {
            var _a6, _b5;
            const left = Math.max(0, (p.start - start) / 18e5 * unit), right = (p.end - start) / 18e5 * unit;
            return `<button class="programme ${p.start <= now && p.end > now ? "current" : ""} ${c.id === state.channel && (p.empty || p.start === ((_b5 = (_a6 = state.selected) == null ? void 0 : _a6.start) != null ? _b5 : programAt(c).start)) ? "selected" : ""}" data-channel-id="${esc(c.id)}" data-program="${p.start}" style="left:${left}px;width:${Math.max(1, right - left - 4)}px" tabindex="${c.id === state.channel ? 0 : -1}"><span>${esc(p.empty ? "No information" : p.title)}</span></button>`;
          }).join("")}${now >= start ? `<i class="now-line" style="left:${(now - start) / 18e5 * unit}px"></i>` : ""}</div></div>`;
        }).join("");
        syncPlaybackRows(stage, state);
        if (focused && nav === 0) (_b4 = inner.querySelector(".programme.selected")) == null ? void 0 : _b4.focus({ preventScroll: true });
      }
      guideActive = { channels: a, scroll: scroller, rowHeight, draw };
      scroller.scrollTop = scroll;
      draw();
      if (ctx.platform.isPhone && !a.length) {
        inner.style.height = "100%";
        inner.innerHTML = state.group === "Sevimlil\u0259r" ? '<div class="phone-empty"><h2>No favorites yet</h2><p>Open a channel\u2019s \u22EF menu and choose Add to Favorites.</p><button data-tv="nav-guide">Browse channels</button></div>' : '<div class="phone-empty"><h2>No channels here</h2><p>Choose another group or add a playlist.</p><button data-tv="import">Add playlist</button></div>';
      }
      syncPlaybackStatus();
      let queued = false;
      scroller.addEventListener("scroll", () => {
        if (!queued) {
          queued = true;
          requestAnimationFrame(() => {
            queued = false;
            draw();
          });
        }
      });
      renderInfo();
    }
    function fastSelectGuide(c, p, focus) {
      var _a4;
      if (state.view !== "guide" || !guideActive || !guideActive.scroll.isConnected) return false;
      const guide = guideActive, index = guide.channels.findIndex((row2) => row2.id === c.id);
      if (index < 0) return false;
      state.channel = c.id;
      state.selected = p || programAt(c);
      const sc = guide.scroll, top = index * guide.rowHeight, bottom = top + guide.rowHeight;
      if (top < sc.scrollTop) sc.scrollTop = top;
      else if (bottom > sc.scrollTop + sc.clientHeight) sc.scrollTop = Math.max(0, bottom - sc.clientHeight);
      guide.draw();
      const old = $$(".guide-virtual .programme.selected");
      old.forEach((el) => {
        el.classList.remove("selected");
        el.tabIndex = -1;
      });
      $$(".guide-virtual .channel-name.is-selected").forEach((el) => el.classList.remove("is-selected"));
      const rows = $$(".guide-virtual .guide-row"), row = rows.find((el) => el.dataset.row === c.id);
      if (row) {
        (_a4 = row.querySelector(".channel-name")) == null ? void 0 : _a4.classList.add("is-selected");
        const choices = [...row.querySelectorAll(".programme")];
        let target = choices.find((el) => Number(el.dataset.program) === state.selected.start) || choices[0];
        if (target) {
          target.classList.add("selected");
          target.tabIndex = 0;
          if (focus) target.focus({ preventScroll: true });
        }
      }
      renderInfo();
      return true;
    }
    function renderCards() {
      if (state.view === "mylist") return renderMyList();
      const signature = state.view + "|" + state.group;
      if (signature !== mediaSignature) {
        mediaSignature = signature;
        mediaPage = 0;
      }
      const isSeries = state.view === "series", all = isSeries ? ctx.seriesCatalog(visibleChannels()) : visibleChannels();
      mediaPage = Math.max(0, Math.min(mediaPage, Math.ceil(all.length / PAGE_SIZE) - 1));
      const start = mediaPage * PAGE_SIZE, page = all.slice(start, start + PAGE_SIZE);
      seriesShown = isSeries ? all : [];
      $("#content").innerHTML = `<div class="content-header"><h2>${esc(isSeries ? "Series" : groupLabel(state.group))}</h2><span class="right">${all.length ? start + 1 : 0} \u2013 ${Math.min(start + PAGE_SIZE, all.length)} / ${all.length}</span><button data-tv="media-page" data-step="-1" ${mediaPage === 0 ? "disabled" : ""}>\u2039 Previous</button><button data-tv="media-page" data-step="1" ${start + PAGE_SIZE >= all.length ? "disabled" : ""}>Next \u203A</button></div>${page.length ? `<div class="card-grid">${page.map((c, i) => `<button class="movie-card" ${isSeries ? `data-series="${start + i}"` : `data-movie="${esc(c.id)}"`}><div class="poster"><img src="${ctx.safeImage(c.poster || c.logo || "assets/poster-0.svg")}" loading="lazy" alt=""></div><strong>${esc(c.name)}</strong>${isSeries ? "<small>Open seasons</small>" : ""}</button>`).join("")}</div>` : '<div class="empty">No media</div>'}`;
    }
    let searchHistory = [];
    try {
      searchHistory = JSON.parse(localStorage.getItem("tl-search-history") || "[]").filter((x) => typeof x === "string").slice(0, 20);
    } catch {
    }
    function renderSearch() {
      const q = ctx.normalizeSearch(state.query).trim(), a = q ? state.channels.filter((c) => !(state.hiddenChannels || []).includes(c.id) && !(state.hiddenGroups || []).includes(c.group) && ctx.advanced.groupAccessible(c.group) && (ctx.normalizeSearch(c.name).includes(q) || ctx.normalizeSearch(c.group).includes(q))).slice(0, 150) : [];
      const markup = `<div class="search-bar"><button class="voice-search" disabled aria-label="Voice search unavailable">${icon("microphone")}</button><input id="search-input" value="${esc(state.query)}" placeholder="Search" aria-label="Search"><button class="search-settings" data-tv="settings" aria-label="Search settings">${icon("settings")}</button></div><div class="result-list search-results"><div class="search-section"><span>${q ? "Channels" : "Search history"}</span>${!q ? `<button data-tv="clear-search-history" aria-label="Clear search history">${icon("trash")}</button>` : ""}</div>${q ? `<div class="search-cards">${a.map((c) => `<button class="result search-card" data-result="${esc(c.id)}">${logo(c)}<span>${esc(c.name)}</span><small>${esc(c.type === "movie" ? c.group : programAt(c).empty ? "No information" : programAt(c).title)}</small></button>`).join("")}</div>${!a.length ? '<div class="empty">No results</div>' : ""}` : searchHistory.length ? `<div class="search-history">${searchHistory.map((q2) => `<button data-tv="search-query" data-query="${esc(q2)}">${esc(q2)}</button>`).join("")}</div>` : '<div class="empty search-empty">No history</div>'}</div>`;
      const existing = $("#search-input"), results = $("#content .result-list");
      if (existing && results) {
        const template = document.createElement("template");
        template.innerHTML = markup;
        results.replaceWith(template.content.querySelector(".result-list"));
        if (document.activeElement !== existing) existing.value = state.query;
      } else $("#content").innerHTML = markup;
    }
    function movieBackdrop(c) {
      let backdrop = $("#movie-backdrop");
      if (!backdrop) {
        backdrop = document.createElement("div");
        backdrop.id = "movie-backdrop";
        backdrop.innerHTML = '<img alt="">';
        app.prepend(backdrop);
      }
      let src;
      try {
        src = ctx.platform.assetURL(c.poster || c.logo || "assets/poster-0.svg");
      } catch {
        src = ctx.platform.assetURL("assets/poster-0.svg");
      }
      backdrop.querySelector("img").src = src;
    }
    function movieDetails(c) {
      var _a4;
      if (!c) return;
      if (ctx.advanced.guardGroup(c.group, () => movieDetails(c))) return;
      state.channel = c.id;
      (_a4 = $("#movie-detail")) == null ? void 0 : _a4.remove();
      const el = document.createElement("section");
      el.id = "movie-detail";
      el.dataset.mediaId = c.id;
      el.className = "movie-detail";
      el.innerHTML = `${ctx.platform.isPhone ? '<button class="mobile-detail-back" data-tv="movie-back" aria-label="Back to movies">\u2039</button>' : ""}<div class="movie-detail-backdrop"><img src="${ctx.safeImage(c.poster || c.logo || "assets/poster-0.svg")}" alt=""></div><h1>${esc(c.name)}${c.year ? " (" + c.year + ")" : ""}</h1><p class="movie-description">${esc(c.description || "")}</p><div class="movie-detail-actions"><button data-tv="movie-play">${icon("play")}Play</button><button data-tv="movie-check">${icon("link")}Check source</button><button data-tv="movie-folder">${icon("bookmark")}Favorite folder</button><button disabled>${icon("screen")}Open in external player</button><button disabled>${icon("film")}Trailer</button><button data-tv="movie-favorite">${icon("bookmark")}${state.favorites.includes(c.id) ? "Remove from My list" : "Add to My list"}</button></div>`;
      stage.append(el);
      el.querySelector("button").focus();
    }
    let seriesRequest = 0;
    async function openSeries(index) {
      const show = seriesShown[index];
      if (!show) return;
      const request2 = ++seriesRequest, sourceChannels = state.channels;
      let episodes = show.episodes.filter((c) => !!c.url);
      const remote = show.episodes.find((c) => {
        var _a4;
        return (_a4 = c.xtream) == null ? void 0 : _a4.seriesId;
      });
      if (remote) {
        ctx.modal(show.name, "<p>Loading episodes from your IPTV provider\u2026</p>", "", { panel: true });
        try {
          const raw = JSON.parse(await api("source", { url: xtreamApi(remote.xtream.server, remote.xtream.username, remote.xtream.password, "get_series_info", remote.xtream.seriesId) }));
          if (request2 !== seriesRequest || sourceChannels !== state.channels || !$("#modal-root").children.length || !ctx.advanced.groupAccessible(remote.group)) return;
          episodes = xtreamEpisodes(raw, remote);
          for (const c of episodes) {
            if (!state.channels.some((old) => old.id === c.id)) state.channels.push(c);
          }
        } catch (e) {
          ctx.modal("Episodes unavailable", "<p>" + esc(e.message) + "</p>", "", { panel: true });
          return;
        }
      }
      if (!episodes.length) {
        ctx.modal(show.name, "<p>No playable episode links were returned by the provider.</p>", "", { panel: true });
        return;
      }
      state.nextEpisodes = episodes;
      seriesEpisodes = episodes;
      seriesName = show.name;
      renderSeason(episodes[0].season);
    }
    function renderSeason(season) {
      const seasons = [...new Set(seriesEpisodes.map((c) => c.season))];
      ctx.modal(seriesName, `<div class="menu-list">${seasons.map((n) => `<button data-tv="series-season" data-season="${n}">Season ${n}</button>`).join("")}</div><div class="menu-list">${seriesEpisodes.filter((c) => c.season === season && ctx.advanced.groupAccessible(c.group)).map((c) => `<button data-tv="series-episode" data-id="${esc(c.id)}">Episode ${c.episode} \u2014 ${esc(c.name)}</button>`).join("")}</div>`, "", { panel: true });
    }
    function openSeriesItem(c) {
      if (!c) return;
      if (ctx.advanced.guardGroup(c.group, () => openSeriesItem(c))) return;
      ctx.navigate("series");
      const shows = ctx.seriesCatalog(visibleChannels());
      seriesShown = shows;
      const index = shows.findIndex((show) => show.episodes.some((e) => e.id === c.id));
      if (index >= 0) return openSeries(index);
      toast("Series is no longer available.");
    }
    function closeMovie() {
      var _a4, _b3;
      const c = currentChannel();
      (_a4 = $("#movie-detail")) == null ? void 0 : _a4.remove();
      (_b3 = $(`[data-movie="${CSS.escape((c == null ? void 0 : c.id) || "")}"]`)) == null ? void 0 : _b3.focus({ preventScroll: true });
    }
    function renderMyList() {
      const reminders = state.group === "reminders", rows = (reminders ? state.reminders : state.savedPrograms || []).filter((p) => {
        const c = state.channels.find((c2) => c2.id === (p.channelId || p.channel));
        return c && !(state.hiddenChannels || []).includes(c.id) && !(state.hiddenGroups || []).includes(c.group) && ctx.advanced.groupAccessible(c.group);
      });
      $("#content").innerHTML = `<div class="mylist-content">${rows.length ? rows.map((p) => `<button class="mylist-item" data-tv="saved-program" data-bookmark="${esc(p.key)}"><strong>${esc(p.title)}</strong><small>${new Date(p.start).toLocaleString()}</small></button>`).join("") : `<div class="empty">${reminders ? "No reminders" : "No programs"}</div>`}</div>`;
    }
    function showWelcome() {
      welcome = true;
      setNav(0, false);
      $("#welcome").hidden = false;
      $('#welcome [data-tv="import"]').focus();
    }
    function leaveWelcome() {
      welcome = false;
      $("#welcome").hidden = true;
      localStorage.setItem("tl-tv-ready", "true");
    }
    function ready() {
      const boot = $("#boot");
      if (boot) boot.hidden = true;
      if (!state.imported && localStorage.getItem("tl-tv-ready") !== "true") showWelcome();
      else {
        leaveWelcome();
        setNav(0, false);
      }
    }
    function settings(section = "root") {
      var _a4, _b3;
      if (ctx.advanced.guard(section === "parental" ? "pin" : "settings", () => settings(section))) return;
      if (ctx.advanced.settings(section)) return;
      setNav(0, false);
      if (section === "sources") {
        const playlists = ctx.playlists();
        ctx.modal("Playlists", `<button class="setting-row" data-tv="setting-root"><span>Back to settings</span></button><div class="settings-section-title">Saved playlists \xB7 ${playlists.length}</div>${playlists.map((p) => `<button class="setting-row playlist-row" data-tv="playlist-select" data-id="${esc(p.id)}" aria-pressed="${p.active}"><span class="setting-text">${esc(p.name)}<small>${p.channels.length} channels${p.active ? " \xB7 Active" : ""}</small></span><span>${p.active ? "\u2713" : "\u203A"}</span></button>`).join("")}<div class="menu-list"><button data-tv="import">\uFF0B Add playlist</button><button data-action="epg">EPG for active playlist</button><button data-tv="sample">Load sample playlist</button></div>`, "", { panel: true });
        $(".settings-panel").dataset.tvSettings = "sources";
        (_a4 = $('.playlist-row[aria-pressed="true"]') || $('[data-tv="import"]')) == null ? void 0 : _a4.focus();
        return;
      }
      if (section === "library") {
        ctx.modal("General", `<button class="setting-row" data-tv="setting-root"><span>Back to settings</span></button><label class="setting-row startup-setting"><span class="setting-text">Turn on last channel on app start<small>Open the last TV channel in the player</small></span><input type="checkbox" data-pref="autoplay" aria-label="Turn on last channel on app start" ${state.prefs.autoplay ? "checked" : ""}></label><div class="panel-note">By default the TV guide opens without playback. Channel selection, group, favorites and settings are kept.</div><div class="menu-list"><button disabled>Back up data</button><button disabled>Restore data</button><button data-tv="health-check">Channel health check</button><button data-tv="favorite-folders">Favorite folders</button><button data-action="clear-history">Clear history</button></div>`, "", { panel: true });
        $(".settings-panel").dataset.tvSettings = "library";
        return;
      }
      if (section !== "root") {
        ctx.settingsLegacy(section);
        $(".settings-panel").dataset.tvSettings = section;
        const title = $("#modal-root h2");
        if (title) {
          const titles = { sources: "Playlists", appearance: "Appearance", playback: "Playback", library: "General", remote: "Remote control", status: "Feature status", about: "About" };
          title.textContent = titles[section] || title.textContent;
        }
        if (section === "sources") {
          const p = $(".panel-note");
          if (p) p.insertAdjacentHTML("beforeend", '<br><button class="secondary" data-tv="sample">Load sample playlist</button>');
        }
        return;
      }
      const rows = [["library", "General"], ["sources", "Playlists"], ["epg", "EPG"], ["appearance", "Appearance"], ["playback", "Playback"], ["remote", "Remote control"], ["parental", "Parental controls"], ["status", "Other"], ["about", "About"]];
      const settingsIcons = { library: "settings", sources: "list", epg: "clock", appearance: "palette", playback: "play", remote: "screen", parental: "lock", status: "history", about: "info" };
      ctx.modal("Settings", `<div class="settings-section-title">TiviLoom \xB7 ${ctx.platform.isPhone ? "Android" : "webOS TV"} \xB7 ${VERSION}</div>${rows.filter(([id]) => id !== "about").map(([id, name]) => `<button class="setting-row" data-tv="setting-${id}">${icon(settingsIcons[id] || "settings")}<span class="setting-text">${name}</span><span class="setting-chevron">\u203A</span></button>`).join("")}<div class="settings-section-title settings-about-heading">Application</div><button class="setting-row" data-tv="about">${icon("info")}<span class="setting-text">Application information<small>Version, build and licenses</small></span><span class="setting-chevron">\u203A</span></button>`, "", { panel: true });
      $(".settings-panel").dataset.tvSettings = "root";
      (_b3 = $('[data-tv="setting-library"]')) == null ? void 0 : _b3.focus();
    }
    function wizardIcon(step) {
      return `<img class="wizard-material-icon ${step === "processed" ? "download-icon" : ""}" src="assets/icons/${step === "type" ? "playlist-add" : step === "processed" ? "download" : "link"}.svg" alt="">`;
    }
    function fieldRow(key, label, value) {
      return wizard.edit === key ? `<div class="wizard-input-row"><label>${label}<input id="wizard-field" data-wizard-field="${key}" value="${esc(value)}" ${key === "password" ? 'type="password"' : ""} autocomplete="off" spellcheck="false" aria-label="${label}"></label></div>` : `<button class="wizard-option ${value ? "double" : ""}" data-tv="edit-${key}"><span>${label}${value ? `<small>${esc(key === "password" ? "\u2022".repeat(Math.min(value.length, 20)) : value)}</small>` : ""}</span></button>`;
    }
    function renderWizard(focus = "") {
      var _a4, _b3, _c;
      if (!wizard) return;
      const w = wizard;
      let title = "", desc = "", body = "", kind = "", next = "Next", canNext = true, back = "Back";
      if (w.step === "type") {
        title = "Playlist type";
        body = ["M3U playlist", "Xtream Codes", "Stalker Portal (unavailable)"].map((t, i) => `<button class="wizard-option" data-tv="type-${["m3u", "xtream", "stalker"][i]}" ${i === 2 ? "disabled" : ""}>${t}</button>`).join("");
        canNext = false;
        back = "Cancel";
      }
      if (w.step === "m3u") {
        title = "M3U playlist";
        kind = "url-options";
        body = fieldRow("url", "Enter URL", w.url) + `<button class="wizard-option" ${((_a4 = navigator.clipboard) == null ? void 0 : _a4.readText) ? "" : "disabled"} data-tv="paste-url">Paste from clipboard</button><button ${ctx.platform.fileSupport ? "" : "disabled"} class="wizard-option ${w.file ? "double" : ""}" data-tv="pick-playlist"><span>Select local playlist${w.file ? `<small>${esc(w.file.name)}</small>` : ""}</span></button>`;
        canNext = !!w.url || !!w.file;
      }
      if (w.step === "xtream") {
        title = "Xtream Codes";
        kind = "form-options";
        body = fieldRow("server", "Server address", w.server) + fieldRow("username", "Username", w.username) + fieldRow("password", "Password", w.password) + `<button class="wizard-option check-option" data-tv="toggle-tv"><i class="check ${w.includeTV ? "checked" : ""}"></i>Include TV channels</button><button class="wizard-option check-option" data-tv="toggle-vod"><i class="check ${w.includeVOD ? "checked" : ""}"></i>Include VOD</button>`;
        canNext = !!w.server && !!w.username && !!w.password && (w.includeTV || w.includeVOD);
      }
      if (w.step === "stalker") {
        title = "Stalker Portal";
        kind = "form-options";
        body = fieldRow("server", "Server address", w.server) + fieldRow("mac", "MAC address", w.mac) + fieldRow("username", "Username (optional)", w.username) + fieldRow("password", "Password (optional)", w.password) + fieldRow("device", "Device ID (optional)", w.device) + fieldRow("serial", "Serial number (optional)", w.serial);
        canNext = !!w.server && !!w.mac;
      }
      if (w.step === "loading") {
        title = "Processing playlist";
        desc = "Please wait\u2026";
        body = '<div class="spinner" aria-label="Loading"></div>';
        canNext = false;
      }
      if (w.step === "error") {
        title = "Error";
        desc = w.error;
        body = "";
        canNext = false;
      }
      if (w.step === "processed") {
        title = "Playlist is processed";
        desc = "Channels: " + w.parsed.channels.length;
        kind = "processed-options";
        body = fieldRow("name", "Playlist name", w.name) + `<button class="wizard-option check-option" data-tv="mode-tv"><i class="radio ${w.mode === "tv" ? "checked" : ""}"></i>TV playlist</button><button class="wizard-option check-option" data-tv="mode-vod"><i class="radio ${w.mode === "vod" ? "checked" : ""}"></i>VOD playlist (no TV channels)</button>`;
        next = w.mode === "vod" ? "Done" : "Next";
      }
      if (w.step === "epg") {
        title = "EPG URL";
        desc = "Enter EPG URL for the playlist. You can add or change it later in the settings. XMLTV format only is supported.";
        kind = "epg-options";
        body = fieldRow("epg", "Enter URL", w.epg) + `<button class="wizard-option" ${((_b3 = navigator.clipboard) == null ? void 0 : _b3.readText) ? "" : "disabled"} data-tv="paste-epg">Paste from clipboard</button><button class="wizard-option double" data-tv="paste-playlist"><span>Paste playlist URL<small>You can edit playlist URL if it has a similar format</small></span></button><button class="wizard-option" data-tv="default-epg" ${w.defaultEpg ? "" : "disabled"}>Use default source</button>`;
        next = "Done";
      }
      $("#wizard").hidden = false;
      $("#wizard").innerHTML = `<section class="wizard-left"><div class="wizard-icon">${wizardIcon(w.step)}</div><div class="wizard-heading"><h1>${esc(title)}</h1>${desc ? `<p>${esc(desc)}</p>` : ""}</div></section><section class="wizard-center"><div class="wizard-options ${kind}">${body}</div><div class="wizard-status" role="status">${esc(w.status || "")}</div></section><section class="wizard-side"><div class="wizard-controls">${w.step !== "type" ? `<button data-tv="wizard-next" ${!canNext ? "disabled" : ""}>${next}${icon("chevron")}</button>` : ""}<button data-tv="wizard-back">${back}</button></div></section><input type="file" id="source-file" accept=".m3u,.m3u8,.txt" hidden>`;
      if (w.edit) {
        const f = $("#wizard-field");
        f == null ? void 0 : f.focus();
        f == null ? void 0 : f.setSelectionRange(f.value.length, f.value.length);
      } else {
        const target = focus ? $(`[data-tv="${focus}"]`) : $("#wizard .wizard-option:not(:disabled)");
        (_c = target || $('#wizard [data-tv="wizard-back"]')) == null ? void 0 : _c.focus({ preventScroll: true });
      }
    }
    function openImport() {
      var _a4;
      wizardOrigin = welcome ? "welcome" : ((_a4 = $(".settings-panel")) == null ? void 0 : _a4.dataset.tvSettings) === "sources" ? "sources" : "guide";
      ctx.closeModal();
      if (listMode) closeList();
      wizard = { id: ++wizardCounter, step: "type", origin: "m3u", url: "", name: "", epg: "", defaultEpg: "", mode: "tv", server: "", username: "", password: "", mac: "00:1A:79:00:00:00", device: "", serial: "", includeTV: true, includeVOD: true, file: null, parsed: null, status: "", edit: null };
      renderWizard();
    }
    function closeWizard(completed = false) {
      wizardCounter++;
      wizard = null;
      $("#wizard").innerHTML = "";
      $("#wizard").hidden = true;
      if (completed) return setNav(0);
      if (wizardOrigin === "sources" && !welcome) return settings("sources");
      if (welcome) $('#welcome [data-tv="import"]').focus();
      else setNav(0);
    }
    function wizardBack() {
      if (!wizard) return;
      const w = wizard;
      w.status = "";
      w.edit = null;
      if (w.step === "type") return closeWizard();
      if (w.step === "epg") w.step = "processed";
      else if (w.step === "processed" || w.step === "error" || w.step === "loading") {
        w.step = w.origin;
        w.id = ++wizardCounter;
      } else w.step = "type";
      renderWizard();
    }
    async function processPlaylist() {
      var _a4, _b3;
      const w = wizard;
      if (!w) return;
      if (w.step === "stalker") {
        w.status = "Stalker Portal is not supported in this webOS release. Use an M3U or Xtream playlist.";
        renderWizard("wizard-back");
        return;
      }
      const id = w.id;
      w.origin = w.step;
      w.step = "loading";
      w.edit = null;
      w.status = "";
      renderWizard();
      try {
        let url = w.url;
        if (w.origin === "xtream") {
          const base = new URL(w.server);
          if (!["http:", "https:"].includes(base.protocol)) throw Error("Use an HTTP or HTTPS server address.");
          base.pathname = base.pathname.replace(/\/$/, "") + "/get.php";
          base.search = new URLSearchParams({ username: w.username, password: w.password, type: "m3u_plus", output: "m3u8" }).toString();
          url = base.href;
          const epg = new URL("xmltv.php", base);
          epg.search = new URLSearchParams({ username: w.username, password: w.password }).toString();
          w.epg = epg.href;
        }
        if (((_a4 = w.file) == null ? void 0 : _a4.size) > 3e7) throw Error("The selected playlist is larger than 30 MB.");
        let text;
        try {
          text = w.file ? await w.file.text() : await api("source", { url });
        } catch (error) {
          if (w.origin !== "xtream") throw error;
          text = "#EXTM3U\n";
        }
        if (!wizard || wizard.id !== id) return;
        let parsed;
        try {
          parsed = await ctx.parsePlaylist(text, ctx.platform.sourceBase(url));
        } catch (error) {
          if (w.origin !== "xtream") throw error;
          parsed = { channels: [], epg: "" };
        }
        parsed.channels = parsed.channels.map((c) => ({ ...c, type: /\/movie\//i.test(c.url) ? "movie" : c.type }));
        if (w.origin === "xtream") parsed.channels = parsed.channels.filter((c) => c.type === "movie" ? w.includeVOD : w.includeTV);
        if (w.origin === "xtream" && w.includeVOD) {
          const cr = { server: w.server.replace(/\/$/, ""), username: w.username, password: w.password };
          const additions = [];
          for (const [action, convert] of [["get_vod_streams", xtreamMovie], ["get_series", xtreamSeries]]) {
            try {
              const items = JSON.parse(await api("source", { url: xtreamApi(w.server, w.username, w.password, action) }));
              if (Array.isArray(items)) for (const item of items) {
                const entry = convert(item, cr);
                if (entry) additions.push(entry);
              }
            } catch (error) {
              w.status = "Some provider catalog APIs are unavailable; M3U channels are retained.";
            }
          }
          const urls = new Set(additions.map((c) => c.url).filter(Boolean));
          parsed.channels = parsed.channels.filter((c) => !urls.has(c.url));
          const ids = new Set(parsed.channels.map((c) => c.id));
          for (const item of additions) {
            if (!ids.has(item.id)) {
              ids.add(item.id);
              parsed.channels.push(item);
            }
          }
        }
        if (!parsed.channels.length) throw Error("No channels matched the selected options.");
        w.parsed = parsed;
        w.resolvedURL = url;
        w.defaultEpg = parsed.epg || w.epg;
        w.epg = parsed.epg || w.epg;
        w.name = ((_b3 = w.file) == null ? void 0 : _b3.name) || new URL(url).hostname;
        w.step = "processed";
        w.edit = null;
        renderWizard();
      } catch (e) {
        if (!wizard || wizard.id !== id) return;
        w.step = "error";
        w.error = e.message;
        renderWizard("wizard-back");
      }
    }
    async function commitPlaylist() {
      const w = wizard, id = w.id;
      w.step = "loading";
      w.edit = null;
      renderWizard();
      let epg = null, warning = "";
      if (w.epg && w.mode !== "vod") {
        try {
          epg = await api("epg", { url: w.epg });
        } catch (e) {
          warning = "EPG was not loaded. You can add it in Settings.";
        }
      }
      if (!wizard || wizard.id !== id) return;
      const stored = await ctx.addPlaylist({ name: w.name || "Playlist", channels: w.parsed.channels.map((c) => w.mode === "vod" ? { ...c, type: "movie" } : c), programs: (epg == null ? void 0 : epg.programs) || [], epgNames: (epg == null ? void 0 : epg.names) || {}, sourceURL: w.resolvedURL || w.url, epgURL: w.epg, imported: true });
      if (!wizard || wizard.id !== id) return;
      if (!stored) {
        w.step = "error";
        w.error = state.libraryError || "The playlist could not be saved. Existing playlists are unchanged.";
        renderWizard();
        return;
      }
      closeWizard(true);
      leaveWelcome();
      ctx.navigate(state.channels.some((c) => c.type === "tv") ? "guide" : "movies");
      setNav(0);
      if (warning) toast(warning);
    }
    function commitField() {
      const input = $("#wizard-field");
      if (!wizard || !input) return;
      wizard[input.dataset.wizardField] = input.value.trim();
      wizard.edit = null;
      renderWizard("wizard-next");
    }
    async function wizardAction(action) {
      if (!wizard) return;
      const w = wizard;
      if (action.startsWith("type-")) {
        w.step = action.slice(5);
        w.origin = w.step;
        renderWizard();
        return;
      }
      if (action.startsWith("edit-")) {
        w.edit = action.slice(5);
        renderWizard();
        return;
      }
      if (action === "wizard-back") return wizardBack();
      if (action === "wizard-next") {
        if (w.step === "processed") {
          if (w.mode === "vod") return commitPlaylist();
          w.step = "epg";
          renderWizard();
          return;
        }
        if (w.step === "epg") return commitPlaylist();
        return processPlaylist();
      }
      if (action === "mode-tv" || action === "mode-vod") {
        w.mode = action.slice(5);
        renderWizard(action);
        return;
      }
      if (action === "pick-playlist") {
        if (ctx.platform.fileSupport) return $("#source-file").click();
        return ctx.toast("Use Enter URL to add a playlist on TV.");
      }
      if (action === "toggle-tv" || action === "toggle-vod") {
        const key = action === "toggle-tv" ? "includeTV" : "includeVOD";
        w[key] = !w[key];
        renderWizard(action);
        return;
      }
      if (action === "paste-playlist") {
        w.epg = w.url;
        renderWizard("edit-epg");
        return;
      }
      if (action === "default-epg") {
        w.epg = w.defaultEpg;
        renderWizard("edit-epg");
        return;
      }
      if (action.startsWith("paste-")) {
        try {
          const value = await navigator.clipboard.readText();
          if (!wizard) return;
          w[action === "paste-url" ? "url" : "epg"] = value.trim();
          w.file = null;
          w.status = "";
          renderWizard("wizard-next");
        } catch {
          w.status = "Clipboard is unavailable. Select Enter URL and paste with Ctrl+V.";
          renderWizard();
        }
      }
    }
    function listChannels() {
      const tv = ctx.channelsFor("tv");
      if (state.group === "Sevimlil\u0259r") return state.favorites.map((id) => tv.find((c) => c.id === id)).filter(Boolean);
      return state.group === "Ham\u0131s\u0131" ? tv : tv.filter((c) => c.group === state.group);
    }
    let listLastChannel = "", listScroll = 0;
    function renderList() {
      var _a4;
      const a = listChannels(), c = currentChannel();
      if (!c) return;
      const p = programAt(c), now = Date.now();
      if (!$("#channels-screen")) {
        const el = document.createElement("section");
        el.id = "channels-screen";
        el.className = "channels-screen";
        el.innerHTML = '<div class="list-channel-column"><div class="list-group-title"></div><div class="list-channel-scroll"></div></div><div class="list-program-column"></div><div class="list-detail-column"><time class="list-date"></time><div class="list-preview" id="list-preview"></div><div class="list-details"></div><button class="list-close" data-tv="close-list">Back</button></div>';
        stage.append(el);
      }
      $(".list-group-title").textContent = groupLabel(state.group);
      $(".list-date").textContent = localDate(now);
      const leftList = $(".list-channel-scroll");
      let top = leftList.scrollTop || listScroll;
      const selected = a.findIndex((ch) => ch.id === c.id);
      if (listLastChannel !== c.id) {
        if (selected * 86 < top) top = selected * 86;
        else if ((selected + 1) * 86 > top + 670) top = Math.max(0, (selected + 1) * 86 - 670);
      }
      listLastChannel = c.id;
      const first = Math.max(0, Math.floor(top / 86) - 4);
      leftList.innerHTML = `<div style="height:${first * 86}px"></div>` + a.slice(first, first + 18).map((ch, offset) => {
        const i = first + offset;
        const cp = programAt(ch);
        return `<button class="list-channel ${c.id === ch.id ? "selected" : ""}" data-tv="list-channel" data-id="${esc(ch.id)}">${logo(ch)}<span>${ctx.channelNumber(ch, i)}&nbsp; ${esc(ch.name)}</span><span class="list-current">${esc(cp.empty ? "No information" : cp.title)}</span><span class="list-progress"><i style="width:${Math.max(0, Math.min(100, (now - cp.start) / (cp.end - cp.start) * 100))}%"></i></span></button>`;
      }).join("") + `<div style="height:${Math.max(0, a.length - first - 18) * 86}px"></div>`;
      leftList.scrollTop = top;
      listScroll = top;
      let lastPage = first;
      leftList.onscroll = () => {
        listScroll = leftList.scrollTop;
        const page = Math.max(0, Math.floor(listScroll / 86) - 4);
        if (page !== lastPage) {
          lastPage = page;
          renderList();
        }
      };
      $(".list-program-column").innerHTML = channelPrograms(c).map((pr) => `<button data-tv="list-program" data-start="${pr.start}" class="${pr.start <= now && pr.end > now ? "current" : ""}"><time>${fmt(pr.start)}</time><span>${esc(pr.title)}</span></button>`).join("");
      $(".list-details").innerHTML = `<h2>${esc(p.empty ? "No information" : p.title)}</h2><div class="time-progress"><span>${fmt(p.start)} \u2013 ${fmt(p.end)}</span><span>${mins(p.end - now)} min</span></div><p>${esc(p.description || "")}</p>`;
      ctx.placeVideo($("#list-preview"));
      (_a4 = $(".list-program-column button.current")) == null ? void 0 : _a4.scrollIntoView({ block: "center" });
    }
    function openList() {
      var _a4;
      if (welcome) return;
      if (ctx.platform.isPhone) {
        ctx.closeModal();
        if (state.full) ctx.exitPlayer();
        ctx.navigate("guide");
        setNav(0, false);
        return;
      }
      ctx.closeModal();
      listMode = true;
      listOrigin = state.full;
      $("#player").hidden = true;
      renderList();
      (_a4 = $(".list-channel.selected")) == null ? void 0 : _a4.focus({ preventScroll: true });
    }
    function closeList() {
      var _a4;
      if (!listMode) return;
      listMode = false;
      ctx.placeVideo($(listOrigin ? "#player" : "#preview"), listOrigin);
      (_a4 = $("#channels-screen")) == null ? void 0 : _a4.remove();
      $("#player").hidden = !listOrigin;
      if (listOrigin) showControls("info");
      else {
        ctx.refresh();
        setNav(0);
      }
    }
    function enhancePlayer() {
      const bar = $(".player-buttons");
      if (!bar.dataset.tvTools) {
        const tools = [["tv", "search", "search", "Search"], ["tv", "channels", "list", "Channels list"], ["action", "multiview", "grid", "Multiview"], ["tv", "toggle-mini", "pip", "Mini Player"], ["tv", "player-video", "film", "Video track"], ["tv", "player-audio", "volume", "Audio"], ["tv", "player-offset", "history", "0 ms"], ["tv", "player-subtitles", "captions", "Subtitles"], ["action", "display", "screen", "Display mode"], ["action", "sleep", "clock", "Sleep timer"], ["action", "favorite", "star", "Favorites"], ["tv", "settings", "settings", "Settings"], ["action", "previous", "history", "Previous channel"], ["action", "pause", "pause", "Pause"], ["action", "next", "play", "Next channel"], ["action", "mute", "volume", "Mute"]];
        bar.innerHTML = tools.map(([kind, action, ic, label]) => `<button data-${kind}="${action}" ${["multiview", "player-offset"].includes(action) ? "disabled" : ""} ${action === "pause" ? 'id="pause-button"' : action === "mute" ? 'id="mute-button"' : ""}><span class="tool-icon">${icon(ic)}</span><span class="tool-label">${label}</span></button>`).join("");
        bar.dataset.tvTools = "true";
      }
      const playing = state.channels.find((c) => c.id === state.playing);
      if (playing) $("#player-channel").textContent = ctx.platform.isPhone ? playing.name : playing.group || playing.name;
      if (ctx.platform.isPhone && !$(".mobile-player-tools")) $(".player-top").insertAdjacentHTML("beforeend", '<button class="mobile-player-tools" data-action="context" aria-label="Playback options">\u22EF</button>');
      if (video.videoWidth) $('[data-tv="player-video"] .tool-label').textContent = video.videoWidth + " \xD7 " + video.videoHeight;
      if (!$(".player-top time")) $(".player-top").insertAdjacentHTML("beforeend", `<time>${localDate(Date.now())}</time>`);
      else $(".player-top time").textContent = localDate(Date.now());
    }
    function historyChannels() {
      return recentChannels(state.channels, state.history, state.playing, state).filter((c) => ctx.advanced.groupAccessible(c.group));
    }
    function playerInfo() {
      const c = state.channels.find((c2) => c2.id === state.playing) || currentChannel();
      if (!c) return;
      let now = $("#player-now");
      if (!now) {
        now = document.createElement("div");
        now.id = "player-now";
        $(".player-bottom").prepend(now);
      }
      const p = programAt(c), next = channelPrograms(c).find((x) => x.start >= p.end), n = state.channels.filter((x) => x.type === "tv").findIndex((x) => x.id === c.id) + 1;
      now.innerHTML = `${logo(c)}<div class="player-program"><h2>${esc(c.type === "movie" ? c.name : p.empty ? "No information" : p.title)}</h2><div class="player-program-meta"><span>${fmt(p.start)} \u2013 ${fmt(p.end)}</span><span class="player-mini-progress"><i style="width:${Math.max(0, Math.min(100, (Date.now() - p.start) / (p.end - p.start) * 100))}%"></i></span><span>${mins(p.end - Date.now())} min</span><strong>${n > 0 ? n + " " : ""}${esc(c.name)}</strong>${video.videoHeight ? `<small>${video.videoHeight >= 720 ? "HD" : "SD"}</small>` : ""}</div><p>${next ? fmt(next.start) + " \u2013 " + fmt(next.end) + "  " + esc(next.title) : ""}</p></div>`;
      let bar = $("#player-recents");
      if (!bar) {
        bar = document.createElement("div");
        bar.id = "player-recents";
        $(".player-bottom").append(bar);
      }
      const recent = historyChannels();
      bar.innerHTML = `<button class="recent-command" data-action="guide" aria-label="TV guide">${icon("list")}<span>TV guide</span></button><button class="recent-command" data-tv="player-history" aria-label="History">${icon("history")}<span>History</span></button>` + recent.map((ch) => `<button class="recent-channel" data-tv="recent-channel" data-id="${esc(ch.id)}" aria-label="Watch ${esc(ch.name)}">${logo(ch)}<span>${esc(programAt(ch).empty ? ch.name : programAt(ch).title)}</span><small>${esc(ch.name)}</small></button>`).join("") + (recent.length ? `<button class="recent-command" data-tv="clear-recent" aria-label="Clear history">${icon("trash")}<span>Clear</span></button>` : "");
      $("#player").classList.toggle("vod-player", ["movie", "series"].includes(c.type));
    }
    function historyPanel() {
      ctx.modal("History", `<div class="menu-list">${historyChannels().map((c) => `<button data-tv="recent-channel" data-id="${esc(c.id)}">${logo(c)}<span>${esc(c.name)}</span></button>`).join("") || '<p class="panel-note">No history</p>'}<button data-tv="clear-recent">Clear history</button></div>`, "", { panel: true, key: "player-history" });
    }
    function showControls(mode) {
      var _a4, _b3;
      const previous = state.playerMode;
      enhancePlayer();
      playerInfo();
      const m = typeof mode === "string" ? mode : state.playerMode || "info";
      state.playerMode = m;
      $("#player").classList.toggle("player-tools", m === "tools");
      $("#player").classList.toggle("player-info", m === "info");
      ctx.showControlsLegacy();
      if (typeof mode === "string") {
        if (m === "tools") (_a4 = $(".player-buttons button:not(:disabled)")) == null ? void 0 : _a4.focus({ preventScroll: true });
        else (_b3 = $("#player-recents button")) == null ? void 0 : _b3.focus({ preventScroll: true });
      }
    }
    function context() {
      if (state.full) return showControls("tools");
      ctx.contextLegacy();
    }
    function choicePanel(title, items) {
      ctx.menu(title, items, { choice: true, key: "choice:" + title });
    }
    function displayMenu() {
      choicePanel("Display mode", displayModes.map(([mode, label]) => [label, () => ctx.setFit(mode), state.prefs.fit === mode ? "Selected" : ""]));
    }
    function sleepPanel() {
      choicePanel("Sleep timer", [["Off", () => ctx.setSleep(0), !state.sleep ? "Selected" : ""], ...[15, 30, 45, 60, 90, 120, 180, 240].map((n) => [n + " min", () => ctx.setSleep(n), state.sleep && Math.abs(state.sleep - Date.now() - n * 6e4) < 6e4 ? "Selected" : ""])]);
    }
    function setMuted(value) {
      state.prefs.muted = value;
      video.muted = value;
      ctx.save("prefs");
      ctx.applyPrefs();
      ctx.modalBack();
    }
    function audioPanel() {
      var _a4, _b3;
      const h = ctx.getHls(), items = [["Off", () => setMuted(true), video.muted ? "Selected" : ""]];
      if ((_a4 = h == null ? void 0 : h.audioTracks) == null ? void 0 : _a4.length) h.audioTracks.forEach((t, i) => items.push([t.name || t.lang || "Audio " + (i + 1), () => {
        h.audioTrack = i;
        setMuted(false);
      }, !video.muted && h.audioTrack === i ? "Selected" : ""]));
      else if ((_b3 = video.audioTracks) == null ? void 0 : _b3.length) {
        for (let i = 0; i < video.audioTracks.length; i++) {
          const t = video.audioTracks[i];
          items.push([t.label || t.language || "Audio " + (i + 1), () => {
            for (let j = 0; j < video.audioTracks.length; j++) video.audioTracks[j].enabled = j === i;
            setMuted(false);
          }, !video.muted && t.enabled ? "Selected" : ""]);
        }
      } else items.push(["Default audio", () => setMuted(false), !video.muted ? "Selected" : ""]);
      choicePanel("Audio tracks", items);
    }
    function subtitlePanel() {
      var _a4;
      const h = ctx.getHls(), off = () => {
        if (h) h.subtitleTrack = -1;
        for (const t of video.textTracks) t.mode = "disabled";
        ctx.modalBack();
      };
      const items = [["Off", off, (!h || h.subtitleTrack === -1) && ![...video.textTracks].some((t) => t.mode === "showing") ? "Selected" : ""]];
      if ((_a4 = h == null ? void 0 : h.subtitleTracks) == null ? void 0 : _a4.length) h.subtitleTracks.forEach((t, i) => items.push([t.name || t.lang || "Subtitles " + (i + 1), () => {
        h.subtitleTrack = i;
        ctx.modalBack();
      }, h.subtitleTrack === i ? "Selected" : ""]));
      else for (let i = 0; i < video.textTracks.length; i++) {
        const t = video.textTracks[i];
        items.push([t.label || t.language || "Subtitles " + (i + 1), () => {
          for (const x of video.textTracks) x.mode = "disabled";
          t.mode = "showing";
          ctx.modalBack();
        }, t.mode === "showing" ? "Selected" : ""]);
      }
      choicePanel("Closed captions", items);
    }
    function videoTracks() {
      var _a4;
      const h = ctx.getHls();
      if ((_a4 = h == null ? void 0 : h.levels) == null ? void 0 : _a4.length) {
        choicePanel("Video tracks", [["Auto", () => {
          h.currentLevel = -1;
          ctx.closeModal();
        }], ...h.levels.map((l, i) => [(l.height ? l.height + "p" : "Level " + (i + 1)) + (l.bitrate ? " \xB7 " + (l.bitrate / 1e6).toFixed(2) + " Mbps" : ""), () => {
          h.currentLevel = i;
          ctx.closeModal();
        }])]);
      } else choicePanel("Video tracks", [[video.videoWidth ? video.videoWidth + " \xD7 " + video.videoHeight : "Default video track", () => ctx.closeModal(), "Selected"]]);
    }
    function keyControl(key) {
      var _a4, _b3, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
      if (wizard) {
        wizardKey(key);
        return;
      }
      if (welcome) {
        welcomeKey(key);
        return;
      }
      if (listMode) {
        listKey(key);
        return;
      }
      if ($("#movie-detail")) {
        const a = $$("#movie-detail button:not(:disabled)"), i = a.indexOf(document.activeElement);
        if (key === "ArrowLeft" || key === "ArrowRight") (_a4 = a[Math.max(0, Math.min(a.length - 1, i + (key === "ArrowRight" ? 1 : -1)))]) == null ? void 0 : _a4.focus();
        if (key === "Escape" || key === "Backspace") closeMovie();
        return;
      }
      if (!$("#modal-root").children.length && !state.full && ["guide", "movies", "search", "history", "mylist", "series"].includes(state.view)) {
        if (key === "Escape" || key === "Backspace") {
          setNav(nav > 0 ? nav - 1 : 1);
          return;
        }
        if (nav === 2) {
          const buttons = $$(".rail button:not(.drawer-brand)").filter((b) => !b.hidden), active = document.activeElement;
          let i = buttons.indexOf(active);
          if (key === "ArrowUp" || key === "ArrowDown") {
            (_b3 = buttons[(i + (key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]) == null ? void 0 : _b3.focus();
            return;
          }
          if (key === "ArrowRight") {
            setNav(1);
            return;
          }
          if (key === "Enter") {
            active == null ? void 0 : active.click();
            return;
          }
        }
        if (nav === 1) {
          if (key === "ArrowLeft") {
            setNav(2);
            return;
          }
          if (key === "Enter" && ((_c = document.activeElement) == null ? void 0 : _c.matches('[data-tv="playlists"]'))) return settings("sources");
          if (key === "ArrowRight") {
            const group = (_d = document.activeElement) == null ? void 0 : _d.dataset.group;
            if (group && group !== state.group) ctx.advanced.selectGroup(group);
            if (!$("#modal-root").children.length) setNav(0);
            return;
          }
          if (key === "Enter") {
            (_e = document.activeElement) == null ? void 0 : _e.click();
            return;
          }
          if (key === "ArrowDown" || key === "ArrowUp") {
            const a = $$("#groups button"), i = a.indexOf(document.activeElement), next = a[Math.max(0, Math.min(a.length - 1, i + (key === "ArrowDown" ? 1 : -1)))];
            if (next) {
              next.focus({ preventScroll: true });
              const pane = $("#groups"), top = next.offsetTop - pane.offsetTop, bottom = top + next.offsetHeight;
              if (top < pane.scrollTop) pane.scrollTop = top;
              else if (bottom > pane.scrollTop + pane.clientHeight) pane.scrollTop = bottom - pane.clientHeight;
            }
            return;
          }
        }
        if (state.view === "movies" || state.view === "series" || state.view === "history") {
          const cards = $$("[data-movie],[data-series]"), i = cards.indexOf(document.activeElement);
          if (key === "ArrowRight" || key === "ArrowLeft" && i > 0) {
            const next = cards[Math.max(0, Math.min(cards.length - 1, i + (key === "ArrowRight" ? 1 : -1)))];
            next == null ? void 0 : next.focus();
            next == null ? void 0 : next.scrollIntoView({ block: "nearest", inline: "nearest" });
            return;
          }
          if (key === "ArrowUp" || key === "ArrowDown") {
            const columns = Math.max(1, Math.round(((_f = $(".card-grid")) == null ? void 0 : _f.clientWidth) / (((_g = cards[0]) == null ? void 0 : _g.offsetWidth) + 20) || 5));
            if (key === "ArrowUp" && i < columns) {
              (_h = $('#content [data-tv="media-page"]:not(:disabled)')) == null ? void 0 : _h.focus();
              return;
            }
            const next = cards[Math.max(0, Math.min(cards.length - 1, i + (key === "ArrowDown" ? columns : -columns)))];
            next == null ? void 0 : next.focus();
            next == null ? void 0 : next.scrollIntoView({ block: "nearest" });
            return;
          }
          if (key === "ArrowLeft") {
            setNav(1);
            return;
          }
        }
        if (state.view === "mylist") {
          const a = $$(".mylist-item"), i = a.indexOf(document.activeElement);
          if (key === "ArrowUp" || key === "ArrowDown") {
            (_i = a[Math.max(0, Math.min(a.length - 1, i + (key === "ArrowDown" ? 1 : -1)))]) == null ? void 0 : _i.focus();
            return;
          }
        }
        if (state.view === "search") {
          const results = $$(".result"), i = results.indexOf(document.activeElement);
          if (key === "ArrowLeft" || key === "ArrowRight") {
            (_j = results[Math.max(0, Math.min(results.length - 1, i + (key === "ArrowRight" ? 1 : -1)))]) == null ? void 0 : _j.focus();
            return;
          }
          if (key === "ArrowDown" || key === "ArrowUp") {
            if (key === "ArrowUp" && i <= 0) (_k = $("#search-input")) == null ? void 0 : _k.focus();
            else (_l = results[Math.max(0, Math.min(results.length - 1, i + (key === "ArrowDown" ? 1 : -1)))]) == null ? void 0 : _l.focus();
            return;
          }
        }
        if (key === "ArrowLeft") {
          setNav(1);
          return;
        }
      }
      if (state.full && !$("#modal-root").children.length) {
        if (key === "Escape" || key === "Backspace") return webOSBack();
        if (key === "ArrowUp") return showControls("info");
        if (key === "ArrowDown") return showControls("tools");
        if ((key === "ArrowLeft" || key === "ArrowRight") && state.controls) {
          const selector = state.playerMode === "tools" ? ".player-buttons button:not(:disabled)" : "#player-recents button";
          const buttons = $$(selector), i = buttons.indexOf(document.activeElement), next = buttons[Math.max(0, Math.min(buttons.length - 1, (i < 0 ? 0 : i) + (key === "ArrowRight" ? 1 : -1)))];
          next == null ? void 0 : next.focus({ preventScroll: true });
          next == null ? void 0 : next.scrollIntoView({ block: "nearest", inline: "nearest" });
          return;
        }
        if (key === "Enter") return activateOK(document.activeElement);
        if (key === "ArrowLeft" || key === "ArrowRight") return showControls("info");
      }
      return ctx.keyLegacy(key);
    }
    function welcomeKey(key) {
      var _a4, _b3;
      if (key === "Escape" || key === "Backspace") {
        leaveWelcome();
        setNav(0);
        return;
      }
      const a = $$("#welcome .welcome-actions button");
      if (["ArrowLeft", "ArrowRight"].includes(key)) {
        const i = a.indexOf(document.activeElement);
        (_a4 = a[(i + (key === "ArrowRight" ? 1 : -1) + a.length) % a.length]) == null ? void 0 : _a4.focus();
      }
      if (key === "Enter") (_b3 = document.activeElement) == null ? void 0 : _b3.click();
    }
    function wizardKey(key) {
      var _a4, _b3, _c;
      if (!wizard) return;
      const editing = $("#wizard-field");
      if (editing) {
        if (key === "Enter") commitField();
        if (key === "Escape") {
          wizard.edit = null;
          renderWizard();
        }
        return;
      }
      if (key === "Escape" || key === "Backspace") return wizardBack();
      const opts = $$("#wizard .wizard-option:not(:disabled)"), side = $$("#wizard .wizard-controls button:not(:disabled)"), active = document.activeElement, arr = (active == null ? void 0 : active.closest(".wizard-side")) ? side : opts;
      if (key === "ArrowDown" || key === "ArrowUp") {
        const i = arr.indexOf(active);
        (_a4 = arr[(i + (key === "ArrowDown" ? 1 : -1) + arr.length) % arr.length]) == null ? void 0 : _a4.focus();
      }
      if (key === "ArrowRight") (_b3 = side[0] || active) == null ? void 0 : _b3.focus();
      if (key === "ArrowLeft") (_c = opts[0] || active) == null ? void 0 : _c.focus();
      if (key === "Enter") active == null ? void 0 : active.click();
    }
    function listKey(key) {
      var _a4, _b3, _c, _d, _e;
      if (key === "Escape" || key === "Backspace") return closeList();
      const a = $$(((_a4 = document.activeElement) == null ? void 0 : _a4.closest(".list-program-column")) ? ".list-program-column button" : ".list-channel"), i = a.indexOf(document.activeElement);
      if (key === "ArrowDown" || key === "ArrowUp") {
        const n = a[Math.max(0, Math.min(a.length - 1, i + (key === "ArrowDown" ? 1 : -1)))];
        n == null ? void 0 : n.focus({ preventScroll: true });
        n == null ? void 0 : n.scrollIntoView({ block: "nearest" });
        if (n == null ? void 0 : n.dataset.id) {
          state.channel = n.dataset.id;
          state.selected = null;
          renderList();
          (_b3 = $(`[data-tv="list-channel"][data-id="${CSS.escape(state.channel)}"]`)) == null ? void 0 : _b3.focus({ preventScroll: true });
        }
        return;
      }
      if (key === "ArrowRight") return (_c = $(".list-program-column button.current")) == null ? void 0 : _c.focus();
      if (key === "ArrowLeft") return (_d = $(".list-channel.selected")) == null ? void 0 : _d.focus();
      if (key === "Enter") (_e = document.activeElement) == null ? void 0 : _e.click();
    }
    document.addEventListener("keydown", (e) => {
      var _a4, _b3;
      if (e.target.id === "search-input" && e.key === "Enter") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (state.query.trim()) {
          searchHistory = [state.query.trim(), ...searchHistory.filter((q) => q !== state.query.trim())].slice(0, 20);
          localStorage.setItem("tl-search-history", JSON.stringify(searchHistory));
        }
        (_a4 = $(".result")) == null ? void 0 : _a4.focus();
        return;
      }
      if (!wizard && e.target.id === "search-input" && e.key === "ArrowDown") {
        e.preventDefault();
        e.stopImmediatePropagation();
        (_b3 = $(".result")) == null ? void 0 : _b3.focus();
        return;
      }
      if (wizard) {
        if (e.target.matches("input") && !["Enter", "Escape"].includes(e.key)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        wizardKey(e.key);
        return;
      }
      if (welcome && !$("#modal-root").children.length && ["ArrowLeft", "ArrowRight", "Enter", "Escape", "Backspace"].includes(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        welcomeKey(e.key);
        return;
      }
      if (listMode && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Escape", "Backspace"].includes(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        listKey(e.key);
        return;
      }
    }, true);
    document.addEventListener("input", (e) => {
      if (!wizard || !e.target.dataset.wizardField) return;
      const w = wizard, key = e.target.dataset.wizardField;
      w[key] = e.target.value;
      const validUrl = (value) => {
        try {
          const u = new URL(String(value || "").trim());
          return (u.protocol === "http:" || u.protocol === "https:") && !!u.hostname && !u.username && !u.password;
        } catch {
          return false;
        }
      };
      let valid = false;
      if (w.step === "m3u") valid = !!w.file || validUrl(w.url);
      else if (w.step === "xtream") valid = validUrl(w.server) && !!w.username.trim() && !!w.password && (w.includeTV || w.includeVOD);
      else if (w.step === "stalker") valid = validUrl(w.server) && !!w.mac.trim();
      else if (w.step === "processed") valid = !!w.name.trim();
      else if (w.step === "epg") valid = !w.epg.trim() || validUrl(w.epg);
      const next = $('#wizard [data-tv="wizard-next"]');
      if (next) next.disabled = !valid;
      const status = $("#wizard .wizard-status");
      if (status && ["url", "server", "epg"].includes(key)) {
        const value = w[key].trim();
        status.textContent = value && !valid ? "Enter a valid HTTP or HTTPS address." : "";
      }
    });
    document.addEventListener("change", (e) => {
      if (wizard && e.target.id === "source-file" && e.target.files[0]) {
        wizard.file = e.target.files[0];
        wizard.url = "";
        renderWizard("wizard-next");
      }
    });
    document.addEventListener("focusin", (e) => {
      const card = e.target.closest("[data-movie]");
      if (card) {
        const a = visibleChannels(), i = a.findIndex((c) => c.id === card.dataset.movie);
        if ($(".content-header .right")) $(".content-header .right").textContent = i + 1 + " / " + a.length;
      }
    });
    document.addEventListener("contextmenu", (e) => {
      const button = e.target.closest("#groups [data-group]");
      if (button) {
        e.preventDefault();
        e.stopImmediatePropagation();
        ctx.advanced.openGroupProperties(button.dataset.group);
      }
    }, true);
    document.addEventListener("click", async (e) => {
      var _a4, _b3;
      const seriesCard = e.target.closest("[data-series]");
      if (seriesCard) {
        openSeries(Number(seriesCard.dataset.series));
        return;
      }
      const b = e.target.closest("[data-tv],[data-group]");
      if (!b) return;
      const a = b.dataset.tv;
      try {
        if (a === "media-page") {
          mediaPage += Number(b.dataset.step) || 0;
          renderCards();
          (_a4 = $(".movie-card")) == null ? void 0 : _a4.focus();
          return;
        }
        if (a === "series-season") {
          renderSeason(Number(b.dataset.season));
          return;
        }
        if (a === "series-episode") {
          const c = state.channels.find((x) => x.id === b.dataset.id && x.type === "series");
          if (c) {
            ctx.closeModal();
            ctx.play(c, true);
          }
          return;
        }
        if (b.dataset.group) {
          const group = b.dataset.group;
          if (ctx.advanced.selectGroup(group)) {
            setNav(ctx.platform.isPhone && !$("#modal-root").children.length ? 0 : 1, false);
            requestAnimationFrame(() => {
              var _a5;
              (_a5 = $$("#groups .group-button").find((x) => x.dataset.group === group)) == null ? void 0 : _a5.focus({ preventScroll: true });
            });
          }
          return;
        }
        if (a === "search-query") {
          state.query = b.dataset.query;
          renderSearch();
          $("#search-input").focus();
          return;
        }
        if (a === "clear-search-history") {
          searchHistory = [];
          localStorage.setItem("tl-search-history", "[]");
          return renderSearch();
        }
        if (a === "movie-play") {
          const c = state.channels.find((c2) => {
            var _a5;
            return c2.id === ((_a5 = $("#movie-detail")) == null ? void 0 : _a5.dataset.mediaId);
          });
          if (!c) return toast("Movie no longer exists. Refresh the playlist.");
          closeMovie();
          return ctx.play(c, true);
        }
        if (a === "movie-check") {
          const c = currentChannel();
          ctx.checkSource(c);
          return;
        }
        if (a === "movie-folder") {
          const c = currentChannel();
          ctx.folderPick(c);
          return;
        }
        if (a === "movie-favorite") {
          ctx.favorite();
          b.innerHTML = icon("bookmark") + (state.favorites.includes(state.channel) ? "Remove from My list" : "Add to My list");
          return;
        }
        if (a === "saved-program") {
          const isReminder = state.group === "reminders", p = (isReminder ? state.reminders : state.savedPrograms || []).find((p2) => p2.key === b.dataset.bookmark), c = state.channels.find((c2) => c2.id === ((p == null ? void 0 : p.channelId) || (p == null ? void 0 : p.channel)));
          if (!p || !c) return;
          if (ctx.advanced.guardGroup(c.group, () => b.click())) return;
          return ctx.menu(p.title, [["Watch channel", () => {
            ctx.closeModal();
            ctx.play(c, true);
          }], ["Program description", () => ctx.programDetails(p, c)], ["Remove from My list", () => {
            const key = isReminder ? "reminders" : "savedPrograms";
            state[key] = state[key].filter((x) => x.key !== p.key);
            ctx.save(key);
            ctx.closeModal();
            renderMyList();
          }]], { context: true });
        }
        if (a === "health-check") {
          ctx.healthCheck();
          return;
        }
        if (a === "favorite-folders") {
          ctx.favoriteFolders();
          return;
        }
        if (a === "folder-filter") {
          state.activeFavFolder = b.dataset.name || "";
          ctx.navigate("guide");
          state.group = "Sevimlil\u0259r";
          ctx.refresh();
          return;
        }
        if (a === "toggle-mini") {
          ctx.toggleMini();
          return;
        }
        if (a === "mini-close") {
          ctx.toggleMini(true);
          return;
        }
        if (a === "mini-expand") {
          ctx.toggleMini(true);
          ctx.enterPlayer();
          return;
        }
        if (a === "player-history") return historyPanel();
        if (a === "recent-channel") {
          const c = state.channels.find((c2) => c2.id === b.dataset.id);
          ctx.closeModal();
          return ctx.play(c, ctx.platform.isPhone ? state.full : true);
        }
        if (a === "clear-recent") {
          state.history = state.playing ? [state.playing] : [];
          ctx.save("history");
          if ($("#modal-root").children.length) historyPanel();
          else showControls("info");
          return;
        }
        if (wizard && a !== "import") return await wizardAction(a);
        if (a === "import") return openImport();
        if (a === "home" || a === "welcome-back") {
          if (wizard) closeWizard(true);
          if (listMode) closeList();
          if (state.full) ctx.exitPlayer();
          ctx.closeModal();
          leaveWelcome();
          ctx.navigate("guide");
          setNav(0);
          return;
        }
        if (a === "welcome") return showWelcome();
        if (a === "playlists") return settings("sources");
        if (a === "playlist-select") {
          if (await ctx.activatePlaylist(b.dataset.id)) settings("sources");
          return;
        }
        if (a === "settings") return settings();
        if (a === "groups") return setNav(ctx.platform.isPhone ? nav ? 0 : 1 : nav ? nav - 1 : 1);
        if (a === "movie-back") return closeMovie();
        if (a === "channels") return openList();
        if (a === "close-list") return closeList();
        if (a === "about") return settings("about");
        if (a === "player-audio") return audioPanel();
        if (a === "player-subtitles") return subtitlePanel();
        if (a === "player-video") return videoTracks();
        if (a === "player-offset") return ctx.modal("Audio offset", '<p>0 ms</p><p class="note">Audio offset is unavailable in this webOS release.</p>', '<button class="primary" data-action="close">OK</button>');
        if (a === "sample") {
          ctx.closeModal();
          await ctx.resetDemo();
          leaveWelcome();
          setNav(0);
          return;
        }
        if (a.startsWith("setting-")) {
          const s = a.slice(8);
          if (s === "epg") return ctx.epgDialog();
          return settings(s);
        }
        if (a.startsWith("nav-") || a === "search") {
          if (ctx.platform.isPhone) {
            (_b3 = $("#movie-detail")) == null ? void 0 : _b3.remove();
            ctx.closeModal();
            if (listMode) closeList();
            setNav(0, false);
          }
          const target = a === "search" ? "search" : a.slice(4);
          if (target === "favorites") {
            ctx.navigate("mylist");
            state.group = "programs";
            ctx.refresh();
            leaveWelcome();
            setNav(1);
            return;
          } else ctx.navigate(target);
          leaveWelcome();
          setNav(0);
          return;
        }
        if (a === "list-channel") {
          const c = state.channels.find((c2) => c2.id === b.dataset.id), same = state.channel === c.id && state.playing === c.id;
          state.channel = c.id;
          state.selected = null;
          if (same && !ctx.platform.isPhone) {
            closeList();
            return ctx.play(c, true);
          }
          renderList();
          await ctx.play(c);
          renderList();
          return;
        }
        if (a === "list-program") {
          const p = channelPrograms(currentChannel()).find((p2) => p2.start === +b.dataset.start);
          if (p) ctx.programDetails(p, currentChannel());
        }
      } catch (err) {
        toast(err.message || "The operation could not be completed.");
      }
    });
    function afterNavigate() {
      var _a4, _b3;
      leaveWelcome();
      setNav(0, false);
      if (state.view === "movies" || state.view === "series" || state.view === "history") (_a4 = $(".movie-card")) == null ? void 0 : _a4.focus({ preventScroll: true });
      else if (state.view === "mylist") setNav(1);
      else if (state.view === "guide") (_b3 = $(".programme.selected")) == null ? void 0 : _b3.focus({ preventScroll: true });
    }
    function resetTransient() {
      if (wizard) closeWizard();
      if (listMode) closeList();
      setNav(0, false);
    }
    function activateOK(target) {
      if ($("#modal-root").children.length) {
        if ((target == null ? void 0 : target.isConnected) && target.matches("button")) target.click();
        return;
      }
      if (wizard) return wizardKey("Enter");
      if (welcome) return welcomeKey("Enter");
      if (listMode) return listKey("Enter");
      if (state.full) {
        if (state.controls && (target == null ? void 0 : target.closest(".player-buttons,#player-recents"))) target.click();
        else showControls("info");
        return;
      }
      if ((target == null ? void 0 : target.isConnected) && target.matches("button")) return target.click();
      return keyControl("Enter");
    }
    function longOK(target) {
      if (wizard || welcome || listMode || $("#modal-root").children.length) return activateOK(target);
      if (target == null ? void 0 : target.matches("#groups [data-group]")) return ctx.advanced.openGroupProperties(target.dataset.group);
      if (state.view === "movies" || state.view === "series" || state.view === "history") {
        if (target == null ? void 0 : target.matches("[data-movie],[data-series]")) target.click();
        return;
      }
      if (state.full) return ctx.advanced.longOK();
      if (target == null ? void 0 : target.matches("#groups [data-group]")) return ctx.advanced.openGroupProperties(target.dataset.group);
      if ((target == null ? void 0 : target.matches(".programme,.channel-name")) || !(target == null ? void 0 : target.closest("button"))) return ctx.advanced.longOK();
      activateOK(target);
    }
    function leftEligible() {
      return !state.full && !wizard && !welcome && !listMode && state.view === "guide" && nav === 0 && !$("#modal-root").children.length;
    }
    function shortLeft() {
      const c = currentChannel(), p = state.selected || programAt(c);
      if (p.start > programAt(c).start) return ctx.keyLegacy("ArrowLeft");
      setNav(1);
    }
    const press = createPressGesture({ short: (key, target) => key === "Enter" ? activateOK(target) : shortLeft(), long: (key, target) => key === "Enter" ? longOK(target) : ctx.keyLegacy("ArrowLeft") });
    window.addEventListener("keydown", (e) => {
      if (e.target.matches("input,textarea,select")) return;
      if (e.key === "Enter" || e.key === "ArrowLeft" && (leftEligible() || press.isHeld("ArrowLeft"))) {
        e.preventDefault();
        e.stopImmediatePropagation();
        press.down(e.key, e.target);
      }
    }, true);
    window.addEventListener("keyup", (e) => {
      if (press.isHeld(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        press.up(e.key);
      }
    }, true);
    window.addEventListener("blur", () => press.cancel());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) press.cancel();
    });
    function longBack() {
      if (!$("#modal-root").children.length && !wizard && !welcome && !state.full && state.playing) {
        ctx.enterPlayer();
        return;
      }
      webOSBack();
    }
    function webOSBack() {
      ctx.persistResume();
      if ($("#movie-detail")) return closeMovie();
      if (wizard) {
        if (wizard.edit) {
          wizard.edit = null;
          renderWizard();
        } else wizardBack();
        return;
      }
      if ($("#modal-root").children.length || $("#multiview")) return ctx.modalBack();
      if (listMode) return closeList();
      if (state.full) {
        if (!ctx.platform.isPhone && state.controls && state.playerMode === "tools") {
          state.controls = false;
          $("#player-controls").classList.add("hidden-controls");
          state.playerMode = "info";
          return;
        }
        return ctx.exitPlayer();
      }
      if (welcome) {
        leaveWelcome();
        setNav(0);
        return;
      }
      if (nav > 0) return setNav(nav - 1);
      if (state.view !== "guide") return ctx.navigate("guide");
      ctx.platform.exit();
    }
    return { syncPlaybackStatus, webOSBack, longBack, activateOK, displayMenu, sleepPanel, movieDetails, resetTransient, renderGroups, renderGuide, renderInfo, renderCards, renderSearch, openImport, keyControl, settings, showControls, context, ready, openSeriesItem, afterNavigate, showWelcome, leaveWelcome, openList, fastSelectGuide };
  }

  // src/startup.mjs
  function captureResume(state, previous = {}) {
    const result = { version: 1, ...previous };
    const selected = state.channels.find((c) => c.id === state.channel);
    const playing = state.channels.find((c) => c.id === state.playing);
    if (state.view === "guide" && (selected == null ? void 0 : selected.type) === "tv") {
      result.guideChannel = selected.id;
      result.guideGroup = state.group;
    }
    if ((playing == null ? void 0 : playing.type) === "tv") result.lastTVChannel = playing.id;
    return result;
  }
  function resumePlan(channels, saved = {}, prefs = {}, favorites = [], history = [], now = Date.now()) {
    const tv = channels.filter((c) => c.type === "tv");
    const exists = (id) => tv.find((c) => c.id === id);
    const last = exists(saved.lastTVChannel) || history.map(exists).find(Boolean);
    const selected = prefs.autoplay && last || exists(saved.guideChannel) || last || tv[0];
    let group = saved.guideGroup || "Ham\u0131s\u0131";
    if (group === "Sevimlil\u0259r") {
      if (!selected || !favorites.includes(selected.id)) group = "Ham\u0131s\u0131";
    } else if (group !== "Ham\u0131s\u0131" && (selected == null ? void 0 : selected.group) !== group) group = "Ham\u0131s\u0131";
    return {
      view: "guide",
      channel: (selected == null ? void 0 : selected.id) || null,
      group,
      window: Math.floor(now / 18e5) * 18e5,
      autoplay: !!(prefs.autoplay && selected),
      fullscreen: !!(prefs.autoplay && selected)
    };
  }

  // src/app.mjs
  var _a3, _b2;
  var VERSION2 = ((_b2 = (_a3 = window.TiviLoomNative) == null ? void 0 : _a3.appVersion) == null ? void 0 : _b2.call(_a3)) || VERSION;
  async function main() {
    var _a4, _b3, _c;
    const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
    const esc = (s) => String(s != null ? s : "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const safeImage = (s) => {
      try {
        return esc(platform.assetURL(s));
      } catch {
        return "";
      }
    };
    const fmt = (t) => new Date(t).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
    const date = (t) => {
      const d = new Date(t);
      return d.getDate() + " " + ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avqust", "sentyabr", "oktyabr", "noyabr", "dekabr"][d.getMonth()] + ", " + ["bazar", "bazar ert\u0259si", "\xE7\u0259r\u015F\u0259nb\u0259 ax\u015Fam\u0131", "\xE7\u0259r\u015F\u0259nb\u0259", "c\xFCm\u0259 ax\u015Fam\u0131", "c\xFCm\u0259", "\u015F\u0259nb\u0259"][d.getDay()];
    };
    const mins = (ms) => Math.max(0, Math.ceil(ms / 6e4));
    const initial = demoData();
    function read(key, fallback) {
      var _a5;
      try {
        return (_a5 = JSON.parse(localStorage.getItem("tl-" + key))) != null ? _a5 : fallback;
      } catch {
        return fallback;
      }
    }
    const state = { channels: initial.channels, programs: initial.programs, epgNames: {}, source: "TiviLoom n\xFCmun\u0259l\u0259ri", imported: false, view: "guide", group: "Ham\u0131s\u0131", query: "", channel: "demo-0", selected: null, playing: null, window: Math.floor(Date.now() / 18e5) * 18e5, full: false, controls: true, favorites: read("favorites", []), history: read("history", []), reminders: read("reminders", []), prefs: read("prefs", { compact: false, large: false, motion: true, groups: true, muted: platform.isPhone ? false : !platform.native, autoplay: false, fit: "contain" }), sleep: 0, watchProgress: read("watch-progress", read("watchProgress", {})), favCollections: read("fav-collections", read("favCollections", {})) };
    let resumeReady = false, resumeState = read("session-v1", {}), lastResumeJSON = "";
    let catalog = emptyCatalog(), libraryWrites = Promise.resolve(), libraryBusy = false;
    function persistPlaylistState() {
      if (!resumeReady || !catalog.activeId) return;
      try {
        localStorage.setItem("tl-playlist-state-" + catalog.activeId, JSON.stringify({ version: 1, resume: resumeState, favorites: state.favorites, history: state.history, reminders: state.reminders, savedPrograms: state.savedPrograms || [], ...cleanOptions(state, state.channels, state.favorites) }));
      } catch {
      }
    }
    function persistResume() {
      if (!resumeReady) return;
      const next = captureResume(state, resumeState), json = JSON.stringify(next);
      if (json === lastResumeJSON) return;
      try {
        localStorage.setItem("tl-session-v1", json);
        resumeState = next;
        lastResumeJSON = json;
        persistPlaylistState();
      } catch {
      }
    }
    let reconnectTimer = null, reconnectAttempts = 0, stallTimer = null;
    let playbackUIReady = false;
    function setPlaybackPhase(phase) {
      state.playbackPhase = state.playing ? phase : "idle";
      if (playbackUIReady) tvUI.syncPlaybackStatus();
    }
    let hls = null, playGeneration = 0, hlsFallbackGeneration = -1, controlTimer, toastTimer, sleepTimer, modalLastFocus, sessionToken, menuActions = {}, multis = [];
    let indexedPrograms = null, epgIndex = /* @__PURE__ */ new Map(), epgNameIndex = /* @__PURE__ */ new Map();
    const video = $("#video");
    video.muted = state.prefs.muted;
    let lastWatchWrite = 0;
    video.addEventListener("timeupdate", () => {
      const c = state.channels.find((x) => x.id === state.playing);
      if (!c || !["movie", "series"].includes(c.type) || !canSeek(video) || Date.now() - lastWatchWrite < 5e3) return;
      lastWatchWrite = Date.now();
      state.watchProgress[c.id] = { time: video.currentTime, duration: video.duration, updated: Date.now() };
      save("watchProgress");
    });
    video.addEventListener("ended", () => {
      const next = nextEpisode(state.nextEpisodes || [], state.playing);
      if (next) {
        menu("Next episode", [["\u25B6 " + next.name, () => {
          closeModal();
          play(next, true);
        }], ["Cancel", () => closeModal()]], { choice: true });
      }
    });
    video.addEventListener("loadedmetadata", () => {
      var _a5;
      const c = state.channels.find((x) => x.id === state.playing);
      if (!c || !["movie", "series"].includes(c.type) || !canSeek(video)) return;
      const offset = resumeOffset((_a5 = state.watchProgress[c.id]) == null ? void 0 : _a5.time, video.duration);
      if (offset && video.currentTime < 3) try {
        video.currentTime = offset;
      } catch {
      }
    });
    const videoSurface = createVideoSurface(video, $("#tv-screen"), $("#video-error"), () => {
      applyDisplayMode(video, videoSurface.host, state.prefs.fit);
      syncNativeBounds();
    });
    mountLogos(platform);
    function toolLabel(selector, text) {
      const el = $(selector);
      const label = el.querySelector(".tool-label");
      if (label) label.textContent = text;
      else el.textContent = text;
    }
    const libraryStore = createLibraryStore({ indexedDB: globalThis.indexedDB, storage: globalThis.localStorage });
    async function cache(action, value) {
      return action === "get" ? libraryStore.get() : action === "delete" ? libraryStore.delete() : libraryStore.put(value);
    }
    function writeCatalog(next) {
      const pending = libraryWrites.catch(() => {
      }).then(() => cache("put", next));
      libraryWrites = pending;
      return pending;
    }
    async function persistLibrary() {
      persistResume();
      if (!catalog.playlists.length && !state.imported && state.channels.length) catalog = addPlaylist(catalog, { ...state, name: state.source, resume: resumeState }, "demo-library");
      catalog = captureActive(catalog, state, resumeState);
      try {
        await writeCatalog(catalog);
        return true;
      } catch {
        toast("Yadda\u015Fa yaz\u0131lmad\u0131. Brauzerd\u0259 yer v\u0259 saxlama icaz\u0259sini yoxlay\u0131n.");
        return false;
      }
    }
    function save(key) {
      try {
        localStorage.setItem("tl-" + ({ watchProgress: "watch-progress", favCollections: "fav-collections" }[key] || key), JSON.stringify(state[key]));
        if (["favorites", "history", "reminders", "savedPrograms"].includes(key)) persistPlaylistState();
      } catch {
        toast("Brauzerin yadda\u015F\u0131na yazmaq m\xFCmk\xFCn olmad\u0131.");
      }
    }
    function stopMedia() {
      var _a5, _b4;
      if ($("#mini-player") && !$("#mini-player").hidden) toggleMini(true);
      clearTimeout(reconnectTimer);
      clearTimeout(stallTimer);
      reconnectTimer = null;
      reconnectAttempts = 0;
      (_b4 = (_a5 = window.TiviLoomNative) == null ? void 0 : _a5.stopNativePlayer) == null ? void 0 : _b4.call(_a5);
      document.documentElement.classList.remove("native-preview");
      ++playGeneration;
      hls == null ? void 0 : hls.destroy();
      hls = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
      state.playing = null;
      delete video.dataset.tiviSource;
      setPlaybackPhase("idle");
      $("#video-error").hidden = true;
      $("#preview-play").classList.remove("playing");
      $("#preview-play").textContent = "\u25B6";
    }
    function applyPlaylist(playlist) {
      var _a5, _b4;
      resumeReady = false;
      const saved = read("playlist-state-" + playlist.id, null);
      const p = overlayPlaylist(playlist, saved);
      Object.assign(state, { channels: p.channels, programs: p.programs || [], epgNames: p.epgNames || {}, source: p.name, sourceURL: p.sourceURL || "", epgURL: p.epgURL || "", imported: p.imported, favorites: p.favorites || [], history: p.history || [], reminders: p.reminders || [], savedPrograms: p.savedPrograms || [], playing: null, selected: null, query: "" });
      if (!p.imported) {
        const fresh = demoData(), order = p.channels.map((c) => c.id);
        state.channels = fresh.channels.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
        state.programs = fresh.programs;
      }
      Object.assign(state, { enabled: p.enabled !== false, userAgent: p.userAgent || "", updateHours: p.updateHours || 0, updateOnStart: !!p.updateOnStart, lastUpdated: p.lastUpdated || 0 }, cleanOptions(p, p.channels, p.favorites));
      resumeState = { ...p.resume };
      lastResumeJSON = "";
      const plan = resumePlan(state.channels, resumeState, state.prefs, state.favorites, state.history);
      Object.assign(state, { channel: plan.channel, group: ((_a5 = state.groupPins) == null ? void 0 : _a5[plan.group]) ? "Ham\u0131s\u0131" : plan.group, view: state.channels.some((c) => c.type === "tv") ? "guide" : "movies", window: plan.window });
      if (state.view === "movies") state.channel = ((_b4 = state.channels[0]) == null ? void 0 : _b4.id) || null;
      resumeReady = true;
      $("#preview-status").textContent = "KANAL SE\xC7\u0130N";
    }
    async function activatePlaylist(id) {
      if (libraryBusy) return false;
      if (id === catalog.activeId) return true;
      libraryBusy = true;
      try {
        persistResume();
        const next = choosePlaylist(captureActive(catalog, state, resumeState), id);
        await writeCatalog(next);
        stopMedia();
        tvUI.resetTransient();
        if (state.full) exitPlayer();
        catalog = next;
        applyPlaylist(activePlaylist(catalog));
        closeModal();
        tvUI.leaveWelcome();
        render();
        tvUI.afterNavigate();
        persistResume();
        return true;
      } catch {
        toast("Pleylist d\u0259yi\u015Fdirilm\u0259di. Yadda\u015F\u0131 yoxlay\u0131n.");
        return false;
      } finally {
        libraryBusy = false;
      }
    }
    async function storeNewPlaylist(data) {
      var _a5, _b4;
      if (libraryBusy) {
        state.libraryError = "Another library operation is running.";
        return false;
      }
      libraryBusy = true;
      let committed = false;
      state.libraryError = "";
      try {
        persistResume();
        const id = ((_b4 = (_a5 = globalThis.crypto) == null ? void 0 : _a5.randomUUID) == null ? void 0 : _b4.call(_a5)) || "playlist-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
        const next = addPlaylist(captureActive(catalog, state, resumeState), data, id);
        await writeCatalog(next);
        committed = true;
        stopMedia();
        if (state.full) exitPlayer();
        catalog = next;
        applyPlaylist(activePlaylist(catalog));
        return true;
      } catch (error) {
        state.libraryError = committed ? "Saved but display failed. Restart the app (" + error.name + ")." : error.message;
        toast(state.libraryError);
        return false;
      } finally {
        libraryBusy = false;
      }
    }
    function toast(s) {
      $("#toast").textContent = s;
      $("#toast").hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => $("#toast").hidden = true, 4200);
    }
    async function api(path, body = {}) {
      if (path === "source" && !Object.prototype.hasOwnProperty.call(body, "userAgent")) body = { ...body, userAgent: state.userAgent || "" };
      return platform.api(path, body);
    }
    function currentChannel() {
      return state.channels.find((c) => c.id === state.channel && channelVisible(c)) || state.channels.find(channelVisible) || null;
    }
    function channelPrograms(c) {
      var _a5;
      if (!c) return [];
      if (indexedPrograms !== state.programs) {
        indexedPrograms = state.programs;
        epgIndex = /* @__PURE__ */ new Map();
        epgNameIndex = /* @__PURE__ */ new Map();
        for (const p of state.programs) {
          if (!epgIndex.has(p.channel)) epgIndex.set(p.channel, []);
          epgIndex.get(p.channel).push(p);
        }
        for (const [id, ps] of epgIndex) {
          ps.sort((a, b) => a.start - b.start);
          const name = (_a5 = state.epgNames[id]) == null ? void 0 : _a5.toLowerCase();
          if (name) epgNameIndex.set(name, ps);
        }
      }
      return epgIndex.get(c.epgId) || epgIndex.get(c.id) || epgIndex.get(c.name.toLowerCase()) || epgNameIndex.get(c.name.toLowerCase()) || [];
    }
    function programAt(c, t = Date.now()) {
      return channelPrograms(c).find((p) => p.start <= t && p.end > t) || { channel: (c == null ? void 0 : c.epgId) || (c == null ? void 0 : c.id), start: Math.floor(t / 18e5) * 18e5, end: Math.floor(t / 18e5) * 18e5 + 18e5, title: "Proqram m\u0259lumat\u0131 yoxdur", description: "Bu kanal \xFC\xE7\xFCn XMLTV m\u0259nb\u0259yi \u0259lav\u0259 ed\u0259 v\u0259 ya ba\u015Fqa EPG m\u0259nb\u0259yi se\xE7\u0259 bil\u0259rsiniz.", empty: true };
    }
    function channelVisible(c) {
      return !(state.hiddenChannels || []).includes(c.id) && !(state.hiddenGroups || []).includes(c.group) && advanced.groupAccessible(c.group);
    }
    function channelsFor(type) {
      return state.channels.filter((c) => c.type === type && channelVisible(c));
    }
    function visibleChannels() {
      const type = state.view === "movies" ? "movie" : state.view === "series" ? "series" : "tv";
      let a = channelsFor(type);
      if (state.group === "Continue Watching") return a.filter((c) => {
        var _a5, _b4;
        return resumeOffset((_a5 = state.watchProgress[c.id]) == null ? void 0 : _a5.time, (_b4 = state.watchProgress[c.id]) == null ? void 0 : _b4.duration) > 0;
      }).sort((a2, b) => {
        var _a5, _b4;
        return (((_a5 = state.watchProgress[b.id]) == null ? void 0 : _a5.updated) || 0) - (((_b4 = state.watchProgress[a2.id]) == null ? void 0 : _b4.updated) || 0);
      });
      if (state.view === "movies" && state.group === "Recently Added") return a.filter((c) => c.added > 0).sort((a2, b) => b.added - a2.added);
      if (state.view === "movies" && state.group === "History") return state.history.map((id) => state.channels.find((c) => c.id === id && c.type === "movie" && channelVisible(c))).filter(Boolean);
      if (state.view === "history") return state.history.map((id) => state.channels.find((c) => c.id === id && channelVisible(c))).filter(Boolean);
      if (state.group === "Sevimlil\u0259r") {
        const index = new Map(a.map((c) => [c.id, c]));
        a = state.favorites.map((id) => index.get(id)).filter(Boolean).filter((c) => !state.activeFavFolder || state.favCollections[c.id] === state.activeFavFolder);
      } else if (state.group !== "Ham\u0131s\u0131") a = a.filter((c) => c.group === state.group);
      return a;
    }
    function channelNumber(c, index) {
      var _a5;
      return ((_a5 = state.channelNumbers) == null ? void 0 : _a5[c.id]) || index + 1;
    }
    function renderLogo(c) {
      var _a5;
      const url = ((_a5 = state.logoOverrides) == null ? void 0 : _a5[c.id]) || c.logo;
      return `<span class="channel-logo"><span class="logo-initials">${esc(initials(c.name))}</span>${url ? `<img data-logo-url="${safeImage(url)}" alt="">` : ""}</span>`;
    }
    function initials(name) {
      return name.replace(/^Loom\s*/, "").split(/\s+/).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
    }
    function logo(c) {
      return `<span class="channel-logo" style="${/^#[0-9a-f]{3,8}$/i.test(c.color) ? "color:" + c.color : ""}">${c.logo ? `<img src="${safeImage(c.logo)}" alt="" loading="lazy">` : esc(initials(c.name))}</span>`;
    }
    function applyPrefs() {
      document.body.classList.toggle("compact", state.prefs.compact);
      document.body.classList.toggle("large-text", state.prefs.large);
      document.body.classList.toggle("no-motion", !state.prefs.motion);
      document.body.classList.toggle("hidden-groups", !state.prefs.groups);
      applyDisplayMode(video, videoSurface.host, state.prefs.fit);
      video.muted = state.prefs.muted;
      toolLabel("#mute-button", video.muted ? "Unmute" : "Mute");
    }
    function renderGroups() {
      const a = state.channels.filter((c) => c.type === (state.view === "movies" ? "movie" : state.view === "series" ? "series" : "tv"));
      const groups = ["Ham\u0131s\u0131", "Sevimlil\u0259r", ...new Set(a.map((c) => c.group))];
      $("#groups").innerHTML = `<div class="group-label">${state.view === "movies" ? "Film kitabxanas\u0131" : state.view === "series" ? "Seriallar" : "Kanal qruplar\u0131"}</div>${groups.map((g) => `<button class="group-button ${g === state.group ? "active" : ""}" data-group="${esc(g)}"><span>${g === "Sevimlil\u0259r" ? "\u2606 " : ""}${esc(g)}</span><small>${g === "Ham\u0131s\u0131" ? a.length : g === "Sevimlil\u0259r" ? a.filter((c) => state.favorites.includes(c.id)).length : a.filter((c) => c.group === g).length}</small></button>`).join("")}<div class="source-label"><strong>${state.imported ? "AKT\u0130V PLEYLIST" : "N\xDCMUN\u018F PLEYLIST"}</strong>${esc(state.source)}<br><button data-action="import">\uFF0B Pleylist \u0259lav\u0259 et</button></div>`;
    }
    function renderInfo() {
      const c = currentChannel();
      if (!c) return;
      const p = state.selected || programAt(c);
      const now = Date.now();
      $("#program-meta").textContent = c.name + "  /  " + (c.demo ? "N\xFCmun\u0259 kanal" : c.group);
      $("#program-title").textContent = p.title;
      $("#program-time").innerHTML = `<span>${fmt(p.start)} \u2013 ${fmt(p.end)}</span><div class="progress-track"><i style="width:${Math.min(100, Math.max(0, (now - p.start) / (p.end - p.start) * 100))}%"></i></div><span>${p.end < now ? "Bitib" : p.start > now ? mins(p.start - now) + " d\u0259q sonra" : mins(p.end - now) + " d\u0259q qal\u0131b"}</span>`;
      $("#program-description").textContent = p.description || "Bu proqram \xFC\xE7\xFCn \u0259lav\u0259 t\u0259svir verilm\u0259yib.";
      $("#program-tags").textContent = p.category || c.group;
      $("#foot-status").textContent = (state.imported ? state.source : "N\xFCmun\u0259 rejimi") + " \xB7 " + visibleChannels().length + " m\u0259zmun";
      if (c.type === "movie") {
        $("#program-meta").textContent = c.group + " / F\u0130LM";
        $("#program-title").textContent = c.name;
        $("#program-time").textContent = (c.year ? c.year + " \xB7 " : "") + (c.demo ? "N\xFCmun\u0259 film kart\u0131" : "Pleylistinizd\u0259n");
        $("#program-description").textContent = c.description || "Filmi oynatmaq v\u0259 siyah\u0131n\u0131za \u0259lav\u0259 etm\u0259k \xFC\xE7\xFCn kart\u0131 a\xE7\u0131n.";
        $("#program-tags").textContent = "FILM";
      }
    }
    function renderGuide() {
      const a = visibleChannels();
      const start = state.window, end = start + 72e5;
      const now = Date.now();
      if (!a.length) {
        $("#content").innerHTML = `<div class="empty"><h2>${state.group === "Sevimlil\u0259r" ? "Sevimli kanal yoxdur" : "Kanal tap\u0131lmad\u0131"}</h2><p>Kanal \xFCz\u0259rind\u0259 sa\u011F klik v\u0259 ya M d\xFCym\u0259si il\u0259 menyunu a\xE7\u0131n.</p><button class="secondary" data-action="import">Pleylist \u0259lav\u0259 et</button></div>`;
        return;
      }
      if (!a.some((c) => c.id === state.channel)) {
        state.channel = a[0].id;
        state.selected = programAt(a[0]);
      }
      $("#content").innerHTML = `<div class="guide-wrap"><div class="content-header"><h2>${esc(state.group === "Ham\u0131s\u0131" ? "TV c\u0259dv\u0259li" : state.group)}</h2><small>${a.length} kanal</small><div class="right"><button data-action="time-back" aria-label="30 d\u0259qiq\u0259 geri">\u2039</button><span>${date(start)}</span><button data-action="time-next" aria-label="30 d\u0259qiq\u0259 ir\u0259li">\u203A</button><button data-action="now" class="now-button">\u0130ndi</button></div></div><div class="timeline"><span class="channel-col">KANALLAR</span><div class="time-slots">${[0, 1, 2, 3].map((i) => `<span>${fmt(start + i * 18e5)}</span>`).join("")}</div></div><div class="guide-scroll">${a.map((c, i) => {
        let ps = channelPrograms(c).filter((p) => p.end > start && p.start < end);
        if (!ps.length) ps = [{ ...programAt(c, start), start, end }];
        return `<div class="guide-row" data-row="${esc(c.id)}"><button class="channel-name" data-channel="${esc(c.id)}" title="${esc(c.name)}"><span class="num">${i + 1}</span>${logo(c)}<span class="label">${esc(c.name)}</span>${state.favorites.includes(c.id) ? '<span class="favorite-dot">\u2605</span>' : ""}</button><div class="programs">${ps.map((p) => {
          var _a5, _b4;
          const l = Math.max(0, (p.start - start) / 72e5 * 100), r = Math.min(100, (p.end - start) / 72e5 * 100);
          return `<button class="programme ${p.start <= now && p.end > now ? "current" : ""} ${c.id === state.channel && p.start === ((_b4 = (_a5 = state.selected) == null ? void 0 : _a5.start) != null ? _b4 : programAt(c).start) ? "selected" : ""}" data-program="${p.start}" data-channel-id="${esc(c.id)}" style="left:${l}%;width:${r - l}%" tabindex="${c.id === state.channel ? 0 : -1}"><span>${esc(p.title)}</span></button>`;
        }).join("")}${now >= start && now < end ? `<i class="now-line" style="left:${(now - start) / 72e5 * 100}%"></i>` : ""}</div></div>`;
      }).join("")}</div></div>`;
      renderInfo();
    }
    function renderCards() {
      const a = visibleChannels();
      $("#content").innerHTML = `<div class="content-header"><h2>${state.view === "history" ? "Son izl\u0259n\u0259nl\u0259r" : esc(state.group === "Ham\u0131s\u0131" ? "Filml\u0259r" : state.group)}</h2><small>${a.length} m\u0259zmun</small><span class="right"><small>${state.imported ? "Pleylistinizd\u0259n" : "Orijinal n\xFCmun\u0259 kartlar\u0131"}</small></span></div>${a.length ? `<div class="card-grid">${a.map((c) => `<button class="movie-card" data-movie="${esc(c.id)}"><div class="poster"><img src="${safeImage(c.poster || c.logo || "assets/poster-0.svg")}" alt="" loading="lazy"></div><strong>${esc(c.name)}</strong><small>${c.year || ""} ${c.demo ? "\xB7 N\xFCmun\u0259" : esc(c.group)} ${state.favorites.includes(c.id) ? "\u2605" : ""}</small></button>`).join("")}</div>` : '<div class="empty"><h2>H\u0259l\u0259 m\u0259zmun yoxdur</h2><p>\u0130zl\u0259diyiniz kanallar burada g\xF6r\xFCn\u0259c\u0259k.</p></div>'}`;
    }
    function renderSearch() {
      const q = state.query.toLowerCase().trim();
      const found = state.channels.filter((c) => !q || c.name.toLowerCase().includes(q) || c.group.toLowerCase().includes(q)).slice(0, 150);
      const programs = q ? state.programs.filter((p) => p.title.toLowerCase().includes(q) && p.end > Date.now()).slice(0, 40) : [];
      $("#content").innerHTML = `<div class="search-bar"><input id="search-input" value="${esc(state.query)}" placeholder="Kanal, film v\u0259 ya proqram axtar\u2026" aria-label="Kanal v\u0259 proqram axtar\u0131\u015F\u0131"><button data-action="search-clear" class="secondary">T\u0259mizl\u0259</button></div><div class="result-list"><div class="group-label">${found.length} kanal / film \xB7 ${programs.length} proqram</div>${found.map((c) => `<button class="result" data-result="${esc(c.id)}">${logo(c)}<span>${esc(c.name)}</span><small>${esc(c.group)} \xB7 ${c.type === "movie" ? "Film" : "TV"}</small></button>`).join("")}${programs.map((p) => `<button class="result" data-remind="${esc(p.channel)}" data-start="${p.start}"><span>\u25F7</span><span>${esc(p.title)}</span><small>${fmt(p.start)}</small></button>`).join("")}${!found.length && !programs.length ? '<div class="empty">N\u0259tic\u0259 tap\u0131lmad\u0131.</div>' : ""}</div>`;
    }
    function render() {
      renderGroups();
      $$(".topbar .nav").forEach((n) => n.classList.toggle("active", n.dataset.action === state.view));
      if (state.view === "guide") renderGuide();
      else if (state.view === "search") renderSearch();
      else renderCards();
      renderInfo();
      persistResume();
      videoSurface.refresh();
    }
    function navigate(view) {
      var _a5, _b4;
      state.view = view;
      state.group = "Ham\u0131s\u0131";
      state.selected = null;
      if (view === "movies") state.channel = ((_a5 = state.channels.find((c) => c.type === "movie")) == null ? void 0 : _a5.id) || state.channel;
      render();
      if (view === "search") (_b4 = $("#search-input")) == null ? void 0 : _b4.focus();
    }
    let selectionPersistTimer = null;
    function select(c, p, focus = false) {
      var _a5;
      state.channel = c.id;
      state.selected = p || programAt(c);
      if (tvUI.fastSelectGuide(c, state.selected, focus)) {
        clearTimeout(selectionPersistTimer);
        selectionPersistTimer = setTimeout(persistResume, 650);
        return;
      }
      persistResume();
      renderGuide();
      if (focus) {
        const row2 = $$("[data-row]").find((r) => r.dataset.row === c.id);
        (_a5 = row2 == null ? void 0 : row2.querySelector(".selected")) == null ? void 0 : _a5.focus({ preventScroll: true });
        row2 == null ? void 0 : row2.scrollIntoView({ block: "nearest" });
      }
    }
    async function mediaURL(c) {
      if (c.demo) return platform.assetURL(c.url);
      return (await api("media", { url: c.url, userAgent: c.userAgent || state.userAgent || "", referer: c.referer || "" })).url;
    }
    async function attachVideo(v, c, extra = false, valid = () => true, forceHls = false) {
      const url = await mediaURL(c);
      if (!valid()) return null;
      let instance = null;
      if (playbackEngine(v, url, { native: platform.native || platform.isPhone, Hls: window.Hls, forceHls }) === "hlsjs") {
        instance = new Hls({ enableWorker: true, manifestLoadingMaxRetry: 2, levelLoadingMaxRetry: 2, fragLoadingMaxRetry: 2 });
        if (!extra) instance.on(Hls.Events.ERROR, (_, d) => {
          if (d.fatal && valid() && state.playing === c.id) showVideoError(playbackError(null, { url: c.url, hls: d }));
        });
        instance.loadSource(url);
        instance.attachMedia(v);
      } else v.src = url;
      v.loop = !!c.demo;
      return instance;
    }
    function showVideoError(message) {
      setPlaybackPhase("error");
      if (state.full) $("#player-info").textContent = message;
      $("#video-error").textContent = message;
      $("#video-error").hidden = false;
      $("#preview-play").classList.remove("playing");
      if (state.prefs.autoReconnect === false || document.hidden || !state.playing || reconnectTimer || /401|403|404|kodek|format|OK \/ Play/.test(message)) return;
      const delay = reconnectDelay(reconnectAttempts + 1);
      if (delay === null) return;
      const channel = state.playing;
      reconnectAttempts++;
      $("#video-error").textContent = message + " \xB7 Reconnecting " + reconnectAttempts + "/3\u2026";
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (state.playing === channel && !document.hidden) play(state.channels.find((c) => c.id === channel), state.full, true);
      }, delay);
    }
    async function playableStart(promise) {
      if (!promise || typeof promise.then !== "function") return;
      let timer;
      try {
        return await Promise.race([promise, new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error("Playback response timed out after 18 seconds.")), 18e3);
        })]);
      } finally {
        clearTimeout(timer);
      }
    }
    async function play(c, fullscreen = false, automatic = false) {
      var _a5, _b4, _c2, _d, _e, _f, _g;
      if (!c) return;
      if (advanced.guardGroup(c.group, () => play(c, fullscreen, automatic))) return;
      if (advanced.guard("channel", () => play(c, fullscreen, automatic), c)) return;
      if (((_a5 = window.TiviLoomNative) == null ? void 0 : _a5.openNativePlayer) && !c.demo) {
        const generation2 = ++playGeneration;
        try {
          const url = await mediaURL(c);
          if (generation2 !== playGeneration) return;
          const payload = JSON.stringify({ url, name: c.name, fullscreen, muted: !!state.prefs.muted, autoReconnect: state.prefs.autoReconnect !== false, fit: state.prefs.fit || "contain", userAgent: c.userAgent || state.userAgent || "TiviLoom-Android/" + VERSION2, referer: c.referer || "", catalogue: state.channels.filter((x) => {
            var _a6, _b5;
            return !((_a6 = state.hiddenChannels) == null ? void 0 : _a6.includes(x.id)) && !((_b5 = state.hiddenGroups) == null ? void 0 : _b5.includes(x.group)) && advanced.groupAccessible(x.group);
          }).map(({ id, name, group }) => ({ id, name, group })), history: [c.id, ...state.history.filter((id) => id !== c.id)].slice(0, 60) });
          if (!window.TiviLoomNative.openNativePlayer(payload)) throw Error("Native player could not be opened.");
          video.pause();
          if (hls) {
            hls.destroy();
            hls = null;
          }
          if (video.hasAttribute("src")) {
            video.removeAttribute("src");
            video.load();
          }
          state.channel = c.id;
          state.playing = c.id;
          state.full = fullscreen;
          state.playbackPhase = "loading";
          document.documentElement.classList.add("native-preview");
          state.history = [c.id, ...state.history.filter((id) => id !== c.id)].slice(0, 60);
          save("history");
          persistResume();
          $("#player").hidden = !fullscreen;
          videoSurface.place(fullscreen ? $("#player") : $("#preview"), fullscreen);
          $("#player-channel").textContent = c.name;
          $("#player-info").textContent = c.name;
          $("#preview-status").textContent = c.name;
          renderInfo();
          syncNativeBounds();
          return;
        } catch (error) {
          state.playing = null;
          state.full = false;
          (_c2 = (_b4 = window.TiviLoomNative).stopNativePlayer) == null ? void 0 : _c2.call(_b4);
          document.documentElement.classList.remove("native-preview");
          setPlaybackPhase("idle");
          toast("Native playback: " + error.message);
          return;
        }
      }
      (_e = (_d = window.TiviLoomNative) == null ? void 0 : _d.stopNativePlayer) == null ? void 0 : _e.call(_d);
      document.documentElement.classList.remove("native-preview");
      if (c.type !== "series") state.nextEpisodes = null;
      if (advanced.guardGroup(c.group, () => play(c, fullscreen, automatic))) return;
      if (advanced.guard("channel", () => play(c, fullscreen), c)) return;
      if (!automatic) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
        reconnectAttempts = 0;
      }
      if (state.channel !== c.id) state.selected = null;
      state.channel = c.id;
      const retry = !$("#video-error").hidden || !!video.error;
      const generation = ++playGeneration;
      const valid = () => generation === playGeneration;
      let failed = false;
      $("#video-error").hidden = true;
      $("#preview-status").textContent = c.demo ? "YERL\u0130 N\xDCMUN\u018F V\u0130DEO" : "YAYIM A\xC7ILIR";
      if (state.playing !== c.id || retry || video.dataset.tiviSource !== c.url) {
        if (hls) {
          hls.destroy();
          hls = null;
        }
        video.pause();
        video.removeAttribute("src");
        video.load();
        state.playing = c.id;
        video.dataset.tiviSource = c.url;
        setPlaybackPhase("loading");
        if (fullscreen && !state.full) {
          state.full = true;
          $("#player").hidden = false;
          videoSurface.place($("#player"), true);
          $("#player-info").textContent = "Loading: " + c.name;
        }
        persistResume();
        try {
          const instance = await attachVideo(video, c, false, valid);
          if (!valid()) {
            instance == null ? void 0 : instance.destroy();
            return;
          }
          hls = instance;
          try {
            await playableStart(video.play());
          } catch (error) {
            if (!valid()) return;
            if (!instance && ((_f = window.Hls) == null ? void 0 : _f.isSupported()) && ["hls", "unknown"].includes(streamKind(c.url)) && (error.name === "NotSupportedError" || ((_g = video.error) == null ? void 0 : _g.code) === 4)) {
              video.pause();
              video.removeAttribute("src");
              video.load();
              $("#video-error").hidden = true;
              const fallback = await attachVideo(video, c, false, valid, true);
              if (!valid()) {
                fallback == null ? void 0 : fallback.destroy();
                return;
              }
              hls = fallback;
              await playableStart(video.play());
            } else throw error;
          }
        } catch (error) {
          if (valid()) {
            failed = true;
            const reason = playbackError(video.error || error, { url: c.url });
            showVideoError(reason);
            if (!c.demo && ["movie", "series"].includes(c.type)) {
              api("probe", { url: c.url, userAgent: c.userAgent || state.userAgent || "", referer: c.referer || "" }).then((report) => {
                if (valid() && failed) showVideoError(reason + " \xB7 " + describeProbe(report));
              }).catch(() => {
              });
            }
          }
        }
      } else {
        try {
          await playableStart(video.play());
        } catch (error) {
          failed = true;
          showVideoError(playbackError(video.error || error, { url: c.url }));
        }
      }
      if (generation !== playGeneration) return;
      if (failed) {
        $("#preview-status").textContent = "YAYIM A\xC7ILMADI";
        $("#player-channel").textContent = c.name;
        if (fullscreen) enterPlayer();
        return;
      }
      setPlaybackPhase(video.paused ? "paused" : "playing");
      state.history = [c.id, ...state.history.filter((id) => id !== c.id)].slice(0, 60);
      save("history");
      $("#preview-play").classList.add("playing");
      $("#preview-play").textContent = "\u26F6";
      $("#preview-status").textContent = c.demo ? "YERL\u0130 N\xDCMUN\u018F V\u0130DEO" : c.name;
      $("#player-channel").textContent = c.name;
      $("#player-info").textContent = c.type === "movie" ? c.name : programAt(c).title;
      renderInfo();
      if (fullscreen) enterPlayer();
    }
    function toggleMini(forceClose = false) {
      let mini = $("#mini-player");
      if (!mini) {
        mini = document.createElement("section");
        mini.id = "mini-player";
        mini.hidden = true;
        mini.innerHTML = '<div id="mini-video-host"></div><div class="mini-actions"><span>MINI PLAYER</span><div><button data-tv="mini-expand">Expand</button><button data-tv="mini-close">\u2715</button></div></div>';
        $("#tv-screen").append(mini);
      }
      if (forceClose || !mini.hidden) {
        mini.hidden = true;
        videoSurface.place(state.full ? $("#player") : $("#preview"), state.full);
        return;
      }
      if (!state.playing) {
        toast("Start a channel or movie first.");
        return;
      }
      if (state.full) {
        state.full = false;
        $("#player").hidden = true;
      }
      mini.hidden = false;
      videoSurface.place($("#mini-video-host"));
      video.muted = state.prefs.muted;
    }
    async function checkSource(c) {
      if (!c || !c.url || c.demo) return toast("Select a provider channel or movie first.");
      modal("Source diagnostics", "<p>Checking connection to the content provider\u2026</p>", "");
      try {
        const result = await api("probe", { url: c.url, userAgent: c.userAgent || state.userAgent || "", referer: c.referer || "" });
        if ($("#modal-root").children.length) modal("Source diagnostics", `<p>${esc(c.name)}</p><p>${esc(describeProbe(result))}</p><p class="note">HTTP reachability does not guarantee the TV supports the video codec. A playlist URL cannot be verified without the provider responding.</p>`, '<button data-action="close" class="secondary">Close</button>');
      } catch (e) {
        toast(e.message);
      }
    }
    async function healthCheck() {
      const channels = channelsFor("tv").slice(0, 12);
      if (!channels.length) return toast("No channels to test.");
      modal("Channel Health Check", "<p>Testing first " + channels.length + ' TV channels (server reachability, not codec decoding)\u2026</p><div id="health-results"></div>', "", { panel: true });
      for (const c of channels) {
        let info;
        try {
          info = await api("probe", { url: c.url, userAgent: c.userAgent || state.userAgent || "", referer: c.referer || "" });
        } catch (e) {
          info = { status: 0, message: e.message };
        }
        const results = $("#health-results");
        if (!results) break;
        const row2 = document.createElement("div");
        row2.className = "health-row " + (info.status >= 200 && info.status < 400 ? "health-good" : "health-bad");
        row2.textContent = c.name + " \u2014 " + describeProbe(info);
        results.append(row2);
      }
    }
    function favoriteFolders() {
      const folders = ["All", ...new Set(Object.values(state.favCollections || {}).filter(Boolean))];
      modal("Favorite folders", `<div class="menu-list">${folders.map((name) => `<button data-tv="folder-filter" data-name="${esc(name === "All" ? "" : name)}">${esc(name)}</button>`).join("")}</div>`, "", { panel: true });
    }
    function folderPick(c) {
      if (!c) return;
      const names = [...new Set(Object.values(state.favCollections || {}).filter(Boolean))];
      const current = state.favCollections[c.id] || "Unsorted";
      modal("Favorite folder", `<p>${esc(c.name)}</p><p>Current folder: ${esc(current)}</p><form id="folder-form"><label>Folder name<input id="folder-name" maxlength="32" value="${esc(current === "Unsorted" ? "" : current)}" placeholder="Sports, News, Kids\u2026"></label><button class="primary" type="submit">Save folder</button></form><p>${names.length ? "Existing: " + esc(names.join(" \xB7 ")) : ""}</p>`, '<button data-action="close" class="secondary">Close</button>');
    }
    document.addEventListener("submit", (event) => {
      var _a5;
      if (event.target.id !== "folder-form") return;
      event.preventDefault();
      const c = currentChannel();
      if (!c) return;
      const folder = (_a5 = $("#folder-name")) == null ? void 0 : _a5.value.trim();
      if (!folder) {
        delete state.favCollections[c.id];
        save("favCollections");
        closeModal();
        return toast("Folder assignment removed");
      }
      if (!state.favorites.includes(c.id)) favorite(c);
      state.favCollections[c.id] = folder;
      save("favCollections");
      closeModal();
      toast("Saved to " + folder);
    });
    function enterPlayer() {
      var _a5, _b4;
      if (((_a5 = window.TiviLoomNative) == null ? void 0 : _a5.nativeFullscreen) && document.documentElement.classList.contains("native-preview")) {
        state.full = true;
        $("#player").hidden = false;
        videoSurface.place($("#player"), true);
        window.TiviLoomNative.nativeFullscreen(true);
        syncNativeBounds();
        return;
      }
      const c = state.channels.find((c2) => c2.id === state.playing) || currentChannel();
      if (((_b4 = window.TiviLoomNative) == null ? void 0 : _b4.openNativePlayer) && c && !c.demo) return play(c, true);
      state.full = true;
      $("#player").hidden = false;
      videoSurface.place($("#player"), true);
      showControls("info");
      if (state.playing && video.paused && !video.error) video.play().catch(() => {
      });
    }
    function exitPlayer() {
      var _a5, _b4;
      (_b4 = (_a5 = window.TiviLoomNative) == null ? void 0 : _a5.nativeFullscreen) == null ? void 0 : _b4.call(_a5, false);
      persistResume();
      state.full = false;
      $("#player").hidden = true;
      videoSurface.place($("#preview"));
      if (state.view === "guide") renderGuide();
    }
    function showControls() {
      state.controls = true;
      $("#player-controls").classList.remove("hidden-controls");
      clearTimeout(controlTimer);
      controlTimer = setTimeout(() => {
        if (state.full && !$("#modal-root").children.length) {
          state.controls = false;
          $("#player-controls").classList.add("hidden-controls");
        }
      }, 6e3);
    }
    const dialogStack = new DialogStack();
    let dialogOrigin = null, modalResume = null;
    function closeModal() {
      const multi = $("#multiview");
      if (multi) {
        multis.forEach((x) => {
          var _a5;
          (_a5 = x.h) == null ? void 0 : _a5.destroy();
          x.v.pause();
          x.v.removeAttribute("src");
          x.v.load();
        });
        multis = [];
        multi.remove();
        if (state.playing) video.play().catch(() => {
        });
      }
      $("#modal-root").textContent = "";
      dialogStack.clear();
      menuActions = {};
      if (dialogOrigin == null ? void 0 : dialogOrigin.isConnected) dialogOrigin.focus({ preventScroll: true });
      dialogOrigin = null;
      if (state.full) showControls();
    }
    function modalBack() {
      var _a5;
      const frame = dialogStack.back();
      if (!frame) return closeModal();
      $("#modal-root").textContent = "";
      $("#modal-root").appendChild(frame.node);
      menuActions = frame.actions;
      modalResume = frame.resume;
      if (frame.resume) {
        frame.resume();
        return;
      }
      ((_a5 = frame.focus) == null ? void 0 : _a5.isConnected) && frame.focus.focus({ preventScroll: true });
    }
    function modal(title, body, actions = "", opts = {}) {
      var _a5;
      const root = $("#modal-root"), key = opts.key || title;
      if (!root.children.length) {
        dialogStack.clear();
        dialogOrigin = document.activeElement;
      }
      dialogStack.enter(key, () => ({ node: root.firstElementChild, actions: menuActions, focus: document.activeElement, resume: modalResume }));
      menuActions = {};
      modalResume = opts.resume || null;
      modalLastFocus = document.activeElement;
      root.innerHTML = `<div class="overlay ${opts.panel ? "panel-overlay" : ""} ${opts.choice ? "choice-overlay" : ""} ${opts.context ? "context-overlay" : ""} ${opts.program ? "program-overlay" : ""}"><section role="dialog" aria-modal="true" aria-label="${esc(title)}" class="${opts.panel ? "settings-panel" : "dialog"} ${opts.choice ? "choice-dialog" : ""} ${opts.context ? "context-dialog" : ""} ${opts.program ? "program-dialog" : ""}"><div class="dialog-header"><h2>${esc(title)}</h2><button data-action="modal-back" aria-label="Back" title="Back">\u2039</button></div>${opts.panel ? `<div class="settings-body">${body}</div>` : `<div class="dialog-body">${body}</div>${actions ? `<div class="dialog-actions">${actions}</div>` : ""}`}</section></div>`;
      (_a5 = root.querySelector("input:not([type=file]):not([type=checkbox])") || root.querySelector(".primary") || root.querySelector(".settings-body button:not(:disabled)") || root.querySelector("button")) == null ? void 0 : _a5.focus();
    }
    function menu(title, items, opts = {}) {
      var _a5;
      const actions = {};
      items.forEach((it, i) => {
        if (Array.isArray(it)) actions[i] = it[1];
      });
      modal(title, items.map((it, i) => !Array.isArray(it) ? `<div class="menu-section">${esc(it.heading)}</div>` : `<button data-menu="${i}" ${it[3] ? "disabled" : ""}><span>${opts.choice ? `<i class="choice-radio ${it[2] ? "selected" : ""}"></i>` : ""}${esc(it[0])}</span>${it[2] && !opts.choice ? `<small>${esc(it[2])}</small>` : ""}</button>`).join(""), "", opts);
      menuActions = actions;
      $("#modal-root .dialog-body").className = opts.compact ? "menu-list compact-menu" : "menu-list";
      (_a5 = $("#modal-root [data-menu]:not(:disabled)")) == null ? void 0 : _a5.focus();
    }
    function bookmarkProgram(p, c) {
      if (!p || p.empty || !c) return toast("No programme information is available.");
      const key = c.id + "|" + p.start;
      state.savedPrograms = [{ key, channelId: c.id, title: p.title, start: p.start, end: p.end, description: p.description || "" }, ...(state.savedPrograms || []).filter((x) => x.key !== key)].slice(0, 200);
      save("savedPrograms");
      toast("Added to My list.");
    }
    function programActions(p, c) {
      state.selected = p;
      state.channel = c.id;
      const archive = archiveURL(c, p);
      menu(p.title, [{ heading: p.title }, ...archive ? [["\u25B6 Watch archive", () => {
        closeModal();
        play({ ...c, url: archive }, true);
      }]] : [], ...p.start > Date.now() ? [["Remind", () => reminder(p, c)]] : [], ["Watch channel", () => {
        closeModal();
        play(c, true);
      }], ["Add to My list", () => {
        bookmarkProgram(p, c);
        modalBack();
      }], ["Program description", () => programDetails(p, c)]], { context: true, key: "program-actions" });
    }
    function favorite(c = currentChannel()) {
      if (!c) return;
      state.favorites = state.favorites.includes(c.id) ? state.favorites.filter((id) => id !== c.id) : [...state.favorites, c.id];
      state.channelNumbers = cleanOptions(state, state.channels, state.favorites).channelNumbers;
      save("favorites");
      void persistLibrary();
      toast(state.favorites.includes(c.id) ? "Sevimlil\u0259r\u0259 \u0259lav\u0259 edildi" : "Sevimlil\u0259rd\u0259n \xE7\u0131xar\u0131ld\u0131");
      render();
    }
    function reminder(p, c) {
      if (!p || p.empty) return toast("Bu proqram \xFC\xE7\xFCn vaxt m\u0259lumat\u0131 yoxdur.");
      if (p.start <= Date.now()) return toast("Yaln\u0131z g\u0259l\u0259c\u0259k proqram \xFC\xE7\xFCn xat\u0131rlatma qurulur.");
      const key = p.channel + "|" + p.start;
      state.reminders = state.reminders.filter((r) => r.key !== key);
      state.reminders.push({ key, title: p.title, start: p.start, channel: c == null ? void 0 : c.id });
      save("reminders");
      closeModal();
      toast("Xat\u0131rlatma quruldu. T\u0259tbiq a\xE7\u0131q qalmal\u0131d\u0131r.");
    }
    function context() {
      const c = currentChannel();
      if (!c) return;
      const p = state.selected || programAt(c);
      menu(c.name, [["\u25B6 Oynat", () => {
        closeModal();
        play(c, true);
      }], [state.favorites.includes(c.id) ? "\u2605 Sevimlil\u0259rd\u0259n \xE7\u0131xar" : "\u2606 Sevimlil\u0259r\u0259 \u0259lav\u0259 et", () => {
        favorite(c);
        closeModal();
      }], ["Proqram haqq\u0131nda", () => programDetails(p, c)], ["\u25F7 Xat\u0131rlatma qur", () => reminder(p, c)], ["Kanal\u0131 yuxar\u0131 k\xF6\xE7\xFCr", () => moveChannel(c, -1)], ["Kanal\u0131 a\u015Fa\u011F\u0131 k\xF6\xE7\xFCr", () => moveChannel(c, 1)], ["\u229E \xC7oxlu ekran", () => {
        closeModal();
        openMulti();
      }], ["Pleylist v\u0259 EPG", () => settings("sources")]]);
    }
    function moveChannel(c, dir) {
      const a = visibleChannels();
      const i = a.findIndex((x2) => x2.id === c.id);
      const other = a[i + dir];
      if (!other) return toast("Kanal siyah\u0131n\u0131n s\u0259rh\u0259dind\u0259dir.");
      const x = state.channels.findIndex((x2) => x2.id === c.id), y = state.channels.findIndex((x2) => x2.id === other.id);
      [state.channels[x], state.channels[y]] = [state.channels[y], state.channels[x]];
      persistLibrary();
      closeModal();
      render();
      toast("Kanal\u0131n s\u0131ras\u0131 saxlan\u0131ld\u0131");
    }
    function programDetails(p, c) {
      const archive = archiveURL(c, p);
      modal(p.title, `<div class="eyebrow">${esc((c == null ? void 0 : c.name) || "")} \xB7 ${fmt(p.start)}\u2013${fmt(p.end)}</div><p>${esc(p.description || "\u018Flav\u0259 t\u0259svir yoxdur.")}</p>${p.start > Date.now() ? '<p class="note">Xat\u0131rlatma bu p\u0259nc\u0259r\u0259 a\xE7\u0131q oldu\u011Fu m\xFCdd\u0259td\u0259 i\u015Fl\u0259yir.</p>' : p.end < Date.now() && !archive ? '<p class="note">Provayder bu proqram \xFC\xE7\xFCn catch-up \xFCnvan\u0131 verm\u0259yib.</p>' : ""}`, `${archive ? '<button class="primary" data-action="archive-selected">\u25B6 Arxivd\u0259n oynat</button>' : ""}<button class="primary" data-action="${p.start > Date.now() ? "remind-selected" : "play-selected"}">${p.start > Date.now() ? "Xat\u0131rlat" : "Kanal\u0131 oynat"}</button><button class="secondary" data-action="close">Ba\u011Fla</button>`, { program: true, key: "program-description" });
      state.selected = p;
      if (c) state.channel = c.id;
    }
    function movieDetails(c) {
      state.channel = c.id;
      modal(c.name, `${c.poster ? `<img class="details-poster" src="${safeImage(c.poster)}" alt="">` : ""}<div class="eyebrow">${c.year || ""} \xB7 ${esc(c.group)}</div><p>${esc(c.description || "Bu film \xFC\xE7\xFCn t\u0259svir pleylistd\u0259 t\u0259qdim edilm\u0259yib.")}</p>${c.demo ? '<p class="note">Bu, n\xFCmun\u0259 kart\u0131d\u0131r. Oynat d\xFCym\u0259si yerli s\u0131naq videosunu a\xE7acaq.</p>' : ""}<div style="clear:both"></div>`, `<button class="primary" data-action="play-selected">\u25B6 Oynat</button><button class="secondary" data-action="favorite">${state.favorites.includes(c.id) ? "\u2605 Siyah\u0131dad\u0131r" : "\u2606 Siyah\u0131ma \u0259lav\u0259 et"}</button>`);
    }
    function importDialog() {
      modal("Pleylist \u0259lav\u0259 et", `<p>M3U pleylistinin \xFCnvan\u0131n\u0131 yaz\u0131n v\u0259 ya komp\xFCterd\u0259n fayl se\xE7in.</p><label>Pleylistin ad\u0131<input id="source-name" placeholder="M\u0259nim televiziyam" maxlength="80"></label><label>M3U / M3U8 \xFCnvan\u0131<input id="source-url" type="url" placeholder="https://provider.example/playlist.m3u" autocomplete="off" spellcheck="false"></label><label>V\u0259 ya M3U fayl\u0131<input id="source-file" type="file" accept=".m3u,.m3u8,.txt"></label><label>EPG \xFCnvan\u0131 (ist\u0259y\u0259 g\xF6r\u0259)<input id="source-epg" type="url" placeholder="https://provider.example/epg.xml" autocomplete="off" spellcheck="false"></label><label>M\u0259zmun n\xF6v\xFC<select id="source-type"><option value="auto">Avtomatik: TV v\u0259 film qruplar\u0131</option><option value="tv">Ham\u0131s\u0131 TV kanal\u0131</option><option value="movie">Ham\u0131s\u0131 film</option></select></label><p class="note">Yeni pleylist ayr\u0131ca saxlan\u0131r. Saxlanm\u0131\u015F pleylistl\u0259r aras\u0131nda ke\xE7id ed\u0259 bil\u0259rsiniz. N\xFCmun\u0259 rejimin\u0259 Ayarlar vasit\u0259sil\u0259 qay\u0131tmaq olar. URL v\u0259 EPG bu brauzerin yerli yadda\u015F\u0131nda saxlan\u0131r. TiviLoom kanal abun\u0259si t\u0259qdim etmir.</p><p id="import-status" role="status"></p>`, `<button id="import-submit" data-action="import-submit" class="primary">Pleylisti a\xE7</button><button data-action="close" class="secondary">L\u0259\u011Fv et</button>`);
    }
    async function importSubmit() {
      var _a5, _b4;
      const button = $("#import-submit");
      button.disabled = true;
      const status = $("#import-status");
      try {
        const file = $("#source-file").files[0], url = $("#source-url").value.trim(), name = $("#source-name").value.trim() || (file == null ? void 0 : file.name) || "M\u0259nim pleylistim", epgURL = $("#source-epg").value.trim(), type = $("#source-type").value;
        if (!file && !url) throw Error("Pleylist \xFCnvan\u0131 yaz\u0131n v\u0259 ya fayl se\xE7in.");
        if ((file == null ? void 0 : file.size) > 3e7) throw Error("Fayl 30 MB limitini ke\xE7ir.");
        status.textContent = "Pleylist oxunur\u2026";
        const text = file ? await file.text() : await api("source", { url });
        const parsed = parseM3U(text, url);
        let epg = null, warning = "";
        const eURL = epgURL || parsed.epg;
        if (eURL) {
          try {
            status.textContent = "EPG y\xFCkl\u0259nir\u2026";
            epg = await api("epg", { url: eURL });
          } catch (e) {
            warning = "EPG y\xFCkl\u0259nm\u0259di: " + e.message;
          }
        }
        if (!button.isConnected) return;
        (_b4 = (_a5 = window.TiviLoomNative) == null ? void 0 : _a5.stopNativePlayer) == null ? void 0 : _b4.call(_a5);
        document.documentElement.classList.remove("native-preview");
        ++playGeneration;
        hls == null ? void 0 : hls.destroy();
        hls = null;
        video.pause();
        video.removeAttribute("src");
        video.load();
        state.playing = null;
        state.channels = parsed.channels.map((c) => type === "auto" ? c : { ...c, type });
        state.programs = (epg == null ? void 0 : epg.programs) || [];
        state.epgNames = (epg == null ? void 0 : epg.names) || {};
        state.source = name;
        state.imported = true;
        state.channel = state.channels[0].id;
        state.selected = null;
        state.window = Math.floor(Date.now() / 18e5) * 18e5;
        await persistLibrary();
        closeModal();
        navigate(state.channels.some((c) => c.type === "tv") ? "guide" : "movies");
        toast(`${state.channels.length} m\u0259zmun \u0259lav\u0259 edildi.${warning ? " " + warning : ""}`);
        $("#preview-status").textContent = "KANAL SE\xC7\u0130N";
        $("#preview-play").classList.remove("playing");
        $("#preview-play").textContent = "\u25B6";
      } catch (e) {
        status.textContent = e.message;
        status.style.color = "#edb9a5";
      } finally {
        if (button.isConnected) button.disabled = false;
      }
    }
    function epgDialog() {
      if (advanced.guard("settings", epgDialog)) return;
      modal("EPG m\u0259nb\u0259yi", `<p>XMLTV c\u0259dv\u0259lini kanal\u0131n tvg-id v\u0259 ya ad\u0131na g\xF6r\u0259 uy\u011Funla\u015Fd\u0131r\u0131r.</p><label>XMLTV \xFCnvan\u0131<input id="epg-url" type="url" value="${esc(state.epgURL || "")}" placeholder="https://\u2026/epg.xml" autocomplete="off"></label><label hidden>V\u0259 ya XML fayl\u0131<input id="epg-file" type="file" accept=".xml,.xmltv"></label><p id="epg-status" role="status"></p>`, `<button data-action="epg-submit" id="epg-submit" class="primary">EPG-ni y\xFCkl\u0259</button><button data-action="close" class="secondary">Ba\u011Fla</button>`);
    }
    async function epgSubmit() {
      const b = $("#epg-submit");
      b.disabled = true;
      try {
        const f = $("#epg-file").files[0], url = $("#epg-url").value.trim();
        if (!f && !url) throw Error("\xDCnvan v\u0259 ya fayl se\xE7in.");
        if ((f == null ? void 0 : f.size) > 150 * 1024 * 1024) throw Error("EPG 150 MB limitini ke\xE7ir.");
        $("#epg-status").textContent = "C\u0259dv\u0259l oxunur\u2026";
        const data = f ? window.TiviLoomNative ? await platform.api("epgFile", { name: f.name }) : parseXMLTV(await f.text()) : await api("epg", { url });
        if (!b.isConnected) return;
        state.programs = data.programs;
        state.epgNames = data.names;
        state.epgURL = url;
        await persistLibrary();
        closeModal();
        render();
        toast(data.programs.length + " proqram y\xFCkl\u0259ndi.");
      } catch (e) {
        if (b.isConnected) $("#epg-status").textContent = e.message;
      } finally {
        if (b.isConnected) b.disabled = false;
      }
    }
    const row = (title, sub, right) => `<div class="setting-row"><span class="setting-text">${title}<small>${sub}</small></span>${right}</div>`;
    const toggle = (key) => `<input type="checkbox" class="toggle" data-pref="${key}" ${state.prefs[key] ? "checked" : ""} aria-label="${key}">`;
    function settings(section = "root") {
      let body = "", title = "Ayarlar";
      const link = (a, t, s = "") => `<button class="setting-row" data-settings="${a}"><span class="setting-text">${t}<small>${s}</small></span><span>\u203A</span></button>`;
      if (section === "root") body = `<div class="settings-section-title">TiviLoom \xB7 ${VERSION2}</div>${link("sources", "Pleylistl\u0259r v\u0259 EPG", state.source)}${link("appearance", "G\xF6r\xFCn\xFC\u015F", "C\u0259dv\u0259l s\u0131xl\u0131\u011F\u0131, m\u0259tn v\u0259 h\u0259r\u0259k\u0259t")}${link("playback", "Oynatma", "S\u0259s, ekran \xF6l\xE7\xFCs\xFC v\u0259 taymer")}${link("library", "Kitabxana", "Sevimlil\u0259r, tarix\xE7\u0259 v\u0259 xat\u0131rlatmalar")}${link("remote", "Pult v\u0259 klaviatura", "Komp\xFCterd\u0259 TV davran\u0131\u015F\u0131n\u0131 yoxla")}${link("status", "Funksiyalar\u0131n v\u0259ziyy\u0259ti", "Haz\u0131r olanlar v\u0259 n\xF6vb\u0259ti m\u0259rh\u0259l\u0259l\u0259r")}${link("about", "T\u0259tbiq haqq\u0131nda", "Versiya v\u0259 yerli s\u0131naq m\xFChiti")}<div class="panel-note">D\u0259yi\u015Fiklikl\u0259r bu komp\xFCterin brauzerind\u0259 saxlan\u0131r.</div>`;
      if (section === "sources") {
        title = "Pleylistl\u0259r v\u0259 EPG";
        body = `${row("Aktiv m\u0259nb\u0259", esc(state.source), '<span class="pill">' + state.channels.length + " m\u0259zmun</span>")}<div class="menu-list"><button data-action="import">M3U pleylist \u0259lav\u0259 et <span>\uFF0B</span></button><button data-action="epg">XMLTV EPG \u0259lav\u0259 et <span>\uFF0B</span></button><button data-action="demo">N\xFCmun\u0259 pleylistin\u0259 qay\u0131t <span>\u21BA</span></button></div><div class="panel-note">${state.programs.length} proqram qeydiyyat\u0131. TV v\u0259 filml\u0259r M3U daxilind\u0259n qrupla\u015Fd\u0131r\u0131l\u0131r. Xtream API, Stalker portal\u0131 v\u0259 serial m\xF6vs\xFCml\u0259ri sonrak\u0131 m\u0259rh\u0259l\u0259dir.</div>`;
      }
      if (section === "appearance") {
        title = "G\xF6r\xFCn\xFC\u015F";
        body = row("S\u0131x TV c\u0259dv\u0259li", "Daha \xE7ox kanal\u0131 eyni vaxtda g\xF6st\u0259r", toggle("compact")) + row("B\xF6y\xFCk m\u0259tn", "Kanal v\u0259 proqram adlar\u0131n\u0131 b\xF6y\xFCt", toggle("large")) + row("Ke\xE7id animasiyalar\u0131", "Menyu v\u0259 se\xE7im ke\xE7idl\u0259ri", toggle("motion")) + row("Qrup paneli", "Sol t\u0259r\u0259fd\u0259 kanal qruplar\u0131n\u0131 g\xF6st\u0259r", toggle("groups"));
      }
      if (section === "playback") {
        title = "Oynatma";
        body = row("S\u0259ssiz oynatma", "Brauzer a\xE7\u0131lark\u0259n rahat s\u0131naq", toggle("muted")) + row("Ekran rejimi", "Videonun \xE7\u0259r\xE7iv\u0259y\u0259 yerl\u0259\u015Fm\u0259si", `<select data-pref="fit" aria-label="Ekran rejimi"><option value="contain" ${state.prefs.fit === "contain" ? "selected" : ""}>\xD6l\xE7\xFCy\u0259 uy\u011Fun</option><option value="cover" ${state.prefs.fit === "cover" ? "selected" : ""}>Doldur / k\u0259s</option><option value="fill" ${state.prefs.fit === "fill" ? "selected" : ""}>Geni\u015Fl\u0259ndir</option></select>`) + `<div class="menu-list"><button data-action="sleep">Yuxu taymeri <small>${state.sleep ? fmt(state.sleep) : "S\xF6nd\xFCr\xFCl\xFCb"}</small></button></div><div class="panel-note">Yay\u0131m\u0131n a\xE7\u0131lmas\u0131 televizorun d\u0259st\u0259kl\u0259diyi format v\u0259 kodekl\u0259rd\u0259n as\u0131l\u0131d\u0131r. DRM yay\u0131m\u0131 bu s\u0131naq versiyas\u0131na daxil deyil.</div>`;
      }
      if (section === "library") {
        title = "Kitabxana";
        body = row("Sevimlil\u0259r", state.favorites.length + " kanal / film", "\u2606") + row("Tarix\xE7\u0259", state.history.length + " son bax\u0131\u015F", "\u25F7") + row("Xat\u0131rlatmalar", state.reminders.length + " aktiv xat\u0131rlatma", "\u25F7") + `<div class="menu-list"><button data-action="reminders">Xat\u0131rlatmalar\u0131 g\xF6st\u0259r <span>\u203A</span></button><button data-action="clear-history">Tarix\xE7\u0259ni t\u0259mizl\u0259</button><button data-action="backup">Pleylist v\u0259 ayarlar\u0131 ixrac et <span>\u2193</span></button><button data-action="restore">Ehtiyat n\xFCsx\u0259ni b\u0259rpa et <span>\u2191</span></button></div><div class="panel-note">Ehtiyat n\xFCsx\u0259d\u0259 pleylist URL-l\u0259ri ola bil\u0259r. Onu \u015F\u0259xsi saxlay\u0131n. Brauzer m\u0259lumatlar\u0131n\u0131 sils\u0259niz, yerli kitabxana it\u0259c\u0259k.</div>`;
      }
      if (section === "remote") {
        title = "Pult v\u0259 klaviatura";
        body = `<div class="panel-note">\u2191 \u2193 \u2014 kanal se\xE7imi<br>\u2190 \u2192 \u2014 proqram / vaxt se\xE7imi<br>Enter \u2014 \xF6nizl\u0259m\u0259, t\u0259krar Enter \u2014 tam ekran<br>Enter bas\u0131l\u0131 \u2014 kanal menyusu<br>M v\u0259 ya sa\u011F klik \u2014 kanal menyusu<br>Esc / Backspace \u2014 geri<br>F \u2014 brauzerin tam ekran\u0131<br>Space \u2014 oynat / fasil\u0259<br>Ctrl+F \u2014 axtar\u0131\u015F<br><br>Tam ekranda \u2191 m\u0259lumat\u0131 v\u0259 son kanallar\u0131, \u2193 idar\u0259etm\u0259l\u0259ri a\xE7\u0131r. Q\u0131sa OK m\u0259lumat\u0131, uzun OK idar\u0259etm\u0259l\u0259ri g\xF6st\u0259rir. Si\xE7anla b\xFCt\xFCn idar\u0259etm\u0259l\u0259r \u0259l\xE7atand\u0131r.</div><div class="menu-list"><button data-action="remote">Ekran pultunu a\xE7 <span>\u2318</span></button></div>`;
      }
      if (section === "status") {
        title = "Funksiyalar\u0131n v\u0259ziyy\u0259ti";
        body = `<div class="settings-section-title">Bu versiyada i\u015Fl\u0259yir</div><div class="panel-note">M3U URL / fayl \u2022 XMLTV URL / fayl \u2022 Kanal qruplar\u0131 \u2022 C\u0259dv\u0259l / vaxt naviqasiyas\u0131 \u2022 Sevimlil\u0259r \u2022 Kanal s\u0131ralama \u2022 Axtar\u0131\u015F \u2022 \xD6nizl\u0259m\u0259 / tam ekran \u2022 MP4 / HLS \u2022 Filml\u0259r \u2022 Bax\u0131\u015F tarix\xE7\u0259si \u2022 Yuxu taymeri \u2022 Yerli xat\u0131rlatma \u2022 HLS audio / altyaz\u0131 trekl\u0259ri \u2022 Ayarlar\u0131n saxlanmas\u0131 \u2022 Ehtiyat n\xFCsx\u0259</div><div class="settings-section-title">Sonrak\u0131 m\u0259rh\u0259l\u0259</div><div class="panel-note">DVR / catch-up \u2022 Tam Xtream / Stalker \u2022 Serial m\xF6vs\xFCml\u0259ri \u2022 Provayder arxivi / catch-up \u2022 DVR yazma v\u0259 planlama \u2022 Valideyn PIN-i \u2022 Bulud hesab\u0131 v\u0259 sinxronizasiya \u2022 Ma\u011Faza \xF6d\u0259ni\u015Fl\u0259ri / abun\u0259 \u2022 Platformaya uy\u011Fun pult x\u0259rit\u0259l\u0259ri<br><br>Bu s\u0131naqda \xF6d\u0259ni\u015F divar\u0131 yoxdur. TiviMate-d\u0259 Free / Premium olaraq m\xFC\u015Fahid\u0259 edil\u0259n b\xF6lg\xFC ayr\u0131ca ara\u015Fd\u0131rma hesabat\u0131ndad\u0131r; TiviLoom \xFC\xE7\xFCn sat\u0131\u015F paketi h\u0259l\u0259 t\u0259yin edilm\u0259yib.</div>`;
      }
      if (section === "about") {
        title = "TiviLoom haqq\u0131nda";
        body = `<div class="panel-note" style="text-align:center"><img src="assets/logo.png" style="width:480px;max-width:90%;height:auto" alt="TiviLoom loqosu"><h2 style="font-weight:400;color:#dcebe2">TiviLoom</h2>${VERSION2} \xB7 ${platform.isPhone ? "Android" : "webOS TV<br>LG webOS 6.0+"}<br><br>M\xFCst\u0259qil brend v\u0259 yeni t\u0259tbiq. Kanal xidm\u0259ti v\u0259 kommersiya m\u0259zmunu daxil deyil. ${platform.isPhone ? "\u015E\u0259xsi pleylistl\u0259rinizd\u0259n canl\u0131 TV v\u0259 film izl\u0259yin." : "webOS TV \xFC\xE7\xFCn yerli qura\u015Fd\u0131r\u0131lan s\u0131naq paketi."}<br><br>Yay\u0131m\u0131n a\xE7\u0131lmas\u0131 cihaz\u0131n format v\u0259 kodek d\u0259st\u0259yind\u0259n as\u0131l\u0131d\u0131r.${window.TiviLoomNative ? '<br><br>Media3 \xB7 Apache 2.0<br>VideoLAN LibVLC 3.7.6 \xB7 LGPL 2.1+<br><button class="secondary" data-action="licenses">A\xE7\u0131q m\u0259nb\u0259 lisenziyalar\u0131</button>' : ""}</div>`;
      }
      modal(title, body, "", { panel: true, key: "settings:" + section });
    }
    function sleepMenu() {
      menu("Yuxu taymeri", [["S\xF6nd\xFCr", () => setSleep(0)], ...[15, 30, 45, 60, 90, 120, 180, 240].map((n) => [n + " d\u0259qiq\u0259", () => setSleep(n)])]);
    }
    function setSleep(n) {
      clearTimeout(sleepTimer);
      state.sleep = n ? Date.now() + n * 6e4 : 0;
      if (n) sleepTimer = setTimeout(() => {
        stopMedia();
        multis.forEach((x) => x.v.pause());
        state.sleep = 0;
        toast("Yuxu taymeri: oynatma dayand\u0131r\u0131ld\u0131.");
      }, n * 6e4);
      modalBack();
      toast(n ? n + " d\u0259qiq\u0259 sonra oynatma dayanacaq" : "Yuxu taymeri s\xF6nd\xFCr\xFCld\xFC");
    }
    function tracks() {
      const items = [];
      if (!hls && video.audioTracks) {
        for (let i = 0; i < video.audioTracks.length; i++) {
          const track = video.audioTracks[i];
          items.push(["Audio: " + (track.label || track.language || String(i + 1)), () => {
            for (let j = 0; j < video.audioTracks.length; j++) video.audioTracks[j].enabled = j === i;
            closeModal();
          }, track.enabled ? "Selected" : ""]);
        }
      }
      if (hls) {
        hls.audioTracks.forEach((t, i) => items.push(["S\u0259s: " + (t.name || t.lang || i), () => {
          hls.audioTrack = i;
          closeModal();
          toast("S\u0259s treki se\xE7ildi");
        }, i === hls.audioTrack ? "Se\xE7ilib" : ""]));
        items.push(["Altyaz\u0131: s\xF6nd\xFCr", () => {
          hls.subtitleTrack = -1;
          closeModal();
        }]);
        hls.subtitleTracks.forEach((t, i) => items.push(["Altyaz\u0131: " + (t.name || t.lang || i), () => {
          hls.subtitleTrack = i;
          closeModal();
        }]));
      } else {
        for (let i = 0; i < video.textTracks.length; i++) {
          const t = video.textTracks[i];
          items.push(["Altyaz\u0131: " + (t.label || t.language || i), () => {
            [...video.textTracks].forEach((x) => x.mode = "disabled");
            t.mode = "showing";
            closeModal();
          }]);
        }
      }
      if (!items.length) return modal("S\u0259s v\u0259 altyaz\u0131", '<p>Bu m\u0259nb\u0259 brauzer\u0259 se\xE7il\u0259 bil\u0259n \u0259lav\u0259 trek t\u0259qdim etmir.</p><p class="note">HLS m\u0259nb\u0259sind\u0259 alternativ s\u0259s v\u0259 altyaz\u0131 varsa, burada g\xF6r\xFCn\u0259c\u0259k.</p>', '<button class="primary" data-action="close">Oldu</button>');
      menu("S\u0259s v\u0259 altyaz\u0131", items);
    }
    async function openMulti() {
      const a = channelsFor("tv");
      if (a.length < 2) return toast("\u018Fn az\u0131 2 TV kanal\u0131 laz\u0131md\u0131r.");
      video.pause();
      modalLastFocus = document.activeElement;
      const el = document.createElement("div");
      el.id = "multiview";
      el.className = "multigrid";
      el.innerHTML = '<span class="multi-title">\xC7oxlu ekran \xB7 yaln\u0131z se\xE7il\u0259n ekran\u0131n s\u0259si a\xE7\u0131l\u0131r</span><button class="multi-close" data-action="close">\u2715 Ba\u011Fla</button>' + a.slice(0, 4).map((c, i) => `<div class="multi-cell"><video playsinline muted loop></video><span class="multi-label">${esc(c.name)}</span><button data-multi-audio="${i}">\u266A S\u0259s</button></div>`).join("");
      $("#tv-screen").append(el);
      multis = [];
      await Promise.all([...el.querySelectorAll("video")].map(async (v, i) => {
        var _a5;
        const x = { v, h: null };
        multis[i] = x;
        try {
          x.h = await attachVideo(v, a[i], true, () => el.isConnected);
          if (!el.isConnected) {
            (_a5 = x.h) == null ? void 0 : _a5.destroy();
            return;
          }
          await v.play();
        } catch {
          v.parentElement.querySelector(".multi-label").textContent = a[i].name + " \xB7 A\xE7\u0131lmad\u0131";
        }
      }));
    }
    function showRemote() {
      if ($("#remote")) return $("#remote").remove();
      const el = document.createElement("div");
      el.id = "remote";
      el.className = "remote";
      el.innerHTML = `<div class="remote-head">TiviLoom pultu <button data-action="remote">\xD7</button></div><div class="remote-grid"><span class="blank"></span><button data-key="ArrowUp" aria-label="Yuxar\u0131">\u2191</button><span class="blank"></span><button data-key="ArrowLeft" aria-label="Sol">\u2190</button><button data-key="Enter" class="ok">OK</button><button data-key="ArrowRight" aria-label="Sa\u011F">\u2192</button><span class="blank"></span><button data-key="ArrowDown" aria-label="A\u015Fa\u011F\u0131">\u2193</button><span class="blank"></span></div><div class="remote-foot"><button data-key="Escape">Geri</button><button data-action="context">Menyu</button><button data-action="guide">TV</button></div>`;
      $("#tv-screen").append(el);
    }
    function help() {
      modal("Komp\xFCterd\u0259 s\u0131naq", `<p><strong>Birinci Enter</strong> se\xE7ilmi\u015F kanal\u0131 yuxar\u0131dak\u0131 p\u0259nc\u0259r\u0259d\u0259 oynad\u0131r. <strong>\u0130kinci Enter</strong> tam ekran a\xE7\u0131r.</p><p>\u2191 \u2193 il\u0259 kanal\u0131, \u2190 \u2192 il\u0259 proqram\u0131 se\xE7in. G\u0259l\u0259c\u0259k proqramda Enter xat\u0131rlatma p\u0259nc\u0259r\u0259sini a\xE7\u0131r. <strong>M</strong> v\u0259 ya sa\u011F klik kanal menyusunu g\xF6st\u0259rir. <strong>Esc</strong> geri qaytar\u0131r.</p><p>Si\xE7anla qruplar\u0131, proqramlar\u0131, filml\u0259ri v\u0259 b\xFCt\xFCn d\xFCym\u0259l\u0259ri s\u0131naqdan ke\xE7ir\u0259 bil\u0259rsiniz. <strong>F</strong> brauzeri tam ekran edir.</p><p class="note">N\xFCmun\u0259 kanallar eyni yerli test videosunu g\xF6st\u0259rir. \xD6z yay\u0131m\u0131n\u0131z\u0131 yoxlamaq \xFC\xE7\xFCn \uFF0B d\xFCym\u0259sind\u0259n M3U \u0259lav\u0259 edin.</p>`, `<button class="primary" data-action="help-remote">Ekran pultunu a\xE7</button><button class="secondary" data-action="close">Ba\u015Fla</button>`);
    }
    async function resetDemo() {
      const existing = catalog.playlists.find((p) => !p.imported);
      if (existing) {
        if (!await activatePlaylist(existing.id)) return;
      } else {
        const d = demoData();
        if (!await storeNewPlaylist({ ...d, name: "TiviLoom n\xFCmun\u0259l\u0259ri", imported: false })) return;
      }
      closeModal();
      navigate("guide");
      toast("N\xFCmun\u0259 pleylisti a\xE7\u0131ld\u0131. Dig\u0259r pleylistl\u0259r saxlan\u0131l\u0131b.");
    }
    function exportBackup() {
      const data = { format: "TiviLoom", version: 1, source: state.source, channels: state.channels, programs: state.programs, epgNames: state.epgNames, imported: state.imported, favorites: state.favorites, prefs: state.prefs };
      const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "TiviLoom-ehtiyat.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1e3);
      toast("Ehtiyat n\xFCsx\u0259 endirilir");
    }
    function restoreBackup() {
      modal("Ehtiyat n\xFCsx\u0259ni b\u0259rpa et", '<p>Yaln\u0131z \xF6z TiviLoom ehtiyat n\xFCsx\u0259nizi se\xE7in. Aktiv pleylist v\u0259 ayarlar \u0259v\u0259z edil\u0259c\u0259k.</p><label>JSON fayl\u0131<input type="file" id="backup-file" accept=".json"></label><p id="backup-status"></p>', '<button data-action="restore-submit" class="primary">B\u0259rpa et</button><button data-action="close" class="secondary">L\u0259\u011Fv et</button>');
    }
    async function restoreSubmit() {
      var _a5, _b4;
      try {
        const f = $("#backup-file").files[0];
        if (!f) throw Error("Fayl se\xE7in.");
        if (f.size > 3e7) throw Error("Fayl \xE7ox b\xF6y\xFCkd\xFCr.");
        const b = JSON.parse(await f.text());
        if (b.format !== "TiviLoom" || b.version !== 1 || !Array.isArray(b.channels) || !b.channels.length) throw Error("Bu TiviLoom ehtiyat n\xFCsx\u0259si deyil.");
        for (const c of b.channels) {
          if (typeof c.id !== "string" || typeof c.name !== "string" || !["tv", "movie"].includes(c.type)) throw Error("Kanal m\u0259lumat\u0131 d\xFCzg\xFCn deyil.");
          if (!c.demo || c.url !== "/assets/demo.mp4") {
            const u = new URL(c.url);
            if (!["https:", "http:"].includes(u.protocol)) throw Error("Etibars\u0131z kanal \xFCnvan\u0131.");
            c.demo = false;
          }
        }
        state.channels = b.channels;
        state.programs = Array.isArray(b.programs) ? b.programs : [];
        state.epgNames = b.epgNames || {};
        state.source = String(b.source || "B\u0259rpa olunmu\u015F pleylist");
        state.imported = !!b.imported;
        state.favorites = Array.isArray(b.favorites) ? b.favorites : [];
        if (b.prefs) {
          for (const key of ["compact", "large", "motion", "groups", "muted", "autoplay"]) if (typeof b.prefs[key] === "boolean") state.prefs[key] = b.prefs[key];
          if (["contain", "cover", "fill"].includes(b.prefs.fit)) state.prefs.fit = b.prefs.fit;
        }
        state.channel = state.channels[0].id;
        state.selected = null;
        state.playing = null;
        (_b4 = (_a5 = window.TiviLoomNative) == null ? void 0 : _a5.stopNativePlayer) == null ? void 0 : _b4.call(_a5);
        document.documentElement.classList.remove("native-preview");
        ++playGeneration;
        hls == null ? void 0 : hls.destroy();
        hls = null;
        video.pause();
        video.removeAttribute("src");
        video.load();
        save("favorites");
        save("prefs");
        applyPrefs();
        await persistLibrary();
        closeModal();
        navigate(state.channels.some((c) => c.type === "tv") ? "guide" : "movies");
        toast("Ehtiyat n\xFCsx\u0259 b\u0259rpa edildi");
      } catch (e) {
        $("#backup-status").textContent = e.message;
      }
    }
    function listReminders() {
      menu("Xat\u0131rlatmalar", state.reminders.length ? state.reminders.map((r) => [r.title + " \xB7 " + fmt(r.start), () => {
        state.reminders = state.reminders.filter((x) => x.key !== r.key);
        save("reminders");
        listReminders();
      }, "Sil"]) : [["Aktiv xat\u0131rlatma yoxdur", () => closeModal()]]);
    }
    async function doAction(action) {
      const c = currentChannel();
      if (action === "expand-player") {
        if (state.playing) enterPlayer();
        else toast("Select a channel first.");
        return;
      }
      if (action === "licenses") {
        try {
          const response = await fetch("assets/licenses/libvlc-COPYING.LIB.txt");
          if (!response.ok) throw Error();
          modal("A\xE7\u0131q m\u0259nb\u0259 lisenziyalar\u0131", '<p>VideoLAN LibVLC 3.7.6 \xB7 LGPL 2.1 v\u0259 ya sonrak\u0131 versiya. AndroidX Media3 / AppCompat \xB7 Apache 2.0.</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;max-width:100%">' + esc(await response.text()) + "</pre>", "", { panel: true });
        } catch {
          toast("Lisenziya m\u0259tni a\xE7\u0131la bilm\u0259di.");
        }
        return;
      }
      if (action === "display") return tvUI.displayMenu();
      if (action === "sleep") return tvUI.sleepPanel();
      if (platform.native && ["backup", "restore"].includes(action)) return toast("File backup and restore are unavailable on this TV.");
      if (action === "playlists") return settings("sources");
      if (action === "last-channel") return advanced.lastChannel();
      if (["multiview", "pip"].includes(action)) return toast("This feature is not available in this webOS test version.");
      if (action === "preview" && !$("#video-error").hidden) {
        state.playing = null;
        return play(c, state.full);
      }
      switch (action) {
        case "home":
        case "guide":
          closeModal();
          if (state.full) exitPlayer();
          navigate("guide");
          break;
        case "movies":
        case "series":
        case "history":
          if (state.full) exitPlayer();
          navigate(action);
          break;
        case "search":
          if (state.full) exitPlayer();
          navigate("search");
          break;
        case "search-clear":
          state.query = "";
          renderSearch();
          $("#search-input").focus();
          break;
        case "favorites":
          navigate("guide");
          state.group = "Sevimlil\u0259r";
          render();
          break;
        case "settings":
          settings();
          break;
        case "help":
          help();
          break;
        case "help-remote":
          closeModal();
          showRemote();
          break;
        case "remote":
          closeModal();
          showRemote();
          break;
        case "import":
          importDialog();
          break;
        case "import-submit":
          await importSubmit();
          break;
        case "epg":
          epgDialog();
          break;
        case "epg-submit":
          await epgSubmit();
          break;
        case "demo":
          modal("N\xFCmun\u0259 pleylistini a\xE7", "<p>N\xFCmun\u0259l\u0259r ayr\u0131ca pleylist kimi a\xE7\u0131lacaq. Saxlanm\u0131\u015F pleylistl\u0259riniz qorunur.</p>", '<button class="primary" data-action="demo-confirm">N\xFCmun\u0259l\u0259ri a\xE7</button><button class="secondary" data-action="close">L\u0259\u011Fv et</button>');
          break;
        case "demo-confirm":
          await resetDemo();
          break;
        case "modal-back":
        case "close":
          modalBack();
          break;
        case "context":
          context();
          break;
        case "preview":
          if (state.playing === (c == null ? void 0 : c.id)) enterPlayer();
          else await play(c);
          break;
        case "play-selected":
          closeModal();
          await play(c, true);
          break;
        case "archive-selected": {
          const url = archiveURL(c, state.selected);
          closeModal();
          if (url) await play({ ...c, url }, true);
          else toast("Arxiv \xFC\xE7\xFCn \xFCnvan tap\u0131lmad\u0131.");
          break;
        }
        case "remind-selected":
          reminder(state.selected, c);
          break;
        case "favorite":
          favorite();
          break;
        case "exit-player":
          exitPlayer();
          break;
        case "pause":
          if (video.paused) await video.play();
          else video.pause();
          showControls();
          break;
        case "mute":
          video.muted = !video.muted;
          state.prefs.muted = video.muted;
          save("prefs");
          applyPrefs();
          showControls();
          break;
        case "display":
          menu("Ekran rejimi", [["\xD6l\xE7\xFCy\u0259 uy\u011Fun", () => setFit("contain")], ["Doldur / k\u0259s", () => setFit("cover")], ["Geni\u015Fl\u0259ndir", () => setFit("fill")]]);
          break;
        case "tracks":
          tracks();
          break;
        case "sleep":
          sleepMenu();
          break;
        case "pip":
          if (document.pictureInPictureElement) await document.exitPictureInPicture();
          else if (video.requestPictureInPicture && video.readyState >= 2) await video.requestPictureInPicture();
          else toast("Bu brauzer v\u0259 ya video \xFC\xE7\xFCn PiP \u0259l\xE7atan deyil.");
          break;
        case "multiview":
          await openMulti();
          break;
        case "previous":
          channelStep(-1);
          break;
        case "next":
          channelStep(1);
          break;
        case "time-back":
          state.window -= 18e5;
          state.selected = programAt(c, state.window);
          renderGuide();
          break;
        case "time-next":
          state.window += 18e5;
          state.selected = programAt(c, state.window);
          renderGuide();
          break;
        case "now":
          state.window = Math.floor(Date.now() / 18e5) * 18e5;
          state.selected = programAt(c);
          renderGuide();
          break;
        case "clear-history":
          state.history = [];
          save("history");
          toast("Tarix\xE7\u0259 t\u0259mizl\u0259ndi");
          settings("library");
          break;
        case "backup":
          exportBackup();
          break;
        case "restore":
          restoreBackup();
          break;
        case "restore-submit":
          await restoreSubmit();
          break;
        case "reminders":
          listReminders();
          break;
      }
    }
    function setFit(mode) {
      state.prefs.fit = mode;
      save("prefs");
      applyPrefs();
      modalBack();
    }
    function channelStep(dir) {
      const a = channelsFor("tv");
      let i = a.findIndex((c2) => c2.id === state.channel);
      const c = a[(i + dir + a.length) % a.length];
      if (c) play(c, state.full);
    }
    document.addEventListener("click", async (e) => {
      var _a5, _b4;
      const t = e.target.closest("button,[data-action]");
      if (!t) return;
      try {
        if (t.dataset.action) return await doAction(t.dataset.action);
        if (t.dataset.key) return keyControl(t.dataset.key);
        if (t.dataset.group) return;
        if (t.dataset.settings) return settings(t.dataset.settings);
        if (t.dataset.menu !== void 0) return await ((_a5 = menuActions[t.dataset.menu]) == null ? void 0 : _a5.call(menuActions));
        if (t.dataset.program) {
          const c = state.channels.find((c2) => c2.id === t.dataset.channelId);
          const p = programAt(c, +t.dataset.program);
          const same = state.channel === c.id && ((_b4 = state.selected) == null ? void 0 : _b4.start) === p.start;
          select(c, p);
          if (p.start > Date.now() || p.end < Date.now()) programActions(p, c);
          else await play(c, !platform.isPhone && (same && state.playing === c.id));
          return;
        }
        if (t.dataset.channel) {
          const c = state.channels.find((c2) => c2.id === t.dataset.channel);
          select(c);
          await play(c, !platform.isPhone && state.playing === c.id);
          return;
        }
        if (t.dataset.movie) return movieDetails(state.channels.find((c) => c.id === t.dataset.movie));
        if (t.dataset.result) {
          const c = state.channels.find((c2) => c2.id === t.dataset.result);
          if (c.type === "movie") movieDetails(c);
          else if (c.type === "series") {
            tvUI.openSeriesItem(c);
          } else {
            state.channel = c.id;
            state.selected = null;
            navigate("guide");
            await play(c);
          }
          return;
        }
        if (t.dataset.remind) {
          const p = state.programs.find((p2) => p2.channel === t.dataset.remind && p2.start === +t.dataset.start);
          const c = state.channels.find((c2) => c2.id === p.channel || c2.epgId === p.channel);
          programDetails(p, c);
          return;
        }
        if (t.dataset.multiAudio !== void 0) {
          const i = +t.dataset.multiAudio;
          multis.forEach((x, j) => x.v.muted = j !== i);
          $$("[data-multi-audio]").forEach((b, j) => b.textContent = i === j ? "\u266A S\u0259s a\xE7\u0131q" : "\u266A S\u0259s");
        }
      } catch (err) {
        toast(err.message || "\u018Fm\u0259liyyat ba\u015F tutmad\u0131.");
      }
    });
    document.addEventListener("change", (e) => {
      if (e.target.dataset.pref) {
        const key = e.target.dataset.pref;
        state.prefs[key] = e.target.type === "checkbox" ? e.target.checked : e.target.value;
        save("prefs");
        applyPrefs();
        persistResume();
      }
    });
    document.addEventListener("input", (e) => {
      if (e.target.id === "search-input") {
        state.query = e.target.value;
        if (!e.isComposing) renderSearch();
      }
      if (e.target.id === "seek" && Number.isFinite(video.duration)) video.currentTime = +e.target.value / 1e3 * video.duration;
    });
    document.addEventListener("focusin", (e) => {
      const card = e.target.closest("[data-movie]");
      if (card) {
        state.channel = card.dataset.movie;
        state.selected = null;
        renderInfo();
      }
    });
    document.addEventListener("compositionend", (e) => {
      if (e.target.id === "search-input") {
        state.query = e.target.value;
        renderSearch();
      }
    });
    document.addEventListener("click", (e) => {
      if (platform.isPhone && e.target.matches("#modal-root > .overlay")) modalBack();
    });
    document.addEventListener("contextmenu", (e) => {
      if (e.target.closest("input")) return;
      if (platform.isPhone) {
        e.preventDefault();
        return;
      }
      const row2 = e.target.closest("[data-row]");
      if (row2) {
        state.channel = row2.dataset.row;
        state.selected = programAt(currentChannel());
        renderInfo();
      }
      e.preventDefault();
      context();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Tab" && $("#modal-root").children.length) {
        const focusables = $$("#modal-root button,#modal-root input,#modal-root select").filter((el) => !el.disabled && !el.hidden);
        if (focusables.length) {
          const i = focusables.indexOf(document.activeElement);
          if (e.shiftKey && i <= 0) {
            e.preventDefault();
            focusables[focusables.length - 1].focus();
          } else if (!e.shiftKey && i === focusables.length - 1) {
            e.preventDefault();
            focusables[0].focus();
          }
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        if (state.full) exitPlayer();
        navigate("search");
        return;
      }
      if (e.target.matches("input[type=checkbox]")) {
        if (e.key === "Enter") {
          e.preventDefault();
          e.target.click();
          return;
        }
        if (["ArrowUp", "ArrowDown"].includes(e.key) && $("#modal-root").children.length) {
          e.preventDefault();
          keyControl(e.key);
          return;
        }
      }
      if (e.target.matches("input,textarea") && ["ArrowUp", "ArrowDown"].includes(e.key) && $("#modal-root").children.length) {
        e.preventDefault();
        keyControl(e.key);
        return;
      }
      if (e.target.matches("input,select,textarea")) {
        if (e.key === "Escape") {
          e.preventDefault();
          if ($("#modal-root").children.length) modalBack();
          else if (state.view === "search") navigate("guide");
        }
        return;
      }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Escape", "Backspace", " ", "m", "M", "f", "F"].includes(e.key)) {
        e.preventDefault();
        keyControl(e.key);
      }
    });
    function keyControl(key) {
      var _a5, _b4, _c2;
      if (key === "Escape" || key === "Backspace") {
        if ($("#modal-root").children.length || $("#multiview")) return modalBack();
        if (state.full) return exitPlayer();
        if (state.view !== "guide") return navigate("guide");
        state.group = "Ham\u0131s\u0131";
        render();
        return;
      }
      if ($("#modal-root").children.length) {
        const buttons = $$("#modal-root button,#modal-root input,#modal-root select").filter((x) => !x.disabled);
        let i2 = buttons.indexOf(document.activeElement);
        if (key === "ArrowUp" || key === "ArrowDown") {
          (_a5 = buttons[(i2 + (key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]) == null ? void 0 : _a5.focus();
        } else if (key === "Enter") (_b4 = document.activeElement) == null ? void 0 : _b4.click();
        return;
      }
      if (key === "m" || key === "M") return context();
      if (key === "f" || key === "F") {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(() => toast("Tam ekran a\xE7\u0131lmad\u0131."));
        return;
      }
      if (state.full) {
        showControls();
        if (key === "ArrowUp") channelStep(-1);
        if (key === "ArrowDown") channelStep(1);
        if (key === " " || key === "Enter") doAction("pause");
        if (key === "ArrowRight" && Number.isFinite(video.duration)) video.currentTime = Math.min(video.duration, video.currentTime + 10);
        if (key === "ArrowLeft") video.currentTime = Math.max(0, video.currentTime - 10);
        return;
      }
      if (state.view !== "guide") {
        if (key === "Enter") (_c2 = document.activeElement) == null ? void 0 : _c2.click();
        return;
      }
      const a = visibleChannels();
      if (!a.length) return;
      const c = currentChannel();
      const i = a.findIndex((x) => x.id === c.id);
      const p = state.selected || programAt(c);
      if (key === "ArrowUp" || key === "ArrowDown") {
        const next = a[Math.max(0, Math.min(a.length - 1, i + (key === "ArrowDown" ? 1 : -1)))];
        select(next, programAt(next, p.start), true);
      }
      if (key === "ArrowRight" || key === "ArrowLeft") {
        const t = key === "ArrowRight" ? p.end + 1 : p.start - 1;
        const next = programAt(c, t);
        if (next.start < state.window) state.window = next.start;
        if (next.start >= state.window + 72e5) state.window += 18e5;
        select(c, next, true);
      }
      if (key === "Enter") {
        if (p.start > Date.now() || p.end < Date.now()) programActions(p, c);
        else play(c, state.playing === c.id);
      }
      if (key === " " && state.playing) doAction("pause").catch(() => toast("\u018Fvv\u0259l kanal se\xE7in."));
    }
    video.addEventListener("error", () => {
      var _a5, _b4;
      if (!state.playing || !video.currentSrc) return;
      const c = state.channels.find((c2) => c2.id === state.playing), generation = playGeneration;
      if (c && !hls && hlsFallbackGeneration !== generation && ((_a5 = window.Hls) == null ? void 0 : _a5.isSupported()) && ["hls", "unknown"].includes(streamKind(c.url)) && ((_b4 = video.error) == null ? void 0 : _b4.code) === 4) {
        hlsFallbackGeneration = generation;
        $("#preview-status").textContent = "ALTERNAT\u0130V PLAYER YOXLANIR";
        attachVideo(video, c, false, () => generation === playGeneration, true).then((instance) => {
          if (generation !== playGeneration) {
            instance == null ? void 0 : instance.destroy();
            return;
          }
          hls = instance;
          return video.play();
        }).catch((e) => {
          if (generation === playGeneration) showVideoError(playbackError(video.error || e, { url: c.url }));
        });
        return;
      }
      const reason = playbackError(video.error, { url: (c == null ? void 0 : c.url) || "" });
      showVideoError(reason);
      if (c && !c.demo) api("probe", { url: c.url, userAgent: c.userAgent || state.userAgent || "", referer: c.referer || "" }).then((report) => {
        if (generation === playGeneration && video.error) showVideoError(reason + " \xB7 " + describeProbe(report));
      }).catch(() => {
      });
    });
    video.addEventListener("playing", () => {
      setPlaybackPhase("playing");
      clearTimeout(reconnectTimer);
      clearTimeout(stallTimer);
      reconnectTimer = null;
      reconnectAttempts = 0;
      $("#video-error").hidden = true;
      toolLabel("#pause-button", "Pause");
    });
    video.addEventListener("pause", () => {
      if (state.playbackPhase !== "loading" && state.playbackPhase !== "error") setPlaybackPhase("paused");
      toolLabel("#pause-button", "Play");
    });
    video.addEventListener("timeupdate", () => {
      const clock = (n) => {
        if (!Number.isFinite(n)) return "CANLI";
        return Math.floor(n / 60).toString().padStart(2, "0") + ":" + Math.floor(n % 60).toString().padStart(2, "0");
      };
      $("#elapsed").textContent = clock(video.currentTime);
      $("#duration").textContent = clock(video.duration);
      $("#seek").disabled = !Number.isFinite(video.duration);
      if (Number.isFinite(video.duration)) $("#seek").value = video.currentTime / video.duration * 1e3;
    });
    $("#player").addEventListener("mousemove", showControls);
    $("#player").addEventListener("click", (e) => {
      if (e.target === video || e.target.id === "player") showControls();
    });
    function tick() {
      const now = Date.now();
      $("#clock").textContent = fmt(now);
      state.reminders.filter((r) => r.start <= now && r.start > now - 6e4).forEach((r) => toast("\u0130ndi ba\u015Flay\u0131r: " + r.title));
      const old = state.reminders.length;
      state.reminders = state.reminders.filter((r) => r.start > now);
      if (old !== state.reminders.length) save("reminders");
    }
    const legacyModal = modal;
    const tvDialogLabels = { "Ba\u011Fla": "Close", "L\u0259\u011Fv et": "Cancel", "Oldu": "OK", "Ba\u015Fla": "Start", "Aktiv m\u0259nb\u0259": "Active playlist", "M3U pleylist \u0259lav\u0259 et": "Add playlist", "XMLTV EPG \u0259lav\u0259 et": "Add EPG source", "N\xFCmun\u0259 pleylistin\u0259 qay\u0131t": "Load sample playlist", "S\u0131x TV c\u0259dv\u0259li": "Compact TV guide", "Daha \xE7ox kanal\u0131 eyni vaxtda g\xF6st\u0259r": "Show more channels", "B\xF6y\xFCk m\u0259tn": "Large text", "Kanal v\u0259 proqram adlar\u0131n\u0131 b\xF6y\xFCt": "Increase channel and programme text size", "Ke\xE7id animasiyalar\u0131": "Animations", "Menyu v\u0259 se\xE7im ke\xE7idl\u0259ri": "Menu and focus transitions", "Qrup paneli": "Groups panel", "Sol t\u0259r\u0259fd\u0259 kanal qruplar\u0131n\u0131 g\xF6st\u0259r": "Show channel groups", "S\u0259ssiz oynatma": "Mute playback", "Brauzer a\xE7\u0131lark\u0259n rahat s\u0131naq": "Start videos without sound", "A\xE7\u0131l\u0131\u015Fda \xF6nizl\u0259m\u0259": "Play on startup", "Aktiv kanal\u0131n videosunu ba\u015Flat": "Play the selected channel on startup", "Ekran rejimi": "Display mode", "Videonun \xE7\u0259r\xE7iv\u0259y\u0259 yerl\u0259\u015Fm\u0259si": "Video scaling", "\xD6l\xE7\xFCy\u0259 uy\u011Fun": "Normal", "Doldur / k\u0259s": "Zoom", "Geni\u015Fl\u0259ndir": "Stretch", "Yuxu taymeri": "Sleep timer", "S\xF6nd\xFCr\xFCl\xFCb": "Off", "Sevimlil\u0259r": "Favorites", "Tarix\xE7\u0259": "History", "Xat\u0131rlatmalar": "Reminders", "Xat\u0131rlatmalar\u0131 g\xF6st\u0259r": "Show reminders", "Tarix\xE7\u0259ni t\u0259mizl\u0259": "Clear history", "Pleylist v\u0259 ayarlar\u0131 ixrac et": "Back up data", "Ehtiyat n\xFCsx\u0259ni b\u0259rpa et": "Restore data", "S\u0259s v\u0259 altyaz\u0131": "Audio and subtitles", "Siyah\u0131ma \u0259lav\u0259 et": "Add to My list", "Pleylistl\u0259r v\u0259 EPG": "Playlists", "Pleylist v\u0259 EPG": "Playlist settings", "Proqram haqq\u0131nda": "Description", "Xat\u0131rlatma qur": "Set reminder", "Kanal\u0131 yuxar\u0131 k\xF6\xE7\xFCr": "Move channel up", "Kanal\u0131 a\u015Fa\u011F\u0131 k\xF6\xE7\xFCr": "Move channel down", "\xC7oxlu ekran": "Multiview", "Ayarlara geri": "Back to settings", "Xat\u0131rlat": "Remind", "Kanal\u0131 oynat": "Play channel", "Oynat": "Play", "Funksiyalar\u0131n v\u0259ziyy\u0259ti": "Feature status", "Bu versiyada i\u015Fl\u0259yir": "Available in this build", "Sonrak\u0131 m\u0259rh\u0259l\u0259": "Planned features", "EPG m\u0259nb\u0259yi": "EPG source", "XMLTV \xFCnvan\u0131": "XMLTV URL", "V\u0259 ya XML fayl\u0131": "Select local XMLTV file", "EPG-ni y\xFCkl\u0259": "Update EPG", "N\xFCmun\u0259 rejimin\u0259 qay\u0131t": "Load sample playlist", "N\xFCmun\u0259l\u0259ri a\xE7": "Load samples", "Komp\xFCterd\u0259 s\u0131naq": "Remote control" };
    function translateDialog() {
      const root = $("#modal-root");
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n;
      while (n = walker.nextNode()) {
        const raw = n.textContent, trim = raw.trim();
        if (tvDialogLabels[trim]) n.textContent = raw.replace(trim, tvDialogLabels[trim]);
        else if (/^[☆★▶◷⊞] /.test(trim)) {
          const clean = trim.slice(2);
          if (tvDialogLabels[clean]) n.textContent = raw.replace(clean, tvDialogLabels[clean]);
        }
      }
    }
    modal = (...args) => {
      legacyModal(...args);
      translateDialog();
    };
    const legacyNavigate = navigate;
    function getCatalog() {
      persistResume();
      return captureActive(catalog, state, resumeState);
    }
    function emptyLibrary() {
      resumeReady = false;
      Object.assign(state, { channels: [], programs: [], epgNames: {}, source: "No active playlist", imported: true, channel: null, playing: null, selected: null, group: "Ham\u0131s\u0131", view: "guide", favorites: [], history: [], reminders: [], savedPrograms: [] }, cleanOptions());
      resumeState = {};
      lastResumeJSON = "";
      resumeReady = true;
    }
    async function commitCatalog(next, reload = false) {
      if (libraryBusy) throw Error("Another playlist operation is running.");
      libraryBusy = true;
      try {
        const previous = catalog.activeId, old = new Map(catalog.playlists.map((p2) => [p2.id, p2]));
        await writeCatalog(next);
        catalog = next;
        for (const item of next.playlists) {
          if (old.get(item.id) !== item) {
            const saved = read("playlist-state-" + item.id, null);
            if (saved) try {
              localStorage.setItem("tl-playlist-state-" + item.id, JSON.stringify({ ...saved, ...cleanOptions(item, item.channels, saved.favorites || item.favorites) }));
            } catch {
            }
          }
        }
        for (const key of old.keys()) if (!next.playlists.some((p2) => p2.id === key)) localStorage.removeItem("tl-playlist-state-" + key);
        const p = activePlaylist(catalog);
        if (reload || previous !== catalog.activeId) {
          stopMedia();
          tvUI.resetTransient();
          if (state.full) exitPlayer();
          if (p) applyPlaylist(p);
          else emptyLibrary();
        } else if (p) {
          Object.assign(state, { source: p.name, sourceURL: p.sourceURL || "", epgURL: p.epgURL || "", enabled: p.enabled !== false, userAgent: p.userAgent || "", updateHours: p.updateHours || 0, updateOnStart: !!p.updateOnStart, lastUpdated: p.lastUpdated || 0 }, cleanOptions(p, p.channels, p.favorites));
        }
        persistPlaylistState();
        render();
        return true;
      } finally {
        libraryBusy = false;
      }
    }
    const advanced = mountAdvanced({
      state,
      $,
      $$,
      esc,
      toast,
      platform,
      api,
      parseM3U,
      parsePlaylist,
      parseXMLTV,
      getCatalog,
      commitCatalog,
      persistLibrary,
      save,
      applyPrefs,
      stopMedia,
      channelNumber,
      channelsFor,
      programAt,
      programDetails,
      reminder,
      bookmarkProgram,
      renderLogo,
      focusNumberChannel: (c) => {
        if (state.full || state.view !== "guide") return;
        if (!visibleChannels().some((x) => x.id === c.id)) state.group = "Sevimlil\u0259r";
        select(c, null, true);
      },
      modal: (...args) => modal(...args),
      closeModal: () => closeModal(),
      modalBack: () => modalBack(),
      menu: (...args) => menu(...args),
      favorite: (...args) => favorite(...args),
      play: (...args) => play(...args),
      refresh: () => render(),
      settings: (...args) => settings(...args),
      context: () => context(),
      doAction: (...args) => doAction(...args),
      saveLocalOptions: () => persistPlaylistState(),
      addPlaylist: async (data) => {
        const result = await storeNewPlaylist(data);
        if (result) {
          tvUI.leaveWelcome();
          tvUI.afterNavigate();
        }
        return result;
      }
    });
    const tvUI = mountTVUI({
      seriesCatalog,
      state,
      $,
      $$,
      esc,
      safeImage,
      fmt,
      date,
      mins,
      programAt,
      channelPrograms,
      currentChannel,
      visibleChannels,
      api,
      persistLibrary,
      video,
      toast,
      parseM3U,
      parsePlaylist,
      parseXMLTV,
      refresh: () => render(),
      navigate: (...a) => {
        if (state.full) exitPlayer();
        navigate(...a);
      },
      closeModal: (...a) => closeModal(...a),
      modalBack: () => modalBack(),
      modal: (...a) => modal(...a),
      resetDemo: (...a) => resetDemo(...a),
      play: (...a) => play(...a),
      programDetails: (...a) => programDetails(...a),
      epgDialog: (...a) => epgDialog(...a),
      advanced,
      save,
      applyPrefs,
      setFit,
      setSleep,
      checkSource,
      folderPick,
      toggleMini,
      healthCheck,
      favoriteFolders,
      bookmarkProgram,
      reminder,
      enterPlayer: () => enterPlayer(),
      channelsFor,
      channelNumber,
      normalizeSearch,
      renderLogo,
      placeVideo: (...args) => videoSurface.place(...args),
      playlists: () => catalog.playlists.map((p) => ({ ...p, active: p.id === catalog.activeId })),
      activatePlaylist,
      addPlaylist: storeNewPlaylist,
      platform,
      persistResume,
      exitPlayer: () => exitPlayer(),
      getHls: () => hls,
      menu: (...a) => menu(...a),
      tracks: (...a) => tracks(...a),
      settingsLegacy: settings,
      keyLegacy: keyControl,
      showControlsLegacy: showControls,
      contextLegacy: () => advanced.channelTools(currentChannel()),
      stopPlayback: stopMedia
    });
    playbackUIReady = true;
    renderGuide = tvUI.renderGuide;
    renderGroups = tvUI.renderGroups;
    renderInfo = tvUI.renderInfo;
    renderCards = tvUI.renderCards;
    renderSearch = tvUI.renderSearch;
    importDialog = tvUI.openImport;
    keyControl = tvUI.keyControl;
    settings = tvUI.settings;
    showControls = tvUI.showControls;
    context = tvUI.context;
    movieDetails = tvUI.movieDetails;
    navigate = (view, ...args) => {
      const remembered = view === "guide" && ["movies", "series", "history"].includes(state.view) ? resumePlan(state.channels, resumeState, state.prefs, state.favorites, state.history) : null;
      legacyNavigate(view, ...args);
      if (remembered) {
        state.channel = remembered.channel;
        state.group = remembered.group;
        state.selected = null;
        render();
      }
      tvUI.afterNavigate();
    };
    setInterval(tick, 15e3);
    tick();
    applyPrefs();
    state.selected = programAt(currentChannel());
    render();
    try {
      const data = await cache("get");
      catalog = loadCatalog(data, state, resumeState);
      const active = activePlaylist(catalog);
      if (active) {
        applyPlaylist(active);
        if ((data == null ? void 0 : data.version) !== 2) await writeCatalog(catalog);
        render();
      } else if (catalog.playlists.length) {
        emptyLibrary();
        render();
      } else if (((_a4 = data == null ? void 0 : data.channels) == null ? void 0 : _a4.length) && !data.imported) {
        Object.assign(state, { channels: data.channels, source: data.source, imported: false });
        const fresh = demoData(), order = data.channels.map((c) => c.id);
        state.channels = fresh.channels.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
        state.programs = fresh.programs;
        state.channel = state.channels[0].id;
        render();
      }
    } catch {
      toast("Yerli yadda\u015F \u0259l\xE7atan deyil; n\xFCmun\u0259 rejimi a\xE7\u0131ld\u0131.");
    }
    tvUI.ready();
    const startup = resumePlan(state.channels, resumeState, state.prefs, state.favorites, state.history);
    state.channel = startup.channel;
    state.group = ((_b3 = state.groupPins) == null ? void 0 : _b3[startup.group]) ? "Ham\u0131s\u0131" : startup.group;
    state.view = state.channels.some((c) => c.type === "tv") ? startup.view : "movies";
    state.window = startup.window;
    state.selected = null;
    resumeReady = true;
    render();
    persistResume();
    if (startup.autoplay && (state.imported || localStorage.getItem("tl-tv-ready") === "true")) play(state.channels.find((c) => c.id === startup.channel), startup.fullscreen);
    window.addEventListener("pagehide", persistResume);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") persistResume();
    });
    window.addEventListener("beforeunload", () => {
      persistResume();
      hls == null ? void 0 : hls.destroy();
      multis.forEach((x) => {
        var _a5;
        return (_a5 = x.h) == null ? void 0 : _a5.destroy();
      });
    });
    for (const event of ["stalled", "waiting"]) video.addEventListener(event, () => {
      if (state.playing && !video.paused && state.playbackPhase === "playing") setPlaybackPhase("buffering");
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        if (state.playing && !video.paused && !document.hidden) showVideoError("Yay\u0131m ba\u011Flant\u0131s\u0131 dayand\u0131.");
      }, 2e4);
    });
    function syncNativeBounds() {
      var _a5;
      if (!((_a5 = window.TiviLoomNative) == null ? void 0 : _a5.nativeBounds)) return;
      const r = videoSurface.host.getBoundingClientRect();
      window.TiviLoomNative.nativeBounds(JSON.stringify({ left: r.left, top: r.top, width: r.width, height: r.height, viewport: window.innerWidth, visible: r.width > 0 && r.height > 0 && !videoSurface.host.hidden && !$("#modal-root").children.length && !!state.playing && !document.hidden }));
    }
    new MutationObserver(syncNativeBounds).observe($("#modal-root"), { childList: true });
    window.addEventListener("TiviLoomNativeExpand", enterPlayer);
    window.addEventListener("TiviLoomNativeExit", () => {
      exitPlayer();
      syncNativeBounds();
    });
    window.addEventListener("TiviLoomNativeAction", (e) => {
      var _a5, _b4;
      const [action, ...parts] = String(e.detail || "").split(":");
      const value = parts.join(":");
      if (action === "panel") {
        (_b4 = (_a5 = window.TiviLoomNative) == null ? void 0 : _a5.nativeCatalogue) == null ? void 0 : _b4.call(_a5, JSON.stringify({ mode: value, catalogue: state.channels.filter((x) => {
          var _a6, _b5;
          return !((_a6 = state.hiddenChannels) == null ? void 0 : _a6.includes(x.id)) && !((_b5 = state.hiddenGroups) == null ? void 0 : _b5.includes(x.group)) && advanced.groupAccessible(x.group);
        }).map(({ id, name, group }) => ({ id, name, group })), history: state.history }));
        return;
      }
      if (action === "fit") {
        state.prefs.fit = value;
        save("prefs");
        applyPrefs();
        return;
      }
      if (action === "muted") {
        state.prefs.muted = value === "true";
        save("prefs");
        applyPrefs();
        return;
      }
      if (action === "phase") {
        setPlaybackPhase(value);
        return;
      }
      if (action === "channel") {
        const c = state.channels.find((c2) => c2.id === value);
        if (c) play(c, state.full);
        return;
      }
      if (action === "command") {
        if (value === "next") channelStep(1);
        else if (value === "previous") channelStep(-1);
        else if (value === "favorite") favorite();
        else if (value === "mute") {
          state.prefs.muted = !state.prefs.muted;
          save("prefs");
          const c = state.channels.find((c2) => c2.id === state.playing);
          if (c) play(c, state.full);
        } else if (value === "settings") tvUI.settings();
        else if (value === "sleep") tvUI.sleepPanel();
      }
    });
    window.addEventListener("TiviLoomNativePlayerError", () => {
      var _a5, _b4;
      (_b4 = (_a5 = window.TiviLoomNative) == null ? void 0 : _a5.stopNativePlayer) == null ? void 0 : _b4.call(_a5);
      document.documentElement.classList.remove("native-preview");
      state.playing = null;
      state.full = false;
      delete video.dataset.tiviSource;
      setPlaybackPhase("idle");
      $("#player").hidden = true;
      videoSurface.place($("#preview"));
      toast("Player a\xE7\u0131la bilm\u0259di. Kanal\u0131 yenid\u0259n se\xE7in.");
    });
    let suspended = false;
    function tvSuspend() {
      var _a5, _b4;
      if ($("#mini-player") && !$("#mini-player").hidden) toggleMini(true);
      advanced.suspend();
      clearTimeout(reconnectTimer);
      clearTimeout(stallTimer);
      reconnectTimer = null;
      if (suspended) return;
      suspended = true;
      persistResume();
      (_b4 = (_a5 = window.TiviLoomNative) == null ? void 0 : _a5.stopNativePlayer) == null ? void 0 : _b4.call(_a5);
      document.documentElement.classList.remove("native-preview");
      ++playGeneration;
      hls == null ? void 0 : hls.destroy();
      hls = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
      state.playing = null;
      delete video.dataset.tiviSource;
      setPlaybackPhase("idle");
      $("#preview-play").classList.remove("playing");
      $("#preview-play").textContent = "\u25B6";
      $("#video-error").hidden = true;
    }
    function tvResume() {
      var _a5;
      if (!suspended) return;
      suspended = false;
      closeModal();
      tvUI.resetTransient();
      if (state.full) exitPlayer();
      const plan = resumePlan(state.channels, resumeState, state.prefs, state.favorites, state.history);
      Object.assign(state, { channel: plan.channel, group: ((_a5 = state.groupPins) == null ? void 0 : _a5[plan.group]) ? "Ham\u0131s\u0131" : plan.group, view: plan.view, window: plan.window, selected: null });
      render();
      tvUI.ready();
      if (plan.autoplay && (state.imported || localStorage.getItem("tl-tv-ready") === "true")) play(currentChannel(), true);
    }
    bindRemote({ back: () => tvUI.webOSBack(), longBack: () => tvUI.longBack(), suspend: tvSuspend, resume: tvResume, action: (action) => {
      if (advanced.remoteAction(action)) return;
      if (action === "play") {
        if (state.playing) video.play().catch(() => toast("Press OK to play."));
        else play(currentChannel(), true);
        return;
      }
      if (action === "pause") {
        video.pause();
        showControls("info");
        return;
      }
      if (action === "stop") {
        persistResume();
        tvSuspend();
        suspended = false;
        if (state.full) exitPlayer();
        return;
      }
      if (action === "forward" || action === "rewind") {
        if (Number.isFinite(video.duration)) video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + (action === "forward" ? 10 : -10)));
        showControls("info");
        return;
      }
      if (action === "next" || action === "previous") return channelStep(action === "next" ? 1 : -1);
      doAction(action);
    } });
    advanced.start();
    if ($("#welcome").hidden) (_c = $(".programme.selected")) == null ? void 0 : _c.focus({ preventScroll: true });
  }
  main().catch((e) => {
    console.error(e);
    const boot = document.getElementById("boot");
    if (boot) {
      boot.hidden = false;
      boot.style.backgroundImage = "none";
      boot.textContent = "Unable to start: " + e.message;
    }
  });
})();
//# sourceMappingURL=bundle.js.map
