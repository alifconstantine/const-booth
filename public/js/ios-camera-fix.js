
(function () {
  "use strict";

  var ua = navigator.userAgent || "";
  var isIOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!isIOS) return;

  
  
  try {
    document.documentElement.classList.add("lb-no-ctx-filter");
  } catch (_) {}

  var hasPendingOnBoot = false;
  try {
    hasPendingOnBoot = !!(
      sessionStorage.getItem("lb_pending_strip") ||
      sessionStorage.getItem("lb_ic_photos") ||
      sessionStorage.getItem("lb_from_output")
    );
  } catch (_) {}
  if (hasPendingOnBoot) {
    window.__lbSkipAutoCameraStart = true;
  }

  function getBoothKey() {
    try {
      return new URLSearchParams(location.search).get("booth") || "solo";
    } catch (_) {
      return "solo";
    }
  }

  function getFacingMode() {
    try {
      return localStorage.getItem("lb_facing_mode") === "environment"
        ? "environment"
        : "user";
    } catch (_) {
      return "user";
    }
  }

  function forceUnlock() {
    var capturing = false;
    try {
      capturing = document.body.classList.contains("is-capturing");
    } catch (_) {}
    var overlay = document.getElementById("permission-overlay");
    if (overlay) {
      overlay.classList.add("hidden");
      overlay.style.cssText =
        "display:none!important;pointer-events:none!important;visibility:hidden!important;opacity:0!important;z-index:-1!important";
    }
    document.body.classList.add("lb-camera-ready");
    
    if (!capturing) {
      document.body.classList.remove("is-loading", "is-capturing");
      document.documentElement.classList.remove("is-capturing");
    } else {
      document.body.classList.remove("is-loading");
    }

    
    var preview = document.getElementById("preview-screen");
    if (preview && preview.classList.contains("visible")) {
      
      preview.style.removeProperty("pointer-events");
    }
    if (preview && !preview.classList.contains("visible")) {
      document.body.classList.remove("preview-visible");
      preview.style.setProperty("pointer-events", "none", "important");
      try {
        preview
          .querySelectorAll(
            ".machine-stack, .strip-collapse-wrap, .mask-viewport, #preview-img, .lb-strip-style-hit, .output-container, .output-left, .output-right"
          )
          .forEach(function (el) {
            el.style.removeProperty("visibility");
            el.style.removeProperty("pointer-events");
            el.style.removeProperty("opacity");
          });
      } catch (_) {}
    }
    var ic = document.getElementById("ic-output-screen");
    if (ic) {
      if (ic.classList.contains("visible")) {
        
        ic.style.removeProperty("pointer-events");
      } else {
        ic.style.setProperty("pointer-events", "none", "important");
      }
    }

    var capture = document.getElementById("capture-btn");
    if (capture) {
      var isLive = document.body.classList.contains("lb-camera-ready") || (typeof window.__lbStreamLive === "function" && window.__lbStreamLive());
      var isUpload = !!(document.querySelector("#custom-strip-preview.upload-mode-active") || document.querySelector(".upload-active"));
      if (!capturing && (isLive || isUpload)) {
        capture.classList.remove("disabled", "is-loading", "inactive");
      }
      capture.style.pointerEvents = "auto";
      capture.style.zIndex = "";
    }
    ["mobile-flash-toggle", "mobile-camera-flip", "flash-btn"].forEach(
      function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.disabled = false;
        el.classList.remove("disabled", "inactive");
        el.style.pointerEvents = "auto";
        el.style.zIndex = "";
      }
    );
    var row = document.querySelector(".mobile-action-row");
    if (row) {
      row.style.pointerEvents = "auto";
      row.style.zIndex = "";
      row.style.position = "relative";
      row.style.removeProperty("display");
      row.style.removeProperty("visibility");
      row.style.removeProperty("opacity");
    }
    
    if (!capturing) {
      [
        "booth-code-chip",
        "filter-scroll",
        "maximized-filter-scroll",
        "zoom-controls",
        "bottom-controls",
      ].forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.classList.remove("disabled", "inactive");
        el.style.removeProperty("pointer-events");
        el.style.pointerEvents = "auto";
        el.style.removeProperty("touch-action");
        el.style.removeProperty("opacity");
        el.style.removeProperty("visibility");
        try {
          el.querySelectorAll("*").forEach(function (child) {
            child.style.removeProperty("pointer-events");
          });
        } catch (_) {}
      });
      try {
        document
          .querySelectorAll(".filters-container, .filter, .zoom-btn")
          .forEach(function (el) {
            el.classList.remove("disabled", "inactive");
            el.style.removeProperty("pointer-events");
          });
      } catch (_) {}
    } else {
      var chip = document.getElementById("booth-code-chip");
      if (chip) {
        chip.style.removeProperty("pointer-events");
        chip.style.pointerEvents = "auto";
      }
    }
    ["lensbooth-global-loader", "status-overlay", "in-app-banner"].forEach(
      function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.style.pointerEvents = "none";
        el.classList.remove("visible");
      }
    );
    if (!capturing && typeof window.__lbMarkCameraReady === "function") {
      try {
        window.__lbMarkCameraReady();
      } catch (_) {}
    }
    if (typeof window.hideLoader === "function") {
      try {
        window.hideLoader();
      } catch (_) {}
    }
  }
  window.__lbIosForceUnlock = forceUnlock;

  function showPermissionOverlay(message) {
    var overlay = document.getElementById("permission-overlay");
    if (overlay) {
      overlay.style.cssText = "";
      overlay.classList.remove("hidden");
    }
    var msg = document.getElementById("permission-msg");
    if (msg && message) msg.innerHTML = message;
    var btn = document.getElementById("grant-btn");
    if (btn) btn.innerText = "Enable Camera";
    document.body.classList.remove("lb-camera-ready");
  }

  function handleError(err) {
    var name = (err && err.name) || "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      try {
        localStorage.removeItem("cameraEnabled_" + getBoothKey());
      } catch (_) {}
      showPermissionOverlay(
        "Camera blocked. Safari → aA → Website Settings → Camera → Allow, then reload."
      );
      return;
    }
    if (
      name === "OverconstrainedError" ||
      name === "ConstraintNotSatisfiedError" ||
      name === "NotFoundError"
    ) {
      navigator.mediaDevices
        .getUserMedia({
          video: true,
          audio:
            getBoothKey() !== "solo"
              ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
              : false,
        })
        .then(onStreamSuccess)
        .catch(function () {
          showPermissionOverlay(
            "Couldn't start camera. Tap Enable Camera again."
          );
        });
      return;
    }
    showPermissionOverlay("Couldn't start camera. Tap Enable Camera again.");
  }

  var buttonsWired = false;
  var coordinateHandlerAttached = false;
  var lastActionAt = 0;

  function doFlash() {
    if (typeof window.__lbTriggerFlash === "function")
      window.__lbTriggerFlash();
    else if (typeof window.__lbDoFlash === "function") window.__lbDoFlash();
  }
  function doFlip() {
    if (typeof window.__lbTriggerFlip === "function") window.__lbTriggerFlip();
    else if (typeof window.__lbDoFlip === "function") window.__lbDoFlip();
  }
  function doCapture() {
    if (typeof window.__lbTriggerCapture === "function")
      window.__lbTriggerCapture();
    else if (typeof window.__lbDoCapture === "function")
      window.__lbDoCapture();
  }

  function runAction(name, fn) {
    var now = Date.now();
    if (now - lastActionAt < 300) return;
    lastActionAt = now;
    if (document.body.classList.contains("lb-camera-ready")) {
      forceUnlock();
    }
    try {
      fn();
    } catch (_) {}
  }

  function wireActionButtons() {
    if (buttonsWired) return;
    buttonsWired = true;

    function bind(el, name, trigger) {
      if (!el || el.__lbIosBound) return;
      el.__lbIosBound = true;
      el.addEventListener(
        "touchend",
        function (e) {
          if (
            !document.body.classList.contains("lb-camera-ready") &&
            name === "grant"
          )
            forceUnlock();
          
          var touch =
            (e.changedTouches && e.changedTouches[0]) ||
            (e.touches && e.touches[0]);
          if (
            touch &&
            typeof isFilterPoint === "function" &&
            isFilterPoint(touch.clientX, touch.clientY)
          ) {
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          runAction(name, trigger);
        },
        { capture: true, passive: false }
      );
      el.addEventListener(
        "click",
        function (e) {
          e.preventDefault();
          e.stopPropagation();
          runAction(name, trigger);
        },
        true
      );
    }

    bind(document.getElementById("mobile-flash-toggle"), "flash", doFlash);
    bind(document.getElementById("flash-btn"), "flash2", doFlash);
    bind(document.getElementById("mobile-camera-flip"), "flip", doFlip);

    var captureWrap = document.getElementById("capture-btn");
    var captureBtn =
      (captureWrap && captureWrap.querySelector(".capture-btn, .btn-main")) ||
      document.querySelector(".capture-btn");
    bind(captureWrap, "capture", doCapture);
    if (captureBtn && captureBtn !== captureWrap) {
      bind(captureBtn, "capture-btn", doCapture);
    }
  }

  function pointInRect(x, y, rect, padX, padY) {
    padX = padX || 0;
    padY = padY === undefined ? padX : padY;
    return (
      x >= rect.left - padX &&
      x <= rect.right + padX &&
      y >= rect.top - padY &&
      y <= rect.bottom + padY
    );
  }

  var FILTER_HIT_SEL = [
    ".filter",
    ".filters",
    ".filters-container",
    "#maximized-filters",
    ".filter-rail-wrap",
    ".filter-circle",
    ".filter-label",
  ].join(", ");

  function isFilterPoint(x, y) {
    try {
      var el = document.elementFromPoint(x, y);
      return !!(el && el.closest && el.closest(FILTER_HIT_SEL));
    } catch (_) {
      return false;
    }
  }

  var _actionRectCache = null;
  var _actionRectTime = 0;
  function invalidateActionRects() { _actionRectCache = null; }
  window.addEventListener("resize", invalidateActionRects, { passive: true });
  window.addEventListener("orientationchange", invalidateActionRects, { passive: true });

  function resolveActionHit(x, y) {
    var now = performance.now();
    var addPhotosEl =
      document.querySelector("#desktop-add-photos") ||
      document.querySelector("#frame-add-photos") ||
      document.querySelector(".desktop-add-photos-btn") ||
      document.querySelector("#custom-generate-btn") ||
      document.querySelector("#custom-frame-generate-btn");
    var flashEl =
      document.querySelector("#mobile-flash-toggle") ||
      document.querySelector("#flash-btn");
    var flipEl = document.querySelector("#mobile-camera-flip");
    var captureEl =
      document.querySelector("#capture-btn") ||
      document.querySelector(".capture-btn");
    var row = document.querySelector(".mobile-action-row");

    if (!_actionRectCache || now - _actionRectTime > 1500) {
      _actionRectTime = now;
      _actionRectCache = {
        ar: addPhotosEl ? addPhotosEl.getBoundingClientRect() : null,
        fr: flashEl ? flashEl.getBoundingClientRect() : null,
        lr: flipEl ? flipEl.getBoundingClientRect() : null,
        cr: captureEl ? captureEl.getBoundingClientRect() : null,
        rowRect: row ? row.getBoundingClientRect() : null
      };
    }

    var ar = _actionRectCache.ar;
    if (ar) {
      if (ar.width > 0 && ar.height > 0 && pointInRect(x, y, ar, 8, 8)) {
        return {
          flashHit: false,
          flipHit: false,
          captureHit: false,
          path: "add-photos-guard",
          fr: null,
          lr: null,
          cr: null,
          rowRect: null,
          padY: 0,
        };
      }
    }

    var flashHit = false;
    var flipHit = false;
    var captureHit = false;
    var path = "none";
    var fr = _actionRectCache.fr;
    var lr = _actionRectCache.lr;
    var cr = _actionRectCache.cr;
    var rowRect = _actionRectCache.rowRect;

    
    if (isFilterPoint(x, y)) {
      return {
        flashHit: false,
        flipHit: false,
        captureHit: false,
        path: "filter-guard",
        fr: fr,
        lr: lr,
        cr: cr,
        rowRect: rowRect,
        padY: 0,
      };
    }

    
    if (fr && fr.width > 0 && fr.height > 0 && pointInRect(x, y, fr, 8, 0))
      flashHit = true;
    if (lr && lr.width > 0 && lr.height > 0 && pointInRect(x, y, lr, 8, 0))
      flipHit = true;
    if (cr && cr.width > 0 && cr.height > 0 && pointInRect(x, y, cr, 8, 0))
      captureHit = true;

    
    if (captureHit) {
      flashHit = false;
      flipHit = false;
    } else if (flashHit && flipHit) {
      flashHit = false;
      flipHit = false;
    }

    if (flashHit || flipHit || captureHit) {
      path = "exact-btn";
      return {
        flashHit: flashHit,
        flipHit: flipHit,
        captureHit: captureHit,
        path: path,
        fr: fr,
        lr: lr,
        cr: cr,
        rowRect: rowRect,
        padY: 0,
      };
    }

    
    var padY = 0;
    if (rowRect) {
      if (
        rowRect.width > 0 &&
        rowRect.height > 0 &&
        x >= rowRect.left &&
        x <= rowRect.right &&
        y >= rowRect.top - padY &&
        y <= rowRect.bottom + padY
      ) {
        var rel = (x - rowRect.left) / rowRect.width;
        if (rel < 1 / 3) {
          if (!document.body.classList.contains("shared-layout")) {
            flashHit = true;
          }
        }
        else if (rel < 2 / 3) captureHit = true;
        else flipHit = true;
        if (flashHit || flipHit || captureHit) path = "row-thirds";
      }
    }

    return {
      flashHit: flashHit,
      flipHit: flipHit,
      captureHit: captureHit,
      path: path,
      fr: fr,
      lr: lr,
      cr: cr,
      rowRect: rowRect,
      padY: padY,
    };
  }

  function setupCoordinateHandler() {
    if (coordinateHandlerAttached) return;
    coordinateHandlerAttached = true;


    function isPreviewUi() {
      if (document.body.classList.contains("preview-visible")) return true;
      var ps = document.getElementById("preview-screen");
      var ic = document.getElementById("ic-output-screen");
      return !!(ps && ps.classList.contains("visible")) || !!(ic && ic.classList.contains("visible"));
    }

    function handleTap(e) {
      if (isPreviewUi()) return;
      var t0 = e.target;
      var targetIsFilter = !!(
        t0 &&
        t0.closest &&
        t0.closest(FILTER_HIT_SEL)
      );
      if (t0 && t0.closest) {
        
        if (
          t0.closest(
            [
              "#preview-screen",
              "#share-btn",
              "#retake-btn",
              "#save-btn",
              "#preview-back-btn",
              ".preview-back-btn",
              ".btn-action.share",
              ".btn-action.retake",
              ".btn-action.save",
              ".filter",
              ".filters",
              ".filters-container",
              "#maximized-filters",
              ".filter-rail-wrap",
              ".filter-circle",
              ".filter-label",
              ".strip-collapse-wrap",
              "#preview-img",
              ".machine-stack",
              ".layout",
              ".layout-row",
              "#output-style-scroll",
              ".style-rail-wrap",
              "#zoom-controls",
              ".zoom-btn",
              ".mode-btn",
              ".exit-btn",
              "#expand-btn",
              ".expand-btn",
              "#booth-code-chip",
              ".booth-code-chip",
              ".live-indicator",
              ".permission-overlay",
              "#grant-btn",
              ".retake-conflict-overlay",
              ".retake-conflict-modal",
              ".retake-conflict-btn",
              "#_lb_retake_conflict",
              "#_rc_save_retake_btn",
              "#_rc_retake_now_btn",
              "#_rw_ok_btn",
              "#_rw_stay_btn",
              ".share-modal-overlay",
              "#desktop-add-photos",
              "#frame-add-photos",
              ".desktop-add-photos-btn",
              "#native-photo-upload",
              "#frame-photo-upload",
              "#custom-generate-btn",
              "#custom-frame-generate-btn",
              "#mobile-mic-toggle",
            ].join(", ")
          )
        ) {
          return;
        }
      }

      if (!document.body.classList.contains("lb-camera-ready")) return;

      var t = e.target;
      while (t && t !== document.body) {
        if (t.__lbIosBound) {
          return;
        }
        t = t.parentElement;
      }

      var x, y;
      if (e.touches && e.touches.length > 0) {
        x = e.touches[0].clientX;
        y = e.touches[0].clientY;
      } else if (e.changedTouches && e.changedTouches.length > 0) {
        x = e.changedTouches[0].clientX;
        y = e.changedTouches[0].clientY;
      } else {
        x = e.clientX;
        y = e.clientY;
      }

      var hit = resolveActionHit(x, y);
      var action = hit.flipHit
        ? "flip"
        : hit.flashHit
          ? "flash"
          : hit.captureHit
            ? "capture"
            : "none";


      if (hit.flashHit) {
        e.preventDefault();
        e.stopPropagation();
        runAction("row-flash", doFlash);
        return;
      }
      if (hit.flipHit) {
        e.preventDefault();
        e.stopPropagation();
        runAction("row-flip", doFlip);
        return;
      }
      if (hit.captureHit) {
        e.preventDefault();
        e.stopPropagation();
        runAction("row-capture", doCapture);
      }
    }

    document.addEventListener("touchstart", handleTap, {
      capture: true,
      passive: false,
    });
    document.addEventListener("pointerdown", handleTap, true);
  }

  var previewWired = false;

  
  function doShareFromGesture() {
    if (typeof window.__lbDoShare === "function") {
      try {
        window.__lbDoShare();
        return;
      } catch (_) {}
    }
    legacyGestureExport("share");
  }

  function doRetakeFromGesture() {
    try {
      window._lbPostDlShown = false;
    } catch (_) {}

    var ran = false;
    var waitingPeer = !!window._waitingPeerIcSave;
    if (typeof window.__lbDoRetake === "function") {
      try {
        window.__lbDoRetake();
        ran = true;
      } catch (_) {}
    }
    if (!ran && typeof window._lensboothRetake === "function") {
      try {
        window._lensboothRetake();
        ran = true;
      } catch (_) {}
    }
    if (!ran) {
      var booth = null;
      try {
        booth = new URLSearchParams(location.search).get("booth");
      } catch (_) {}
      if (
        booth &&
        window.sharedModule &&
        typeof window.sharedModule.triggerRetake === "function"
      ) {
        try {
          window._isInitiatingRetake = true;
          window.sharedModule.triggerRetake();
        } catch (_) {}
      }
    }
    
    if (window._waitingPeerIcSave || waitingPeer) {
      return;
    }
    
    try {
      if (typeof window.__lbClearPhotoArrays === "function") {
        
        if (!ran) window.__lbClearPhotoArrays("ios-retake");
      } else {
        window._renderSessionId = (window._renderSessionId || 0) + 1;
        window._icPhotosReady = false;
        window._icCapturePhotos = [];
        window._latestStripDataUrl = null;
        window._latestStripBlob = null;
        window._lbStripSlots = [];
        window._lbPostDlShown = false;
        try {
          sessionStorage.removeItem("lb_pending_strip");
        } catch (_) {}
      }
      var M = document.getElementById("preview-screen");
      var P = document.getElementById("preview-img");
      document.body.classList.remove(
        "preview-visible",
        "ic-output-open",
        "is-capturing",
        "is-loading"
      );
      if (M) {
        M.classList.remove("visible");
        M.removeAttribute("style");
        M.style.setProperty("pointer-events", "none", "important");
        try {
          M.querySelectorAll(
            ".machine-stack, .strip-collapse-wrap, .mask-viewport, #preview-img, .lb-strip-style-hit, .output-container, .output-left, .output-right"
          ).forEach(function (el) {
            el.style.removeProperty("visibility");
            el.style.removeProperty("pointer-events");
            el.style.removeProperty("opacity");
          });
        } catch (_) {}
      }
      if (P) {
        P.classList.remove("active");
        try {
          P.removeAttribute("src");
          P.src =
            "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
        } catch (_) {}
      }
      var sp = document.getElementById("strip-preview");
      if (sp) sp.textContent = "";
      var sm = document.getElementById("strip-preview-mobile");
      if (sm) {
        sm.textContent = "";
        sm.style.display = "none";
      }
      var video = document.getElementById("main-video");
      if (video) {
        try {
          video.muted = true;
          video.playsInline = true;
          if (video.paused) {
            var pp = video.play();
            if (pp && pp.catch) pp.catch(function () {});
          }
        } catch (_) {}
      }
      forceUnlock();
      
      try {
        var __retakeCamRestarted = false;
        function __lbIosRetakeRestartCam() {
          if (__retakeCamRestarted) return;
          if (typeof window.__lbStartCamera !== "function") return;
          __retakeCamRestarted = true;
          try {
            window.__lbUnlockCamera && window.__lbUnlockCamera();
          } catch (_) {}
          try {
            Promise.resolve(window.__lbStartCamera()).catch(function () {});
          } catch (_) {}
        }
        __lbIosRetakeRestartCam();
        
      } catch (_) {}
    } catch (_) {}
  }


  
  function dataUrlToBlob(dataUrl) {
    if (window.LBExport) return window.LBExport.dataUrlToBlob(dataUrl);
    try {
      var parts = dataUrl.split(",");
      var mime = (parts[0].match(/:(.*?);/) || [])[1] || "image/png";
      var bin = atob(parts[1]);
      var len = bin.length;
      var arr = new Uint8Array(len);
      while (len--) arr[len] = bin.charCodeAt(len);
      return new Blob([arr], { type: mime });
    } catch (e) {
      return null;
    }
  }

  
  function stripSrcJunk(s) {
    if (window.LBExport) return window.LBExport.isPlaceholderImage(s, 1024);
    return (
      !s || typeof s !== "string" || s.indexOf("data:") !== 0 || s.length < 1024
    );
  }

  function getStripDisplaySrc() {
    if (typeof window.__lbStripSaveSrc === "function") {
      try {
        var fromCam = window.__lbStripSaveSrc();
        if (fromCam && !stripSrcJunk(fromCam)) return fromCam;
      } catch (_) {}
    }
    var img =
      document.getElementById("preview-img") ||
      document.querySelector("#preview-screen img");
    var a = img && img.src ? String(img.src) : "";
    var b =
      (window._latestStripDataUrl && String(window._latestStripDataUrl)) || "";
    if (!stripSrcJunk(a)) return a;
    if (!stripSrcJunk(b)) return b;
    try {
      var p = sessionStorage.getItem("lb_pending_strip");
      if (!stripSrcJunk(p)) return p;
    } catch (_) {}
    return "";
  }

  
  function getStripBlobForSaveSync() {
    var src = getStripDisplaySrc();
    if (src && src.indexOf("blob:") !== 0) {
      var fromData = dataUrlToBlob(src);
      if (fromData) return fromData;
    }
    var img =
      document.getElementById("preview-img") ||
      document.querySelector("#preview-screen img");
    if (img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
      if (stripSrcJunk(img.src || "")) return null;
      try {
        var canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        var jpegDataUrl = canvas.toDataURL("image/jpeg", 0.92);
        return dataUrlToBlob(jpegDataUrl);
      } catch (_) {}
    }
    return null;
  }

  

  function finishHoldUpSaveAfterGesture() {
    try {
      if (typeof window.__lbHideRetakeConflict === "function") {
        window.__lbHideRetakeConflict();
      } else {
        var ov = document.getElementById("_lb_retake_conflict");
        if (ov) ov.classList.remove("visible");
        window._retakeConflictVisible = false;
      }
    } catch (_) {}
    if (typeof window.__lbHoldUpAfterSave === "function") {
      try {
        window.__lbHoldUpAfterSave();
        return;
      } catch (_) {}
    }
    finishSaveAndRetakeAfterGestureLegacy();
  }

  function finishSaveAndRetakeAfterGestureLegacy() {
    try {
      var ov = document.getElementById("_lb_retake_conflict");
      if (ov) ov.classList.remove("visible");
      window._retakeConflictVisible = false;
    } catch (_) {}
    try {
      if (
        window.sharedModule &&
        typeof window.sharedModule.emitRetakePeerReady === "function"
      ) {
        window.sharedModule.emitRetakePeerReady();
      }
    } catch (_) {}
    if (typeof window.__lbDoRetake === "function") {
      try {
        window.__lbDoRetake();
        return;
      } catch (_) {}
    }
    setTimeout(function () {
      if (typeof window._lensboothRetake === "function") {
        try {
          window._lensboothRetake();
          return;
        } catch (_) {}
      }
      doRetakeFromGesture();
    }, 400);
  }

  function doHoldUpSaveFromGesture() {
    if (window._lbHoldUpSaveLock && Date.now() - window._lbHoldUpSaveLock < 2500) {
      return;
    }
    window._lbHoldUpSaveLock = Date.now();
    var icOut = document.getElementById("ic-output-screen");
    var onIc =
      icOut &&
      icOut.classList.contains("visible") &&
      !window._icRetakeWasCustomizing;
    if (onIc || window._icRetakeWasCustomizing) {
      doIcSaveFromGesture();
      finishHoldUpSaveAfterGesture();
      return;
    }
    var p = doSaveFromGesture();
    var afterSave = function () {
      try {
        var payload = typeof window.__lbGetStripPayload === "function" ? window.__lbGetStripPayload() : null;
        if (payload && payload.dataUrl && window.LBGuestStorage) {
          var style = typeof localStorage !== "undefined" ? localStorage.getItem("lb_selected_style") || "classic" : "classic";
          window.LBGuestStorage.saveGuestStrip({
            image: payload.dataUrl,
            style: style,
            mode: "strip",
            
            explicit: true,
          }).then(function () {
            if (window.LBAuthSync && typeof window.LBAuthSync.syncPending === "function") {
              window.LBAuthSync.syncPending();
            }
          });
        }
      } catch (_e) {}
      setTimeout(function () {
        finishHoldUpSaveAfterGesture();
      }, 1000);
    };
    if (p && p.then) {
      p.then(afterSave).catch(afterSave);
    } else {
      afterSave();
    }
  }


  
  function doSaveFromGesture() {
    if (typeof window.__lbDoSave === "function") {
      try {
        return window.__lbDoSave();
      } catch (_) {}
    }
    return legacyGestureExport("save");
  }

  
  function legacyGestureExport(mode) {
    var payload = null;
    if (typeof window.__lbGetStripPayload === "function") {
      try {
        payload = window.__lbGetStripPayload();
      } catch (_) {}
    }
    if (!payload) {
      var src = getStripDisplaySrc();
      var isData = !!src && src.indexOf("data:") === 0;
      var blob =
        window._latestStripBlob instanceof Blob ? window._latestStripBlob : null;
      if (!blob) blob = getStripBlobForSaveSync();
      if (!blob && !isData) return null;
      payload = {
        blob: blob,
        dataUrl: isData ? src : null,
        filename: "constbooth-strip-" + Date.now() + ".jpg",
        title: "My ConstBooth Strip!",
        text: "Check out my photobooth strip from ConstBooth!",
        label: "photo strip",
      };
    }
    if (!window.LBExport) return null;
    return mode === "share"
      ? window.LBExport.share(payload)
      : window.LBExport.save(payload);
  }

  function doIcSaveFromGesture() {
    if (typeof window.__lbIcSave === "function") {
      try {
        window.__lbIcSave();
        return;
      } catch (_) {}
    }
    var btn = document.getElementById("ic-download-btn");
    if (btn) btn.click();
  }

  function doIcShareFromGesture() {
    if (typeof window.__lbIcShare === "function") {
      try {
        window.__lbIcShare();
        return;
      } catch (_) {}
    }
    var btn = document.getElementById("ic-share-btn");
    if (btn) btn.click();
  }

  var stripStyleWired = false;

  function wireStripStyleTap() {
    
    return;

    

    function previewOpen() {
      if (document.body.classList.contains("preview-visible")) return true;
      var ps = document.getElementById("preview-screen");
      return !!(ps && ps.classList.contains("visible"));
    }

    function pointInActions(x, y) {
      try {
        var a = document.querySelector(".preview-screen .actions");
        if (!a) return false;
        var r = a.getBoundingClientRect();
        return (
          r.width > 0 &&
          x >= r.left &&
          x <= r.right &&
          y >= r.top &&
          y <= r.bottom
        );
      } catch (_) {
        return false;
      }
    }

    function modalOpen() {
      try {
        if (window._lbHoldUpActive) return true;
        var rc = document.getElementById("_lb_retake_conflict");
        if (rc && rc.classList.contains("visible")) return true;
        if (document.querySelector(".retake-conflict-overlay.visible"))
          return true;
        if (document.querySelector(".share-modal-overlay.visible")) return true;
        if (document.querySelector(".leave-modal-overlay.visible")) return true;
      } catch (_) {}
      return false;
    }

    function stripRectHit(x, y) {
      
      var el = document.getElementById("lb-strip-style-hit");
      if (!el) return null;
      try {
        var b = el.getBoundingClientRect();
        var pad = 4;
        if (
          b.width >= 4 &&
          b.height >= 4 &&
          x >= b.left - pad &&
          x <= b.right + pad &&
          y >= b.top - pad &&
          y <= b.bottom + pad
        ) return { el: el, rect: b, id: "lb-strip-style-hit" };
      } catch (_) {}
      return null;
    }

    function cycleStrip() {
      var fail = null;
      function viaLayoutChips() {
        try {
          var row =
            document.getElementById("output-style-scroll") ||
            document.querySelector(".layout-row");
          var layouts = Array.prototype.slice.call(
            (row
              ? row.querySelectorAll(".layout")
              : document.querySelectorAll(".layout[data-style]")) || []
          );
          if (!layouts.length) return false;
          var idx = 0;
          for (var i = 0; i < layouts.length; i++) {
            if (layouts[i].classList.contains("active")) {
              idx = i;
              break;
            }
          }
          var next = layouts[(idx + 1) % layouts.length];
          if (!next) return false;
          next.click();
          return true;
        } catch (_) {
          return false;
        }
      }
      if (typeof window.__lbCycleStripStyle === "function") {
        window.__lbStripClickGuard = Date.now();
        try {
          window.__lbCycleStripStyle();
        } catch (err) {
          fail = "throw:" + ((err && err.message) || String(err)).slice(0, 80);
        }
      } else if (viaLayoutChips()) {
        window.__lbStripClickGuard = Date.now();
        fail = null;
      } else {
        fail = "no-cycle-fn";
      }
      return !fail;
    }

    
    var iosLastTapTime = 0;
    var iosLastTouchEnd = 0; 

    function tryStripTap(x, y, dx, dy, src) {
      var po = previewOpen();
      var mo = modalOpen();
      var inAct = pointInActions(x, y);
      var hit = stripRectHit(x, y);
      var guardAge = window.__lbStripClickGuard
        ? Date.now() - window.__lbStripClickGuard
        : null;
      var reason = "ok";
      if (!po || mo) reason = !po ? "no-preview" : "modal-open";
      else if (dx >= 20 || dy >= 20) reason = "move-threshold";
      else if (inAct) reason = "in-actions";
      else if (!hit) reason = "no-strip-rect";
      else if (guardAge != null && guardAge < 450) reason = "click-guard";
      if (reason !== "ok") return false;
      
      iosLastTouchEnd = Date.now();
      
      var now = iosLastTouchEnd;
      if (now - iosLastTapTime > 350) {
        iosLastTapTime = now;
        return false; 
      }
      iosLastTapTime = 0; 
      var ok = cycleStrip();
      return ok;
    }

    function bindPassive(el) {
      if (!el || el.__lbIosStripDirect) return;
      el.__lbIosStripDirect = true;
      var sx = 0;
      var sy = 0;
      el.addEventListener(
        "touchstart",
        function (e) {
          if (!e.touches || !e.touches[0]) return;
          sx = e.touches[0].clientX;
          sy = e.touches[0].clientY;
        },
        { passive: true }
      );
      el.addEventListener(
        "touchend",
        function (e) {
          var t = e.changedTouches && e.changedTouches[0];
          if (!t) return;
          tryStripTap(
            t.clientX,
            t.clientY,
            Math.abs(t.clientX - sx),
            Math.abs(t.clientY - sy),
            "el:" + (el.id || el.className || "?")
          );
        },
        { passive: true }
      );
      
      el.addEventListener(
        "click",
        function (e) {
          
          if (Date.now() - iosLastTouchEnd < 600) return;
          if (!previewOpen() || modalOpen()) return;
          if (
            window.__lbStripClickGuard &&
            Date.now() - window.__lbStripClickGuard < 500
          )
            return;
          if (pointInActions(e.clientX, e.clientY)) return;
          if (!stripRectHit(e.clientX, e.clientY)) return;
          
          var now = Date.now();
          if (now - iosLastTapTime > 350) {
            iosLastTapTime = now;
            return;
          }
          iosLastTapTime = 0;
          cycleStrip();
        },
        false
      );
    }

    function bindAllStripTargets() {
      
      bindPassive(document.getElementById("lb-strip-style-hit"));
    }

    bindAllStripTargets();
    [200, 800, 2000, 4000].forEach(function (ms) {
      setTimeout(bindAllStripTargets, ms);
    });

    
    if (!window.__lbIosStripDocBound) {
      window.__lbIosStripDocBound = true;
      var docSx = 0;
      var docSy = 0;
      document.addEventListener(
        "touchstart",
        function (e) {
          if (!previewOpen()) return;
          if (!e.touches || !e.touches[0]) return;
          docSx = e.touches[0].clientX;
          docSy = e.touches[0].clientY;
        },
        { capture: true, passive: true }
      );
      document.addEventListener(
        "touchend",
        function (e) {
          var t = e.changedTouches && e.changedTouches[0];
          if (!t) return;
          
          var tgt = e.target;
          if (!tgt || !tgt.closest || !tgt.closest("#lb-strip-style-hit")) return;
          tryStripTap(
            t.clientX,
            t.clientY,
            Math.abs(t.clientX - docSx),
            Math.abs(t.clientY - docSy),
            "doc"
          );
        },
        { capture: true, passive: true }
      );
    }
  }

  function wirePreviewButtons() {
    function bindPreview(el, name) {
      if (!el || el.__lbIosPreviewBound) return false;
      el.__lbIosPreviewBound = true;
      el.addEventListener(
        "touchend",
        function (e) {
          if (
            !document.body.classList.contains("preview-visible") &&
            !(
              document.getElementById("preview-screen") &&
              document
                .getElementById("preview-screen")
                .classList.contains("visible")
            )
          )
            return;
          e.preventDefault();
          e.stopPropagation();
          try {
            if (name === "retake" || name === "back") doRetakeFromGesture();
            else if (name === "share") doShareFromGesture();
            else if (name === "save") doSaveFromGesture();
            else el.click();
          } catch (_) {}
        },
        { capture: true, passive: false }
      );
      return true;
    }

    var a = bindPreview(document.getElementById("retake-btn"), "retake");
    var b = bindPreview(document.getElementById("share-btn"), "share");
    var c = bindPreview(document.getElementById("save-btn"), "save");
    var d = bindPreview(document.getElementById("preview-back-btn"), "back");
    
    
    bindPreview(
      document.querySelector("#save-btn > .btn-action, #save-btn .btn-action"),
      "save"
    );
    bindPreview(
      document.querySelector(
        "#share-btn > .btn-action, #share-btn .btn-action"
      ),
      "share"
    );
    bindPreview(
      document.querySelector(
        "#retake-btn > .btn-action, #retake-btn .btn-action"
      ),
      "retake"
    );
    
    function bindIc(el, name) {
      if (!el || el.__lbIosIcBound) return;
      el.__lbIosIcBound = true;
      el.addEventListener(
        "touchend",
        function (e) {
          var scr = document.getElementById("ic-output-screen");
          if (!(scr && scr.classList.contains("visible"))) return;
          e.preventDefault();
          e.stopPropagation();
          if (name === "ic-save") doIcSaveFromGesture();
          else if (name === "ic-share") doIcShareFromGesture();
        },
        { capture: true, passive: false }
      );
      el.addEventListener(
        "click",
        function (e) {
          var scr = document.getElementById("ic-output-screen");
          if (!(scr && scr.classList.contains("visible"))) return;
          if (name === "ic-save") doIcSaveFromGesture();
          else if (name === "ic-share") doIcShareFromGesture();
        },
        true
      );
    }
    bindIc(document.getElementById("ic-download-btn"), "ic-save");
    bindIc(document.getElementById("ic-share-btn"), "ic-share");
    previewWired = !!(a || b || c || d);
    wireStripStyleTap();
    wireBoothCodeChip();
    wireHoldUpModalButtons();
  }

  
  function wireBoothCodeChip() {
    var chip = document.getElementById("booth-code-chip");
    if (!chip || chip.__lbIosCodeBound) return;
    chip.__lbIosCodeBound = true;

    function doCopy(e) {
      if (e) {
        try {
          e.preventDefault();
          e.stopPropagation();
        } catch (_) {}
      }
      var n = null;
      try {
        n = new URLSearchParams(window.location.search).get("booth");
      } catch (_) {}
      if (!n) return;
      var o = chip.querySelector(".chip-code");
      var done = function () {
        chip.classList.add("copied");
        if (typeof window.showLocalToast === "function") {
          try {
            window.showLocalToast("Booth code copied!");
          } catch (_) {}
        }
        if (o) {
          var prev = o.textContent;
          o.textContent = "Copied!";
          setTimeout(function () {
            o.textContent = prev;
            chip.classList.remove("copied");
          }, 2000);
        } else {
          setTimeout(function () {
            chip.classList.remove("copied");
          }, 2000);
        }
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(n).then(done).catch(function () {
          try {
            var ta = document.createElement("textarea");
            ta.value = n;
            ta.setAttribute("readonly", "");
            ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            done();
          } catch (_) {}
        });
      } else {
        try {
          var ta2 = document.createElement("textarea");
          ta2.value = n;
          ta2.setAttribute("readonly", "");
          ta2.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
          document.body.appendChild(ta2);
          ta2.select();
          document.execCommand("copy");
          document.body.removeChild(ta2);
          done();
        } catch (_) {}
      }
    }

    chip.addEventListener("touchend", doCopy, { capture: true, passive: false });
    chip.addEventListener("click", doCopy, true);
  }

  
  function wireHoldUpModalButtons() {
    if (window.__lbIosHoldUpWired) return;
    window.__lbIosHoldUpWired = true;

    function ensureRetakeConflictModalTappable() {
      try {
        document
          .querySelectorAll(
            ".retake-conflict-overlay.visible, #_lb_retake_conflict.visible"
          )
          .forEach(function (ov) {
            ov.style.setProperty("pointer-events", "auto", "important");
            ov.style.setProperty("z-index", "2147483000", "important");
            ov.querySelectorAll(
              ".retake-conflict-modal, .retake-conflict-btn"
            ).forEach(function (node) {
              node.style.setProperty("pointer-events", "auto", "important");
              node.style.setProperty("touch-action", "manipulation", "important");
            });
          });
      } catch (_) {}
    }

    function holdUpSaveFromTouch() {
      
      doHoldUpSaveFromGesture();
    }

    function holdUpRetakeFromTouch() {
      if (typeof window.__lbHoldUpModalAction === "function") {
        try {
          window.__lbHoldUpModalAction("retake");
          return;
        } catch (_) {}
      }
      try {
        if (
          window.sharedModule &&
          typeof window.sharedModule.emitRetakePeerReady === "function"
        ) {
          window.sharedModule.emitRetakePeerReady();
        }
      } catch (_) {}
      if (typeof window.__lbHideRetakeConflict === "function") {
        try {
          window.__lbHideRetakeConflict();
        } catch (_) {}
      }
      if (window.LBExport && typeof window.LBExport.closeSheet === "function") {
        try {
          window.LBExport.closeSheet();
        } catch (_) {}
      }
      if (typeof window._lensboothRetake === "function") {
        try {
          window._lensboothRetake();
        } catch (_) {}
      }
    }

    function handleHoldUpModalTouch(e, el, id) {
      var now = Date.now();
      if (el.__lbLastModalTouch && now - el.__lbLastModalTouch < 450) {
        return;
      }
      el.__lbLastModalTouch = now;
      try {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      } catch (_) {}
      var label = (el.textContent || "").trim();
      if (id === "_rw_stay_btn") {
        if (typeof window.__lbRetakeWaitStayHere === "function") {
          window.__lbRetakeWaitStayHere();
        }
        return;
      }
      if (id === "_rw_ok_btn") {
        var wait = document.getElementById("_lb_retake_wait");
        if (wait) wait.classList.remove("visible");
        return;
      }
      if (id === "_rc_save_retake_btn") {
        if (label === "Stay Here") {
          if (typeof window.__lbHoldUpStayHereCustomizer === "function") {
            window.__lbHoldUpStayHereCustomizer();
          }
          return;
        }
        holdUpSaveFromTouch();
        return;
      }
      if (id === "_rc_retake_now_btn") {
        if (label === "Save" || label === "Save and Retake") {
          holdUpSaveFromTouch();
          return;
        }
        holdUpRetakeFromTouch();
      }
    }

    function bindModalBtn(id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (el.__lbIosModalTouchFn) {
        try {
          el.removeEventListener("touchend", el.__lbIosModalTouchFn, true);
        } catch (_) {}
      }
      el.__lbIosModalTouchFn = function (ev) {
        handleHoldUpModalTouch(ev, el, id);
      };
      el.addEventListener("touchend", el.__lbIosModalTouchFn, {
        capture: true,
        passive: false,
      });
      if (el.__lbIosModalClickFn) {
        try {
          el.removeEventListener("click", el.__lbIosModalClickFn, true);
        } catch (_) {}
      }
      el.__lbIosModalClickFn = function (ev) {
        if (el.__lbLastModalTouch && Date.now() - el.__lbLastModalTouch < 500) {
          try {
            ev.preventDefault();
            ev.stopPropagation();
          } catch (_) {}
          return;
        }
        handleHoldUpModalTouch(ev, el, id);
      };
      el.addEventListener("click", el.__lbIosModalClickFn, true);
    }

    function scan() {
      ensureRetakeConflictModalTappable();
      bindModalBtn("_rc_save_retake_btn");
      bindModalBtn("_rc_retake_now_btn");
      bindModalBtn("_rw_ok_btn");
      bindModalBtn("_rw_stay_btn");
    }

    scan();
    [200, 800, 2000, 5000].forEach(function (ms) {
      setTimeout(scan, ms);
    });
    try {
      var mo = new MutationObserver(function () {
        scan();
      });
      mo.observe(document.body, { childList: true, subtree: true });
    } catch (_) {}
  }

  function onStreamSuccess(stream) {
    window.__lbPreGrantedStream = stream;
    try {
      localStorage.setItem("cameraEnabled_" + getBoothKey(), "true");
    } catch (_) {}

    forceUnlock();
    wireActionButtons();
    wirePreviewButtons();
    wireBoothCodeChip();
    wireHoldUpModalButtons();
    setupCoordinateHandler();

    if (typeof window.__lbUnlockCamera === "function") {
      try {
        window.__lbUnlockCamera();
      } catch (_) {}
    }

    var startCamera = window.__lbStartCamera;
    if (typeof startCamera !== "function") {
      showPermissionOverlay("Camera module not ready. Reload and try again.");
      return;
    }

    Promise.resolve(startCamera())
      .then(function () {
        forceUnlock();
        wireActionButtons();
        wirePreviewButtons();
        wireBoothCodeChip();
        wireHoldUpModalButtons();
        setupCoordinateHandler();
      })
      .catch(function () {
        if (typeof showPermissionOverlay === "function") {
          showPermissionOverlay("Camera permission required. Please enable camera to continue.");
        }
      });

    [100, 300, 800, 1500].forEach(function (ms) {
      setTimeout(function () {
        forceUnlock();
        wireActionButtons();
        wirePreviewButtons();
        wireBoothCodeChip();
        wireHoldUpModalButtons();
        setupCoordinateHandler();
      }, ms);
    });
  }

  var grantButtonAttached = false;

  function attachGrantButton() {
    var grant = document.getElementById("grant-btn");
    if (!grant || grantButtonAttached) return;
    grantButtonAttached = true;
    var busy = false;

    function handleGrant(e) {
      if (busy) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
        return;
      e.preventDefault();
      e.stopImmediatePropagation();
      busy = true;
      grant.innerText = "Starting…";

      var gumPromise;
      try {
        
        
        
        
        
        
        var __lbWantsMic = getBoothKey() !== "solo";
        gumPromise = navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: getFacingMode() } },
          audio: __lbWantsMic
            ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
            : false,
        });
      } catch (syncErr) {
        busy = false;
        handleError(syncErr);
        return;
      }

      if (typeof window.__lbUnlockCamera === "function") {
        try {
          window.__lbUnlockCamera();
        } catch (_) {}
      }

      gumPromise
        .then(function (stream) {
          busy = false;
          onStreamSuccess(stream);
        })
        .catch(function (err) {
          busy = false;
          handleError(err);
        });
    }

    grant.addEventListener("touchstart", handleGrant, {
      capture: true,
      passive: false,
    });
    grant.addEventListener("click", handleGrant, true);
  }

  function bootIosStripTap() {
    try {
      wireStripStyleTap();
      wireBoothCodeChip();
      wireHoldUpModalButtons();
    } catch (_) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      attachGrantButton();
      bootIosStripTap();
    });
  } else {
    attachGrantButton();
    bootIosStripTap();
  }
})();
