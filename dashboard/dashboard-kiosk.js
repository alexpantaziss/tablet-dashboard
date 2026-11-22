/* =====================================================================
   Γέφυρα με την εφαρμογή "Οθόνη σπιτιού" (kiosk-app): window.kiosk
   - Telegram "screenshot": φωτογραφία της οθόνης
   - Telegram "υγεία" και γραμμή στο "status": μπαταρία, μνήμη, Wi-Fi
   - Ειδοποίηση αν ζεσταθεί η μπαταρία
   - Φωτεινότητα μέρας και νύχτας
   (Το άνοιγμα εφαρμογών με επιστροφή είναι στα κουμπιά του dashboard.html.)
   Στο Fully ή στον υπολογιστή δεν υπάρχει window.kiosk και το αρχείο δεν κάνει τίποτα.
   ===================================================================== */
(function(){
var K = window.kiosk;
if(!K || typeof CONFIG === "undefined" || !CONFIG.KIOSK) return;
var C = CONFIG.KIOSK;
var root = document.documentElement;
var HAS_TG = typeof TELEGRAM !== "undefined" && TELEGRAM.botToken && TELEGRAM.chatId;

function tgUrl(method){ return "https://api.telegram.org/bot" + TELEGRAM.botToken + "/" + method; }
function tgText(text){
  if(!HAS_TG) return Promise.resolve();
  return fetch(tgUrl("sendMessage") + "?chat_id=" + encodeURIComponent(TELEGRAM.chatId) + "&text=" + encodeURIComponent(text)).catch(function(){});
}
function readHealth(){ try{ return JSON.parse(K.health()); }catch(e){ return {}; } }
function hhmm(){ var d = new Date(); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }

/* ---- 1. Φωτεινότητα ----------------------------------------------- */
// Ελέγχει κάθε 5": νυχτερινή οθόνη (body.night), ξυπνημένη με άγγιγμα (html.awake), ή μέρα.
var lastLevel = null;
function brightness(){
  var night = document.body.className.indexOf("night") >= 0;
  var awake = /\bawake\b/.test(root.className);
  var level = night ? (awake ? C.brightnessAwake : C.brightnessNight) : C.brightnessDay;
  if(level !== lastLevel){ K.setBrightness(level); lastLevel = level; }
}
brightness();
setInterval(brightness, 5000);

/* ---- 2. Υγεία του tablet ------------------------------------------ */
function wifiWord(bars){ return ["πολύ κακό", "κακό", "μέτριο", "καλό", "εξαιρετικό"][Math.max(0, Math.min(4, bars))]; }

function healthText(full){
  var h = readHealth(), b = h.battery || {}, m = h.memory || {}, w = h.wifi, a = h.app || {};
  var lines = [];
  if(b.tempC != null) lines.push("🌡️ Μπαταρία " + b.tempC.toFixed(1).replace(".", ",") + "°C" + (h.cpuTempC ? " · επεξεργαστής " + Math.round(h.cpuTempC) + "°C" : ""));
  if(m.totalMB) lines.push("🧠 Ελεύθερη μνήμη " + m.freeMB + " από " + m.totalMB + " MB" + (m.low ? " (χαμηλή!)" : ""));
  if(w) lines.push("📶 Wi-Fi " + wifiWord(w.bars) + " (" + w.rssi + " dBm)");
  var restarts = (a.rendererRestarts || 0) + (a.watchdogReloads || 0);
  if(full){
    if(b.percent != null) lines.push("🔋 " + b.percent + "%" + (b.plugged ? ", στην πρίζα" : "") + ", κατάσταση: " + b.health);
    if(h.storageFreeMB != null) lines.push("💾 Ελεύθερος χώρος " + (h.storageFreeMB / 1024).toFixed(1).replace(".", ",") + " GB");
    var up = a.deviceUpMin || 0;
    lines.push("⏱️ Tablet ανοιχτό " + (up < 60 ? up + " λεπτά" : Math.floor(up / 60) + " ώρ. " + (up % 60) + " λ.") +
               ", εφαρμογή " + a.version);
    lines.push("🔁 Επαναφορτώσεις: " + restarts + " (σφάλματα φόρτωσης " + (a.loadErrors || 0) + ", κρασαρίσματα εφαρμογής " + (a.crashes || 0) + ")");
  } else if(restarts){
    lines.push("🔁 Ξαναφόρτωσε μόνη της " + restarts + " φορές");
  }
  return lines.join("\n");
}

// Γραμμές στο Telegram "status" (το dashboard-extras.js τις προσθέτει στο τέλος)
(window.statusLines = window.statusLines || []).push(function(){ return healthText(false); });

/* ---- 3. Ειδοποίηση αν ζεσταθεί η μπαταρία ------------------------- */
// Μία ειδοποίηση όταν ξεπεράσει το batteryHotC και μία όταν πέσει κάτω από το batteryCoolC.
// Η κατάσταση κρατιέται στο localStorage, ώστε ένα reload να μην ξαναστέλνει την ίδια ειδοποίηση.
function checkHeat(){
  var b = readHealth().battery; if(!b || b.tempC == null) return;
  var hot = localStorage.getItem("hcc_kiosk_hot") === "1";
  var t = b.tempC.toFixed(1).replace(".", ",");
  if(!hot && b.tempC >= C.batteryHotC){
    localStorage.setItem("hcc_kiosk_hot", "1");
    tgText("🔥 Η μπαταρία του tablet είναι στους " + t + "°C. Αν συνεχίσει, βγάλε το από την πρίζα για λίγο ή άφησέ το να αεριστεί.");
  } else if(hot && b.tempC <= C.batteryCoolC){
    localStorage.setItem("hcc_kiosk_hot", "0");
    tgText("✅ Η μπαταρία του tablet έπεσε στους " + t + "°C.");
  }
  if(typeof mark === "function") mark("Θερμοκρασία μπαταρίας", b.tempC < C.batteryHotC, t + "°C");
}
checkHeat();
setInterval(checkHeat, C.healthEveryMin * 60000);

/* ---- 4. Telegram: screenshot και υγεία ---------------------------- */
function sendShot(){
  var data = K.screenshot(C.shotQuality);
  if(!data) return Promise.resolve("📸 Δεν έγινε: αυτή τη στιγμή η οθόνη δεν δείχνει το dashboard (ανοιχτή άλλη εφαρμογή).");
  return fetch(data).then(function(r){ return r.blob(); }).then(function(blob){
    var f = new FormData();
    f.append("chat_id", TELEGRAM.chatId);
    f.append("caption", "📸 Το tablet στις " + hhmm());
    f.append("photo", blob, "tablet.jpg");
    return fetch(tgUrl("sendPhoto"), { method: "POST", body: f });
  }).then(function(r){ return r.json(); }).then(function(j){
    return j.ok ? "" : "📸 Η αποστολή απέτυχε: " + (j.description || "άγνωστο σφάλμα");
  }).catch(function(e){ return "📸 Η αποστολή απέτυχε: " + e.message; });
}

var prevCmd = window.tgCommand;
window.tgCommand = function(c){
  if(/^(screenshot|screen|οθόνη|οθονη|στιγμιότυπο|στιγμιοτυπο)$/.test(c)) return sendShot();
  if(/^(υγεία|υγεια|health|tablet)$/.test(c)) return "📱 Tablet\n" + healthText(true);
  return prevCmd ? prevCmd(c) : null;
};
})();
