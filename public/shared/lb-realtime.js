(function (window) {
  'use strict';

  var BOOTH_ID_RE = /^(?:[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}|[a-f0-9]{16}|[a-f0-9]{8})$/i;

  var RECONNECT_BASE_MS = 500;
  var RECONNECT_MAX_MS = 15000;
  var RECONNECT_MAX_ATTEMPTS = 8;

  var SEND_WINDOW_MS = 1000;
  var SEND_MAX_PER_WINDOW = 25;

  var MAX_FRAME_BYTES = 32 * 1024;

  var SERVER_EVENTS = {
    'connected': 1,
    'booth-joined': 1,
    'booth-full': 1,
    'booth-expired': 1,
    'booth-evicted': 1,
    'booth-output': 1,
    'peer-joined': 1,
    'peer-left': 1,
    'host-changed': 1,
    'signal': 1,
    'start-capture': 1,
    'on-retake': 1,
    'on-style-switch': 1,
    'on-filter-switch': 1,
    'on-zoom-switch': 1,
    'ic-customizing': 1,
    'retake-peer-stay': 1,
    'retake-peer-ready': 1,
    'time-sync-result': 1,
    'join-rate-limited': 1,
    'rate-limited': 1,
    'error': 1
  };

  var CLIENT_EVENTS = {
    'join-booth': 1,
    'leave-booth': 1,
    'signal': 1,
    'capture-triggered': 1,
    'solo-capture': 1,
    'retake-triggered': 1,
    'retake-peer-stay': 1,
    'retake-peer-ready': 1,
    'ic-customizing': 1,
    'style-switched': 1,
    'filter-switched': 1,
    'zoom-switched': 1,
    'time-sync-ping': 1
  };

  function nowMs() {
    return Date.now();
  }

  function byteLength(str) {
    try {
      return new TextEncoder().encode(str).byteLength;
    } catch (_e) {

      return str.length * 3;
    }
  }

  function wsEndpoint(boothId) {
    var clientId = '';
    try {
      clientId = localStorage.getItem('lb_client_id') || '';
    } catch (_e) {}
    var extra = clientId ? '&clientId=' + encodeURIComponent(clientId) : '';

    var base = window.LB_WS_URL || '';
    if (base) {
      return base.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:').replace(/\/+$/, '') +
        '/api/ws?booth=' + encodeURIComponent(boothId) + extra;
    }
    var scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return scheme + '//' + window.location.host + '/api/ws?booth=' + encodeURIComponent(boothId) + extra;
  }

  function Emitter() {
    this._handlers = Object.create(null);
  }

  Emitter.prototype.on = function (name, fn) {
    if (typeof fn !== 'function') return this;
    if (!this._handlers[name]) this._handlers[name] = [];
    this._handlers[name].push(fn);
    return this;
  };

  Emitter.prototype.off = function (name, fn) {
    if (!this._handlers[name]) return this;
    if (!fn) {
      delete this._handlers[name];
      return this;
    }
    var list = this._handlers[name];
    for (var i = list.length - 1; i >= 0; i--) {
      if (list[i] === fn) list.splice(i, 1);
    }
    return this;
  };

  Emitter.prototype.dispatch = function (name, payload) {
    var list = this._handlers[name];
    if (!list || !list.length) return;

    var snapshot = list.slice();
    for (var i = 0; i < snapshot.length; i++) {
      try {
        snapshot[i](payload);
      } catch (_e) {

      }
    }
  };

  function LBSocket(boothIdProvider) {
    Emitter.call(this);

    this._boothIdProvider = boothIdProvider;
    this._ws = null;
    this._attempts = 0;
    this._reconnectTimer = null;
    this._closedByUs = false;
    this._sendWindowStart = 0;
    this._sendCount = 0;

    this.connected = false;
    this.id = null;

    this.io = new Emitter();

    this._open();
  }

  LBSocket.prototype = Object.create(Emitter.prototype);
  LBSocket.prototype.constructor = LBSocket;

  LBSocket.prototype._currentBoothId = function () {
    var raw = typeof this._boothIdProvider === 'function'
      ? this._boothIdProvider()
      : this._boothIdProvider;
    if (!raw || typeof raw !== 'string') return null;
    var id = raw.trim().toLowerCase();
    return BOOTH_ID_RE.test(id) ? id : null;
  };

  LBSocket.prototype._open = function () {
    if (this._ws) {
      var state = this._ws.readyState;
      if (state === 0 || state === 1) return;
    }

    var boothId = this._currentBoothId();
    if (!boothId) {

      this.dispatch('connect_error', new Error('invalid_booth_id'));
      return;
    }

    var ws;
    try {
      ws = new WebSocket(wsEndpoint(boothId));
    } catch (_e) {
      this.dispatch('connect_error', new Error('websocket_unavailable'));
      this._scheduleReconnect();
      return;
    }

    this._ws = ws;
    var self = this;

    ws.onopen = function () {
      self.connected = true;
      self._attempts = 0;
      self.dispatch('connect');
    };

    ws.onmessage = function (evt) {
      self._receive(evt.data);
    };

    ws.onerror = function () {

      self.dispatch('connect_error', new Error('websocket_error'));
    };

    ws.onclose = function (evt) {
      self.connected = false;
      if (self._ws === ws) self._ws = null;

      var code = evt && evt.code;
      var fatal = typeof code === 'number' && code >= 4000 && code <= 4099;

      if (fatal) {
        self.dispatch('connect_error', new Error('rejected_' + code));
        self.io.dispatch('reconnect_failed');
        return;
      }
      if (!self._closedByUs) self._scheduleReconnect();
    };
  };

  LBSocket.prototype._receive = function (raw) {
    if (typeof raw !== 'string') return;
    if (raw.length > MAX_FRAME_BYTES * 2) return;

    var msg;
    try {
      msg = JSON.parse(raw);
    } catch (_e) {
      return;
    }
    if (!msg || typeof msg !== 'object') return;

    var type = msg.type;
    if (typeof type !== 'string' || !SERVER_EVENTS[type]) return;

    var data = (msg.data && typeof msg.data === 'object') ? msg.data : {};

    if (type === 'connected') {
      if (typeof data.socketId === 'string') this.id = data.socketId;
      return;
    }

    if (type === 'rate-limited') {
      this.dispatch('join-rate-limited', data);
      return;
    }

    if (window.__LB_RT_DEBUG) {
      try {
        console.log('[LB-RT-DBG] recv type=' + type + ' at=' + nowMs());
      } catch (_d) {}
    }

    this.dispatch(type, data);
  };

  LBSocket.prototype._allowSend = function () {
    var t = nowMs();
    if (t - this._sendWindowStart > SEND_WINDOW_MS) {
      this._sendWindowStart = t;
      this._sendCount = 0;
    }
    this._sendCount++;
    return this._sendCount <= SEND_MAX_PER_WINDOW;
  };

  LBSocket.prototype.emit = function (name, payload) {
    if (typeof name !== 'string' || !CLIENT_EVENTS[name]) return false;
    if (!this._ws || this._ws.readyState !== 1) return false;
    if (!this._allowSend()) return false;

    var frameData = payload === undefined ? {} : payload;

    if (window.__LB_RT_DEBUG && typeof frameData === 'object' && frameData !== null) {
      frameData = Object.assign({}, frameData);
      frameData._dbgSendTs = nowMs();
    }

    var frame;
    try {
      frame = JSON.stringify({ type: name, data: frameData });
    } catch (_e) {
      return false;
    }
    if (byteLength(frame) > MAX_FRAME_BYTES) return false;

    try {
      this._ws.send(frame);
      return true;
    } catch (_e) {
      return false;
    }
  };

  LBSocket.prototype._scheduleReconnect = function () {
    if (this._closedByUs) return;
    if (this._reconnectTimer) return;

    if (this._attempts >= RECONNECT_MAX_ATTEMPTS) {
      this.io.dispatch('reconnect_failed');
      return;
    }

    var exp = Math.min(RECONNECT_BASE_MS * Math.pow(2, this._attempts), RECONNECT_MAX_MS);
    var jitter = Math.floor(Math.random() * (exp * 0.25));
    var delay = exp + jitter;
    this._attempts++;

    var self = this;
    this._reconnectTimer = window.setTimeout(function () {
      self._reconnectTimer = null;
      self._open();
    }, delay);
  };

  LBSocket.prototype.connect = function () {
    this._closedByUs = false;
    this._attempts = 0;
    if (this._reconnectTimer) {
      window.clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._open();
    return this;
  };

  LBSocket.prototype.disconnect = function () {
    this._closedByUs = true;
    this.connected = false;
    if (this._reconnectTimer) {
      window.clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._ws) {
      try {
        if (this._ws.readyState === 1) this.emit('leave-booth', {});
      } catch (_e) {}
      try {
        this._ws.onopen = this._ws.onmessage = this._ws.onerror = this._ws.onclose = null;
        this._ws.close(1000, 'client_leave');
      } catch (_e) {}
      this._ws = null;
    }
    return this;
  };

  window.LBRealtime = {
    BOOTH_ID_RE: BOOTH_ID_RE,

    connect: function (boothIdProvider) {
      if (window.__lbSocket && !window.__lbSocket._closedByUs) return window.__lbSocket;
      window.__lbSocket = new LBSocket(boothIdProvider);
      return window.__lbSocket;
    },

    teardown: function () {
      if (window.__lbSocket) {
        window.__lbSocket.disconnect();
        window.__lbSocket = null;
      }
    }
  };

  window.addEventListener('pagehide', function (e) {
    if (e && e.persisted) return;
    if (window.__lbSocket) {
      try { window.__lbSocket.disconnect(); } catch (_e) {}
    }
  });
})(window);
