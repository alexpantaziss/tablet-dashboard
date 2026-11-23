/* dashboard-frame.js: ψηφιακή κορνίζα (η προεπιλεγμένη οθόνη όλη μέρα), φωτογραφίες από iCloud, θέμα μέρας/νύχτας.
   Ρυθμίσεις: CONFIG.FRAME, CONFIG.ICLOUD, CONFIG.THEME. Το link του album: SECRETS.ICLOUD_ALBUM_URL (dashboard-secrets.js).

   Κορνίζα
   - Φωτογραφίες σε πλήρη οθόνη, μία κάθε FRAME.photoEverySec, με απλό crossfade. Χωρίς zoom, χωρίς συνεχή κίνηση.
   - Κάτω λωρίδα: ρολόι, θερμοκρασία, επόμενο γεγονός. Μόνο όταν χρειάζεται: βροχή, σεισμός, χρόνος διαδρομής.
   - Ένα άγγιγμα δείχνει το dashboard. Μετά από FRAME.idleBackMin λεπτά χωρίς άγγιγμα γυρίζει στην κορνίζα.
   - Στο CONFIG.COMMUTE (π.χ. Δευ-Τετ 07:30-08:10) δείχνει μόνο του το dashboard και δεν γυρίζει στην κορνίζα. Η νύχτα μένει όπως ήταν.
   Φωτογραφίες iCloud (κοινόχρηστο album, νέα μορφή link photos.icloud.com/shared/album/<token>)
   - Το tablet ρωτάει απευθείας το CloudKit της Apple, όπως η σελίδα του album: resolve (προσωρινό token 20 λεπτών),
     μετά query για τη λίστα. Κάθε φωτογραφία κατεβαίνει στη μικρότερη έκδοση με μεγάλη πλευρά τουλάχιστον ICLOUD.minSide,
     μικραίνει εδώ ώστε να καλύπτει 1280x800 και μένει στο IndexedDB. Έλεγχος για νέες κάθε ICLOUD.checkEveryMin.
   - Αν σταματήσει το link: συνεχίζει με όσες έχει και το γράφει στην κάρτα Σύστημα (οθόνη 2) και στο Telegram "status".
   Θέμα: φωτεινό από την ανατολή ως τη δύση, σκούρο μετά (ώρες από τον καιρό του Open-Meteo).
   Δοκιμή: ?demo=1 (κορνίζα με δοκιμαστικές φωτογραφίες), &view=dashboard, &theme=dark ή light, &traffic=1 */
(function(){
"use strict";
var F = CONFIG.FRAME || {}, IC = CONFIG.ICLOUD || {}, TH = CONFIG.THEME || {};
var root = document.documentElement, Q = location.search;
var ALBUM = (window.SECRETS && SECRETS.ICLOUD_ALBUM_URL) || "";

/* =====================================================================
   Θέμα
   ===================================================================== */
function sunTimes(){
  var w = DEMO ? demoWeather() : (load("weather") || {}).v;
  var D = w && w.daily, today = new Date().toDateString();
  if(D && D.sunrise && D.sunset){
    for(var i = 0; i < D.time.length; i++){
      if(new Date(D.time[i] + "T12:00:00").toDateString() === today && D.sunrise[i] && D.sunset[i]) return { sr: new Date(D.sunrise[i]), ss: new Date(D.sunset[i]) };
    }
  }
  return null;
}
function applyTheme(){
  var force = /[?&]theme=(dark|light)/.exec(Q), now = new Date(), light;
  if(force) light = force[1] === "light";
  else if(TH.auto === false) light = false;
  else {
    var s = sunTimes();
    light = s ? (now >= s.sr && now < s.ss) : inWindow((TH.fallbackDay || ["07:00","18:00"])[0], (TH.fallbackDay || ["07:00","18:00"])[1], now);
  }
  if(root.classList.contains(light ? "light" : "dark")) return;
  root.classList.remove("light", "dark"); root.classList.add(light ? "light" : "dark");
  var mt = document.querySelector('meta[name="theme-color"]'); if(mt) mt.setAttribute("content", light ? "#f2f2f7" : "#000000");
}

/* =====================================================================
   Στυλ και markup της κορνίζας
   ===================================================================== */
var css =
  "#frame{position:fixed;top:0;right:0;bottom:0;left:0;z-index:6;background:#000;display:none;overflow:hidden;cursor:pointer}" +
  "html.frame-on #frame{display:block}" +
  "body.night #frame{display:none}" +
  "html.frame-on #app, html.frame-on #pager, html.frame-on #eq-banner{display:none}" +
  "body.night #app{display:flex}" +   /* τη νύχτα, με άγγιγμα, φαίνεται πάντα το dashboard όπως πριν */
  ".fr-layer{position:absolute;top:0;right:0;bottom:0;left:0;opacity:0;transition:opacity " + ((F.fadeMs || 1200) / 1000) + "s ease}" +
  ".fr-layer.on{opacity:1}" +
  ".fr-layer img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover}" +
  /* κάθετες: ολόκληρη η φωτογραφία στη μέση, στα πλάγια η ίδια φωτογραφία σε 24 px, τεντωμένη (φυσικό θόλωμα χωρίς filter) και σκούρα */
  ".fr-side{position:absolute;top:0;right:0;bottom:0;left:0;background:#111 center/cover no-repeat;display:none}" +
  ".fr-side::after{content:'';position:absolute;top:0;right:0;bottom:0;left:0;background:rgba(0,0,0,.55)}" +
  ".fr-layer.tall .fr-side{display:block} .fr-layer.tall img{object-fit:contain}" +
  /* λωρίδα: σκίαση με διαβάθμιση (όχι blur), λευκό κείμενο. Αντίθεση πάνω από 4,7:1 ακόμα και σε λευκή φωτογραφία */
  "#fr-strip{position:absolute;left:0;right:0;bottom:0;padding:4.5rem 2.25rem 1.375rem;display:flex;flex-direction:column;gap:.875rem;color:#fff;" +
    "background:linear-gradient(to top,rgba(0,0,0,.62) 0,rgba(0,0,0,.55) 45%,rgba(0,0,0,0) 100%);text-shadow:0 1px 2px rgba(0,0,0,.35);pointer-events:none}" +
  "#fr-main{display:flex;align-items:flex-end;gap:1.75rem;min-width:0}" +
  "#fr-chips{display:none;gap:.75rem;flex-wrap:wrap} #fr-chips.has{display:flex}" +
  "#fr-clock{font-size:4.5rem;font-weight:600;letter-spacing:-.035em;line-height:.9;font-variant-numeric:tabular-nums}" +
  ".fr-i{font-size:1.75rem;font-weight:500;line-height:1.2;white-space:nowrap;display:flex;align-items:center;gap:.5rem;padding-bottom:.25rem}" +
  ".fr-i:empty{display:none}" +
  "#fr-wx{font-variant-numeric:tabular-nums}" +
  "#fr-ev{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;display:block}" +
    ".fr-chip{font-size:1.625rem;font-weight:600;padding:.375rem 1rem;border-radius:999px;background:rgba(0,0,0,.42);white-space:nowrap;display:flex;align-items:center;gap:.5rem}" +
  ".fr-chip:empty{display:none}" +
  "#fr-eq{background:rgba(120,60,0,.7)}" +
  "#fr-tm{font-variant-numeric:tabular-nums} #fr-tm.ring{background:rgba(196,0,26,.78)}" +
  ".fr-chip .dot{width:.875rem;height:.875rem}" +
  ".fr-chip .dot.ok{background:#30d158} .fr-chip .dot.warn{background:#ffb340} .fr-chip .dot.bad{border-color:#ff7b72}" +
  /* κουμπί "επόμενη": δεξιά στη μέση, μεγάλο σημείο αφής (72 px), διακριτικό πάνω στη φωτογραφία */
  "#fr-next{position:absolute;right:1.25rem;top:50%;width:4.5rem;height:4.5rem;margin-top:-2.25rem;border:0;border-radius:50%;padding:0;" +
    "background:rgba(0,0,0,.38);color:#fff;font-size:2.75rem;line-height:4.25rem;text-align:center;opacity:.8;-webkit-tap-highlight-color:transparent}" +
  "#fr-next:active{background:rgba(0,0,0,.6);opacity:1}" +
  "#fr-empty{position:absolute;left:0;right:0;top:40%;text-align:center;color:#98989f;font-size:1.375rem;display:none}" +
  "@media (prefers-reduced-motion:reduce){.fr-layer{transition:none}}";
var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

var fr = document.createElement("div"); fr.id = "frame"; fr.setAttribute("role", "button"); fr.setAttribute("aria-label", "Κορνίζα. Άγγιξε για το dashboard");
fr.innerHTML =
  '<div class="fr-layer" id="fr-a"><div class="fr-side"></div><img alt=""></div>' +
  '<div class="fr-layer" id="fr-b"><div class="fr-side"></div><img alt=""></div>' +
  '<div id="fr-empty"></div>' +
  '<button id="fr-next" type="button" aria-label="Επόμενη φωτογραφία">&#8250;</button>' +
  '<div id="fr-strip"><div id="fr-chips"><div class="fr-chip" id="fr-car"></div><div class="fr-chip" id="fr-rain"></div><div class="fr-chip" id="fr-eq"></div><div class="fr-chip" id="fr-tm"></div></div>' +
  '<div id="fr-main"><div id="fr-clock">--:--</div><div class="fr-i" id="fr-wx"></div><div class="fr-i" id="fr-ev"></div></div></div>';
document.body.appendChild(fr);

/* =====================================================================
   Αποθήκη φωτογραφιών: IndexedDB (μένει μετά από reload/reboot). Αν δεν ανοίξει, μνήμη.
   Εγγραφή: { id, blob, w, h, tall, side (μικρό dataURL για τα πλάγια), added }
   ===================================================================== */
var DB = null, MEM = {}, IDS = [];
function dbOpen(){
  if(DEMO || !window.indexedDB) return Promise.resolve(null);
  return new Promise(function(res){
    var r; try{ r = indexedDB.open("hcc-photos", 1); }catch(e){ return res(null); }
    r.onupgradeneeded = function(){ r.result.createObjectStore("p", { keyPath: "id" }); };
    r.onsuccess = function(){ res(r.result); };
    r.onerror = function(){ res(null); };
  });
}
function tx(mode, fn){
  return new Promise(function(res, rej){
    var t = DB.transaction("p", mode), s = t.objectStore("p"), out = fn(s);
    t.oncomplete = function(){ res(out && out.result !== undefined ? out.result : out); };
    t.onerror = function(){ rej(t.error); };
  });
}
function pGet(id){ return DB ? tx("readonly", function(s){ return s.get(id); }) : Promise.resolve(MEM[id]); }
function pPut(rec){ if(DB) return tx("readwrite", function(s){ s.put(rec); }); MEM[rec.id] = rec; return Promise.resolve(); }
function pDel(id){ if(DB) return tx("readwrite", function(s){ s.delete(id); }); delete MEM[id]; return Promise.resolve(); }
function pKeys(){ return DB ? tx("readonly", function(s){ return s.getAllKeys(); }) : Promise.resolve(Object.keys(MEM)); }

/* ---- μικραίνει μια εικόνα (blob) ώστε να καλύπτει fitW x fitH, κρατάει και ένα μικροσκοπικό αντίγραφο για τα πλάγια ---- */
function shrink(blob){
  return new Promise(function(res, rej){
    var url = URL.createObjectURL(blob), img = new Image();
    img.onload = function(){
      var w = img.naturalWidth, h = img.naturalHeight, W = IC.fitW || 1280, Hh = IC.fitH || 800;
      var tall = w / h < 1.25;                                         // κάθετες και τετράγωνες: ολόκληρες, με πλάγια
      var k = Math.min(1, tall ? Hh / h : Math.max(W / w, Hh / h));    // ποτέ μεγέθυνση
      var cw = Math.round(w * k), ch = Math.round(h * k);
      var c = document.createElement("canvas"); c.width = cw; c.height = ch;
      var g = c.getContext("2d"); g.drawImage(img, 0, 0, cw, ch);
      var side = "";
      if(tall){ var t = document.createElement("canvas"); t.width = 24; t.height = Math.max(1, Math.round(24 * h / w));
        t.getContext("2d").drawImage(img, 0, 0, t.width, t.height); side = t.toDataURL("image/jpeg", 0.7); }
      URL.revokeObjectURL(url);
      c.toBlob(function(b){ c.width = c.height = 0; b ? res({ blob: b, w: cw, h: ch, tall: tall, side: side }) : rej(new Error("toBlob")); }, "image/jpeg", IC.quality || 0.86);
    };
    img.onerror = function(){ URL.revokeObjectURL(url); rej(new Error("δεν διαβάζεται η εικόνα")); };
    img.src = url;
  });
}

/* =====================================================================
   iCloud: κοινόχρηστο album μέσω CloudKit (ό,τι κάνει και η σελίδα photos.icloud.com)
   ===================================================================== */
var SYNC = { ok: null, lastOk: 0, lastTry: 0, err: "", count: 0, busy: false };
(function(){ var s = load("icloud_sync"); if(s && s.v){ SYNC.lastOk = s.v.lastOk || 0; } })();
function albumToken(u){
  var m = /\/shared\/album\/([A-Za-z0-9_-]+)/.exec(u) || /#([A-Za-z0-9_-]+)/.exec(u);
  return m ? m[1] : "";
}
function ckPost(url, body){
  return fetchT(url, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(body) }, 25000).then(function(r){ return r.json(); });
}
function field(rec, name){ var f = rec && rec.fields && rec.fields[name]; return f ? f.value : undefined; }
var DECODABLE = { "public.jpeg": 1, "public.png": 1 };
// Από ένα CPLAsset και το CPLMaster του: η μικρότερη έκδοση με μεγάλη πλευρά >= minSide (αλλιώς η μεγαλύτερη που υπάρχει)
function chooseRes(asset, master){
  var cands = [];
  [["resJPEGFull", asset], ["resJPEGMed", asset], ["resJPEGFull", master], ["resJPEGMed", master], ["resOriginal", master], ["resJPEGThumb", master]].forEach(function(p){
    var rec = p[1], res = field(rec, p[0] + "Res"); if(!res || !res.downloadURL) return;
    var type = field(rec, p[0] + "FileType") || (p[0] === "resOriginal" ? field(master, "itemType") : "public.jpeg");
    if(!DECODABLE[type]) return;
    var w = field(rec, p[0] + "Width") || 0, h = field(rec, p[0] + "Height") || 0;
    cands.push({ url: res.downloadURL.replace("${f}", "photo.jpg"), side: Math.max(w, h), sum: res.fileChecksum || "", size: res.size || 0 });
  });
  if(!cands.length) return null;
  var min = IC.minSide || 1280;
  var ok = cands.filter(function(c){ return c.side >= min; }).sort(function(a, b){ return a.side - b.side; })[0];
  return ok || cands.sort(function(a, b){ return b.side - a.side; })[0];
}
function listAlbum(){
  var key = albumToken(ALBUM);
  if(!key) return Promise.reject(new Error("λάθος link album"));
  return ckPost("https://ckdatabasews.icloud.com/database/1/com.apple.photos.cloud/production/public/records/resolve?remapEnums=true&sharing_url_key=" + key,
    { shortGUIDs: [{ value: key }] }).then(function(j){
    var r = j.results && j.results[0];
    if(!r || !r.anonymousPublicAccess) throw new Error(j.errors || (r && r.serverErrorCode) ? "το album δεν βρέθηκε" : "άγνωστη απάντηση");
    var ap = r.anonymousPublicAccess, zoneID = r.zoneID;
    var base = ap.databasePartition.replace(/:443$/, "") + "/database/1/com.apple.photos.cloud/production/shared/records/query?remapEnums=true&sharing_url_key=" + key +
      "&publicAccessAuthToken=" + encodeURIComponent(ap.token);
    var assets = [], masters = {}, rank = 0, pages = 0;
    function page(){
      return ckPost(base, { query: { recordType: "CPLAssetAndMasterByAddedDate", filterBy: [
          { fieldName: "direction", comparator: "EQUALS", fieldValue: { value: "ASCENDING", type: "STRING" } },
          { fieldName: "startRank", comparator: "EQUALS", fieldValue: { value: rank, type: "INT64" } }] }, zoneID: zoneID, resultsLimit: 200 })
      .then(function(q){
        if(!q.records) throw new Error(q.serverErrorCode || "χωρίς λίστα");
        var n = 0;
        q.records.forEach(function(x){ if(x.recordType === "CPLAsset"){ assets.push(x); n++; } else if(x.recordType === "CPLMaster") masters[x.recordName] = x; });
        rank += n; pages++;
        return n && pages < 30 ? page() : null;
      });
    }
    return page().then(function(){
      var out = [];
      assets.forEach(function(a){
        if(field(a, "isHidden") || field(a, "trashReason")) return;
        var ref = field(a, "masterRef"), m = ref && masters[ref.recordName]; if(!m) return;
        if(/movie|video|mpeg/i.test(field(m, "itemType") || "")) return;
        var c = chooseRes(a, m); if(!c) return;
        out.push({ id: a.recordName + ":" + c.sum, url: c.url, added: field(a, "addedDate") || 0 });
      });
      return out;
    });
  });
}
function syncAlbum(){
  if(DEMO || !ALBUM || SYNC.busy) return;
  SYNC.busy = true; SYNC.lastTry = Date.now();
  var fresh = [];
  listAlbum().then(function(list){
    var want = {}; list.forEach(function(p){ want[p.id] = p; });
    return pKeys().then(function(have){
      var hv = {}; have.forEach(function(k){ hv[k] = 1; });
      var dels = have.filter(function(k){ return !want[k]; });
      var adds = list.filter(function(p){ return !hv[p.id]; });
      // μία μία, για να μη γεμίζει η μνήμη του tablet
      var chain = Promise.all(dels.map(pDel));
      adds.forEach(function(p){
        chain = chain.then(function(){
          return fetchT(p.url, {}, 60000).then(function(r){ return r.blob(); }).then(shrink).then(function(s){
            s.id = p.id; s.added = p.added; fresh.push(p.id);
            // η πρώτη φωτογραφία φαίνεται αμέσως, χωρίς να περιμένει να κατέβουν όλες
            return pPut(s).then(function(){ if(!urls[front]) return refreshIds([p.id]); });
          }).catch(function(e){ SYNC.err = "μία φωτογραφία δεν κατέβηκε (" + e.message + ")"; });
        });
      });
      return chain.then(function(){ return { dels: dels, total: list.length }; });
    });
  }).then(function(r){
    SYNC.ok = true; SYNC.lastOk = Date.now(); SYNC.count = r.total; SYNC.err = "";
    store("icloud_sync", { lastOk: SYNC.lastOk });
    mark("Φωτογραφίες iCloud", true);
    return refreshIds(fresh, r.dels);
  }).catch(function(e){
    SYNC.ok = false; SYNC.err = e && e.message || "σφάλμα";
    mark("Φωτογραφίες iCloud", false, "το link δεν απαντά, συνεχίζει με " + IDS.length);
    setTimeout(syncAlbum, (IC.retryMin || 5) * 60000);
  }).then(function(){ SYNC.busy = false; });
}

/* =====================================================================
   Εναλλαγή φωτογραφιών
   ===================================================================== */
var order = [], pos = 0, front = 0, layers = [$("fr-a"), $("fr-b")], urls = [null, null], rotTimer = null;
function shuffle(a){ for(var i = a.length - 1; i > 0; i--){ var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function refreshIds(fresh, dels){
  return pKeys().then(function(keys){
    IDS = keys;
    dels = dels || [];
    // οι νέες φωτογραφίες μπαίνουν αμέσως μετά την τρέχουσα, ώστε να φανούν γρήγορα
    var rest = order.slice(pos).filter(function(id){ return keys.indexOf(id) >= 0 && (fresh || []).indexOf(id) < 0; });
    var missing = keys.filter(function(id){ return rest.indexOf(id) < 0 && (fresh || []).indexOf(id) < 0; });
    order = (fresh || []).filter(function(id){ return keys.indexOf(id) >= 0; }).concat(rest, shuffle(missing));
    pos = 0;
    if(!urls[front] && order.length) showNext();
    updateEmpty();
  });
}
function nextId(){
  if(!order.length) return null;
  if(pos >= order.length){ var last = order[order.length - 1]; order = shuffle(IDS.slice()); if(order.length > 1 && order[0] === last){ order.push(order.shift()); } pos = 0; }
  return order[pos++];
}
function showNext(){
  var id = nextId(); if(!id) return;
  pGet(id).then(function(rec){
    if(!rec){ IDS = IDS.filter(function(x){ return x !== id; }); return; }
    var back = 1 - front, L = layers[back], img = L.querySelector("img"), side = L.querySelector(".fr-side");
    var url = URL.createObjectURL(rec.blob);
    img.onload = function(){
      L.className = "fr-layer on" + (rec.tall ? " tall" : "");
      layers[front].className = layers[front].className.replace(/\s*\bon\b/, "");
      var oldIdx = front; front = back;
      // ελευθερώνει την προηγούμενη εικόνα μετά το crossfade
      setTimeout(function(){ if(urls[oldIdx] && oldIdx !== front){ layers[oldIdx].querySelector("img").removeAttribute("src"); URL.revokeObjectURL(urls[oldIdx]); urls[oldIdx] = null; } }, (F.fadeMs || 1200) + 300);
    };
    img.onerror = function(){ URL.revokeObjectURL(url); urls[back] = null; pDel(id).then(function(){ refreshIds(); }); };
    side.style.backgroundImage = rec.tall && rec.side ? 'url("' + rec.side + '")' : "none";
    urls[back] = url; img.src = url;
  }).catch(function(){});
}
function rotate(on){
  clearInterval(rotTimer); rotTimer = null;
  if(on) rotTimer = setInterval(function(){ if(!isNight()) showNext(); }, (F.photoEverySec || 60) * 1000);
}
function updateEmpty(){
  var e = $("fr-empty");
  if(IDS.length){ e.style.display = "none"; return; }
  e.textContent = !ALBUM && !DEMO ? "Δεν έχει οριστεί album iCloud (dashboard-secrets.js)." : "Φόρτωση φωτογραφιών από το iCloud...";
  e.style.display = "block";
}

/* =====================================================================
   Κορνίζα ή dashboard
   ===================================================================== */
var lastTouch = Date.now(), frameOn = false;
function isNight(){ return document.body.className.indexOf("night") >= 0; }
function autoDash(d){ var A = CONFIG.COMMUTE || F.dashboardAuto; d = d || new Date(); return !!A && (A.days || []).indexOf(d.getDay()) >= 0 && inWindow(A.from, A.to, d); }
function setFrame(on){
  if(on === frameOn) return;
  frameOn = on;
  root.classList.toggle("frame-on", on);
  rotate(on);
  if(on){ stripDraw(); if(!urls[front]) showNext(); }
  else wakeDashboard();
}
// Όσο φαίνεται η κορνίζα το #app είναι κρυμμένο (λεωφορεία, ειδήσεις κ.λπ. δεν ανανεώνονται άσκοπα).
// Όταν ξαναφανεί: κύρια οθόνη και φρέσκα δεδομένα από την cache.
function wakeDashboard(){
  if(window.setScreen) setScreen(0);
  try{ var w = DEMO ? demoWeather() : (load("weather") || {}).v; if(w && window.renderWeather) renderWeather(w); }catch(e){}
  if(typeof drawNews === "function") drawNews();
  if(typeof loadBus === "function") setTimeout(loadBus, 50);
}
function decide(){
  applyTheme();
  if(!F.enabled){ setFrame(false); return; }
  var now = new Date();
  if(autoDash(now)){ if(frameOn){ lastTouch = Date.now(); setFrame(false); } return; }
  if(!frameOn && Date.now() - lastTouch >= (F.idleBackMin || 3) * 60000 && !isNight()) setFrame(true);
  if(frameOn) stripDraw();
}
document.addEventListener("touchstart", function(){ lastTouch = Date.now(); }, { passive: true, capture: true });
document.addEventListener("click", function(){ lastTouch = Date.now(); }, true);
var leftAt = 0;
fr.addEventListener("click", function(e){ e.stopPropagation(); lastTouch = Date.now(); leftAt = Date.now(); setFrame(false); });
// "επόμενη": αλλάζει φωτογραφία (με την ανακατεμένη σειρά) χωρίς να κλείσει την κορνίζα,
// και ο χρόνος ως την επόμενη αυτόματη αλλαγή μετράει από την αρχή
var nextAt = 0;
$("fr-next").addEventListener("click", function(e){
  e.stopPropagation(); lastTouch = Date.now();
  if(Date.now() - nextAt < 700) return;      // όχι δεύτερη αλλαγή στη μέση του crossfade
  nextAt = Date.now(); showNext(); rotate(frameOn);
});
// το άγγιγμα που κλείνει την κορνίζα δεν πατάει και κάτι από κάτω (διπλό πάτημα, "ghost click")
document.addEventListener("click", function(e){ if(Date.now() - leftAt < 600 && !fr.contains(e.target)){ e.stopPropagation(); e.preventDefault(); } }, true);

/* =====================================================================
   Λωρίδα
   ===================================================================== */
function wxData(){ return DEMO ? demoWeather() : (load("weather") || {}).v; }
function rainText(w){
  if(!w || !w.hourly) return "";
  var c = w.current || {}, H = w.hourly, now = Date.now(), lim = now + (F.rainLookHours || 12) * 3600000;
  if((c.precipitation || 0) >= 0.2) return "☔ Βρέχει";
  for(var i = 0; i < H.time.length; i++){
    var t = new Date(H.time[i]).getTime();
    if(t + 3600000 <= now) continue;
    if(t > lim) break;
    if((H.precipitation_probability[i] || 0) >= (F.rainProb || 50)) return t <= now ? "☔ Βροχή τώρα" : "☔ Βροχή από " + hm(new Date(t));
  }
  return "";
}
function stripDraw(){
  var d = new Date();
  $("fr-clock").textContent = hm(d);
  var w = wxData();
  if(w && w.current){ var wi = wInfo(w.current.weather_code, w.current.is_day); $("fr-wx").textContent = wi.icon + " " + Math.round(w.current.temperature_2m) + "°"; }
  var ev = window.calNext ? calNext() : null;
  $("fr-ev").textContent = ev ? (ev.allDay ? "📅 " + ev.title : "📅 " + (ev.tomorrow ? "Αύριο: " : ev.day ? ev.day + ": " : "") + ev.title + ", " + hm(ev.start)) : "";
  $("fr-rain").textContent = rainText(w);
  var tr = window.trafficNow ? trafficNow() : null;
  $("fr-car").innerHTML = tr ? '<span class="dot ' + tr.cls + '"></span>🚗 ' + tr.min + ' λεπ.' : "";
  var q = window.eqNow ? eqNow() : null;
  $("fr-eq").textContent = q ? "⚠️ " + eqFmt(q) : "";
  // χρονόμετρο: το κείμενο το γράφει κάθε δευτερόλεπτο το dashboard-timer.js (window.timerNow)
  var tm = window.timerNow ? timerNow() : "";
  $("fr-tm").innerHTML = tm;
  $("fr-chips").className = (tr || q || tm || $("fr-rain").textContent) ? "has" : "";
}
window.frameRefresh = function(){ if(frameOn) stripDraw(); };

/* =====================================================================
   Κατάσταση: κάρτα Σύστημα και Telegram "status"
   ===================================================================== */
(window.statusLines = window.statusLines || []).push(function(){
  if(DEMO) return "";
  if(!ALBUM) return "📷 Φωτογραφίες: δεν έχει οριστεί album iCloud";
  if(SYNC.ok === false) return "⚠️ Φωτογραφίες: το link του iCloud δεν απαντά (" + SYNC.err + ")" +
    (SYNC.lastOk ? ", τελευταία επιτυχία " + new Date(SYNC.lastOk).toLocaleString("el-GR") : "") + ". Συνεχίζει με " + IDS.length + " φωτογραφίες.";
  return "📷 Φωτογραφίες: " + IDS.length + " από το iCloud" + (SYNC.lastOk ? ", έλεγχος " + hm(new Date(SYNC.lastOk)) : "") + (SYNC.err ? " (" + SYNC.err + ")" : "");
});

/* =====================================================================
   Δοκιμαστικές φωτογραφίες (?demo=1): ζωγραφίζονται εδώ, ώστε να μη χρειάζονται αρχεία ή internet
   ===================================================================== */
function demoPhotos(){
  var scenes = [
    { w: 1600, h: 1000, sky: ["#1d3b6e", "#e98a57"], sun: "#ffd28a", hills: ["#3a2f4a", "#23203a", "#141322"] },
    { w: 1600, h: 1000, sky: ["#5aa7e6", "#cfe8f7"], sun: "#fff6d8", hills: ["#6f9f5b", "#4e7f43", "#2f5a2e"] },
    { w: 900, h: 1200, sky: ["#2b5876", "#4e4376"], sun: "#f5e6ff", hills: ["#2e3a59", "#1f2944", "#121a2e"] },
    { w: 1600, h: 1000, sky: ["#0f2027", "#2c5364"], sun: "#e8f4ff", hills: ["#25414a", "#1a2f36", "#0e1b20"] }
  ];
  var chain = Promise.resolve();
  scenes.forEach(function(s, n){
    chain = chain.then(function(){
      var c = document.createElement("canvas"); c.width = s.w; c.height = s.h;
      var g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, s.h);
      gr.addColorStop(0, s.sky[0]); gr.addColorStop(1, s.sky[1]); g.fillStyle = gr; g.fillRect(0, 0, s.w, s.h);
      g.fillStyle = s.sun; g.beginPath(); g.arc(s.w * (0.3 + 0.15 * n), s.h * 0.42, s.w * 0.06, 0, 7); g.fill();
      s.hills.forEach(function(col, k){
        g.fillStyle = col; g.beginPath(); g.moveTo(0, s.h);
        for(var x = 0; x <= s.w; x += 20) g.lineTo(x, s.h * (0.58 + k * 0.1) + Math.sin(x / (180 + 60 * k) + n + k) * s.h * 0.05);
        g.lineTo(s.w, s.h); g.fill();
      });
      return new Promise(function(res){ c.toBlob(res, "image/jpeg", 0.9); });
    }).then(shrink).then(function(r){ r.id = "demo" + n; r.added = n; return pPut(r); });
  });
  return chain.then(function(){ return refreshIds(); });
}

/* =====================================================================
   Εκκίνηση
   ===================================================================== */
applyTheme();
dbOpen().then(function(db){
  DB = db;
  if(!db && !DEMO) mark("Φωτογραφίες iCloud", false, "χωρίς IndexedDB, μόνο στη μνήμη");
  return DEMO ? demoPhotos() : refreshIds();
}).then(function(){
  setTimeout(syncAlbum, 4000);
  setInterval(syncAlbum, (IC.checkEveryMin || 30) * 60000);
});
var view = /[?&]view=(dashboard|frame)/.exec(Q);
if(view ? view[1] === "frame" : (F.enabled && !autoDash() && !isNight())){ lastTouch = 0; setFrame(true); }
updateEmpty();
setInterval(decide, 15000);
})();
