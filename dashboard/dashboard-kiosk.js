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
// Παλιότερη έκδοση της εφαρμογής μπορεί να μην έχει όλες τις μεθόδους: has("όνομα") πριν τις καλέσουμε.
function has(name){ return typeof K[name] === "function"; }
var HAS_TG = typeof TELEGRAM !== "undefined" && TELEGRAM.botToken && TELEGRAM.chatId;

function tgUrl(method){ return "https://api.telegram.org/bot" + TELEGRAM.botToken + "/" + method; }
// Τη νύχτα (νυχτερινή οθόνη) τα μηνύματα έρχονται χωρίς ήχο ειδοποίησης στο κινητό.
function quiet(){ return C.quietAtNight && document.body.className.indexOf("night") >= 0; }
// Επιστρέφει true αν στάλθηκε (για να σβήνονται τα συμβάντα μόνο τότε).
function tgText(text){
  if(!HAS_TG) return Promise.resolve(false);
  return fetch(tgUrl("sendMessage") + "?chat_id=" + encodeURIComponent(TELEGRAM.chatId) + "&text=" + encodeURIComponent(text) +
               (quiet() ? "&disable_notification=true" : ""))
    .then(function(r){ return r.ok; }).catch(function(){ return false; });
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

/* ---- 5. Φωτογραφία και βίντεο δωματίου ---------------------------- */
// Η εφαρμογή τραβάει (με κόκκινη ένδειξη "● Κάμερα" στην οθόνη), η σελίδα το στέλνει, και μετά σβήνεται.
function sendCapture(kind){
  var video = kind === "video";
  if(video) tgText("🎥 Γράφω βίντεο " + C.videoSec + " δευτερολέπτων...");
  return new Promise(function(done){
    window.kioskOnCapture = function(json){
      var r = JSON.parse(json);
      if(!r.ok){ done("📷 Δεν έγινε: " + r.error); return; }
      var data = K.readCapture(kind);
      K.deleteCapture(kind);
      fetch(data).then(function(x){ return x.blob(); }).then(function(blob){
        var f = new FormData();
        f.append("chat_id", TELEGRAM.chatId);
        f.append("caption", (video ? "🎥 " : "📷 ") + "Το δωμάτιο στις " + hhmm());
        if(video) f.append("supports_streaming", "true");
        f.append(video ? "video" : "photo", blob, video ? "room.mp4" : "room.jpg");
        return fetch(tgUrl(video ? "sendVideo" : "sendPhoto"), { method: "POST", body: f });
      }).then(function(x){ return x.json(); }).then(function(j){
        done(j.ok ? "" : "📷 Η αποστολή απέτυχε: " + (j.description || ""));
      }).catch(function(e){ done("📷 Η αποστολή απέτυχε: " + e.message); });
    };
    var err = K.capture(kind, C.videoSec, C.cameraFacing);
    if(err) done("📷 Δεν έγινε: " + err);
  });
}

/* ---- 6. Ενημέρωση από απόσταση ------------------------------------ */
// Η εφαρμογή συγκρίνει τα αρχεία με το GitHub και κατεβάζει όσα άλλαξαν (ποτέ config/secrets).
// Μετά ξαναφορτώνει. Αν η νέα σελίδα δεν πει "φόρτωσα" (pageOk) σε 2,5 λεπτά, επιστρέφει μόνη της στην παλιά.
var U = CONFIG.UPDATE || {};
function runUpdate(){
  if(!U.repo) return Promise.resolve("⬇️ Δεν έχει οριστεί UPDATE_REPO στο dashboard-config.js");
  return new Promise(function(done){
    window.kioskOnUpdate = function(json){
      var r = JSON.parse(json);
      if(!r.ok){ done("⚠️ Η ενημέρωση απέτυχε: " + r.error + ". Τίποτα δεν άλλαξε."); return; }
      if(!r.changed.length){ done("✅ Όλα είναι ήδη ενημερωμένα" + (r.commit ? "\nΈκδοση: " + r.commit : "")); return; }
      tgText("⬇️ Ενημερώθηκαν: " + r.changed.join(", ") + (r.commit ? "\nΈκδοση: " + r.commit : "") +
             "\nΞαναφορτώνει. Αν κάτι πάει στραβά, γυρίζει μόνο του στην προηγούμενη έκδοση.")
        .then(function(){ K.reloadAfterUpdate(); });
      done("");
    };
    var err = K.update(U.repo, U.branch || "main", U.path || "dashboard");
    if(err) done("⚠️ Η ενημέρωση δεν ξεκίνησε: " + err);
  });
}
function runRollback(){
  var list = JSON.parse(K.rollback() || "[]");
  return list.length ? "↩️ Επαναφορά της προηγούμενης έκδοσης: " + list.join(", ") + ". Ξαναφορτώνει."
                     : "↩️ Δεν υπάρχει προηγούμενη έκδοση για επαναφορά.";
}

/* ---- 7. Αναφορά σφαλμάτων ----------------------------------------- */
// Κάθε λεπτό: συμβάντα της εφαρμογής (κρασαρίσματα, Wi-Fi, επανεκκίνηση, ενημερώσεις) και σφάλματα
// JavaScript της σελίδας, σε ΕΝΑ μήνυμα. Τα συμβάντα σβήνονται μόνο αφού σταλούν.
// Το ίδιο σφάλμα JavaScript αναφέρεται το πολύ μία φορά στις 6 ώρες.
function fmtTime(t){ var d = new Date(t); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }
var errSeen = {}; try{ errSeen = JSON.parse(localStorage.getItem("hcc_kiosk_errs") || "{}"); }catch(e){}
function freshErrors(){
  var now = Date.now(), out = [];
  (window.__errs || []).splice(0).forEach(function(e){
    if(errSeen[e.m] && now - errSeen[e.m] < 6 * 3600000) return;
    errSeen[e.m] = now; out.push(e);
  });
  Object.keys(errSeen).forEach(function(k){ if(now - errSeen[k] > 24 * 3600000) delete errSeen[k]; });
  localStorage.setItem("hcc_kiosk_errs", JSON.stringify(errSeen));
  return out.slice(0, 5);
}
var pumping = false;
function pumpReports(){
  if(!C.reportErrors || !HAS_TG || pumping || !has("peekEvents")) return;
  var events = []; try{ events = JSON.parse(K.peekEvents()); }catch(e){}
  var errs = freshErrors();
  if(!events.length && !errs.length) return;
  var lines = events.map(function(e){ return fmtTime(e.t) + " " + e.text; })
    .concat(errs.map(function(e){ return fmtTime(e.t) + " 🐞 Σφάλμα στη σελίδα: " + e.m; }));
  pumping = true;
  tgText("🛠️ Αναφορά tablet\n" + lines.join("\n")).then(function(ok){
    if(ok) K.ackEvents(events.length);
    else errs.forEach(function(e){ delete errSeen[e.m]; (window.__errs = window.__errs || []).push(e); });
    pumping = false;
  });
}
setTimeout(pumpReports, 20000);
setInterval(pumpReports, 60000);

// Πηγές που δεν απαντούν για ώρα (κάρτα Σύστημα): μία ειδοποίηση όταν "πέσουν" και μία όταν επανέλθουν.
var downSince = {}, downReported = {};
function checkSources(){
  if(!C.reportErrors || typeof STATUS === "undefined") return;
  var now = Date.now();
  Object.keys(STATUS).forEach(function(k){
    if(k === "Θερμοκρασία μπαταρίας") return;    // έχει δική της ειδοποίηση
    var s = STATUS[k];
    if(!s.ok){
      if(!downSince[k]) downSince[k] = now;
      var min = Math.round((now - downSince[k]) / 60000);
      if(!downReported[k] && min >= C.reportDownMin){
        downReported[k] = true;
        tgText("⚠️ Η πηγή «" + k + "» δεν απαντά εδώ και " + min + " λεπτά" + (s.note ? " (" + s.note + ")" : "") + ". Το dashboard δείχνει τα τελευταία δεδομένα.");
      }
    } else {
      if(downReported[k]) tgText("✅ Η πηγή «" + k + "» απαντά ξανά.");
      delete downSince[k]; delete downReported[k];
    }
  });
}
setInterval(checkSources, 5 * 60000);

/* ---- 8. Εκκίνηση ---------------------------------------------------- */
if(has("setWifiGuard")) K.setWifiGuard(C.wifiRestartMin);
// "Φόρτωσα κανονικά": μετά από ενημέρωση, χωρίς αυτό η εφαρμογή επιστρέφει στην προηγούμενη έκδοση.
if(has("pageOk")) setTimeout(function(){ K.pageOk(); }, 10000);

var prevCmd = window.tgCommand;
window.tgCommand = function(c){
  if(/^(screenshot|screen|οθόνη|οθονη|στιγμιότυπο|στιγμιοτυπο)$/.test(c)) return sendShot();
  if(/^(υγεία|υγεια|health|tablet)$/.test(c)) return "📱 Tablet\n" + healthText(true);
  if(!has("capture") && /^(κάμερα|καμερα|φωτογραφία|φωτογραφια|camera|photo|βίντεο|βιντεο|video|update|ενημέρωση|ενημερωση|rollback|επαναφορά|επαναφορα)$/.test(c))
    return "Χρειάζεται νεότερη έκδοση της εφαρμογής Οθόνη σπιτιού (1.2).";
  if(/^(κάμερα|καμερα|φωτογραφία|φωτογραφια|camera|photo)$/.test(c)) return sendCapture("photo");
  if(/^(βίντεο|βιντεο|video)$/.test(c)) return sendCapture("video");
  if(/^(update|ενημέρωση|ενημερωση)$/.test(c)) return runUpdate();
  if(/^(rollback|επαναφορά|επαναφορα)$/.test(c)) return runRollback();
  return prevCmd ? prevCmd(c) : null;
};
})();
