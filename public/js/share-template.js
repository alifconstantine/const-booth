
(function (global) {
  "use strict";

  var LBShareTemplate = {};

  var FORMATS = {
    "9:16": { width: 1080, height: 1920, label: "9:16 Story", maxStripH: 1400, maxStripW: 680, tilt: -4.5 },
    "4:5":  { width: 1080, height: 1350, label: "4:5 Post",   maxStripH: 960,  maxStripW: 560, tilt: -4.0 },
    "1:1":  { width: 1080, height: 1080, label: "1:1 Square", maxStripH: 760,  maxStripW: 520, tilt: -3.5 }
  };

  
  function createPaperNoise(w, h) {
    var nc = document.createElement("canvas");
    nc.width = Math.min(w, 256);
    nc.height = Math.min(h, 256);
    var nctx = nc.getContext("2d");
    if (!nctx) return null;
    var imgData = nctx.createImageData(nc.width, nc.height);
    var buffer = new Uint32Array(imgData.data.buffer);
    for (var i = 0; i < buffer.length; i++) {
      var n = (Math.random() * 20) | 0;
      buffer[i] = (n << 24) | ((244 + n / 2) << 16) | ((238 + n / 2) << 8) | 232;
    }
    nctx.putImageData(imgData, 0, 0);
    return nc;
  }

  
  function roundedRect(ctx, x, y, width, height, radius) {
    if (typeof radius === "undefined") radius = 0;
    if (typeof radius === "number") {
      radius = { tl: radius, tr: radius, br: radius, bl: radius };
    }
    ctx.beginPath();
    ctx.moveTo(x + radius.tl, y);
    ctx.lineTo(x + width - radius.tr, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
    ctx.lineTo(x + width, y + height - radius.br);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
    ctx.lineTo(x + radius.bl, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
    ctx.lineTo(x, y + radius.tl);
    ctx.quadraticCurveTo(x, y, x + radius.tl, y);
    ctx.closePath();
  }

  
  function loadImage(source) {
    return new Promise(function (resolve, reject) {
      if (!source) return reject(new Error("No image source provided"));
      if (typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement) {
        return resolve(source);
      }
      if (source instanceof HTMLImageElement && source.complete && source.naturalWidth > 0) {
        return resolve(source);
      }
      var img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("Failed to load image")); };

      if (source instanceof Blob) {
        var url = URL.createObjectURL(source);
        img.onload = function () {
          URL.revokeObjectURL(url);
          resolve(img);
        };
        img.src = url;
      } else if (typeof source === "string") {
        img.src = source;
      } else if (source && source.dataUrl) {
        img.src = source.dataUrl;
      } else if (source && source.blob) {
        var burl = URL.createObjectURL(source.blob);
        img.onload = function () {
          URL.revokeObjectURL(burl);
          resolve(img);
        };
        img.src = burl;
      } else {
        reject(new Error("Unsupported source"));
      }
    });
  }

  
  function getInstantCardPayload() {
    if (window._icExportBlob instanceof Blob) {
      return {
        blob: window._icExportBlob,
        dataUrl: window._icExportDataUrl || null,
        type: "frame"
      };
    }
    if (typeof window._icExportDataUrl === "string" && window._icExportDataUrl.startsWith("data:image/")) {
      return {
        dataUrl: window._icExportDataUrl,
        type: "frame"
      };
    }
    var cardCanvas = document.getElementById("ic-card-canvas") || document.getElementById("output-canvas");
    if (cardCanvas && cardCanvas.width > 0 && cardCanvas.height > 0) {
      try {
        return cardCanvas;
      } catch (_) {}
    }
    return null;
  }

  
  LBShareTemplate.renderToCanvas = async function (stripSource, options) {
    options = options || {};
    var formatKey = options.format || "9:16";
    var cfg = FORMATS[formatKey] || FORMATS["9:16"];
    var W = cfg.width;
    var H = cfg.height;

    var canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Could not create 2D canvas context");

    
    ctx.fillStyle = "#FFFDF7";
    ctx.fillRect(0, 0, W, H);

    
    var gridSize = 64;
    ctx.save();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.085)";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (var gx = 0; gx <= W; gx += gridSize) {
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, H);
    }
    for (var gy = 0; gy <= H; gy += gridSize) {
      ctx.moveTo(0, gy);
      ctx.lineTo(W, gy);
    }
    ctx.stroke();
    ctx.restore();

    
    try {
      var noiseCanvas = createPaperNoise(256, 256);
      if (noiseCanvas) {
        var pattern = ctx.createPattern(noiseCanvas, "repeat");
        if (pattern) {
          ctx.save();
          ctx.globalAlpha = 0.25;
          ctx.fillStyle = pattern;
          ctx.fillRect(0, 0, W, H);
          ctx.restore();
        }
      }
    } catch (_) {}

    
    var topBarMarginX = 52;
    var topBarMarginY = 52;
    var topBarW = W - topBarMarginX * 2;
    var topBarH = 72;

    ctx.save();
    roundedRect(ctx, topBarMarginX, topBarMarginY, topBarW, topBarH, 14);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    
    var dotY = topBarMarginY + topBarH / 2;
    var dotStartX = topBarMarginX + 30;
    var dotRadius = 9;
    var dotSpacing = 26;

    var dotColors = ["#FF5F56", "#FFBD2E", "#27C93F"];
    dotColors.forEach(function (color, idx) {
      var dx = dotStartX + idx * dotSpacing;
      ctx.beginPath();
      ctx.arc(dx, dotY, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    
    ctx.save();
    ctx.font = "bold 22px -apple-system, BlinkMacSystemFont, 'Satoshi', 'Segoe UI', Roboto, sans-serif";
    ctx.textBaseline = "middle";

    var lensText = "Lens";
    var boothText = "Booth";
    var lensW = ctx.measureText(lensText).width;
    var boothW = ctx.measureText(boothText).width;
    var totalW = lensW + boothW;

    var startX = (topBarMarginX + topBarW / 2) - (totalW / 2);
    var logoY = topBarMarginY + topBarH / 2 + 1;

    
    ctx.textAlign = "left";
    ctx.fillStyle = "#F12850";
    ctx.fillText(lensText, startX, logoY);

    
    ctx.fillStyle = "#000000";
    ctx.fillText(boothText, startX + lensW, logoY);
    ctx.restore();

    
    var rightCtrlX = topBarMarginX + topBarW - 40;
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";

    
    ctx.beginPath();
    ctx.moveTo(rightCtrlX - 7, dotY - 7);
    ctx.lineTo(rightCtrlX + 7, dotY + 7);
    ctx.moveTo(rightCtrlX + 7, dotY - 7);
    ctx.lineTo(rightCtrlX - 7, dotY + 7);
    ctx.stroke();

    
    ctx.beginPath();
    ctx.moveTo(rightCtrlX - 32, dotY + 6);
    ctx.lineTo(rightCtrlX - 18, dotY + 6);
    ctx.stroke();
    ctx.restore();

    
    var btmBarMarginX = 52;
    var btmBarH = 68;
    var btmBarMarginY = H - btmBarH - 52;
    var btmBarW = W - btmBarMarginX * 2;

    ctx.save();
    roundedRect(ctx, btmBarMarginX, btmBarMarginY, btmBarW, btmBarH, 14);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    
    ctx.fillStyle = "#000000";
    ctx.font = "bold 19px -apple-system, BlinkMacSystemFont, 'Satoshi', 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("♡ little moments, forever memories ♡", btmBarMarginX + btmBarW / 2, btmBarMarginY + btmBarH / 2 + 1);
    ctx.restore();

    
    var stripImg = await loadImage(stripSource);
    var sw = stripImg.naturalWidth || stripImg.width;
    var sh = stripImg.naturalHeight || stripImg.height;

    
    var isCard = (sw / sh) > 0.58;
    var maxW = isCard ? Math.min(cfg.width * 0.82, 840) : cfg.maxStripW;
    var maxH = isCard ? Math.min(cfg.height * 0.68, 1120) : cfg.maxStripH;
    var tiltDeg = options.tilt !== undefined ? options.tilt : (isCard ? -3.0 : cfg.tilt);

    var scale = Math.min(maxW / sw, maxH / sh);
    var targetW = sw * scale;
    var targetH = sh * scale;

    var centerX = W / 2;
    var centerY = (topBarMarginY + topBarH + btmBarMarginY) / 2;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate((tiltDeg * Math.PI) / 180);

    
    ctx.save();
    roundedRect(ctx, -targetW / 2, -targetH / 2, targetW, targetH, 14);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.restore();

    
    ctx.save();
    roundedRect(ctx, -targetW / 2, -targetH / 2, targetW, targetH, 14);
    ctx.clip();
    ctx.drawImage(stripImg, -targetW / 2, -targetH / 2, targetW, targetH);
    ctx.restore();

    
    ctx.save();
    roundedRect(ctx, -targetW / 2, -targetH / 2, targetW, targetH, 14);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.restore();

    
    ctx.save();
    var tapeW = Math.min(targetW * 0.35, 140);
    var tapeH = 34;
    var tapeX = -tapeW / 2;
    var tapeY = -targetH / 2 - tapeH * 0.45;
    roundedRect(ctx, tapeX, tapeY, tapeW, tapeH, 4);
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.fill();
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();

    ctx.restore(); 

    return canvas;
  };

  
  LBShareTemplate.generateCompositeBlob = async function (stripSource, options) {
    var canvas = await LBShareTemplate.renderToCanvas(stripSource, options);
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error("Failed to export canvas to Blob"));
      }, "image/png", 0.95);
    });
  };

  
  LBShareTemplate.generateCompositeDataUrl = async function (stripSource, options) {
    var canvas = await LBShareTemplate.renderToCanvas(stripSource, options);
    return canvas.toDataURL("image/png", 0.95);
  };

  
  var modalEl = null;
  var currentStripPayload = null;
  var currentFormat = "9:16";
  var renderedCache = {};
  var currentMeta = {};

  function ensureModalDOM() {
    if (modalEl && document.body.contains(modalEl)) return modalEl;

    var existing = document.getElementById("lb-share-template-modal");
    if (existing) {
      modalEl = existing;
      return modalEl;
    }

    var div = document.createElement("div");
    div.id = "lb-share-template-modal";
    div.className = "share-modal-overlay lb-share-template-overlay";
    div.setAttribute("role", "dialog");
    div.setAttribute("aria-modal", "true");
    div.setAttribute("aria-label", "Share Template");

    div.innerHTML = [
      '<div class="share-modal lb-share-template-card">',
      '  <div class="share-modal-handle"></div>',
      '  <button type="button" class="share-modal-close" id="lb-share-modal-close-btn" aria-label="Close modal">',
      '    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
      '  </button>',
      '  <h2 class="share-modal-title">Share Your Strip</h2>',
      '  <p class="share-modal-desc">Pick your layout for Instagram Stories, Reels, or Posts</p>',
      '  <div class="lb-share-ratio-tabs" id="lb-share-ratio-tabs">',
      '    <button type="button" class="lb-share-ratio-tab active" data-format="9:16">9:16 Story</button>',
      '    <button type="button" class="lb-share-ratio-tab" data-format="4:5">4:5 Post</button>',
      '    <button type="button" class="lb-share-ratio-tab" data-format="1:1">1:1 Square</button>',
      '  </div>',
      '  <div class="lb-share-preview-box loading" id="lb-share-preview-box">',
      '    <div class="lb-share-preview-spinner"></div>',
      '    <img id="lb-share-preview-img" class="lb-share-preview-img" alt="Share Template Preview" style="display:none;" />',
      '  </div>',
      '  <div class="lb-share-actions-row">',
      '    <button type="button" class="lb-share-btn lb-share-btn-share" id="lb-share-submit-btn">',
      '      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>',
      '      Share',
      '    </button>',
      '    <button type="button" class="lb-share-btn lb-share-btn-save" id="lb-share-download-btn">',
      '      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
      '      Save',
      '    </button>',
      '  </div>',
      '</div>'
    ].join("\n");

    document.body.appendChild(div);
    modalEl = div;

    
    var closeBtn = div.querySelector("#lb-share-modal-close-btn");
    if (closeBtn) closeBtn.addEventListener("click", LBShareTemplate.closeModal);

    div.addEventListener("click", function (e) {
      if (e.target === div) LBShareTemplate.closeModal();
    });

    div.addEventListener("keydown", function (e) {
      if (e.key === "Escape" || e.key === "Esc") {
        e.preventDefault();
        e.stopPropagation();
        LBShareTemplate.closeModal();
      }
    });

    var tabs = div.querySelectorAll(".lb-share-ratio-tab");
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        var fmt = tab.getAttribute("data-format");
        if (fmt && fmt !== currentFormat) {
          tabs.forEach(function (t) { t.classList.remove("active"); });
          tab.classList.add("active");
          currentFormat = fmt;
          renderCurrentFormatPreview();
        }
      });
    });

    var shareBtn = div.querySelector("#lb-share-submit-btn");
    if (shareBtn) {
      shareBtn.addEventListener("click", async function () {
        await executeShareAction("share");
      });
    }

    var dlBtn = div.querySelector("#lb-share-download-btn");
    if (dlBtn) {
      dlBtn.addEventListener("click", async function () {
        await executeShareAction("download");
      });
    }

    return modalEl;
  }

  async function getRenderedData(format) {
    if (renderedCache[format]) return renderedCache[format];
    var cache = renderedCache;
    var canvas = await LBShareTemplate.renderToCanvas(currentStripPayload, { format: format });
    var dataUrl = canvas.toDataURL("image/png", 0.95);
    var blob = await new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) {
        if (b) resolve(b);
        else reject(new Error("Failed to export canvas to Blob"));
      }, "image/png", 0.95);
    });
    cache[format] = { blob: blob, dataUrl: dataUrl };
    return cache[format];
  }

  async function renderCurrentFormatPreview() {
    var modal = ensureModalDOM();
    var previewBox = modal.querySelector("#lb-share-preview-box");
    var previewImg = modal.querySelector("#lb-share-preview-img");
    if (!previewBox || !previewImg) return;

    previewBox.classList.add("loading");
    var format = currentFormat;
    var payload = currentStripPayload;

    try {
      var item = await getRenderedData(format);
      // A newer tab or strip may have been picked while this one rendered.
      if (format !== currentFormat || payload !== currentStripPayload) return;
      previewImg.src = item.dataUrl;
      previewImg.style.display = "block";
      previewBox.classList.remove("loading");
    } catch (e) {
      previewBox.classList.remove("loading");
      try {
        if (window.LBExport && typeof window.LBExport.log === "function") {
          window.LBExport.log("share_template_preview_error", {
            reason: (e && (e.name || e.message)) || "unknown"
          });
        }
        console.error("[LBShareTemplate] preview render failed", e);
      } catch (_e) {}
      showPill("Could not prepare the preview. Please try again.", { type: "error" });
    }
  }

  function showPill(msg, opts) {
    opts = opts || {};
    var type = opts.type || "success";
    var duration = opts.duration || 2500;
    if (typeof window.showPillMessage === "function") {
      window.showPillMessage(msg, { type: type, duration: duration, position: "top-center" });
    } else if (typeof window.showLocalToast === "function") {
      window.showLocalToast(msg);
    } else if (window.LBExport && typeof window.LBExport.toast === "function") {
      window.LBExport.toast(msg, type);
    }
  }

  async function executeShareAction(action) {
    try {
      var item = await getRenderedData(currentFormat);
      var filename = (currentMeta.filePrefix || "lensbooth") + "-" + currentFormat.replace(":", "-") + "-" + Date.now() + ".png";
      var exportPayload = {
        blob: item.blob,
        dataUrl: item.dataUrl,
        filename: filename,
        title: currentMeta.title || "ConstBooth Strip",
        text: currentMeta.text || "Snapped on ConstBooth ✦ lensbooth.app"
      };

      if (action === "share") {
        if (window.LBExport && typeof window.LBExport.share === "function") {
          var res = await window.LBExport.share(exportPayload);
          if (res && res.ok && !res.aborted) {
            if (res.method === "clipboard") {
              showPill("Copied to clipboard! ♡", { type: "success" });
            } else if (res.method === "download") {
              showPill("Photo saved to downloads! ♡", { type: "success" });
            } else {
              showPill("Shared successfully! ♡", { type: "success" });
            }
          }
        } else if (navigator.share) {
          var file = new File([item.blob], filename, { type: "image/png" });
          try {
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
              await navigator.share({ files: [file], title: exportPayload.title, text: exportPayload.text });
              showPill("Shared successfully! ♡", { type: "success" });
            } else {
              await navigator.share({ title: exportPayload.title, text: exportPayload.text, url: window.location.href });
              showPill("Shared successfully! ♡", { type: "success" });
            }
          } catch (shareErr) {
            if (shareErr && shareErr.name !== "AbortError") {
              throw shareErr;
            }
          }
        } else {
          showPill("Preparing your photo...", { type: "info" });
        }
      } else if (action === "download") {
        if (window.LBExport && typeof window.LBExport.save === "function") {
          var saveRes = await window.LBExport.save(exportPayload);
          if (saveRes && saveRes.ok && saveRes.method !== "sheet") {
            showPill("Photo saved to downloads! ♡", { type: "success", duration: 2500 });
          }
        } else {
          var a = document.createElement("a");
          a.href = item.dataUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          showPill("Photo saved to downloads! ♡", { type: "success", duration: 2500 });
        }
      }
    } catch (err) {
      try {
        if (window.LBExport && typeof window.LBExport.log === "function") {
          window.LBExport.log("share_template_" + action + "_error", {
            reason: (err && (err.name || err.message)) || "unknown"
          });
        }
        console.error("[LBShareTemplate]", action, err);
      } catch (_e) {}
      showPill("Could not " + (action === "share" ? "share" : "save") + " your photo. Please try again.", { type: "error" });
    }
  }

  // meta (optional): { title, text, filePrefix, onClose } used for the shared/saved file.
  LBShareTemplate.openModal = function (stripPayload, meta) {
    if (!stripPayload) {
      if (typeof window.__lbGetStripPayload === "function") {
        stripPayload = window.__lbGetStripPayload();
      }
    }
    if (!stripPayload) {
      stripPayload = getInstantCardPayload();
    }
    if (!stripPayload) {
      var pending = sessionStorage.getItem("lb_pending_strip");
      if (pending) stripPayload = pending;
    }
    if (!stripPayload) return Promise.resolve({ ok: false });

    currentStripPayload = stripPayload;
    currentMeta = meta || {};
    renderedCache = {};
    currentFormat = "9:16";

    var modal = ensureModalDOM();
    var tabs = modal.querySelectorAll(".lb-share-ratio-tab");
    tabs.forEach(function (tab) {
      if (tab.getAttribute("data-format") === "9:16") tab.classList.add("active");
      else tab.classList.remove("active");
    });

    // Never show the previous strip while this one renders.
    var oldPreview = modal.querySelector("#lb-share-preview-img");
    if (oldPreview) {
      oldPreview.removeAttribute("src");
      oldPreview.style.display = "none";
    }

    modal.classList.add("visible");
    var card = modal.querySelector(".lb-share-template-card");
    if (card) {
      card.setAttribute("tabindex", "-1");
      try { card.focus({ preventScroll: true }); } catch (_) {}
    }
    renderCurrentFormatPreview();
    return Promise.resolve({ ok: true });
  };

  LBShareTemplate.closeModal = function () {
    if (modalEl) {
      var wasOpen = modalEl.classList.contains("visible");
      modalEl.classList.remove("visible");
      if (wasOpen && typeof currentMeta.onClose === "function") {
        try { currentMeta.onClose(); } catch (_) {}
      }
    }
  };

  
  function setupIntegration() {
    var checkAndWrap = function () {
      
      if (typeof window.__lbDoShare === "function" && !window.__lbDoShare.__isTemplateWrapped) {
        var origShare = window.__lbDoShare;
        var wrapped = function () {
          var payload = (typeof window.__lbGetStripPayload === "function") ? window.__lbGetStripPayload() : null;
          if (payload) {
            return LBShareTemplate.openModal(payload);
          }
          return origShare.apply(this, arguments);
        };
        wrapped.__isTemplateWrapped = true;
        window.__lbDoShare = wrapped;
      }

      
      if (typeof window.__lbIcShare === "function" && !window.__lbIcShare.__isTemplateWrapped) {
        var origIcShare = window.__lbIcShare;
        var wrappedIc = function () {
          var payload = getInstantCardPayload();
          if (payload) {
            return LBShareTemplate.openModal(payload);
          }
          return origIcShare.apply(this, arguments);
        };
        wrappedIc.__isTemplateWrapped = true;
        window.__lbIcShare = wrappedIc;
      }

      
      var icShareBtn = document.getElementById("ic-share-btn");
      if (icShareBtn && !icShareBtn.__lbTemplateShareBound) {
        icShareBtn.__lbTemplateShareBound = true;
        icShareBtn.addEventListener("click", function (ev) {
          var payload = getInstantCardPayload();
          if (payload) {
            try {
              ev.preventDefault();
              ev.stopImmediatePropagation();
            } catch (_) {}
            LBShareTemplate.openModal(payload);
          }
        }, true);
      }
    };

    checkAndWrap();
    setInterval(checkAndWrap, 500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupIntegration);
  } else {
    setupIntegration();
  }

  LBShareTemplate.FORMATS = FORMATS;
  LBShareTemplate.getInstantCardPayload = getInstantCardPayload;
  global.LBShareTemplate = LBShareTemplate;
})(typeof window !== "undefined" ? window : this);
