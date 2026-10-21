/* ============================================================================
 * Construction Passport — WYSIWYG markup overlay
 * Injected into the Expo Web build. Rides on top of the REAL app, so what Sam
 * and Jacob mark up is the actual UI, always in sync with the shipped code.
 *
 * Notes, images and freehand drawings attach to the CURRENT screen (the route
 * path) and are shared through the same Supabase Storage board the standalone
 * wireframes use (anon key, public bucket — no server code needed).
 * ==========================================================================*/
(function () {
  var BASE = "https://untoyialszpcvpsqujsy.supabase.co";
  var ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVudG95aWFsc3pwY3Zwc3F1anN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MjM1NjQsImV4cCI6MjA5ODQ5OTU2NH0.3EFlCQWPbNorKOX2lkNiiq4hnEvg5Tuxervx-aeLAJU";
  var BUCKET = "certs";
  function safeSlug(s){ return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""); }

  // ---- config from THIS script's URL: ?board=<slug>&frame=phone|tablet|full&root=<css selector>
  // Makes one overlay serve every project: mobile apps (phone frame) and full websites (full).
  var cfg = (function(){ var s=document.currentScript; if(!s){ var a=document.getElementsByTagName("script"); for(var i=a.length-1;i>=0;i--){ if(/markup-overlay/.test(a[i].src||"")){ s=a[i]; break; } } } var q={}; try{ if(s&&s.src){ var u=new URL(s.src, location.href); u.searchParams.forEach(function(v,k){ q[k.toLowerCase()]=v; }); } }catch(_){} return q; })();
  var BOARD = (cfg.board||"").trim();
  // Namespace boards per app when a board id is given; blank keeps the original path (back-compat).
  var PREFIX = "webmarkup/" + (BOARD ? (safeSlug(BOARD)+"/") : "");
  var ROOT_SEL = cfg.root || "#root";
  var FRAME_W = { phone:440, tablet:834, full:0, web:0, none:0 };
  var curFrame = ((localStorage.getItem("cpmk-frame")||cfg.frame||"phone")).toLowerCase(); if(!(curFrame in FRAME_W)) curFrame="phone";
  var author = ""; // start in read-only "Demo" view; marks show only after a name is chosen

  var root = document.querySelector(ROOT_SEL) || document.getElementById("root") || document.body;
  var rootIsBody = (root===document.body || root===document.documentElement);

  // Base styles (always) + a togglable device-frame (phone / tablet / full width).
  var baseStyle=document.createElement("style"); baseStyle.textContent=".cpmk-hidden{display:none!important}@media print{.cpmk-ui{display:none!important}}"; document.head.appendChild(baseStyle);
  var frameStyle=document.createElement("style"); document.head.appendChild(frameStyle);
  var layersReady=false; // positionOverlay touches the canvas/pins layers; don't call it until they exist
  function applyFrame(){ var w=FRAME_W[curFrame]||0; var sel=rootIsBody?"body":ROOT_SEL;
    if(w){ frameStyle.textContent="body{background:#e7ebf0!important} "+sel+"{max-width:"+w+"px;margin:0 auto;min-height:100vh;background:#fff;position:relative;box-shadow:0 0 0 1px #cdd5df,0 12px 50px #0003}"; }
    else { frameStyle.textContent=""; } // full: no constraint, the site/app uses its own responsive width
    if(layersReady && typeof positionOverlay==="function") positionOverlay();
  }
  applyFrame();

  // ---- storage helpers (proven: put / list / public get) ----
  function safe(s){ return (String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"")) || "anon"; }
  function put(path, body, ct){ return fetch(BASE+"/storage/v1/object/"+BUCKET+"/"+path, {method:"POST", headers:{apikey:ANON,Authorization:"Bearer "+ANON,"Content-Type":ct,"x-upsert":"true","cache-control":"no-cache"}, body:body}); }
  function list(){ return fetch(BASE+"/storage/v1/object/list/"+BUCKET, {method:"POST", headers:{apikey:ANON,Authorization:"Bearer "+ANON,"Content-Type":"application/json"}, body:JSON.stringify({prefix:PREFIX,limit:1000})}).then(function(r){return r.ok?r.json():[];},function(){return [];}); }
  function pub(path){ return BASE+"/storage/v1/object/public/"+BUCKET+"/"+path; }

  function routeKey(){ return (location.pathname || "/").replace(/\/+$/,"") || "/"; }
  function downscale(file, cb){ var r=new FileReader(); r.onload=function(){ var im=new Image(); im.onload=function(){ var max=1100,w=im.width,h=im.height; if(w>max||h>max){ if(w>h){h=Math.round(h*max/w);w=max;}else{w=Math.round(w*max/h);h=max;} } var c=document.createElement("canvas"); c.width=w; c.height=h; c.getContext("2d").drawImage(im,0,0,w,h); c.toBlob(function(b){cb(b);},"image/jpeg",0.72); }; im.onerror=function(){cb(null);}; im.src=r.result; }; r.readAsDataURL(file); }

  // mine = { author, updatedAt, screens: { "<route>": { note, images:[url], drawing:dataURL } } }
  var mine = { author: author, updatedAt: "", screens: {} };
  try { var cached = JSON.parse(localStorage.getItem("cpmk-mine")||"null"); if(cached) mine = cached; } catch(e){}
  var others = []; // [{author, screens}]

  var COLORS = ["#e5484d","#2f6fed","#111111"];
  var drawMode = false, penColor = COLORS[0], erase = false;

  // ---- UI shell (floating button + panel) ----
  var btn = document.createElement("button");
  btn.className = "cpmk-ui";
  btn.style.cssText = "position:fixed;right:14px;bottom:14px;z-index:2147483000;background:#43607d;color:#fff;border:none;border-radius:24px;padding:11px 16px;font:600 14px system-ui;box-shadow:0 4px 14px #0004;cursor:pointer";
  btn.textContent = "✏️ Markup";
  document.body.appendChild(btn);

  // Always-visible aspect selector next to Markup: tap to cycle phone / tablet / full width.
  var FRAME_ICON = { phone:"📱", tablet:"▭", full:"🖥", web:"🖥", none:"🖥" };
  var frameBtn = document.createElement("button"); frameBtn.className="cpmk-ui"; frameBtn.style.cssText="position:fixed;right:120px;bottom:14px;z-index:2147483000;background:#fff;color:#43607d;border:1px solid #43607d;border-radius:24px;padding:11px 13px;font:600 15px system-ui;box-shadow:0 4px 14px #0004;cursor:pointer"; document.body.appendChild(frameBtn);
  function updateFrameBtn(){ frameBtn.textContent=FRAME_ICON[curFrame]||"📱"; frameBtn.title="View width: "+curFrame+" - tap to change (phone / tablet / full)"; }
  function setFrame(f){ curFrame=f; try{localStorage.setItem("cpmk-frame",f);}catch(_){} applyFrame(); scroller=null; // width changed: re-find the scroller and re-settle a few times as layout reflows
    if(layersReady){ fit(); loadDrawing(); [120,350,700].forEach(function(ms){ setTimeout(function(){ if(layersReady){ fit(); loadDrawing(); } }, ms); }); }
    if(typeof render==="function") render(); updateFrameBtn(); }
  frameBtn.onclick=function(){ var order=["phone","tablet","full"]; var i=(order.indexOf(curFrame)+1)%order.length; if(i<0) i=0; setFrame(order[i]); };
  updateFrameBtn();

  var panel = document.createElement("div");
  panel.className = "cpmk-ui cpmk-hidden";
  panel.style.cssText = "position:fixed;right:14px;bottom:64px;z-index:2147483000;width:300px;max-height:70vh;overflow:auto;background:#fff;border:1px solid #cdd5df;border-radius:14px;box-shadow:0 10px 40px #0004;padding:12px;font:13px system-ui;color:#1f2933";
  document.body.appendChild(panel);

  btn.onclick = function(){ panel.classList.toggle("cpmk-hidden"); if(!panel.classList.contains("cpmk-hidden")){ render(); refresh(); } };

  // Append to document.body (NOT #root - React wipes children it doesn't own). To make
  // drawings STICK to the app content when it scrolls, we size the canvas to the full
  // scrollable content height and translate it by the scroll offset. React Native Web
  // scrolls an inner div, so we catch scroll in the capture phase. getBoundingClientRect
  // (used in P()) accounts for the transform, so stroke coords land in content space.
  var othersImg = document.createElement("div"); othersImg.className="cpmk-ui"; othersImg.style.cssText="position:fixed;pointer-events:none;z-index:2147482000;overflow:hidden;"; document.body.appendChild(othersImg);
  var canvas = document.createElement("canvas"); canvas.className="cpmk-ui"; canvas.style.cssText="position:fixed;pointer-events:none;z-index:2147482500;touch-action:none;"; document.body.appendChild(canvas);
  var ctx = canvas.getContext("2d");
  // Pinned comments layer (above the canvas so pins stay tappable; layer itself lets clicks through).
  var pinsLayer = document.createElement("div"); pinsLayer.className="cpmk-ui"; pinsLayer.style.cssText="position:fixed;pointer-events:none;z-index:2147482800;"; document.body.appendChild(pinsLayer);
  var scroller = null;
  function findScroller(){ var best=null,bestH=0,els=root.querySelectorAll("*"); for(var i=0;i<els.length;i++){ var el=els[i],oy=getComputedStyle(el).overflowY; if((oy==="auto"||oy==="scroll")&&el.scrollHeight>el.clientHeight+4&&el.scrollHeight>bestH){bestH=el.scrollHeight;best=el;} } return best; }
  function ensureScroller(){ if(!scroller || !document.contains(scroller)) scroller=findScroller(); }
  function scrollTopNow(){ return scroller ? scroller.scrollTop : (window.scrollY||document.documentElement.scrollTop||0); }
  function contentH(){ ensureScroller(); return Math.max(Math.round(window.innerHeight), scroller ? scroller.scrollHeight : (document.documentElement.scrollHeight||window.innerHeight)); }
  function syncScroll(){ if(!canvas||!othersImg||!pinsLayer) return; var t="translateY("+(-Math.round(scrollTopNow()))+"px)"; canvas.style.transform=t; othersImg.style.transform=t; pinsLayer.style.transform=t; }
  function positionOverlay(){ if(!canvas||!othersImg||!pinsLayer) return; var r=root.getBoundingClientRect(); var left=Math.max(0,Math.round(r.left)), width=Math.max(1,Math.round(r.width)), h=contentH();
    [othersImg, canvas, pinsLayer].forEach(function(el){ if(!el) return; el.style.left=left+"px"; el.style.top="0px"; el.style.width=width+"px"; el.style.height=h+"px"; }); syncScroll(); }
  function fit(){ positionOverlay(); var W=Math.max(1,Math.round(root.getBoundingClientRect().width)), H=Math.max(1,Math.round(contentH())); if(canvas.width!==W||canvas.height!==H){ canvas.width=W; canvas.height=H; } }
  layersReady=true; positionOverlay();
  // Capture phase catches scrolling on inner ScrollView divs (scroll events don't bubble).
  document.addEventListener("scroll", function(e){ if(e.target && e.target.nodeType===1 && root.contains(e.target)) scroller=e.target; syncScroll(); }, true);
  window.addEventListener("scroll", syncScroll, { passive:true });
  // Belt-and-braces: a light rAF loop keeps the drawing pinned to the scroll offset every
  // frame, so it always tracks the content (no need to toggle Draw to re-align).
  var _lastY = -1;
  (function raf(){ ensureScroller(); var y=Math.round(scrollTopNow()); if(y!==_lastY){ _lastY=y; var t="translateY("+(-y)+"px)"; canvas.style.transform=t; othersImg.style.transform=t; pinsLayer.style.transform=t; } requestAnimationFrame(raf); })();

  function status(m){ var s=document.getElementById("cpmk-status"); if(s) s.textContent=m; }
  var saveT, touched = {}, authorsList = [];
  function markTouched(){ if(author) touched[routeKey()] = true; }
  function persistLocal(){ mine.author=author; mine.updatedAt=new Date().toISOString(); try{ localStorage.setItem("cpmk-mine", JSON.stringify(mine)); }catch(e){} }
  function scr(){ var k=routeKey(); if(!mine.screens[k]) mine.screens[k]={note:"",images:[],drawing:null}; return mine.screens[k]; }
  function screenHas(s){ return !!(s && (s.note || (s.images&&s.images.length) || s.drawing || (s.strokes&&s.strokes.length) || (s.pins&&s.pins.length))); }
  // MERGE on save: fetch the current server board and apply ONLY the screens this session
  // actually touched. An empty or stale session therefore can NEVER wipe screens saved
  // earlier or on another device. Deletions on touched screens still take effect.
  function commit(){ if(!author) return Promise.resolve(); persistLocal(); var path=PREFIX+"board_"+safe(author)+".json"; status("Saving…");
    return fetch(pub(path)+"?t="+Date.now(),{cache:"no-store"}).then(function(r){ return r.ok?r.json():null; }, function(){ return null; }).then(function(server){
      var screens = (server && server.screens) ? Object.assign({}, server.screens) : {};
      Object.keys(touched).forEach(function(k){ var s=mine.screens[k]; if(screenHas(s)) screens[k]=s; else delete screens[k]; });
      mine = { author:author, updatedAt:new Date().toISOString(), screens:screens };
      try{ localStorage.setItem("cpmk-mine", JSON.stringify(mine)); }catch(e){}
      return put(path, JSON.stringify(mine), "application/json");
    }).then(function(r){ status(r&&r.ok?"Saved to shared board ✓":"Saved on this device"); }, function(){ status("Saved on this device"); });
  }
  function save(){ if(!ensureName()) return; markTouched(); persistLocal(); clearTimeout(saveT); saveT=setTimeout(commit,700); }
  function saveNow(){ if(!ensureName()) return; markTouched(); clearTimeout(saveT); commit(); }
  function clearAllMine(){ if(!confirm("Remove ALL your notes, images and drawings on EVERY screen? (Others keep theirs.)")) return; mine={author:author,updatedAt:new Date().toISOString(),screens:{}}; touched={}; try{ localStorage.setItem("cpmk-mine", JSON.stringify(mine)); }catch(e){} try{ ctx.clearRect(0,0,canvas.width,canvas.height); }catch(e){} if(author){ put(PREFIX+"board_"+safe(author)+".json", JSON.stringify(mine), "application/json"); } render(); status("Cleared all your marks ✓"); }
  // Delete another name's board (code-confirmed). Anon can't DELETE storage objects, so we
  // overwrite with an empty board, which renders as nothing.
  function deleteAuthor(name){ if(!name) return; var code=Math.random().toString(36).slice(2,6).toUpperCase(); var ans=(prompt('Delete ALL marks by "'+name+'"? This cannot be undone.\n\nType this code to confirm: '+code, "")||"").trim().toUpperCase(); if(ans!==code){ status("Delete cancelled"); return; } put(PREFIX+"board_"+safe(name)+".json", JSON.stringify({author:"",screens:{}}), "application/json").then(function(){ if(safe(name)===safe(author)){ mine={author:author,updatedAt:"",screens:{}}; touched={}; } status('Deleted "'+name+'"'); refresh(); }); }
  // Adopt a name: load THAT name's existing board before any edit, so we never start empty.
  function adoptAuthor(name){ author=(name||"").trim(); try{localStorage.setItem("cpwf-author",author);}catch(e){} touched={}; render(); refresh(); }
  // Read-only Demo view: no name selected, so NO marks are shown until a user is chosen.
  function setDemo(){ author=""; try{localStorage.removeItem("cpwf-author");}catch(_){} touched={}; try{ ctx.clearRect(0,0,canvas.width,canvas.height); }catch(_){} if(othersImg) othersImg.innerHTML=""; if(pinsLayer) pinsLayer.innerHTML=""; render(); status("Demo view - pick a name to add or see marks"); }
  function ensureName(){ if(author) return true; var n=(prompt("Enter your name (so everyone can tell marks apart):")||"").trim(); if(!n) return false; adoptAuthor(n); return true; }

  // ---- drawing ----
  // Strokes are stored as point arrays in content coordinates, so they render at the exact
  // same spot every time (no image stretching = no drift), and a tap can delete one whole.
  // Curly-brace between two points (spans a range of the design). Tip pokes out perpendicular.
  function drawBrace(a,b){ var dx=b.x-a.x, dy=b.y-a.y, L=Math.hypot(dx,dy)||1; var nx=-dy/L, ny=dx/L; var d=Math.max(10,Math.min(28,L*0.12)); var ox=nx*d, oy=ny*d; var mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
    ctx.beginPath(); ctx.moveTo(a.x,a.y);
    ctx.quadraticCurveTo(a.x+ox,a.y+oy,(a.x+mx)/2+ox,(a.y+my)/2+oy);
    ctx.quadraticCurveTo(mx+ox,my+oy,mx+2*ox,my+2*oy);
    ctx.quadraticCurveTo(mx+ox,my+oy,(mx+b.x)/2+ox,(my+b.y)/2+oy);
    ctx.quadraticCurveTo(b.x+ox,b.y+oy,b.x,b.y);
    ctx.stroke(); }
  function drawStroke(st){ var p=st.pts; if(!p||!p.length) return; ctx.globalCompositeOperation="source-over"; ctx.strokeStyle=st.color||"#e5484d"; ctx.lineWidth=st.width||3; ctx.lineCap="round"; ctx.lineJoin="round"; if(st.tool==="brace" && p.length>=2){ drawBrace(p[0],p[1]); return; } ctx.beginPath(); ctx.moveTo(p[0].x,p[0].y); if(p.length===1){ ctx.lineTo(p[0].x+0.1,p[0].y+0.1); } else { for(var i=1;i<p.length;i++) ctx.lineTo(p[i].x,p[i].y); } ctx.stroke(); }
  function renderStrokes(preview){ ctx.clearRect(0,0,canvas.width,canvas.height); (scr().strokes||[]).forEach(drawStroke); if(preview) drawStroke(preview); }
  function pngNow(){ try{ return canvas.toDataURL("image/png"); }catch(_){ return null; } }
  function loadDrawing(){ fit(); if(!author){ ctx.clearRect(0,0,canvas.width,canvas.height); return; } var s=scr(); if(s.strokes && s.strokes.length){ renderStrokes(); return; } ctx.clearRect(0,0,canvas.width,canvas.height); var d=s.drawing; if(!d) return; var img=new Image(); img.onload=function(){ var w=canvas.width; var h=img.width?Math.round(img.height*(w/img.width)):img.height; if(canvas.height<h) canvas.height=h; ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(img,0,0,w,h); }; img.src=d; }
  function reflow(){ loadDrawing(); setTimeout(loadDrawing, 350); }
  function setDraw(on){ drawMode=on; canvas.style.pointerEvents=on?"auto":"none"; drawBar.classList.toggle("cpmk-hidden",!on); if(on){ loadDrawing(); } render(); }
  var drawing=false,tool="pen",curStroke=null;
  function P(e){ var r=canvas.getBoundingClientRect(); return {x:(e.clientX-r.left)*canvas.width/r.width, y:(e.clientY-r.top)*canvas.height/r.height}; }
  function distSeg(p,a,b){ var dx=b.x-a.x, dy=b.y-a.y; if(dx===0&&dy===0) return Math.hypot(p.x-a.x,p.y-a.y); var t=((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy); t=Math.max(0,Math.min(1,t)); return Math.hypot(p.x-(a.x+t*dx), p.y-(a.y+t*dy)); }
  function strokeDist(p,st){ var q=st.pts||[]; if(q.length<2) return q.length?Math.hypot(p.x-q[0].x,p.y-q[0].y):Infinity; var m=Infinity; for(var i=1;i<q.length;i++) m=Math.min(m,distSeg(p,q[i-1],q[i])); return m; }
  function eraseAt(p){ var arr=scr().strokes||[]; var best=-1,bd=Infinity; for(var i=0;i<arr.length;i++){ var d=strokeDist(p,arr[i]); if(d<bd){ bd=d; best=i; } } var thr=Math.max(16, canvas.width*0.05); if(best>=0 && bd<=thr){ arr.splice(best,1); scr().strokes=arr; renderStrokes(); scr().drawing=pngNow(); save(); status("Erased a mark"); } else { status("Tap right on a mark to erase it"); } }
  canvas.addEventListener("pointerdown",function(e){ if(!drawMode) return; var p=P(e);
    if(erase){ eraseAt(p); e.preventDefault(); return; }
    drawing=true; curStroke={ tool:tool, color:penColor, width:3, pts:[p] };
    try{canvas.setPointerCapture(e.pointerId);}catch(_){} e.preventDefault(); });
  canvas.addEventListener("pointermove",function(e){ if(!drawing||!curStroke) return; var p=P(e);
    if(tool==="line"||tool==="brace") curStroke.pts=[curStroke.pts[0], p]; else curStroke.pts.push(p);
    renderStrokes(curStroke); e.preventDefault(); });
  function endStroke(){ if(!drawing) return; drawing=false; if(curStroke && curStroke.pts && curStroke.pts.length){ var arr=scr().strokes||[]; arr.push(curStroke); scr().strokes=arr; } curStroke=null; renderStrokes(); scr().drawing=pngNow(); save(); }
  canvas.addEventListener("pointerup",endStroke); canvas.addEventListener("pointercancel",endStroke);

  // ---- pinned comments: place the written comment at a precise spot; collapses to a pin ----
  function currentNote(){ return (scr().note||"").trim(); }
  function startPin(){ if(!ensureName()) return; var text=currentNote(); if(!text){ status("Type a comment first, then Pin it"); return; }
    if(drawMode) setDraw(false);
    var ov=document.createElement("div"); ov.className="cpmk-ui"; ov.style.cssText="position:fixed;left:"+(canvas.style.left||"0px")+";top:0;width:"+(canvas.style.width||"100%")+";height:100vh;z-index:2147483200;cursor:crosshair;background:rgba(67,96,125,0.06)";
    var tip=document.createElement("div"); tip.textContent="Tap where this comment belongs (or right-click to cancel)"; tip.style.cssText="position:fixed;top:10px;left:50%;transform:translateX(-50%);background:#43607d;color:#fff;padding:5px 12px;border-radius:14px;font:600 12px system-ui;z-index:2147483300"; document.body.appendChild(tip);
    function done(){ try{document.body.removeChild(ov);}catch(_){} try{document.body.removeChild(tip);}catch(_){} }
    ov.addEventListener("pointerdown",function(e){ var r=canvas.getBoundingClientRect(); var x=(e.clientX-r.left)*canvas.width/r.width, y=(e.clientY-r.top)*canvas.height/r.height; done(); addPin(x,y,text); });
    ov.addEventListener("contextmenu",function(e){ e.preventDefault(); done(); });
    document.body.appendChild(ov);
  }
  function addPin(x,y,text){ var s=scr(); s.pins=s.pins||[]; s.pins.push({ id:"p"+Date.now()+"_"+Math.floor(Math.random()*1000), x:Math.round(x), y:Math.round(y), text:text }); s.note=""; markTouched(); save(); render(); renderPins(); status("Comment pinned ✓"); }
  function renderPins(){ if(!pinsLayer) return; pinsLayer.innerHTML=""; if(!author) return; var k=routeKey(); var list=[];
    (scr().pins||[]).forEach(function(p){ list.push({p:p, author:author||"Me", mine:true}); });
    others.forEach(function(o){ var ps=(o.screens&&o.screens[k]&&o.screens[k].pins)||[]; ps.forEach(function(p){ list.push({p:p, author:o.author||"Someone", mine:false}); }); });
    function coordsFrom(e){ var r=canvas.getBoundingClientRect(); return { x:(e.clientX-r.left)*canvas.width/r.width, y:(e.clientY-r.top)*canvas.height/r.height }; }
    list.forEach(function(it){ var p=it.p; var el=document.createElement("div"); el.style.cssText="position:absolute;left:"+p.x+"px;top:"+p.y+"px;transform:translate(-50%,-50%);pointer-events:auto";
      var dot=document.createElement("div"); dot.textContent="💬"; dot.title=it.author+": "+p.text; dot.style.cssText="width:26px;height:26px;border-radius:50% 50% 50% 2px;background:#fff8e6;border:2px solid "+(it.mine?"#43607d":"#c99a2e")+";display:flex;align-items:center;justify-content:center;font-size:13px;cursor:"+(it.mine?"grab":"pointer")+";box-shadow:0 2px 6px #0004;touch-action:none";
      var open=false, bubble=null;
      function toggleBubble(){ if(open){ if(bubble){el.removeChild(bubble);bubble=null;} open=false; return; } open=true;
        bubble=document.createElement("div"); bubble.style.cssText="position:absolute;left:18px;top:-6px;min-width:140px;max-width:230px;background:#fff;border:1px solid #cdd5df;border-radius:10px;padding:8px 10px;box-shadow:0 6px 20px #0005;font:12px system-ui;color:#1f2933";
        var who=document.createElement("div"); who.style.cssText="font-weight:700;color:#7a6b30;margin-bottom:2px"; who.textContent=it.author; bubble.appendChild(who);
        var tx=document.createElement("div"); tx.style.whiteSpace="pre-wrap"; tx.textContent=p.text; bubble.appendChild(tx);
        if(it.mine){ var actions=document.createElement("div"); actions.style.cssText="margin-top:6px;display:flex;gap:14px";
          var edit=document.createElement("span"); edit.textContent="Edit"; edit.style.cssText="color:#2f6fed;cursor:pointer;font-weight:700"; edit.onclick=function(e2){ e2.stopPropagation(); var nt=prompt("Edit comment:", p.text); if(nt!==null){ p.text=(nt||"").trim(); markTouched(); save(); renderPins(); } };
          var del=document.createElement("span"); del.textContent="Delete"; del.style.cssText="color:#e5484d;cursor:pointer;font-weight:700"; del.onclick=function(e2){ e2.stopPropagation(); var arr=scr().pins||[]; for(var j=0;j<arr.length;j++){ if(arr[j].id===p.id){ arr.splice(j,1); break; } } markTouched(); save(); renderPins(); };
          actions.appendChild(edit); actions.appendChild(del); bubble.appendChild(actions);
          var hint=document.createElement("div"); hint.textContent="Tip: drag the pin to move it"; hint.style.cssText="margin-top:4px;color:#8a97a6;font-size:11px"; bubble.appendChild(hint);
        }
        el.appendChild(bubble); }
      if(it.mine){
        var dragging=false, moved=false, startc=null;
        dot.addEventListener("pointerdown",function(e){ dragging=true; moved=false; startc=coordsFrom(e); try{dot.setPointerCapture(e.pointerId);}catch(_){} dot.style.cursor="grabbing"; e.stopPropagation(); e.preventDefault(); });
        dot.addEventListener("pointermove",function(e){ if(!dragging) return; var c=coordsFrom(e); if(moved || Math.hypot(c.x-startc.x,c.y-startc.y)>6){ moved=true; el.style.left=c.x+"px"; el.style.top=c.y+"px"; } e.preventDefault(); });
        dot.addEventListener("pointerup",function(e){ if(!dragging) return; dragging=false; dot.style.cursor="grab"; if(moved){ var c=coordsFrom(e); p.x=Math.round(c.x); p.y=Math.round(c.y); markTouched(); save(); status("Comment moved"); } else { toggleBubble(); } e.stopPropagation(); });
      } else {
        dot.onclick=function(ev){ ev.stopPropagation(); toggleBubble(); };
      }
      el.appendChild(dot); pinsLayer.appendChild(el);
    });
  }

  var drawBar=document.createElement("div"); drawBar.className="cpmk-ui cpmk-hidden"; drawBar.style.cssText="position:fixed;left:50%;transform:translateX(-50%);bottom:14px;z-index:2147483000;display:flex;gap:6px;align-items:center;background:#fff;border:1px solid #cdd5df;border-radius:12px;padding:6px 10px;box-shadow:0 6px 20px #0004";
  COLORS.forEach(function(c){ var sw=document.createElement("button"); sw.style.cssText="width:20px;height:20px;border-radius:50%;border:2px solid #fff;outline:1px solid #ccc;background:"+c+";cursor:pointer;padding:0"; sw.onclick=function(){ penColor=c; erase=false; updateDrawBar(); }; drawBar.appendChild(sw); drawBar["sw_"+c]=sw; });
  var lineBtn=document.createElement("button"); lineBtn.textContent="╱ Line"; lineBtn.title="Straight line: press, drag, release"; lineBtn.style.cssText="cursor:pointer;border:1px solid #cdd5df;border-radius:6px;background:#fff;padding:2px 7px;font-size:12px"; lineBtn.onclick=function(){ tool=(tool==="line"?"pen":"line"); erase=false; updateDrawBar(); }; drawBar.appendChild(lineBtn);
  var braceBtn=document.createElement("button"); braceBtn.textContent="{ Span"; braceBtn.title="Curly brace to mark a span: press, drag, release"; braceBtn.style.cssText="cursor:pointer;border:1px solid #cdd5df;border-radius:6px;background:#fff;padding:2px 7px;font-size:12px"; braceBtn.onclick=function(){ tool=(tool==="brace"?"pen":"brace"); erase=false; updateDrawBar(); }; drawBar.appendChild(braceBtn);
  var erBtn=document.createElement("button"); erBtn.textContent="🩹 Erase"; erBtn.title="Erase: tap a mark to remove that whole stroke"; erBtn.style.cssText="cursor:pointer;border:1px solid #cdd5df;border-radius:6px;background:#fff;padding:2px 7px;font-size:12px"; erBtn.onclick=function(){ erase=!erase; if(erase) tool="pen"; updateDrawBar(); }; drawBar.appendChild(erBtn);
  var clrBtn=document.createElement("button"); clrBtn.textContent="Clear"; clrBtn.style.cssText="cursor:pointer;border:1px solid #cdd5df;border-radius:6px;background:#fff;padding:2px 8px;font-size:12px"; clrBtn.onclick=function(){ scr().strokes=[]; scr().drawing=null; ctx.clearRect(0,0,canvas.width,canvas.height); save(); }; drawBar.appendChild(clrBtn);
  var doneBtn=document.createElement("button"); doneBtn.textContent="✓ Done"; doneBtn.style.cssText="cursor:pointer;border:1px solid #43607d;border-radius:6px;background:#43607d;color:#fff;padding:2px 8px;font-size:12px"; doneBtn.onclick=function(){ setDraw(false); }; drawBar.appendChild(doneBtn);
  document.body.appendChild(drawBar);
  function updateDrawBar(){ erBtn.style.background=erase?"#ffe9e9":"#fff"; lineBtn.style.background=(tool==="line"&&!erase)?"#e6efff":"#fff"; braceBtn.style.background=(tool==="brace"&&!erase)?"#e6efff":"#fff"; COLORS.forEach(function(c){ drawBar["sw_"+c].style.outline=(!erase&&penColor===c)?"2px solid #43607d":"1px solid #ccc"; }); }
  updateDrawBar();

  // ---- panel render ----
  // ---- PDF snapshot: capture the current app screen WITH the current marks baked in ----
  function loadSnapLibs(cb){ if(window.html2canvas && window.jspdf){ cb(true); return; }
    var need=[]; if(!window.html2canvas) need.push("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"); if(!window.jspdf) need.push("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
    var left=need.length, failed=false; if(!left){ cb(true); return; }
    need.forEach(function(u){ var s=document.createElement("script"); s.src=u; s.onload=function(){ if(--left===0) cb(!failed); }; s.onerror=function(){ failed=true; if(--left===0) cb(false); }; document.head.appendChild(s); }); }
  function snapshotPDF(){ status("Preparing snapshot... (first time loads tools)");
    loadSnapLibs(function(ok){ if(!ok){ status("Snapshot needs internet the first time"); return; }
      var target = rootIsBody ? document.documentElement : root;
      var W = Math.max(target.scrollWidth, target.clientWidth), H = Math.max(target.scrollHeight, target.clientHeight);
      window.html2canvas(target, { backgroundColor:"#ffffff", scale:1, useCORS:true, width:W, height:H, windowWidth:W, windowHeight:H, scrollX:0, scrollY:0, ignoreElements:function(el){ return el.classList && el.classList.contains("cpmk-ui"); } }).then(function(appCanvas){
        var cw=appCanvas.width, ch=appCanvas.height; var c=document.createElement("canvas"); c.width=cw; c.height=ch; var cx=c.getContext("2d"); cx.drawImage(appCanvas,0,0);
        if(author){ var sc=canvas.width?cw/canvas.width:1;
          try{ if(canvas.width) cx.drawImage(canvas, 0,0, cw, canvas.height*sc); }catch(_){}
          var k=routeKey();
          function pinMark(p,col){ var x=p.x*sc, y=p.y*sc; cx.fillStyle="#fff8e6"; cx.strokeStyle=col; cx.lineWidth=2; cx.beginPath(); cx.arc(x,y,12,0,6.2832); cx.fill(); cx.stroke(); if(p.text){ cx.fillStyle="#1f2933"; cx.font="13px system-ui"; cx.fillText(String(p.text).slice(0,70), x+16, y+4); } }
          (scr().pins||[]).forEach(function(p){ pinMark(p,"#43607d"); });
          others.forEach(function(o){ ((o.screens&&o.screens[k]&&o.screens[k].pins)||[]).forEach(function(p){ pinMark(p,"#c99a2e"); }); });
        }
        var img=c.toDataURL("image/jpeg",0.92);
        var J=window.jspdf.jsPDF; var pdf=new J({orientation: cw>ch?"landscape":"portrait", unit:"pt", format:[cw,ch]}); pdf.addImage(img,"JPEG",0,0,cw,ch);
        var nm=((BOARD||"markup")+"-"+(routeKey().replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"")||"home"))+".pdf";
        pdf.save(nm); status("Snapshot PDF saved ✓");
      }, function(){ status("Snapshot failed - try again"); }); }); }

  function render(){
    var s=scr(); var k=routeKey();
    panel.innerHTML="";
    var h=document.createElement("div"); h.style.cssText="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px";
    h.innerHTML='<b style="font-size:13px">Markup</b>'; var rf=document.createElement("button"); rf.textContent="↻"; rf.title="Refresh"; rf.style.cssText="border:1px solid #cdd5df;border-radius:6px;background:#fff;cursor:pointer;padding:1px 7px"; rf.onclick=refresh; h.appendChild(rf); panel.appendChild(h);
    if(!author){ var hint=document.createElement("div"); hint.style.cssText="background:#fff8e6;border:1px solid #e9d9a6;border-radius:8px;padding:6px 8px;font-size:12px;color:#7a6b30;margin-bottom:6px;font-weight:600"; hint.textContent="① Start here — set your name below so your marks save under you."; panel.appendChild(hint); }

    // Device-frame toggle: preview/mark up at phone, tablet or full width (for websites).
    var fr=document.createElement("div"); fr.style.cssText="display:flex;gap:4px;margin-bottom:6px";
    [["phone","📱","Phone"],["tablet","▭","Tablet"],["full","🖥","Full width"]].forEach(function(x){ var b=document.createElement("button"); b.textContent=x[1]; b.title=x[2]; b.style.cssText="flex:1;border:1px solid "+(curFrame===x[0]?"#43607d":"#cdd5df")+";border-radius:8px;background:"+(curFrame===x[0]?"#e6efff":"#fff")+";cursor:pointer;padding:4px;font-size:13px"; b.onclick=function(){ setFrame(x[0]); }; fr.appendChild(b); }); panel.appendChild(fr);

    // Name selector: pick an existing name (loads that person's board) or add a new one.
    var nameRow=document.createElement("div"); nameRow.style.cssText="display:flex;gap:4px;margin-bottom:6px";
    var sel=document.createElement("select"); sel.style.cssText="flex:1;box-sizing:border-box;border:1px solid #cdd5df;border-radius:8px;padding:6px 8px;background:#fff";
    var optDemo=document.createElement("option"); optDemo.value="__demo"; optDemo.textContent="Demo (view only)"; if(!author) optDemo.selected=true; sel.appendChild(optDemo);
    var haveMe=false;
    authorsList.forEach(function(a){ var o=document.createElement("option"); o.value=a; o.textContent=a; if(a===author){ o.selected=true; haveMe=true; } sel.appendChild(o); });
    if(author && !haveMe){ var om=document.createElement("option"); om.value=author; om.textContent=author; om.selected=true; sel.appendChild(om); }
    var optNew=document.createElement("option"); optNew.value="__new"; optNew.textContent="+ New name…"; sel.appendChild(optNew);
    sel.onchange=function(){ if(sel.value==="__demo"){ setDemo(); } else if(sel.value==="__new"){ var n=(prompt("Your name:")||"").trim(); if(n) adoptAuthor(n); else render(); } else { adoptAuthor(sel.value); } };
    var del=document.createElement("button"); del.textContent="🗑"; del.title="Delete the selected name's marks (code-confirmed)"; del.style.cssText="border:1px solid #e5484d;color:#e5484d;background:#fff;border-radius:8px;padding:4px 9px;cursor:pointer"; del.onclick=function(){ if(sel.value && sel.value!=="__new") deleteAuthor(sel.value); };
    nameRow.appendChild(sel); nameRow.appendChild(del); panel.appendChild(nameRow);

    var lbl=document.createElement("div"); lbl.style.cssText="font-size:11px;color:#8a97a6;margin-bottom:6px"; lbl.textContent="This screen: "+k; panel.appendChild(lbl);

    var ta=document.createElement("textarea"); ta.value=s.note||""; ta.placeholder="Notes / changes for this screen…"; ta.style.cssText="width:100%;box-sizing:border-box;min-height:70px;border:1px solid #cdd5df;border-radius:8px;padding:8px;resize:vertical"; ta.oninput=function(){ s.note=ta.value; save(); }; panel.appendChild(ta);

    var row=document.createElement("div"); row.style.cssText="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0";
    var sub=document.createElement("button"); sub.textContent="✓ Submit"; sub.style.cssText="border:none;border-radius:8px;background:#2f6fed;color:#fff;font-weight:700;padding:5px 12px;cursor:pointer"; sub.onclick=function(){ if(!ensureName())return; saveNow(); sub.textContent="Saved ✓"; setTimeout(function(){sub.textContent="✓ Submit";},1400); };
    var dr=document.createElement("button"); dr.textContent=drawMode?"✏️ Drawing…":"✏️ Draw"; dr.style.cssText="border:1px solid #43607d;border-radius:8px;background:"+(drawMode?"#43607d":"#fff")+";color:"+(drawMode?"#fff":"#43607d")+";font-weight:700;padding:5px 12px;cursor:pointer"; dr.onclick=function(){ if(!ensureName())return; setDraw(!drawMode); };
    var lab=document.createElement("label"); lab.textContent="📎 Image"; lab.style.cssText="border:1px solid #43607d;border-radius:8px;color:#43607d;font-weight:700;padding:5px 12px;cursor:pointer"; var inp=document.createElement("input"); inp.type="file"; inp.accept="image/*"; inp.style.display="none"; inp.onchange=function(){ if(inp.files[0]) addImage(inp.files[0]); inp.value=""; }; lab.appendChild(inp);
    var pinB=document.createElement("button"); pinB.textContent="📍 Pin comment"; pinB.title="Place the comment above as a pin at a precise spot on the screen"; pinB.style.cssText="border:1px solid #43607d;border-radius:8px;color:#43607d;background:#fff;font-weight:700;padding:5px 12px;cursor:pointer"; pinB.onclick=startPin;
    var pdfB=document.createElement("button"); pdfB.textContent="📄 Snapshot PDF"; pdfB.title="Save this screen with the current marks as a PDF (do it per screen)"; pdfB.style.cssText="border:1px solid #43607d;border-radius:8px;color:#43607d;background:#fff;font-weight:700;padding:5px 12px;cursor:pointer"; pdfB.onclick=snapshotPDF;
    row.appendChild(sub); row.appendChild(dr); row.appendChild(lab); row.appendChild(pinB); row.appendChild(pdfB); panel.appendChild(row);

    if(s.images && s.images.length){ var ig=document.createElement("div"); ig.style.cssText="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px"; s.images.forEach(function(u,i){ var wr=document.createElement("div"); wr.style.cssText="position:relative"; var im=document.createElement("img"); im.src=u; im.style.cssText="width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid #cdd5df"; wr.appendChild(im); var x=document.createElement("div"); x.textContent="×"; x.style.cssText="position:absolute;top:-6px;right:-6px;background:#e5484d;color:#fff;border-radius:50%;width:16px;height:16px;text-align:center;line-height:14px;cursor:pointer;font-size:12px"; x.onclick=function(){ s.images.splice(i,1); save(); render(); }; wr.appendChild(x); ig.appendChild(wr); }); panel.appendChild(ig); }

    var oth=document.createElement("div"); oth.id="cpmk-others"; oth.style.cssText="margin-top:4px;font-size:11px;color:#7a6b30"; panel.appendChild(oth);
    var st=document.createElement("div"); st.id="cpmk-status"; st.style.cssText="margin-top:8px;font-size:11px;color:#8a97a6"; st.textContent=author?("Marking up as "+author):"Demo view - pick a name above to add or see marks"; panel.appendChild(st);
    var clrAll=document.createElement("button"); clrAll.textContent="Clear ALL my marks (every screen)"; clrAll.style.cssText="margin-top:8px;width:100%;border:1px solid #e5484d;color:#e5484d;background:#fff;border-radius:8px;padding:6px;cursor:pointer;font-size:12px"; clrAll.onclick=clearAllMine; panel.appendChild(clrAll);
    renderOthers(); renderPins();
  }

  function renderOthers(){
    var oth=document.getElementById("cpmk-others"); if(oth) oth.innerHTML="";
    othersImg.innerHTML="";
    if(!author) return; // Demo view: show nothing until a name is chosen
    var k=routeKey();
    others.forEach(function(o){ var s=(o.screens||{})[k]; if(!s) return;
      if(s.drawing){ var di=document.createElement("img"); di.src=s.drawing; di.style.cssText="position:absolute;inset:0;width:100%;height:100%;pointer-events:none"; othersImg.appendChild(di); }
      if(oth && (s.note || (s.images&&s.images.length))){ var b=document.createElement("div"); b.style.cssText="margin-top:6px;padding-top:6px;border-top:1px dashed #e9d9a6"; var w=document.createElement("div"); w.style.fontWeight="700"; w.textContent=(o.author||"Someone")+":"; b.appendChild(w); if(s.note){ var p=document.createElement("div"); p.style.whiteSpace="pre-wrap"; p.style.color="#1f2933"; p.textContent=s.note; b.appendChild(p); } if(s.images&&s.images.length){ var ig=document.createElement("div"); ig.style.cssText="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px"; s.images.forEach(function(u){ var im=document.createElement("img"); im.src=u; im.style.cssText="width:48px;height:48px;object-fit:cover;border-radius:4px"; ig.appendChild(im); }); b.appendChild(ig); } oth.appendChild(b); } });
  }

  function addImage(file){ if(!ensureName()) return; downscale(file,function(blob){ if(!blob) return; var path=PREFIX+"img_"+safe(routeKey())+"_"+Date.now()+".jpg"; status("Uploading…"); put(path,blob,"image/jpeg").then(function(r){ if(r.ok){ scr().images.push(pub(path)); save(); render(); status("Image added ✓"); } else status("Upload failed"); },function(){ status("Upload failed"); }); }); }

  function refresh(){ status("Loading shared board…"); list().then(function(items){ others=[]; authorsList=[]; var files=(items||[]).filter(function(it){ return it.name && /^board_.*\.json$/.test(it.name); }); if(!files.length){ render(); status(author?("Marking up as "+author):"Enter your name to start"); return; } var pending=files.length; files.forEach(function(it){ fetch(pub(PREFIX+it.name)+"?t="+Date.now(),{cache:"no-store"}).then(function(r){return r.ok?r.json():null;}).then(function(data){ if(data){ if(data.author && authorsList.indexOf(data.author)<0) authorsList.push(data.author); if(author && data.author===author){ var incoming=(data.screens)?Object.assign({},data.screens):{}; Object.keys(touched).forEach(function(k){ if(mine.screens&&mine.screens[k]) incoming[k]=mine.screens[k]; }); mine={author:author,updatedAt:data.updatedAt||"",screens:incoming}; try{localStorage.setItem("cpmk-mine",JSON.stringify(mine));}catch(e){} } else if(data.author) others.push(data); } if(--pending===0){ render(); loadDrawing(); status(author?("Marking up as "+author):"Enter your name to start"); } },function(){ if(--pending===0){ render(); } }); }); },function(){ status("Offline — marks saved on this device"); }); }

  // react to SPA route changes: re-key notes + redraw the current screen's drawing
  var lastRoute = routeKey();
  function onRoute(){ var k=routeKey(); if(k===lastRoute) return; lastRoute=k;
    if(drawing) endStroke();            // finalize any in-progress stroke on the old screen
    if(drawMode) setDraw(false);        // low-friction: auto-"Done" so a mid-draw nav can't misplace marks
    scroller=null;                      // the old screen's scroller is gone; re-find for the new one
    try{ ctx.clearRect(0,0,canvas.width,canvas.height); }catch(_){}
    if(othersImg) othersImg.innerHTML="";
    if(!panel.classList.contains("cpmk-hidden")) render();
    reflow(); renderOthers(); renderPins(); }
  // Detect SPA navigations instantly by patching history, so old marks don't linger when
  // you change screens; a light 200ms poll is a backstop.
  (function(){ var _p=history.pushState, _r=history.replaceState; history.pushState=function(){ var x=_p.apply(this,arguments); setTimeout(onRoute,0); return x; }; history.replaceState=function(){ var x=_r.apply(this,arguments); setTimeout(onRoute,0); return x; }; window.addEventListener("popstate", function(){ setTimeout(onRoute,0); }); })();
  setInterval(onRoute, 200);
  window.addEventListener("resize", reflow);

  // initial pull so others' marks show even before opening the panel
  refresh();
  setTimeout(reflow, 700); // settle the first drawing once the app has laid out
})();
