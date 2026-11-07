// Old-iPad helpers (ES5 only). Loaded after core-js, before app.js. Adapted from Big Dawg Daily's shim.
(function () {
  "use strict";
  var EP = Element.prototype, CP = window.CharacterData && CharacterData.prototype, DP = window.DocumentFragment && DocumentFragment.prototype;

  // ---------- DOM: append / prepend / before / after / replaceWith / remove / closest ----------
  function toNode(args) {
    if (args.length === 1) return typeof args[0] === "string" ? document.createTextNode(args[0]) : args[0];
    var f = document.createDocumentFragment();
    for (var i = 0; i < args.length; i++) f.appendChild(typeof args[i] === "string" ? document.createTextNode(args[i]) : args[i]);
    return f;
  }
  function def(protos, name, fn) { for (var i = 0; i < protos.length; i++) if (protos[i] && !protos[i][name]) Object.defineProperty(protos[i], name, { configurable: true, writable: true, value: fn }); }
  def([EP, DP, Document.prototype], "append", function () { this.appendChild(toNode(arguments)); });
  def([EP, DP, Document.prototype], "prepend", function () { this.insertBefore(toNode(arguments), this.firstChild); });
  def([EP, CP], "before", function () { if (this.parentNode) this.parentNode.insertBefore(toNode(arguments), this); });
  def([EP, CP], "after", function () { if (this.parentNode) this.parentNode.insertBefore(toNode(arguments), this.nextSibling); });
  def([EP, CP], "replaceWith", function () { if (this.parentNode) this.parentNode.replaceChild(toNode(arguments), this); });
  def([EP, CP], "remove", function () { if (this.parentNode) this.parentNode.removeChild(this); });
  def([EP], "replaceChildren", function () { while (this.firstChild) this.removeChild(this.firstChild); if (arguments.length) this.appendChild(toNode(arguments)); });
  def([EP], "toggleAttribute", function (n, force) { var on = force === undefined ? !this.hasAttribute(n) : !!force; if (on) this.setAttribute(n, ""); else this.removeAttribute(n); return on; });
  if (!EP.matches) EP.matches = EP.webkitMatchesSelector;
  def([EP], "closest", function (s) { var e = this; while (e && e.nodeType === 1) { if (e.matches(s)) return e; e = e.parentNode; } return null; });
  def([EP], "setPointerCapture", function () {});
  def([EP], "releasePointerCapture", function () {});
  def([EP], "scrollTo", function (x, y) { if (x && typeof x === "object") { if (x.top != null) this.scrollTop = x.top; if (x.left != null) this.scrollLeft = x.left; } else { this.scrollLeft = x || 0; this.scrollTop = y || 0; } });
  if (!Math.hypot) Math.hypot = function () { var s = 0; for (var i = 0; i < arguments.length; i++) s += arguments[i] * arguments[i]; return Math.sqrt(s); };
  if (window.Node && !("isConnected" in Node.prototype)) Object.defineProperty(Node.prototype, "isConnected", { configurable: true, get: function () { return document.documentElement.contains(this); } });
  if (!window.requestAnimationFrame) window.requestAnimationFrame = window.webkitRequestAnimationFrame || function (f) { return setTimeout(function () { f(Date.now()); }, 16); };
  if (!window.cancelAnimationFrame) window.cancelAnimationFrame = window.webkitCancelAnimationFrame || clearTimeout;
  if (!window.performance) window.performance = {};
  if (!performance.now) { var p0 = Date.now(); performance.now = function () { return Date.now() - p0; }; }

  // ---------- Canvas: ellipse / roundRect ----------
  function ellipse(x, y, rx, ry, rot, a0, a1, ccw) {
    if (rx < 0 || ry < 0) return;
    if (this.save && this.setTransform) {
      // the path survives restore(), so the transform is undone but the ellipse stays
      this.save(); this.translate(x, y); this.rotate(rot || 0); this.scale(rx || 1e-6, ry || 1e-6);
      this.arc(0, 0, 1, a0, a1, !!ccw); this.restore(); return;
    }
    this.arc(x, y, Math.max(rx, ry), a0, a1, !!ccw);
  }
  function roundRect(x, y, w, h, r) {
    if (w < 0) { x += w; w = -w; } if (h < 0) { y += h; h = -h; }
    var a = r == null ? [0] : (r instanceof Array ? r : [r]);
    a = a.map(function (v) { return typeof v === "number" ? v : (v && (v.x || 0)) || 0; });
    var tl, tr, br, bl;
    if (a.length === 1) tl = tr = br = bl = a[0];
    else if (a.length === 2) { tl = br = a[0]; tr = bl = a[1]; }
    else if (a.length === 3) { tl = a[0]; tr = bl = a[1]; br = a[2]; }
    else { tl = a[0]; tr = a[1]; br = a[2]; bl = a[3]; }
    var k = Math.min(1, w / ((tl + tr) || 1), w / ((bl + br) || 1), h / ((tl + bl) || 1), h / ((tr + br) || 1));
    tl *= k; tr *= k; br *= k; bl *= k;
    this.moveTo(x + tl, y);
    this.lineTo(x + w - tr, y); this.arcTo(x + w, y, x + w, y + tr, tr);
    this.lineTo(x + w, y + h - br); this.arcTo(x + w, y + h, x + w - br, y + h, br);
    this.lineTo(x + bl, y + h); this.arcTo(x, y + h, x, y + h - bl, bl);
    this.lineTo(x, y + tl); this.arcTo(x, y, x + tl, y, tl);
    this.closePath();
  }
  var C2 = window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype, P2 = window.Path2D && Path2D.prototype;
  def([C2, P2], "ellipse", ellipse);
  def([C2, P2], "roundRect", roundRect);
  def([C2], "setLineDash", function () {});

  // ---------- Speed: draw at 1x. A retina iPad from 2012 can't push 4x the pixels (3D rooms especially) ----------
  try { Object.defineProperty(window, "devicePixelRatio", { configurable: true, get: function () { return 1; } }); } catch (e) {}

  // ---------- ResizeObserver (Dream Rooms resizes its 3D view with it) ----------
  if (!window.ResizeObserver) {
    var watched = [];
    var checkSizes = function () {
      for (var i = 0; i < watched.length; i++) {
        var w = watched[i], el = w.el, cw = el.clientWidth, ch = el.clientHeight;
        if (cw !== w.w || ch !== w.h) { w.w = cw; w.h = ch; try { w.ro.cb([{ target: el, contentRect: { width: cw, height: ch } }], w.ro); } catch (e) { setTimeout(function () { throw e; }); } }
      }
    };
    window.ResizeObserver = function (cb) { this.cb = cb; };
    window.ResizeObserver.prototype.observe = function (el) { watched.push({ ro: this, el: el, w: -1, h: -1 }); setTimeout(checkSizes, 0); };
    window.ResizeObserver.prototype.unobserve = function (el) { watched = watched.filter(function (w) { return w.el !== el || w.ro !== this; }, this); };
    window.ResizeObserver.prototype.disconnect = function () { watched = watched.filter(function (w) { return w.ro !== this; }, this); };
    setInterval(checkSizes, 300);
    addEventListener("resize", function () { setTimeout(checkSizes, 50); });
    window.__lgCheckSizes = checkSizes;
  }

  // ---------- Pointer events -> touch / mouse (iOS 9 has no pointer events) ----------
  if (!window.PointerEvent) {
    var MAP = { pointerdown: ["touchstart", "mousedown"], pointermove: ["touchmove", "mousemove"], pointerup: ["touchend", "mouseup"], pointercancel: ["touchcancel"] };
    var lastTouch = 0;
    var add = EP; while (add && !Object.prototype.hasOwnProperty.call(add, "addEventListener")) add = Object.getPrototypeOf(add);
    if (!add) add = EP;
    var orig = add.addEventListener, origRm = add.removeEventListener;
    var tappable = function (n, stop) {
      for (; n && n !== stop && n.nodeType === 1; n = n.parentNode) { var tg = n.tagName; if (tg === "BUTTON" || tg === "A" || tg === "INPUT" || tg === "SELECT" || tg === "TEXTAREA" || tg === "LABEL") return true; }
      return false;
    };
    var mk = function (type, ev, target, p, touch) {
      return {
        type: type, target: ev.target, currentTarget: target, pointerId: touch ? (p.identifier == null ? 1 : p.identifier) + 2 : 1, pointerType: touch ? "touch" : "mouse",
        clientX: p.clientX, clientY: p.clientY, pageX: p.pageX, pageY: p.pageY, offsetX: p.clientX - target.getBoundingClientRect().left, offsetY: p.clientY - target.getBoundingClientRect().top,
        button: 0, buttons: type === "pointerup" ? 0 : 1, isPrimary: true, pressure: 0.5,
        preventDefault: function () { ev.preventDefault(); }, stopPropagation: function () { ev.stopPropagation(); }, originalEvent: ev
      };
    };
    add.addEventListener = function (type, fn, opt) {
      if (!MAP[type] || typeof fn !== "function") return orig.call(this, type, fn, opt);
      var target = this, wrap = fn.__lgPtr || (fn.__lgPtr = {});
      MAP[type].forEach(function (t) {
        var w = wrap[t] = function (ev) {
          var touch = t.indexOf("touch") === 0;
          if (touch) lastTouch = Date.now(); else if (Date.now() - lastTouch < 1000) return; // skip the fake mouse events after a tap
          if (!touch && t === "mousemove" && !ev.buttons && !ev.which) return;
          // drag, don't scroll or zoom -- but never on a touch that starts on a button, or iOS drops the tap's click
          if ((t === "touchmove" || t === "touchstart") && target.nodeType === 1 && !(t === "touchstart" && tappable(ev.target, target))) ev.preventDefault();
          if (!touch) return fn.call(target, mk(type, ev, target, ev, false));
          // one pointer event per finger that changed (Dream Rooms pinches with two)
          var ch = ev.changedTouches || [];
          for (var i = 0; i < ch.length; i++) fn.call(target, mk(type, ev, target, ch[i], true));
        };
        orig.call(t.indexOf("mouse") === 0 && t !== "mousedown" && target.nodeType === 1 ? document : target, t, w, t === "touchmove" ? false : opt);
      });
    };
    add.removeEventListener = function (type, fn, opt) {
      if (!MAP[type] || !fn || !fn.__lgPtr) return origRm.call(this, type, fn, opt);
      var target = this;
      MAP[type].forEach(function (t) { var w = fn.__lgPtr[t]; if (w) origRm.call(t.indexOf("mouse") === 0 && t !== "mousedown" && target.nodeType === 1 ? document : target, t, w, opt); });
    };
  }

  // ---------- Fast, reliable taps ----------
  // Old iOS waits ~300ms before a tap becomes a click and sometimes drops it (taps felt dead). Fire the click
  // ourselves the moment the finger lifts, if it barely moved, and cancel the slow native one. Touches a game
  // already claimed (touchstart prevented: drags, boards) are left alone.
  (function () {
    var CLICKABLE = "button, a, label, [onclick], [role=button], [data-home]";
    var t0 = 0, x0 = 0, y0 = 0, moved = false, startEv = null;
    document.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1) { startEv = null; return; }
      var p = e.touches[0]; t0 = Date.now(); x0 = p.clientX; y0 = p.clientY; moved = false; startEv = e;
    }, false);
    document.addEventListener("touchmove", function (e) {
      var p = e.touches[0]; if (p && (Math.abs(p.clientX - x0) > 10 || Math.abs(p.clientY - y0) > 10)) moved = true;
    }, false);
    document.addEventListener("touchend", function (e) {
      var s = startEv; startEv = null;
      if (!s || s.defaultPrevented || moved || Date.now() - t0 > 800 || e.defaultPrevented) return;
      var el = s.target; if (el && el.nodeType !== 1) el = el.parentNode;
      var c = el && el.closest ? el.closest(CLICKABLE) : null;
      if (!c || c.disabled) return;
      var tg = el.tagName; if (tg === "INPUT" || tg === "TEXTAREA" || tg === "SELECT") return;
      e.preventDefault();
      var p = e.changedTouches[0], ev = document.createEvent("MouseEvents");
      ev.initMouseEvent("click", true, true, window, 1, p.screenX, p.screenY, p.clientX, p.clientY, false, false, false, false, 0, null);
      el.dispatchEvent(ev);
    }, false);
  })();

  // ---------- Layout the old CSS can't do ----------
  var AUTO = window.__lgAuto || [];
  var TWO = {
    studio: { left: "stage", ratio: 1 / 2.15, cg: 18, rg: 12 },
    show: { left: "runway", ratio: 0.5, cg: 18, rg: 16 },
    caseStudio: { left: "caseWrap", ratio: 0.5, cg: 18, rg: 12 },
    caseDone: { left: "doneImg", ratio: 0.5, cg: 18, rg: 16 }
  };
  var mq = {};
  function matches(m) { if (!m) return true; if (!window.matchMedia) return false; return (mq[m] || (mq[m] = matchMedia(m))).matches; }
  function hasClass(e, c) { return (" " + (e.getAttribute("class") || "") + " ").indexOf(" " + c + " ") >= 0; }
  function shown(e) { return !e.hasAttribute("hidden") && e.style.display !== "none"; }
  function setS(e, k, v) { if (e.style[k] !== v) e.style[k] = v; }

  // repeat(auto-fill, minmax(Npx, 1fr)) grids
  function autoGrids() {
    var pick = {};
    for (var i = 0; i < AUTO.length; i++) if (matches(AUTO[i].media)) pick[AUTO[i].sel] = AUTO[i];
    for (var s in pick) {
      var a = pick[s], els = document.querySelectorAll(s);
      for (var j = 0; j < els.length; j++) {
        var el = els[j], cs = getComputedStyle(el), W = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        if (W <= 0) continue;
        var n = Math.max(1, Math.floor((W + a.gap) / (a.min + a.gap))), w = Math.floor((W - (n - 1) * a.gap) / n * 10) / 10 - 0.1, k = 0;
        for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
          if (!shown(c)) continue;
          setS(c, "width", w + "px"); setS(c, "webkitFlex", "0 0 auto"); setS(c, "flex", "0 0 auto");
          setS(c, "marginLeft", k % n ? a.gap + "px" : "0px"); setS(c, "marginTop", k >= n ? a.rgap + "px" : "0px");
          setS(c, "marginRight", "0px"); setS(c, "marginBottom", "0px");
          k++;
        }
      }
    }
  }
  // tablet screens with a tall picture on the left and the controls on the right
  function twoCol() {
    var wide = window.innerWidth >= 720;
    for (var id in TWO) {
      var s = document.getElementById(id); if (!s) continue;
      var cfg = TWO[id], kids = s.children, left = null, top = null, i;
      for (i = 0; i < kids.length; i++) { if (hasClass(kids[i], cfg.left)) left = kids[i]; if (hasClass(kids[i], "topbar") && top === null) top = kids[i]; }
      if (!left) continue;
      if (!wide || !shown(s)) {
        if (!wide && left.style.position) { left.style.cssText = ""; s.style.position = ""; for (i = 0; i < kids.length; i++) if (kids[i] !== left) kids[i].style.marginLeft = ""; }
        continue;
      }
      var W = s.clientWidth, lw = Math.floor((W - cfg.cg) * cfg.ratio), pt = parseFloat(getComputedStyle(s).paddingTop) || 12;
      var y = top ? top.offsetTop + top.offsetHeight + cfg.rg : pt;
      setS(s, "position", "relative");
      setS(left, "position", "absolute"); setS(left, "left", "0px"); setS(left, "top", y + "px"); setS(left, "bottom", pt + "px");
      setS(left, "width", lw + "px"); setS(left, "height", "auto"); setS(left, "minHeight", "0px"); setS(left, "maxHeight", "none"); setS(left, "margin", "0px");
      for (i = 0; i < kids.length; i++) { var k = kids[i]; if (k === left || k === top) continue; setS(k, "marginLeft", (lw + cfg.cg) + "px"); }
    }
  }
  // color swatches set their color as an inline --c custom property; some old Safaris drop that, so paint it directly too
  function swatches() {
    var els = document.querySelectorAll('.sw[style*="--c"]');
    for (var i = 0; i < els.length; i++) {
      var e = els[i], st = e.getAttribute("style") || "", m = st.match(/--c:\s*([^;]+)/);
      if (m && !/(^|;)\s*background/.test(st.replace(/--c:[^;]*/, ""))) setS(e, "backgroundColor", m[1].trim());
    }
  }
  // Pictures sized "height: 100%" inside flex boxes come out 0 tall on old Safari (the model vanished).
  // Size them in pixels from their box, keeping their shape.
  var FILL = ["#model > svg", "#walker > svg", "#caseCv", ".doneImg > img"];
  function aspect(e) {
    if (e.tagName === "CANVAS") return e.width && e.height ? e.width / e.height : 0;
    if (e.tagName === "IMG") return e.naturalWidth && e.naturalHeight ? e.naturalWidth / e.naturalHeight : 0;
    var vb = (e.getAttribute("viewBox") || "").split(/[\s,]+/);
    return vb.length === 4 && +vb[3] ? +vb[2] / +vb[3] : 0;
  }
  function fills() {
    for (var i = 0; i < FILL.length; i++) {
      var els = document.querySelectorAll(FILL[i]);
      for (var j = 0; j < els.length; j++) {
        var e = els[j], box = e.parentNode, cs = getComputedStyle(box), a = aspect(e);
        var bh = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom), bw = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        if (!a || bh <= 0 || bw <= 0) continue;
        var hh = bh, ww = hh * a; if (ww > bw) { ww = bw; hh = ww / a; }
        setS(e, "height", Math.floor(hh) + "px"); setS(e, "width", Math.floor(ww) + "px"); setS(e, "maxHeight", "none"); setS(e, "maxWidth", "none");
        if (e.tagName === "IMG" && !e.__lgLoad) { e.__lgLoad = 1; e.addEventListener("load", soon); }
      }
    }
  }
  function fit() { try { twoCol(); } catch (e) {} try { autoGrids(); } catch (e) {} try { swatches(); } catch (e) {} try { fills(); } catch (e) {} if (window.__lgCheckSizes) window.__lgCheckSizes(); }
  var queued = false;
  function soon() { if (queued) return; queued = true; requestAnimationFrame(function () { queued = false; fit(); }); }
  window.__lgFit = soon;
  addEventListener("resize", soon); addEventListener("orientationchange", function () { setTimeout(soon, 300); });
  function watch() {
    soon();
    if (window.MutationObserver) new MutationObserver(soon).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "class"] });
  }
  if (document.body) watch(); else document.addEventListener("DOMContentLoaded", watch);
})();
