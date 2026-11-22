/* dashboard-outdoor.js: οθόνη 4 "Έξω". Πότισμα, τρέξιμο, αεροπλάνα, σεισμοί.
   Όλες οι παράμετροι έχουν προεπιλογές εδώ και αλλάζουν από το dashboard-config.js:
   LOCAL.CONFIG.GARDEN, .RUN, .PLANES, .QUAKES (βάζεις μόνο όσα θες να αλλάξεις).
   Θέση σπιτιού: CONFIG.LOCATION.
   Πηγές: Open-Meteo (καιρός, εδαφική υγρασία, ποιότητα αέρα), adsb.lol με εφεδρεία το OpenSky (αεροσκάφη),
   adsbdb.com (διαδρομή ανά callsign), EMSC seismicportal.eu (σεισμοί). Καμία δεν θέλει κλειδί. */
(function(){
"use strict";
function cfg(name, def){ var o = CONFIG[name] || {}, r = {}; for(var k in def) r[k] = (k in o) ? o[k] : def[k]; return r; }

var GARDEN = cfg("GARDEN", {
  kc: 0.8,              // φυτικός συντελεστής (γκαζόν/κήπος)
  days: 3,              // πόσες μέρες πίσω μετράει το ισοζύγιο
  rainEff: 0.8,         // ποσοστό της βροχής που φτάνει στις ρίζες
  rainMinMm: 2,         // βροχές κάτω από αυτό δεν μετράνε
  rainProb: 60, rainMm: 3,   // "έρχεται βροχή": πιθανότητα > 60% ΚΑΙ πάνω από 3 mm στις επόμενες 24 ώρες
  minDeficitMm: 3,      // έλλειμμα κάτω από αυτό: δεν χρειάζεται πότισμα
  soilWet: 0.30,        // εδαφική υγρασία 3-9 cm (m³/m³) από την οποία θεωρείται υγρό
  windMax: 20,          // km/h, πάνω από αυτό το νερό χάνεται
  morning: ["06:00", "09:00"], evening: ["18:00", "21:00"],
  frostC: 2
});
var RUN = cfg("RUN", {
  from: "06:00", to: "21:00", hours: 12,
  idealMin: 8, idealMax: 15, perDegree: 3,   // ποινή ανά βαθμό έξω από το ιδανικό
  hot: 25, hotPer: 5, cold: 3, coldPer: 4,   // επιπλέον ποινή πάνω από 25° / κάτω από 3°
  dew: 18, dewPer: 6,                        // σημείο δρόσου
  wind: 25, windPer: 1.5,                    // km/h
  rain: 40, rainPer: 0.8,                    // πιθανότητα βροχής %
  uv: 6, uvPer: 6,
  aqi: 60, aqiPer: 1,                        // European AQI
  darkPenalty: 10                            // ώρες χωρίς φως μέρας
});
var PLANES = cfg("PLANES", {
  radiusKm: 15, everySec: 90,
  dailyCap: 400,        // κλήσεις adsb.lol την ημέρα (όριο τους: 500). Μετά: OpenSky
  airport: { name: "ΑΘΗ", lat: 37.9364, lon: 23.9445, km: 25, ft: 6000, vs: 300 }
});
var QUAKES = cfg("QUAKES", {
  maxRadiusDeg: 3, minMag: 3.0, days: 7, everyMin: 5, show: 5,
  bannerMag: 4.0, bannerKm: 150,      // banner σε όλες τις οθόνες
  telegramMag: 4.5, telegramKm: 100,  // και μήνυμα στο Telegram
  windowMin: 60                       // μόνο για σεισμούς της τελευταίας ώρας
});
var HOME = CONFIG.LOCATION, root = document.documentElement;

/* ---------- στυλ ---------- */
var css =
  "html.s4 main{display:none}" +
  "#screen4{display:none;flex:1;min-height:0;gap:.875rem;grid-template-columns:1fr 1.12fr;grid-template-rows:1fr 1fr}" +
  "html.s4 #screen4{display:grid}" +
  "#screen4 .body{display:flex;flex-direction:column;min-height:0}" +
  ".o-verdict{font-size:1.875rem;font-weight:700;letter-spacing:-.015em;line-height:1.1}" +
  ".o-why{font-size:1.0625rem;color:var(--text-2);line-height:1.35;margin-top:.375rem}" +
  ".o-line{font-size:1.125rem;line-height:1.35;margin-top:.5rem}" +
  ".o-line b{font-weight:600}" +
  ".o-note{font-size:.875rem;color:var(--text-3);margin-top:auto;padding-top:.375rem}" +
  ".o-alert{display:flex;align-items:center;gap:.5rem;font-size:1.0625rem;font-weight:600;color:var(--warn);margin-bottom:.375rem}" +
  ".o-wrap{display:flex;gap:1.25rem;min-height:0;flex:1}" +
  ".o-main{flex:1;min-width:0}" +
  /* γράφημα ποτίσματος */
  ".g-chart{flex:0 0 12.5rem;display:flex;flex-direction:column;justify-content:flex-end}" +
  ".g-chart svg{width:100%;height:auto;display:block}" +
  ".g-chart text{fill:var(--text-3);font-size:18px}" +
  ".g-chart text.td{fill:var(--text);font-weight:700}" +
  ".o-leg{display:flex;flex-wrap:wrap;gap:.25rem .875rem;font-size:.875rem;color:var(--text-2);margin-top:.25rem}" +
  ".o-leg i{display:inline-block;width:.625rem;height:.625rem;border-radius:2px;margin-right:.3125rem;vertical-align:.0625rem}" +
  /* τρέξιμο */
  ".r-top{display:flex;align-items:baseline;gap:.75rem}" +
  ".r-score{font-size:3.25rem;font-weight:600;letter-spacing:-.04em;line-height:.95;font-variant-numeric:tabular-nums}" +
  ".r-word{display:flex;align-items:center;gap:.5rem;font-size:1.5rem;font-weight:700}" +
  ".r-now{font-size:1rem;color:var(--text-2);margin-left:auto;text-align:right;line-height:1.3}" +
  ".r-strip{display:flex;align-items:flex-end;gap:.25rem;height:4.25rem;margin-top:.625rem}" +
  ".r-strip div{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:.1875rem}" +
  ".r-strip i{display:block;width:100%;border-radius:3px 3px 1px 1px;background:var(--fill-2)}" +
  ".r-strip i.ok{background:var(--ok)} .r-strip i.warn{background:var(--warn)} .r-strip i.bad{background:var(--bad)}" +
  ".r-strip div.best i{outline:2px solid var(--text);outline-offset:1px}" +
  ".r-strip span{font-size:.8125rem;color:var(--text-3);font-variant-numeric:tabular-nums;height:1rem}" +
  ".r-strip div.best span{color:var(--text);font-weight:700}" +
  "#run-pill{display:none} body.morning #run-pill.on{display:inline-flex}" +
  /* αεροπλάνα */
  ".pl-wrap{display:flex;gap:1rem;flex:1;min-height:0}" +
  ".pl-radar{flex:0 0 auto;height:100%;max-width:45%;aspect-ratio:1/1}" +
  ".pl-radar .ring{fill:none;stroke:var(--hairline);stroke-width:1}" +
  ".pl-radar .rl{fill:var(--text-3);font-size:13px}" +
  ".pl-radar .home{fill:var(--text)}" +
  ".pl-radar .apt{fill:none;stroke:var(--text-2);stroke-width:1.5}" +
  ".pl-radar .pl{fill:var(--text)} .pl-radar .pl.land,.pl-radar .pl.dep{fill:var(--accent)}" +
  ".pl-radar .cs{fill:var(--text-2);font-size:13px;font-weight:600}" +
  ".pl-list{flex:1;min-width:0;overflow:hidden}" +
  ".pl-row{padding:.4375rem 0;border-top:1px solid var(--hairline);line-height:1.3}" +
  ".pl-row:first-child{border-top:0;padding-top:0}" +
  ".pl-l1{display:flex;align-items:baseline;gap:.5rem;font-size:1.125rem;white-space:nowrap}" +
  ".pl-l1 b{font-weight:700} .pl-l1 .al{color:var(--text-2);overflow:hidden;text-overflow:ellipsis;min-width:0}" +
  ".pl-l1 .km{margin-left:auto;font-weight:600;font-variant-numeric:tabular-nums}" +
  ".pl-l2{font-size:.9375rem;color:var(--text-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}" +
  ".pl-ph{font-weight:700;color:var(--accent);margin-right:.25rem}" +
  /* σεισμοί */
  ".q-row{display:flex;align-items:center;gap:.875rem;padding:.4375rem 0;border-top:1px solid var(--hairline)}" +
  ".q-row:first-child{border-top:0;padding-top:0}" +
  ".q-mag{flex:0 0 3.5rem;height:2.5rem;border-radius:.625rem;display:flex;align-items:center;justify-content:center;" +
    "font-size:1.375rem;font-weight:700;font-variant-numeric:tabular-nums;background:var(--surface-2);color:var(--text)}" +
  ".q-mag.m4{background:var(--warn);color:#14110a} .q-mag.m5{background:var(--bad);color:#160a0c}" +
  ".q-main{flex:1;min-width:0;line-height:1.3}" +
  ".q-reg{font-size:1.125rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
  ".q-sub{font-size:.9375rem;color:var(--text-2)}" +
  ".q-ago{font-size:1rem;color:var(--text-2);text-align:right;white-space:nowrap}" +
  ".q-calm{display:flex;align-items:center;gap:.625rem;font-size:1.125rem;color:var(--text-2)}" +
  /* banner σεισμού: πάνω από όλες τις οθόνες, και τη νυχτερινή */
  "#eq-banner{position:fixed;top:.875rem;left:50%;transform:translateX(-50%);z-index:8;display:none;align-items:center;gap:1rem;" +
    "max-width:calc(100% - 2.5rem);padding:.625rem .625rem .625rem 1.25rem;border-radius:999px;background:#2a2112;border:1px solid rgba(247,195,80,.55);" +
    "color:var(--text);font-size:1.125rem;line-height:1.3;box-shadow:0 .5rem 1.5rem rgba(0,0,0,.4)}" +
  "#eq-banner.on{display:flex}" +
  "#eq-banner b{color:var(--warn)}" +
  "#eq-banner button{min-height:2.75rem;padding:0 1.125rem;border:0;border-radius:999px;background:var(--fill-2);color:var(--text);font:inherit;font-weight:600;cursor:pointer}" +
  "#eq-banner button:active{background:var(--surface-press)}" +
  "body.night #eq-banner{background:#111;border-color:#3a3320;color:#9aa3ae} body.night #eq-banner b{color:#b9973f}";
var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

/* ---------- βοηθητικά ---------- */
var R_ = Math.PI / 180;
function distKm(a1, o1, a2, o2){
  var dA = (a2 - a1) * R_, dO = (o2 - o1) * R_;
  var h = Math.sin(dA / 2) * Math.sin(dA / 2) + Math.cos(a1 * R_) * Math.cos(a2 * R_) * Math.sin(dO / 2) * Math.sin(dO / 2);
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
function bearing(a1, o1, a2, o2){
  var y = Math.sin((o2 - o1) * R_) * Math.cos(a2 * R_),
      x = Math.cos(a1 * R_) * Math.sin(a2 * R_) - Math.sin(a1 * R_) * Math.cos(a2 * R_) * Math.cos((o2 - o1) * R_);
  return (Math.atan2(y, x) / R_ + 360) % 360;
}
var COMPASS = ["Β", "ΒΑ", "Α", "ΝΑ", "Ν", "ΝΔ", "Δ", "ΒΔ"];
function compass(deg){ return COMPASS[Math.round(deg / 45) % 8]; }
function lt(s){ var p = s.split(/[-T:]/); return new Date(+p[0], p[1] - 1, +p[2], +p[3] || 0, +p[4] || 0); }
function ymd(d){ return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function fmt1(x){ return String(Math.round(x * 10) / 10).replace(".", ","); }
function thou(n){ return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
function dayWord(d){
  var a = new Date(); a.setHours(0, 0, 0, 0); var b = new Date(d); b.setHours(0, 0, 0, 0);
  var n = Math.round((b - a) / 86400000);
  return n === 0 ? "σήμερα" : n === 1 ? "αύριο" : n === -1 ? "χθες" : DAYS[b.getDay()];
}
function inHM(d, range){ var m = d.getHours() * 60 + d.getMinutes(); return m >= toMin(range[0]) && m < toMin(range[1]); }
function agoText(t){
  var m = Math.round((Date.now() - t) / 60000);
  if(m < 1) return "μόλις τώρα";
  if(m < 60) return "πριν " + m + (m === 1 ? " λεπτό" : " λεπτά");
  var h = Math.round(m / 60);
  if(h < 24 && dayWord(new Date(t)) === "σήμερα") return "πριν " + h + (h === 1 ? " ώρα" : " ώρες");
  return dayWord(new Date(t)).replace(/^./, function(c){ return c.toUpperCase(); }) + " " + hm(new Date(t));
}
function isNightNow(){ return document.body.className.indexOf("night") >= 0 && !/\bawake\b/.test(root.className); }
function onScreen4(){ return /\bs4\b/.test(root.className); }
function tgSend(text){
  if(DEMO || typeof TELEGRAM === "undefined" || !TELEGRAM.botToken || !TELEGRAM.chatId) return Promise.resolve(false);
  return fetchT("https://api.telegram.org/bot" + TELEGRAM.botToken + "/sendMessage?chat_id=" + encodeURIComponent(TELEGRAM.chatId) +
    "&text=" + encodeURIComponent(text), {}, 15000).then(function(){ return true; }, function(){ return false; });
}
function errBox(id, what){ $(id).innerHTML = '<div class="err">' + esc(what) + ' Ξαναδοκιμάζει μόνο του σε λίγα λεπτά.</div>'; }

/* =====================================================================
   1+2. Καιρός για πότισμα και τρέξιμο (μία κλήση Open-Meteo + ποιότητα αέρα ανά ώρα)
   ===================================================================== */
var WX = null, AQ = {}, WXT = 0;
function loadWx(){
  if(DEMO){ demoWx(); drawGarden(); drawRun(); return Promise.resolve(); }
  var q = "latitude=" + HOME.lat + "&longitude=" + HOME.lon + "&timezone=Europe%2FAthens";
  var u1 = "https://api.open-meteo.com/v1/forecast?" + q + "&past_days=3&forecast_days=3" +
    "&daily=et0_fao_evapotranspiration,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,temperature_2m_min" +
    "&hourly=soil_moisture_0_to_1cm,soil_moisture_1_to_3cm,soil_moisture_3_to_9cm,temperature_2m,apparent_temperature," +
    "dew_point_2m,wind_speed_10m,precipitation_probability,precipitation,uv_index,is_day";
  var u2 = "https://air-quality-api.open-meteo.com/v1/air-quality?" + q + "&hourly=european_aqi,pm2_5&forecast_days=2";
  return Promise.all([
    fetchT(u1, {}, 20000).then(function(r){ return r.json(); }),
    fetchT(u2, {}, 20000).then(function(r){ return r.json(); }).catch(function(){ return null; })
  ]).then(function(a){
    if(!a[0] || !a[0].hourly || !a[0].daily) throw new Error("κενή απάντηση");
    WX = a[0]; WXT = Date.now(); AQ = aqMap(a[1]);
    store("outdoor", { wx: WX, aq: a[1] });
  }).catch(function(){
    var c = load("outdoor");
    if(c && c.v && (!WX || c.t > WXT)){ WX = c.v.wx; AQ = aqMap(c.v.aq); WXT = c.t; }
  }).then(function(){
    if(!WX){ errBox("g-body", "Ο καιρός δεν φορτώθηκε."); errBox("run-body", "Ο καιρός δεν φορτώθηκε."); return; }
    drawGarden(); drawRun();
  });
}
function aqMap(j){
  var m = {}; if(!j || !j.hourly) return m;
  j.hourly.time.forEach(function(t, i){ m[t] = { aqi: j.hourly.european_aqi[i], pm: j.hourly.pm2_5[i] }; });
  return m;
}
function hours(){
  var h = WX.hourly;
  return h.time.map(function(t, i){
    return { t: t, d: lt(t), temp: h.temperature_2m[i], app: h.apparent_temperature[i], dew: h.dew_point_2m[i],
      wind: h.wind_speed_10m[i], pp: h.precipitation_probability[i] || 0, pr: h.precipitation[i] || 0,
      uv: h.uv_index[i] || 0, day: h.is_day[i], s0: h.soil_moisture_0_to_1cm[i], s3: h.soil_moisture_3_to_9cm[i], aq: AQ[t] || null };
  });
}
function nowIdx(hs){
  var c = new Date(); c.setMinutes(0, 0, 0);
  for(var i = 0; i < hs.length; i++) if(hs[i].d.getTime() >= c.getTime()) return i;
  return hs.length - 1;
}

/* ---------- 1. Ποτίζω σήμερα; ---------- */
function gardenCalc(){
  var D = WX.daily, ti = D.time.indexOf(ymd(new Date())); if(ti < 0) ti = Math.min(GARDEN.days, D.time.length - 1);
  var et = 0, rain = 0, rawRain = 0;
  for(var i = Math.max(0, ti - GARDEN.days); i < ti; i++){
    et += (D.et0_fao_evapotranspiration[i] || 0) * GARDEN.kc;
    var p = D.precipitation_sum[i] || 0; rawRain += p;
    if(p >= GARDEN.rainMinMm) rain += p * GARDEN.rainEff;
  }
  var deficit = Math.max(0, et - rain);
  var hs = hours(), k = nowIdx(hs), pMax = 0, pSum = 0, rainAt = null;
  for(var j = k; j < k + 24 && j < hs.length; j++){
    pMax = Math.max(pMax, hs[j].pp); pSum += hs[j].pr;
    if(rainAt === null && hs[j].pr >= 0.5) rainAt = hs[j].d;
  }
  var soil = hs[k] ? hs[k].s3 : null;
  var g = { ti: ti, D: D, deficit: deficit, et: et, rawRain: rawRain, soil: soil, pMax: pMax, pSum: pSum, rainAt: rainAt, yes: false };
  var past = "Τις τελευταίες " + GARDEN.days + " μέρες εξατμίστηκαν περίπου " + fmt1(et) + " mm" +
    (rawRain >= 0.1 ? " και έβρεξε " + fmt1(rawRain) + " mm." : " και δεν έβρεξε.");
  if(pMax > GARDEN.rainProb && pSum > GARDEN.rainMm){
    var tom = rainAt && dayWord(rainAt) === "αύριο";
    g.verdict = tom ? "Όχι, βρέχει αύριο" : "Όχι, έρχεται βροχή";
    g.why = "Περίπου " + fmt1(pSum) + " mm τις επόμενες 24 ώρες, πιθανότητα " + Math.round(pMax) + "%.";
    if(rainAt) g.when = "Η βροχή ξεκινά <b>" + dayWord(rainAt) + " γύρω στις " + hm(rainAt) + "</b>.";
  } else if(deficit < GARDEN.minDeficitMm || (soil != null && soil >= GARDEN.soilWet)){
    g.verdict = "Όχι, το έδαφος έχει υγρασία";
    g.why = past + (soil != null ? " Υγρασία εδάφους 3-9 cm: " + Math.round(soil * 100) + "%." : "");
  } else {
    g.yes = true;
    g.verdict = "Ναι, περίπου " + Math.round(deficit) + " mm";
    g.why = "Δηλαδή " + Math.round(deficit) + " λίτρα ανά τετραγωνικό μέτρο. " + past;
    var b = bestWater(hs, k);
    g.best = b;
    g.when = b ? "Καλύτερη ώρα: <b>" + (b.d <= new Date() ? "τώρα" : dayWord(b.d) + " " + hm(b.d)) + "</b>, άνεμος " + Math.round(b.wind) + " km/h."
               : "Φυσάει πάνω από " + GARDEN.windMax + " km/h σε όλες τις κατάλληλες ώρες. Αν γίνεται, περίμενε.";
  }
  // παγετός: σήμερα ή αύριο
  for(var f = ti; f <= ti + 1 && f < D.time.length; f++){
    if(D.temperature_2m_min[f] != null && D.temperature_2m_min[f] <= GARDEN.frostC){
      g.frost = "Κίνδυνος παγετού " + dayWord(lt(D.time[f])) + ": έως " + Math.round(D.temperature_2m_min[f]) + "°. Σκέπασε τα ευαίσθητα φυτά.";
      break;
    }
  }
  return g;
}
// νωρίς το πρωί ή αργά το απόγευμα, χωρίς δυνατό άνεμο, μέσα στις επόμενες 36 ώρες
function bestWater(hs, k){
  for(var j = k; j < k + 36 && j < hs.length; j++){
    var h = hs[j];
    if((inHM(h.d, GARDEN.morning) || inHM(h.d, GARDEN.evening)) && h.wind <= GARDEN.windMax) return h;
  }
  return null;
}
function gChart(g){
  var D = g.D, idx = [];
  for(var i = g.ti - 3; i <= g.ti + 2; i++) if(i >= 0 && i < D.time.length) idx.push(i);
  var mx = 4;
  idx.forEach(function(i){ mx = Math.max(mx, D.et0_fao_evapotranspiration[i] || 0, D.precipitation_sum[i] || 0); });
  var W = idx.length * 42, base = 70, sc = 62 / mx, s = "";
  idx.forEach(function(i, n){
    var x = n * 42 + 6, e = (D.et0_fao_evapotranspiration[i] || 0) * sc, r = (D.precipitation_sum[i] || 0) * sc,
        fut = i > g.ti, td = i === g.ti, op = fut ? ' opacity=".45"' : "";
    s += '<rect x="' + x + '" y="' + (base - Math.max(e, 1.5)) + '" width="13" height="' + Math.max(e, 1.5) + '" rx="2" style="fill:var(--chart-a)"' + op + '/>';
    s += '<rect x="' + (x + 15) + '" y="' + (base - Math.max(r, 1.5)) + '" width="13" height="' + Math.max(r, 1.5) + '" rx="2" style="fill:var(--accent)"' + op + '/>';
    s += '<text x="' + (x + 14) + '" y="' + (base + 18) + '" text-anchor="middle"' + (td ? ' class="td"' : "") + '>' +
      (td ? "Σήμ" : DAYS_S[lt(D.time[i]).getDay()]) + '</text>';
  });
  var lab = idx.map(function(i){ return DAYS_S[lt(D.time[i]).getDay()] + " εξάτμιση " + fmt1(D.et0_fao_evapotranspiration[i] || 0) + " mm, βροχή " + fmt1(D.precipitation_sum[i] || 0) + " mm"; }).join("; ");
  return '<figure class="g-chart"><svg viewBox="0 0 ' + W + ' 92" role="img" aria-label="' + esc(lab) + '">' +
    '<line x1="0" x2="' + W + '" y1="' + (base + .5) + '" y2="' + (base + .5) + '" style="stroke:var(--hairline)"/>' + s + '</svg>' +
    '<figcaption class="o-leg"><span><i style="background:var(--chart-a)"></i>Εξάτμιση</span><span><i style="background:var(--accent)"></i>Βροχή</span>' +
    '<span>έως ' + fmt1(mx) + ' mm · αχνά: πρόγνωση</span></figcaption></figure>';
}
function drawGarden(){
  if(!WX || !$("g-body")) return;
  var g = gardenCalc();
  $("g-upd").textContent = "ενημ. " + hm(new Date(WXT || Date.now()));
  $("g-body").innerHTML =
    (g.frost ? '<div class="o-alert"><i class="dot warn"></i>' + esc(g.frost) + '</div>' : "") +
    '<div class="o-wrap"><div class="o-main"><div class="o-verdict">' + esc(g.verdict) + '</div>' +
    '<div class="o-why">' + esc(g.why) + '</div>' + (g.when ? '<div class="o-line">' + g.when + '</div>' : "") + '</div>' +
    gChart(g) + '</div>' +
    '<div class="o-note">Εκτίμηση από μοντέλο καιρού (Open-Meteo), όχι μέτρηση στον κήπο.</div>';
}

/* ---------- 2. Συνθήκες για τρέξιμο ---------- */
function runScore(h){
  var p = 0, why = {}, t = h.temp;
  function add(k, v){ if(v > 0){ p += v; why[k] = (why[k] || 0) + v; } }
  if(t < RUN.idealMin) add("cold", (RUN.idealMin - t) * RUN.perDegree);
  if(t > RUN.idealMax) add("hot", (t - RUN.idealMax) * RUN.perDegree);
  if(t > RUN.hot) add("hot", (t - RUN.hot) * RUN.hotPer);
  if(t < RUN.cold) add("cold", (RUN.cold - t) * RUN.coldPer);
  if(h.dew > RUN.dew) add("dew", (h.dew - RUN.dew) * RUN.dewPer);
  if(h.wind > RUN.wind) add("wind", (h.wind - RUN.wind) * RUN.windPer);
  if(h.pp > RUN.rain) add("rain", (h.pp - RUN.rain) * RUN.rainPer);
  if(h.uv > RUN.uv) add("uv", (h.uv - RUN.uv) * RUN.uvPer);
  if(h.aq && h.aq.aqi > RUN.aqi) add("aqi", (h.aq.aqi - RUN.aqi) * RUN.aqiPer);
  if(!h.day) add("dark", RUN.darkPenalty);
  return { s: Math.max(0, Math.min(100, Math.round(100 - p))), why: why };
}
function level(s){ return s >= 80 ? ["Ιδανικές", "ok"] : s >= 60 ? ["Καλές", "ok"] : s >= 40 ? ["Μέτριες", "warn"] : ["Δύσκολες", "bad"]; }
var LATER = { hot: "ανεβαίνει η ζέστη", cold: "πέφτει η θερμοκρασία", dew: "ανεβαίνει η υγρασία", wind: "δυναμώνει ο αέρας",
  rain: "μπορεί να βρέξει", uv: "δυναμώνει ο ήλιος", aqi: "χειροτερεύει ο αέρας", dark: "νυχτώνει" };
var NOW = { hot: "κάνει ζέστη", cold: "κάνει κρύο", dew: "έχει πολλή υγρασία", wind: "φυσάει", rain: "μπορεί να βρέξει",
  uv: "ο ήλιος καίει", aqi: "ο αέρας είναι επιβαρυμένος", dark: "είναι ακόμα σκοτάδι" };
function mainDiff(a, b){   // ο παράγοντας που χειροτερεύει περισσότερο από το a στο b
  var best = null, bv = 0;
  for(var k in b.why){ var v = b.why[k] - (a.why[k] || 0); if(v > bv){ bv = v; best = k; } }
  return best;
}
function runCalc(){
  var hs = hours(), k = nowIdx(hs), rw = [RUN.from, RUN.to], c = [];
  for(var j = k; j < k + RUN.hours && j < hs.length; j++) if(inHM(hs[j].d, rw)) c.push(hs[j]);
  var tomorrow = false;
  if(!c.length){   // νύχτα: οι ώρες της επόμενης μέρας
    tomorrow = true;
    for(j = k; j < hs.length && c.length < RUN.hours; j++) if(inHM(hs[j].d, rw) && dayWord(hs[j].d) !== "σήμερα") c.push(hs[j]);
  }
  c.forEach(function(h){ var r = runScore(h); h.s = r.s; h.why = r.why; });
  var cur = hs[k]; var cr = runScore(cur); cur.s = cr.s; cur.why = cr.why;
  var inside = inHM(cur.d, rw);
  var best = null; c.forEach(function(h){ if(!best || h.s > best.s) best = h; });
  var tip = "";
  if(best){
    var all = c.every(function(h){ return h.s >= 80; });
    var bi = c.indexOf(best), drop = null;
    for(var n = bi + 1; n < c.length; n++) if(c[n].s <= best.s - 15){ drop = c[n]; break; }
    if(all) tip = "Ιδανικές συνθήκες ως τις " + hm(new Date(c[c.length - 1].d.getTime() + 3600000)) + ".";
    else if(best.s < 40){ var f = mainDiff({ why: {} }, best); tip = "Δύσκολη μέρα για τρέξιμο" + (f ? ": " + NOW[f] + "." : "."); }
    else if(inside && best.d.getTime() > cur.d.getTime() && best.s - cur.s >= 10){
      var f2 = mainDiff(best, cur); tip = "Περίμενε ως τις " + hm(best.d) + (f2 ? ", τώρα " + NOW[f2] : "") + ".";
    } else if(drop){
      var f3 = mainDiff(best, drop); tip = "Τρέξε πριν τις " + hm(drop.d) + (f3 ? ", μετά " + LATER[f3] : "") + ".";
    }
  }
  return { cur: cur, inside: inside, c: c, best: best, tomorrow: tomorrow, tip: tip };
}
function drawRun(){
  if(!WX || !$("run-body")) return;
  var r = runCalc(), cur = r.cur, lv = level(cur.s), aq = cur.aq;
  var bestTxt = r.best ? (r.tomorrow ? "αύριο " + hm(r.best.d) : r.best.d <= new Date() ? "τώρα" : "σήμερα " + hm(r.best.d)) : "";
  var top = r.inside
    ? '<div class="r-top"><span class="r-score">' + cur.s + '</span><span class="r-word"><i class="dot ' + lv[1] + '"></i>' + lv[0] + '</span>'
    : '<div class="r-top"><span class="r-word">Εκτός ωρών</span>';
  top += '<span class="r-now">' + Math.round(cur.temp) + '° (αίσθηση ' + Math.round(cur.app) + '°)<br>δρόσος ' + Math.round(cur.dew) + '° · ' +
    'άνεμος ' + Math.round(cur.wind) + ' km/h' + (aq && aq.aqi != null ? ' · AQI ' + Math.round(aq.aqi) : '') + '</span></div>';
  var strip = '<div class="r-strip" aria-hidden="true">' + r.c.map(function(h){
    var l = level(h.s), b = h === r.best;
    return '<div' + (b ? ' class="best"' : '') + '><i class="' + l[1] + '" style="height:' + Math.max(6, h.s * .5) + '%"></i><span>' + h.d.getHours() + '</span></div>';
  }).join("") + '</div>';
  $("run-upd").textContent = r.inside ? "τώρα, 0 έως 100" : RUN.from + " έως " + RUN.to;
  $("run-body").innerHTML = top +
    (r.best ? '<div class="o-line">Καλύτερη ώρα: <b>' + esc(bestTxt) + '</b> · ' + r.best.s + '/100' + '</div>' : '') +
    (r.tip ? '<div class="o-why">' + esc(r.tip) + '</div>' : '') + strip;
  var pill = $("run-pill");
  if(pill){
    if(r.best && !r.tomorrow){ pill.className = "pill on"; pill.textContent = "🏃 " + (r.best.d <= new Date() ? "Τρέξιμο τώρα" : "Τρέξιμο " + hm(r.best.d)); pill.setAttribute("aria-label", "Καλύτερη ώρα για τρέξιμο " + bestTxt + ", βαθμός " + r.best.s); }
    else pill.className = "pill";
  }
}

/* =====================================================================
   3. Αεροπλάνα από πάνω μου
   adsb.lol: δωρεάν, χωρίς κλειδί, όριο 500 κλήσεις/24ώρες ανά IP. Εφεδρεία: OpenSky ανώνυμα.
   Ζητάμε μόνο όταν φαίνεται η οθόνη 4 και όχι τη νύχτα.
   ===================================================================== */
var AIRLINES = { AEE: "Aegean", OAL: "Olympic", SEH: "Sky Express", RYR: "Ryanair", EZY: "easyJet", EJU: "easyJet", EZS: "easyJet",
  WZZ: "Wizz Air", WMT: "Wizz Air", WUK: "Wizz Air", VLG: "Vueling", VOE: "Volotea", TRA: "Transavia", TVF: "Transavia", EWG: "Eurowings",
  DLH: "Lufthansa", AFR: "Air France", KLM: "KLM", BAW: "British Airways", SWR: "Swiss", AUA: "Austrian", ITY: "ITA Airways",
  IBE: "Iberia", TAP: "TAP", SAS: "SAS", FIN: "Finnair", LOT: "LOT", BEL: "Brussels", CFG: "Condor", EXS: "Jet2",
  TOM: "TUI", TFL: "TUI", JAF: "TUI", THY: "Turkish", PGT: "Pegasus", UAE: "Emirates", QTR: "Qatar", ETD: "Etihad",
  FDB: "flydubai", ABY: "Air Arabia", GFA: "Gulf Air", SVA: "Saudia", RJA: "Royal Jordanian", MEA: "MEA", MSR: "EgyptAir",
  ELY: "El Al", ISR: "Israir", AIZ: "Arkia", CYP: "Cyprus Airways", TUS: "TUS Airways", ROT: "Tarom", AHY: "Azerbaijan",
  DAL: "Delta", UAL: "United", AAL: "American", ACA: "Air Canada", CSN: "China Southern", CCA: "Air China", SIA: "Singapore",
  HAF: "Πολεμική Αεροπορία", MMF: "Πολεμική Αεροπορία", NJE: "NetJets", GAF: "Luftwaffe" };
var PL = { ac: [], ground: 0, src: "", t: 0 }, plTimer = null, plBusy = false;
var ROUTES = (load("pl_routes") || {}).v || {};
function fromAdsb(b){
  var ft = typeof b.alt_baro === "number" ? b.alt_baro : (typeof b.alt_geom === "number" ? b.alt_geom : null);
  return { cs: (b.flight || "").trim(), reg: b.r || "", type: b.t || "", lat: b.lat, lon: b.lon, ground: b.alt_baro === "ground",
    ft: ft, kt: b.gs, track: b.track != null ? b.track : b.true_heading, vs: b.baro_rate != null ? b.baro_rate : b.geom_rate };
}
function fromSky(s){
  return { cs: (s[1] || "").trim(), reg: "", type: "", lon: s[5], lat: s[6], ground: !!s[8],
    ft: s[7] != null ? s[7] * 3.28084 : (s[13] != null ? s[13] * 3.28084 : null), kt: s[9] != null ? s[9] * 1.94384 : null,
    track: s[10], vs: s[11] != null ? s[11] * 196.85 : null };
}
function quota(){ var q = (load("pl_quota") || {}).v || {}, d = ymd(new Date()); if(q.d !== d) q = { d: d, n: 0 }; return q; }
function fetchPlanes(){
  if(DEMO) return Promise.resolve(demoPlanes());
  var q = quota(), nm = Math.ceil(PLANES.radiusKm / 1.852) + 1;
  function lol(){
    q.n++; store("pl_quota", q);
    return fetchT("https://api.adsb.lol/v2/point/" + HOME.lat + "/" + HOME.lon + "/" + nm, {}, 15000).then(function(r){ return r.json(); })
      .then(function(j){ return { src: "adsb.lol", ac: (j.ac || []).map(fromAdsb) }; });
  }
  function sky(){
    var dA = PLANES.radiusKm / 111, dO = PLANES.radiusKm / (111 * Math.cos(HOME.lat * R_));
    return fetchT("https://opensky-network.org/api/states/all?lamin=" + (HOME.lat - dA).toFixed(3) + "&lomin=" + (HOME.lon - dO).toFixed(3) +
      "&lamax=" + (HOME.lat + dA).toFixed(3) + "&lomax=" + (HOME.lon + dO).toFixed(3), {}, 15000).then(function(r){ return r.json(); })
      .then(function(j){ return { src: "OpenSky", ac: (j.states || []).map(fromSky) }; });
  }
  return (q.n < PLANES.dailyCap ? lol().catch(sky) : sky()).then(prep);
}
function prep(r){
  var A = PLANES.airport, ground = 0, ac = [];
  r.ac.forEach(function(p){
    if(p.lat == null || p.lon == null) return;
    p.km = distKm(HOME.lat, HOME.lon, p.lat, p.lon); if(p.km > PLANES.radiusKm) return;
    if(p.ground){ ground++; return; }
    p.dir = compass(bearing(HOME.lat, HOME.lon, p.lat, p.lon));
    var dA = distKm(A.lat, A.lon, p.lat, p.lon);
    p.phase = (p.ft != null && p.ft < A.ft && dA < A.km && p.vs != null) ? (p.vs <= -A.vs ? "land" : p.vs >= A.vs ? "dep" : "") : "";
    var m = /^([A-Z]{3})\d/.exec(p.cs); p.al = m && AIRLINES[m[1]] || "";
    ac.push(p);
  });
  ac.sort(function(a, b){ return a.km - b.km; });
  PL = { ac: ac, ground: ground, src: r.src, t: Date.now() };
  return PL;
}
// προέλευση/προορισμός από adsbdb.com, με cache 3 ημερών ανά callsign (και για τα "άγνωστα")
function routesFor(list){
  if(DEMO) return Promise.resolve();
  var need = list.filter(function(p){ var c = ROUTES[p.cs]; return /^[A-Z]{3}\d/.test(p.cs) && (!c || Date.now() - c.t > 3 * 86400000); }).slice(0, 5);
  return Promise.all(need.map(function(p){
    return fetchT("https://api.adsbdb.com/v0/callsign/" + encodeURIComponent(p.cs), {}, 12000).then(function(r){ return r.json(); }, function(e){
      return /HTTP 404/.test(e.message) ? {} : null;
    }).then(function(j){
      if(j === null) return;
      var f = j && j.response && j.response.flightroute;
      ROUTES[p.cs] = { t: Date.now(), r: f ? { o: f.origin.iata_code, oc: f.origin.municipality, d: f.destination.iata_code, dc: f.destination.municipality,
        al: f.airline && f.airline.name } : null };
    });
  })).then(function(){
    var keys = Object.keys(ROUTES); if(keys.length > 300) keys.sort(function(a, b){ return ROUTES[a].t - ROUTES[b].t; }).slice(0, keys.length - 300).forEach(function(k){ delete ROUTES[k]; });
    store("pl_routes", ROUTES);
  });
}
function routeTxt(p){
  var c = ROUTES[p.cs], r = c && c.r; if(!r) return "";
  var city = r.o === "ATH" ? r.dc : r.d === "ATH" ? r.oc : r.oc + " → " + r.dc;
  return r.o + " → " + r.d + (city ? " (" + city + ")" : "");
}
var PHASE = { land: "▼ Προσγειώνεται", dep: "▲ Απογειώνεται" };
function radar(ac){
  var R = PLANES.radiusKm, A = PLANES.airport, s = "";
  function xy(lat, lon){ var d = distKm(HOME.lat, HOME.lon, lat, lon) / R * 100, b = bearing(HOME.lat, HOME.lon, lat, lon) * R_; return { x: d * Math.sin(b), y: -d * Math.cos(b) }; }
  for(var k = 5; k <= R; k += 5){ var rr = k / R * 100; s += '<circle class="ring" r="' + rr.toFixed(1) + '"/><text class="rl" x="3" y="' + (-rr + 13).toFixed(1) + '">' + k + '</text>'; }
  s += '<text class="rl" x="-112" y="-98">Β ↑</text><text class="rl" x="112" y="112" text-anchor="end">km</text>';
  var a = xy(A.lat, A.lon);
  if(Math.abs(a.x) < 105 && Math.abs(a.y) < 105) s += '<rect class="apt" x="' + (a.x - 5).toFixed(1) + '" y="' + (a.y - 5).toFixed(1) + '" width="10" height="10" rx="2"/>' +
    '<text class="rl" text-anchor="middle" x="' + a.x.toFixed(1) + '" y="' + (a.y + 20).toFixed(1) + '">' + esc(A.name) + '</text>';
  s += '<circle class="home" r="4.5"/>';
  ac.forEach(function(p, i){
    var q = xy(p.lat, p.lon);
    s += '<g transform="translate(' + q.x.toFixed(1) + ',' + q.y.toFixed(1) + ') rotate(' + Math.round(p.track || 0) + ')"><path class="pl ' + p.phase + '" d="M0,-10 L7,8 L0,4 L-7,8Z"/></g>';
    if(i < 4 && p.cs) s += '<text class="cs" x="' + (q.x + 10).toFixed(1) + '" y="' + (q.y + 4).toFixed(1) + '">' + esc(p.cs) + '</text>';
  });
  return '<svg class="pl-radar" viewBox="-115 -112 230 230" role="img" aria-label="Σχηματικός χάρτης με το σπίτι στο κέντρο και κύκλους ανά 5 km. ' + ac.length + ' αεροσκάφη.">' + s + '</svg>';
}
function drawPlanes(){
  if(!$("pl-body")) return;
  var ac = PL.ac;
  $("pl-upd").textContent = PL.t ? PL.src + " · " + hm(new Date(PL.t)) : "";
  $("pl-count").textContent = PL.t ? ac.length + (ac.length === 1 ? " αεροσκάφος" : " αεροσκάφη") + " σε " + PLANES.radiusKm + " km" : "";
  if(!PL.t) return;
  var rows = ac.length ? ac.slice(0, 6).map(function(p){
    var alt = p.ft != null ? thou(p.ft) + " ft · " + thou(p.ft * 0.3048) + " m" : "";
    var sp = p.kt != null ? Math.round(p.kt * 1.852) + " km/h" : "";
    var who = p.al || (ROUTES[p.cs] && ROUTES[p.cs].r && ROUTES[p.cs].r.al) || [p.type, p.reg].filter(Boolean).join(" ");
    var rt = routeTxt(p);
    return '<div class="pl-row"><div class="pl-l1"><b>' + esc(p.cs || p.reg || "χωρίς σήμα") + '</b><span class="al">' + esc(who) + '</span>' +
      '<span class="km">' + fmt1(p.km) + ' km ' + p.dir + '</span></div>' +
      ((p.phase || rt) ? '<div class="pl-l2">' + (p.phase ? '<span class="pl-ph">' + PHASE[p.phase] + '</span> ' : "") + esc(rt) + '</div>' : "") +
      '<div class="pl-l2">' + [alt, sp].filter(Boolean).map(esc).join(" · ") + '</div></div>';
  }).join("") : '<div class="q-calm">Κανένα αεροσκάφος στον αέρα μέσα σε ' + PLANES.radiusKm + ' km αυτή τη στιγμή.</div>';
  $("pl-body").innerHTML = '<div class="pl-wrap">' + radar(ac) + '<div class="pl-list" id="pl-list">' + rows +
    (PL.ground ? '<div class="pl-l2" style="margin-top:.375rem">Και ' + PL.ground + ' στο έδαφος.</div>' : '') + '</div></div>';
  var L = $("pl-list"), items = L.querySelectorAll(".pl-row"), n = items.length;
  while(L.scrollHeight > L.clientHeight + 1 && n > 1){ n--; items[n].style.display = "none"; }
}
function planesTick(){
  clearTimeout(plTimer);
  if(!onScreen4() || isNightNow()) return;
  if(!plBusy){
    plBusy = true;
    fetchPlanes().then(function(r){ drawPlanes(); return routesFor(r.ac.slice(0, 6)).then(drawPlanes); })
      .catch(function(){ if(!PL.t) errBox("pl-body", "Τα αεροσκάφη δεν φορτώθηκαν."); })
      .then(function(){ plBusy = false; });
  }
  plTimer = setTimeout(planesTick, PLANES.everySec * 1000);
}

/* =====================================================================
   4. Σεισμοί (EMSC), κάθε 5 λεπτά, banner και Telegram για κοντινούς και ισχυρούς
   ===================================================================== */
var EQ = [], EQT = 0, eqSent = (load("eq_sent") || {}).v || [], eqHidden = (load("eq_hidden") || {}).v || [];
var REGIONS = { "GREECE": "Ελλάδα", "SOUTHERN GREECE": "Νότια Ελλάδα", "CENTRAL GREECE": "Κεντρική Ελλάδα", "NORTHERN GREECE": "Βόρεια Ελλάδα",
  "CRETE, GREECE": "Κρήτη", "DODECANESE ISLANDS, GREECE": "Δωδεκάνησα", "AEGEAN SEA": "Αιγαίο", "IONIAN SEA": "Ιόνιο",
  "GREECE-ALBANIA BORDER REGION": "Σύνορα Ελλάδας-Αλβανίας", "WESTERN TURKEY": "Δυτική Τουρκία", "TURKEY": "Τουρκία",
  "NEAR THE COAST OF WESTERN TURKEY": "Ακτές Δυτικής Τουρκίας", "EASTERN MEDITERRANEAN SEA": "Ανατολική Μεσόγειος",
  "CENTRAL MEDITERRANEAN SEA": "Κεντρική Μεσόγειος", "ALBANIA": "Αλβανία", "BULGARIA": "Βουλγαρία", "NORTH MACEDONIA": "Βόρεια Μακεδονία",
  "SEA OF MARMARA": "Θάλασσα του Μαρμαρά" };
function regionGr(s){
  s = (s || "").toUpperCase();
  if(REGIONS[s]) return REGIONS[s];
  return s.toLowerCase().replace(/(^|[\s,-])([a-z])/g, function(m, a, b){ return a + b.toUpperCase(); });
}
function loadQuakes(){
  if(DEMO){ EQ = demoQuakes(); EQT = Date.now(); drawQuakes(); return Promise.resolve(); }
  var start = new Date(Date.now() - QUAKES.days * 86400000).toISOString().slice(0, 19);
  var u = "https://www.seismicportal.eu/fdsnws/event/1/query?format=json&lat=" + HOME.lat + "&lon=" + HOME.lon +
    "&maxradius=" + QUAKES.maxRadiusDeg + "&minmag=" + QUAKES.minMag + "&starttime=" + start + "&orderby=time&limit=100";
  return fetchT(u, {}, 25000).then(function(r){ return r.text(); }).then(function(t){
    var j = t ? JSON.parse(t) : { features: [] };   // 204 = κανένας σεισμός
    EQ = (j.features || []).map(function(f){
      var p = f.properties;
      return { id: p.unid || f.id, t: Date.parse(p.time), mag: +p.mag, mt: p.magtype || "", reg: regionGr(p.flynn_region), lat: +p.lat, lon: +p.lon,
        depth: +p.depth, km: distKm(HOME.lat, HOME.lon, +p.lat, +p.lon), dir: compass(bearing(HOME.lat, HOME.lon, +p.lat, +p.lon)) };
    }).sort(function(a, b){ return b.t - a.t; });
    EQT = Date.now(); store("quakes", EQ);
    drawQuakes(); return alertQuakes();
  }).catch(function(){
    var c = load("quakes"); if(c && c.v && !EQT){ EQ = c.v; EQT = c.t; drawQuakes(); }
    else if(!EQT) errBox("q-body", "Οι σεισμοί δεν φορτώθηκαν.");
  });
}
function drawQuakes(){
  if(!$("q-body")) return;
  $("q-upd").textContent = EQT ? "EMSC · " + hm(new Date(EQT)) : "";
  var list = EQ.slice(0, QUAKES.show);
  $("q-body").innerHTML = list.length ? list.map(function(q){
    var cls = q.mag >= 5 ? " m5" : q.mag >= 4 ? " m4" : "";
    return '<div class="q-row"><b class="q-mag' + cls + '" aria-label="μέγεθος ' + fmt1(q.mag) + '">' + fmt1(q.mag) + '</b>' +
      '<div class="q-main"><div class="q-reg">' + esc(q.reg) + '</div><div class="q-sub">' + Math.round(q.km) + ' km ' + q.dir + ' · βάθος ' + Math.round(q.depth) + ' km</div></div>' +
      '<div class="q-ago">' + esc(agoText(q.t)) + '</div></div>';
  }).join("") : '<div class="q-calm"><i class="dot ok"></i>Κανένας σεισμός πάνω από ' + fmt1(QUAKES.minMag) + ' αυτή την εβδομάδα.</div>';
  var L = $("q-body"), items = L.querySelectorAll(".q-row"), n = items.length;
  while(L.scrollHeight > L.clientHeight + 1 && n > 1){ n--; items[n].style.display = "none"; }
  drawBanner();
}
function recent(q){ return Date.now() - q.t <= QUAKES.windowMin * 60000; }
// Για την κορνίζα (dashboard-frame.js): ο σεισμός που δείχνει τώρα το banner, ή null
window.eqNow = function(){ return EQ.filter(function(x){ return recent(x) && x.mag >= QUAKES.bannerMag && x.km <= QUAKES.bannerKm && eqHidden.indexOf(x.id) < 0; })[0] || null; };
window.eqFmt = function(q){ return "Σεισμός " + fmt1(q.mag) + " · " + Math.round(q.km) + " km " + q.dir + " · " + agoText(q.t); };
function drawBanner(){
  var b = $("eq-banner");
  var q = EQ.filter(function(x){ return recent(x) && x.mag >= QUAKES.bannerMag && x.km <= QUAKES.bannerKm && eqHidden.indexOf(x.id) < 0; })[0];
  if(!q){ b.className = ""; return; }
  b.className = "on"; b.dataset.id = q.id;
  $("eq-txt").innerHTML = '<b>Σεισμός ' + fmt1(q.mag) + '</b> · ' + Math.round(q.km) + ' km ' + q.dir + ' · ' + esc(q.reg) + ' · ' + esc(agoText(q.t));
}
function alertQuakes(){
  var hit = EQ.filter(function(q){ return recent(q) && q.mag >= QUAKES.telegramMag && q.km <= QUAKES.telegramKm && eqSent.indexOf(q.id) < 0; });
  return Promise.all(hit.map(function(q){
    return tgSend("⚠️ Σεισμός " + fmt1(q.mag) + (q.mt ? " (" + q.mt + ")" : "") + ", " + agoText(q.t) + "\n" + Math.round(q.km) + " km " + q.dir +
      " από το σπίτι · " + q.reg + " · βάθος " + Math.round(q.depth) + " km\nhttps://www.seismicportal.eu/eventdetails.html?unid=" + encodeURIComponent(q.id))
      .then(function(ok){ if(ok){ eqSent.push(q.id); eqSent = eqSent.slice(-50); store("eq_sent", eqSent); } });
  }));
}

/* ---------- markup: banner ---------- */
var ban = document.createElement("div"); ban.id = "eq-banner"; ban.setAttribute("role", "status");
ban.innerHTML = '<span id="eq-txt"></span><button type="button" id="eq-close">Εντάξει</button>';
document.body.appendChild(ban);
$("eq-close").addEventListener("click", function(e){
  e.stopPropagation();
  eqHidden.push(ban.dataset.id); eqHidden = eqHidden.slice(-50); store("eq_hidden", eqHidden); drawBanner();
});

/* ---------- εντολές Telegram: πότισμα, τρέξιμο, σεισμοί, αεροπλάνα ---------- */
function plain(c){ return c.normalize ? c.normalize("NFD").replace(/[̀-ͯ]/g, "") : c; }
function ensureWx(){ return WX && Date.now() - WXT < 3600000 ? Promise.resolve() : loadWx(); }
var prevCmd = window.tgCommand;
window.tgCommand = function(c){
  var p = plain(c);
  if(/^(ποτισμα|potisma|water)$/.test(p)) return ensureWx().then(function(){
    if(!WX) return "Ο καιρός δεν φορτώθηκε, δοκίμασε σε λίγο.";
    var g = gardenCalc();
    return "🪴 " + g.verdict + "\n" + g.why + (g.when ? "\n" + g.when.replace(/<[^>]+>/g, "") : "") + (g.frost ? "\n❄️ " + g.frost : "");
  });
  if(/^(τρεξιμο|trexim[oο]|run)$/.test(p)) return ensureWx().then(function(){
    if(!WX) return "Ο καιρός δεν φορτώθηκε, δοκίμασε σε λίγο.";
    var r = runCalc(), lv = level(r.cur.s);
    return "🏃 " + (r.inside ? "Τώρα " + r.cur.s + "/100, " + lv[0] : "Τώρα εκτός ωρών") +
      (r.best ? "\nΚαλύτερη ώρα " + (r.tomorrow ? "αύριο " : "σήμερα ") + hm(r.best.d) + " (" + r.best.s + ")" : "") + (r.tip ? "\n" + r.tip : "");
  });
  if(/^(σεισμοι|seismoi|quakes?)$/.test(p)) return loadQuakes().then(function(){
    if(!EQ.length) return "🌍 Κανένας σεισμός πάνω από " + fmt1(QUAKES.minMag) + " αυτή την εβδομάδα.";
    return "🌍 Τελευταίοι σεισμοί:\n" + EQ.slice(0, 3).map(function(q){
      return fmt1(q.mag) + " · " + Math.round(q.km) + " km " + q.dir + " · " + q.reg + " · " + agoText(q.t);
    }).join("\n");
  });
  if(/^(αεροπλανα|aeroplana|planes?)$/.test(p)) return fetchPlanes().then(function(r){
    return routesFor(r.ac.slice(0, 3)).then(function(){
      if(!r.ac.length) return "✈️ Κανένα αεροσκάφος στον αέρα μέσα σε " + PLANES.radiusKm + " km.";
      return "✈️ " + r.ac.length + " αεροσκάφη σε " + PLANES.radiusKm + " km. Πιο κοντά:\n" + r.ac.slice(0, 3).map(function(x){
        return (x.cs || x.reg) + (x.al ? " " + x.al : "") + " · " + (x.ft != null ? thou(x.ft) + " ft" : "") + " · " + fmt1(x.km) + " km " + x.dir +
          (x.phase ? " · " + PHASE[x.phase].slice(2).toLowerCase() : "") + (routeTxt(x) ? " · " + routeTxt(x) : "");
      }).join("\n");
    });
  }, function(){ return "✈️ Τα αεροσκάφη δεν φορτώθηκαν, δοκίμασε σε λίγο."; });
  return prevCmd ? prevCmd(c) : null;
};

/* ---------- οθόνη 4: ανανέωση αεροπλάνων όσο φαίνεται ---------- */
var prevShown = window.onScreenShown;
window.onScreenShown = function(n){
  if(prevShown) prevShown(n);
  if(n === 3){ drawGarden(); drawRun(); drawQuakes(); if(Date.now() - PL.t > 45000) planesTick(); else { drawPlanes(); clearTimeout(plTimer); plTimer = setTimeout(planesTick, PLANES.everySec * 1000); } }
};

/* ---------- δεδομένα δοκιμής (?demo=1) ---------- */
function demoWx(){
  var now = new Date(), d0 = new Date(now); d0.setHours(0, 0, 0, 0); d0.setDate(d0.getDate() - 3);
  var H = { time: [], temperature_2m: [], apparent_temperature: [], dew_point_2m: [], wind_speed_10m: [], precipitation_probability: [], precipitation: [],
    uv_index: [], is_day: [], soil_moisture_0_to_1cm: [], soil_moisture_1_to_3cm: [], soil_moisture_3_to_9cm: [] };
  for(var i = 0; i < 144; i++){
    var t = new Date(d0.getTime() + i * 3600000), h = t.getHours(), day = h >= 7 && h < 18;
    var temp = 9 + 9 * Math.max(0, Math.sin((h - 7) / 11 * Math.PI));
    H.time.push(ymd(t) + "T" + pad(h) + ":00"); H.temperature_2m.push(temp); H.apparent_temperature.push(temp - 1.5);
    H.dew_point_2m.push(7 + (h > 11 && h < 17 ? 6 : 0)); H.wind_speed_10m.push(h > 13 && h < 18 ? 24 : 9); H.precipitation_probability.push(i > 120 ? 30 : 5);
    H.precipitation.push(0); H.uv_index.push(day ? 3 * Math.sin((h - 7) / 11 * Math.PI) : 0); H.is_day.push(day ? 1 : 0);
    H.soil_moisture_0_to_1cm.push(.16); H.soil_moisture_1_to_3cm.push(.19); H.soil_moisture_3_to_9cm.push(.21);
  }
  var D = { time: [], et0_fao_evapotranspiration: [2.4, 2.9, 2.2, 1.8, 2.1, 1.2], precipitation_sum: [0, 0, 0, 0, 0, 3.5],
    precipitation_probability_max: [0, 0, 5, 5, 30, 70], wind_speed_10m_max: [14, 18, 22, 24, 12, 20], temperature_2m_min: [9, 8, 9, 8, 6, 5] };
  for(var k = 0; k < 6; k++) D.time.push(ymd(new Date(d0.getTime() + k * 86400000)));
  WX = { hourly: H, daily: D }; WXT = Date.now(); AQ = {};
  H.time.forEach(function(t){ AQ[t] = { aqi: 28, pm: 8 }; });
}
function demoPlanes(){
  function at(km, deg){ return { lat: HOME.lat + km * Math.cos(deg * R_) / 111, lon: HOME.lon + km * Math.sin(deg * R_) / (111 * Math.cos(HOME.lat * R_)) }; }
  var a = [["AEE602", 3.1, 250, 2100, 150, 60, 1400], ["RYR4LK", 6.4, 300, 3800, 180, 240, -900], ["SEH42T", 9.8, 20, 9200, 260, 200, 0],
           ["WZZ3221", 12.5, 130, 31000, 450, 315, 0], ["OAL15", 14.2, 200, 1800, 140, 40, -700]];
  ROUTES = { AEE602: { t: Date.now(), r: { o: "ATH", oc: "Athens", d: "LHR", dc: "London", al: "Aegean Airlines" } },
             RYR4LK: { t: Date.now(), r: { o: "BGY", oc: "Milan", d: "ATH", dc: "Athens" } } };
  return prep({ src: "adsb.lol", ac: a.map(function(x){ var p = at(x[1], x[2]); return { cs: x[0], lat: p.lat, lon: p.lon, ft: x[3], kt: x[4], track: x[5], vs: x[6], ground: false }; })
    .concat([{ cs: "AEE7HW", lat: 37.936, lon: 23.946, ground: true }]) });
}
function demoQuakes(){
  var n = Date.now();
  var big = /[?&]eqbanner=1/.test(location.search);   // δοκιμή του banner
  return [[big ? 4.3 : 3.6, 68, 40, 12, 22, "CENTRAL GREECE"], [3.4, 140, 160, 300, 10, "AEGEAN SEA"], [3.1, 210, 220, 1500, 18, "SOUTHERN GREECE"],
          [3.8, 260, 110, 3100, 9, "DODECANESE ISLANDS, GREECE"], [3.2, 95, 330, 6000, 7, "GREECE"]].map(function(x, i){
    return { id: "demo" + i, mag: x[0], km: x[1], dir: compass(x[2]), t: n - x[3] * 60000, depth: x[4], reg: regionGr(x[5]), mt: "ML" };
  });
}

/* ---------- εκκίνηση ---------- */
loadWx(); loadQuakes();
setInterval(loadWx, 30 * 60000);
setInterval(loadQuakes, QUAKES.everyMin * 60000);
setInterval(function(){ drawBanner(); if(onScreen4()) drawQuakes(); }, 60000);
if(onScreen4()) planesTick();
})();
