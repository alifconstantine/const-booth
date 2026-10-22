
(function () {
  "use strict";

  var MQ = window.matchMedia(
    "(max-width: 767px), (min-width: 768px) and (max-width: 1024px) and (orientation: portrait)"
  );

  var GUARD        = 600;   
  var FLICK_VEL    = 0.5;   
  var SNAP_THRESH  = 0.38;  
  var RESIST       = 0.3;   

  var openedAt   = 0;
  var sheetReady = false;

  
  var drag = {
    active:         false,
    startY:         0,
    startOffset:    0,
    lastY:          0,
    lastT:          0,
    velY:           0,       
    moved:          false,
    capturedEl:     null
  };

  function isMobile() { return MQ.matches; }
  function $(id)      { return document.getElementById(id); }
  function panel()    { return $("ic-customize-panel"); }
  function header()   { return panel() ? panel().querySelector(".ic-panel-header") : null; }

  function haptic(type) {
    try {
      if (navigator.vibrate) {
        navigator.vibrate(type === "light" ? 6 : type === "medium" ? 14 : 20);
      }
    } catch (_e) {}
  }

  

  function panelHeight(p) { return p ? p.offsetHeight || 0 : 0; }

  function peekPx(p) {
    if (!p) return 72;
    var raw = getComputedStyle(p).getPropertyValue("--ic-panel-peek").trim();
    var n = parseFloat(raw);
    return isFinite(n) ? n : 72;
  }

  function maxOffset(p) {
    
    return Math.max(0, panelHeight(p) - peekPx(p));
  }

  function currentOffset(p) {
    if (!p) return 0;
    if (p.classList.contains("ic-panel-collapsed") && !p.style.transform) {
      return maxOffset(p);
    }
    var m = /translateY\(([-\d.]+)px\)/.exec(p.style.transform || "");
    return m ? parseFloat(m[1]) : 0;
  }

  

  function setOffset(p, y) {
    if (!p) return;
    p.style.transform = "translateY(" + y + "px)";
  }

  function clearInline(p) {
    if (p) p.style.transform = "";
  }

  

  function setHandleExpanded(expanded) {
    var handle = $("ic-panel-sheet-handle");
    if (handle) handle.setAttribute("aria-expanded", expanded ? "true" : "false");
  }

  function setDraggingClass(p, on) {
    if (!p) return;
    if (on) p.classList.add("ic-panel-dragging");
    else    p.classList.remove("ic-panel-dragging");
  }

  function clearPeek() {
    var p = panel();
    if (p) {
      p.classList.remove("ic-panel-collapsed");
      clearInline(p);
    }
    document.body.classList.remove("ic-panel-peek");
    setHandleExpanded(true);
  }

  function collapse() {
    if (!isMobile()) return;
    var p = panel();
    if (!p || !p.classList.contains("visible")) return;
    clearInline(p);
    p.classList.add("ic-panel-collapsed");
    document.body.classList.add("ic-panel-peek");
    setHandleExpanded(false);
    haptic("light");
  }

  function expand() {
    clearPeek();
    haptic("light");
  }

  

  function activeTab() {
    var p = panel();
    if (!p) return "";
    var tab = p.querySelector(".ic-panel-tab.active");
    return tab ? tab.getAttribute("data-tab") || "" : "";
  }

  function updatePeekHint() {
    var hint = document.querySelector(".ic-panel-peek-hint");
    if (!hint) return;
    var tab = activeTab();
    if      (tab === "draw")     hint.textContent = "Tap for brushes · canvas free";
    else if (tab === "stickers") hint.textContent = "Tap for stickers · canvas free";
    else                          hint.textContent = "Swipe up to open · swipe down to close";
  }

  function peekForDrawOrStickers(tab) {
    if (!isMobile()) return;
    if (tab === "draw" || tab === "stickers") collapse();
    else expand();
  }

  function peekPanel()   { if (!isMobile()) return; collapse(); updatePeekHint(); }
  function expandPanel() { if (!isMobile()) return; expand();   updatePeekHint(); }

  window._icPeekPanel   = peekPanel;
  window._icExpandPanel = expandPanel;

  
  
  function rubberOffset(raw, min, max) {
    if (raw < min) {
      var over = min - raw;
      return min - over * RESIST;
    }
    if (raw > max) {
      var over2 = raw - max;
      return max + over2 * RESIST;
    }
    return raw;
  }

  
  function closePanel() {
    var p = panel();
    if (!p) return;
    clearInline(p);
    setDraggingClass(p, false);
    clearPeek();
    haptic("medium");
    
    if (typeof window._icClosePanel === "function") {
      window._icClosePanel();
    } else {
      
      p.classList.remove("visible");
      var bd = document.getElementById("ic-customize-backdrop");
      if (bd) bd.classList.remove("visible");
      document.body.classList.remove("ic-customizing");
      document.body.style.overflow = "";
    }
  }

  
  function isContentTab() {
    var tab = activeTab();
    return tab === "stickers" || tab === "draw";
  }

  
  function hasContentInteraction() {
    var tab = activeTab();
    if (tab === "stickers") {
      var layer = document.getElementById("ic-sticker-layer");
      return layer && layer.querySelectorAll(".ic-placed-sticker").length > 0;
    }
    if (tab === "draw") {
      var undo = document.getElementById("ic-undo-btn");
      return undo && !undo.disabled;
    }
    return false;
  }

  
  function snapAfterDrag(p) {
    var max = maxOffset(p);
    var cur = currentOffset(p);

    var goingDown;

    if (Math.abs(drag.velY) > FLICK_VEL) {
      goingDown = drag.velY > 0;
    } else {
      goingDown = cur > max * SNAP_THRESH;
    }

    clearInline(p);
    if (goingDown) {
      if (isContentTab()) {
        if (!hasContentInteraction()) {
          
          expand();
        } else if (!p.classList.contains("ic-panel-collapsed")) {
          
          collapse();
        } else {
          
          closePanel();
        }
      } else {
        
        closePanel();
      }
    } else {
      expand();
    }
    updatePeekHint();
  }

  

  function onPointerDown(e) {
    if (!isMobile()) return;
    if (e.button) return;
    
    if (e.target && e.target.closest) {
      if (e.target.closest(".ic-panel-peek-close, button, input, select, textarea, [role='button']")) {
        
        if (!e.target.closest(".ic-panel-handle-hit")) return;
      }
    }
    var p = panel();
    if (!p || !p.classList.contains("visible")) return;

    drag.active      = true;
    drag.moved       = false;
    drag.startY      = e.clientY;
    drag.lastY       = e.clientY;
    drag.lastT       = performance.now();
    drag.velY        = 0;
    drag.startOffset = currentOffset(p);
    drag.capturedEl  = e.currentTarget;

    setDraggingClass(p, true);

    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_e) {}
  }

  function onPointerMove(e) {
    if (!isMobile() || !drag.active) return;
    var p = panel();
    if (!p) return;

    var dy    = e.clientY - drag.startY;
    var now   = performance.now();
    var dt    = now - drag.lastT;

    
    if (dt > 0) {
      var inst = (e.clientY - drag.lastY) / dt;
      drag.velY = drag.velY * 0.7 + inst * 0.3;
    }
    drag.lastY = e.clientY;
    drag.lastT = now;

    if (Math.abs(dy) > 5) drag.moved = true;

    var raw  = drag.startOffset + dy;
    var max  = maxOffset(p);
    var next = rubberOffset(raw, 0, max);

    setOffset(p, next);

    
    if (next > max * 0.25) document.body.classList.add("ic-panel-peek");
    else                   document.body.classList.remove("ic-panel-peek");
  }

  function onPointerUp(e) {
    if (!drag.active) return;
    drag.active = false;

    var p = panel();
    if (!p) { drag.active = false; return; }

    setDraggingClass(p, false);

    if (!isMobile()) { clearInline(p); return; }

    var dy = e && typeof e.clientY === "number" ? e.clientY - drag.startY : 0;

    
    if (!drag.moved || Math.abs(dy) < 8) {
      clearInline(p);
      if (p.classList.contains("ic-panel-collapsed")) {
        
        expand();
      } else if (isContentTab()) {
        if (hasContentInteraction()) {
          
          collapse();
        } else {
          
          expand();
        }
      } else {
        
        closePanel();
      }
      updatePeekHint();
      return;
    }

    snapAfterDrag(p);
  }

  function onPointerCancel() {
    if (!drag.active) return;
    drag.active = false;
    var p = panel();
    if (!p) return;
    setDraggingClass(p, false);
    
    if (isMobile()) snapAfterDrag(p);
    else clearInline(p);
  }

  
  function attachDrag(el) {
    if (!el || el._lbDragBound) return;
    el._lbDragBound = true;
    el.addEventListener("pointerdown",   onPointerDown,   { passive: true });
    el.addEventListener("pointermove",   onPointerMove,   { passive: true });
    el.addEventListener("pointerup",     onPointerUp,     { passive: true });
    el.addEventListener("pointercancel", onPointerCancel, { passive: true });
  }

  
  function setup() {
    if (sheetReady) return;
    var handle = $("ic-panel-sheet-handle");
    if (!handle) return;
    sheetReady = true;

    
    attachDrag(handle);

    
    
    var p = panel();
    if (p) {
      var hdr = p.querySelector(".ic-panel-header");
      if (hdr) attachDrag(hdr);
    }

    
    var card = document.querySelector("#ic-output-screen .ic-card-shadow-wrap");
    if (card) {
      card.addEventListener("click", function () {
        if (!isMobile()) return;
        if (!document.body.classList.contains("ic-customizing")) return;
        if (drag.active) return;
        if (Date.now() - openedAt < GUARD) return;
        var panel2 = panel();
        if (!panel2 || !panel2.classList.contains("visible")) return;
        if (panel2.classList.contains("ic-panel-collapsed")) return;
        collapse();
        updatePeekHint();
      });
    }

    
    var origClose = null;
    function patchClosePanel() {
      if (origClose) return;
      if (typeof window._icClosePanel !== "function") return;
      origClose = window._icClosePanel;
      window._icClosePanel = function () {
        clearPeek();
        origClose();
      };
    }

    
    var btn = $("ic-customize-btn");
    if (btn) {
      btn.addEventListener("click", function () {
        if (!isMobile()) { patchClosePanel(); return; }
        openedAt = Date.now();
        clearPeek();
        patchClosePanel();
        
        setTimeout(function () {
          if (!isMobile()) return;
          peekForDrawOrStickers(activeTab());
          updatePeekHint();
        }, 40);
      });
    }

    
    document.addEventListener("ic-panel-tab", function (ev) {
      if (!isMobile()) return;
      if (!document.body.classList.contains("ic-customizing")) return;
      var tab = (ev.detail && ev.detail.tab) || activeTab();
      var apply = function () {
        if (!isMobile()) return;
        peekForDrawOrStickers(tab);
        updatePeekHint();
      };
      if (typeof window.__lbYieldToPaint === "function") {
        window.__lbYieldToPaint().then(apply);
      } else {
        requestAnimationFrame(function () { setTimeout(apply, 0); });
      }
    });

    
    ["ic-panel-close", "ic-panel-cancel", "ic-panel-save"].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener("click", clearPeek, true);
    });

    
    var peekClose = $("ic-panel-peek-close");
    if (peekClose) {
      peekClose.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        clearPeek();
        if (typeof window._icClosePanel === "function") {
          window._icClosePanel();
        } else {
          var hdrClose = $("ic-panel-close");
          if (hdrClose) hdrClose.click();
        }
      }, true);
      peekClose.addEventListener("pointerdown", function (e) {
        e.stopPropagation();
      }, true);
    }
  }

  
  function onMqChange() {
    if (!isMobile()) {
      clearPeek();
      return;
    }
    setup();
    if (document.body.classList.contains("ic-customizing")) {
      peekForDrawOrStickers(activeTab());
      updatePeekHint();
    }
  }

  
  function boot() {
    setup();
    if (typeof MQ.addEventListener === "function") {
      MQ.addEventListener("change", onMqChange);
    } else if (typeof MQ.addListener === "function") {
      MQ.addListener(onMqChange);
    }
    if (!isMobile()) clearPeek();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
