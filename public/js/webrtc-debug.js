
(function () {
  "use strict";

  
  
  if (window.LBRTC && window.LBRTC.__version) return;

  var VERSION = 1;

  function readFlag() {
    try {
      if (window.DEBUG_WEBRTC === true) return true;
      var qs = new URLSearchParams(window.location.search);
      var q = qs.get("debugwebrtc");
      if (q === "1") {
        try { sessionStorage.setItem("lb_debug_webrtc", "1"); } catch (_e) {}
        return true;
      }
      if (q === "0") {
        try { sessionStorage.removeItem("lb_debug_webrtc"); } catch (_e) {}
        return false;
      }
      if (sessionStorage.getItem("lb_debug_webrtc") === "1") return true;
    } catch (_e) {}
    return false;
  }

  var enabled = readFlag();

  
  
  var RING = [];
  var RING_MAX = 400;
  var t0 = (window.performance && performance.now) ? performance.now() : 0;

  function stamp() {
    var now = (window.performance && performance.now) ? performance.now() : 0;
    return ((now - t0) / 1000).toFixed(2) + "s";
  }

  function emit(method, tag, msg, data) {
    if (!enabled) return;
    var line = "[LB-RTC " + stamp() + "] " + tag + " " + msg;
    RING.push(data === undefined ? line : line + " " + safeJson(data));
    if (RING.length > RING_MAX) RING.shift();
    try {
      if (data === undefined) console[method](line);
      else console[method](line, data);
    } catch (_e) {}
  }

  function safeJson(v) {
    try { return JSON.stringify(v); } catch (_e) { return String(v); }
  }

  var LBRTC = {
    __version: VERSION,

    get enabled() { return enabled; },

    enable: function () {
      try { sessionStorage.setItem("lb_debug_webrtc", "1"); } catch (_e) {}
      enabled = true;
      emit("log", "[init]", "diagnostics enabled (reload for full coverage)");
      return true;
    },

    disable: function () {
      try { sessionStorage.removeItem("lb_debug_webrtc"); } catch (_e) {}
      enabled = false;
      return false;
    },

    log:   function (tag, msg, data) { emit("log", tag, msg, data); },
    warn:  function (tag, msg, data) { emit("warn", tag, msg, data); },
    error: function (tag, msg, data) { emit("error", tag, msg, data); },

    
    event: function (name, data) { emit("log", "[event]", name, data); },

    dump: function () { return RING.slice(); },

    
    report: function () {
      var text = RING.join("\n");
      try { console.log(text); } catch (_e) {}
      return text;
    }
  };

  
  
  

  
  LBRTC.attach = function (pc, meta) {
    if (pc) { LBRTC.lastPC = pc; window.__lbPeerConnection = pc; }
    if (!enabled || !pc || pc.__lbDbgAttached) return pc;
    pc.__lbDbgAttached = true;

    var info = meta || {};
    var counts = { host: 0, srflx: 0, prflx: 0, relay: 0, total: 0, remote: 0 };
    pc.__lbDbgCounts = counts;

    emit("log", "[new]", "peer connection created", {
      isHost: !!info.isHost,
      relayOnlyTier: !!info.relay,
      iceTransportPolicy: (pc.getConfiguration && (pc.getConfiguration().iceTransportPolicy || "all")) || "?",
      iceServers: (function () {
        try {
          return (pc.getConfiguration().iceServers || []).map(function (s) {
            var u = Array.isArray(s.urls) ? s.urls : [s.urls];
            
            
            return u.join("|") + (s.username ? " (auth)" : "");
          });
        } catch (_e) { return "?"; }
      })()
    });

    
    
    
    pc.addEventListener("connectionstatechange", function () {
      emit("log", "[conn]", pc.connectionState);
      if (pc.connectionState === "connected") LBRTC.selectedPair(pc, "connected");
      if (pc.connectionState === "failed") {
        emit("error", "[conn]", "FAILED - candidate summary", counts);
        if (counts.relay === 0) {
          emit("error", "[conn]",
            "No relay candidates were ever gathered. TURN is unreachable, " +
            "unauthenticated, or out of quota - this connection could never " +
            "have worked behind symmetric NAT.");
        }
      }
    });
    pc.addEventListener("iceconnectionstatechange", function () {
      emit("log", "[ice]", pc.iceConnectionState);
    });
    pc.addEventListener("icegatheringstatechange", function () {
      emit("log", "[gathering]", pc.iceGatheringState, pc.iceGatheringState === "complete" ? counts : undefined);
    });
    pc.addEventListener("signalingstatechange", function () {
      emit("log", "[signaling]", pc.signalingState);
    });

    
    pc.addEventListener("icecandidate", function (ev) {
      if (!ev.candidate) {
        emit("log", "[cand]", "end-of-candidates (gathering complete)", counts);
        return;
      }
      var c = ev.candidate;
      var type = c.type || (String(c.candidate).match(/ typ (\w+)/) || [])[1] || "?";
      counts.total++;
      if (counts[type] !== undefined) counts[type]++;
      emit("log", "[cand]", "local " + type + " " + (c.protocol || "?") +
        (c.relatedAddress ? " via " + c.relatedAddress : "") +
        (type === "relay" ? "  ← TURN RELAY OK" : ""));
    });

    pc.addEventListener("track", function (ev) {
      emit("log", "[track]", "remote track", { kind: ev.track && ev.track.kind, id: ev.track && ev.track.id });
    });

    
    
    
    wrap(pc, "setLocalDescription", function (args, ok) {
      var d = args[0] || pc.localDescription;
      emit("log", "[sdp]", (ok ? "localDescription SET: " : "localDescription FAILED: ") + (d && d.type));
    });
    wrap(pc, "setRemoteDescription", function (args, ok) {
      var d = args[0];
      emit("log", "[sdp]", (ok ? "remoteDescription SET: " : "remoteDescription FAILED: ") + (d && d.type));
    });
    wrap(pc, "createOffer", function (_a, ok) { emit("log", "[sdp]", ok ? "offer created" : "createOffer FAILED"); });
    wrap(pc, "createAnswer", function (_a, ok) { emit("log", "[sdp]", ok ? "answer created" : "createAnswer FAILED"); });

    if (typeof pc.restartIce === "function") {
      var origRestart = pc.restartIce.bind(pc);
      pc.restartIce = function () {
        emit("warn", "[ice]", "restartIce() - re-gathering on the existing connection");
        return origRestart();
      };
    }

    
    var timer = setInterval(function () {
      if (!pc || pc.connectionState === "closed" || pc.signalingState === "closed") {
        clearInterval(timer);
        emit("log", "[close]", "peer connection closed", counts);
        return;
      }
      if (pc.connectionState === "connected") LBRTC.selectedPair(pc, "sample");
    }, 5000);
    pc.__lbDbgTimer = timer;

    return pc;
  };

  function wrap(pc, name, onSettle) {
    if (typeof pc[name] !== "function") return;
    var orig = pc[name].bind(pc);
    pc[name] = function () {
      var args = arguments;
      var p;
      try { p = orig.apply(null, args); } catch (e) { onSettle(args, false); throw e; }
      if (!p || typeof p.then !== "function") { onSettle(args, true); return p; }
      return p.then(
        function (r) { onSettle(args, true); return r; },
        function (e) { onSettle(args, false); throw e; }
      );
    };
  }

  
  LBRTC.getVideoStats = function (pc) {
    pc = pc || window.__lbPeerConnection || LBRTC.lastPC;
    if (!pc || typeof pc.getStats !== "function") {
      return Promise.resolve(null);
    }
    return pc.getStats().then(function (stats) {
      var byId = {}, pair = null, outbound = null, inbound = null, remoteInbound = null;
      stats.forEach(function (r) {
        if (r.type === "local-candidate" || r.type === "remote-candidate") byId[r.id] = r;
        if (r.type === "candidate-pair" && (r.selected || (r.nominated && r.state === "succeeded"))) pair = r;
        if (r.type === "outbound-rtp" && (r.kind === "video" || r.mediaType === "video")) outbound = r;
        if (r.type === "inbound-rtp" && (r.kind === "video" || r.mediaType === "video")) inbound = r;
        if (r.type === "remote-inbound-rtp" && (r.kind === "video" || r.mediaType === "video")) remoteInbound = r;
      });

      var L = pair ? (byId[pair.localCandidateId] || {}) : {};
      var R = pair ? (byId[pair.remoteCandidateId] || {}) : {};

      var prev = pc.__lbLastStatsSample || {};
      var now = (window.performance && performance.now) ? performance.now() : Date.now();
      var dt = prev.time ? (now - prev.time) / 1000 : 1;
      if (dt <= 0) dt = 1;

      var outboundBitrate = null;
      if (outbound && outbound.bytesSent != null) {
        if (prev.outboundBytesSent != null && outbound.bytesSent >= prev.outboundBytesSent) {
          outboundBitrate = Math.round(((outbound.bytesSent - prev.outboundBytesSent) * 8) / dt);
        } else if (outbound.targetBitrate != null) {
          outboundBitrate = Math.round(outbound.targetBitrate);
        }
      }

      var inboundBitrate = null;
      if (inbound && inbound.bytesReceived != null && prev.inboundBytesReceived != null && inbound.bytesReceived >= prev.inboundBytesReceived) {
        inboundBitrate = Math.round(((inbound.bytesReceived - prev.inboundBytesReceived) * 8) / dt);
      }

      pc.__lbLastStatsSample = {
        time: now,
        outboundBytesSent: outbound ? outbound.bytesSent : null,
        inboundBytesReceived: inbound ? inbound.bytesReceived : null
      };

      var res = {
        connectionState: pc.connectionState || "unknown",
        iceConnectionState: pc.iceConnectionState || "unknown",
        signalingState: pc.signalingState || "unknown",
        selectedCandidatePair: pair ? {
          localType: L.candidateType || "unknown",
          remoteType: R.candidateType || "unknown",
          protocol: L.protocol || "unknown",
          usingRelay: L.candidateType === "relay" || R.candidateType === "relay"
        } : null,
        rtt: pair && pair.currentRoundTripTime != null ? Math.round(pair.currentRoundTripTime * 1000) : (remoteInbound && remoteInbound.roundTripTime != null ? Math.round(remoteInbound.roundTripTime * 1000) : null),
        availableOutgoingBitrate: pair && pair.availableOutgoingBitrate ? Math.round(pair.availableOutgoingBitrate) : null,
        availableIncomingBitrate: pair && pair.availableIncomingBitrate ? Math.round(pair.availableIncomingBitrate) : null,
        outbound: outbound ? {
          frameWidth: outbound.frameWidth || null,
          frameHeight: outbound.frameHeight || null,
          framesPerSecond: outbound.framesPerSecond != null ? Math.round(outbound.framesPerSecond) : null,
          bitrate: outboundBitrate,
          packetsSent: outbound.packetsSent != null ? outbound.packetsSent : null,
          packetsLost: remoteInbound && remoteInbound.packetsLost != null ? remoteInbound.packetsLost : null,
          fractionLost: remoteInbound && remoteInbound.fractionLost != null ? remoteInbound.fractionLost : null,
          qualityLimitationReason: outbound.qualityLimitationReason || "none",
          qualityLimitationResolutionChanges: outbound.qualityLimitationResolutionChanges || 0
        } : null,
        inbound: inbound ? {
          frameWidth: inbound.frameWidth || null,
          frameHeight: inbound.frameHeight || null,
          framesPerSecond: inbound.framesPerSecond != null ? Math.round(inbound.framesPerSecond) : null,
          bitrate: inboundBitrate,
          packetsLost: inbound.packetsLost != null ? inbound.packetsLost : null,
          jitter: inbound.jitter != null ? Number(inbound.jitter.toFixed(4)) : null,
          framesDropped: inbound.framesDropped != null ? inbound.framesDropped : null
        } : null
      };

      return res;
    }).catch(function (e) {
      return null;
    });
  };

  LBRTC.logStats = async function (pc) {
    var stats = await LBRTC.getVideoStats(pc);
    if (!stats) {
      console.warn("[LB-RTC] No active WebRTC connection or stats available.");
      return null;
    }
    console.log("=== LENSBOOTH WEBRTC STATS ===");
    console.table({
      "Connection State": stats.connectionState,
      "ICE / Selected Pair": (stats.selectedCandidatePair ? (stats.selectedCandidatePair.localType + " -> " + stats.selectedCandidatePair.remoteType + (stats.selectedCandidatePair.usingRelay ? " (RELAY)" : " (DIRECT)")) : "N/A"),
      "Round Trip Time (RTT)": (stats.rtt != null ? stats.rtt + " ms" : "N/A"),
      "Available Out Bitrate": (stats.availableOutgoingBitrate != null ? Math.round(stats.availableOutgoingBitrate / 1000) + " kbps" : "N/A"),
      "Outbound Video": (stats.outbound ? (stats.outbound.frameWidth + "x" + stats.outbound.frameHeight + " @" + stats.outbound.framesPerSecond + "fps | " + (stats.outbound.bitrate ? Math.round(stats.outbound.bitrate / 1000) + " kbps" : "N/A")) : "N/A"),
      "Outbound Quality Limitation": (stats.outbound ? stats.outbound.qualityLimitationReason : "N/A"),
      "Inbound Video": (stats.inbound ? (stats.inbound.frameWidth + "x" + stats.inbound.frameHeight + " @" + stats.inbound.framesPerSecond + "fps | " + (stats.inbound.bitrate ? Math.round(stats.inbound.bitrate / 1000) + " kbps" : "N/A")) : "N/A"),
      "Inbound Jitter": (stats.inbound && stats.inbound.jitter != null ? (stats.inbound.jitter * 1000).toFixed(1) + " ms" : "N/A"),
      "Inbound Packets Lost": (stats.inbound && stats.inbound.packetsLost != null ? stats.inbound.packetsLost : "0")
    });
    return stats;
  };

  LBRTC.selectedPair = function (pc, label) {
    if (!enabled || !pc || typeof pc.getStats !== "function") return;
    pc.getStats().then(function (stats) {
      var byId = {}, pair = null;
      stats.forEach(function (r) {
        if (r.type === "local-candidate" || r.type === "remote-candidate") byId[r.id] = r;
      });
      stats.forEach(function (r) {
        if (r.type !== "candidate-pair") return;
        
        if (r.selected || (r.nominated && r.state === "succeeded")) pair = r;
      });
      if (!pair) { emit("warn", "[pair]", label + ": no selected candidate pair yet"); return; }

      var L = byId[pair.localCandidateId] || {};
      var R = byId[pair.remoteCandidateId] || {};
      var usingTurn = L.candidateType === "relay" || R.candidateType === "relay";

      emit(usingTurn ? "warn" : "log", "[pair]", label, {
        local: L.candidateType + "/" + (L.protocol || "?") + (L.relayProtocol ? "(" + L.relayProtocol + ")" : ""),
        remote: R.candidateType + "/" + (R.protocol || "?"),
        usingTURN: usingTurn,
        usingRelay: usingTurn,
        rttMs: pair.currentRoundTripTime != null ? Math.round(pair.currentRoundTripTime * 1000) : null,
        availableOutgoingKbps: pair.availableOutgoingBitrate ? Math.round(pair.availableOutgoingBitrate / 1000) : null,
        bytesSent: pair.bytesSent,
        bytesReceived: pair.bytesReceived
      });

      LBRTC.getVideoStats(pc).then(function (vStats) {
        if (!vStats) return;
        if (vStats.outbound || vStats.inbound) {
          emit("log", "[video-stats]", label, {
            rttMs: vStats.rtt,
            outbound: vStats.outbound ? {
              res: (vStats.outbound.frameWidth || "?") + "x" + (vStats.outbound.frameHeight || "?"),
              fps: vStats.outbound.framesPerSecond,
              kbps: vStats.outbound.bitrate ? Math.round(vStats.outbound.bitrate / 1000) : null,
              limit: vStats.outbound.qualityLimitationReason,
              fractionLost: vStats.outbound.fractionLost
            } : null,
            inbound: vStats.inbound ? {
              res: (vStats.inbound.frameWidth || "?") + "x" + (vStats.inbound.frameHeight || "?"),
              fps: vStats.inbound.framesPerSecond,
              kbps: vStats.inbound.bitrate ? Math.round(vStats.inbound.bitrate / 1000) : null,
              packetsLost: vStats.inbound.packetsLost,
              jitter: vStats.inbound.jitter
            } : null
          });
        }
      }).catch(function () {});
    }).catch(function (e) {
      emit("warn", "[pair]", "getStats failed", e && e.message);
    });
  };

  
  
  
  
  
  
  
  if (enabled && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    var origGum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    var dbgGum = function (constraints) {
      emit("log", "[gum]", "getUserMedia requested", constraints);
      return origGum(constraints).then(function (stream) {
        emit("log", "[gum]", "SUCCESS", stream.getTracks().map(function (t) {
          return { kind: t.kind, label: t.label, readyState: t.readyState, enabled: t.enabled };
        }));
        return stream;
      }, function (err) {
        var n = err && err.name;
        if (n === "NotAllowedError" || n === "PermissionDeniedError") {
          emit("error", "[gum]", "PERMISSION DENIED - the user (or the host app, in an in-app browser) blocked the camera/mic", { name: n, message: err && err.message });
        } else if (n === "NotReadableError" || n === "TrackStartError") {
          emit("error", "[gum]", "DEVICE BUSY - another app or tab holds the camera", { name: n, message: err && err.message });
        } else if (n === "NotFoundError" || n === "DevicesNotFoundError") {
          emit("error", "[gum]", "NO CAMERA on this device", { name: n });
        } else if (n === "OverconstrainedError" || n === "ConstraintNotSatisfiedError") {
          emit("warn", "[gum]", "OVERCONSTRAINED - falling back a tier", { name: n, constraint: err && err.constraint });
        } else {
          emit("error", "[gum]", "FAILED", { name: n, message: err && err.message });
        }
        throw err;
      });
    };
    try {
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        value: dbgGum, writable: true, configurable: true, enumerable: false
      });
    } catch (_e) {
      try { navigator.mediaDevices.getUserMedia = dbgGum; } catch (_e2) {}
    }
  }

  
  
  
  
  
  
  
  if (enabled) {
    var OrigPC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    if (OrigPC) {
      var Wrapped = function (config, constraints) {
        var pc = new OrigPC(config, constraints);
        try { LBRTC.attach(pc, {}); } catch (_e) {}
        return pc;
      };
      Wrapped.prototype = OrigPC.prototype;
      Object.keys(OrigPC).forEach(function (k) {
        try { Wrapped[k] = OrigPC[k]; } catch (_e) {}
      });
      if (OrigPC.generateCertificate) Wrapped.generateCertificate = OrigPC.generateCertificate.bind(OrigPC);
      window.RTCPeerConnection = Wrapped;
      if (window.webkitRTCPeerConnection) window.webkitRTCPeerConnection = Wrapped;
    }
  }

  window.LBRTC = LBRTC;

  if (enabled) {
    emit("log", "[init]", "LensBooth WebRTC diagnostics active", {
      ua: navigator.userAgent,
      secureContext: window.isSecureContext,
      hasRTC: !!window.RTCPeerConnection,
      hasGUM: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
    });
  }
})();
