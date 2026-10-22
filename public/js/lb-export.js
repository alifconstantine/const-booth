
(function () {
  "use strict";

  if (window.LBExport) return;

  var UA = navigator.userAgent || navigator.vendor || "";

  

  var isIOS =
    /iPad|iPhone|iPod/i.test(UA) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);



  var inAppName = (function () {
    var tests = [
      ["Instagram", /Instagram/i],
      ["Messenger", /FB_IAB\/MESSENGER|MessengerFor|Messenger(Lite)?\//i],
      ["Facebook", /FBAN|FBAV|FB_IAB|FB4A/i],
      ["TikTok", /BytedanceWebview|musical_ly|Bytedance|TikTok/i],
      ["Snapchat", /Snapchat/i],
      ["Pinterest", /Pinterest/i],
      ["LinkedIn", /LinkedInApp/i],
      ["X", /Twitter(Android|for)/i],
      ["LINE", /\bLine\//i],
      ["WeChat", /MicroMessenger/i],
      ["KakaoTalk", /KAKAOTALK/i],
    ];
    for (var i = 0; i < tests.length; i++) {
      if (tests[i][1].test(UA)) return tests[i][0];
    }
    return null;
  })();

  var isAndroidInApp = /Android/i.test(UA) && !!inAppName;

  var env = {
    ua: UA,
    isIOS: isIOS,
    inAppName: inAppName,
    isAndroidInApp: isAndroidInApp,
    hasShare: typeof navigator.share === "function",
    hasCanShare: typeof navigator.canShare === "function",
    hasClipboardImage:
      !!(navigator.clipboard && navigator.clipboard.write) &&
      typeof window.ClipboardItem === "function",
    hasDownload: "download" in document.createElement("a"),
  };

  

  var logs = [];

  
  function log(event, data) {
    var entry = {
      t: Date.now(),
      event: event,
      ios: env.isIOS,
    };
    if (data) {
      for (var k in data) {
        if (Object.prototype.hasOwnProperty.call(data, k)) entry[k] = data[k];
      }
    }
    logs.push(entry);
    if (logs.length > 60) logs.shift();

    var failed = event.indexOf("fail") !== -1 || event.indexOf("error") !== -1;
    try {
      if (failed) console.warn("[LBExport]", event, entry);
      else console.info("[LBExport]", event, entry);
    } catch (_e) {}

    try {
      if (typeof window.trackGA4Event === "function") {
        window.trackGA4Event("export_" + event, entry);
      }
    } catch (_e) {}
    return entry;
  }

  

  
  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve) {
      var settled = false;
      function done(blob) {
        if (settled) return;
        settled = true;
        resolve(blob && blob.size > 0 ? blob : null);
      }
      
      
      var timer = setTimeout(function () {
        if (settled) return;
        try {
          done(dataUrlToBlob(canvas.toDataURL(type || "image/jpeg", quality)));
        } catch (_e) {
          done(null);
        }
      }, 15000);

      try {
        if (typeof canvas.toBlob !== "function") throw new Error("no toBlob");
        canvas.toBlob(
          function (blob) {
            clearTimeout(timer);
            if (blob && blob.size > 0) return done(blob);
            try {
              done(
                dataUrlToBlob(canvas.toDataURL(type || "image/jpeg", quality))
              );
            } catch (_e) {
              done(null);
            }
          },
          type || "image/jpeg",
          quality
        );
      } catch (_e) {
        clearTimeout(timer);
        try {
          done(dataUrlToBlob(canvas.toDataURL(type || "image/jpeg", quality)));
        } catch (_e2) {
          done(null);
        }
      }
    });
  }

  
  function dataUrlToBlob(dataUrl) {
    try {
      if (typeof dataUrl !== "string" || dataUrl.indexOf("data:") !== 0)
        return null;
      var comma = dataUrl.indexOf(",");
      if (comma < 0) return null;
      var header = dataUrl.slice(0, comma);
      var mimeMatch = header.match(/data:([^;,]+)/);
      var mime = (mimeMatch && mimeMatch[1]) || "image/png";
      var body = dataUrl.slice(comma + 1);
      if (header.indexOf(";base64") === -1) {
        return new Blob([decodeURIComponent(body)], { type: mime });
      }
      var bin = atob(body);
      var len = bin.length;
      var arr = new Uint8Array(len);
      for (var i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
      return new Blob([arr], { type: mime });
    } catch (_e) {
      return null;
    }
  }

  
  function isStubImage(s) {
    if (!s || typeof s !== "string") return false;
    var comma = s.indexOf(",");
    if (s.indexOf("data:") !== 0 || comma < 0) return false;
    var head = s.slice(comma + 1, comma + 32);
    return (
      head.indexOf("R0lGODlhAQAB") !== -1 ||
      head.indexOf("AQABAIAAAAAAAP") !== -1
    );
  }

  
  function isPlaceholderImage(s, minChars) {
    if (!s || typeof s !== "string") return true;
    if (s.indexOf("data:") !== 0) return true;
    if (s === "data:,") return true;
    if (s.indexOf(",") < 0) return true;
    if (s.length < (minChars || 1024)) return true;
    return isStubImage(s);
  }

  
  function blobToDataUrl(blob) {
    return new Promise(function (resolve) {
      try {
        var fr = new FileReader();
        fr.onload = function () {
          resolve(typeof fr.result === "string" ? fr.result : null);
        };
        fr.onerror = function () {
          resolve(null);
        };
        fr.readAsDataURL(blob);
      } catch (_e) {
        resolve(null);
      }
    });
  }

  

  var objectUrls = [];

  
  function makeObjectUrl(blob) {
    var url = URL.createObjectURL(blob);
    objectUrls.push(url);
    setTimeout(function () {
      try {
        URL.revokeObjectURL(url);
      } catch (_e) {}
      var idx = objectUrls.indexOf(url);
      if (idx !== -1) objectUrls.splice(idx, 1);
    }, 120000);
    return url;
  }

  function revokeAll() {
    for (var i = 0; i < objectUrls.length; i++) {
      try {
        URL.revokeObjectURL(objectUrls[i]);
      } catch (_e) {}
    }
    objectUrls.length = 0;
  }

  function extensionFor(mime) {
    if (!mime) return "jpg";
    if (mime.indexOf("png") !== -1) return "png";
    if (mime.indexOf("webp") !== -1) return "webp";
    return "jpg";
  }

  
  function normalise(payload) {
    var p = payload || {};
    var blob = p.blob || null;
    var dataUrl = typeof p.dataUrl === "string" ? p.dataUrl : null;

    if (!blob && dataUrl) blob = dataUrlToBlob(dataUrl);
    if (blob && !(blob instanceof Blob)) blob = null;

    var mime = (blob && blob.type) || "image/jpeg";
    var name =
      p.filename || "lensbooth-" + Date.now() + "." + extensionFor(mime);

    return {
      blob: blob,
      dataUrl: dataUrl,
      filename: name,
      title: p.title || "My ConstBooth",
      text: p.text || "Check out my photo from ConstBooth!",
      label: p.label || "photo",
    };
  }

  

  
  function toast(message, kind) {
    try {
      if (typeof window.showPillMessage === "function") {
        window.showPillMessage(message, {
          type: kind === "error" ? "error" : (kind === "info" ? "info" : "success"),
          position: "top-center",
          duration: 2500
        });
        return;
      }
      var host = document.getElementById("lb-export-toast-host");
      if (!host) {
        host = document.createElement("div");
        host.id = "lb-export-toast-host";
        host.setAttribute("role", "status");
        host.setAttribute("aria-live", "polite");
        host.style.cssText =
          "position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));" +
          "transform:translateX(-50%);z-index:2147483000;display:flex;flex-direction:column;" +
          "gap:8px;align-items:center;pointer-events:none;max-width:92vw;";
        document.body.appendChild(host);
      }
      var el = document.createElement("div");
      var iconSvg = kind === "error"
        ? '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'
        : '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" style="flex-shrink:0;"><polyline points="20 6 9 17 4 12"></polyline></svg>';
      el.innerHTML = iconSvg + '<span style="line-height:1.2;">' + message + '</span>';
      el.style.cssText =
        "background:" +
        (kind === "error" ? "rgba(190,28,38,.97)" : "rgba(20,20,20,.95)") +
        ";color:#fff;padding:10px 18px;border-radius:999px;font-size:14px;" +
        "font-family:'Satoshi',system-ui,-apple-system,sans-serif;font-weight:600;" +
        "box-shadow:0 6px 24px rgba(0,0,0,.35);opacity:1;transition:opacity .22s ease;" +
        "display:inline-flex;align-items:center;justify-content:center;gap:8px;line-height:1.35;";
      
      host.appendChild(el);
      setTimeout(
        function () {
          el.style.opacity = "0";
          setTimeout(function () {
            try {
              el.remove();
            } catch (_e) {}
          }, 260);
        },
        kind === "error" ? 4200 : 2400
      );
    } catch (_e) {}
  }

  

  function copyText(text) {
    return new Promise(function (resolve) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(
            function () {
              resolve(true);
            },
            function () {
              resolve(legacyCopy(text));
            }
          );
          return;
        }
      } catch (_e) {}
      resolve(legacyCopy(text));
    });
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0;";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      var ok = document.execCommand("copy");
      ta.remove();
      return !!ok;
    } catch (_e) {
      return false;
    }
  }


  

  
  function tryShareFile(p) {
    if (!env.hasShare || !p.blob) {
      return Promise.resolve({ ok: false, method: "share", reason: "unsupported" });
    }
    var file;
    try {
      file = new File([p.blob], p.filename, {
        type: p.blob.type || "image/jpeg",
      });
    } catch (_e) {
      return Promise.resolve({ ok: false, method: "share", reason: "file-ctor" });
    }

    var data = { files: [file], title: p.title, text: p.text };

    if (env.hasCanShare) {
      var can = false;
      try {
        can = navigator.canShare(data);
      } catch (_e) {
        can = false;
      }
      
      
      if (!can && env.isIOS) {
        return Promise.resolve({
          ok: false,
          method: "share",
          reason: "canShare-false",
        });
      }
    }

    var promise;
    try {
      promise = navigator.share(data);
    } catch (err) {
      return Promise.resolve({
        ok: false,
        method: "share",
        reason: (err && err.name) || "throw",
      });
    }
    if (!promise || typeof promise.then !== "function") {
      return Promise.resolve({ ok: false, method: "share", reason: "no-promise" });
    }

    return promise.then(
      function () {
        return { ok: true, method: "share" };
      },
      function (err) {
        var name = (err && err.name) || "Error";
        
        
        
        if (name === "AbortError") {
          return { ok: true, method: "share", aborted: true };
        }
        return { ok: false, method: "share", reason: name };
      }
    );
  }

  
  function tryDownload(p) {
    if (!env.hasDownload || !p.blob) {
      return Promise.resolve({
        ok: false,
        method: "download",
        reason: env.hasDownload ? "no-blob" : "blocked-env",
      });
    }
    try {
      var url = makeObjectUrl(p.blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = p.filename;
      a.rel = "noopener";
      a.style.cssText = "position:fixed;left:-9999px;opacity:0;";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        try {
          a.remove();
        } catch (_e) {}
      }, 1000);
      return Promise.resolve({ ok: true, method: "download" });
    } catch (err) {
      return Promise.resolve({
        ok: false,
        method: "download",
        reason: (err && err.name) || "throw",
      });
    }
  }

  
  function tryClipboard(p) {
    if (!env.hasClipboardImage || !p.blob) {
      return Promise.resolve({
        ok: false,
        method: "clipboard",
        reason: "unsupported",
      });
    }
    try {
      var type = p.blob.type || "image/png";
      
      if (type !== "image/png" && env.isIOS) {
        return Promise.resolve({
          ok: false,
          method: "clipboard",
          reason: "type",
        });
      }
      var item = {};
      item[type] = p.blob;
      return navigator.clipboard.write([new ClipboardItem(item)]).then(
        function () {
          return { ok: true, method: "clipboard" };
        },
        function (err) {
          return {
            ok: false,
            method: "clipboard",
            reason: (err && err.name) || "reject",
          };
        }
      );
    } catch (err) {
      return Promise.resolve({
        ok: false,
        method: "clipboard",
        reason: (err && err.name) || "throw",
      });
    }
  }

  var STRATEGIES = {
    share: tryShareFile,
    download: tryDownload,
    clipboard: tryClipboard,
  };

  
  function runShare(p, order, localUrl) {
    var attempts = [];

    
    var pathname = window.location.pathname || '';
    var isBoothOrFrame = pathname.indexOf('/booth') !== -1 || pathname.indexOf('/frame') !== -1 || pathname.indexOf('/camera') !== -1;
    if (isBoothOrFrame && window.LBGuestStorage && (p.dataUrl || p.blob)) {
      try {
        var isCard = pathname.indexOf('/frame') !== -1 || (typeof localStorage !== 'undefined' && localStorage.getItem('outputMode') === 'card');
        var style = typeof localStorage !== 'undefined' ? localStorage.getItem('lb_selected_style') || 'classic' : 'classic';
        if (p.dataUrl) {
          window.LBGuestStorage.saveGuestStrip({
            image: p.dataUrl,
            style: style,
            mode: isCard ? 'card' : 'strip',
            
            explicit: true
          }).then(function() {
            if (window.LBAuthSync) window.LBAuthSync.syncPending();
          });
        } else if (p.blob) {
          blobToDataUrl(p.blob).then(function(dUrl) {
            if (dUrl && window.LBGuestStorage) {
              window.LBGuestStorage.saveGuestStrip({
                image: dUrl,
                style: style,
                mode: isCard ? 'card' : 'strip',
                explicit: true
              }).then(function() {
                if (window.LBAuthSync) window.LBAuthSync.syncPending();
              });
            }
          });
        }
      } catch (_e) {}
    }

    function step(i) {
      if (i >= order.length) {
        log("exhausted", { attempts: attempts.join(",") });
        return Promise.resolve({
          ok: false,
          method: null,
          attempts: attempts,
        });
      }
      var name = order[i];
      var fn = STRATEGIES[name];
      if (!fn) return step(i + 1);

      return fn(p, localUrl).then(function (res) {
        attempts.push(name + (res.ok ? ":ok" : ":" + (res.reason || "fail")));
        if (res.ok) {
          res.attempts = attempts;
          return res;
        }
        return step(i + 1);
      });
    }

    return step(0);
  }

  


  function uploadTempImage(dataUrl) {
    if (!dataUrl || dataUrl.indexOf("data:") !== 0) return Promise.resolve(null);
    return fetch("/api/temp-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-lb-csrf": "true" },
      body: JSON.stringify({ image: dataUrl }),
    })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (data) {
        if (data && data.id) {
          log("temp_upload_ok", { id: data.id.slice(0, 8) });
          return data.id;
        }
        log("temp_upload_fail", { reason: "no-id" });
        return null;
      })
      .catch(function (err) {
        log("temp_upload_fail", { reason: (err && err.name) || "throw" });
        return null;
      });
  }



  function downloadUrlFor(tempId) {
    return (
      location.origin + "/api/temp-image/" + encodeURIComponent(tempId) + "?dl=1"
    );
  }




  function openDownloadInBrowser(tempId) {
    var url = downloadUrlFor(tempId);

    if (!/Android/i.test(UA)) {
      window.location.href = url;
      return;
    }

    window.location.href =
      "intent://" +
      url.replace(/^https?:\/\//, "") +
      "#Intent;scheme=https;action=android.intent.action.VIEW;" +
      "S.browser_fallback_url=" +
      encodeURIComponent(url) +
      ";end";
  }


  var fallbackEl = null;

  function closeFallback() {
    try {
      if (fallbackEl) {
        if (fallbackEl.parentNode) fallbackEl.parentNode.removeChild(fallbackEl);
        fallbackEl = null;
      }
    } catch (_e) {}
  }


  function showManualSaveFallback(p) {
    var src = p.dataUrl;
    if (!src && p.blob) src = makeObjectUrl(p.blob);
    if (!src) return false;

    closeFallback();

    var appName = env.inAppName || "this app";

    var overlay = document.createElement("div");
    overlay.id = "lb-export-fallback";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Save your " + p.label);
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:2147483000;background:rgba(8,8,10,.97);" +
      "display:flex;flex-direction:column;align-items:center;justify-content:center;" +
      "padding:calc(16px + env(safe-area-inset-top,0px)) 16px " +
      "calc(16px + env(safe-area-inset-bottom,0px));overflow-y:auto;" +
      "font-family:'Satoshi',system-ui,-apple-system,sans-serif;color:#fff;" +
      "-webkit-overflow-scrolling:touch;";

    overlay.innerHTML =
      '<div style="width:100%;max-width:480px;display:flex;flex-direction:column;' +
      'align-items:center;gap:14px;margin:auto 0;">' +
      '<div style="font-size:18px;font-weight:700;text-align:center;">' +
      "Saving doesn&rsquo;t work in " + appName + "&rsquo;s browser</div>" +
      '<div style="font-size:13.5px;color:rgba(255,255,255,.8);text-align:center;line-height:1.5;">' +
      "It won&rsquo;t let us download your photo. Tap below and we&rsquo;ll open your " +
      "normal browser to save it." +
      "</div>" +
      '<img data-lb-fallback-img data-lb-saveable alt="Your ConstBooth ' + p.label + '" style="max-width:100%;' +
      "max-height:46vh;width:auto;height:auto;border-radius:12px;background:#fff;display:block;" +
      '-webkit-touch-callout:default;-webkit-user-select:auto;user-select:auto;" />' +
      '<button type="button" data-lb-fallback-open style="margin-top:4px;width:100%;padding:15px;' +
      "border-radius:12px;border:0;background:#F12850;color:#fff;" +
      'font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;">Open browser &amp; save</button>' +
      '<div data-lb-fallback-note style="font-size:12px;color:rgba(255,255,255,.55);text-align:center;' +
      'line-height:1.5;min-height:1em;">This link is just for you and expires in 15 minutes.</div>' +
      '<button type="button" data-lb-fallback-close style="width:100%;padding:11px;' +
      "border-radius:12px;border:0;background:transparent;color:rgba(255,255,255,.6);" +
      'font-size:14px;font-weight:500;cursor:pointer;font-family:inherit;">Not now</button>' +
      "</div>";

    var img = overlay.querySelector("[data-lb-fallback-img]");
    if (img) img.src = src;

    var openBtn = overlay.querySelector("[data-lb-fallback-open]");
    var note = overlay.querySelector("[data-lb-fallback-note]");







    var readyId = null;

    function prepare() {
      readyId = null;
      if (openBtn) {
        openBtn.disabled = true;
        openBtn.textContent = "Getting your photo ready...";
      }

      var ensureDataUrl = p.dataUrl
        ? Promise.resolve(p.dataUrl)
        : blobToDataUrl(p.blob);

      ensureDataUrl
        .then(function (dataUrl) {
          return dataUrl ? uploadTempImage(dataUrl) : null;
        })
        .then(function (id) {
          if (!openBtn) return;
          if (!id) {
            openBtn.disabled = false;
            openBtn.textContent = "Try again";
            if (note) note.textContent = "We couldn't reach the server. Check your connection and try again.";
            return;
          }
          readyId = id;
          openBtn.disabled = false;
          openBtn.textContent = "Open browser & save";
          if (note) note.textContent = "This link is just for you and expires in 15 minutes.";
        });
    }

    overlay.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || typeof t.closest !== "function") return;

      if (t === overlay || t.closest("[data-lb-fallback-close]")) {
        closeFallback();
        return;
      }

      if (t.closest("[data-lb-fallback-open]")) {
        if (readyId) {


          log("handoff_open", {});
          openDownloadInBrowser(readyId);
        } else {
          prepare();
        }
      }
    });

    document.body.appendChild(overlay);
    fallbackEl = overlay;
    log("fallback_shown", {});


    prepare();
    return true;
  }


  function save(payload) {
    var p = normalise(payload);
    if (!p.blob && !p.dataUrl) {
      log("save_fail", { reason: "empty-payload" });
      toast("Nothing to save yet - give it a moment and try again.", "error");
      return Promise.resolve({ ok: false, method: null, reason: "empty" });
    }




    var order = env.isIOS
      ? ["share", "download"]
      : env.isAndroidInApp
        ? ["share"]
        : ["download", "share"];

    log("save_start", { order: order.join(">"), bytes: p.blob ? p.blob.size : 0 });

    return runShare(p, order).then(function (res) {
      if (res.ok) {
        log("save_ok", { method: res.method, aborted: !!res.aborted });
      } else {
        log("save_fail", { attempts: (res.attempts || []).join(",") });
        if (!showManualSaveFallback(p)) {
          toast("Could not save. Please try again.", "error");
        }
      }
      return res;
    });
  }

  
  function share(payload) {
    var p = normalise(payload);
    if (!p.blob && !p.dataUrl) {
      log("share_fail", { reason: "empty-payload" });
      toast("Nothing to share yet - give it a moment and try again.", "error");
      return Promise.resolve({ ok: false, method: null, reason: "empty" });
    }

    

    var order = env.isAndroidInApp
      ? ["share", "clipboard"]
      : ["share", "clipboard", "download"];

    log("share_start", { order: order.join(">"), bytes: p.blob ? p.blob.size : 0 });

    return runShare(p, order).then(function (res) {
      if (res.ok) {
        log("share_ok", { method: res.method, aborted: !!res.aborted });
        if (res.method === "clipboard") toast("Copied to clipboard!");
        else if (res.method === "download") {
          var user = (window.LBAuthSync && typeof window.LBAuthSync.getCurrentUser === "function") ? window.LBAuthSync.getCurrentUser() : null;
          toast(user ? "Saved to your account & device!" : "Saved to your device.");
          if (user && window.LBAuthSync && typeof window.LBAuthSync.syncPending === "function") {
            window.LBAuthSync.syncPending();
          }
        }
      } else {
        log("share_fail", { attempts: (res.attempts || []).join(",") });
        if (!showManualSaveFallback(p)) {
          toast("Could not open sharing. Try Save image instead.", "error");
        }
      }
      return res;
    });
  }

  
  function diagnose() {
    return Promise.resolve({
      ios: env.isIOS,
      androidInApp: env.isAndroidInApp,
      share: env.hasShare,
      canShare: env.hasCanShare,
      downloadAttr: env.hasDownload,
      clipboardImage: env.hasClipboardImage,
      stripBlobBytes:
        window._latestStripBlob instanceof Blob
          ? window._latestStripBlob.size
          : null,
      stripDataUrlChars:
        typeof window._latestStripDataUrl === "string"
          ? window._latestStripDataUrl.length
          : null,
      cardBlobBytes:
        window._icExportBlob instanceof Blob ? window._icExportBlob.size : null,
      cardDataUrlChars:
        typeof window._icExportDataUrl === "string"
          ? window._icExportDataUrl.length
          : null,
      recentLog: logs.slice(-12).map(function (l) {
        return l.event + (l.method ? "/" + l.method : "");
      }),
    });
  }

  window.LBExport = {
    env: env,
    diagnose: diagnose,
    save: save,
    share: share,
    canvasToBlob: canvasToBlob,
    dataUrlToBlob: dataUrlToBlob,
    isPlaceholderImage: isPlaceholderImage,
    isStubImage: isStubImage,
    blobToDataUrl: blobToDataUrl,
    makeObjectUrl: makeObjectUrl,
    revokeAll: revokeAll,
    copyText: copyText,
    toast: toast,
    log: log,
    getLogs: function () {
      return logs.slice();
    },
  };

  log("init", {
    share: env.hasShare,
    canShare: env.hasCanShare,
    download: env.hasDownload,
    clipboard: env.hasClipboardImage,
  });
})();
