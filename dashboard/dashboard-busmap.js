/* dashboard-busmap.js
   Πάτημα στην κάρτα "Λεωφορεία ΟΑΣΑ": χάρτης σε όλη την οθόνη με τις διαδρομές των γραμμών που
   περνούν από τις στάσεις του CONFIG.OASA_STOPS, τα λεωφορεία ζωντανά (ΟΑΣΑ getBusLocation) και τις στάσεις.
   Χάρτης: Leaflet (unpkg) με πλακίδια Esri Dark Gray Canvas (χωρίς κλειδί). Φορτώνονται μόνο την πρώτη φορά που ανοίγει. */
(function(){
var BM = { refreshSec: 10, closeAfterMin: 2,
  colors: ["#64d2ff", "#bf9cff", "#ff8fb1", "#8ab4f8", "#ffb27a", "#7fe0d0"] };   // χωρίς πράσινο/κίτρινο/κόκκινο: εδώ σημαίνουν κατάσταση
var API = CONFIG.OASA_API, root = document.documentElement;
var map = null, layers = null, busLayer = null, routes = null, stops = null, timer = null, closeTimer = null, loading = null;

/* ---------- στοιχεία σελίδας ---------- */
var css = document.createElement("style");
css.textContent =
  "#busmap{position:fixed;inset:0;z-index:60;display:none;flex-direction:column;background:var(--bg,#0b0f14)}" +
  "html.map-open #busmap{display:flex}" +
  ".bm-head{display:flex;align-items:center;gap:1rem;padding:.75rem 1rem .75rem 1.375rem;flex:0 0 auto}" +
  ".bm-title{font-size:1.375rem;font-weight:700;flex:0 0 auto}" +
  ".bm-sub{font-size:.9375rem;color:var(--text-3);flex:0 0 auto;font-variant-numeric:tabular-nums}" +
  ".bm-legend{flex:1;display:flex;flex-wrap:wrap;gap:.375rem 1rem;font-size:.9375rem;color:var(--text-2);min-width:0}" +
  ".bm-legend span{white-space:nowrap}.bm-legend b{color:var(--text);font-weight:700;margin-right:.25rem}" +
  ".bm-legend i{display:inline-block;width:1rem;height:.25rem;border-radius:2px;margin-right:.375rem;vertical-align:.1875rem}" +
  ".bm-close{min-width:2.75rem;min-height:2.75rem;padding:0 1.125rem;border:0;border-radius:999px;background:var(--text);color:#0b0f14;" +
  "font:inherit;font-size:1.0625rem;font-weight:700;cursor:pointer}.bm-close:active{background:#d5dbe3}" +
  "#bm-map{flex:1;min-height:0;background:#0e1116}" +
  ".bm-msg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:500;background:rgba(12,16,22,.9);padding:.75rem 1.25rem;border-radius:.875rem;color:var(--text-2);font-size:1.0625rem}" +
  ".bm-bus{display:flex;align-items:center;justify-content:center;width:2.25rem;height:2.25rem;border-radius:999px;color:#0b0f14;font-weight:800;font-size:.8125rem;" +
  "box-shadow:0 0 0 2px #0b0f14,0 .25rem .75rem rgba(0,0,0,.5);position:relative}" +
  ".bm-bus em{position:absolute;left:50%;top:-.5rem;margin-left:-.3125rem;width:0;height:0;border-left:.3125rem solid transparent;border-right:.3125rem solid transparent;border-bottom:.4375rem solid currentColor;transform-origin:50% 1.625rem}" +
  ".bm-stop{display:flex;align-items:center;gap:.375rem;white-space:nowrap;font-size:.875rem;font-weight:700;color:#0b0f14;background:#fff;border-radius:999px;padding:.1875rem .625rem .1875rem .375rem;box-shadow:0 .25rem .75rem rgba(0,0,0,.5)}" +
  ".bm-stop::before{content:'';width:.625rem;height:.625rem;border-radius:999px;background:#0b0f14}" +
  ".leaflet-container{font:inherit}.leaflet-control-attribution{background:rgba(12,16,22,.7)!important;color:#8892a0!important;font-size:.6875rem}" +
  ".leaflet-control-attribution a{color:#a9b4c2!important}";
document.head.appendChild(css);
var box = document.createElement("div");
box.id = "busmap"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Λεωφορεία στον χάρτη");
box.innerHTML = '<div class="bm-head"><div class="bm-title">Λεωφορεία στον χάρτη</div><div class="bm-legend" id="bm-legend"></div>' +
  '<div class="bm-sub" id="bm-sub"></div><button type="button" class="bm-close" id="bm-close">Κλείσιμο</button></div>' +
  '<div id="bm-map"></div>';
document.body.appendChild(box);

/* ---------- φόρτωση Leaflet (μία φορά) ---------- */
function loadLeaflet(){
  if(window.L && L.map) return Promise.resolve();
  if(loading) return loading;
  loading = new Promise(function(ok, bad){
    var l = document.createElement("link"); l.rel = "stylesheet"; l.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; document.head.appendChild(l);
    var s = document.createElement("script"); s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.onload = ok; s.onerror = function(){ loading = null; bad(new Error("δεν φορτώθηκε ο χάρτης")); };
    document.head.appendChild(s);
  });
  return loading;
}
function api(act, p1){ return fetchT(API + "?act=" + act + "&p1=" + encodeURIComponent(p1), {}, 15000).then(function(r){ return r.json(); }); }

/* ---------- διαδρομές και στάσεις (μία φορά, με cache 7 ημερών) ---------- */
function loadRoutes(){
  if(routes) return Promise.resolve();
  var c = load("busmap2");
  if(c && Date.now() - c.t < 7*86400000 && c.v.routes && c.v.routes.length){ routes = c.v.routes; stops = c.v.stops; return Promise.resolve(); }
  var cfg = CONFIG.OASA_STOPS.filter(function(s){ return s.code; }), seen = {}, list = [];
  return Promise.all(cfg.map(function(s){ return api("webRoutesForStop", s.code); })).then(function(res){
    res.forEach(function(arr){ (arr || []).forEach(function(r){ if(!seen[r.RouteCode]){ seen[r.RouteCode] = 1; list.push({ code: String(r.RouteCode), line: r.LineID, descr: r.RouteDescr }); } }); });
    return Promise.all(list.map(function(r){
      return Promise.all([api("webRouteDetails", r.code), api("webGetStops", r.code)]).then(function(x){
        r.path = (x[0] || []).sort(function(a, b){ return a.routed_order - b.routed_order; }).map(function(p){ return [+(+p.routed_y).toFixed(5), +(+p.routed_x).toFixed(5)]; });
        r.stops = x[1] || [];
      });
    }));
  }).then(function(){
    stops = cfg.map(function(s){
      for(var i = 0; i < list.length; i++) for(var j = 0; j < list[i].stops.length; j++){
        var st = list[i].stops[j]; if(String(st.StopCode) === String(s.code)) return { label: s.label, name: st.StopDescr || "", lat: +st.StopLat, lng: +st.StopLng };
      }
      return null;
    }).filter(Boolean);
    list.forEach(function(r, i){ r.color = BM.colors[i % BM.colors.length]; delete r.stops; });
    routes = list; store("busmap2", { routes: routes, stops: stops });
  });
}
function shortDescr(r){   // "ΑΡΤΕΜΙΣ [ΒΡΑΥΡΩΝΑ] - ΣΤ. ΝΟΜΙΣΜΑΤΟΚΟΠΕΙΟ" -> "προς ΝΟΜΙΣΜΑΤΟΚΟΠΕΙΟ"
  var parts = (r.descr || "").split(/\s+-\s+/), to = parts[parts.length - 1].replace(/^ΣΤ\.\s*/, "").replace(/\s*\[.*\]\s*/, "").trim();
  return "προς " + to;   // όπως τα γράφει ο ΟΑΣΑ (κεφαλαία χωρίς τόνους), ίδια με την κάρτα
}

/* ---------- σχεδίαση ---------- */
function build(){
  map = L.map("bm-map", { zoomControl: false, attributionControl: true });
  // Esri "Dark Gray Canvas": δωρεάν, χωρίς κλειδί. Βάση + ετικέτες (ονόματα δρόμων/περιοχών) σε δύο στρώσεις.
  var ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/";
  L.tileLayer(ESRI + "World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16,
    attribution: 'Χάρτης &copy; Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
  L.tileLayer(ESRI + "World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16 }).addTo(map);
  layers = L.layerGroup().addTo(map); busLayer = L.layerGroup().addTo(map);
}
function drawStatic(){
  layers.clearLayers();
  routes.forEach(function(r){ if(r.path.length) L.polyline(r.path, { color: r.color, weight: 4, opacity: .75 }).addTo(layers); });
  // στάσεις σε απόσταση κάτω από 200 μ. (π.χ. απέναντι πλευρές του δρόμου) γίνονται μία ετικέτα με το όνομα της στάσης
  var groups = [];
  stops.forEach(function(s){
    var g = groups.filter(function(x){ return map.distance([x.lat, x.lng], [s.lat, s.lng]) < 200; })[0];
    if(g) g.items.push(s); else groups.push({ lat: s.lat, lng: s.lng, items: [s] });
  });
  groups.forEach(function(g){
    var lab = g.items.length > 1 ? (g.items[0].name || g.items.map(function(s){ return s.label; }).join(" / ")) : g.items[0].label;
    L.marker([g.lat, g.lng], { icon: L.divIcon({ className: "", html: '<div class="bm-stop">' + esc(lab) + '</div>', iconSize: null, iconAnchor: [8, 12] }), zIndexOffset: 500 }).addTo(layers);
  });
  $("bm-legend").innerHTML = routes.map(function(r){ return '<span><i style="background:' + r.color + '"></i><b>' + esc(r.line) + '</b>' + esc(shortDescr(r)) + '</span>'; }).join("");
}
function busIcon(r, heading){
  return L.divIcon({ className: "", iconSize: [36, 36], iconAnchor: [18, 18],
    html: '<div class="bm-bus" style="background:' + r.color + ';color:#0b0f14"><em style="color:' + r.color + ';transform:rotate(' + (+heading || 0) + 'deg)"></em>' + esc(r.line) + '</div>' });
}
var firstFit = true;
function refresh(){
  clearTimeout(timer);
  Promise.all(routes.map(function(r){ return api("getBusLocation", r.code).then(function(v){ return { r: r, v: Array.isArray(v) ? v : [] }; }, function(){ return { r: r, v: [] }; }); }))
  .then(function(res){
    busLayer.clearLayers(); var pts = stops.map(function(s){ return [s.lat, s.lng]; }), n = 0;
    res.forEach(function(x){ x.v.forEach(function(b){
      var ll = [+b.CS_LAT, +b.CS_LNG]; if(!ll[0]) return; n++;
      L.marker(ll, { icon: busIcon(x.r, b.VEH_HEADING), zIndexOffset: 1000, keyboard: false, title: x.r.line + " " + shortDescr(x.r) }).addTo(busLayer);
      pts.push(ll);
    }); });
    $("bm-sub").textContent = (n ? n + (n === 1 ? " λεωφορείο" : " λεωφορεία") : "Κανένα λεωφορείο εν κινήσει") + " · " + hm(new Date());
    // πρώτη φορά: να χωράνε οι στάσεις και όλα τα λεωφορεία, με μέγιστο ζουμ 15
    if(firstFit){ firstFit = false; if(pts.length > 1) map.fitBounds(pts, { padding: [48, 48], maxZoom: 15 }); else if(pts.length) map.setView(pts[0], 14); }
  }).then(function(){
    // νυχτερινή οθόνη (χωρίς άγγιγμα): κλείσιμο του χάρτη
    if(document.body.className.indexOf("night") >= 0 && !/\bawake\b/.test(root.className)){ close(); return; }
    if(isOpen()) timer = setTimeout(refresh, BM.refreshSec * 1000);
  });
}
function msg(t){ var m = box.querySelector(".bm-msg"); if(!t){ if(m) m.remove(); return; } if(!m){ m = document.createElement("div"); m.className = "bm-msg"; $("bm-map").appendChild(m); } m.textContent = t; }

/* ---------- άνοιγμα / κλείσιμο ---------- */
function isOpen(){ return /\bmap-open\b/.test(root.className); }
function armClose(){ clearTimeout(closeTimer); closeTimer = setTimeout(close, BM.closeAfterMin * 60000); }
function open(){
  if(isOpen()) return;
  root.className += " map-open"; armClose(); firstFit = true;
  if(!map) msg("Φόρτωση χάρτη...");
  loadLeaflet().then(loadRoutes).then(function(){
    if(!isOpen()) return;
    if(!map) build();
    msg(""); map.invalidateSize(); drawStatic(); refresh();
  }).catch(function(e){ msg("Ο χάρτης δεν φορτώθηκε (" + e.message + "). Δοκίμασε ξανά σε λίγο."); });
}
function close(){
  root.className = root.className.replace(/\s*\bmap-open\b/g, "");
  clearTimeout(timer); clearTimeout(closeTimer);
}
$("bm-close").addEventListener("click", close);
box.addEventListener("touchstart", armClose, { passive: true });
$("c-bus").addEventListener("click", open);
$("c-bus").style.cursor = "pointer";
window.closeBusMap = close;
// δοκιμή: ?busmap=1
if(/[?&]busmap=1/.test(location.search)) setTimeout(open, 1500);
})();
