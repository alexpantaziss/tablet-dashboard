/* dashboard-timer.js: χρονόμετρο με δύο καρτέλες.
   - Κουμπί πάνω δεξιά στην μπάρα. Ανοίγει παράθυρο με:
     α) Αντίστροφη μέτρηση: έτοιμοι χρόνοι (ένα πάτημα = ξεκινά), -1 / +1 λεπτό, Έναρξη/Παύση, Μηδενισμός.
        Στο τέλος: ήχος (Web Audio, χωρίς αρχείο) για CONFIG.TIMER.ringSec δευτερόλεπτα ή μέχρι να αγγίξεις
        την οθόνη, και η οθόνη αναβοσβήνει απαλά (με «Μείωση κίνησης»: σταθερό χρώμα, χωρίς αναβόσβημα).
     β) Χρονόμετρο: Έναρξη/Παύση, Γύρος, Μηδενισμός.
   - Όσο τρέχει, ο χρόνος φαίνεται στην μπάρα, στη λωρίδα της κορνίζας και στη νυχτερινή οθόνη.
     Η επιστροφή στην κορνίζα δεν τον σταματά.
   - Αντέχει ανανέωση της σελίδας: ώρα λήξης / ώρα έναρξης στο localStorage.
   - Telegram: "timer 10" = αντίστροφη μέτρηση 10 λεπτών, "timer stop" = σταματά, "timer" = τι τρέχει.
     Όταν λήξει ένα χρονόμετρο από το Telegram, στέλνει «⏱ Τέλος».
   Ρυθμίσεις: CONFIG.TIMER στο dashboard.html. Δοκιμή: ?demo=1&timer=run (&timer=ring τέλος, &timer=open / &timer=sw ανοιχτό παράθυρο) */
(function(){
"use strict";
var T = (window.CONFIG && CONFIG.TIMER) || {};
var PRESETS = T.presets || [1, 3, 5, 10, 15, 30];
var KEY = "hcc_timer", KEY_SW = "hcc_stopwatch";

var css =
  /* κουμπί στην μπάρα */
  ".tm-ico{width:1.5rem;height:1.5rem;flex:0 0 auto}" +
  "#tm-pill .tm-t{font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap}" +
  "#tm-pill.idle{padding:0;width:3rem;justify-content:center} #tm-pill.idle .tm-t{display:none}" +
  "#tm-pill:not(.idle) .tm-ico{display:none}" +
  "#tm-pill.run{background:var(--tint);color:var(--tint-text);border-color:transparent}" +
  "#tm-pill.ring{background:var(--bad);color:#fff;border-color:transparent}" +
  /* νυχτερινή οθόνη */
  "#nv-tm{font-size:3rem;font-weight:500;margin-top:1.25rem;color:#9aa3ae;font-variant-numeric:tabular-nums}" +
  "#nv-tm:empty{display:none}" +
  /* παράθυρο: συμπαγές φόντο, χωρίς blur */
  "#tm{position:fixed;top:0;right:0;bottom:0;left:0;z-index:20;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.6)}" +
  "#tm.open{display:flex}" +
  "#tm-card{width:52rem;max-width:94vw;background:var(--bg);border-radius:var(--r);padding:1.25rem 1.75rem 1.75rem;color:var(--text)}" +
  "html:not(.light):not(.dark) #tm-card{background:#151a23}" +
  "#tm-head{display:flex;align-items:center;gap:1rem}" +
  /* segmented control: δύο ίσα κομμάτια, το επιλεγμένο σε επιφάνεια κάρτας */
  "#tm-seg{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:.25rem;padding:.25rem;border-radius:var(--r-sm);background:var(--surface-2)}" +
  "html:not(.light):not(.dark) #tm-seg{background:rgba(255,255,255,.08)}" +
  ".tm-tab{min-height:3.25rem;border:0;border-radius:.625rem;background:transparent;color:var(--text-2);font:inherit;font-size:1.25rem;font-weight:600}" +
  ".tm-tab[aria-selected=true]{background:var(--surface);color:var(--text)}" +
  "html:not(.light):not(.dark) .tm-tab[aria-selected=true]{background:rgba(255,255,255,.16)}" +
  "#tm-x{width:3.5rem;height:3.5rem;border-radius:50%;border:0;background:var(--surface-2);color:var(--text);font-size:1.5rem;font-family:inherit;flex:0 0 auto}" +
  /* μεγάλα ψηφία: ~150 px ύψος, διαβάζονται από 3 μέτρα */
  ".tm-big{font-size:10rem;font-weight:500;letter-spacing:-.04em;line-height:1.1;text-align:center;font-variant-numeric:tabular-nums;margin:.75rem 0 .25rem}" +
  ".tm-big small{font-size:5rem;letter-spacing:-.02em;color:var(--text-2)}" +
  ".tm-msg{text-align:center;font-size:1.375rem;color:var(--text-2);min-height:1.75rem;margin-bottom:1rem}" +
  "#tm.ringing #tm-big{color:var(--bad);font-size:8.5rem;padding-bottom:1.25rem} #tm.ringing #tm-msg{color:var(--bad);font-weight:600}" +
  ".tm-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:.625rem;margin-bottom:.625rem}" +
  ".tm-b{min-height:4.25rem;border-radius:var(--r-sm);border:0;background:var(--surface-2);color:var(--text);font-size:1.375rem;font-weight:600;font-family:inherit;font-variant-numeric:tabular-nums}" +
  "html.light .tm-b{background:var(--surface)}" +
  ".tm-b:active{background:var(--surface-press)}" +
  ".tm-b:disabled{opacity:.35}" +
  "#tm-adj{grid-template-columns:1fr 1fr}" +
  ".tm-act{display:grid;grid-template-columns:1fr 1fr;gap:.625rem;margin-top:.875rem}" +
  ".tm-go{background:var(--accent) !important;color:var(--on-accent) !important}" +
  ".tm-go.pause{background:var(--tint) !important;color:var(--tint-text) !important}" +
  "#tm-laps{margin-top:.75rem;max-height:11rem;overflow:hidden;font-size:1.25rem;font-variant-numeric:tabular-nums}" +
  ".tm-lap{display:flex;justify-content:space-between;padding:.4375rem .25rem;border-top:1px solid var(--hairline);color:var(--text-2)}" +
  ".tm-lap b{color:var(--text);font-weight:600}" +
  ".tm-pane[hidden]{display:none}" +
  /* αναβόσβημα στο τέλος: ένα στρώμα πάνω από όλα, αργή αλλαγή διαφάνειας (μόνο opacity, φθηνό για την GPU) */
  "#tm-flash{position:fixed;top:0;right:0;bottom:0;left:0;z-index:30;background:#ff3b30;opacity:0;pointer-events:none;display:none}" +
  "#tm-flash.on{display:block;animation:tmflash 1.6s ease-in-out infinite alternate}" +
  "@keyframes tmflash{from{opacity:0}to{opacity:.32}}" +
  "@media (prefers-reduced-motion:reduce){#tm-flash.on{animation:none;opacity:.2}}";
var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
function $(id){ return document.getElementById(id); }

// Κουμπί στην πάνω μπάρα, αμέσως μετά την κουκκίδα σύνδεσης. Εικονίδιο χρονομέτρου (σχέδιο, με το χρώμα του κειμένου).
var pill = document.createElement("button");
pill.type = "button"; pill.className = "pill idle"; pill.id = "tm-pill"; pill.setAttribute("aria-label", "Χρονόμετρο");
pill.innerHTML = '<svg class="tm-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13.5" r="8" fill="none" stroke="currentColor" stroke-width="2"/>' +
  '<path d="M12 9v4.5l3 2M9.5 2.5h5M12 2.5v3M18.5 6l1.5-1.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
  '<span class="tm-t"></span>';
var net = $("net-pill");
if(net && net.parentNode) net.parentNode.insertBefore(pill, net.nextSibling);

var flash = document.createElement("div"); flash.id = "tm-flash"; document.body.appendChild(flash);

var box = document.createElement("div"); box.id = "tm"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Χρονόμετρο");
box.innerHTML =
  '<div id="tm-card">' +
    '<div id="tm-head"><div id="tm-seg" role="tablist">' +
      '<button class="tm-tab" type="button" role="tab" data-tab="cd" aria-selected="true">Αντίστροφη μέτρηση</button>' +
      '<button class="tm-tab" type="button" role="tab" data-tab="sw" aria-selected="false">Χρονόμετρο</button></div>' +
      '<button id="tm-x" type="button" aria-label="Κλείσιμο">✕</button></div>' +
    '<div class="tm-pane" id="tm-cd">' +
      '<div class="tm-big" id="tm-big">0:00</div><div class="tm-msg" id="tm-msg"></div>' +
      '<div class="tm-grid" id="tm-pre">' + PRESETS.map(function(m){ return '<button class="tm-b" type="button" data-m="' + m + '">' + m + ' λεπ.</button>'; }).join("") + '</div>' +
      '<div class="tm-grid" id="tm-adj"><button class="tm-b" type="button" data-d="-60">−1 λεπτό</button><button class="tm-b" type="button" data-d="60">+1 λεπτό</button></div>' +
      '<div class="tm-act"><button class="tm-b" type="button" id="tm-reset">Μηδενισμός</button><button class="tm-b tm-go" type="button" id="tm-go">Έναρξη</button></div>' +
    '</div>' +
    '<div class="tm-pane" id="tm-sw" hidden>' +
      '<div class="tm-big" id="sw-big">0:00<small>,0</small></div><div class="tm-msg" id="sw-msg"></div>' +
      '<div class="tm-act"><button class="tm-b" type="button" id="sw-lap">Γύρος</button><button class="tm-b tm-go" type="button" id="sw-go">Έναρξη</button></div>' +
      '<div class="tm-act" style="grid-template-columns:1fr;margin-top:.625rem"><button class="tm-b" type="button" id="sw-reset">Μηδενισμός</button></div>' +
      '<div id="tm-laps"></div>' +
    '</div>' +
  '</div>';
document.body.appendChild(box);

/* ---- Κατάσταση ----
   Αντίστροφη: set = χρόνος που διάλεξες (sec), end = πότε λήγει (ms) όσο μετράει, left = ό,τι έμεινε σε παύση, src = "tg" αν ήρθε από το Telegram
   Χρονόμετρο: start = πότε ξεκίνησε το τρέχον κομμάτι (ms), acc = ό,τι μετρήθηκε πριν (ms), laps = σύνολα σε ms */
var S = { set: 0, end: 0, left: 0, src: "", ringing: false, ringStart: 0 };
var W = { start: 0, acc: 0, laps: [] };
try{ var o = JSON.parse(localStorage.getItem(KEY) || "null"); if(o){ S.set = o.set || 0; S.end = o.end || 0; S.left = o.left || 0; S.src = o.src || ""; } }catch(e){}
try{ var w = JSON.parse(localStorage.getItem(KEY_SW) || "null"); if(w){ W.start = w.start || 0; W.acc = w.acc || 0; W.laps = w.laps || []; } }catch(e){}
function save(){ try{ localStorage.setItem(KEY, JSON.stringify({ set: S.set, end: S.end, left: S.left, src: S.src })); }catch(e){} }
function saveW(){ try{ localStorage.setItem(KEY_SW, JSON.stringify(W)); }catch(e){} }

function remain(){ return S.end ? Math.max(0, Math.ceil((S.end - Date.now()) / 1000)) : S.left; }
function elapsed(){ return W.acc + (W.start ? Date.now() - W.start : 0); }
function fmt(s){
  var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return (h ? h + ":" + ("0" + m).slice(-2) : m) + ":" + ("0" + x).slice(-2);
}
function fmtMs(ms, html){
  var t = Math.floor(ms / 100), s = Math.floor(t / 10), d = t % 10;
  return fmt(s) + (html ? "<small>," + d + "</small>" : "," + d);
}
// "10 λεπτά", "1 λεπτό", ή 1:30 αν δεν είναι ακέραια λεπτά
function label(s){ return s % 60 ? fmt(s) : s === 60 ? "1 λεπτό" : (s / 60) + " λεπτά"; }
function cdShown(){ return S.ringing || !!S.end || S.left > 0; }
function swShown(){ return !!W.start || W.acc > 0; }

// Κείμενο για μπάρα, κορνίζα και νύχτα: ⏳ αντίστροφη, ⏱ χρονόμετρο
function indicator(){
  var parts = [];
  if(S.ringing) parts.push("⏳ Τέλος");
  else if(S.end) parts.push("⏳ " + fmt(remain()));
  else if(S.left) parts.push("⏸ " + fmt(S.left));
  if(swShown()) parts.push((W.start ? "⏱ " : "⏸ ") + fmt(Math.floor(elapsed() / 1000)));
  return parts.join("  ·  ");
}
window.timerNow = indicator;

var tab = "cd";
function setTab(t){
  tab = t;
  [].forEach.call(box.querySelectorAll(".tm-tab"), function(b){ b.setAttribute("aria-selected", b.getAttribute("data-tab") === t ? "true" : "false"); });
  $("tm-cd").hidden = t !== "cd"; $("tm-sw").hidden = t !== "sw";
  draw();
}

function draw(){
  var r = remain(), running = !!S.end, paused = !S.end && S.left > 0;
  // αντίστροφη
  $("tm-big").textContent = S.ringing ? "Τέλος" : fmt(running || paused ? r : S.set);
  $("tm-msg").textContent = S.ringing ? "Τελείωσαν τα " + label(S.set) + ". Άγγιξε την οθόνη για να σταματήσει." :
    paused ? "Σε παύση" : running ? "Λήξη στις " + hm(new Date(S.end)) : (S.set ? "" : "Διάλεξε χρόνο");
  var go = $("tm-go");
  go.textContent = running ? "Παύση" : paused ? "Συνέχεια" : "Έναρξη";
  go.classList.toggle("pause", running);
  go.disabled = !running && !paused && !S.set;
  $("tm-reset").disabled = !running && !paused && !S.set && !S.ringing;
  box.classList.toggle("ringing", S.ringing);
  // χρονόμετρο
  var e = elapsed();
  if(tab === "sw" && box.classList.contains("open")){
    $("sw-big").innerHTML = fmtMs(e, true);
    $("sw-msg").textContent = W.start ? "" : e ? "Σε παύση" : "";
    var sg = $("sw-go"); sg.textContent = W.start ? "Παύση" : e ? "Συνέχεια" : "Έναρξη"; sg.classList.toggle("pause", !!W.start);
    $("sw-lap").disabled = !W.start;
    $("sw-reset").disabled = !e;
  }
  // ενδείξεις έξω από το παράθυρο
  var txt = indicator();
  pill.querySelector(".tm-t").textContent = txt;
  pill.classList.toggle("idle", !txt);
  pill.classList.toggle("run", !!txt && !S.ringing);
  pill.classList.toggle("ring", S.ringing);
  var nv = $("nv-tm"); if(nv) nv.textContent = txt;
  var ch = $("fr-tm");
  if(ch){
    ch.textContent = txt; ch.classList.toggle("ring", S.ringing);
    var chips = $("fr-chips");
    if(txt && chips) chips.className = "has";
    else if(!txt && ch.getAttribute("data-was") && window.frameRefresh) window.frameRefresh();   // ξαναϋπολογίζει αν μένει κάτι στη λωρίδα
    ch.setAttribute("data-was", txt ? "1" : "");
  }
}
function drawLaps(){
  var L = W.laps, h = "";
  for(var i = L.length - 1; i >= 0 && i >= L.length - 4; i--){
    var lap = L[i] - (i ? L[i - 1] : 0);
    h += '<div class="tm-lap"><span>Γύρος ' + (i + 1) + '</span><b>' + fmtMs(lap) + '</b><span>σύνολο ' + fmtMs(L[i]) + '</span></div>';
  }
  $("tm-laps").innerHTML = h;
}

/* ---- Ήχος: δύο σύντομα «μπιπ» κάθε δευτερόλεπτο με Web Audio. Το AudioContext ανοίγει μόνο όταν χρειάζεται. ---- */
var AC = null;
function audio(){
  if(!AC){ try{ AC = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){ return null; } }
  if(AC.state === "suspended") try{ AC.resume(); }catch(e){}
  return AC;
}
function beep(){
  var a = audio(); if(!a) return;
  [0, 0.18].forEach(function(dt){
    var o = a.createOscillator(), g = a.createGain(), t = a.currentTime + dt;
    o.type = "square"; o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(T.volume || 0.5, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.15);
  });
}
// για έλεγχο από το Telegram: έπαιξε ήχος;
window.timerAudioState = function(){ return AC ? AC.state : "κανένας ήχος ακόμα"; };

function tg(text){
  if(DEMO || !window.TELEGRAM || !TELEGRAM.botToken || !TELEGRAM.chatId) return;
  fetch("https://api.telegram.org/bot" + TELEGRAM.botToken + "/sendMessage?chat_id=" + encodeURIComponent(TELEGRAM.chatId) +
    "&text=" + encodeURIComponent(text)).catch(function(){});
}
var lastBeep = 0;
function ring(){
  var fromTg = S.src === "tg";
  S.ringing = true; S.ringStart = Date.now(); S.end = 0; S.left = 0; S.src = ""; save();
  setTab("cd"); box.classList.add("open");
  if(T.flash !== false) flash.classList.add("on");
  lastBeep = 0;
  // τη νύχτα η οθόνη είναι σκοτεινή: φωτεινότητα «ξύπνιου»
  if(window.kiosk && kiosk.setBrightness && window.CONFIG && CONFIG.KIOSK && document.body.className.indexOf("night") >= 0)
    try{ kiosk.setBrightness(CONFIG.KIOSK.brightnessAwake || 0.5); }catch(e){}
  if(fromTg || T.telegram){
    // λίγο μετά το πρώτο μπιπ: ξέρουμε αν ο ήχος παίζει χωρίς άγγιγμα στην οθόνη
    setTimeout(function(){
      var ok = AC && AC.state === "running";
      tg("⏱ Τέλος (" + label(S.set) + ")" + (ok ? "" : "\n🔇 Ο ήχος δεν έπαιξε στο tablet (κατάσταση: " + window.timerAudioState() + ")."));
    }, 2500);
  }
  draw();
}
function stopRing(){
  if(!S.ringing) return;
  S.ringing = false; flash.classList.remove("on");
  if(AC && AC.state === "running") setTimeout(function(){ try{ AC.suspend(); }catch(e){} }, 400);
  draw();
}

/* ---- Κάθε 200 ms: ενημέρωση, λήξη, ήχος ---- */
setInterval(function(){
  if(S.end && Date.now() >= S.end) ring();
  if(S.ringing){
    if(Date.now() - S.ringStart > (T.ringSec || 30) * 1000) stopRing();   // σταματά μόνο του
    else if(Date.now() - lastBeep >= 1000){ lastBeep = Date.now(); beep(); }
  }
  if(S.end || S.ringing || W.start || box.classList.contains("open")) draw();
}, 200);

// Όσο χτυπάει: οποιοδήποτε άγγιγμα σταματά ήχο και αναβόσβημα. Το ίδιο άγγιγμα δεν πατάει κάτι από κάτω.
var swallowUntil = 0;
function anyTouch(e){
  if(!S.ringing) return;
  stopRing(); swallowUntil = Date.now() + 700;
  e.stopPropagation(); if(e.cancelable) e.preventDefault();
}
document.addEventListener("touchstart", anyTouch, { capture: true, passive: false });
document.addEventListener("mousedown", anyTouch, true);
document.addEventListener("click", function(e){ if(Date.now() < swallowUntil){ e.stopPropagation(); e.preventDefault(); } }, true);

/* ---- Κουμπιά ---- */
function open(e){ if(e) e.stopPropagation(); box.classList.add("open"); setTab(!cdShown() && swShown() ? "sw" : tab); drawLaps(); }
function close(){ box.classList.remove("open"); }
pill.addEventListener("click", open);
$("tm-x").addEventListener("click", function(e){ e.stopPropagation(); close(); });
box.addEventListener("click", function(e){ e.stopPropagation(); if(e.target === box) close(); });
$("tm-seg").addEventListener("click", function(e){ var t = e.target.getAttribute("data-tab"); if(t) setTab(t); });

function startCd(sec, src){
  audio();   // το πάτημα «ξεκλειδώνει» τον ήχο για αργότερα
  if(AC && AC.state === "running") setTimeout(function(){ if(!S.ringing) try{ AC.suspend(); }catch(e){} }, 300);
  S.ringing = false; flash.classList.remove("on");
  S.set = sec; S.left = 0; S.end = Date.now() + sec * 1000; S.src = src || ""; save(); draw();
}
$("tm-pre").addEventListener("click", function(e){
  var m = e.target.getAttribute("data-m"); if(!m) return;
  startCd(+m * 60);   // ένα πάτημα = ξεκινά αμέσως
});
$("tm-adj").addEventListener("click", function(e){
  var d = +e.target.getAttribute("data-d"); if(!d) return;
  if(S.end){ S.end = Math.max(Date.now() + 1000, S.end + d * 1000); S.set = Math.max(S.set + d, Math.ceil((S.end - Date.now()) / 1000)); }
  else if(S.left){ S.left = Math.max(1, S.left + d); S.set = Math.max(S.set, S.left); }
  else { S.set = Math.max(0, S.set + d); }
  save(); draw();
});
$("tm-go").addEventListener("click", function(){
  if(S.end){ S.left = remain(); S.end = 0; }                         // παύση
  else if(S.left){ S.end = Date.now() + S.left * 1000; S.left = 0; } // συνέχεια
  else if(S.set){ startCd(S.set); return; }                         // έναρξη
  save(); draw();
});
$("tm-reset").addEventListener("click", function(){
  stopRing(); S.end = 0; S.left = 0; S.set = 0; S.src = ""; save(); draw();
});
$("sw-go").addEventListener("click", function(){
  if(W.start){ W.acc += Date.now() - W.start; W.start = 0; } else W.start = Date.now();
  saveW(); draw();
});
$("sw-lap").addEventListener("click", function(){
  if(!W.start) return;
  W.laps.push(elapsed()); if(W.laps.length > 50) W.laps.shift();
  saveW(); drawLaps();
});
$("sw-reset").addEventListener("click", function(){
  W.start = 0; W.acc = 0; W.laps = []; saveW(); drawLaps(); draw();
});

/* ---- Telegram: "timer 10", "timer 2,5", "timer stop", "timer" ---- */
var prevCmd = window.tgCommand;
window.tgCommand = function(c){
  var m = /^(timer|χρονόμετρο|χρονομετρο)\b\s*(.*)$/.exec(c || "");
  if(!m) return prevCmd ? prevCmd(c) : null;
  var arg = m[2].trim();
  if(/^(stop|στοπ|σταμάτα|σταματα|τέλος|τελος|0)$/.test(arg)){
    var had = S.end || S.left || S.ringing;
    stopRing(); S.end = 0; S.left = 0; S.set = 0; S.src = ""; save(); draw();
    return had ? "⏱ Η αντίστροφη μέτρηση σταμάτησε." : "⏱ Δεν έτρεχε αντίστροφη μέτρηση.";
  }
  var n = parseFloat(arg.replace(",", "."));
  if(arg && n > 0 && n <= 600){
    var sec = Math.round(n * 60);
    startCd(sec, "tg");
    return "⏱ Ξεκίνησε: " + label(sec) + ", τέλος στις " + hm(new Date(S.end)) + ". Θα σου γράψω όταν λήξει.";
  }
  if(arg) return "⏱ Γράψε π.χ. «timer 10» για 10 λεπτά ή «timer stop».";
  return indicator() ? "⏱ " + indicator().replace(/^⏳ /, "Αντίστροφη: ") : "⏱ Δεν τρέχει τίποτα. Γράψε π.χ. «timer 10».";
};

// Μετά από ανανέωση της σελίδας: αν έληξε πριν λίγο (έως 5 λεπτά), χτυπάει. Αλλιώς ξεχνιέται.
if(S.end && Date.now() >= S.end){ if(Date.now() - S.end < 5 * 60000) ring(); else { S.end = 0; S.src = ""; save(); } }
// δοκιμή: ?demo=1&timer=run (αντίστροφη 7:42 και χρονόμετρο 3:15 που τρέχουν), &timer=ring (τέλος)
if(DEMO){
  var dq = /[?&]timer=(run|ring|open|sw)/.exec(location.search);
  if(dq){
    S.set = 600; S.end = Date.now() + 462000; W.start = Date.now() - 195000; W.acc = 0; W.laps = [62400, 131800];
    if(dq[1] === "ring"){ S.end = Date.now() - 100; }
    if(dq[1] === "open") setTimeout(function(){ open(); }, 300);
    if(dq[1] === "sw") setTimeout(function(){ open(); setTab("sw"); drawLaps(); }, 300);
  }
}
draw();
})();
