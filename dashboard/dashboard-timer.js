/* dashboard-timer.js: χρονόμετρο κουζίνας.

   - Κουμπί ⏲️ στην πάνω μπάρα. Ανοίγει ένα παράθυρο με έτοιμους χρόνους (1 έως 90 λεπτά) και −1 / +1 λεπτό.
   - Όσο μετράει, το κουμπί δείχνει τον χρόνο που μένει. Στην κορνίζα και στη νυχτερινή οθόνη φαίνεται
     μια μικρή ένδειξη πάνω δεξιά (άγγιγμα = άνοιγμα του χρονομέτρου).
   - Στο τέλος: ήχος κάθε δευτερόλεπτο (έως CONFIG.TIMER.ringMin λεπτά) και μεγάλο «Τέλος!» μέχρι να πατήσεις «Εντάξει».
   - Αντέχει ανανέωση της σελίδας: ο χρόνος λήξης φυλάγεται στο localStorage.
   Ρυθμίσεις: CONFIG.TIMER στο dashboard.html. */
(function(){
"use strict";
var T = (window.CONFIG && CONFIG.TIMER) || {};
var PRESETS = T.presets || [1, 3, 5, 10, 15, 20, 30, 45, 60, 90];
var KEY = "hcc_timer";

var css =
  "#tm-pill .tm-t{font-variant-numeric:tabular-nums;font-weight:600}" +
  ".tm-ico{width:1.5rem;height:1.5rem;flex:0 0 auto} #tm-badge .tm-ico{width:1.75rem;height:1.75rem}" +
  "#tm-pill.idle{padding:0;width:3rem;justify-content:center}" +
  "#tm-pill.run{background:var(--tint);color:var(--tint-text);border-color:transparent}" +
  "#tm-pill.ring{background:var(--bad);color:#fff;border-color:transparent}" +
  "#tm-badge{position:fixed;top:1rem;right:1rem;z-index:8;display:none;align-items:center;gap:.5rem;padding:.5rem 1.125rem;border-radius:999px;" +
    "background:rgba(0,0,0,.55);color:#fff;font-size:1.75rem;font-weight:600;font-variant-numeric:tabular-nums;border:0;font-family:inherit}" +
  "html.frame-on #tm-badge.on, body.night #tm-badge.on{display:flex}" +
  "#tm{position:fixed;top:0;right:0;bottom:0;left:0;z-index:20;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.6)}" +
  "#tm.open{display:flex}" +
  "#tm-card{width:46rem;max-width:94vw;background:var(--surface);background:var(--bg);border:1px solid var(--hairline);border-radius:var(--r);padding:1.5rem 1.75rem 1.75rem;color:var(--text)}" +
  "html:not(.light):not(.dark) #tm-card{background:#151a23}" +
  "#tm-head{display:flex;align-items:center;justify-content:space-between}" +
  "#tm-head h2{font-size:1.375rem;font-weight:600}" +
  "#tm-x{width:3.5rem;height:3.5rem;border-radius:50%;border:0;background:var(--surface-2);color:var(--text);font-size:1.5rem;font-family:inherit}" +
  "#tm-big{font-size:8.5rem;font-weight:600;letter-spacing:-.03em;line-height:1;text-align:center;font-variant-numeric:tabular-nums;margin:.75rem 0 1.25rem}" +
  "#tm.ringing #tm-big{color:var(--bad)}" +
  "#tm-msg{text-align:center;font-size:1.25rem;color:var(--text-2);min-height:1.5rem;margin-top:-.75rem;margin-bottom:1rem}" +
  ".tm-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:.625rem;margin-bottom:.625rem}" +
  ".tm-b{min-height:4rem;border-radius:var(--r-sm);border:0;background:var(--surface-2);color:var(--text);font-size:1.375rem;font-weight:600;font-family:inherit;font-variant-numeric:tabular-nums}" +
  ".tm-b:active{background:var(--surface-press)}" +
  ".tm-b:disabled{opacity:.35}" +
  "#tm-adj{grid-template-columns:1fr 1fr}" +
  "#tm-act{display:grid;grid-template-columns:1fr 2fr;gap:.625rem;margin-top:1rem}" +
  "#tm-go{background:var(--accent);color:var(--on-accent)}" +
  "#tm.ringing #tm-go{background:var(--bad);color:#fff}" +
  "#tm.ringing .tm-grid{display:none}";
var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

// Κουμπί στην πάνω μπάρα, πριν από το «Ημερήσια»
var pill = document.createElement("button");
pill.type = "button"; pill.className = "pill"; pill.id = "tm-pill"; pill.setAttribute("aria-label", "Χρονόμετρο κουζίνας");
// εικονίδιο ρολογιού (σχέδιο, όχι emoji, ώστε να έχει το χρώμα του κειμένου). Όσο μετράει, δίπλα η αντίστροφη μέτρηση.
var ICON = '<svg class="tm-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13.5" r="8" fill="none" stroke="currentColor" stroke-width="2"/>' +
  '<path d="M12 9v4.5l3 2M9.5 2.5h5M12 2.5v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
pill.innerHTML = ICON + '<span class="tm-t"></span>';
// αμέσως μετά την κουκκίδα σύνδεσης
var net = document.getElementById("net-pill");
if(net && net.parentNode) net.parentNode.insertBefore(pill, net.nextSibling);

var badge = document.createElement("button");
badge.type = "button"; badge.id = "tm-badge"; badge.setAttribute("aria-label", "Χρονόμετρο κουζίνας");
document.body.appendChild(badge);

var box = document.createElement("div"); box.id = "tm"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Χρονόμετρο κουζίνας");
box.innerHTML =
  '<div id="tm-card">' +
    '<div id="tm-head"><h2>Χρονόμετρο κουζίνας</h2><button id="tm-x" type="button" aria-label="Κλείσιμο">✕</button></div>' +
    '<div id="tm-big">0:00</div><div id="tm-msg"></div>' +
    '<div class="tm-grid" id="tm-pre">' + PRESETS.map(function(m){ return '<button class="tm-b" type="button" data-m="' + m + '">' + m + '′</button>'; }).join("") + '</div>' +
    '<div class="tm-grid" id="tm-adj"><button class="tm-b" type="button" data-d="-60">−1 λεπτό</button><button class="tm-b" type="button" data-d="60">+1 λεπτό</button></div>' +
    '<div id="tm-act"><button class="tm-b" type="button" id="tm-stop">Ακύρωση</button><button class="tm-b" type="button" id="tm-go">Έναρξη</button></div>' +
  '</div>';
document.body.appendChild(box);
function $(id){ return document.getElementById(id); }

/* ---- Κατάσταση: set = χρόνος που διάλεξες (sec), end = πότε λήγει (ms) όσο μετράει, left = ό,τι έμεινε σε παύση ---- */
var S = { set: 0, end: 0, left: 0, ringing: false, ringStart: 0 };
try{ var o = JSON.parse(localStorage.getItem(KEY) || "null"); if(o){ S.set = o.set || 0; S.end = o.end || 0; S.left = o.left || 0; } }catch(e){}
function save(){ try{ localStorage.setItem(KEY, JSON.stringify({ set: S.set, end: S.end, left: S.left })); }catch(e){} }

function remain(){ return S.end ? Math.max(0, Math.ceil((S.end - Date.now()) / 1000)) : S.left; }
function fmt(s){
  var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return (h ? h + ":" + ("0" + m).slice(-2) : m) + ":" + ("0" + x).slice(-2);
}

// "10 λεπτά", "1 λεπτό", ή 1:30 αν δεν είναι ακέραια λεπτά
function label(s){ return s % 60 ? fmt(s) : s === 60 ? "1 λεπτό" : (s / 60) + " λεπτά"; }

function draw(){
  var r = remain(), running = !!S.end, paused = !S.end && S.left > 0;
  $("tm-big").textContent = S.ringing ? "Τέλος!" : fmt(running || paused ? r : S.set);
  $("tm-msg").textContent = S.ringing ? "⏰ Τελείωσαν τα " + label(S.set) : paused ? "Σε παύση" : running ? "" : (S.set ? "" : "Διάλεξε χρόνο");
  $("tm-go").textContent = S.ringing ? "Εντάξει" : running ? "Παύση" : paused ? "Συνέχεια" : "Έναρξη";
  $("tm-go").disabled = !S.ringing && !running && !paused && !S.set;
  $("tm-stop").disabled = !S.ringing && !running && !paused && !S.set;
  box.classList.toggle("ringing", S.ringing);
  // κουμπί μπάρας και ένδειξη πάνω από κορνίζα/νύχτα
  var show = S.ringing || running || paused;
  pill.querySelector(".tm-t").textContent = S.ringing ? "Τέλος!" : show ? fmt(r) : "";
  pill.classList.toggle("run", show && !S.ringing);
  pill.classList.toggle("ring", S.ringing);
  pill.classList.toggle("idle", !show);
  badge.innerHTML = ICON + "<span>" + (S.ringing ? "Τέλος!" : fmt(r) + (paused ? " ⏸" : "")) + "</span>";
  badge.classList.toggle("on", show);
}

/* ---- Ήχος: δύο σύντομα «μπιπ» κάθε δευτερόλεπτο, με WebAudio (χωρίς αρχείο ήχου) ---- */
var AC = null;
function audio(){
  if(!AC){ try{ AC = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){ return null; } }
  if(AC.state === "suspended") AC.resume();
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

function ring(){
  S.ringing = true; S.ringStart = Date.now(); S.end = 0; S.left = 0; save();
  box.classList.add("open");
  // τη νύχτα η οθόνη είναι σκοτεινή: φωτεινότητα «ξύπνιου»
  if(window.kiosk && kiosk.setBrightness && window.CONFIG && CONFIG.KIOSK && document.body.className.indexOf("night") >= 0)
    try{ kiosk.setBrightness(CONFIG.KIOSK.brightnessAwake || 0.5); }catch(e){}
  if(T.telegram && window.TELEGRAM && TELEGRAM.botToken && TELEGRAM.chatId)
    fetch("https://api.telegram.org/bot" + TELEGRAM.botToken + "/sendMessage?chat_id=" + encodeURIComponent(TELEGRAM.chatId) +
      "&text=" + encodeURIComponent("⏰ Το χρονόμετρο κουζίνας (" + label(S.set) + ") τελείωσε.")).catch(function(){});
}
function stopRing(){ S.ringing = false; draw(); }

/* ---- Κάθε 250 ms: ενημέρωση, λήξη, ήχος ---- */
var lastBeep = 0;
setInterval(function(){
  if(S.end && Date.now() >= S.end) ring();
  if(S.ringing){
    if(Date.now() - S.ringStart > (T.ringMin || 3) * 60000) stopRing();   // σταματά μόνο του μετά από λίγα λεπτά
    else if(Date.now() - lastBeep >= 1000){ lastBeep = Date.now(); beep(); }
  }
  if(S.end || S.ringing || box.classList.contains("open")) draw();
}, 250);

/* ---- Κουμπιά ---- */
function open(e){ if(e) e.stopPropagation(); audio(); box.classList.add("open"); draw(); }
pill.addEventListener("click", open);
badge.addEventListener("click", open);
$("tm-x").addEventListener("click", function(e){ e.stopPropagation(); if(S.ringing) stopRing(); box.classList.remove("open"); });
box.addEventListener("click", function(e){ e.stopPropagation(); if(e.target === box){ if(S.ringing) stopRing(); box.classList.remove("open"); } });
$("tm-pre").addEventListener("click", function(e){
  var m = e.target.getAttribute("data-m"); if(!m) return;
  audio(); S.set = +m * 60; S.left = 0; S.end = Date.now() + S.set * 1000; save(); draw();   // ένα πάτημα = ξεκινά αμέσως
});
$("tm-adj").addEventListener("click", function(e){
  var d = +e.target.getAttribute("data-d"); if(!d) return;
  if(S.end){ S.end = Math.max(Date.now() + 1000, S.end + d * 1000); S.set = Math.max(S.set, Math.ceil((S.end - Date.now()) / 1000)); }
  else if(S.left){ S.left = Math.max(1, S.left + d); }
  else { S.set = Math.max(0, S.set + d); }
  save(); draw();
});
$("tm-go").addEventListener("click", function(){
  audio();
  if(S.ringing){ stopRing(); box.classList.remove("open"); return; }
  if(S.end){ S.left = remain(); S.end = 0; }                         // παύση
  else if(S.left){ S.end = Date.now() + S.left * 1000; S.left = 0; } // συνέχεια
  else if(S.set){ S.end = Date.now() + S.set * 1000; }              // έναρξη
  save(); draw();
});
$("tm-stop").addEventListener("click", function(){
  S.ringing = false; S.end = 0; S.left = 0; S.set = 0; save(); draw();
});

// Μετά από ανανέωση της σελίδας: αν έληξε πριν λίγο (έως 5 λεπτά), χτυπάει. Αλλιώς ξεχνιέται.
if(S.end && Date.now() >= S.end){ if(Date.now() - S.end < 5 * 60000) ring(); else { S.end = 0; save(); } }
draw();
})();
