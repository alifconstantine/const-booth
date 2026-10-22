(function () {
  "use strict";

  var GHOST_SRC = "/assets/ghost.svg?v=f6fc2624";

  var DURATION_MS = 4400;
  var START_AFTER_OPEN_MS = 250;
  var START_LATE_MS = 150;
  var SVG_WAIT_MS = 2500;
  var SESSION_KEY = "lb_halloween_ghost_seen";

  var force = /[?&]ghost=1(&|$)/.test(location.search);

  function isOctober() {
    return new Date().getMonth() === 9;
  }

  function reducedMotion() {
    try {
      return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_e) {
      return false;
    }
  }

  function seenThisSession() {
    try {
      return sessionStorage.getItem(SESSION_KEY) === "1";
    } catch (_e) {
      return false;
    }
  }

  function markSeen() {
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch (_e) {}
  }

  if (!force && (!isOctober() || seenThisSession())) return;
  if (reducedMotion()) return;
  if (typeof window.fetch !== "function" || typeof window.Promise !== "function") return;

  var svgMarkup = fetch(GHOST_SRC, { credentials: "same-origin" })
    .then(function (r) {
      return r.ok ? r.text() : null;
    })
    .then(function (txt) {
      return txt && txt.indexOf("<svg") !== -1 ? txt : null;
    })
    .catch(function () {
      return null;
    });

  function hasVisible(id) {
    var el = document.getElementById(id);
    return !!(el && el.classList.contains("visible"));
  }

  function busy() {
    var root = document.documentElement;
    var body = document.body;
    if (root.classList.contains("is-capturing")) return true;
    if (body && (body.classList.contains("is-capturing") || body.classList.contains("preview-visible") || body.classList.contains("ic-output-open"))) return true;
    if (hasVisible("preview-screen") || hasVisible("ic-output-screen")) return true;
    var cd = document.getElementById("countdown");
    if (cd && cd.textContent && cd.textContent.trim()) return true;
    return document.visibilityState === "hidden";
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function smoothstep(x) {
    x = clamp(x, 0, 1);
    return x * x * (3 - 2 * x);
  }

  var PATH = [[1, 0.06], [0.78, 0.15], [0.33, 0.3], [0.18, 0.49], [0.33, 0.67], [0.78, 0.81], [1, 0.9]];
  var TURN_POINT = 3;
  var REF_PATH_PX = 1190;
  var MAX_DURATION_MS = 7000;

  function catmull(p0, p1, p2, p3, t) {
    var t2 = t * t, t3 = t2 * t;
    return [
      0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
      0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
    ];
  }

  function samplePath(W, H, size) {
    var last = PATH.length - 1;
    var pts = PATH.map(function (p, i) {
      return [i === 0 || i === last ? W + size * 1.05 : p[0] * W, p[1] * H];
    });
    var n = pts.length;
    var ext = [[2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]]]
      .concat(pts)
      .concat([[2 * pts[n - 1][0] - pts[n - 2][0], 2 * pts[n - 1][1] - pts[n - 2][1]]]);
    var PER = 80;
    var out = [];
    var turnIndex = 0;
    for (var s = 0; s < n - 1; s++) {
      for (var k = 0; k < PER; k++) {
        if (s === TURN_POINT && k === 0) turnIndex = out.length;
        out.push(catmull(ext[s], ext[s + 1], ext[s + 2], ext[s + 3], k / PER));
      }
    }
    out.push(pts[n - 1]);
    var len = [0];
    for (var i = 1; i < out.length; i++) {
      len.push(len[i - 1] + Math.sqrt(Math.pow(out[i][0] - out[i - 1][0], 2) + Math.pow(out[i][1] - out[i - 1][1], 2)));
    }
    return { pts: out, len: len, total: len[len.length - 1], turnS: len[turnIndex] / len[len.length - 1] };
  }

  function at(path, s) {
    var target = s * path.total;
    var lo = 0, hi = path.len.length - 1;
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (path.len[mid] < target) lo = mid;
      else hi = mid;
    }
    var seg = path.len[hi] - path.len[lo] || 1;
    var f = (target - path.len[lo]) / seg;
    var a = path.pts[lo], b = path.pts[hi];
    var i0 = Math.max(0, lo - 2), i1 = Math.min(path.pts.length - 1, hi + 2);
    return {
      x: a[0] + (b[0] - a[0]) * f,
      y: a[1] + (b[1] - a[1]) * f,
      dx: path.pts[i1][0] - path.pts[i0][0],
      dy: path.pts[i1][1] - path.pts[i0][1]
    };
  }

  function buildTiming(turnS) {
    var N = 400;
    var t = [0];
    for (var i = 1; i <= N; i++) {
      var s = (i - 0.5) / N;
      var v = 1 - 0.45 * Math.exp(-Math.pow((s - turnS) / 0.09, 2));
      t.push(t[i - 1] + 1 / N / v);
    }
    var total = t[N];
    return {
      sAt: function (g) {
        var target = g * total;
        var lo = 0, hi = N;
        while (hi - lo > 1) {
          var mid = (lo + hi) >> 1;
          if (t[mid] < target) lo = mid;
          else hi = mid;
        }
        var f = (target - t[lo]) / ((t[hi] - t[lo]) || 1);
        return (lo + f) / N;
      },
      gAt: function (s) {
        var idx = clamp(s * N, 0, N);
        var lo = Math.floor(idx), hi = Math.min(N, lo + 1);
        return (t[lo] + (t[hi] - t[lo]) * (idx - lo)) / total;
      }
    };
  }

  function buildFlight(name, W, H, size) {
    var path = samplePath(W, H, size);
    var timing = buildTiming(path.turnS);
    var gTurn = timing.gAt(path.turnS);
    var SPIN = 0.15;
    var STEPS = 150;
    var frames = [];
    for (var i = 0; i <= STEPS; i++) {
      var g = i / STEPS;
      var p = at(path, timing.sAt(g));
      var a = Math.PI * smoothstep((g - (gTurn - SPIN / 2)) / SPIN);
      var cos = Math.cos(a), sin = Math.sin(a);
      var sx = Math.abs(cos) < 0.06 ? (a < Math.PI / 2 ? 0.06 : -0.06) : cos;
      var swell = 1 - 0.04 * sin;
      var skew = 9 * sin;
      var lean = clamp((Math.atan2(p.dy, Math.abs(p.dx) || 0.0001) * 180 / Math.PI) * 0.3, -12, 12);
      var rot = -lean * cos;
      frames.push(
        (g * 100).toFixed(3) + "%{transform:translate(" + p.x.toFixed(1) + "px," + p.y.toFixed(1) + "px) rotate(" +
          rot.toFixed(2) + "deg) skewY(" + skew.toFixed(2) + "deg) scale(" + (sx * swell).toFixed(4) + "," + swell.toFixed(4) +
          ")}"
      );
    }
    return { css: "@keyframes " + name + "{" + frames.join("") + "}", turn: gTurn, length: path.total };
  }

  function pct(x) {
    return (clamp(x, 0, 1) * 100).toFixed(2) + "%";
  }

  function partsCss(D, turn, k) {
    var S = ".lb-ghost-stage ";
    function px(u) {
      return (u * k).toFixed(2) + "px";
    }
    var look =
      "0%," + pct(turn - 0.1) + "{transform:translate(" + px(-10) + "," + px(3) + ") scale(1)}" +
      pct(turn - 0.03) + "," + pct(turn + 0.1) + "{transform:translate(0,0) scale(1.14)}" +
      pct(turn + 0.17) + ",100%{transform:translate(" + px(-10) + "," + px(4) + ") scale(1)}";
    var b1 = 0.12, b2 = turn + 0.2, b3 = turn + 0.26;
    var blink =
      "0%," + pct(b1) + "," + pct(b1 + 0.03) + "," + pct(b2) + "," + pct(b2 + 0.03) + "," + pct(b3) + "," + pct(b3 + 0.03) +
      ",100%{transform:scaleY(1)}" + pct(b1 + 0.015) + "," + pct(b2 + 0.015) + "," + pct(b3 + 0.015) + "{transform:scaleY(.08)}";
    var boo =
      "0%," + pct(turn - 0.08) + "," + pct(turn + 0.16) + ",100%{transform:scale(1)}" +
      pct(turn - 0.02) + "{transform:scale(1.9,1.7)}" + pct(turn + 0.04) + "{transform:scale(1.6,1.95)}" +
      pct(turn + 0.1) + "{transform:scale(1.9,1.6)}";
    var L = S + ".lbl-";
    return (
      "@keyframes lbgHat{0%,100%{transform:rotate(-4deg) translateY(" + px(-6) + ")}50%{transform:rotate(3.5deg) translateY(" + px(4) + ")}}" +
      "@keyframes lbgScarf{0%{transform:rotate(-3deg) skewY(2deg)}100%{transform:rotate(6deg) skewY(-5deg)}}" +
      "@keyframes lbgArmL{0%,100%{transform:rotate(6deg)}50%{transform:rotate(-16deg)}}" +
      "@keyframes lbgArmR{0%,100%{transform:rotate(0deg)}50%{transform:rotate(-7deg)}}" +
      "@keyframes lbgBow{0%{transform:rotate(-9deg)}100%{transform:rotate(9deg)}}" +
      "@keyframes lbgLook{" + look + "}" +
      "@keyframes lbgBlink{" + blink + "}" +
      "@keyframes lbgBoo{" + boo + "}" +
      L + "hat," + L + "hat-back{animation:lbgHat 1s ease-in-out -.25s infinite}" +
      L + "scarf{animation:lbgScarf .5s ease-in-out infinite alternate}" +
      L + "scarf-back{animation:lbgScarf .55s ease-in-out -.18s infinite alternate}" +
      L + "arm-l{animation:lbgArmL 1.1s ease-in-out infinite}" +
      L + "arm-r{animation:lbgArmR 1.1s ease-in-out -.3s infinite}" +
      L + "bow{animation:lbgBow .6s ease-in-out infinite alternate}" +
      L + "eyes{animation:lbgLook " + D + "ms ease-in-out forwards}" +
      L + "eye-l," + L + "eye-r{animation:lbgBlink " + D + "ms linear forwards}" +
      L + "mouth{animation:lbgBoo " + D + "ms ease-in-out forwards}"
    );
  }


  var ORIGIN = {
    "hat": [267, 300], "hat-back": [267, 300], "scarf": [440, 330], "scarf-back": [505, 500],
    "arm-l": [140, 560], "arm-r": [355, 495], "bow": [205, 528], "eyes": [225, 348],
    "eye-l": [167, 350], "eye-r": [282, 346], "mouth": [224.5, 441]
  };
  var BOX_PAD = 6;

  function partName(el) {
    var m = /(?:^|\s)lbg-([a-z-]+)/.exec(el.getAttribute("class") || "");
    return m ? m[1] : null;
  }

  function boxOf(el, fallback) {
    try {
      var b = el.getBBox();
      if (b && b.width > 0 && b.height > 0) {
        return { x: b.x - BOX_PAD, y: b.y - BOX_PAD, w: b.width + 2 * BOX_PAD, h: b.height + 2 * BOX_PAD };
      }
    } catch (_e) {}
    return fallback;
  }

  function pctOf(v) {
    return (v * 100).toFixed(4) + "%";
  }

  function makeLayer(name, inner, box, parent) {
    var o = ORIGIN[name];
    var d = document.createElement("div");
    d.className = "lbl" + (name ? " lbl-" + name : "");
    d.setAttribute(
      "style",
      "left:" + pctOf((box.x - parent.x) / parent.w) + ";top:" + pctOf((box.y - parent.y) / parent.h) +
        ";width:" + pctOf(box.w / parent.w) + ";height:" + pctOf(box.h / parent.h) +
        (o ? ";transform-origin:" + pctOf((o[0] - box.x) / box.w) + " " + pctOf((o[1] - box.y) / box.h) : "")
    );
    if (inner) {
      d.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + [box.x, box.y, box.w, box.h].join(" ") +
        '" preserveAspectRatio="none" aria-hidden="true" focusable="false">' + inner + "</svg>";
    }
    return d;
  }

  function buildLayers(svgText, size, h) {
    var meas = document.createElement("div");
    meas.setAttribute("aria-hidden", "true");
    meas.style.cssText =
      "position:fixed;left:-10000px;top:0;width:" + size + "px;height:" + h + "px;visibility:hidden;pointer-events:none;contain:strict";
    meas.innerHTML = svgText;
    document.body.appendChild(meas);
    try {
      var svg = meas.querySelector("svg");
      if (!svg) return null;
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      var vbv = svg.viewBox && svg.viewBox.baseVal;
      var vb = vbv && vbv.width ? { x: vbv.x, y: vbv.y, w: vbv.width, h: vbv.height } : { x: 0, y: 0, w: 716, h: 843 };
      var frag = document.createDocumentFragment();
      var kids = Array.prototype.slice.call(svg.children || svg.childNodes);
      kids.forEach(function (el) {
        if (el.nodeType !== 1) return;
        var name = partName(el);
        var box = boxOf(el, vb);
        if (name === "eyes") {
          var wrap = makeLayer("eyes", "", box, vb);
          Array.prototype.slice.call(el.children || el.childNodes).forEach(function (eye) {
            if (eye.nodeType !== 1) return;
            wrap.appendChild(makeLayer(partName(eye), eye.outerHTML, boxOf(eye, box), box));
          });
          frag.appendChild(wrap);
        } else {
          frag.appendChild(makeLayer(name, el.outerHTML, box, vb));
        }
      });
      return frag;
    } catch (_e) {
      return null;
    } finally {
      if (meas.parentNode) meas.parentNode.removeChild(meas);
    }
  }

  var stage = null;
  var observer = null;
  var finished = false;

  function teardown(fade) {
    if (finished) return;
    finished = true;
    if (observer) observer.disconnect();
    document.removeEventListener("visibilitychange", onBusyCheck);
    if (!stage) return;
    var s = stage;
    stage = null;
    if (fade) {
      s.style.transition = "opacity .2s ease";
      s.style.opacity = "0";
      setTimeout(function () {
        if (s.parentNode) s.parentNode.removeChild(s);
      }, 250);
    } else if (s.parentNode) {
      s.parentNode.removeChild(s);
    }
  }

  function onBusyCheck() {
    if (busy()) teardown(true);
  }

  function fly(svgText) {
    if (!svgText || busy() || !document.body) return;
    markSeen();

    var W = window.innerWidth || document.documentElement.clientWidth;
    var H = window.innerHeight || document.documentElement.clientHeight;
    var size = Math.round(clamp(W * 0.27, 96, 150));
    var h = Math.round(size * 843 / 716);
    var name = "lbGhostFly" + Date.now();
    var flight = buildFlight(name, W, H, size);
    var D = Math.round(clamp(DURATION_MS * flight.length / REF_PATH_PX, DURATION_MS, MAX_DURATION_MS));

    stage = document.createElement("div");
    stage.setAttribute("aria-hidden", "true");
    stage.className = "lb-ghost-stage";

    var layers = buildLayers(svgText, size, h);
    if (!layers) return;

    var css = document.createElement("style");
    css.textContent =
      flight.css +
      partsCss(D, flight.turn, size / 716) +
      "@keyframes lbGhostBob{0%,100%{transform:translate3d(0,-6px,0)}50%{transform:translate3d(0,6px,0)}}" +
      ".lb-ghost-stage{position:fixed;top:0;left:0;right:0;bottom:0;overflow:hidden;pointer-events:none;z-index:99999998;contain:strict}" +
      ".lb-ghost-stage *{pointer-events:none}" +
      ".lb-ghost-fly{position:absolute;top:0;left:0;width:" + size + "px;height:" + h + "px;" +
      "margin:" + -Math.round(h / 2) + "px 0 0 " + -Math.round(size / 2) + "px;will-change:transform;" +
      "animation:" + name + " " + D + "ms linear forwards}" +
      ".lb-ghost-glow{position:absolute;left:-22%;top:-14%;width:144%;height:128%;border-radius:50%;" +
      "background:radial-gradient(closest-side,rgba(255,255,255,.38),rgba(255,255,255,.12) 60%,rgba(255,255,255,0))}" +
      ".lb-ghost-bob{position:relative;width:100%;height:100%;will-change:transform;" +
      "animation:lbGhostBob 1s ease-in-out infinite}" +
      ".lb-ghost-bob .lbl{position:absolute;display:block;overflow:visible}" +
      ".lb-ghost-bob .lbl>svg{display:block;width:100%;height:100%;overflow:visible}";

    var flyEl = document.createElement("div");
    flyEl.className = "lb-ghost-fly";
    var glow = document.createElement("div");
    glow.className = "lb-ghost-glow";
    var bob = document.createElement("div");
    bob.className = "lb-ghost-bob";
    bob.appendChild(layers);
    flyEl.appendChild(glow);
    flyEl.appendChild(bob);
    stage.appendChild(css);
    stage.appendChild(flyEl);
    flyEl.addEventListener("animationend", function (e) {
      if (e.target === flyEl) teardown(false);
    });
    document.body.appendChild(stage);

    setTimeout(function () {
      teardown(false);
    }, D + 600);

    if (window.MutationObserver) {
      observer = new MutationObserver(onBusyCheck);
      var opts = { attributes: true, attributeFilter: ["class"] };
      observer.observe(document.documentElement, opts);
      observer.observe(document.body, opts);
      ["preview-screen", "ic-output-screen"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) observer.observe(el, opts);
      });
      var cd = document.getElementById("countdown");
      if (cd) observer.observe(cd, { childList: true, characterData: true, subtree: true });
    }
    document.addEventListener("visibilitychange", onBusyCheck);
  }

  var launched = false;

  function launch(delay) {
    if (launched) return;
    launched = true;
    var timeout = new Promise(function (resolve) {
      setTimeout(function () {
        resolve(null);
      }, SVG_WAIT_MS);
    });
    var started = Date.now();
    Promise.race([svgMarkup, timeout]).then(function (txt) {
      setTimeout(function () {
        fly(txt);
      }, Math.max(0, delay - (Date.now() - started)));
    });
  }

  function watchCurtain() {
    var left = document.getElementById("curtain-left");
    var intro = document.getElementById("curtain-intro");
    if (!left || !intro || intro.classList.contains("done") || left.classList.contains("open")) {
      launch(left && left.classList.contains("open") && !intro.classList.contains("done") ? START_AFTER_OPEN_MS : START_LATE_MS);
      return;
    }
    if (window.MutationObserver) {
      var mo = new MutationObserver(function () {
        if (left.classList.contains("open")) {
          mo.disconnect();
          launch(START_AFTER_OPEN_MS);
        }
      });
      mo.observe(left, { attributes: true, attributeFilter: ["class"] });
    } else {
      var poll = setInterval(function () {
        if (left.classList.contains("open") || !left.parentNode) {
          clearInterval(poll);
          launch(START_AFTER_OPEN_MS);
        }
      }, 50);
    }
  }

  if (document.getElementById("curtain-left") || document.readyState !== "loading") {
    watchCurtain();
  } else {
    document.addEventListener("DOMContentLoaded", watchCurtain, { once: true });
  }
})();
