/* =====================================================================
   ネット予約システム — 共有データ層 (RDB)
   お客様画面(index) と 店舗管理(admin) が共有。バックエンド代わりに
   localStorage を使った提案デモ用実装。日付/時間枠/重複判定を含む。
   ※ 店名・メニューを差し替えれば、どの店舗向けにも再スキンできます。
   ===================================================================== */
(function (global) {
  "use strict";
  var KEY = "yoyaku_demo_v1";

  /* ---- 店舗設定（ここを変えれば別の店に再スキン）---- */
  var CONFIG = {
    shopName: "SALON LUMINA",
    shopNameJa: "サロン・ルミナ",
    tagline: "ネット予約（24時間受付）",
    openHour: 10, closeHour: 19, // 10:00–19:00
    slotMin: 30,                  // 予約枠の刻み
    closedWeekdays: [2],          // 火曜定休（0=日,1=月,...）
    seats: 1,                     // 同時に受けられる席数
    theme: "#1f6f6a"
  };

  var SERVICES = [
    { id: "cut",   name: "カット",            min: 60,  price: 4400, desc: "シャンプー・ブロー込み" },
    { id: "color", name: "カット＋カラー",     min: 120, price: 9900, desc: "似合わせカラー＋カット" },
    { id: "perm",  name: "パーマ",            min: 120, price: 8800, desc: "デジタル/コールド選択可" },
    { id: "treat", name: "トリートメント",     min: 30,  price: 3300, desc: "髪質改善・サラサラ仕上げ" },
    { id: "spa",   name: "ヘッドスパ",        min: 45,  price: 4400, desc: "頭皮ケア・極上リラックス" }
  ];

  /* ---- 日付ユーティリティ（ブラウザのDateを使用）---- */
  function pad(n){ return (n<10?"0":"")+n; }
  function ymd(d){ return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()); }
  function parseYmd(s){ var p=s.split("-"); return new Date(+p[0], +p[1]-1, +p[2]); }
  function addDays(d,n){ var x=new Date(d); x.setDate(x.getDate()+n); return x; }
  var WD = ["日","月","火","水","木","金","土"];
  function weekdayJa(s){ return WD[parseYmd(s).getDay()]; }
  function isClosed(s){ return CONFIG.closedWeekdays.indexOf(parseYmd(s).getDay()) >= 0; }

  function nextDates(n){
    var out=[], today=new Date();
    for (var i=0;i<n;i++){ var d=addDays(today,i); out.push(ymd(d)); }
    return out;
  }

  /* ---- localStorage ---- */
  function read(){ try{ return JSON.parse(localStorage.getItem(KEY)); }catch(e){ return null; } }
  function write(v){ localStorage.setItem(KEY, JSON.stringify(v)); }
  function getBookings(){ var s=read(); if(!s){ s=seed(); write(s); } return s.bookings; }
  function saveBookings(list){ write({ bookings:list }); }

  function genId(){ return "R"+Date.now().toString(36).toUpperCase()+Math.floor(Math.random()*900+100); }

  /* ---- 時間枠ロジック ---- */
  function slotList(){ // その日の全開始候補 ["10:00",...]
    var out=[];
    for (var h=CONFIG.openHour; h<CONFIG.closeHour; h++){
      for (var m=0; m<60; m+=CONFIG.slotMin){ out.push(pad(h)+":"+pad(m)); }
    }
    return out;
  }
  function toMin(t){ var p=t.split(":"); return (+p[0])*60+(+p[1]); }
  function closeMin(){ return CONFIG.closeHour*60; }

  // 指定日・サービスで、開始可能な時間枠を返す（重複・営業時間・席数を考慮）
  function availableSlots(date, serviceId){
    if (isClosed(date)) return [];
    var svc = getService(serviceId); if(!svc) return [];
    var dur = svc.min;
    var booked = getBookings().filter(function(b){ return b.date===date && b.status!=="cancel"; });
    var res=[];
    slotList().forEach(function(t){
      var start=toMin(t), end=start+dur;
      if (end > closeMin()) return; // 閉店をまたぐ
      // 重なる予約の数を数える（席数未満なら空き）
      var overlap = booked.filter(function(b){
        var bs=toMin(b.start), be=bs+getService(b.serviceId).min;
        return start < be && bs < end;
      }).length;
      if (overlap < CONFIG.seats) res.push(t);
    });
    return res;
  }

  function dayStatus(date, serviceId){ // ◯ △ × 休
    if (isClosed(date)) return { mark:"休", n:0 };
    var n = availableSlots(date, serviceId||"cut").length;
    if (n===0) return { mark:"×", n:0 };
    if (n<=4) return { mark:"△", n:n };
    return { mark:"◯", n:n };
  }

  function getService(id){ return SERVICES.filter(function(s){return s.id===id;})[0]; }

  /* ---- 予約の作成・更新 ---- */
  function addBooking(b){
    var list=getBookings();
    b.id=genId(); b.status="confirmed"; b.createdAt=Date.now();
    list.push(b); saveBookings(list); return b;
  }
  function setStatus(id, status){
    var list=getBookings();
    list.forEach(function(b){ if(b.id===id) b.status=status; });
    saveBookings(list);
  }
  function resetAll(){ localStorage.removeItem(KEY); }

  /* ---- 集計（管理ダッシュボード用）---- */
  function stats(){
    var list=getBookings().filter(function(b){return b.status!=="cancel";});
    var today=ymd(new Date());
    var week = nextDates(7);
    var byService={}; SERVICES.forEach(function(s){byService[s.id]=0;});
    var todayCount=0, weekCount=0, weekRevenue=0;
    list.forEach(function(b){
      byService[b.serviceId]=(byService[b.serviceId]||0)+1;
      if (b.date===today) todayCount++;
      if (week.indexOf(b.date)>=0){ weekCount++; weekRevenue += getService(b.serviceId).price; }
    });
    return { total:list.length, todayCount:todayCount, weekCount:weekCount, weekRevenue:weekRevenue, byService:byService };
  }

  /* ---- 初期サンプル予約（管理画面を“動いてる風”に）---- */
  function seed(){
    var names=["佐藤 美咲","鈴木 健","高橋 由美","田中 翔","渡辺 彩","伊藤 大輔","山本 さくら","中村 拓也"];
    var tels=["090-1111-0001","080-2222-0002","070-3333-0003","090-4444-0004","080-5555-0005","070-6666-0006","090-7777-0007","080-8888-0008"];
    var svcIds=["cut","color","spa","treat","perm","cut","color","cut"];
    var plan=[ // [dayOffset, "HH:MM", idx]
      [0,"10:00",0],[0,"11:30",1],[0,"14:00",2],[0,"16:00",3],
      [1,"10:30",4],[1,"13:00",5],[1,"15:30",6],
      [3,"11:00",7],[3,"14:30",0],
      [4,"10:00",1],[4,"16:30",2]
    ];
    var list=[]; var dates=nextDates(14);
    plan.forEach(function(p, i){
      var date=dates[p[0]]; if(isClosed(date)) date=dates[p[0]+1]||dates[p[0]];
      var sid=svcIds[p[2]%svcIds.length];
      list.push({ id:"SEED"+i, status:"confirmed", date:date, start:p[1],
        serviceId:sid, name:names[p[2]%names.length], tel:tels[p[2]%tels.length],
        email:"", note:"", createdAt:Date.now()-(i*3600000) });
    });
    return { bookings:list };
  }

  global.RDB = {
    CONFIG:CONFIG, SERVICES:SERVICES,
    nextDates:nextDates, weekdayJa:weekdayJa, isClosed:isClosed, ymd:ymd,
    getService:getService, getBookings:getBookings,
    availableSlots:availableSlots, dayStatus:dayStatus,
    addBooking:addBooking, setStatus:setStatus, resetAll:resetAll, stats:stats
  };
})(window);
