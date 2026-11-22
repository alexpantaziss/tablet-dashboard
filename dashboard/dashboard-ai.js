/* dashboard-ai.js: συνομιλία με το Gemini (Google) μέσα από το Telegram.

   Ό,τι γράψεις στο bot και δεν είναι εντολή πάει στο Gemini, μαζί με:
   - την ώρα και τη μέρα,
   - τον καιρό (τώρα, σήμερα, αύριο, τις επόμενες ώρες),
   - το κείμενο που δείχνει το dashboard (λεωφορεία, ημερολόγιο, ειδήσεις, διαδρομή κ.λπ.),
   - την κατάσταση του tablet.
   Το Gemini μπορεί να τρέξει και τις εντολές του dashboard (π.χ. "στείλε μου φωτογραφία του δωματίου").
   Δεν μπορεί να τρέξει ενημέρωση, επαναφορά ή αναβάθμιση.

   Κλειδί: SECRETS.GEMINI_KEY στο dashboard-secrets.js (aistudio.google.com/apikey). Χωρίς κλειδί, το αρχείο δεν κάνει τίποτα.
   Ρυθμίσεις: CONFIG.AI στο dashboard.html.

   Προσοχή: στο δωρεάν πακέτο η Google μπορεί να χρησιμοποιεί τα μηνύματα για να βελτιώνει τα μοντέλα της.
   Τα κλειδιά και τα tokens του dashboard δεν στέλνονται ποτέ. */
(function(){
"use strict";
var KEY = (window.SECRETS && SECRETS.GEMINI_KEY) || "";
var A = (window.CONFIG && CONFIG.AI) || {};
if(!KEY || window.DEMO || A.enabled === false) return;

var API = "https://generativelanguage.googleapis.com/v1beta/";
var hist = [], lastAt = 0;

// Οι εντολές που επιτρέπεται να τρέξει το AI (ονόματα που ήδη καταλαβαίνει το dashboard)
var CMDS = {
  screenshot: "φωτογραφία της οθόνης του tablet",
  camera: "φωτογραφία του δωματίου από την κάμερα του tablet",
  video: "βίντεο 10 δευτερολέπτων του δωματίου",
  status: "κατάσταση του dashboard",
  health: "μπαταρία, θερμοκρασία, μνήμη, Wi-Fi του tablet",
  refresh: "ξαναφόρτωμα του dashboard",
  water: "αν χρειάζεται πότισμα",
  run: "αν ο καιρός είναι καλός για τρέξιμο",
  quakes: "πρόσφατοι σεισμοί",
  planes: "αεροπλάνα που περνούν από πάνω"
};

function post(url, body){
  return fetchT(API + url, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
    body: JSON.stringify(body) }, A.timeoutMs || 20000).then(function(r){
    return r.json().then(function(j){ if(!r.ok){ var e = new Error((j.error && j.error.message) || ("HTTP " + r.status)); e.status = r.status; throw e; } return j; });
  });
}

/* ---- Μοντέλα: τα 3 νεότερα "flash" που δίνει η Google (η λίστα ελέγχεται μία φορά τη μέρα), και ένα "flash-lite" για εφεδρεία.
   Αν το πρώτο έχει πολύ κίνηση ή τελείωσε το όριό του, δοκιμάζει το επόμενο. CONFIG.AI.model μπαίνει πρώτο. ---- */
var FALLBACK = ["gemini-flash-latest", "gemini-flash-lite-latest"];
function models(){
  var pre = A.model ? [A.model] : [];
  try{ var c = JSON.parse(localStorage.getItem("hcc_ai_models") || "null"); if(c && Date.now() - c.t < 86400000) return Promise.resolve(pre.concat(c.m)); }catch(e){}
  return fetchT(API + "models?pageSize=200", { headers: { "x-goog-api-key": KEY } }, 20000).then(function(r){ return r.json(); }).then(function(j){
    var flash = [], lite = [];
    (j.models || []).forEach(function(m){
      if((m.supportedGenerationMethods || []).indexOf("generateContent") < 0) return;
      var x = /^models\/(gemini-(\d+(?:\.\d+)?)-flash(-lite)?)$/.exec(m.name || ""); if(!x) return;
      (x[3] ? lite : flash).push({ n: x[1], v: +x[2] });
    });
    function top(a, k){ return a.sort(function(p, q){ return q.v - p.v; }).slice(0, k).map(function(o){ return o.n; }); }
    var list = top(flash, 3).concat(top(lite, 1));
    if(!list.length) list = FALLBACK;
    try{ localStorage.setItem("hcc_ai_models", JSON.stringify({ m: list, t: Date.now() })); }catch(e){}
    return pre.concat(list);
  }).catch(function(){ return pre.concat(FALLBACK); });
}

/* ---- Σειρά δοκιμής: πρώτα αυτό που απάντησε την τελευταία φορά. Όποιο απέτυχε, παραλείπεται για 30 λεπτά. ---- */
function getJ(k){ try{ return JSON.parse(localStorage.getItem(k) || "null"); }catch(e){ return null; } }
function setJ(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
function good(m){ setJ("hcc_ai_good", m); var b = getJ("hcc_ai_bad") || {}; if(b[m]){ delete b[m]; setJ("hcc_ai_bad", b); } }
function bad(m){ var b = getJ("hcc_ai_bad") || {}; b[m] = Date.now() + 30 * 60000; setJ("hcc_ai_bad", b); }
function order(list){
  var b = getJ("hcc_ai_bad") || {}, g = getJ("hcc_ai_good"), now = Date.now();
  var ok = list.filter(function(m){ return !(b[m] > now); });
  if(!ok.length) ok = list.slice();                       // όλα "κακά": ξαναδοκιμάζει όλα
  if(g && ok.indexOf(g) > 0){ ok.splice(ok.indexOf(g), 1); ok.unshift(g); }
  return ok;
}

/* ---- Τι ξέρει το dashboard αυτή τη στιγμή ---- */
var WD = ["Κυριακή", "Δευτέρα", "Τρίτη", "Τετάρτη", "Πέμπτη", "Παρασκευή", "Σάββατο"];
function two(n){ return ("0" + n).slice(-2); }
function weatherText(){
  var w = (load("weather") || {}).v; if(!w || !w.current) return "Καιρός: δεν υπάρχουν δεδομένα.";
  var c = w.current, out = ["Καιρός τώρα: " + Math.round(c.temperature_2m) + "°C (αίσθηση " + Math.round(c.apparent_temperature) + "°), υγρασία " +
    c.relative_humidity_2m + "%, άνεμος " + Math.round(c.wind_speed_10m) + " km/h, βροχή " + (c.precipitation || 0) + " mm, κωδικός WMO " + c.weather_code + "."];
  var d = w.daily;
  if(d) for(var i = 0; i < Math.min(3, d.time.length); i++)
    out.push((i === 0 ? "Σήμερα" : i === 1 ? "Αύριο" : d.time[i]) + ": " + Math.round(d.temperature_2m_min[i]) + "° έως " + Math.round(d.temperature_2m_max[i]) +
      "°, πιθανότητα βροχής " + d.precipitation_probability_max[i] + "%, κωδικός " + d.weather_code[i] + ", ανατολή " + String(d.sunrise[i]).slice(11) + ", δύση " + String(d.sunset[i]).slice(11) + ".");
  var H = w.hourly, now = Date.now(), hrs = [];
  if(H) for(var k = 0; k < H.time.length && hrs.length < 12; k++){
    var t = new Date(H.time[k]).getTime(); if(t + 3600000 <= now) continue;
    hrs.push(String(H.time[k]).slice(11, 13) + ":00 " + Math.round(H.temperature_2m[k]) + "° βροχή " + H.precipitation_probability[k] + "%");
  }
  if(hrs.length) out.push("Επόμενες ώρες: " + hrs.join("; ") + ".");
  return out.join("\n");
}
function screenText(){
  var app = document.getElementById("app"); if(!app) return "";
  var t = (app.textContent || "").replace(/\s+/g, " ").trim();
  return t.slice(0, A.screenChars || 6000);
}
function statusText(){
  var out = [];
  (window.statusLines || []).forEach(function(f){ try{ var t = f(); if(t) out.push(t); }catch(e){} });
  return out.join("\n");
}
function system(){
  var d = new Date();
  return [
    "Είσαι ο βοηθός του σπιτιού, μέσα σε ένα dashboard σε tablet στον τοίχο. Μιλάς με τον ιδιοκτήτη στο Telegram.",
    "Απάντα στα ελληνικά, σύντομα και φιλικά (συνήθως 1 έως 4 προτάσεις), σε απλό κείμενο χωρίς markdown, αστεράκια ή πίνακες. Emoji λίγα.",
    "Για καιρό, λεωφορεία, ημερολόγιο, διαδρομή, ειδήσεις και το tablet, βασίσου ΜΟΝΟ στα δεδομένα παρακάτω. Αν κάτι δεν υπάρχει εκεί, πες το, μην το μαντεύεις.",
    "Αν σου ζητήσει κάτι που κάνει μια εντολή (φωτογραφία, βίντεο, screenshot, κατάσταση κ.λπ.), κάλεσε το run_command. Η εντολή στέλνει μόνη της το αποτέλεσμα, εσύ γράψε μόνο μια πολύ σύντομη φράση.",
    "Ώρα τώρα: " + WD[d.getDay()] + " " + d.getDate() + "/" + (d.getMonth() + 1) + "/" + d.getFullYear() + " " + two(d.getHours()) + ":" + two(d.getMinutes()) + " (Ελλάδα).",
    "",
    weatherText(),
    "",
    "Κατάσταση:\n" + statusText(),
    "",
    "Κείμενο που δείχνει τώρα το dashboard (όλες οι οθόνες, χωρίς μορφοποίηση):\n" + screenText()
  ].join("\n");
}

var TOOLS = [{ functionDeclarations: [{
  name: "run_command",
  description: "Τρέχει μια εντολή του dashboard. Το αποτέλεσμα (κείμενο, φωτογραφία ή βίντεο) το στέλνει η ίδια στο Telegram. " +
    Object.keys(CMDS).map(function(k){ return k + ": " + CMDS[k]; }).join("; "),
  parameters: { type: "OBJECT", properties: { command: { type: "STRING", enum: Object.keys(CMDS) } }, required: ["command"] }
}]}];

/* ---- Μία ερώτηση: επιστρέφει Promise με το κείμενο της απάντησης ---- */
window.aiChat = function(text){
  if(/^(ξέχνα|ξεχνα|νέα συζήτηση|νεα συζητηση|reset)$/i.test(text.trim())){ hist = []; return Promise.resolve("🧹 Ξεκινάμε από την αρχή."); }
  // η συζήτηση "θυμάται" τα τελευταία μηνύματα, για 30 λεπτά
  if(Date.now() - lastAt > (A.memoryMin || 30) * 60000) hist = [];
  lastAt = Date.now();
  var contents = hist.concat([{ role: "user", parts: [{ text: text }] }]);
  var sys = system();
  function ask(list, i){
    var m = list[i];
    return post("models/" + m + ":generateContent", {
      systemInstruction: { parts: [{ text: sys }] },
      contents: contents,
      tools: TOOLS
    }).then(function(j){ good(m); return j; }, function(e){
      // κίνηση (503), όριο (429), αποσύρθηκε (404), σφάλμα της Google (500), ή δεν απάντησε (χωρίς status): το επόμενο μοντέλο
      if((!e.status || /^(404|429|500|503)$/.test(String(e.status))) && i + 1 < list.length){
        if(e.status === 404) try{ localStorage.removeItem("hcc_ai_models"); }catch(x){}
        bad(m);
        return ask(list, i + 1);
      }
      throw e;
    });
  }
  return models().then(function(list){ return ask(order(list), 0); }).then(function(j){
    var parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
    var say = parts.filter(function(p){ return p.text && !p.thought; }).map(function(p){ return p.text; }).join("").trim();
    var call = parts.filter(function(p){ return p.functionCall; })[0];
    var cmd = call && call.functionCall.args && call.functionCall.args.command;
    if(cmd && !CMDS[cmd]) cmd = null;
    hist.push({ role: "user", parts: [{ text: text }] });
    hist.push({ role: "model", parts: [{ text: (say || "") + (cmd ? " [έτρεξα την εντολή " + cmd + "]" : "") || "..." }] });
    if(hist.length > (A.historyMax || 12)) hist = hist.slice(-(A.historyMax || 12));
    if(cmd) setTimeout(function(){ window.tgRun && window.tgRun(cmd); }, 300);
    if(!say && !cmd) return "🤔 Δεν πήρα απάντηση από το Gemini" + (j.promptFeedback && j.promptFeedback.blockReason ? " (μπλοκαρίστηκε: " + j.promptFeedback.blockReason + ")" : "") + ".";
    return say || (cmd ? "👌" : "");
  }).catch(function(e){
    if(e.status === 503) return "⏳ Το Gemini έχει πολλή κίνηση αυτή τη στιγμή. Ξαναδοκίμασε σε λίγο.";
    if(e.status === 429) return "⏳ Το δωρεάν όριο του Gemini για τώρα εξαντλήθηκε. Ξαναδοκίμασε σε λίγο.";
    if(e.status === 400 && /key/i.test(e.message)) return "🔑 Το κλειδί του Gemini δεν δουλεύει (dashboard-secrets.js).";
    if(e.status === 403) return "🔑 Το Gemini αρνήθηκε το κλειδί: " + e.message;
    return "⚠️ Το Gemini δεν απάντησε: " + (e.message || "σφάλμα δικτύου");
  });
};
window.statusLines = window.statusLines || [];
})();
