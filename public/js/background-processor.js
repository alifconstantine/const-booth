(function () {
  "use strict";

  if (window.LensBoothBackgroundProcessor || window.ConstBoothBackgroundProcessor) return;

  const CONFIG = {
    modelPathLocal: "/models/selfie_segmenter.tflite",
    modelPathCdn: "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
    wasmPathLocal: "/wasm",
    wasmPathCdn: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm",
    visionBundleLocal: "/js/vision_bundle.js",
    visionBundleCdn: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/+esm",
    targetFpsDesktop: 30,
    targetFpsMobile: 24,
    minInferenceIntervalMs: 33,
    temporalSmoothWeight: 0.45,
    thresholdMin: 0.15,
    thresholdMax: 0.85
  };

  const isMobile = (function () {
    try {
      return (
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent))
      );
    } catch (_) {
      return false;
    }
  })();

  let imageSegmenter = null;
  let isInitializing = false;
  let isInitialized = false;
  let isEnabled = false;
  let hasError = false;
  let errorMessage = "";

  let currentBgName = "none";
  let activeBgImage = null;
  const bgImageCache = new Map();

  let targetVideo = null;
  let inferenceLoopId = null;
  let isInferenceRunning = false;
  let lastInferenceTime = 0;
  let hasMaskData = false;

  let lastValidMaskAt = 0;
  let invalidMaskStreak = 0;
  let segmentationProven = false;
  let inferenceStartedAt = 0;
  let VisionSegmenterClass = null;
  let segmenterDelegate = null;
  let cpuRetryDone = false;
  const MASK_MIN_COVERAGE = 0.005;
  const MASK_MAX_AGE_MS = 900;
  const MASK_MAX_AGE_CAP = 2500;
  const MASK_RETRY_LIMIT = 12;
  const MASK_FAIL_LIMIT = 90;
  const INFERENCE_WATCHDOG_MS = 2500;

  function supportsFloatMaskReadback() {
    let gl = null;
    try {
      const probe = document.createElement("canvas");
      probe.width = 1;
      probe.height = 1;
      gl = probe.getContext("webgl2");
      if (!gl) return false;
      const fullFloat =
        !!gl.getExtension("EXT_color_buffer_float") &&
        !!gl.getExtension("OES_texture_float_linear") &&
        !!gl.getExtension("EXT_float_blend");
      const halfFloat = !!gl.getExtension("EXT_color_buffer_half_float");
      return fullFloat || halfFloat;
    } catch (_) {
      return false;
    } finally {
      try {
        const lose = gl && gl.getExtension("WEBGL_lose_context");
        if (lose) lose.loseContext();
      } catch (_) {}
    }
  }

  let compositeCanvas = null;
  let compositeCtx = null;
  let personCanvas = null;
  let personCtx = null;

  let foregroundCanvas = null;
  let foregroundCtx = null;
  let hasForegroundLayer = false;

  let remoteVideo = null;
  let remoteMaskCanvas = null;
  let remoteMaskCtx = null;
  let remoteMaskImageData = null;
  let remoteMaskU32View = null;
  let remotePrevConfidenceBuffer = null;
  let remoteHasMaskData = false;
  let remoteLastValidMaskAt = 0;
  let remoteInvalidMaskStreak = 0;
  let remotePersonCanvas = null;
  let remotePersonCtx = null;
  let remoteForegroundCanvas = null;
  let remoteForegroundCtx = null;
  let hasRemoteForegroundLayer = false;
  let remoteSoftMaskCanvas = null;
  let remoteSoftMaskCtx = null;
  let remotePreMaskCanvas = null;
  let remotePreMaskCtx = null;
  let remoteInferenceRunning = false;
  let lastRemoteInferenceTime = 0;
  const REMOTE_MASK_FAIL_LIMIT = 90;
  let maskCanvas = null;
  let maskCtx = null;
  let maskImageData = null;
  let maskU32View = null;
  let prevConfidenceBuffer = null;

  const IS_LITTLE_ENDIAN = (function () {
    const b = new ArrayBuffer(4);
    new Uint32Array(b)[0] = 0x12345678;
    return new Uint8Array(b)[0] === 0x78;
  })();

  const alphaLut = new Uint8Array(256);
  (function initAlphaLut() {
    const min = CONFIG.thresholdMin || 0.15;
    const max = CONFIG.thresholdMax || 0.85;
    const range = max - min;
    for (let i = 0; i < 256; i++) {
      const v = i / 255;
      let alpha = 0;
      if (v <= min) alpha = 0;
      else if (v >= max) alpha = 255;
      else {
        const t = (v - min) / range;
        alpha = Math.round(t * t * (3 - 2 * t) * 255);
      }
      alphaLut[i] = alpha;
    }
  })();

  let faceLandmarker = null;
  let isARInitialized = false;
  let currentAR = "none";
  let lastFaceResult = null;
  const activeARElements = {};

  const AR_CONFIGS = {
    spooky:     { url: "/assets/filters/Spooky.webp?v=315caf7f", anchor: "EYES", scaleX: 1.35, offsetY: 0.05 },
    puppy:      { url: "/assets/filters/Puppy.webp?v=a028b8dc", anchor: "FOREHEAD", scaleX: 1.2, offsetY: -0.4 },
    kitty:      { url: "/assets/filters/Kitty.webp?v=6e1bf70b", anchor: "FOREHEAD", scaleX: 1.2, offsetY: -0.4 },
    bunny:      { url: "/assets/filters/Bunny.webp?v=f21d9de3", anchor: "FOREHEAD", scaleX: 1.2, offsetY: -0.45 },
    swag:       { url: "/assets/filters/swag.webp?v=66d7ccbe", anchor: "EYES", scaleX: 0.95, offsetY: 0 },
    cool:       { url: "/assets/filters/Cool.webp?v=bebbdbda", anchor: "EYES", scaleX: 0.95, offsetY: 0 },
    angel:      { url: "/assets/filters/Angel.webp?v=b3bb2a8d", anchor: "FOREHEAD", scaleX: 0.8, offsetY: -0.7 },
    bigbow:     { url: "/assets/filters/Big Bow.webp", anchor: "FOREHEAD", scaleX: 0.4, offsetY: -0.45, offsetX: -0.3 },
    butterfly:  { url: "/assets/filters/Butterfly.webp?v=d49d4981", anchor: "FOREHEAD", scaleX: 0.75, offsetY: -0.25 },
    cutie:      { url: "/assets/filters/Cutie.webp?v=8e84c048", anchor: "EYES", scaleX: 1.1, offsetY: 0 },
    love:       { url: "/assets/filters/Love.webp?v=41991938", anchor: "FOREHEAD", scaleX: 0.75, offsetY: -0.25 },
    party:      { url: "/assets/filters/Party.webp?v=eb05ef4e", anchor: "FOREHEAD", scaleX: 0.85, offsetY: -0.5 },
    princess:   { url: "/assets/filters/Princess.webp?v=da7accc3", anchor: "FOREHEAD", scaleX: 0.9, offsetY: -0.4 },
    santa:      { url: "/assets/filters/Santa.webp?v=f7375c57", anchor: "FOREHEAD", scaleX: 1.5, offsetY: -0.2, offsetX: 0.1 },
    sweetears:  { url: "/assets/filters/Sweet Ears.webp", anchor: "FOREHEAD", scaleX: 0.9, offsetY: -0.2 },
    cozy:       { url: "/assets/filters/Cozy.webp?v=5d1198d6", anchor: "FOREHEAD", scaleX: 1.6, offsetY: -0.3 },
    devil:      { url: "/assets/filters/Devil.webp?v=6f669731", anchor: "FOREHEAD", scaleX: 1.2, offsetY: -0.25 },
    inlove:     { url: "/assets/filters/In Love.webp", anchor: "EYES", scaleX: 1.1, offsetY: 0 },
    urban:      { url: "/assets/filters/Urban.webp?v=6435928e", anchor: "FOREHEAD", scaleX: 1.5, offsetY: -0.2 }
  };

  const AR_BEAUTY_CONFIG = {
    smooth: 0.25,
    glowColor: "rgb(255, 225, 215)",
    glowOpacity: 0.08,
    underEye: 0.22
  };

  const PORTRAIT_RETOUCH_CONFIGS = {

    noir:      { smooth: 0.20, glowColor: "rgb(245, 245, 245)", glowOpacity: 0.04, underEye: 0.20 },
    vintage:   { smooth: 0.22, glowColor: "rgb(255, 220, 180)", glowOpacity: 0.08, underEye: 0.20 },
    dreamy:    { smooth: 0.28, glowColor: "rgb(255, 225, 235)", glowOpacity: 0.12, underEye: 0.25 },
    amber:     { smooth: 0.24, glowColor: "rgb(255, 205, 150)", glowOpacity: 0.08, underEye: 0.22 },

    rose:      { smooth: 0.22, glowColor: "rgb(255, 180, 200)", glowOpacity: 0.08, underEye: 0.20 },
    honey:     { smooth: 0.26, glowColor: "rgb(255, 205, 110)", glowOpacity: 0.14, underEye: 0.22 },
    blush:     { smooth: 0.24, glowColor: "rgb(255, 190, 180)", glowOpacity: 0.10, underEye: 0.24 },
    frost:     { smooth: 0.18, glowColor: "rgb(210, 235, 255)", glowOpacity: 0.08, underEye: 0.20 },
    film:      { smooth: 0.10, glowColor: "rgb(255, 242, 228)", glowOpacity: 0.05, underEye: 0.14 },
    cinema:    { smooth: 0.18, glowColor: "rgb(255, 195, 125)", glowOpacity: 0.10, underEye: 0.22 },
    peach:     { smooth: 0.25, glowColor: "rgb(255, 195, 185)", glowOpacity: 0.12, underEye: 0.22 },
    fade:      { smooth: 0.15, glowColor: "rgb(240, 240, 240)", glowOpacity: 0.03, underEye: 0.18 },
    afterglow: { smooth: 0.25, glowColor: "rgb(255, 215, 140)", glowOpacity: 0.18, underEye: 0.24 },
    midnight:  { smooth: 0.16, glowColor: "rgb(160, 190, 240)", glowOpacity: 0.08, underEye: 0.22 }
  };
  let currentPortraitFilter = "none";

  async function loadARImage(name) {
    if (!AR_CONFIGS[name]) return null;
    if (activeARElements[name]) return activeARElements[name];
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        activeARElements[name] = img;
        resolve(img);
      };
      img.onerror = () => resolve(null);
      img.src = AR_CONFIGS[name].url;
    });
  }

  let arInitPromise = null;
  let cachedVisionWasm = null;
  async function initializeAR() {
    if (isARInitialized && faceLandmarker) return true;
    if (arInitPromise) return arInitPromise;

    arInitPromise = (async () => {
      try {
        const VisionModule = await loadVisionLibrary();
        const FilesetResolver = VisionModule.FilesetResolver;
        const FaceLandmarker = VisionModule.FaceLandmarker;

        let faceWasm = null;
        try {
          faceWasm = await FilesetResolver.forVisionTasks(CONFIG.wasmPathLocal);
        } catch (err) {
          faceWasm = await FilesetResolver.forVisionTasks(CONFIG.wasmPathCdn);
        }

        const modelPathLocal = "/models/face_landmarker.task";
        const modelPathCdn = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";
        const arOpts = { outputFaceBlendshapes: false, runningMode: "VIDEO", numFaces: 1 };

        try {
          faceLandmarker = await FaceLandmarker.createFromOptions(faceWasm, {
            baseOptions: { modelAssetPath: modelPathLocal, delegate: "CPU" }, ...arOpts
          });
        } catch(localErr) {
          faceLandmarker = await FaceLandmarker.createFromOptions(faceWasm, {
            baseOptions: { modelAssetPath: modelPathCdn, delegate: "CPU" }, ...arOpts
          });
        }
        isARInitialized = !!faceLandmarker;

        if (faceLandmarker) {
          try {
            const warmCanvas = document.createElement("canvas");
            warmCanvas.width = 64;
            warmCanvas.height = 64;
            faceLandmarker.detectForVideo(warmCanvas, 0);
          } catch (_) {  }
        }

        return isARInitialized;
      } catch(err) {
        console.error("[LensBooth AR] Init failed:", err);
        return false;
      } finally {
        arInitPromise = null;
      }
    })();

    return arInitPromise;
  }

  function landmarkToCanvasCoordinates(landmark, vw, vh) {
    return {
      x: landmark.x * vw,
      y: landmark.y * vh
    };
  }

  function drawAROverlay(ctx, landmarks, img, cfg, vw, vh) {

    const leftEye = landmarkToCanvasCoordinates(landmarks[33], vw, vh);
    const rightEye = landmarkToCanvasCoordinates(landmarks[263], vw, vh);
    const headTop = landmarkToCanvasCoordinates(landmarks[10], vw, vh);

    const dx = rightEye.x - leftEye.x;
    const dy = rightEye.y - leftEye.y;
    const angle = Math.atan2(dy, dx);
    const eyeDist = Math.sqrt(dx * dx + dy * dy);

    const baseFaceWidth = eyeDist * 2.0;

    const targetWidth = baseFaceWidth * cfg.scaleX;
    const targetHeight = targetWidth * (img.naturalHeight / img.naturalWidth);

    let anchorX, anchorY;
    if (cfg.anchor === "FOREHEAD") {
      anchorX = headTop.x;
      anchorY = headTop.y;
    } else if (cfg.anchor === "EYES") {
      anchorX = (leftEye.x + rightEye.x) / 2;
      anchorY = (leftEye.y + rightEye.y) / 2;
    } else {
      anchorX = (leftEye.x + rightEye.x) / 2;
      anchorY = (leftEye.y + rightEye.y) / 2;
    }

    ctx.save();

    ctx.translate(anchorX, anchorY);

    ctx.rotate(angle);

    const offsetX = (cfg.offsetX || 0) * targetWidth;
    const offsetY = cfg.offsetY * targetHeight;
    ctx.translate(offsetX, offsetY);

    ctx.drawImage(img, -targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight);

    ctx.restore();
  }

  let retouchCanvas = null;
  let retouchCtx = null;
  let retouchMaskCanvas = null;
  let retouchMaskCtx = null;

  function ensureRetouchCanvases(width, height) {
    if (!width || !height) return;
    if (!retouchCanvas) {
      retouchCanvas = document.createElement("canvas");
      retouchCtx = retouchCanvas.getContext("2d");
    }
    if (retouchCanvas.width !== width || retouchCanvas.height !== height) {
      retouchCanvas.width = width;
      retouchCanvas.height = height;
    }
    if (!retouchMaskCanvas) {
      retouchMaskCanvas = document.createElement("canvas");
      retouchMaskCtx = retouchMaskCanvas.getContext("2d");
    }
    if (retouchMaskCanvas.width !== width || retouchMaskCanvas.height !== height) {
      retouchMaskCanvas.width = width;
      retouchMaskCanvas.height = height;
    }
  }

  function drawPortraitRetouch(ctx, landmarks, cfg, vw, vh, videoSource) {
    if (!landmarks || landmarks.length < 468) return;
    ensureRetouchCanvases(vw, vh);
    if (!retouchCtx || !retouchMaskCtx) return;

    const faceOvalIndices = [
      10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
      397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
      172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109
    ];
    const leftEyeIndices = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
    const rightEyeIndices = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
    const leftEyebrowIndices = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
    const rightEyebrowIndices = [336, 296, 334, 293, 300, 276, 283, 282, 295, 285];
    const lipsIndices = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78];

    function drawPolygonOn(c, indices) {
      if (!indices || indices.length === 0) return;
      const pt0 = landmarkToCanvasCoordinates(landmarks[indices[0]], vw, vh);
      c.moveTo(pt0.x, pt0.y);
      for (let i = 1; i < indices.length; i++) {
        const pt = landmarkToCanvasCoordinates(landmarks[indices[i]], vw, vh);
        c.lineTo(pt.x, pt.y);
      }
      c.closePath();
    }

    retouchMaskCtx.clearRect(0, 0, vw, vh);

    retouchMaskCtx.beginPath();
    drawPolygonOn(retouchMaskCtx, faceOvalIndices);
    retouchMaskCtx.fillStyle = "#ffffff";
    retouchMaskCtx.fill();

    retouchMaskCtx.globalCompositeOperation = "destination-out";

    retouchMaskCtx.beginPath();
    drawPolygonOn(retouchMaskCtx, leftEyeIndices);
    retouchMaskCtx.fill();

    retouchMaskCtx.beginPath();
    drawPolygonOn(retouchMaskCtx, rightEyeIndices);
    retouchMaskCtx.fill();

    retouchMaskCtx.beginPath();
    drawPolygonOn(retouchMaskCtx, leftEyebrowIndices);
    retouchMaskCtx.fill();

    retouchMaskCtx.beginPath();
    drawPolygonOn(retouchMaskCtx, rightEyebrowIndices);
    retouchMaskCtx.fill();

    retouchMaskCtx.beginPath();
    drawPolygonOn(retouchMaskCtx, lipsIndices);
    retouchMaskCtx.fill();

    retouchMaskCtx.globalCompositeOperation = "source-over";

    retouchCtx.clearRect(0, 0, vw, vh);
    const src = videoSource || targetVideo;
    if (src) {
      if ("filter" in retouchCtx) {
        retouchCtx.filter = "blur(8px)";
        retouchCtx.drawImage(src, 0, 0, vw, vh);
        retouchCtx.filter = "none";
      } else {
        retouchCtx.drawImage(src, 0, 0, vw, vh);
      }
    }

    retouchCtx.globalCompositeOperation = "destination-in";
    if ("filter" in retouchCtx) {
      retouchCtx.filter = "blur(20px)";
      retouchCtx.drawImage(retouchMaskCanvas, 0, 0);
      retouchCtx.filter = "none";
    } else {
      retouchCtx.drawImage(retouchMaskCanvas, 0, 0);
    }
    retouchCtx.globalCompositeOperation = "source-over";

    ctx.save();
    if (cfg.smooth > 0) {
      ctx.globalAlpha = Math.min(0.38, cfg.smooth * 0.7);
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(retouchCanvas, 0, 0);
    }

    if (cfg.glowColor && cfg.glowOpacity > 0) {
      ctx.globalCompositeOperation = "soft-light";
      ctx.globalAlpha = Math.min(0.10, cfg.glowOpacity * 0.3);
      retouchCtx.globalCompositeOperation = "source-in";
      retouchCtx.fillStyle = cfg.glowColor;
      retouchCtx.fillRect(0, 0, vw, vh);
      retouchCtx.globalCompositeOperation = "source-over";
      ctx.drawImage(retouchCanvas, 0, 0);
    }

    if (cfg.underEye > 0) {
      const leftUnderEye = landmarkToCanvasCoordinates(landmarks[117], vw, vh);
      const rightUnderEye = landmarkToCanvasCoordinates(landmarks[346], vw, vh);
      const eyeL = landmarkToCanvasCoordinates(landmarks[33], vw, vh);
      const eyeR = landmarkToCanvasCoordinates(landmarks[263], vw, vh);
      const eyeDist = Math.sqrt(Math.pow(eyeR.x - eyeL.x, 2) + Math.pow(eyeR.y - eyeL.y, 2));
      const radius = eyeDist * 0.28;

      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = Math.min(0.12, cfg.underEye * 0.4);
      if ("filter" in ctx) {
        ctx.filter = "blur(8px)";
      }

      const gradL = ctx.createRadialGradient(leftUnderEye.x, leftUnderEye.y, 0, leftUnderEye.x, leftUnderEye.y, radius);
      gradL.addColorStop(0, "rgba(255, 240, 230, 0.12)");
      gradL.addColorStop(0.6, "rgba(255, 240, 230, 0.05)");
      gradL.addColorStop(1, "rgba(255, 240, 230, 0)");
      ctx.fillStyle = gradL;
      ctx.beginPath();
      ctx.arc(leftUnderEye.x, leftUnderEye.y, radius, 0, Math.PI * 2);
      ctx.fill();

      const gradR = ctx.createRadialGradient(rightUnderEye.x, rightUnderEye.y, 0, rightUnderEye.x, rightUnderEye.y, radius);
      gradR.addColorStop(0, "rgba(255, 240, 230, 0.12)");
      gradR.addColorStop(0.6, "rgba(255, 240, 230, 0.05)");
      gradR.addColorStop(1, "rgba(255, 240, 230, 0)");
      ctx.fillStyle = gradR;
      ctx.beginPath();
      ctx.arc(rightUnderEye.x, rightUnderEye.y, radius, 0, Math.PI * 2);
      ctx.fill();
      if ("filter" in ctx) {
        ctx.filter = "none";
      }
    }

    ctx.restore();
  }

  function showLoadingState(show, text) {
    try {
      let pill = document.getElementById("lb-bg-loading-pill");
      if (show) {
        if (!pill) {
          pill = document.createElement("div");
          pill.id = "lb-bg-loading-pill";
          pill.setAttribute("role", "status");
          pill.setAttribute("aria-live", "polite");
          pill.style.cssText = `
            position: absolute;
            top: 14px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 40;
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 14px;
            background: rgba(18, 18, 18, 0.85);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 20px;
            color: #ffffff;
            font-family: 'Satoshi', -apple-system, sans-serif;
            font-size: 12px;
            font-weight: 500;
            letter-spacing: 0.2px;
            pointer-events: none;
            transition: opacity 0.25s ease;
            opacity: 0;
          `;
          pill.innerHTML = `
            <span style="width: 10px; height: 10px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; display: inline-block; animation: lbBgSpin 0.7s linear infinite;"></span>
            <span id="lb-bg-loading-text">${text || "Preparing background..."}</span>
          `;

          if (!document.getElementById("lb-bg-spin-style")) {
            const style = document.createElement("style");
            style.id = "lb-bg-spin-style";
            style.textContent = `@keyframes lbBgSpin { to { transform: rotate(360deg); } }`;
            document.head.appendChild(style);
          }

          const frame = document.getElementById("camera-frame") || document.body;
          frame.appendChild(pill);
          requestAnimationFrame(() => { pill.style.opacity = "1"; });
        } else {
          const txtSpan = document.getElementById("lb-bg-loading-text");
          if (txtSpan) txtSpan.textContent = text || "Preparing background...";
          pill.style.opacity = "1";
        }
      } else if (pill) {
        pill.style.opacity = "0";
        setTimeout(() => {
          if (pill && pill.parentNode) pill.parentNode.removeChild(pill);
        }, 260);
      }
    } catch (_) {}
  }

  function loadBackgroundImage(filename) {
    if (!filename || filename === "none") return Promise.resolve(null);
    if (bgImageCache.has(filename)) {
      const cached = bgImageCache.get(filename);
      if (cached.complete && cached.naturalWidth > 0) return Promise.resolve(cached);
    }

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        bgImageCache.set(filename, img);
        resolve(img);
      };
      img.onerror = () => {
        console.warn("[LensBooth BG] Failed to load background image:", filename);
        resolve(null);
      };
      img.src = "/assets/virtual-bgs/" + filename;
    });
  }

  async function loadVisionLibrary() {
    if (window.Vision && window.Vision.FilesetResolver && window.Vision.ImageSegmenter) {
      return window.Vision;
    }

    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = CONFIG.visionBundleLocal + "?v=" + Date.now();
        script.onload = () => {
          if (window.Vision) resolve(window.Vision);
          else reject(new Error("Local Vision bundle did not assign window.Vision"));
        };
        script.onerror = reject;
        document.head.appendChild(script);
      });
      return window.Vision;
    } catch (localErr) {
      console.warn("[LensBooth BG] Local vision bundle load failed, trying ESM CDN fallback:", localErr);
      const module = await import(CONFIG.visionBundleCdn);
      return module;
    }
  }

  function createSegmenter(visionWasm, delegate, modelPath) {
    return VisionSegmenterClass.createFromOptions(visionWasm, {
      baseOptions: { modelAssetPath: modelPath, delegate: delegate },
      runningMode: "VIDEO",
      outputConfidenceMasks: true
    });
  }

  let cpuSwitchPromise = null;
  function switchSegmenterToCpu() {
    if (cpuRetryDone || segmenterDelegate === "CPU") return Promise.resolve(false);
    if (cpuSwitchPromise) return cpuSwitchPromise;
    cpuRetryDone = true;

    cpuSwitchPromise = (async function () {
      console.warn("[LensBooth BG] GPU masks unusable; rebuilding segmenter on CPU.");
      const previous = imageSegmenter;

      imageSegmenter = null;
      isInferenceRunning = false;
      try {
        if (previous && typeof previous.close === "function") previous.close();
      } catch (_) {}

      try {
        imageSegmenter = await createSegmenter(cachedVisionWasm, "CPU", CONFIG.modelPathLocal);
        segmenterDelegate = "CPU";
        currentTier = isMobile ? "LOW" : "MID";
        invalidMaskStreak = 0;
        inferenceTimes.length = 0;
        consecutiveSlowCount = 0;
        lastInferenceTime = 0;
        return true;
      } catch (err) {
        console.warn("[LensBooth BG] CPU segmenter rebuild failed:", err);

        triggerFallback("no working segmentation delegate on this device");
        return false;
      } finally {
        cpuSwitchPromise = null;
      }
    })();

    return cpuSwitchPromise;
  }

  let segmenterInitPromise = null;
  function initializeSegmenter() {
    if (isInitialized && imageSegmenter) return Promise.resolve(true);
    if (segmenterInitPromise) return segmenterInitPromise;
    segmenterInitPromise = initializeSegmenterInner().finally(function () {
      segmenterInitPromise = null;
    });
    return segmenterInitPromise;
  }

  async function initializeSegmenterInner() {
    isInitializing = true;
    showLoadingState(true, "Preparing background...");

    try {
      const VisionModule = await loadVisionLibrary();
      const FilesetResolver = VisionModule.FilesetResolver;
      const ImageSegmenter = VisionModule.ImageSegmenter;

      if (!FilesetResolver || !ImageSegmenter) {
        throw new Error("FilesetResolver or ImageSegmenter missing from Vision module");
      }
      VisionSegmenterClass = ImageSegmenter;

      if (!cachedVisionWasm) {
        try {
          cachedVisionWasm = await FilesetResolver.forVisionTasks(CONFIG.wasmPathLocal);
        } catch (wasmLocalErr) {
          console.warn("[LensBooth BG] Local wasm failed, falling back to CDN:", wasmLocalErr);
          cachedVisionWasm = await FilesetResolver.forVisionTasks(CONFIG.wasmPathCdn);
        }
      }
      const visionWasm = cachedVisionWasm;

      const modelPath = CONFIG.modelPathLocal;
      let segmenterInstance = null;

      if (supportsFloatMaskReadback()) {
        try {
          segmenterInstance = await createSegmenter(visionWasm, "GPU", modelPath);
          segmenterDelegate = "GPU";
        } catch (gpuErr) {
          console.warn("[LensBooth BG] GPU delegate failed, falling back to CPU:", gpuErr);
        }
      } else {
        console.info("[LensBooth BG] GPU float mask readback unsupported here; using CPU delegate.");
      }

      if (!segmenterInstance) {
        try {
          segmenterInstance = await createSegmenter(visionWasm, "CPU", modelPath);
          segmenterDelegate = "CPU";
        } catch (cpuErr) {
          console.warn("[LensBooth BG] Local model path failed, trying CDN model path:", cpuErr);
          segmenterInstance = await createSegmenter(visionWasm, "CPU", CONFIG.modelPathCdn);
          segmenterDelegate = "CPU";
        }
      }

      if (segmenterDelegate === "CPU") {
        currentTier = isMobile ? "LOW" : "MID";
      }

      imageSegmenter = segmenterInstance;
      isInitialized = true;
      hasError = false;
      showLoadingState(false);

      return true;
    } catch (err) {
      console.error("[LensBooth BG] Segmentation initialization failed:", err);
      hasError = true;
      errorMessage = err && err.message ? err.message : "Initialization error";
      showLoadingState(false);

      showLoadingState(true, "Background effect unavailable on this device");
      setTimeout(() => showLoadingState(false), 3000);
      return false;
    } finally {
      isInitializing = false;
    }
  }

  function ensureCanvasDimensions(width, height) {
    if (!width || !height) return;

    if (!compositeCanvas) {

      compositeCanvas = document.createElement("canvas");
      compositeCtx = compositeCanvas.getContext("2d", { alpha: false });
    }
    if (compositeCanvas.width !== width || compositeCanvas.height !== height) {
      compositeCanvas.width = width;
      compositeCanvas.height = height;
      if (compositeCtx) {
        compositeCtx.imageSmoothingEnabled = true;

        compositeCtx.imageSmoothingQuality = currentTier === "HIGH" ? "high" : "medium";
      }
    }

    if (!personCanvas) {
      personCanvas = document.createElement("canvas");
      personCtx = personCanvas.getContext("2d", { alpha: true });
    }
    if (personCanvas.width !== width || personCanvas.height !== height) {
      personCanvas.width = width;
      personCanvas.height = height;
      if (personCtx) {

        personCtx.imageSmoothingEnabled = true;
        personCtx.imageSmoothingQuality = "high";
      }
    }
  }

  function updateMaskCanvasFromConfidence(maskObj) {
    const maskW = maskObj.width;
    const maskH = maskObj.height;
    if (!maskW || !maskH) return "empty";

    if (!maskCanvas) {
      maskCanvas = document.createElement("canvas");
      maskCtx = maskCanvas.getContext("2d", { willReadFrequently: false });
    }
    if (maskCanvas.width !== maskW || maskCanvas.height !== maskH) {
      maskCanvas.width = maskW;
      maskCanvas.height = maskH;
      maskImageData = maskCtx.createImageData(maskW, maskH);
      maskU32View = new Uint32Array(maskImageData.data.buffer);
      prevConfidenceBuffer = new Float32Array(maskW * maskH);
    }

    let confFloats = null;
    try {
      confFloats = maskObj.getAsFloat32Array();
    } catch (readErr) {
      return "readback-failed";
    }
    if (!confFloats || confFloats.length < maskW * maskH) return "readback-failed";

    const totalPixels = maskW * maskH;
    const alphaWeight = CONFIG.temporalSmoothWeight;
    const oneMinusWeight = 1.0 - alphaWeight;

    let foregroundPixels = 0;

    for (let i = 0; i < totalPixels; i++) {
      let raw = confFloats[i];
      if (raw < 0) raw = 0;
      else if (raw > 1) raw = 1;

      const prev = prevConfidenceBuffer[i];
      const smoothed = prev * alphaWeight + raw * oneMinusWeight;
      prevConfidenceBuffer[i] = smoothed;

      const lutIdx = (smoothed * 255) | 0;
      const alpha = alphaLut[lutIdx];

      if (alpha > 8) foregroundPixels++;

      if (IS_LITTLE_ENDIAN) {
        maskU32View[i] = (alpha << 24) | 0x00ffffff;
      } else {
        maskU32View[i] = 0xffffff00 | alpha;
      }
    }

    if (foregroundPixels < totalPixels * MASK_MIN_COVERAGE) {

      if (prevConfidenceBuffer) prevConfidenceBuffer.fill(0);
      return "empty";
    }

    maskCtx.putImageData(maskImageData, 0, 0);
    hasMaskData = true;
    lastValidMaskAt = performance.now();
    segmentationProven = true;
    return "ok";
  }

  function updateRemoteMaskCanvasFromConfidence(maskObj) {
    const maskW = maskObj.width;
    const maskH = maskObj.height;
    if (!maskW || !maskH) return "empty";

    if (!remoteMaskCanvas) {
      remoteMaskCanvas = document.createElement("canvas");
      remoteMaskCtx = remoteMaskCanvas.getContext("2d", { willReadFrequently: false });
    }
    if (remoteMaskCanvas.width !== maskW || remoteMaskCanvas.height !== maskH) {
      remoteMaskCanvas.width = maskW;
      remoteMaskCanvas.height = maskH;
      remoteMaskImageData = remoteMaskCtx.createImageData(maskW, maskH);
      remoteMaskU32View = new Uint32Array(remoteMaskImageData.data.buffer);
      remotePrevConfidenceBuffer = new Float32Array(maskW * maskH);
    }

    let confFloats = null;
    try {
      confFloats = maskObj.getAsFloat32Array();
    } catch (readErr) {
      return "readback-failed";
    }
    if (!confFloats || confFloats.length < maskW * maskH) return "readback-failed";

    const totalPixels = maskW * maskH;
    const alphaWeight = CONFIG.temporalSmoothWeight;
    const oneMinusWeight = 1.0 - alphaWeight;

    let foregroundPixels = 0;

    for (let i = 0; i < totalPixels; i++) {
      let raw = confFloats[i];
      if (raw < 0) raw = 0;
      else if (raw > 1) raw = 1;

      const prev = remotePrevConfidenceBuffer[i];
      const smoothed = prev * alphaWeight + raw * oneMinusWeight;
      remotePrevConfidenceBuffer[i] = smoothed;

      const lutIdx = (smoothed * 255) | 0;
      const alpha = alphaLut[lutIdx];

      if (alpha > 8) foregroundPixels++;

      if (IS_LITTLE_ENDIAN) {
        remoteMaskU32View[i] = (alpha << 24) | 0x00ffffff;
      } else {
        remoteMaskU32View[i] = 0xffffff00 | alpha;
      }
    }

    if (foregroundPixels < totalPixels * MASK_MIN_COVERAGE) {
      if (remotePrevConfidenceBuffer) remotePrevConfidenceBuffer.fill(0);
      return "empty";
    }

    remoteMaskCtx.putImageData(remoteMaskImageData, 0, 0);
    remoteHasMaskData = true;
    remoteLastValidMaskAt = performance.now();
    return "ok";
  }

  function isRemoteMaskUsable() {

    return (
      remoteHasMaskData &&
      !!remoteMaskCanvas &&
      remoteMaskCanvas.width > 0 &&
      performance.now() - remoteLastValidMaskAt <= maskStaleLimitMs(true)
    );
  }

  function getRemoteFeatheredMask(vw, vh) {
    if (!remoteMaskCanvas || !remoteMaskCanvas.width) return null;

    const tier = PERFORMANCE_TIERS[currentTier] || PERFORMANCE_TIERS.MID;
    const radius = tier.featherPx || 0;
    if (!radius || !detectCanvasBlur()) return remoteMaskCanvas;

    try {
      if (!remoteSoftMaskCanvas) {
        remoteSoftMaskCanvas = document.createElement("canvas");
        remoteSoftMaskCtx = remoteSoftMaskCanvas.getContext("2d");
      }
      if (!remoteSoftMaskCtx) return remoteMaskCanvas;

      let source = remoteMaskCanvas;
      const pre = tier.preFeatherPx || 0;
      if (pre > 0) {
        if (!remotePreMaskCanvas) {
          remotePreMaskCanvas = document.createElement("canvas");
          remotePreMaskCtx = remotePreMaskCanvas.getContext("2d");
        }
        if (remotePreMaskCtx) {
          source = blurInto(remotePreMaskCtx, remotePreMaskCanvas, remoteMaskCanvas, remoteMaskCanvas.width, remoteMaskCanvas.height, pre);
        }
      }

      const w = Math.max(1, Math.min(vw, Math.round(remoteMaskCanvas.width * (tier.featherUpscale || 3))));
      const h = Math.max(1, Math.round((w * vh) / vw));
      return blurInto(remoteSoftMaskCtx, remoteSoftMaskCanvas, source, w, h, radius);
    } catch (_) {
      return remoteMaskCanvas;
    }
  }

  function maskStaleLimitMs(sharingSlot) {
    const tier = PERFORMANCE_TIERS[currentTier] || PERFORMANCE_TIERS.MID;
    let avg = 0;
    if (inferenceTimes.length) {
      let total = 0;
      for (let i = 0; i < inferenceTimes.length; i++) total += inferenceTimes[i];
      avg = total / inferenceTimes.length;
    }
    const cycle = (tier.intervalMs + avg) * (sharingSlot ? 2 : 1);

    const floor = sharingSlot ? MASK_MAX_AGE_MS * 1.5 : MASK_MAX_AGE_MS;
    return Math.min(MASK_MAX_AGE_CAP, Math.max(floor, cycle * 3));
  }

  function isMaskUsable() {
    const sharingSlot = isEnabled && !!activeBgImage && !!remoteVideo;
    return (
      hasMaskData &&
      !!maskCanvas &&
      maskCanvas.width > 0 &&
      performance.now() - lastValidMaskAt <= maskStaleLimitMs(sharingSlot)
    );
  }

  let cachedFacingMode = null;
  let cachedFacingModeAt = 0;
  function getFacingMode() {
    const now = performance.now();
    if (cachedFacingMode === null || now - cachedFacingModeAt > 500) {
      try {
        cachedFacingMode = localStorage.getItem("lb_facing_mode") || "user";
      } catch (_) {
        cachedFacingMode = "user";
      }
      cachedFacingModeAt = now;
    }
    return cachedFacingMode;
  }

  function drawContainBackground(ctx, img, targetW, targetH, skipFacingFlip) {

    ctx.fillStyle = "#111111";
    ctx.fillRect(0, 0, targetW, targetH);

    if (!img || !img.naturalWidth || !img.naturalHeight) {
      return;
    }

    const imgW = img.naturalWidth;
    const imgH = img.naturalHeight;
    const imgRatio = imgW / imgH;
    const targetRatio = targetW / targetH;

    let drawW, drawH, drawX, drawY;

    if (imgRatio > targetRatio) {

      drawH = targetH;
      drawW = targetH * imgRatio;
      drawX = (targetW - drawW) / 2;
      drawY = 0;
    } else {

      drawW = targetW;
      drawH = targetW / imgRatio;
      drawX = 0;
      drawY = (targetH - drawH) / 2;
    }

    ctx.save();

    const facingMode = getFacingMode();
    if (!skipFacingFlip && facingMode === "user") {
      ctx.translate(targetW, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.restore();
  }

  function createFitCache() {
    return { canvas: null, ctx: null, key: "" };
  }
  const localBgFitCache = createFitCache();
  const remoteBgFitCache = createFitCache();

  const combinedBgFitCache = createFitCache();

  function getFittedBackground(cache, img, targetW, targetH) {
    if (!img || !img.naturalWidth || !targetW || !targetH) return null;
    const key = (img.src || "") + "|" + targetW + "x" + targetH + "|" + getFacingMode();
    if (cache.canvas && cache.key === key) return cache.canvas;

    if (!cache.canvas) {
      cache.canvas = document.createElement("canvas");
      cache.ctx = cache.canvas.getContext("2d", { alpha: false });
    }
    if (!cache.ctx) return null;
    if (cache.canvas.width !== targetW || cache.canvas.height !== targetH) {
      cache.canvas.width = targetW;
      cache.canvas.height = targetH;
    }
    cache.ctx.imageSmoothingEnabled = true;
    cache.ctx.imageSmoothingQuality = "high";
    drawContainBackground(cache.ctx, img, targetW, targetH);
    cache.key = key;
    return cache.canvas;
  }

  function buildCombinedBackgroundLayer(fullW, fullH) {
    if (!activeBgImage || !fullW || !fullH) return null;
    const cache = combinedBgFitCache;
    const key = (activeBgImage.src || "") + "|" + fullW + "x" + fullH;
    if (cache.canvas && cache.key === key) return cache.canvas;

    if (!cache.canvas) {
      cache.canvas = document.createElement("canvas");
      cache.ctx = cache.canvas.getContext("2d", { alpha: false });
    }
    if (!cache.ctx) return null;
    if (cache.canvas.width !== fullW || cache.canvas.height !== fullH) {
      cache.canvas.width = fullW;
      cache.canvas.height = fullH;
    }
    cache.ctx.imageSmoothingEnabled = true;
    cache.ctx.imageSmoothingQuality = "high";
    drawContainBackground(cache.ctx, activeBgImage, fullW, fullH, true);
    cache.key = key;
    return cache.canvas;
  }

  let softMaskCanvas = null;
  let softMaskCtx = null;
  let preMaskCanvas = null;
  let preMaskCtx = null;
  let canvasBlurSupported = null;

  function detectCanvasBlur() {
    if (canvasBlurSupported !== null) return canvasBlurSupported;
    canvasBlurSupported = false;
    try {
      const c = document.createElement("canvas");
      c.width = 9;
      c.height = 9;
      const ctx = c.getContext("2d");
      if (ctx && "filter" in ctx) {
        ctx.filter = "blur(2px)";
        ctx.fillStyle = "#fff";
        ctx.fillRect(4, 4, 1, 1);
        ctx.filter = "none";

        canvasBlurSupported = ctx.getImageData(6, 4, 1, 1).data[3] > 0;
      }
    } catch (_) {
      canvasBlurSupported = false;
    }
    return canvasBlurSupported;
  }

  let glCanvas = null;
  let gl = null;
  let glProgram = null;
  let glMaskTex = null;
  let glGuideTex = null;
  let glQuadBuf = null;
  let glLoc = null;
  let glRefineAvailable = null;

  const REFINE_VS = [
    "attribute vec2 aPos;",
    "varying vec2 vUV;",
    "void main() {",

    "  vUV = vec2(aPos.x, -aPos.y) * 0.5 + 0.5;",
    "  gl_Position = vec4(aPos, 0.0, 1.0);",
    "}"
  ].join("\n");

  const REFINE_FS = [
    "precision mediump float;",
    "varying vec2 vUV;",
    "uniform sampler2D uMask;",
    "uniform sampler2D uGuide;",
    "uniform vec2 uTap;",
    "uniform float uRangeInv;",
    "const vec3 LUMA = vec3(0.299, 0.587, 0.114);",
    "void main() {",
    "  float lc = dot(texture2D(uGuide, vUV).rgb, LUMA);",
    "  float sum = 0.0;",
    "  float wsum = 0.0;",

    "  for (int j = -2; j <= 2; j++) {",
    "    for (int i = -2; i <= 2; i++) {",
    "      vec2 uv = clamp(vUV + vec2(float(i), float(j)) * uTap, 0.0, 1.0);",
    "      float m = texture2D(uMask, uv).a;",
    "      float dl = dot(texture2D(uGuide, uv).rgb, LUMA) - lc;",
    "      float ws = exp(-float(i * i + j * j) * 0.347);",
    "      float w = ws * exp(-dl * dl * uRangeInv);",
    "      sum += m * w;",
    "      wsum += w;",
    "    }",
    "  }",
    "  float a = wsum > 0.0 ? sum / wsum : texture2D(uMask, vUV).a;",
    "  gl_FragColor = vec4(1.0, 1.0, 1.0, a);",
    "}"
  ].join("\n");

  function compileRefineShader(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error("shader compile failed: " + log);
    }
    return sh;
  }

  function createRefineTexture() {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  function initRefine() {
    if (glRefineAvailable !== null) return glRefineAvailable;
    glRefineAvailable = false;
    try {
      glCanvas = document.createElement("canvas");
      glCanvas.width = 16;
      glCanvas.height = 16;

      const opts = {
        alpha: true,
        premultipliedAlpha: false,
        depth: false,
        stencil: false,
        antialias: false,
        preserveDrawingBuffer: false
      };
      gl = glCanvas.getContext("webgl", opts) || glCanvas.getContext("experimental-webgl", opts);
      if (!gl) return false;

      glCanvas.addEventListener("webglcontextlost", function (e) {
        e.preventDefault();

        glRefineAvailable = false;
      }, false);

      const vs = compileRefineShader(gl.VERTEX_SHADER, REFINE_VS);
      const fs = compileRefineShader(gl.FRAGMENT_SHADER, REFINE_FS);
      glProgram = gl.createProgram();
      gl.attachShader(glProgram, vs);
      gl.attachShader(glProgram, fs);
      gl.linkProgram(glProgram);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(glProgram, gl.LINK_STATUS)) {
        throw new Error("program link failed: " + gl.getProgramInfoLog(glProgram));
      }

      glQuadBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, glQuadBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

      glLoc = {
        aPos: gl.getAttribLocation(glProgram, "aPos"),
        uMask: gl.getUniformLocation(glProgram, "uMask"),
        uGuide: gl.getUniformLocation(glProgram, "uGuide"),
        uTap: gl.getUniformLocation(glProgram, "uTap"),
        uRangeInv: gl.getUniformLocation(glProgram, "uRangeInv")
      };
      glMaskTex = createRefineTexture();
      glGuideTex = createRefineTexture();

      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

      if (!selfTestRefine()) {
        throw new Error("refinement self-test failed");
      }

      glRefineAvailable = true;
    } catch (err) {
      console.warn("[LensBooth BG] Edge-aware refinement unavailable:", err);
      glRefineAvailable = false;
    }
    return glRefineAvailable;
  }

  function selfTestRefine() {
    try {
      const maskPixels = new Uint8Array([
        255, 255, 255, 0, 255, 255, 255, 0,
        255, 255, 255, 255, 255, 255, 255, 255
      ]);
      const guidePixels = new Uint8Array([
        128, 128, 128, 255, 128, 128, 128, 255,
        128, 128, 128, 255, 128, 128, 128, 255
      ]);
      gl.bindTexture(gl.TEXTURE_2D, glMaskTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, maskPixels);
      gl.bindTexture(gl.TEXTURE_2D, glGuideTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, guidePixels);

      const N = 8;
      glCanvas.width = N;
      glCanvas.height = N;
      gl.viewport(0, 0, N, N);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(glProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, glMaskTex);
      gl.uniform1i(glLoc.uMask, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, glGuideTex);
      gl.uniform1i(glLoc.uGuide, 1);
      gl.uniform2f(glLoc.uTap, 0.5, 0.5);
      gl.uniform1f(glLoc.uRangeInv, 90);
      gl.bindBuffer(gl.ARRAY_BUFFER, glQuadBuf);
      gl.enableVertexAttribArray(glLoc.aPos);
      gl.vertexAttribPointer(glLoc.aPos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      const out = new Uint8Array(N * N * 4);
      gl.readPixels(0, 0, N, N, gl.RGBA, gl.UNSIGNED_BYTE, out);
      let lo = 255;
      let hi = 0;
      for (let i = 3; i < out.length; i += 4) {
        if (out[i] < lo) lo = out[i];
        if (out[i] > hi) hi = out[i];
      }

      return hi > 170 && lo < 90;
    } catch (_) {
      return false;
    }
  }

  function getRefinedMask(guide, softMask, vw, vh) {
    const tier = PERFORMANCE_TIERS[currentTier] || PERFORMANCE_TIERS.MID;
    if (!tier.refineMaxDim || !guide || !softMask) return null;
    if (!initRefine()) return null;

    try {
      if (gl.isContextLost && gl.isContextLost()) {
        glRefineAvailable = false;
        return null;
      }

      const w = Math.max(1, Math.round(Math.min(vw, tier.refineMaxDim)));
      const h = Math.max(1, Math.round((w * vh) / vw));
      if (glCanvas.width !== w || glCanvas.height !== h) {
        glCanvas.width = w;
        glCanvas.height = h;
      }

      gl.bindTexture(gl.TEXTURE_2D, glGuideTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, guide);
      gl.bindTexture(gl.TEXTURE_2D, glMaskTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, softMask);

      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(glProgram);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, glMaskTex);
      gl.uniform1i(glLoc.uMask, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, glGuideTex);
      gl.uniform1i(glLoc.uGuide, 1);

      const tapX = maskCanvas && maskCanvas.width ? 1 / maskCanvas.width : 1 / 256;
      const tapY = maskCanvas && maskCanvas.height ? 1 / maskCanvas.height : 1 / 256;
      gl.uniform2f(glLoc.uTap, tapX, tapY);
      gl.uniform1f(glLoc.uRangeInv, tier.refineRangeInv || 50);

      gl.bindBuffer(gl.ARRAY_BUFFER, glQuadBuf);
      gl.enableVertexAttribArray(glLoc.aPos);
      gl.vertexAttribPointer(glLoc.aPos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      return glCanvas;
    } catch (err) {
      glRefineAvailable = false;
      return null;
    }
  }

  function disposeRefine() {
    try {
      if (gl) {
        if (glMaskTex) gl.deleteTexture(glMaskTex);
        if (glGuideTex) gl.deleteTexture(glGuideTex);
        if (glQuadBuf) gl.deleteBuffer(glQuadBuf);
        if (glProgram) gl.deleteProgram(glProgram);
        const lose = gl.getExtension("WEBGL_lose_context");
        if (lose) lose.loseContext();
      }
    } catch (_) {}
    gl = null;
    glCanvas = null;
    glProgram = null;
    glMaskTex = null;
    glGuideTex = null;
    glQuadBuf = null;
    glLoc = null;
    glRefineAvailable = null;
  }

  function blurInto(ctx, canvas, src, w, h, radius) {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.globalCompositeOperation = "copy";
    ctx.filter = radius > 0 ? "blur(" + radius + "px)" : "none";
    ctx.drawImage(src, -radius, -radius, w + radius * 2, h + radius * 2);
    ctx.filter = "none";
    ctx.globalCompositeOperation = "source-over";
    return canvas;
  }

  function getFeatheredMask(vw, vh) {
    if (!maskCanvas || !maskCanvas.width) return null;

    const tier = PERFORMANCE_TIERS[currentTier] || PERFORMANCE_TIERS.MID;
    const radius = tier.featherPx || 0;
    if (!radius || !detectCanvasBlur()) return maskCanvas;

    try {
      if (!softMaskCanvas) {
        softMaskCanvas = document.createElement("canvas");
        softMaskCtx = softMaskCanvas.getContext("2d");
      }
      if (!softMaskCtx) return maskCanvas;

      let source = maskCanvas;
      const pre = tier.preFeatherPx || 0;
      if (pre > 0) {
        if (!preMaskCanvas) {
          preMaskCanvas = document.createElement("canvas");
          preMaskCtx = preMaskCanvas.getContext("2d");
        }
        if (preMaskCtx) {
          source = blurInto(preMaskCtx, preMaskCanvas, maskCanvas, maskCanvas.width, maskCanvas.height, pre);
        }
      }

      const w = Math.max(1, Math.min(vw, Math.round(maskCanvas.width * (tier.featherUpscale || 3))));
      const h = Math.max(1, Math.round((w * vh) / vw));
      return blurInto(softMaskCtx, softMaskCanvas, source, w, h, radius);
    } catch (_) {
      return maskCanvas;
    }
  }

  function getCutoutMask(guide, vw, vh) {
    if (!maskCanvas || !maskCanvas.width) return null;
    const refined = getRefinedMask(guide, maskCanvas, vw, vh);
    if (refined) return refined;
    return getFeatheredMask(vw, vh) || maskCanvas;
  }

  function resetCtx(ctx) {
    try {
      ctx.restore();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      if ("filter" in ctx) ctx.filter = "none";
    } catch (_) {}
  }
  function resetCompositeCtx() {
    resetCtx(compositeCtx);
  }

  function drawRawCameraFrame(video, vw, vh) {
    compositeCtx.globalCompositeOperation = "source-over";
    compositeCtx.drawImage(video, 0, 0, vw, vh);
  }

  let transmitCanvas = null;
  let transmitCtx = null;

  function ensureTransmitCanvas(width, height) {
    if (!transmitCanvas) {
      transmitCanvas = document.createElement("canvas");
      transmitCtx = transmitCanvas.getContext("2d", { alpha: false });
    }
    if (!transmitCtx) return false;
    if (transmitCanvas.width !== width || transmitCanvas.height !== height) {
      transmitCanvas.width = width;
      transmitCanvas.height = height;
    }
    return true;
  }

  function applyRetouchAndAR(ctx, video, vw, vh) {
    if (lastFaceResult && lastFaceResult.faceLandmarks && lastFaceResult.faceLandmarks.length > 0) {
      let retouchCfg = null;
      if (currentPortraitFilter !== "none" && PORTRAIT_RETOUCH_CONFIGS[currentPortraitFilter]) {
        retouchCfg = PORTRAIT_RETOUCH_CONFIGS[currentPortraitFilter];
      } else if (currentAR !== "none") {
        retouchCfg = AR_BEAUTY_CONFIG;
      }
      if (retouchCfg) {
        try {
          drawPortraitRetouch(ctx, lastFaceResult.faceLandmarks[0], retouchCfg, vw, vh, video);
        } catch (_retouchErr) {

          resetCtx(ctx);
        }
      }
    }

    if (currentAR !== "none" && lastFaceResult && lastFaceResult.faceLandmarks && lastFaceResult.faceLandmarks.length > 0) {
      const cfg = AR_CONFIGS[currentAR];
      const img = activeARElements[currentAR];
      if (cfg && img && img.complete && img.naturalWidth > 0) {
        try {
          drawAROverlay(ctx, lastFaceResult.faceLandmarks[0], img, cfg, vw, vh);
        } catch (_arErr) {

          resetCtx(ctx);
        }
      }
    }
  }

  function ensureForegroundCanvas(vw, vh) {
    if (!foregroundCanvas) {
      foregroundCanvas = document.createElement("canvas");
      foregroundCtx = foregroundCanvas.getContext("2d");
    }
    if (!foregroundCtx) return false;
    if (foregroundCanvas.width !== vw || foregroundCanvas.height !== vh) {
      foregroundCanvas.width = vw;
      foregroundCanvas.height = vh;
    }
    return true;
  }

  function renderRemoteCompositeFrame(video) {
    if (!video || video.readyState < 2) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    const wantRemoteBackground = isEnabled && !!activeBgImage && isRemoteMaskUsable();
    if (!wantRemoteBackground) {
      hasRemoteForegroundLayer = false;
      return;
    }

    if (!remotePersonCanvas) {
      remotePersonCanvas = document.createElement("canvas");
      remotePersonCtx = remotePersonCanvas.getContext("2d", { alpha: true });
    }
    if (remotePersonCanvas.width !== vw || remotePersonCanvas.height !== vh) {
      remotePersonCanvas.width = vw;
      remotePersonCanvas.height = vh;
    }
    if (!remoteForegroundCanvas) {
      remoteForegroundCanvas = document.createElement("canvas");
      remoteForegroundCtx = remoteForegroundCanvas.getContext("2d");
    }
    if (remoteForegroundCanvas.width !== vw || remoteForegroundCanvas.height !== vh) {
      remoteForegroundCanvas.width = vw;
      remoteForegroundCanvas.height = vh;
    }
    if (!remotePersonCtx || !remoteForegroundCtx) {
      hasRemoteForegroundLayer = false;
      return;
    }

    try {
      remotePersonCtx.globalCompositeOperation = "source-over";
      remotePersonCtx.clearRect(0, 0, vw, vh);
      remotePersonCtx.drawImage(video, 0, 0, vw, vh);

      remotePersonCtx.globalCompositeOperation = "destination-in";
      remotePersonCtx.drawImage(getRemoteFeatheredMask(vw, vh) || remoteMaskCanvas, 0, 0, vw, vh);
      remotePersonCtx.globalCompositeOperation = "source-over";

      remoteForegroundCtx.clearRect(0, 0, vw, vh);
      remoteForegroundCtx.globalCompositeOperation = "source-over";
      remoteForegroundCtx.drawImage(remotePersonCanvas, 0, 0);
      hasRemoteForegroundLayer = true;

    } catch (remoteCompErr) {
      hasRemoteForegroundLayer = false;
    }
  }

  function renderCompositeFrame(video) {
    if (!video || video.readyState < 2) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;
    ensureCanvasDimensions(vw, vh);
    if (!compositeCtx || !personCtx) return;

    const wantBackground = isEnabled && !!activeBgImage && isMaskUsable();
    let backgroundDrawn = false;
    hasForegroundLayer = false;

    if (wantBackground) {
      try {

        personCtx.globalCompositeOperation = "source-over";
        personCtx.clearRect(0, 0, vw, vh);
        personCtx.drawImage(video, 0, 0, vw, vh);

        personCtx.globalCompositeOperation = "destination-in";
        personCtx.drawImage(getCutoutMask(video, vw, vh) || maskCanvas, 0, 0, vw, vh);
        personCtx.globalCompositeOperation = "source-over";

        if (ensureForegroundCanvas(vw, vh)) {
          foregroundCtx.clearRect(0, 0, vw, vh);
          foregroundCtx.globalCompositeOperation = "source-over";
          foregroundCtx.drawImage(personCanvas, 0, 0);
          applyRetouchAndAR(foregroundCtx, video, vw, vh);
          hasForegroundLayer = true;
        }

        const fittedBg = getFittedBackground(localBgFitCache, activeBgImage, vw, vh);
        compositeCtx.globalCompositeOperation = "source-over";
        if (fittedBg) {
          compositeCtx.drawImage(fittedBg, 0, 0);
        } else {
          drawContainBackground(compositeCtx, activeBgImage, vw, vh);
          compositeCtx.globalCompositeOperation = "source-over";
        }
        compositeCtx.drawImage(hasForegroundLayer ? foregroundCanvas : personCanvas, 0, 0);
        backgroundDrawn = true;

        if (ensureTransmitCanvas(vw, vh)) {
          transmitCtx.globalCompositeOperation = "source-over";
          transmitCtx.drawImage(video, 0, 0, vw, vh);
          if (hasForegroundLayer) transmitCtx.drawImage(foregroundCanvas, 0, 0);
        }
      } catch (compErr) {

        resetCompositeCtx();
        backgroundDrawn = false;
        hasForegroundLayer = false;
      }
    }

    if (!backgroundDrawn) {
      drawRawCameraFrame(video, vw, vh);
      applyRetouchAndAR(compositeCtx, video, vw, vh);

      if (ensureTransmitCanvas(vw, vh)) {
        transmitCtx.globalCompositeOperation = "source-over";
        transmitCtx.drawImage(compositeCanvas, 0, 0);
      }
    }

    hasRenderedComposite = true;
  }

  let currentTier = isMobile ? "MID" : "HIGH";
  let inferenceTimes = [];
  let consecutiveSlowCount = 0;
  let inferenceCanvas = null;
  let inferenceCtx = null;

  let faceInferenceCanvas = null;
  let faceInferenceCtx = null;
  let lastFaceInferenceTime = 0;
  let lastFaceTimestamp = 0;
  let hasRenderedComposite = false;
  const FACE_INFERENCE_INTERVAL = 45;

  const PERFORMANCE_TIERS = {
    HIGH: { intervalMs: 33, scale: 1.0, maxDim: 256, faceIntervalMs: 40, renderIntervalMs: 0, preFeatherPx: 1, featherPx: 3, featherUpscale: 3, refineMaxDim: 1280, refineRangeInv: 90 },
    MID: { intervalMs: 60, scale: 0.5, maxDim: 192, faceIntervalMs: 60, renderIntervalMs: 33, preFeatherPx: 1, featherPx: 2.5, featherUpscale: 3, refineMaxDim: 720, refineRangeInv: 90 },
    LOW: { intervalMs: 100, scale: 0.25, maxDim: 128, faceIntervalMs: 90, renderIntervalMs: 50, preFeatherPx: 1, featherPx: 2, featherUpscale: 3, refineMaxDim: 480, refineRangeInv: 90 }
  };

  let lastCompositeRenderAt = 0;

  function computeInferenceSize(videoW, videoH, tier) {
    let w = Math.max(1, Math.floor(videoW * tier.scale));
    let h = Math.max(1, Math.floor(videoH * tier.scale));
    const longest = Math.max(w, h);
    if (longest > tier.maxDim) {
      const k = tier.maxDim / longest;
      w = Math.max(1, Math.round(w * k));
      h = Math.max(1, Math.round(h * k));
    }
    return { w: w, h: h };
  }

  function triggerFallback(reason) {
    console.warn("[LensBooth BG] Disabling background replacement:", reason || "device too slow");
    showLoadingState(false);
    inferenceTimes.length = 0;
    consecutiveSlowCount = 0;
    invalidMaskStreak = 0;
    hasMaskData = false;
    lastValidMaskAt = 0;
    BackgroundProcessor.setBackground("none");

    const toast = document.getElementById("lb-toast") || document.querySelector(".lb-toast");
    if (toast) {
      toast.textContent = "Background effects aren't available on this device";
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 3000);
    } else {
      alert("Background effects aren't available on this device");
    }
  }

  let inferenceFavorsRemote = false;

  function dispatchLocalSegmentation(now, tierCfg) {
    lastInferenceTime = now;
    isInferenceRunning = true;
    inferenceStartedAt = now;

    const timestamp = now;
    const inferenceStart = performance.now();

    try {

      if (!inferenceCanvas) {
        inferenceCanvas = document.createElement("canvas");
        inferenceCtx = inferenceCanvas.getContext("2d", { willReadFrequently: true });
      }
      const infSize = computeInferenceSize(targetVideo.videoWidth, targetVideo.videoHeight, tierCfg);
      if (inferenceCanvas.width !== infSize.w || inferenceCanvas.height !== infSize.h) {
        inferenceCanvas.width = infSize.w;
        inferenceCanvas.height = infSize.h;
      }
      inferenceCtx.drawImage(targetVideo, 0, 0, infSize.w, infSize.h);
      const inferenceSource = inferenceCanvas;

      imageSegmenter.segmentForVideo(inferenceSource, timestamp, (result) => {
        try {
          const duration = performance.now() - inferenceStart;

          inferenceTimes.push(duration);
          if (inferenceTimes.length > 10) inferenceTimes.shift();

          if (inferenceTimes.length === 10) {
            const avg = inferenceTimes.reduce((a, b) => a + b, 0) / 10;

            if (avg > 150) {
              consecutiveSlowCount++;
              if (consecutiveSlowCount > 20) {
                triggerFallback("inference too slow");
                return;
              }
            } else {
              consecutiveSlowCount = 0;
            }

            if (avg < 25 && currentTier !== "HIGH") {
              currentTier = "HIGH";
            } else if (avg >= 35 && avg < 60 && currentTier === "HIGH") {
              currentTier = "MID";
            } else if (avg >= 70 && currentTier !== "LOW") {
              currentTier = "LOW";
            }
          }

          let status = "empty";
          if (result && result.confidenceMasks && result.confidenceMasks.length > 0) {
            status = updateMaskCanvasFromConfidence(result.confidenceMasks[0]);
          } else if (result && result.categoryMask) {
            status = updateMaskCanvasFromConfidence(result.categoryMask);
          }

          if (status === "ok") {
            invalidMaskStreak = 0;
          } else if (status === "readback-failed" && !cpuRetryDone) {

            switchSegmenterToCpu();
          } else if (isEnabled && !segmentationProven) {

            invalidMaskStreak++;
            if (invalidMaskStreak >= MASK_RETRY_LIMIT && !cpuRetryDone) {
              switchSegmenterToCpu();
            } else if (invalidMaskStreak >= MASK_FAIL_LIMIT) {
              triggerFallback("segmentation never returned a usable mask");
              return;
            }
          }
        } catch (maskErr) {
          console.warn("[LensBooth BG] Mask processing error:", maskErr);
        } finally {
          isInferenceRunning = false;
        }
      });
    } catch (segErr) {
      isInferenceRunning = false;

      if (segErr && !/timestamp/i.test(segErr.message || "")) {
        console.warn("[LensBooth BG] segmentForVideo call failed:", segErr);
      }
    }
  }

  function dispatchRemoteSegmentation(now, tierCfg) {
    lastRemoteInferenceTime = now;
    isInferenceRunning = true;
    inferenceStartedAt = now;

    const timestamp = now;

    try {

      if (!inferenceCanvas) {
        inferenceCanvas = document.createElement("canvas");
        inferenceCtx = inferenceCanvas.getContext("2d", { willReadFrequently: true });
      }
      const infSize = computeInferenceSize(remoteVideo.videoWidth, remoteVideo.videoHeight, tierCfg);
      if (inferenceCanvas.width !== infSize.w || inferenceCanvas.height !== infSize.h) {
        inferenceCanvas.width = infSize.w;
        inferenceCanvas.height = infSize.h;
      }
      inferenceCtx.drawImage(remoteVideo, 0, 0, infSize.w, infSize.h);
      const inferenceSource = inferenceCanvas;

      imageSegmenter.segmentForVideo(inferenceSource, timestamp, (result) => {
        try {
          let status = "empty";
          if (result && result.confidenceMasks && result.confidenceMasks.length > 0) {
            status = updateRemoteMaskCanvasFromConfidence(result.confidenceMasks[0]);
          } else if (result && result.categoryMask) {
            status = updateRemoteMaskCanvasFromConfidence(result.categoryMask);
          }
          remoteInvalidMaskStreak = status === "ok" ? 0 : remoteInvalidMaskStreak + 1;
        } catch (maskErr) {
          console.warn("[LensBooth BG] Remote mask processing error:", maskErr);
        } finally {
          isInferenceRunning = false;
        }
      });
    } catch (segErr) {
      isInferenceRunning = false;
      if (segErr && !/timestamp/i.test(segErr.message || "")) {
        console.warn("[LensBooth BG] Remote segmentForVideo call failed:", segErr);
      }
    }
  }

  function startInferenceLoop() {
    if (inferenceLoopId) return;

    function step(now) {
      try {
        stepBody(now);
      } catch (loopErr) {

        console.warn("[LensBooth BG] Frame step failed, continuing:", loopErr);
      }
      if (inferenceLoopId !== null) {
        inferenceLoopId = requestAnimationFrame(step);
      }
    }

    function stepBody(now) {
      if (!targetVideo) {
        targetVideo = document.getElementById("main-video");
      }

      if ((!isEnabled && currentAR === "none" && currentPortraitFilter === "none") || hasError) {
        stopInferenceLoop();
        syncSharedBoothMode();
        return;
      }

      if (!targetVideo) return;

      if (
        (currentAR !== "none" || currentPortraitFilter !== "none") &&
        faceLandmarker &&
        targetVideo.readyState >= 2 &&
        targetVideo.videoWidth > 0 &&
        !targetVideo.paused
      ) {
        const faceInterval =
          (PERFORMANCE_TIERS[currentTier] && PERFORMANCE_TIERS[currentTier].faceIntervalMs) ||
          FACE_INFERENCE_INTERVAL;
        if (now - lastFaceInferenceTime >= faceInterval) {
          lastFaceInferenceTime = now;
          if (!faceInferenceCanvas) {
            faceInferenceCanvas = document.createElement("canvas");
            faceInferenceCtx = faceInferenceCanvas.getContext("2d", { willReadFrequently: true });
          }

          const maxDim = 360;
          const aspect = targetVideo.videoWidth / targetVideo.videoHeight;
          const fw = targetVideo.videoWidth > maxDim ? maxDim : targetVideo.videoWidth;
          const fh = Math.max(1, Math.round(fw / aspect));
          if (faceInferenceCanvas.width !== fw || faceInferenceCanvas.height !== fh) {
            faceInferenceCanvas.width = fw;
            faceInferenceCanvas.height = fh;
          }
          faceInferenceCtx.drawImage(targetVideo, 0, 0, fw, fh);

          const currentPerfTime = performance.now();
          const safeFaceTimestamp = Math.max(currentPerfTime, (lastFaceTimestamp || 0) + 1);
          lastFaceTimestamp = safeFaceTimestamp;
          try {
            const res = faceLandmarker.detectForVideo(faceInferenceCanvas, safeFaceTimestamp);
            if (res) lastFaceResult = res;
          } catch (_) {

          }
        }
      }

      const tierCfg = PERFORMANCE_TIERS[currentTier];
      const targetInterval = tierCfg.intervalMs;

      if (isInferenceRunning && now - inferenceStartedAt > INFERENCE_WATCHDOG_MS) {
        isInferenceRunning = false;
      }

      const localDue =
        isEnabled &&
        imageSegmenter &&
        now - lastInferenceTime >= targetInterval &&
        targetVideo.readyState >= 2 &&
        targetVideo.videoWidth > 0 &&
        !targetVideo.paused;

      const remoteDue =
        isEnabled &&
        imageSegmenter &&
        !!activeBgImage &&
        !!remoteVideo &&
        remoteInvalidMaskStreak < REMOTE_MASK_FAIL_LIMIT &&
        now - lastRemoteInferenceTime >= targetInterval &&
        remoteVideo.readyState >= 2 &&
        remoteVideo.videoWidth > 0 &&
        !remoteVideo.paused;

      if (!isInferenceRunning && remoteDue && inferenceFavorsRemote) {
        dispatchRemoteSegmentation(now, tierCfg);
        inferenceFavorsRemote = false;
      } else if (!isInferenceRunning && localDue) {
        dispatchLocalSegmentation(now, tierCfg);
        inferenceFavorsRemote = true;
      } else if (!isInferenceRunning && remoteDue) {
        dispatchRemoteSegmentation(now, tierCfg);
      }

      const renderInterval = tierCfg.renderIntervalMs || 0;
      if (!renderInterval || now - lastCompositeRenderAt >= renderInterval) {
        lastCompositeRenderAt = now;
        renderCompositeFrame(targetVideo);
      }
      if (remoteVideo && isEnabled && activeBgImage) {
        renderRemoteCompositeFrame(remoteVideo);
      }

      syncSharedBoothMode();
    }

    inferenceLoopId = requestAnimationFrame(step);
  }

  function stopInferenceLoop() {
    if (inferenceLoopId !== null && inferenceLoopId !== -1) {
      cancelAnimationFrame(inferenceLoopId);
    }
    inferenceLoopId = null;
    isInferenceRunning = false;
    hasRenderedComposite = false;
  }

  let portraitReqToken = 0;

  let lastSharedBoothMode = null;
  let lastSharedBoothSource = null;
  let processedCaptureStream = null;
  let processedCaptureTrack = null;
  let processedCaptureCanvas = null;

  function releaseProcessedCapture() {
    if (processedCaptureStream) {
      try {
        processedCaptureStream.getTracks().forEach(function (t) { t.stop(); });
      } catch (_) {}
    }
    processedCaptureStream = null;
    processedCaptureTrack = null;
    processedCaptureCanvas = null;
  }

  function getProcessedCaptureTrack() {

    const source = transmitCanvas;
    if (!source || typeof source.captureStream !== "function") return null;
    if (
      processedCaptureTrack &&
      processedCaptureCanvas === source &&
      processedCaptureTrack.readyState === "live"
    ) {
      return processedCaptureTrack;
    }
    releaseProcessedCapture();
    try {
      processedCaptureStream = source.captureStream(isMobile ? 24 : 30);
      processedCaptureTrack = processedCaptureStream.getVideoTracks()[0] || null;
      processedCaptureCanvas = source;
    } catch (capErr) {
      console.warn("[LensBooth BG] Canvas captureStream unavailable:", capErr);
      releaseProcessedCapture();
    }
    return processedCaptureTrack;
  }

  function applySharedBoothStream(mode, rawStream) {
    if (mode === "processed") {
      const track = getProcessedCaptureTrack();
      if (track) {

        const combined = new MediaStream();
        combined.addTrack(track);
        rawStream.getAudioTracks().forEach(function (a) { combined.addTrack(a); });
        window.sharedModule.updateStream(combined);
        lastSharedBoothMode = "processed";
        lastSharedBoothSource = rawStream;
        return;
      }

      mode = "raw";
    }
    window.sharedModule.updateStream(rawStream);
    lastSharedBoothMode = "raw";
    lastSharedBoothSource = rawStream;
  }

  function syncSharedBoothMode() {
    try {
      if (!window.sharedModule || typeof window.sharedModule.updateStream !== "function") return;
      const video = targetVideo || document.getElementById("main-video");
      const rawStream = video ? video.srcObject : null;
      if (!rawStream) return;

      const mode = BackgroundProcessor.isActive() ? "processed" : "raw";
      if (mode === lastSharedBoothMode && rawStream === lastSharedBoothSource) return;

      applySharedBoothStream(mode, rawStream);
    } catch (e) {
      console.warn("[LensBooth BG] Shared Booth stream update failed gracefully:", e);
    }
  }

  const BackgroundProcessor = {

    attachVideo(videoEl) {
      targetVideo = videoEl;
    },

    attachRemoteVideo(videoEl) {
      remoteVideo = videoEl || null;
      if (!remoteVideo) {
        remoteHasMaskData = false;
        remoteInvalidMaskStreak = 0;
        hasRemoteForegroundLayer = false;
      }
    },

    async setPortraitFilter(filterName) {
      const name = (filterName || "none").toLowerCase();
      const currentToken = ++portraitReqToken;

      if (PORTRAIT_RETOUCH_CONFIGS[name]) {
        currentPortraitFilter = name;
        currentAR = "none";
        if (!targetVideo) targetVideo = document.getElementById("main-video");

        if (isARInitialized && faceLandmarker) {
          startInferenceLoop();
          this.notifySharedBooth();
        } else {

          initializeAR().then((ready) => {
            if (currentToken === portraitReqToken && currentPortraitFilter === name && ready) {
              startInferenceLoop();
              BackgroundProcessor.notifySharedBooth();
            }
          });
        }
      } else {
        currentPortraitFilter = "none";
        if (!isEnabled && currentAR === "none") {
          stopInferenceLoop();
        }
        this.notifySharedBooth();
      }
    },

    async setAR(arName) {
      const cleanName = arName || 'none';
      currentAR = cleanName;
      if (cleanName !== 'none') currentPortraitFilter = 'none';
      if (cleanName === 'none') {
        if (!isEnabled && currentPortraitFilter === 'none') stopInferenceLoop();
        this.notifySharedBooth();
        return;
      }

      const needsInit = !isARInitialized || !faceLandmarker;
      const needsImg = !activeARElements[cleanName];
      if (needsInit || needsImg) {
        showLoadingState(true, 'Preparing AR effect...');
        const imgPromise = loadARImage(cleanName);
        const arPromise = needsInit ? initializeAR() : Promise.resolve(true);
        await Promise.all([imgPromise, arPromise]);
        showLoadingState(false);
      }
      if (!targetVideo) targetVideo = document.getElementById('main-video');
      startInferenceLoop();
      this.notifySharedBooth();
    },
    async setBackground(bgFilename) {
      const cleanName = bgFilename || "none";
      if (cleanName !== "none") {
        const isNormalActive = (typeof window.isNormalFilterActive === "function" && window.isNormalFilterActive()) ||
          (window.LensBoothCurrentFilter && window.LensBoothCurrentFilter !== "none") ||
          (currentPortraitFilter && currentPortraitFilter !== "none");
        if (isNormalActive) {
          if (typeof window.showARBackgroundRestrictionToast === "function") {
            window.showARBackgroundRestrictionToast("use");
          }
          return;
        }
      }
      currentBgName = cleanName;
      window.LensBoothBgState = window.LensBoothBgState || {};
      window.LensBoothBgState.selectedBackground = cleanName;

      if (cleanName === "none") {
        isEnabled = false;
        activeBgImage = null;
        hasMaskData = false;
        lastValidMaskAt = 0;
        invalidMaskStreak = 0;
        if (currentAR === 'none' && currentPortraitFilter === 'none') stopInferenceLoop();
        showLoadingState(false);
        this.notifySharedBooth();
        return;
      }

      isEnabled = true;
      invalidMaskStreak = 0;
      showLoadingState(true, "Preparing background...");

      const imgPromise = loadBackgroundImage(cleanName);

      if (!isInitialized) {
        const success = await initializeSegmenter();

        if (currentBgName !== cleanName) return;
        if (!success) {

          isEnabled = false;
          activeBgImage = null;
          this.notifySharedBooth();
          return;
        }
      }

      const loadedBg = await imgPromise;
      if (currentBgName !== cleanName) return;
      if (!loadedBg) {

        isEnabled = false;
        activeBgImage = null;
        showLoadingState(false);
        this.notifySharedBooth();
        return;
      }
      activeBgImage = loadedBg;
      showLoadingState(false);

      if (!targetVideo) {
        targetVideo = document.getElementById("main-video");
      }

      startInferenceLoop();
      this.notifySharedBooth();
    },

    isActive() {
      if (hasError) return false;
      if (!compositeCanvas || !hasRenderedComposite) return false;
      const bgActive = isEnabled && isInitialized && !!activeBgImage;
      const arActive = currentAR !== "none" && isARInitialized && !!faceLandmarker;
      const portraitActive = currentPortraitFilter !== "none" && isARInitialized && !!faceLandmarker;
      return bgActive || arActive || portraitActive;
    },

    isBackgroundActive() {
      if (hasError) return false;
      if (!compositeCanvas || !hasRenderedComposite) return false;
      return isEnabled && isInitialized && !!activeBgImage;
    },

    getBackgroundLayerCanvas() {
      if (!this.isBackgroundActive()) return null;
      return localBgFitCache.canvas || null;
    },

    getForegroundLayerCanvas() {
      if (!this.isBackgroundActive()) return null;
      return hasForegroundLayer ? foregroundCanvas : null;
    },

    getRemoteBackgroundLayerCanvas() {
      if (!remoteVideo || !isEnabled || !activeBgImage || !hasRemoteForegroundLayer) return null;
      return remoteBgFitCache.canvas || null;
    },
    getRemoteForegroundLayerCanvas() {
      if (!remoteVideo || !isEnabled || !activeBgImage || !hasRemoteForegroundLayer) return null;
      return remoteForegroundCanvas || null;
    },

    getCombinedBackgroundLayerCanvas(fullW, fullH) {
      if (!isEnabled || !activeBgImage) return null;
      return buildCombinedBackgroundLayer(fullW, fullH);
    },

    getOutputCanvas() {
      if (this.isActive() && compositeCanvas) {
        return compositeCanvas;
      }
      return targetVideo || document.getElementById("main-video");
    },

    getCaptureCanvas() {
      if (this.isActive() && compositeCanvas) {
        return compositeCanvas;
      }
      return targetVideo || document.getElementById("main-video");
    },

    notifySharedBooth() {
      syncSharedBoothMode();
    },

    getDiagnostics() {
      const avgInference = inferenceTimes.length
        ? inferenceTimes.reduce(function (a, b) { return a + b; }, 0) / inferenceTimes.length
        : 0;
      const infSize = targetVideo && targetVideo.videoWidth
        ? computeInferenceSize(targetVideo.videoWidth, targetVideo.videoHeight, PERFORMANCE_TIERS[currentTier])
        : null;
      return {
        tier: currentTier,
        loopRunning: inferenceLoopId !== null,
        inferenceInFlight: isInferenceRunning,
        avgInferenceMs: Math.round(avgInference * 10) / 10,
        inferenceSize: infSize ? infSize.w + "x" + infSize.h : null,
        videoSize: targetVideo ? targetVideo.videoWidth + "x" + targetVideo.videoHeight : null,
        videoReadyState: targetVideo ? targetVideo.readyState : null,
        canvasSize: compositeCanvas ? compositeCanvas.width + "x" + compositeCanvas.height : null,
        maskSize: maskCanvas ? maskCanvas.width + "x" + maskCanvas.height : null,
        maskUsable: isMaskUsable(),
        maskAgeMs: lastValidMaskAt ? Math.round(performance.now() - lastValidMaskAt) : null,
        maskStaleLimitMs: Math.round(maskStaleLimitMs(isEnabled && !!activeBgImage && !!remoteVideo)),
        remoteMaskStaleLimitMs: Math.round(maskStaleLimitMs(true)),
        canvasBlurSupported: detectCanvasBlur(),
        softMaskSize: softMaskCanvas ? softMaskCanvas.width + "x" + softMaskCanvas.height : null,
        edgeAwareRefine: glRefineAvailable === true,
        refinedMaskSize: glCanvas ? glCanvas.width + "x" + glCanvas.height : null,
        invalidMaskStreak: invalidMaskStreak,
        segmentationProven: segmentationProven,
        delegate: segmenterDelegate,
        cpuRetryDone: cpuRetryDone,
        floatReadbackSupported: supportsFloatMaskReadback(),
        segmenterReady: isInitialized && !!imageSegmenter,
        faceLandmarkerReady: isARInitialized && !!faceLandmarker,
        background: currentBgName,
        backgroundFit: localBgFitCache.canvas ? localBgFitCache.canvas.width + "x" + localBgFitCache.canvas.height : null,
        transmitCanvasSize: transmitCanvas ? transmitCanvas.width + "x" + transmitCanvas.height : null,
        foregroundLayerActive: hasForegroundLayer,
        remoteVideoAttached: !!remoteVideo,
        remoteForegroundLayerActive: hasRemoteForegroundLayer,
        remoteMaskUsable: isRemoteMaskUsable(),
        remoteInvalidMaskStreak: remoteInvalidMaskStreak,
        ar: currentAR,
        portraitFilter: currentPortraitFilter,
        hasError: hasError,
        errorMessage: errorMessage,
        outputIsComposite: this.isActive(),
        sharedBoothMode: lastSharedBoothMode
      };
    },

    dispose() {
      stopInferenceLoop();
      isEnabled = false;
      isInitialized = false;
      if (imageSegmenter && typeof imageSegmenter.close === "function") {
        try { imageSegmenter.close(); } catch (_) {}
      }
      imageSegmenter = null;
      if (faceLandmarker && typeof faceLandmarker.close === 'function') { try { faceLandmarker.close(); } catch(_) {} }
      faceLandmarker = null;
      isARInitialized = false;
      currentAR = 'none';
      segmentationProven = false;
      segmenterDelegate = null;
      cpuRetryDone = false;
      lastCompositeRenderAt = 0;
      bgImageCache.clear();
      releaseProcessedCapture();
      lastSharedBoothMode = null;
      lastSharedBoothSource = null;
      hasMaskData = false;
      lastValidMaskAt = 0;
      invalidMaskStreak = 0;
      hasRenderedComposite = false;
      retouchCanvas = null;
      retouchCtx = null;
      retouchMaskCanvas = null;
      retouchMaskCtx = null;
      softMaskCanvas = null;
      softMaskCtx = null;
      preMaskCanvas = null;
      preMaskCtx = null;
      localBgFitCache.canvas = null;
      localBgFitCache.ctx = null;
      localBgFitCache.key = "";
      remoteBgFitCache.canvas = null;
      remoteBgFitCache.ctx = null;
      remoteBgFitCache.key = "";
      combinedBgFitCache.canvas = null;
      combinedBgFitCache.ctx = null;
      combinedBgFitCache.key = "";
      foregroundCanvas = null;
      foregroundCtx = null;
      hasForegroundLayer = false;
      transmitCanvas = null;
      transmitCtx = null;
      remoteVideo = null;
      remoteMaskCanvas = null;
      remoteMaskCtx = null;
      remoteMaskImageData = null;
      remoteMaskU32View = null;
      remotePrevConfidenceBuffer = null;
      remoteHasMaskData = false;
      remoteLastValidMaskAt = 0;
      remoteInvalidMaskStreak = 0;
      remotePersonCanvas = null;
      remotePersonCtx = null;
      remoteForegroundCanvas = null;
      remoteForegroundCtx = null;
      hasRemoteForegroundLayer = false;
      remoteSoftMaskCanvas = null;
      remoteSoftMaskCtx = null;
      remotePreMaskCanvas = null;
      remotePreMaskCtx = null;
      lastRemoteInferenceTime = 0;
      inferenceFavorsRemote = false;
      disposeRefine();
    }
  };

  window.LensBoothBackgroundProcessor = BackgroundProcessor;
  window.ConstBoothBackgroundProcessor = BackgroundProcessor;

  function initAutoAttach() {
    const v = document.getElementById("main-video");
    if (v) BackgroundProcessor.attachVideo(v);
    const activeBtn = document.querySelector("#filter-scroll .filter.active, #maximized-filter-scroll .filter.active");
    const f = activeBtn ? activeBtn.getAttribute("data-filter") : null;
    if (f && PORTRAIT_RETOUCH_CONFIGS[f]) {
      BackgroundProcessor.setPortraitFilter(f);
    }

    if (!isARInitialized && !arInitPromise) {
      setTimeout(() => initializeAR(), 300);
    }

    const preloadARImages = () => {
      Object.keys(AR_CONFIGS).forEach(name => loadARImage(name));
    };
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(preloadARImages, { timeout: 6000 });
    } else {
      setTimeout(preloadARImages, 4000);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAutoAttach);
  } else {
    initAutoAttach();
  }
})();
