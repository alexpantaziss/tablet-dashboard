/* dashboard-traffic.js: χρόνος διαδρομής προς τη δουλειά με το TomTom Routing API (calculateRoute).
   Ρυθμίσεις: CONFIG.TRAFFIC (ημέρες, παράθυρο, ανανέωση, συνηθισμένη διαδρομή, όρια χρωμάτων).
   Κλειδί: SECRETS.TOMTOM_KEY στο dashboard-secrets.js (δεν ανεβαίνει στο GitHub).
   Από CONFIG.LOCATION προς CONFIG.WORK. Καμία κλήση εκτός παραθύρου.
   Δείχνει: λεπτά, ώρα άφιξης αν φύγεις τώρα, καθυστέρηση από κίνηση (χρώμα + σχήμα + κείμενο),
   όνομα κύριας διαδρομής, και εναλλακτική μόνο αν κερδίζει πάνω από altGainMin λεπτά.
   Στο dashboard: η κάρτα "Διαδρομή προς δουλειά", μόνο μέσα στο παράθυρο. Στην κορνίζα: window.trafficNow().
   Δοκιμή: ?demo=1&traffic=1 */
(function(){
"use strict";
var T = CONFIG.TRAFFIC || {}, W = CONFIG.WORK || {}, H = CONFIG.LOCATION;
var KEY = (window.SECRETS && SECRETS.TOMTOM_KEY) || "";
var FORCE = DEMO && /[?&]traffic=1/.test(location.search);
var DATA = null, timer = null, busy = false;

var css =
  "#r-traffic:empty{display:none}" +

  ".tr-top{display:flex;align-items:baseline;gap:.75rem;flex-wrap:wrap}" +
  ".tr-min{font-size:4rem;font-weight:600;line-height:.95;letter-spacing:-.035em;font-variant-numeric:tabular-nums}" +
  ".tr-min small{font-size:1.5rem;font-weight:600;letter-spacing:0;margin-left:.25rem}" +
  ".tr-arr{font-size:1.25rem;color:var(--text-2);line-height:1.3}" +
  ".tr-arr b{color:var(--text);font-weight:600;font-variant-numeric:tabular-nums}" +
  ".tr-delay{display:flex;align-items:center;gap:.5rem;font-size:1.25rem;font-weight:600;margin-top:.5rem}" +
  ".tr-delay.ok{color:var(--ok)} .tr-delay.warn{color:var(--warn)} .tr-delay.bad{color:var(--bad)}" +
  ".tr-via{font-size:1.1875rem;color:var(--text-2);margin-top:.25rem;line-height:1.3}" +
  ".tr-via b{color:var(--text);font-weight:600}" +
  ".tr-alt{margin-top:.625rem;padding:.625rem .875rem;border-radius:var(--r-sm);background:var(--surface-2);font-size:1.125rem;line-height:1.35}" +
  ".tr-alt b{font-weight:600}" +
  ".tr-src{font-size:.9375rem;color:var(--text-3);margin-top:.375rem}" +
  "#c-route.tr-off{display:none !important}";   // εκτός παραθύρου η κάρτα δεν φαίνεται
var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

function active(d){
  d = d || new Date();
  if(FORCE) return true;
  return (T.days || []).indexOf(d.getDay()) >= 0 && inWindow(T.from, T.to, d);
}
function delayClass(min){ return min <= (T.delayWarnMin || 5) ? "ok" : min <= (T.delayBadMin || 15) ? "warn" : "bad"; }

// Δρόμοι κάθε διαδρομής, με σειρά σημασίας: μήκος πάνω στη διαδρομή, με διπλό βάρος για τους αριθμημένους
// (αυτοκινητόδρομοι και εθνικές, π.χ. Αττική Οδός A6, Μαραθώνος 54). Κρατάει όσους έχουν πάνω από 1 χλμ.
function roadsOf(route){
  var ins = (route.guidance && route.guidance.instructions) || [], len = {}, num = {};
  for(var i = 0; i < ins.length - 1; i++){
    var name = ins[i].street || (ins[i].roadNumbers && ins[i].roadNumbers[0]) || "";
    if(!name) continue;
    var m = (ins[i + 1].routeOffsetInMeters || 0) - (ins[i].routeOffsetInMeters || 0);
    len[name] = (len[name] || 0) + m;
    if(ins[i].roadNumbers && ins[i].roadNumbers.length) num[name] = 1;
  }
  return Object.keys(len).filter(function(k){ return len[k] > 1000; })
    .sort(function(a, b){ return len[b] * (num[b] ? 2 : 1) - len[a] * (num[a] ? 2 : 1); });
}
function shortRoad(s){ return s.replace(/^Λεωφόρος\s+/, "Λ. "); }
function simplify(j){
  var out = (j.routes || []).map(function(r){
    var s = r.summary, roads = roadsOf(r);
    return { sec: s.travelTimeInSeconds, delay: s.trafficDelayInSeconds || 0, arr: s.arrivalTime, km: s.lengthInMeters / 1000, roads: roads, road: roads[0] || "" };
  });
  // δύο διαδρομές με ίδιο όνομα: προστίθεται ο πρώτος δρόμος που τις ξεχωρίζει
  out.forEach(function(r){
    var twins = out.filter(function(o){ return o !== r && o.road === r.road; });
    if(!twins.length || !r.road) return;
    var other = r.roads.filter(function(x){ return twins.every(function(t){ return t.roads.indexOf(x) < 0; }); })[0];
    if(other) r.label = shortRoad(r.road) + " και " + shortRoad(other);
  });
  out.forEach(function(r){ if(!r.label) r.label = r.road ? shortRoad(r.road) : ""; });
  return out;
}
// Η "κύρια" είναι η συνηθισμένη διαδρομή (usualRoad) αν τη βρήκε το TomTom, αλλιώς η πιο γρήγορη.
// Εναλλακτική: η πιο γρήγορη από τις άλλες, μόνο αν κερδίζει πάνω από altGainMin λεπτά.
function pick(routes){
  if(!routes.length) return null;
  var usual = (T.usualRoad || "").toLowerCase(), main = null;
  if(usual) main = routes.filter(function(r){ return (r.roads || [r.road]).slice(0, 3).some(function(x){ return x.toLowerCase().indexOf(usual) >= 0; }); })
    .sort(function(a, b){ return a.sec - b.sec; })[0] || null;
  if(!main) main = routes.slice().sort(function(a, b){ return a.sec - b.sec; })[0];
  var alt = routes.filter(function(r){ return r !== main; }).sort(function(a, b){ return a.sec - b.sec; })[0] || null;
  if(alt && main.sec - alt.sec <= (T.altGainMin || 5) * 60) alt = null;
  return { main: main, alt: alt };
}

function fetchRoute(){
  clearTimeout(timer);
  if(!active()){ DATA = null; draw(); schedule(); return; }
  if(DEMO){ DATA = { t: Date.now(), routes: demo(), stale: false }; draw(); schedule(); return; }
  if(!KEY || !W.lat || !W.lon){ draw(); schedule(); return; }
  if(busy) return; busy = true;
  var url = "https://api.tomtom.com/routing/1/calculateRoute/" + H.lat + "," + H.lon + ":" + W.lat + "," + W.lon + "/json" +
    "?key=" + encodeURIComponent(KEY) + "&traffic=true&travelMode=car&maxAlternatives=" + (T.maxAlternatives || 2) +
    "&routeRepresentation=summaryOnly&instructionsType=coded&language=el-GR";
  fetchT(url, {}, 20000).then(function(r){ return r.json(); }).then(function(j){
    var routes = simplify(j); if(!routes.length) throw new Error("καμία διαδρομή");
    DATA = { t: Date.now(), routes: routes, stale: false };
    store("traffic", DATA); mark("TomTom", true);
    draw(); schedule();
  }).catch(function(e){
    // κρατάει τα τελευταία δεδομένα (αν είναι της ίδιας μέρας) και ξαναδοκιμάζει σε 1 λεπτό
    var saved = loadSaved();
    if(!DATA && saved) DATA = saved;
    if(DATA) DATA.stale = true;
    mark("TomTom", false, e.message);
    draw();
    timer = setTimeout(fetchRoute, 60000);
  }).then(function(){ busy = false; });
}
function loadSaved(){
  var o = load("traffic");   // load/store του dashboard.html (localStorage)
  return o && o.v && new Date(o.v.t).toDateString() === new Date().toDateString() ? o.v : null;
}
// Επόμενη κλήση: κάθε everyMin μέσα στο παράθυρο. Εκτός παραθύρου: έλεγχος κάθε λεπτό (χωρίς κλήση) για να ξεκινήσει στην ώρα του.
function schedule(){
  clearTimeout(timer);
  timer = setTimeout(fetchRoute, active() ? (T.everyMin || 3) * 60000 : 60000);
}

function draw(){
  var box = $("r-traffic"), card = $("c-route");
  if(!box) return;
  var p = DATA && active() ? pick(DATA.routes) : null;
  if(card) card.className = card.className.replace(/\s*\btr-off\b/g, "") + (p ? "" : " tr-off");
  if(!p){
    box.innerHTML = active() && !DEMO && !KEY ? '<div class="tr-src">Χρόνος διαδρομής: λείπει το TOMTOM_KEY στο dashboard-secrets.js.</div>' : "";
    if(window.frameRefresh) window.frameRefresh();
    return;
  }
  var m = p.main, min = Math.round(m.sec / 60), dmin = Math.round(m.delay / 60), cls = delayClass(dmin);
  var arr = new Date(Date.now() + m.sec * 1000);   // "αν φύγεις τώρα", όχι η ώρα της κλήσης
  var shape = cls === "ok" ? "ok" : cls === "warn" ? "warn" : "bad";
  var html =
    '<div class="tr-top"><div class="tr-min">' + min + '<small>λεπ.</small></div>' +
      '<div class="tr-arr">Άφιξη <b>' + hm(arr) + '</b><br>αν φύγεις τώρα</div></div>' +
    '<div class="tr-delay ' + cls + '"><span class="dot ' + shape + '"></span>' +
      (dmin >= 1 ? 'Κίνηση: +' + dmin + ' λεπ.' : 'Χωρίς καθυστέρηση') + '</div>' +
    (m.label ? '<div class="tr-via">Μέσω <b>' + esc(m.label) + '</b> · ' + fmtKm(m.km) + '</div>' : '');
  if(p.alt){
    var a = p.alt, amin = Math.round(a.sec / 60);
    html += '<div class="tr-alt">Πιο γρήγορα σήμερα: <b>' + esc(a.label || "εναλλακτική") + '</b>, ' + amin + ' λεπ. (' + (min - amin) + ' λεπ. λιγότερα)</div>';
  }
  html += '<div class="tr-src">TomTom · ' + (DATA.stale ? 'παλιά δεδομένα, από ' : 'ενημ. ') + hm(new Date(DATA.t)) + '</div>';
  box.innerHTML = html;
  if(window.frameRefresh) window.frameRefresh();
}
function fmtKm(km){ return String(Math.round(km * 10) / 10).replace(".", ",") + " χλμ."; }

// Για την κορνίζα: { min, cls } της κύριας διαδρομής, μόνο μέσα στο παράθυρο
window.trafficNow = function(){
  var p = DATA && active() ? pick(DATA.routes) : null;
  if(!p) return null;
  return { min: Math.round(p.main.sec / 60), cls: delayClass(Math.round(p.main.delay / 60)), stale: !!DATA.stale };
};
(window.statusLines = window.statusLines || []).push(function(){
  if(!active()) return "";
  var p = DATA ? pick(DATA.routes) : null;
  return p ? "🚗 Προς δουλειά: " + Math.round(p.main.sec / 60) + " λεπ." + (p.main.label ? " μέσω " + p.main.label : "") + (DATA.stale ? " (παλιά δεδομένα)" : "") : "";
});

function demo(){
  var n = Date.now();
  return [
    { sec: 32 * 60, delay: 7 * 60, arr: new Date(n + 32 * 60000).toISOString(), km: 25.4, road: "Αττική Οδός", label: "Αττική Οδός", roads: ["Αττική Οδός"] },
    { sec: 26 * 60, delay: 2 * 60, arr: new Date(n + 26 * 60000).toISOString(), km: 25.8, road: "Λεωφόρος Μαραθώνος", label: "Λ. Μαραθώνος", roads: ["Λεωφόρος Μαραθώνος"] },
    { sec: 35 * 60, delay: 9 * 60, arr: new Date(n + 35 * 60000).toISOString(), km: 25.5, road: "Αττική Οδός", label: "Αττική Οδός και Κέκροπος", roads: ["Αττική Οδός", "Κέκροπος"] }
  ];
}

// ξεκινάει λίγο μετά το renderRoute, ώστε να υπάρχει το #r-traffic
setTimeout(fetchRoute, 1500);
setInterval(draw, 60000);   // η "άφιξη αν φύγεις τώρα" προχωράει με το ρολόι, χωρίς νέα κλήση
})();
