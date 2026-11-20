/* dashboard-extras.js
   Προσθήκες πάνω στο dashboard.html, χωρίς αλλαγή στη βασική λογική του:
   1. Ποιότητα αέρα, UV, γύρη (Open-Meteo, δωρεάν, χωρίς κλειδί)
   2. Εφημερεύοντα φαρμακεία (Φαρμακευτικός Σύλλογος Αττικής, fsa-efimeries.gr)
   3. Οθόνη 2 με σύρσιμο (φαρμακεία + αέρας)
   4. Νυχτερινή οθόνη (μόνο ρολόι, αγγίζεις για το κανονικό dashboard)
   Χρησιμοποιεί τα $, esc, pad, hm, store, load, fetchT, toast, CONFIG, DEMO του dashboard.html. */
(function(){
var EXTRA = {
  airEveryMin: 30,
  pharmEveryMin: 30,
  pharmShow: 5,             // πόσα φαρμακεία στην οθόνη 2
  screen2BackAfterMin: 3,   // επιστροφή στην κύρια οθόνη χωρίς άγγιγμα
  nightAwakeMin: 2          // πόσο μένει το dashboard μετά από άγγιγμα τη νύχτα
};
var L = CONFIG.LOCATION;

/* ---------- 1. Ποιότητα αέρα / UV / γύρη ---------- */
var POLLEN = { alder_pollen:"Σκλήθρα", birch_pollen:"Σημύδα", grass_pollen:"Αγρωστώδη",
               olive_pollen:"Ελιά", ragweed_pollen:"Αμβροσία", mugwort_pollen:"Αρτεμισία" };
function aqiLevel(v){
  if(v==null) return ["-","",""];
  if(v<=20) return ["Καλή","ok","Ιδανικός αέρας για βόλτα."];
  if(v<=40) return ["Ικανοποιητική","ok","Κανένα πρόβλημα για τους περισσότερους."];
  if(v<=60) return ["Μέτρια","warn","Οι ευαίσθητοι ας αποφύγουν έντονη άσκηση έξω."];
  if(v<=80) return ["Κακή","bad","Λιγότερος χρόνος έξω, κλειστά παράθυρα."];
  if(v<=100) return ["Πολύ κακή","bad","Απόφυγε την άσκηση έξω."];
  return ["Ακραία","bad","Μείνε μέσα αν γίνεται."];
}
function uvLevel(v){
  if(v<3) return ["χαμηλός","ok"];
  if(v<6) return ["μέτριος","warn"];
  if(v<8) return ["υψηλός","bad"];
  if(v<11) return ["πολύ υψηλός","bad"];
  return ["ακραίος","bad"];
}
function pollenLevel(v){ // κόκκοι/m³, χονδρικά όρια
  if(v<1) return ["Καμία","ok"];
  if(v<20) return ["Λίγη","ok"];
  if(v<100) return ["Μέτρια","warn"];
  return ["Πολλή","bad"];
}
function demoAir(){
  return { current:{ european_aqi:28, pm2_5:8.8, pm10:17.2, uv_index:0.7, nitrogen_dioxide:12, ozone:64,
           alder_pollen:0, birch_pollen:0, grass_pollen:3, olive_pollen:0, ragweed_pollen:0, mugwort_pollen:0 },
           hourly:{ time:[], uv_index:[] }, daily_uv_max:3.1, daily_uv_at:"13:00" };
}
function loadAir(){
  if(DEMO){ AIR = demoAir(); drawAir(); return; }
  var url = "https://air-quality-api.open-meteo.com/v1/air-quality?latitude="+L.lat+"&longitude="+L.lon+
    "&current=european_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,uv_index,"+Object.keys(POLLEN).join(",")+
    "&hourly=uv_index&forecast_days=1&timezone=Europe%2FAthens";
  fetchT(url).then(function(r){ return r.json(); }).then(function(j){
    var H=j.hourly, mx=0, at="";
    for(var i=0;i<H.time.length;i++){ if((H.uv_index[i]||0)>mx){ mx=H.uv_index[i]; at=H.time[i].slice(11,16); } }
    j.daily_uv_max = mx; j.daily_uv_at = at;
    AIR = j; store("air", j); drawAir();
  }).catch(function(){
    var c = load("air"); if(c){ AIR = c.v; drawAir(true); }
  });
}
var AIR = null;
function topPollen(cur){
  var best=null, v=0;
  Object.keys(POLLEN).forEach(function(k){ if((cur[k]||0)>v){ v=cur[k]; best=k; } });
  return { name: best ? POLLEN[best] : "", v: v };
}
function airChips(){
  if(!AIR) return "";
  var c=AIR.current, a=aqiLevel(c.european_aqi), u=uvLevel(AIR.daily_uv_max||0), p=topPollen(c), pl=pollenLevel(p.v);
  return '<div class="w-stats air">'+
    '<div class="w-stat"><b class="lv"><i class="dot '+a[1]+'"></i>'+Math.round(c.european_aqi)+'</b><span>Αέρας</span></div>'+
    '<div class="w-stat"><b class="lv"><i class="dot '+u[1]+'"></i>'+(Math.round((AIR.daily_uv_max||0)*10)/10).toString().replace(".",",")+'</b><span>UV σήμερα</span></div>'+
    '<div class="w-stat"><b class="lv"><i class="dot '+pl[1]+'"></i>'+pl[0]+'</b><span>Γύρη</span></div>'+
  '</div>';
}
// Η κάρτα Καιρός ξαναγράφεται σε κάθε ανανέωση, οπότε η σειρά του αέρα μπαίνει μετά από κάθε renderWeather
var baseRenderWeather = window.renderWeather;
window.renderWeather = function(j, stale){ baseRenderWeather(j, stale); insertAirRow(); };
function insertAirRow(){
  var body=$("w-body"), old=body.querySelector(".w-stats.air"); if(old) old.parentNode.removeChild(old);
  var st=body.querySelector(".w-stats"); if(!st || !AIR) return;
  st.insertAdjacentHTML("afterend", airChips());
  fitWeather();
}
// Αν δεν χωράει, κρύβονται οι τελευταίες μέρες της πρόγνωσης (μένουν τουλάχιστον 3)
function fitWeather(){
  var body=$("w-body"), days=body.querySelectorAll(".w-d"), n=days.length;
  for(var i=0;i<n;i++) days[i].style.display="";
  while(body.scrollHeight>body.clientHeight+1 && n>3){ n--; days[n].style.display="none"; }
}
function drawAir(stale){
  insertAirRow();
  if(!AIR) return;
  var c=AIR.current, a=aqiLevel(c.european_aqi), u=uvLevel(AIR.daily_uv_max||0);
  $("aq-upd").textContent = stale ? "παλιά δεδομένα" : "ενημ. "+hm(new Date());
  var pol = Object.keys(POLLEN).filter(function(k){ return (c[k]||0)>=1; }).map(function(k){
    var l=pollenLevel(c[k]); return '<div class="row"><i class="dot '+l[1]+'"></i><span>Γύρη: '+POLLEN[k]+'</span><span>'+l[0]+'</span></div>';
  }).join("");
  $("aq-body").innerHTML =
    '<div class="aq-big"><i class="dot '+a[1]+'" style="width:1rem;height:1rem;align-self:center"></i><b>'+Math.round(c.european_aqi)+'</b><span>'+a[0]+'</span></div>'+
    '<div class="aq-note">'+a[2]+'</div>'+
    '<div class="aq-rows">'+
      '<div class="row"><span>Σωματίδια PM2.5</span><span>'+Math.round(c.pm2_5)+' μg/m³</span></div>'+
      '<div class="row"><span>Σωματίδια PM10</span><span>'+Math.round(c.pm10)+' μg/m³</span></div>'+
      (c.ozone!=null ? '<div class="row"><span>Όζον</span><span>'+Math.round(c.ozone)+' μg/m³</span></div>' : '')+
      '<div class="row"><i class="dot '+u[1]+'"></i><span>UV τώρα / μέγιστο</span><span>'+
        (Math.round((c.uv_index||0)*10)/10).toString().replace(".",",")+' / '+(Math.round((AIR.daily_uv_max||0)*10)/10).toString().replace(".",",")+
        (AIR.daily_uv_at ? ' στις '+AIR.daily_uv_at : '')+'</span></div>'+
      (pol || '<div class="row"><i class="dot ok"></i><span>Γύρη</span><span>Καμία</span></div>')+
    '</div>';
}

// Ειδήσεις: αυτόματη κύλιση, ήρεμη και αναγνώσιμη (HIG motion.md, accessibility.md):
// - ο τίτλος μένει ακίνητος NEWS_READ_MS για ανάγνωση, κινείται μόνο η μετάβαση (NEWS_MOVE_MS, ease-in-out)
// - στο τέλος η στήλη σβήνει απαλά και ξαναφαίνεται από την αρχή, αντί για γρήγορο γύρισμα προς τα πάνω
// - άγγιγμα = σταματάει αμέσως, ξαναξεκινάει μετά από NEWS_PAUSE_MS χωρίς άγγιγμα
// - με "μείωση κίνησης" στο σύστημα η αυτόματη κύλιση είναι κλειστή
var NEWS_READ_MS = 8000, NEWS_MOVE_MS = 1100, NEWS_PAUSE_MS = 60000, newsPausedUntil = 0, newsAnim = 0;
var reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
function ease(t){ return t<.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2; }   // ease-in-out cubic
function newsGlide(b, to){
  cancelAnimationFrame(newsAnim);
  var from=b.scrollTop, d=to-from, t0=null;
  if(Math.abs(d)<1) return;
  function step(ts){
    if(t0===null) t0=ts;
    var p=Math.min(1,(ts-t0)/NEWS_MOVE_MS);
    b.scrollTop = from + d*ease(p);
    if(p<1) newsAnim=requestAnimationFrame(step);
  }
  newsAnim=requestAnimationFrame(step);
}
function newsRestart(b){
  b.style.transition="opacity .45s ease"; b.style.opacity="0";
  setTimeout(function(){ b.scrollTop=0; b.style.opacity="1"; }, 480);
}
$("n-body").addEventListener("touchstart", function(){ cancelAnimationFrame(newsAnim); newsPausedUntil=Date.now()+NEWS_PAUSE_MS; this.style.opacity="1"; }, {passive:true});
if(!reduceMotion) setInterval(function(){
  var b=$("n-body");
  if(!b || !b.offsetParent || Date.now()<newsPausedUntil || curScreen) return;
  if(document.body.className.indexOf("night")>=0 && !/\bawake\b/.test(root.className)) return;
  if(b.querySelector(".sending") || b.scrollHeight <= b.clientHeight+1) return;
  var max=b.scrollHeight-b.clientHeight;
  if(b.scrollTop >= max-4){ newsRestart(b); return; }
  var top=b.getBoundingClientRect().top, items=b.querySelectorAll(".n-item, .n-sec h3");
  for(var i=0;i<items.length;i++){
    var y = Math.round(items[i].getBoundingClientRect().top - top + b.scrollTop);
    if(y > b.scrollTop + 4){ newsGlide(b, Math.min(y, max)); return; }
  }
  newsRestart(b);
}, NEWS_READ_MS + NEWS_MOVE_MS);

/* ---------- 2. Εφημερεύοντα φαρμακεία ---------- */
var PHARM = [];
function niceHours(s){
  return String(s||"").replace(/(\d{1,2})\s*ΠΡΩΙ/g, function(m,n){ return pad(+n)+":00"; })
    .replace(/(\d{1,2})\s*(ΒΡΑΔΥ|ΑΠΟΓΕΥΜΑ)/g, function(m,n){ return (+n===12?12:+n+12)+":00"; })
    .replace(/(\d{1,2})\s*ΜΕΣΗΜΕΡΙ/g, function(m,n){ return pad(+n)+":00"; })
    .replace(/\s*ΕΠΟΜΕΝΗΣ/g," (επόμενης)").replace(/\s*-\s*/g," - ");
}
// Πηγή: vrisko.gr (η σελίδα της περιοχής σου ορίζεται στο dashboard-config.js, LOCAL.PHARM_URL). Το fsa-efimeries.gr του συλλόγου έχει πιστοποιητικό
// (Sectigo Root R46) που το Android 8 δεν αναγνωρίζει, οπότε από το tablet δεν ανοίγει.
var PHARM_URL = (window.LOCAL && LOCAL.PHARM_URL) || "";
function distKm(lat, lon){
  var R=6371, dLat=(lat-L.lat)*Math.PI/180, dLon=(lon-L.lon)*Math.PI/180;
  var a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(L.lat*Math.PI/180)*Math.cos(lat*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
  return 2*R*Math.asin(Math.sqrt(a));
}
function distFmt(km){ return km<1 ? Math.round(km*100)*10+" μ." : (Math.round(km*10)/10).toString().replace(".",",")+" χλμ."; }
function parsePharm(html){
  var doc=new DOMParser().parseFromString(html, "text/html"), out=[], seen={};
  [].forEach.call(doc.querySelectorAll(".duty-container"), function(c){
    function tx(sel){ var e=c.querySelector(sel); return e ? e.textContent.replace(/\s+/g," ").trim() : ""; }
    var tags=[].map.call(c.querySelectorAll(".operationTypeTag span"), function(x){ return x.textContent.trim(); });
    var duty = tags.indexOf("Εφημερεύον")>=0;
    var hours = tx(".firstTime").replace(/^\S+\s+/,"") + (tx(".nextTimeOnly") ? " (επόμενης)" : "");
    var name = tx(".duty-container-link"), key = name+"|"+hours;
    if(!name || seen[key]) return; seen[key]=1;
    var telA=c.querySelector("[data-tel]"), map=c.querySelector("a[href*=daddr]"), km=null;
    if(map){ var m=/daddr=([\d.]+),([\d.]+)/.exec(map.getAttribute("href")); if(m) km=distKm(+m[1], +m[2]); }
    var addr=tx(".duty-container-text"), area="", k=addr.lastIndexOf(",");
    if(k>0){ area=addr.slice(k+1).trim(); addr=addr.slice(0,k).trim(); }
    out.push({ name:name, hours:hours.replace(/\s*-\s*/g," - "), addr:addr, area:area, tel: telA ? telA.getAttribute("data-tel") : "",
      open: tags.indexOf("Ανοιχτό")>=0, duty:duty, km:km, dist: km==null ? "" : distFmt(km) });
  });
  // πρώτα τα εφημερεύοντα (το ανοιχτό τώρα πρώτο), μετά όσα έχουν διευρυμένο ωράριο, κατά απόσταση
  out.sort(function(a,b){ var sa=(a.duty?0:2)+(a.open?0:1), sb=(b.duty?0:2)+(b.open?0:1); return sa-sb || (a.km||99)-(b.km||99); });
  return out;
}
function loadPharm(){
  if(DEMO){
    PHARM=[{addr:"Οδός Παραδείγματος 12",dist:"450 μ.",area:"Κέντρο",name:"Φαρμακείο Παπαδόπουλου",hours:"08:00 - 21:00",tel:"2100000000",open:true,duty:true},
           {addr:"Λεωφόρος Δοκιμής 40",dist:"1,8 χλμ.",area:"Κέντρο",name:"Φαρμακείο Γεωργίου",hours:"21:00 - 08:00 (επόμενης)",tel:"2100000001",open:false,duty:true}];
    drawPharm(); return;
  }
  if(!PHARM_URL){ $("ph-body").innerHTML='<div class="muted">Όρισε τη σελίδα της περιοχής σου (vrisko.gr) στο dashboard-config.js, LOCAL.PHARM_URL.</div>'; return; }
  fetchT(PHARM_URL, {}, 20000).then(function(r){ return r.text(); }).then(function(t){
    var list=parsePharm(t);
    if(!list.length) throw new Error("κενή λίστα");
    PHARM=list; store("pharm", list); drawPharm();
  }).catch(function(e){
    var c=load("pharm");
    if(c && Date.now()-c.t < 12*3600000){ PHARM=c.v; drawPharm(true); }
    else { PHARM=[]; $("ph-body").innerHTML='<div class="err">Δεν φορτώθηκαν τα φαρμακεία ('+esc(e.message)+'). Τηλ. 1434.</div>'; drawNight(); }
  });
}
function telFmt(t){ return /^\d{10}$/.test(t) ? t.slice(0,5)+" "+t.slice(5) : t; }
function drawPharm(stale){
  $("ph-upd").textContent = stale ? "παλιά δεδομένα" : CONFIG.LOCATION.name+" · ενημ. "+hm(new Date());
  $("ph-body").innerHTML = PHARM.slice(0, EXTRA.pharmShow).map(function(p){
    return '<div class="ph-item">'+
      '<div class="ph-name">'+esc(p.name)+'</div><div class="ph-tel">'+esc(telFmt(p.tel))+'</div>'+
      '<div class="ph-addr">'+esc(p.addr)+(p.area?' · '+esc(p.area):'')+'</div><div class="ph-dist">'+esc(p.dist)+'</div>'+
      '<div class="ph-hours">'+(p.open?'<b>Ανοιχτό τώρα</b> · ':'')+(p.duty?'Εφημερία ':'Διευρυμένο ωράριο ')+esc(niceHours(p.hours))+'</div>'+
    '</div>';
  }).join("") || '<div class="muted">Δεν βρέθηκε ανοιχτό φαρμακείο. Τηλ. 1434.</div>';
  // κράτα όσα χωράνε ολόκληρα
  var body=$("ph-body"), items=body.querySelectorAll(".ph-item"), n=items.length;
  while(body.scrollHeight>body.clientHeight+1 && n>1){ n--; items[n].style.display="none"; }
  drawNight();
}

/* ---------- 3. Οθόνες με σύρσιμο: 0 κύρια, 1 φαρμακεία + αέρας, 2 ημερολόγιο μήνα ---------- */
var root=document.documentElement, backTimer=null, SCREENS=3, curScreen=0;
function setScreen(n){
  n = Math.max(0, Math.min(SCREENS-1, +n||0)); curScreen=n;
  root.className = root.className.replace(/\s*\bs[23]\b/g,"") + (n ? " s"+(n+1) : "");
  var dots=$("pager").children; for(var i=0;i<dots.length;i++) dots[i].className = i===n ? "on" : "";
  clearTimeout(backTimer);
  if(n===1) fitAll();
  if(typeof window.onScreenShown==="function") window.onScreenShown(n);
  if(n) backTimer=setTimeout(function(){ setScreen(0); }, EXTRA.screen2BackAfterMin*60000);
}
// κάθε άγγιγμα σε δευτερεύουσα οθόνη μεταθέτει την αυτόματη επιστροφή
document.addEventListener("touchstart", function(){ if(curScreen){ clearTimeout(backTimer); backTimer=setTimeout(function(){ setScreen(0); }, EXTRA.screen2BackAfterMin*60000); } }, {passive:true});
function fitAll(){ if(PHARM.length) drawPharm(); }
var sx=0, sy=0, st=0;
document.addEventListener("touchstart", function(e){ var t=e.touches[0]; sx=t.clientX; sy=t.clientY; st=Date.now(); }, {passive:true});
document.addEventListener("touchend", function(e){
  var t=e.changedTouches[0], dx=t.clientX-sx, dy=t.clientY-sy;
  if(Date.now()-st>800 || Math.abs(dx)<90 || Math.abs(dy)>Math.abs(dx)*0.6) return;
  if(body.className.indexOf("night")>=0 && !/\bawake\b/.test(root.className)) return;
  setScreen(curScreen + (dx<0 ? 1 : -1));
}, {passive:true});
var body=document.body;
$("pager").addEventListener("click", function(e){
  var i=[].indexOf.call(this.children, e.target);
  setScreen(i>=0 && i!==curScreen ? i : (curScreen+1)%SCREENS);
});

/* ---------- 4. Νυχτερινή οθόνη ---------- */
var awakeTimer=null;
$("nightv").addEventListener("click", function(){
  if(!/\bawake\b/.test(root.className)) root.className+=" awake";
  clearTimeout(awakeTimer);
  awakeTimer=setTimeout(function(){ root.className=root.className.replace(/\s*\bawake\b/g,""); setScreen(false); }, EXTRA.nightAwakeMin*60000);
});
function drawNight(){
  var d=new Date();
  $("nv-clock").textContent=hm(d);
  $("nv-date").textContent=DAYS[d.getDay()]+" "+d.getDate()+" "+MONTHS_G[d.getMonth()];
  var w=null;
  if(DEMO && typeof demoWeather==="function") w=demoWeather(); else { var c=load("weather"); w=c&&c.v; }
  if(w && w.current){
    var wi=wInfo(w.current.weather_code, w.current.is_day), D=w.daily, k=d.getHours()<12?0:1;
    var tw = D && D.time[k] ? wInfo(D.weather_code[k],1) : null;
    $("nv-wx").textContent = wi.icon+" "+Math.round(w.current.temperature_2m)+"° τώρα"+
      (tw ? "   ·   "+(k===0?"σήμερα ":"αύριο ")+tw.icon+" "+Math.round(D.temperature_2m_max[k])+"° / "+Math.round(D.temperature_2m_min[k])+"°" : "");
  }
  var p=PHARM.filter(function(x){ return x.open && x.duty; })[0];
  if(!p) p=PHARM.filter(function(x){ return x.duty && /επόμενης/.test(x.hours); })[0];
  $("nv-ph").textContent = p ? "💊 Εφημερεύει: "+p.name+", "+p.addr+(p.dist?" ("+p.dist+")":"")+" · "+telFmt(p.tel)+" · "+niceHours(p.hours) : "";
  // μικρή μετακίνηση κάθε λεπτό, για να μην «καίγεται» η οθόνη
  $("nv-inner").style.transform="translate("+(Math.round(Math.random()*40)-20)+"px,"+(Math.round(Math.random()*30)-15)+"px)";
}

/* ---------- 5. Εντολές από το Telegram ----------
   Μόνο από το δικό σου chat (TELEGRAM.chatId). Κάθε 20 δευτ. το tablet ρωτάει το bot για νέα μηνύματα.
   refresh / ανανέωση : ξαναφορτώνει όλο το dashboard
   status / κατάσταση : απαντά με μπαταρία, ώρα λειτουργίας, θερμοκρασία
   Δουλεύει μόνο όσο είναι ανοιχτό το dashboard στο tablet. */
var TG_CMD_EVERY = 20000;
function tgApi(method, params){
  var q=Object.keys(params||{}).map(function(k){ return k+"="+encodeURIComponent(params[k]); }).join("&");
  return fetchT("https://api.telegram.org/bot"+TELEGRAM.botToken+"/"+method+(q?"?"+q:""), {}, 15000).then(function(r){ return r.json(); });
}
function tgReply(text){ return tgApi("sendMessage", { chat_id:TELEGRAM.chatId, text:text }).catch(function(){}); }
var tgOffset = 0, tgBusy=false;
function pollTelegram(){
  if(DEMO || typeof TELEGRAM==="undefined" || !TELEGRAM.botToken || !TELEGRAM.chatId || tgBusy) return;
  tgBusy=true;
  tgApi("getUpdates", tgOffset ? { offset:tgOffset, timeout:0 } : { timeout:0 }).then(function(j){
    if(!j.ok) return;
    var cmds=[];
    j.result.forEach(function(u){
      tgOffset = u.update_id+1;
      var m=u.message; if(!m || String(m.chat.id)!==String(TELEGRAM.chatId) || !m.text) return;
      if(Date.now()/1000 - m.date > 600) return;   // αγνόησε παλιά μηνύματα (π.χ. μετά από reboot)
      cmds.push(m.text.trim().toLowerCase().replace(/^\//,""));
    });
    if(!cmds.length) return;
    // επιβεβαίωση στο Telegram ότι διαβάστηκαν, ώστε να μην ξανατρέξουν μετά το reload
    return tgApi("getUpdates", { offset:tgOffset, timeout:0 }).then(function(){
      var c=cmds[cmds.length-1];
      if(/^(refresh|reload|ανανέωση|ανανεωση)$/.test(c)){
        return tgReply("🔄 Ανανεώνεται το dashboard...").then(function(){ location.reload(); });
      }
      if(/^(status|κατάσταση|κατασταση)$/.test(c)){
        var w=load("weather"), t=w&&w.v&&w.v.current ? Math.round(w.v.current.temperature_2m)+"°" : "-";
        var up=Math.round((Date.now()-START_T)/60000);
        var msg="✅ Το dashboard τρέχει εδώ και "+(up<60?up+" λεπτά":Math.floor(up/60)+" ώρ. "+(up%60)+" λ.")+"\n🌡️ Έξω: "+t;
        var bat = navigator.getBattery ? navigator.getBattery() : Promise.resolve(null);
        return bat.then(function(b){ if(b) msg+="\n🔋 Μπαταρία: "+Math.round(b.level*100)+"%"+(b.charging?" (φορτίζει)":""); return tgReply(msg); });
      }
      if(c!=="start") return tgReply("Εντολές: refresh (ανανέωση), status (κατάσταση)");
    });
  }).catch(function(){}).then(function(){ tgBusy=false; });
}
var START_T = Date.now();

/* ---------- εκκίνηση ---------- */
setInterval(pollTelegram, TG_CMD_EVERY); setTimeout(pollTelegram, 5000);
loadAir(); loadPharm(); drawNight();
setInterval(loadAir, EXTRA.airEveryMin*60000);
setInterval(loadPharm, EXTRA.pharmEveryMin*60000);
setInterval(drawNight, 60000);
// δοκιμή: ?night=1 δείχνει τη νυχτερινή οθόνη, ?screen=2 ή 3 τις άλλες οθόνες
if(/[?&]night=1/.test(location.search)) setInterval(function(){ if(body.className.indexOf("night")<0) body.className+=" night"; }, 500);
var mS=/[?&]screen=(\d)/.exec(location.search); if(mS) setScreen(+mS[1]-1);
})();
