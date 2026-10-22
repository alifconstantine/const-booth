(function () {
  "use strict";

  if (window.__lbGuardInstalled) return;
  window.__lbGuardInstalled = true;

  try {
    if (typeof Document !== "undefined" && "browsingTopics" in Document.prototype) {
      Document.prototype.browsingTopics = function () {
        return Promise.resolve([]);
      };
    }
  } catch (_e) {}

  var ua = navigator.userAgent || navigator.vendor || window.opera || "";

  var IAB_RE = /Instagram|FBAN|FBAV|FB_IAB|FB4A|FBIOS|Messenger|BytedanceWebview|musical_ly|Bytedance|TikTok|Snapchat|Pinterest|LinkedInApp|Twitter|MicroMessenger|Line\/|KAKAOTALK/i;

  var isIAB = false;
  try {
    isIAB = IAB_RE.test(ua) || (/Android/i.test(ua) && /;\s*wv\)/i.test(ua));
  } catch (_e) {}
  window.__lbIsIAB = isIAB;

  var ALLOWED_HOSTS = [
    "accounts.google.com",
    "storage.ko-fi.com",
    "ko-fi.com",
    "twitter.com",
    "x.com",
    "facebook.com",
    "wa.me",
    "api.whatsapp.com",
    "pinterest.com",
    "instagram.com",
    "producthunt.com",
    "wikipedia.org",
    "developer.mozilla.org",
    "caniuse.com"
  ];

  var selfOrigin = location.protocol + "//" + location.host;

  function parseUrl(u) {
    try {
      var a = document.createElement("a");
      a.href = u;
      if (!a.host) return null;
      return { origin: a.protocol + "//" + a.host, hostname: a.hostname, href: a.href };
    } catch (_e) {
      return null;
    }
  }

  function isAllowedExternal(parsed) {
    if (!parsed) return false;
    if (parsed.origin === selfOrigin) return true;
    var host = parsed.hostname;
    for (var i = 0; i < ALLOWED_HOSTS.length; i++) {
      var h = ALLOWED_HOSTS[i];
      if (host === h) return true;
      if (host.length > h.length && host.slice(-(h.length + 1)) === "." + h) return true;
    }
    return false;
  }
  window.__lbIsAllowedExternal = isAllowedExternal;

  var lastGesture = 0;
  (function trackGestures() {
    try {
      if (!window.addEventListener) return;
      var mark = function (ev) {
        if (ev && ev.isTrusted) lastGesture = Date.now();
      };

      var opts = null;
      try {
        var probe = Object.defineProperty({}, "passive", {
          get: function () {
            opts = { capture: true, passive: true };
            return true;
          }
        });
        window.addEventListener("lbprobe", null, probe);
      } catch (_e) {}
      if (!opts) opts = true;
      window.addEventListener("pointerdown", mark, opts);
      window.addEventListener("touchstart", mark, opts);
      window.addEventListener("mousedown", mark, opts);
      window.addEventListener("keydown", mark, opts);
    } catch (_e) {}
  })();
  window.__lbLastGesture = function () { return lastGesture; };

  function hasGesture() {
    return Date.now() - lastGesture < 1500;
  }

  function activeIsAd() {
    try {
      var a = document.activeElement;
      if (!a) return false;
      return a.tagName === "IFRAME";
    } catch (_e) {
      return false;
    }
  }

  function shouldBlock(parsed) {
    if (!parsed) return false;
    if (parsed.origin === selfOrigin) return false;
    if (isAllowedExternal(parsed)) return false;
    if (isIAB) return true;
    if (activeIsAd()) return true;
    if (!hasGesture()) return true;
    return false;
  }
  window.__lbShouldBlockNav = shouldBlock;

  (function protectWindowOpen() {
    try {
      var rawOpen = window.open;
      if (typeof rawOpen !== "function") return;
      window.open = function (url) {
        if (url && shouldBlock(parseUrl(url))) return null;
        return rawOpen.apply(this, arguments);
      };
    } catch (_e) {}
  })();

  (function protectLocation() {
    try {
      var loc = window.location;
      if (!loc) return;

      var rawAssign = loc.assign;
      if (typeof rawAssign === "function") {
        loc.assign = function (url) {
          if (shouldBlock(parseUrl(url))) return;
          return rawAssign.apply(loc, arguments);
        };
      }

      var rawReplace = loc.replace;
      if (typeof rawReplace === "function") {
        loc.replace = function (url) {
          if (shouldBlock(parseUrl(url))) return;
          return rawReplace.apply(loc, arguments);
        };
      }

      var proto = window.Location ? window.Location.prototype : Object.getPrototypeOf(loc);
      if (!proto) return;
      var desc = Object.getOwnPropertyDescriptor(proto, "href");
      if (!desc || !desc.set || !desc.configurable) return;
      Object.defineProperty(proto, "href", {
        configurable: true,
        enumerable: true,
        get: function () { return desc.get.call(this); },
        set: function (val) {
          if (shouldBlock(parseUrl(val))) return;
          return desc.set.call(this, val);
        }
      });
    } catch (_e) {}
  })();

  (function protectAnchorClick() {
    try {
      if (typeof HTMLAnchorElement === "undefined") return;
      var rawClick = HTMLAnchorElement.prototype.click;
      if (typeof rawClick !== "function") return;
      HTMLAnchorElement.prototype.click = function () {
        try {
          var href = this.getAttribute("href") || this.href;
          if (href && shouldBlock(parseUrl(href))) return;
        } catch (_e) {}
        return rawClick.apply(this, arguments);
      };
    } catch (_e) {}
  })();

  (function protectFormSubmit() {
    try {
      if (typeof HTMLFormElement === "undefined") return;
      var rawSubmit = HTMLFormElement.prototype.submit;
      if (typeof rawSubmit === "function") {
        HTMLFormElement.prototype.submit = function () {
          try {
            var action = this.getAttribute("action") || this.action || "";
            if (action && shouldBlock(parseUrl(action))) return;
          } catch (_e) {}
          return rawSubmit.apply(this, arguments);
        };
      }
      if (window.addEventListener) {
        window.addEventListener("submit", function (ev) {
          try {
            var form = ev.target;
            if (!form || form.tagName !== "FORM") return;
            var action = form.getAttribute("action") || form.action || "";
            if (action && shouldBlock(parseUrl(action))) {
              ev.preventDefault();
              if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
            }
          } catch (_e) {}
        }, true);
      }
    } catch (_e) {}
  })();

  function metaRefreshTarget(node) {
    try {
      if (!node || node.tagName !== "META") return null;
      var eq = node.getAttribute("http-equiv");
      if (!eq || eq.toLowerCase() !== "refresh") return null;
      var content = node.getAttribute("content") || "";
      var m = /url\s*=\s*['"]?([^'";]+)/i.exec(content);
      if (!m) return null;
      return parseUrl(m[1].replace(/^\s+|\s+$/g, ""));
    } catch (_e) {
      return null;
    }
  }

  function neutraliseMetaRefresh(node) {
    var target = metaRefreshTarget(node);
    if (!target || !shouldBlock(target)) return false;
    try { node.removeAttribute("http-equiv"); } catch (_e) {}
    try { node.removeAttribute("content"); } catch (_e) {}
    return true;
  }

  (function protectHtmlSinks() {
    function sanitize(html) {
      try {
        if (typeof html !== "string" || !/http-equiv/i.test(html)) return html;
        return html.replace(/<meta\b[^>]*?http-equiv\s*=\s*['"]?refresh['"]?[^>]*>/gi, function (tag) {
          var m = /url\s*=\s*['"]?([^'";>\s]+)/i.exec(tag);
          if (!m) return tag;
          return shouldBlock(parseUrl(m[1])) ? "" : tag;
        });
      } catch (_e) {
        return html;
      }
    }

    function patchProp(proto, name) {
      try {
        if (!proto) return;
        var desc = Object.getOwnPropertyDescriptor(proto, name);
        if (!desc || !desc.set || !desc.configurable) return;
        Object.defineProperty(proto, name, {
          configurable: true,
          enumerable: desc.enumerable,
          get: desc.get ? function () { return desc.get.call(this); } : undefined,
          set: function (v) { return desc.set.call(this, sanitize(v)); }
        });
      } catch (_e) {}
    }

    if (typeof Element !== "undefined") {
      patchProp(Element.prototype, "innerHTML");
      patchProp(Element.prototype, "outerHTML");
      try {
        var rawAdj = Element.prototype.insertAdjacentHTML;
        if (typeof rawAdj === "function") {
          Element.prototype.insertAdjacentHTML = function (pos, html) {
            return rawAdj.call(this, pos, sanitize(html));
          };
        }
      } catch (_e) {}
    }

    try {
      var rawWrite = document.write;
      if (typeof rawWrite === "function") {
        document.write = function (s) { return rawWrite.call(document, sanitize(s)); };
      }
      var rawWriteln = document.writeln;
      if (typeof rawWriteln === "function") {
        document.writeln = function (s) { return rawWriteln.call(document, sanitize(s)); };
      }
    } catch (_e) {}
  })();

  (function patchInsertion() {
    try {
      if (typeof Node === "undefined" || !Node.prototype) return;
      var names = ["appendChild", "insertBefore"];
      for (var n = 0; n < names.length; n++) {
        (function (name) {
          var raw = Node.prototype[name];
          if (typeof raw !== "function") return;
          Node.prototype[name] = function (node) {
            try {
              if (node && node.nodeType === 1) {
                neutraliseMetaRefresh(node);
                if (node.getElementsByTagName) {
                  var metas = node.getElementsByTagName("meta");
                  for (var q = 0; q < metas.length; q++) neutraliseMetaRefresh(metas[q]);
                }
              }
            } catch (_e) {}
            return raw.apply(this, arguments);
          };
        })(names[n]);
      }
    } catch (_e) {}
  })();

  (function watchInjectedMetaRefresh() {
    try {
      if (typeof MutationObserver === "undefined") return;
      var mo = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var mut = muts[i];
          if (mut.type === "attributes") {
            neutraliseMetaRefresh(mut.target);
            continue;
          }
          var added = mut.addedNodes;
          for (var j = 0; j < added.length; j++) {
            var node = added[j];
            if (!node || node.nodeType !== 1) continue;
            neutraliseMetaRefresh(node);
            if (!node.getElementsByTagName) continue;
            var metas = node.getElementsByTagName("meta");
            for (var k = 0; k < metas.length; k++) neutraliseMetaRefresh(metas[k]);
          }
        }
      });
      mo.observe(document.documentElement || document, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["http-equiv", "content"]
      });
      window.__lbMetaRefreshObserver = mo;
    } catch (_e) {}
  })();
})();
