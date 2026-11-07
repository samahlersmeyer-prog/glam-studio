// Builds legacy/ — a copy of Glam Studio for old iPads (iOS 9, Safari 9). Same idea as Big Dawg Daily's legacy build.
// Run by tools/stamp.py; never edit legacy/ by hand.
//   - the big <script> in index.html -> legacy/app.js    (Babel down to ES5, a few speed tweaks for the 3D rooms)
//   - vendor/three.min.js            -> legacy/three.js  (Babel down to ES5; Dream Rooms loads it from there)
//   - polyfills + shim.js            -> legacy/poly.js
//   - the big <style> in index.html  -> legacy/styles.css (grid/gap/clamp/inset rewritten to old flexbox CSS, then legacy.css)
//   - index.html                     -> legacy/index.html (base href="../", no service worker, Application Cache for offline)
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import babel from "@babel/core";
import postcss from "postcss";
import * as acorn from "acorn";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT = path.join(ROOT, "legacy");
const TARGET = { ios: "9" };
const h = s => crypto.createHash("sha1").update(s).digest("hex").slice(0, 10);
const read = p => fs.readFileSync(path.join(ROOT, p), "utf8");
const write = (p, s) => { const f = path.join(OUT, p); fs.mkdirSync(path.dirname(f), { recursive: true }); if (!fs.existsSync(f) || fs.readFileSync(f, "utf8") !== s) fs.writeFileSync(f, s); };
const must = (src, find, what) => { if (!src.includes(find)) throw new Error("legacy: " + what + " not found in index.html (" + find + ")"); return src; };

let html = read("index.html");

// ---------- pull the app's main <style> and <script> out of index.html ----------
const styleRe = /<style>\n\/\* Layout:[\s\S]*?<\/style>/;
// the app's script is the big inline one (the others are the small old-iPad redirect and service-worker bits)
const scriptM = [(html.match(/<script>\n[\s\S]*?<\/script>/g) || []).sort((a, b) => b.length - a.length)[0]];
const styleM = html.match(styleRe);
if (!styleM) throw new Error("legacy: main <style> block not found (it should start with /* Layout:)");
if (!scriptM[0] || scriptM[0].length < 50000) throw new Error("legacy: main <script> block not found");
const appCss = styleM[0].replace(/^<style>\n?/, "").replace(/<\/style>$/, "");
let appJs = scriptM[0].replace(/^<script>\n?/, "").replace(/<\/script>$/, "");

// ---------- JS ----------
const usedPolys = new Set();
function transpile(src, compact) {
  // pass 1: find which core-js polyfills the code needs
  const scan = babel.transformSync(src, { babelrc: false, configFile: false, sourceType: "script", compact: true,
    presets: [["@babel/preset-env", { targets: TARGET, modules: false, useBuiltIns: "usage", corejs: "3.40" }]] }).code;
  for (const m of scan.matchAll(/core-js\/modules\/([\w.-]+?)(?:\.js)?["']/g)) usedPolys.add(m[1]);
  // pass 2: the real transpile
  const code = babel.transformSync(src, { babelrc: false, configFile: false, sourceType: "script", compact, comments: false,
    presets: [["@babel/preset-env", { targets: TARGET, modules: false, forceAllTransforms: true }]] }).code;
  acorn.parse(code, { ecmaVersion: 5, sourceType: "script" }); // throws if anything newer than ES5 slipped through
  return code;
}

// three.js (cached by its hash, it's slow to transpile)
const threeSrc = read("vendor/three.min.js");
const threeKey = h(threeSrc);
const threeCache = path.join(HERE, ".three-" + threeKey + ".js");
let three;
if (fs.existsSync(threeCache) && fs.existsSync(threeCache + ".polys")) {
  three = fs.readFileSync(threeCache, "utf8");
  fs.readFileSync(threeCache + ".polys", "utf8").split("\n").filter(Boolean).forEach(m => usedPolys.add(m));
} else {
  const before = new Set(usedPolys);
  three = transpile(threeSrc, true);
  for (const old of fs.readdirSync(HERE).filter(n => n.startsWith(".three-"))) fs.unlinkSync(path.join(HERE, old));
  fs.writeFileSync(threeCache, three);
  fs.writeFileSync(threeCache + ".polys", [...usedPolys].filter(m => !before.has(m)).join("\n"));
}
const threeV = h(three);
write("three.js", three);

// app: point Dream Rooms at the ES5 three.js, and go easier on the old iPad's GPU
must(appJs, "s.src='vendor/three.min.js'", "three.js loader");
appJs = appJs.replace("s.src='vendor/three.min.js'", `s.src='legacy/three.js?v=${threeV}'`);
must(appJs, "new THREE.WebGLRenderer({antialias:true,alpha:true})", "3D renderer setup");
appJs = appJs.replace("new THREE.WebGLRenderer({antialias:true,alpha:true})", "new THREE.WebGLRenderer({antialias:false,alpha:true})");
must(appJs, "sun.shadow.mapSize.set(2048,2048)", "shadow size");
appJs = appJs.replace("sun.shadow.mapSize.set(2048,2048)", "sun.shadow.mapSize.set(1024,1024)");
must(appJs, "R.shadowMap.type=THREE.PCFSoftShadowMap", "shadow type");
appJs = appJs.replace("R.shadowMap.type=THREE.PCFSoftShadowMap", "R.shadowMap.type=THREE.PCFShadowMap");
const app = transpile(appJs, false);
write("app.js", app);

// ---------- polyfills ----------
// Things the code uses that Babel can't see (DOM collections etc).
["web.dom-collections.for-each", "web.dom-collections.iterator", "es.promise", "es.symbol", "es.symbol.iterator", "es.array.iterator",
 "es.object.assign", "es.object.entries", "es.object.values", "es.string.pad-start", "es.map", "es.set", "es.weak-map", "es.array.fill",
 "es.array.from", "es.array.find", "es.array.find-index", "es.array.includes", "es.string.includes", "es.string.starts-with", "es.string.ends-with",
 "es.string.repeat", "es.number.is-finite", "es.number.is-integer", "es.number.epsilon", "es.math.sign", "es.math.trunc", "es.math.log2", "es.math.hypot",
].forEach(m => usedPolys.add(m));
// Babel guesses broadly; drop families the app doesn't use. Typed-array constructors stay native (iOS 9 has them).
// Array methods core-js would only swap in for Symbol.species / huge-length edge cases are left native too:
// replacing push/map/sort with slower JS versions would cost the 3D rooms frame rate for nothing.
const polyList = [...usedPolys].filter(m => !/^(esnext\.|es\.(array-buffer|typed-array\.(float|int|uint)|typed-array\.(to-|with|at|find-last)|iterator|set\.(difference|intersection|is-|symmetric|union)|error\.cause|symbol\.description|global-this|array\.(concat|filter|map|slice|splice|push|unshift|reverse|sort)$|typed-array\.sort$))/.test(m)).sort();
const polyKey = h(polyList.join(","));
const cache = path.join(HERE, ".corejs-" + polyKey + ".js");
let corejs;
if (fs.existsSync(cache)) corejs = fs.readFileSync(cache, "utf8");
else {
  const builder = (await import("core-js-builder")).default;
  corejs = await builder({ modules: polyList, targets: "iOS >= 9", format: "bundle", minify: true, summary: { console: { size: false, modules: false } } });
  for (const old of fs.readdirSync(HERE).filter(n => n.startsWith(".corejs-"))) fs.unlinkSync(path.join(HERE, old));
  fs.writeFileSync(cache, corejs);
}
const shim = fs.readFileSync(path.join(HERE, "shim.js"), "utf8");
acorn.parse(shim, { ecmaVersion: 5, sourceType: "script" });

// ---------- CSS ----------
// Classes that are put on <button>. Old Safari can't make a button a flex/grid container, so those
// get block/inline-block layouts instead.
const BTN = new Set(["btn", "tile", "pchip", "iconbtn", "linkbtn", "opt", "tab", "tool", "sw", "pcard", "jcard", "shapeBtn", "pourbtn", "sten",
  "dbtn", "dopt", "emo", "mode", "bin", "keep", "trash", "home"]);
// Two-column tablet screens (a tall picture on the left, controls on the right). shim.js lays these out instead.
const TWO_COL = /^#(studio|show|caseStudio|caseDone)\b/;
// repeat(auto-fill, minmax(N, 1fr)) grids: shim.js works out the columns and sizes the children.
const AUTO = [];
const GAPS = {};
const lastCompound = s => s.trim().split(/\s*[\s>+~]\s*/).pop();
const isBtn = s => { const l = lastCompound(s); return /(^|[^\w-])button\b/.test(l) || [...l.matchAll(/\.([\w-]+)/g)].some(m => BTN.has(m[1])); };
const tracks = v => v == null ? null : v.replace(/!important/, "").replace(/minmax\(\s*0\s*,\s*([\d.]+fr)\s*\)/g, "$1")
  .replace(/repeat\(\s*(\d+)\s*,\s*([^)]+)\)/g, (m, n, t) => Array(+n).fill(t.trim()).join(" ")).trim().split(/\s+/);
const flexAlign = v => ({ start: "flex-start", end: "flex-end", "flex-start": "flex-start", "flex-end": "flex-end", center: "center", stretch: "stretch", baseline: "baseline" })[v] || null;
const sel = (rule, suffix) => rule.selector.split(",").map(s => s.trim() + " > " + suffix).join(", ");
const unimp = v => (v || "").replace(/\s*!important/, "").trim();
const mediaOf = rule => { let p = rule.parent; while (p && p.type !== "root") { if (p.type === "atrule" && p.name === "media") return p.params; p = p.parent; } return ""; };

function rewriteValue(prop, v) {
  // min(...)/max(...) -> the plain length (env() and viewport units dropped)
  v = v.replace(/\b(min|max)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, (m, fn, args) => {
    const a = args.split(",").map(s => s.trim()); const plain = a.filter(x => !/env\(|v[hw]\b|%/.test(x));
    return plain.length ? plain[plain.length - 1] : a[0];
  });
  // clamp(a, b, c) on font sizes -> the upper bound (iPads are big screens); elsewhere -> the middle value
  v = v.replace(/clamp\(([^,]+),([^,]+),([^)]+)\)/g, (m, a, b, c) => prop === "font-size" ? c.trim() : b.trim());
  return v;
}

function convertCss(css) {
  const root = postcss.parse(css);
  root.walkRules(rule => {
    if (rule.parent && rule.parent.type === "atrule" && /keyframes/.test(rule.parent.name)) return;
    // drop selectors old Safari doesn't understand (they'd void the whole rule)
    if (/:focus-visible|:is\(|:where\(|:has\(/.test(rule.selector)) {
      const keep = rule.selectors.filter(s => !/:focus-visible|:is\(|:where\(|:has\(/.test(s));
      if (!keep.length) { rule.remove(); return; } rule.selectors = keep;
    }
    const media = mediaOf(rule);
    // tablet two-column screens: drop the grid placement, shim.js positions them
    if (/min-width/.test(media) && rule.selectors.every(s => TWO_COL.test(s.trim()))) {
      rule.walkDecls(x => { if (/^(display|grid-template-columns|grid-template-rows|gap|grid-gap|grid-column|grid-row|grid-area|align-self)$/.test(x.prop)) x.remove(); });
      if (!rule.nodes.length) rule.remove();
      return;
    }
    const d = {}; rule.walkDecls(x => { d[x.prop] = x.value; });
    const after = [];
    const add = (selector, props) => after.push(postcss.rule({ selector, nodes: Object.entries(props).map(([prop, value]) => postcss.decl({ prop, value })) }));
    const set = (prop, value) => { let found = false; rule.walkDecls(prop, x => { if (!found) { x.value = value; found = true; } else x.remove(); }); if (!found) rule.append({ prop, value }); };
    const del = prop => rule.walkDecls(prop, x => x.remove());

    // simple value rewrites
    rule.walkDecls(x => {
      if (x.prop === "inset") {
        const p = x.value.replace(/!important/, "").trim().split(/\s+/); const [t, r = t, b = t, l = r] = p;
        x.cloneBefore({ prop: "top", value: t }); x.cloneBefore({ prop: "right", value: r }); x.cloneBefore({ prop: "bottom", value: b }); x.cloneBefore({ prop: "left", value: l }); x.remove(); return;
      }
      if (x.prop === "padding-block") { const p = x.value.trim().split(/\s+/); x.cloneBefore({ prop: "padding-top", value: p[0] }); x.cloneBefore({ prop: "padding-bottom", value: p[1] || p[0] }); x.remove(); return; }
      if (x.prop === "margin-block") { const p = x.value.trim().split(/\s+/); x.cloneBefore({ prop: "margin-top", value: p[0] }); x.cloneBefore({ prop: "margin-bottom", value: p[1] || p[0] }); x.remove(); return; }
      if (/^(aspect-ratio|container-type|container-name|text-wrap|overscroll-behavior|scrollbar-width)$/.test(x.prop)) { x.remove(); return; }
      if (/env\(/.test(x.value) && !/\b(min|max)\(/.test(x.value)) { x.remove(); return; }
      if (/clamp\(|\bmin\(|\bmax\(/.test(x.value) && /^(width|height)$/.test(x.prop)) {
        const m = x.value.match(/^clamp\(([^,]+),([^,]+),([^)]+)\)$/);
        if (m && !/vh|vw/.test(m[1] + m[3])) { x.cloneBefore({ prop: "min-" + x.prop, value: m[1].trim() }); x.cloneBefore({ prop: "max-" + x.prop, value: m[3].trim() }); x.value = m[2].trim(); return; }
      }
      if (/clamp\(|\bmin\(|\bmax\(/.test(x.value)) x.value = rewriteValue(x.prop, x.value);
      if (x.prop === "position" && /sticky/.test(x.value)) x.cloneBefore({ value: "-webkit-sticky" });
      if (/^(filter|mask|backdrop-filter|mask-image|appearance|user-select|backface-visibility)$/.test(x.prop)) x.cloneBefore({ prop: "-webkit-" + x.prop });
      if (x.prop === "overflow-wrap" && /anywhere/.test(x.value)) { x.cloneBefore({ prop: "word-break", value: "break-word" }); x.value = "break-word"; }
    });

    const disp = unimp(d.display);
    const isGrid = /grid/.test(disp) || d["grid-template-columns"] != null || d["grid-template-rows"] != null;
    const isFlex = /flex/.test(disp);
    // a tablet override without its own gap keeps the phone rule's gap
    if (!d.gap && !d["grid-gap"] && media && GAPS[rule.selector]) d.gap = GAPS[rule.selector];
    if ((d.gap || d["grid-gap"]) && !media) GAPS[rule.selector] = d.gap || d["grid-gap"];
    const gapv = unimp(d.gap || d["grid-gap"]).split(/\s+/).filter(Boolean);
    const rg = gapv[0] || null, cg = gapv[1] || gapv[0] || null;
    const button = rule.selectors.every(isBtn);
    const pi = unimp(d["place-items"]).split(/\s+/).filter(Boolean);
    const ai = unimp(d["align-items"]) || pi[0], ji = unimp(d["justify-items"]) || pi[1] || pi[0];

    if (d["grid-column"] && /1\s*\/\s*-1|span\s+\d{2}|1\s*\/\s*span\s*\d+/.test(d["grid-column"])) {
      del("grid-column"); set("width", "100%"); set("flex", "0 0 100%"); set("margin-left", "0");
    }
    del("grid-column"); del("grid-row"); del("grid-area");

    const colsRaw = unimp(d["grid-template-columns"]);
    const auto = colsRaw.match(/repeat\(\s*auto-(?:fill|fit)\s*,\s*minmax\(\s*([\d.]+)px\s*,\s*1fr\s*\)\s*\)/);
    if (isGrid && auto) {
      // shim.js sizes the children; here just make it a wrapping row
      AUTO.push({ sel: rule.selector, min: +auto[1], gap: parseFloat(cg) || 0, rgap: parseFloat(rg) || 0, media });
      if (disp || !media) { set("display", "flex"); rule.walkDecls("display", x => x.cloneBefore({ value: "-webkit-flex" })); }
      set("flex-wrap", "wrap"); set("-webkit-flex-wrap", "wrap"); set("align-content", "flex-start"); set("align-items", "stretch");
      ["grid-template-columns", "grid-template-rows", "gap", "grid-gap", "place-items", "grid-auto-flow"].forEach(del);
      for (let i = after.length - 1; i >= 0; i--) rule.after(after[i]);
      return;
    }

    if (isGrid && button) {
      if (disp) set("display", /inline/.test(disp) ? "inline-block" : "block");
      if (pi.length || ai === "center") { set("text-align", "center"); }
      ["grid-template-columns", "grid-template-rows", "gap", "grid-gap", "place-items", "justify-items", "grid-auto-flow"].forEach(del);
    } else if (isGrid) {
      const cols = tracks(d["grid-template-columns"]), rows = tracks(d["grid-template-rows"]);
      if (disp) set("display", /inline/.test(disp) ? "inline-flex" : "flex");
      ["grid-template-columns", "grid-template-rows", "gap", "grid-gap", "place-items", "justify-items", "grid-auto-flow"].forEach(del);
      if (cols && cols.length > 1) {
        const N = cols.length, allFr = cols.every(t => t === "1fr");
        set("-webkit-flex-direction", "row"); set("flex-direction", "row"); set("flex-wrap", "wrap"); set("-webkit-flex-wrap", "wrap");
        set("align-items", flexAlign(ai) || "stretch");
        if (d["align-content"]) set("align-content", flexAlign(unimp(d["align-content"])) || "flex-start");
        // a fresh column count replaces any earlier one (e.g. 2 columns on phones, 4 on tablets)
        add(sel(rule, ":nth-child(n)"), { "margin-top": "0", "margin-left": "0" });
        cols.forEach((t, i) => {
          const props = {};
          if (allFr) { props.flex = "0 0 auto"; props.width = cg ? `calc((100% - ${N - 1} * ${cg}) / ${N})` : `calc(100% / ${N})`; }
          else if (/fr$/.test(t)) { props.flex = `${parseFloat(t)} 1 0px`; props["min-width"] = "0"; }
          else if (t === "auto" || /content/.test(t)) props.flex = "0 0 auto";
          else { props.flex = `0 0 ${t}`; props.width = t; }
          if (cg && i) props["margin-left"] = cg;
          add(sel(rule, `:nth-child(${N}n+${i + 1})`), props);
        });
        if (rg) add(sel(rule, `:nth-child(n+${N + 1})`), { "margin-top": rg });
      } else if (rows && rows.length > 1 && rows.every(t => t === "1fr")) {
        set("-webkit-flex-direction", "column"); set("flex-direction", "column");
        add(sel(rule, "*"), { flex: "1 1 0px", "min-height": "0" });
        if (rg) add(sel(rule, "* + *"), { "margin-top": rg });
      } else if (disp) {
        set("-webkit-flex-direction", "column"); set("flex-direction", "column");
        set("align-items", flexAlign(ji) || "stretch");
        if (ai && flexAlign(ai) && flexAlign(ai) !== "stretch") set("justify-content", flexAlign(ai));
        if (rg) add(sel(rule, ":not([hidden]) ~ :not([hidden])"), { "margin-top": rg });
      }
    } else if (isFlex && button) {
      const col = /column/.test(d["flex-direction"] || "");
      set("display", /inline/.test(disp) ? "inline-block" : "block");
      ["gap", "flex-direction", "flex-wrap"].forEach(del);
      if (col || d["align-items"] === "center") set("text-align", d["text-align"] || "center");
      add(sel(rule, "*"), col ? { display: "block", "margin-left": "auto", "margin-right": "auto" } : { display: "inline-block", "vertical-align": "middle" });
      if (rg) add(sel(rule, ":not([hidden]) ~ :not([hidden])"), col ? { "margin-top": rg } : { "margin-left": cg });
    } else if (gapv.length) {
      del("gap"); del("grid-gap");
      const dir = d["flex-direction"] || "row", wrap = /wrap/.test(d["flex-wrap"] || "");
      if (!isFlex && d["grid-template-columns"] == null && !disp) {
        // gap override on a rule without display -- nothing safe to do
      } else if (wrap) add(sel(rule, ":not([hidden])"), { "margin-right": cg, "margin-bottom": rg });
      else if (/column/.test(dir)) add(sel(rule, ":not([hidden]) ~ :not([hidden])"), { [/reverse/.test(dir) ? "margin-bottom" : "margin-top"]: rg });
      else add(sel(rule, ":not([hidden]) ~ :not([hidden])"), { [/reverse/.test(dir) ? "margin-right" : "margin-left"]: cg });
    }
    // Safari 9 lets items in a scrolling column shrink below their content (no min-height:auto), so they overlap.
    if (/auto|scroll/.test(d["overflow-y"] || d.overflow || "") && (/column/.test(d["flex-direction"] || "") || (isGrid && disp && !button)))
      after.push(postcss.rule({ selector: sel(rule, "*"), nodes: [postcss.decl({ prop: "-webkit-flex-shrink", value: "0" }), postcss.decl({ prop: "flex-shrink", value: "0" })] }));
    // old WebKit wants the prefixed names alongside
    rule.each(x => {
      if (x.type !== "decl") return;
      if (x.prop === "display" && /flex/.test(x.value) && !/webkit/.test(x.value)) x.cloneBefore({ value: "-webkit-" + x.value.replace(/\s*!important/, "") });
      else if (/^(flex|flex-direction|flex-wrap|flex-grow|flex-shrink|flex-basis|align-items|align-self|align-content|justify-content|order)$/.test(x.prop)) {
        const prev = x.prev(); if (!(prev && prev.prop === "-webkit-" + x.prop)) x.cloneBefore({ prop: "-webkit-" + x.prop });
      }
    });
    for (let i = after.length - 1; i >= 0; i--) rule.after(after[i]);
  });
  return root.toString();
}
const legacyCss = fs.readFileSync(path.join(HERE, "legacy.css"), "utf8");
const css = convertCss(appCss) + "\n\n/* ---- legacy.css (hand-tuned for old iPads) ---- */\n" + legacyCss;
write("styles.css", css);

const poly = corejs + "\n;window.__lgAuto=" + JSON.stringify(AUTO) + ";\n" + shim;
write("poly.js", poly);

// ---------- HTML ----------
const cssV = h(css), polyV = h(poly), appV = h(app);
html = html.replace(styleM[0], `<link rel="stylesheet" href="legacy/styles.css?v=${cssV}">`);
html = html.replace(scriptM[0], `<script src="legacy/poly.js?v=${polyV}"></script>\n<script src="legacy/app.js?v=${appV}"></script>`);
html = html.replace(/<script>\s*\/\/ Keep the installed app up to date[\s\S]*?<\/script>\s*/, "");
html = html.replace(/<script>\s*\/\/ Old iPad\?[\s\S]*?<\/script>\s*/, "");
html = html.replace(/<link rel="manifest"[^>]*>\s*/, "");
must(html, "<head>\n<meta charset=\"utf-8\">", "head");
html = html.replace("<head>\n<meta charset=\"utf-8\">", "<head>\n<!-- Built by tools/legacy/build.mjs from index.html. Don't edit; run python3 tools/stamp.py. -->\n<meta charset=\"utf-8\">\n<base href=\"../\">");
// iOS 9 zooms on double-tap; old Safari still honors user-scalable=no.
html = html.replace(/<meta name="viewport" content="[^"]*">/, '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">');
if (/serviceWorker/.test(html)) throw new Error("legacy: service worker script still in page");
if (/<script>\n/.test(html.replace(/<script>\n\(function \(\) \{ var ac/, ""))) { /* only the cache script below is inline */ }

// Offline: iOS 9 has no service worker, but it does have the old Application Cache. List every file the page
// needs (with the same ?v= it asks for) so a bookmark or home-screen icon opens with no internet.
// Paths are relative to legacy/manifest.appcache.
const FONTS = fs.readdirSync(path.join(ROOT, "fonts")).filter(n => /\.woff$/.test(n)).sort();
const cacheList = [
  `styles.css?v=${cssV}`, `poly.js?v=${polyV}`, `app.js?v=${appV}`, `three.js?v=${threeV}`,
  "../fonts/fonts.css", ...FONTS.map(n => "../fonts/" + n), "../apple-touch-icon.png", "../icon-192.png",
];
for (const u of cacheList) { const f = path.join(OUT, u.split("?")[0]); if (!fs.existsSync(f)) throw new Error("legacy: offline file missing: " + u); }
const fontBytes = FONTS.map(n => read("fonts/" + n)).join("") + read("fonts/fonts.css");
const manifest = "CACHE MANIFEST\n# " + h(html + cacheList.join("\n") + fontBytes) + "\n\nCACHE:\n" + cacheList.join("\n") + "\n\nNETWORK:\n*\n";
write("manifest.appcache", manifest);
// absolute path: the page's <base href="../"> isn't read yet when <html manifest> is
must(html, '<html lang="en">', "html tag");
html = html.replace('<html lang="en">', '<html lang="en" class="legacy" manifest="/glam-studio/legacy/manifest.appcache">');
// when a newer version has downloaded, switch to it (right away if just opened, else next time the iPad wakes it)
html = html.replace("</body>", `<script>
(function () { var ac = window.applicationCache, t0 = Date.now(); if (!ac) return;
  function swap() { try { ac.swapCache(); } catch (e) {} location.reload(); }
  ac.addEventListener("updateready", function () {
    if (Date.now() - t0 < 15000) return swap();
    document.addEventListener("visibilitychange", function () { if (!document.hidden) swap(); });
  });
})();
</script>
</body>`);
write("index.html", html);
console.log(`legacy: built for iOS 9 (${polyList.length} polyfills, ${Math.round(poly.length / 1024)}KB poly, ${Math.round(app.length / 1024)}KB app, ${Math.round(three.length / 1024)}KB three, ${Math.round(css.length / 1024)}KB css, ${AUTO.length} auto grids)`);
