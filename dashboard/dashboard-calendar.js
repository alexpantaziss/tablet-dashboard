/* dashboard-calendar.js
   Κάρτα "Ημερολόγιο": τα σημερινά ραντεβού που απομένουν, ή τα αυριανά όταν τελειώσει η μέρα.
   Διαβάζει ημερολόγια iCal (iCloud δημόσιο link, Google "μυστική διεύθυνση iCal", Outlook ICS).
   Τα links δίνουν ΜΟΝΟ ανάγνωση. Ακύρωση: κλείσιμο του "Δημόσιο ημερολόγιο" στο iPhone (ή νέο link στο Google). */
// color: χρώμα του ημερολογίου (εμφανίζεται πάντα μαζί με το όνομά του, όχι μόνο του)
// Τα χρώματα αποφεύγουν το πράσινο/κίτρινο/κόκκινο, που στο dashboard σημαίνουν κατάσταση.
// Τα ημερολόγια ορίζονται στο dashboard-config.js (LOCAL.CALENDARS). Χωρίς αυτό: μόνο οι ελληνικές αργίες.
var CALENDARS = (window.LOCAL && LOCAL.CALENDARS) || [
  { name: "Αργίες", color: "#ff8fb1", url: "https://calendar.google.com/calendar/ical/el.greek%23holiday%40group.v.calendar.google.com/public/basic.ics" }
];
(function(){
var CAL_EVERY_MIN = 15, CAL_MAX_ROWS = 3;

/* ---------- ανάγνωση iCal ---------- */
function unfold(t){ return t.replace(/\r\n/g,"\n").replace(/\n[ \t]/g,""); }
function unesc(s){ return s.replace(/\\n/gi," ").replace(/\\([,;\\])/g,"$1").trim(); }
function prop(line){ // "DTSTART;TZID=Europe/Athens:20261120T100000" -> {name, params, value}
  var i=line.indexOf(":"); if(i<0) return null;
  var head=line.slice(0,i).split(";"), p={};
  for(var k=1;k<head.length;k++){ var e=head[k].split("="); p[e[0].toUpperCase()]=e[1]; }
  return { name:head[0].toUpperCase(), params:p, value:line.slice(i+1) };
}
// Ώρες χωρίς Z θεωρούνται τοπικές (το tablet είναι σε ώρα Ελλάδας)
function parseDate(v, params){
  var m=/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/.exec(v); if(!m) return null;
  if(!m[4]) return { d:new Date(+m[1],+m[2]-1,+m[3]), allDay:true };
  if(m[7]) return { d:new Date(Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6])), allDay:false };
  return { d:new Date(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6]), allDay:false };
}
function parseICS(text){
  var lines=unfold(text).split("\n"), evs=[], ev=null, depth=0;
  for(var i=0;i<lines.length;i++){
    var l=lines[i];
    if(l==="BEGIN:VEVENT"){ ev={ ex:[] }; depth=0; continue; }
    if(!ev) continue;
    if(/^BEGIN:/.test(l)){ depth++; continue; }      // VALARM κ.λπ. μέσα στο γεγονός
    if(/^END:/.test(l) && depth>0){ depth--; continue; }
    if(l==="END:VEVENT"){ if(ev.start) evs.push(ev); ev=null; continue; }
    if(depth>0) continue;
    var p=prop(l); if(!p) continue;
    if(p.name==="SUMMARY") ev.title=unesc(p.value);
    else if(p.name==="DTSTART"){ var s=parseDate(p.value,p.params); if(s){ ev.start=s.d; ev.allDay=s.allDay; } }
    else if(p.name==="DTEND"){ var e=parseDate(p.value,p.params); if(e) ev.end=e.d; }
    else if(p.name==="DURATION") ev.dur=p.value;
    else if(p.name==="RRULE") ev.rrule=p.value;
    else if(p.name==="EXDATE") p.value.split(",").forEach(function(x){ var d=parseDate(x); if(d) ev.ex.push(dayKey(d.d)); });
    else if(p.name==="RECURRENCE-ID"){ var r=parseDate(p.value,p.params); if(r) ev.recId=dayKey(r.d); }
    else if(p.name==="UID") ev.uid=p.value;
    else if(p.name==="STATUS") ev.status=p.value;
  }
  return evs;
}
function durMs(s){ // ISO 8601 διάρκεια, π.χ. PT1H30M, P1D
  var m=/^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(s||""); if(!m) return 0;
  return ((+m[1]||0)*7*86400+(+m[2]||0)*86400+(+m[3]||0)*3600+(+m[4]||0)*60+(+m[5]||0))*1000;
}
function dayKey(d){ return d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate(); }
function startOfDay(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addDays(d,n){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()+n); }
var WD={SU:0,MO:1,TU:2,WE:3,TH:4,FR:5,SA:6};

/* ---------- επαναλαμβανόμενα (RRULE): DAILY, WEEKLY, MONTHLY, YEARLY με INTERVAL, BYDAY, BYMONTHDAY, BYMONTH, UNTIL, COUNT ---------- */
function ruleObj(s){ var r={}; s.split(";").forEach(function(kv){ var e=kv.split("="); r[e[0]]=e[1]; }); return r; }
function nthWeekday(day, spec){ // spec "2TU", "-1FR", "MO"
  var m=/^([+-]?\d+)?([A-Z]{2})$/.exec(spec); if(!m || WD[m[2]]!==day.getDay()) return false;
  if(!m[1]) return true;
  var n=+m[1], dim=new Date(day.getFullYear(), day.getMonth()+1, 0).getDate();
  return n>0 ? Math.ceil(day.getDate()/7)===n : Math.ceil((dim-day.getDate()+1)/7)===-n;
}
function matches(r, s, day){
  var iv=+(r.INTERVAL||1);
  var days=Math.round((startOfDay(day)-startOfDay(s))/86400000);
  var months=(day.getFullYear()-s.getFullYear())*12+day.getMonth()-s.getMonth();
  if(r.BYMONTH && r.BYMONTH.split(",").map(Number).indexOf(day.getMonth()+1)<0) return false;
  var byday=r.BYDAY ? r.BYDAY.split(",") : null;
  var bymd=r.BYMONTHDAY ? r.BYMONTHDAY.split(",").map(Number) : null;
  function mdOk(){ var dim=new Date(day.getFullYear(),day.getMonth()+1,0).getDate();
    return bymd.some(function(n){ return n>0 ? day.getDate()===n : day.getDate()===dim+n+1; }); }
  switch(r.FREQ){
    case "DAILY":  return days%iv===0 && (!byday || byday.some(function(b){ return nthWeekday(day,b); }));
    case "WEEKLY":
      var w0=addDays(startOfDay(s), -((s.getDay()+6)%7)), weeks=Math.floor(Math.round((startOfDay(day)-w0)/86400000)/7);
      if(weeks%iv!==0) return false;
      return byday ? byday.some(function(b){ return WD[b.slice(-2)]===day.getDay(); }) : day.getDay()===s.getDay();
    case "MONTHLY":
      if(months%iv!==0) return false;
      if(byday) return byday.some(function(b){ return nthWeekday(day,b); });
      if(bymd) return mdOk();
      return day.getDate()===s.getDate();
    case "YEARLY":
      if((day.getFullYear()-s.getFullYear())%iv!==0) return false;
      if(!r.BYMONTH && day.getMonth()!==s.getMonth()) return false;
      if(byday) return byday.some(function(b){ return nthWeekday(day,b); });
      if(bymd) return mdOk();
      return day.getDate()===s.getDate();
  }
  return false;
}
// Όλες οι εμφανίσεις που πέφτουν μέσα στο [from, to)
function occurrences(evs, from, to){
  var out=[], overridden={};
  evs.forEach(function(e){ if(e.recId && e.uid) overridden[e.uid+"|"+e.recId]=1; });
  evs.forEach(function(e){
    if(e.status==="CANCELLED") return;
    var len = e.end ? e.end-e.start : (e.dur ? durMs(e.dur) : (e.allDay ? 86400000 : 0));
    function push(st){ var en=new Date(+st+len); if(en>from && st<to || (+st===+en && st>=from && st<to)) out.push({ title:e.title||"(χωρίς τίτλο)", start:st, end:en, allDay:e.allDay, cal:e.cal }); }
    if(!e.rrule || e.recId){ push(e.start); return; }
    var r=ruleObj(e.rrule), until=r.UNTIL ? parseDate(r.UNTIL).d : null, count=r.COUNT ? +r.COUNT : 0, n=0;
    var day=startOfDay(e.start), last=startOfDay(new Date(+to)), guard=0;
    while(day<=last && guard++<20000){
      if(until && day>until) break;
      if(matches(r, e.start, day)){
        n++; if(count && n>count) break;
        var st=new Date(day.getFullYear(), day.getMonth(), day.getDate(), e.start.getHours(), e.start.getMinutes());
        if(e.ex.indexOf(dayKey(st))<0 && !overridden[(e.uid||"")+"|"+dayKey(st)]) push(st);
      }
      day=addDays(day,1);
    }
  });
  return out.sort(function(a,b){ return (b.allDay-a.allDay) || (a.start-b.start); });
}

/* ---------- φόρτωση: κάθε ημερολόγιο χωριστά, ώστε αν αποτύχει ένα να φαίνονται τα υπόλοιπα ---------- */
var CAL_EVENTS=null, CAL_STALE=false, CAL_PER=[];   // CAL_PER[i] = { t, evs }
var HOLIDAY_EVERY_MS = 12*3600000;                    // οι αργίες αλλάζουν σπάνια
function httpsUrl(u){ return u.replace(/^webcal:\/\//i,"https://"); }
function packEv(e){ return {title:e.title,start:+e.start,end:e.end?+e.end:null,dur:e.dur,allDay:e.allDay,rrule:e.rrule,ex:e.ex,recId:e.recId,uid:e.uid,status:e.status,cal:e.cal}; }
function unpackEv(e){ e.start=new Date(e.start); if(e.end) e.end=new Date(e.end); return e; }
function loadCalendar(){
  if(DEMO){
    // δοκιμαστικά ημερολόγια, για να φαίνονται χρώματα και ονόματα και χωρίς dashboard-config.js
    CALENDARS=[{name:"Σπίτι",color:"#64d2ff"},{name:"Δουλειά",color:"#bf9cff"},{name:"Αργίες",color:"#ff8fb1"}];
    var t=new Date(), y=t.getFullYear(), m=t.getMonth(), d=t.getDate(), h=t.getHours();
    CAL_EVENTS=[{title:"Ημέρα των Ενόπλων Δυνάμεων",start:new Date(y,m,d+1),end:new Date(y,m,d+2),allDay:true,ex:[],cal:2},
      {title:"Οδοντίατρος",start:new Date(y,m,d,h,0),end:new Date(y,m,d,h+1,0),ex:[],cal:0},
      {title:"Γυμναστήριο",start:new Date(y,m,d+1,10,0),end:new Date(y,m,d+1,10,30),ex:[],cal:1},
      {title:"Συνάντηση ομάδας",start:new Date(y,m,d-14,14,0),end:new Date(y,m,d-14,15,30),rrule:"FREQ=WEEKLY;BYDAY=TH",ex:[],cal:1},
      {title:"Διακοπές Ζαγόρι",start:new Date(y,m,d+14),end:new Date(y,m,d+17),allDay:true,ex:[],cal:0},
      {title:"Χριστούγεννα",start:new Date(y,11,25),end:new Date(y,11,26),allDay:true,ex:[],cal:2}];
    drawAll(); return;
  }
  var saved=load("cal"), cached = saved && saved.v && saved.v.per ? saved.v.per : [];
  Promise.all(CALENDARS.map(function(c, i){
    var mem=CAL_PER[i] || (cached[i] ? { t:cached[i].t, evs:cached[i].evs.map(unpackEv) } : null);
    if(/holiday/.test(c.url) && mem && Date.now()-mem.t < HOLIDAY_EVERY_MS) return Promise.resolve({ ok:true, v:mem });
    return fetchT(httpsUrl(c.url), {}, 20000).then(function(r){ return r.text(); }).then(function(t){
      if(t.indexOf("BEGIN:VCALENDAR")<0) throw new Error("όχι ημερολόγιο");
      var evs=parseICS(t); evs.forEach(function(e){ e.cal=i; });
      return { ok:true, v:{ t:Date.now(), evs:evs } };
    }).catch(function(err){ return { ok:false, v:mem, err:err }; });
  })).then(function(res){
    CAL_STALE=false; var all=[], bad=[];
    res.forEach(function(r, i){ if(!r.ok){ bad.push(CALENDARS[i].name); CAL_STALE=true; } if(r.v){ CAL_PER[i]=r.v; all=all.concat(r.v.evs); } });
    if(!all.length && bad.length===CALENDARS.length){ $("cal-body").innerHTML='<div class="err">Δεν φορτώθηκε το ημερολόγιο. Νέα προσπάθεια σε λίγο.</div>'; }
    else { CAL_EVENTS=all; drawAll(); }
    try{ store("cal", { per: CAL_PER.map(function(p){ return p ? { t:p.t, evs:p.evs.map(packEv) } : null; }) }); }catch(e){}
    if(typeof mark==="function") mark("Ημερολόγιο", !bad.length, bad.length ? "χωρίς: "+bad.join(", ") : "");
  });
}
function calOf(o){ return CALENDARS[o.cal] || { name:"", color:"#98a3b2" }; }
function drawAll(){ drawCalendar(); drawMini(); if(/\bs3\b/.test(document.documentElement.className)) drawMonth(); }

/* ---------- μικρή κάρτα στην κύρια οθόνη ---------- */
function drawCalendar(){
  if(!CAL_EVENTS) return;
  var now=new Date(), today=startOfDay(now), tomorrow=addDays(today,1);
  // σήμερα: όσα δεν έχουν τελειώσει. Αν δεν μένει κανένα, τα αυριανά.
  var list=occurrences(CAL_EVENTS, today, tomorrow).filter(function(o){ return o.allDay || o.end>now; }), label="Σήμερα";
  if(!list.length){ list=occurrences(CAL_EVENTS, tomorrow, addDays(today,2)); label="Αύριο · "+DAYS_S[tomorrow.getDay()]+" "+tomorrow.getDate(); }
  // σήμερα και αύριο άδεια: δείξε την πρώτη επόμενη μέρα που έχει γεγονότα (έως 60 μέρες μπροστά)
  if(!list.length){
    for(var k=2;k<=60 && !list.length;k++){
      var dk=addDays(today,k); list=occurrences(CAL_EVENTS, dk, addDays(today,k+1));
      if(list.length) label="Επόμενο · "+DAYS_S[dk.getDay()]+" "+dk.getDate()+" "+MONTHS_G[dk.getMonth()].slice(0,3);
    }
  }
  $("cal-day").textContent = label + (CAL_STALE ? " · παλιά δεδομένα" : "");
  if(!list.length){ $("cal-body").innerHTML='<div class="cal-empty">Τίποτα προγραμματισμένο τους επόμενους 2 μήνες.</div>'; return; }
  var nextDone=false;
  var rows=list.slice(0, CAL_MAX_ROWS).map(function(o){
    var t, cls="", live = !o.allDay && o.start<=now && o.end>now;
    if(o.allDay) t='<span class="cal-t">Όλη μέρα</span>';
    else if(live) t='<span class="cal-t now"><i class="dot ok"></i>τώρα</span>';
    else { t='<span class="cal-t">'+hm(o.start)+'</span>'; if(!nextDone){ cls=" next"; nextDone=true; } }
    return '<div class="cal-row'+cls+'">'+t+'<span class="cal-s">'+esc(o.title)+'</span></div>';
  }).join("");
  var more=list.length-CAL_MAX_ROWS;
  $("cal-body").innerHTML='<div class="cal-list">'+rows+'</div>'+(more>0 ? '<div class="cal-more">και '+more+' ακόμα</div>' : '');
}

/* ---------- μικρός μήνας πάνω από τη λίστα (κύρια οθόνη) ---------- */
// Κουκκίδα κάτω από τις μέρες που έχουν γεγονότα, στο χρώμα του πρώτου ημερολογίου εκείνης της μέρας.
function drawMini(){
  var el=$("cal-mini"); if(!el) return;
  var now=new Date(), today=startOfDay(now), y=now.getFullYear(), m=now.getMonth();
  var first=new Date(y,m,1), lead=(first.getDay()+6)%7, dim=new Date(y,m+1,0).getDate();
  var dots={};
  if(CAL_EVENTS) occurrences(CAL_EVENTS, first, new Date(y,m+1,1)).forEach(function(o){
    var d=startOfDay(o.start), endD = addDays(startOfDay(new Date(Math.max(+o.start, +o.end-1))),1);
    for(var g=0; d<endD && g<62; g++, d=addDays(d,1)){ var k=dayKey(d); if(!dots[k]) dots[k]=calOf(o).color; }
  });
  var h='<div class="mm-t">'+MONTHS_N[m]+'</div><div class="mm-g"><b>Δ</b><b>Τ</b><b>Τ</b><b>Π</b><b>Π</b><b>Σ</b><b>Κ</b>';
  for(var i=0;i<lead;i++) h+='<span></span>';
  for(var n=1;n<=dim;n++){
    var d=new Date(y,m,n), wd=d.getDay(), cls = n===today.getDate() ? "td" : (d<today ? "past" : (wd===0||wd===6 ? "we" : ""));
    var dot = dots[dayKey(d)] && n!==today.getDate() ? '<i style="background:'+dots[dayKey(d)]+'"></i>' : '';
    h+='<span'+(cls?' class="'+cls+'"':'')+'>'+n+dot+'</span>';
  }
  el.innerHTML=h+'</div>';
}
$("cal-mini").addEventListener("click", function(){ var p=document.querySelector("#pager i:nth-child(3)"); if(p) p.click(); });

/* ---------- οθόνη 3: ημερολόγιο μήνα + επόμενα ---------- */
var MONTHS_N=["Ιανουάριος","Φεβρουάριος","Μάρτιος","Απρίλιος","Μάιος","Ιούνιος","Ιούλιος","Αύγουστος","Σεπτέμβριος","Οκτώβριος","Νοέμβριος","Δεκέμβριος"];
var M_UP_MAX = 6;                       // επόμενα γεγονότα κάτω από τον μήνα (2 στήλες x 3)
var mView = null, mSel = null;          // μήνας που φαίνεται, επιλεγμένη μέρα (ή null = "Επόμενα")
function monthReset(){ var t=new Date(); mView=new Date(t.getFullYear(), t.getMonth(), 1); mSel=null; }
function sameDay(a,b){ return a && b && a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
function drawMonth(){
  if(!mView) monthReset();
  var now=new Date(), today=startOfDay(now), y=mView.getFullYear(), m=mView.getMonth();
  var first=new Date(y,m,1), lead=(first.getDay()+6)%7, dim=new Date(y,m+1,0).getDate();
  var rows=Math.ceil((lead+dim)/7), gStart=addDays(first,-lead), gEnd=addDays(gStart, rows*7);
  $("m-title").innerHTML = MONTHS_N[m]+' <span>'+y+'</span>';
  $("m-today").hidden = (y===today.getFullYear() && m===today.getMonth() && !mSel);
  $("m-legend").innerHTML = CALENDARS.map(function(c){ return '<span><i style="background:'+c.color+'"></i>'+esc(c.name)+'</span>'; }).join("");
  // γεγονότα ανά μέρα (τα πολυήμερα σε κάθε μέρα που καλύπτουν)
  var byDay={}, occ = CAL_EVENTS ? occurrences(CAL_EVENTS, gStart, gEnd) : [];
  occ.forEach(function(o){
    var d=startOfDay(o.start), endD = o.allDay ? addDays(startOfDay(new Date(+o.end-1)),1) : addDays(startOfDay(new Date(Math.max(+o.start, +o.end-1))),1);
    for(var g=0; d<endD && g<62; g++, d=addDays(d,1)){ var k=dayKey(d); (byDay[k]=byDay[k]||[]).push(o); }
  });
  var html="";
  for(var i=0;i<rows*7;i++){
    var d=addDays(gStart,i), k=dayKey(d), evs=byDay[k]||[], cls="m-cell";
    if(d.getMonth()!==m) cls+=" out";
    if(d.getDay()===0 || d.getDay()===6) cls+=" we";
    if(sameDay(d,today)) cls+=" today";
    if(mSel && sameDay(d,mSel)) cls+=" sel";
    // Μήνας 6 εβδομάδων: 1 τίτλος με "+N" στην ίδια γραμμή. Μήνας 5 εβδομάδων: έως 2 τίτλοι, ή 1 τίτλος και "+N ακόμα".
    var more="", lab="";
    if(rows>=6 || evs.length<=2){
      var take = rows>=6 ? 1 : evs.length, rest = evs.length-take;
      lab = evs.slice(0,take).map(function(o, j){ return '<span class="m-ev"><i style="background:'+calOf(o).color+'"></i><span>'+esc(o.title)+'</span>'+(j===take-1 && rest>0 ? '<span class="m-more">+'+rest+'</span>' : '')+'</span>'; }).join("");
    } else {
      lab = '<span class="m-ev"><i style="background:'+calOf(evs[0]).color+'"></i><span>'+esc(evs[0].title)+'</span></span>';
      more = '<span class="m-more" style="padding-left:.5rem">+'+(evs.length-1)+' ακόμα</span>';
    }
    html += '<div class="'+cls+'" data-d="'+(+d)+'"><span class="m-n">'+d.getDate()+'</span>'+lab+more+'</div>';
  }
  $("m-grid").innerHTML = html;
  drawUpcoming();
}
function upRow(o, showDate){
  var c=calOf(o), d=o.start;
  var date = '<div class="m-date">'+(showDate ? DAYS_S[d.getDay()].toUpperCase()+'<b>'+d.getDate()+'</b>' : '')+'</div>';
  var time = '<div class="m-time">'+(o.allDay ? 'Όλη μέρα' : hm(o.start))+'</div>';
  if(mSel) return '<div class="m-row day">'+time+'<div class="m-what">'+esc(o.title)+'<small><i style="background:'+c.color+'"></i>'+esc(c.name)+'</small></div></div>';
  return '<div class="m-row">'+date+time+'<div class="m-what">'+esc(o.title)+'<small><i style="background:'+c.color+'"></i>'+esc(c.name)+'</small></div></div>';
}
function drawUpcoming(){
  var now=new Date(), list, title;
  if(mSel){
    list = CAL_EVENTS ? occurrences(CAL_EVENTS, mSel, addDays(mSel,1)) : [];
    title = DAYS[mSel.getDay()]+" "+mSel.getDate()+" "+MONTHS_G[mSel.getMonth()];
  } else {
    list = CAL_EVENTS ? occurrences(CAL_EVENTS, startOfDay(now), addDays(startOfDay(now),90)).filter(function(o){ return o.allDay ? o.end>startOfDay(now) : o.end>now; })
      .sort(function(a,b){ return startOfDay(a.start)-startOfDay(b.start) || (b.allDay-a.allDay) || (a.start-b.start); }) : [];
    title = "Επόμενα";
  }
  $("m-up-title").textContent = title + (CAL_STALE ? " · παλιά δεδομένα" : "");
  if(!list.length){ $("m-up-list").innerHTML='<div class="m-none">'+(mSel ? 'Τίποτα αυτή τη μέρα.' : 'Τίποτα τους επόμενους 3 μήνες.')+'</div>'; return; }
  // η ημερομηνία γράφεται μόνο στο πρώτο γεγονός κάθε μέρας· στη λίστα μιας μέρας δεν χρειάζεται καθόλου
  var prev=null, shown=list.slice(0, M_UP_MAX), more=list.length-shown.length;
  // σειρά ανά στήλη: πρώτα γεμίζει η αριστερή στήλη, μετά η δεξιά
  var half=Math.ceil(shown.length/2), cols=[shown.slice(0,half), shown.slice(half)], html=["",""];
  cols.forEach(function(col, ci){ prev=null; col.forEach(function(o){ var sd=!mSel && !sameDay(prev,o.start); html[ci]+=upRow(o, sd || (!mSel && prev===null)); prev=o.start; }); });
  $("m-up-list").innerHTML = '<div>'+html[0]+'</div><div>'+html[1]+(more>0 ? '<div class="m-none" style="font-size:.9375rem;color:var(--text-3)">και '+more+' ακόμα</div>' : '')+'</div>';
}
$("m-prev").addEventListener("click", function(){ mView=new Date(mView.getFullYear(), mView.getMonth()-1, 1); mSel=null; drawMonth(); });
$("m-next").addEventListener("click", function(){ mView=new Date(mView.getFullYear(), mView.getMonth()+1, 1); mSel=null; drawMonth(); });
$("m-today").addEventListener("click", function(){ monthReset(); drawMonth(); });
$("m-grid").addEventListener("click", function(e){
  var c=e.target.closest ? e.target.closest(".m-cell") : null; if(!c) return;
  var d=new Date(+c.getAttribute("data-d"));
  if(mSel && sameDay(mSel,d)) mSel=null;                        // δεύτερο πάτημα: πίσω στα "Επόμενα"
  else { mSel=d; if(d.getMonth()!==mView.getMonth()) mView=new Date(d.getFullYear(), d.getMonth(), 1); }
  drawMonth();
});
// όταν ανοίγει η οθόνη 3: πάντα ο τρέχων μήνας και τα επόμενα
var prevShown = window.onScreenShown;
window.onScreenShown = function(n){ if(prevShown) prevShown(n); if(n===2){ monthReset(); drawMonth(); } };

drawMini();      // ο μικρός μήνας φαίνεται αμέσως, οι κουκκίδες έρχονται με τη φόρτωση
loadCalendar();
setInterval(loadCalendar, CAL_EVERY_MIN*60000);
setInterval(drawAll, 60000);   // "τώρα", μετάβαση στο αύριο, αλλαγή μέρας στον μήνα
})();
