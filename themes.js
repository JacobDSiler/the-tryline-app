/* Tryline colour-scheme switcher (demo only). Use ?theme=green etc., or the Colours button. */
(function () {
  var THEMES = {
    club:   { name: "Club red & navy", v: {} },
    coffee: { name: "Coffee & cream", v: { "--ink":"#2a1f18","--ink-soft":"#6b5a4e","--paper-dim":"#f5eee6","--metal":"#3b2a20","--metal-2":"#271a13","--line":"#e6dccd","--copper":"#b9651c","--copper-dark":"#8f4c12" } },
    pitch:  { name: "Pitch green", v: { "--ink":"#16261d","--ink-soft":"#4d6156","--paper-dim":"#eef3ef","--metal":"#14341f","--metal-2":"#0b2415","--line":"#dae4dd","--copper":"#1f7a4d","--copper-dark":"#165a38" } },
    slate:  { name: "Slate & teal", v: { "--ink":"#1b242c","--ink-soft":"#55626e","--paper-dim":"#eff2f4","--metal":"#1f2933","--metal-2":"#141b22","--line":"#dde3e8","--copper":"#0b7a7c","--copper-dark":"#085c5e" } }
  };
  var KEY = "tryline-theme", root = document.documentElement, cur = "club";
  function get() { try { var m = /[?&]theme=(\w+)/.exec(location.search); if (m && THEMES[m[1]]) return m[1]; return localStorage.getItem(KEY) || "club"; } catch (e) { return "club"; } }
  function apply(id) {
    if (!THEMES[id]) id = "club"; cur = id;
    Object.keys(THEMES.coffee.v).forEach(function (k) { root.style.removeProperty(k); });
    var v = THEMES[id].v; Object.keys(v).forEach(function (k) { root.style.setProperty(k, v[k]); });
    try { localStorage.setItem(KEY, id); } catch (e) {}
    var l = document.getElementById("th-label"); if (l) l.textContent = THEMES[id].name;
  }
  apply(get());
  document.addEventListener("DOMContentLoaded", function () {
    var box = document.createElement("div");
    box.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:99999;font:600 12px 'Work Sans',system-ui,sans-serif;";
    var btn = document.createElement("button");
    btn.style.cssText = "background:#0d2136;color:#fff;border:0;border-radius:999px;padding:9px 14px;cursor:pointer;box-shadow:0 2px 8px #0004;";
    btn.innerHTML = "Colours: <span id='th-label'></span>";
    btn.onclick = function () { var ids = Object.keys(THEMES); apply(ids[(ids.indexOf(cur) + 1) % ids.length]); };
    box.appendChild(btn); document.body.appendChild(box); apply(cur);
  });
})();
