import { webglAvailable } from './stage.js';
import { defaultAvatar, cloneAvatar } from './avatar/config.js';
import { AvatarPreview } from './avatar/preview.js';
import { Creator } from './avatar/creator.js';
import { loadModel } from './avatar/library.js';
import { loadAvatar, saveAvatar, lastCity } from './store.js';
import { CITIES } from './registry.js';
import { fontsReady } from './kit/paint.js';
import { createSession, checkSession, codeFromPath, cleanName, savedName, saveName } from './session.js';
import { setOfferwallPhase } from './offerwall.js';

function $(id) {
  return document.getElementById(id);
}

var SCREENS = ['wd-screen-home', 'wd-screen-start', 'wd-screen-avatar', 'wd-screen-status', 'wd-screen-join', 'wd-screen-name'];

var STATUS_COPY = {
  webgl: { title: 'This browser can’t show the 3D city.', text: 'World needs WebGL 2. Try Chrome, Safari or Firefox on a recent phone or computer. The photo booth works everywhere.', booth: true },
  load: { title: 'We couldn’t load the city.', text: 'Check your connection and try again.', retry: true },
  lost: { title: 'The 3D view stopped.', text: 'Your device paused it to save memory. Try again to carry on from where you were.', retry: true },
  invalid: { title: 'That invite link doesn’t work.', text: 'Check the link, or explore on your own and invite your friend from there.', solo: true },
  expired: { title: 'This session has ended.', text: 'Sessions close an hour after everyone leaves. Start a new one and send a fresh link.', solo: true },
  full: { title: 'This session already has two people.', text: 'Each friend session is for two. Start your own and invite a friend.', solo: true },
  'full-group': { title: 'This group is full.', text: 'A group can have up to six people. Start your own and invite your friends.', solo: true },
  together: { title: 'We couldn’t start a session.', text: 'Check your connection and try again in a moment.', retry: true, solo: true }
};

var preview = null;
var creator = null;
var avatar = null;
var firstRun = false;

var draftNote = '';
var world = null;
var invite = codeFromPath(window.location.pathname);

setOfferwallPhase(invite ? 'join' : 'landing');
var afterLook = null;

export function track(name, params) {
  try {
    if (typeof window.trackGA4Event === 'function') window.trackGA4Event(name, params || {});
  } catch (_e) {}
}

function show(id) {
  $('wd-boot').hidden = true;

  setOfferwallPhase(invite || id === 'wd-screen-join' ? 'join' : 'landing');
  SCREENS.forEach(function (s) { $(s).hidden = s !== id; });
  $('wd-app').setAttribute('data-screen', id.replace('wd-screen-', ''));
  var heading = $(id).querySelector('[tabindex="-1"]');
  if (heading) {
    try { heading.focus({ preventScroll: true }); } catch (_e) { heading.focus(); }
  }
  window.scrollTo(0, 0);
}

function showStatus(kind, onRetry, customText) {
  var copy = STATUS_COPY[kind] || STATUS_COPY.load;
  $('wd-status-title').textContent = copy.title;
  var text = customText || copy.text || '';
  $('wd-status-text').textContent = text;
  $('wd-status-text').hidden = !text;
  $('wd-status-booth').hidden = !copy.booth;
  var retry = $('wd-status-retry');
  retry.hidden = !copy.retry;
  retry.onclick = onRetry || function () { window.location.reload(); };
  var solo = $('wd-status-solo');
  if (solo) solo.hidden = !copy.solo;
  show('wd-screen-status');
}

function ensurePreview() {
  if (!preview) {
    try {
      preview = new AvatarPreview();
    } catch (_e) {
      preview = null;
      return null;
    }
  }
  return preview;
}

function showStart(isFirst) {
  firstRun = !!isFirst;
  show('wd-screen-start');

  var current = avatar && avatar.model !== null && avatar.model !== undefined ? avatar.model : -1;
  [['wd-start-woman', 0], ['wd-start-man', 1]].forEach(function (c) {
    var tile = $(c[0]);
    var mine = c[1] === current;
    tile.classList.toggle('is-current', mine);
    tile.querySelector('.wd-char-badge').hidden = !mine;
    tile.setAttribute('aria-label', tile.querySelector('.wd-char-name').textContent + (mine ? ', your current look' : ''));
  });

  $('wd-start-step').textContent = 'Step 1 of ' + (firstRun && !afterLook ? 3 : 2);
  $('wd-start-sub').textContent = current >= 0
    ? 'Restyle your character or switch. Face, skin, hair, outfit and glasses come next.'
    : 'Choose your avatar and step into your own 3D world.';
  var pickCharacter = function (model) {
    track('world_avatar_start', { path: model === 0 ? 'woman' : 'man' });
    var draft = avatar ? cloneAvatar(avatar) : defaultAvatar();
    if (draft.model !== model) {
      draft = defaultAvatar();
      draft.model = model;
    }
    showCreator(firstRun, draft, { tab: 'hair' });
  };
  $('wd-start-woman').onclick = function () { pickCharacter(0); };
  $('wd-start-man').onclick = function () { pickCharacter(1); };

  var back = $('wd-start-back');
  if (firstRun) {
    back.setAttribute('href', '/studio');
    back.onclick = null;
    $('wd-start-back-label').textContent = 'Back to Studio';
  } else {
    back.setAttribute('href', '#');
    $('wd-start-back-label').textContent = 'Cancel';
    back.onclick = function (e) {
      e.preventDefault();
      leaveCreator();
    };
  }
}

function leaveCreator() {
  if (world) {
    world.resumeWithAvatar(avatar);
    return;
  }
  if (!avatar) {
    showStart(true);
    return;
  }
  afterCreator();
}

function selectedCity() {
  var picked = document.querySelector('input[name="wd-city"]:checked');
  var id = picked ? picked.value : null;
  return id && CITIES[id] && CITIES[id].status === 'live' ? id : null;
}

function showHome(afterFirstLook) {
  show('wd-screen-home');

  $('wd-home-step').textContent = afterFirstLook ? 'Step 3 of 3' : 'Studio';
  var p = ensurePreview();
  if (p) {
    p.attach($('wd-home-preview'));
    p.setAvatar(avatar);
  }
  var radios = document.querySelectorAll('input[name="wd-city"]');
  function updateExploreLabel() {
    var c = selectedCity();
    $('wd-explore-label').textContent = c ? 'Explore ' + CITIES[c].name : 'Pick a city to explore';
  }
  for (var i = 0; i < radios.length; i++) {
    radios[i].onchange = updateExploreLabel;
  }
  updateExploreLabel();
  $('wd-edit-avatar').onclick = function () { showStart(false); };
  $('wd-explore').onclick = function () {
    var c = selectedCity();
    if (!c) {
      toast('Please pick a city to explore.');
      return;
    }
    enterWorld(c);
  };
  $('wd-together').onclick = function () {
    var c = selectedCity();
    if (!c) {
      toast('Please pick a city to explore.');
      return;
    }
    askName('friend', c);
  };
  $('wd-group').onclick = function () {
    var c = selectedCity();
    if (!c) {
      toast('Please pick a city to explore.');
      return;
    }
    askName('group', c);
  };
}

var selectedGroupCap = null;

function askName(mode, city) {
  show('wd-screen-name');
  var group = mode === 'group';
  var capWrap = $('wd-name-cap-wrap');
  if (capWrap) capWrap.hidden = !group;
  selectedGroupCap = null;
  var capChips = document.querySelectorAll('.wd-cap-chip');
  capChips.forEach(function (btn) {
    var c = +btn.getAttribute('data-cap');
    var isSel = c === selectedGroupCap;
    btn.setAttribute('aria-checked', String(isSel));
    btn.classList.toggle('is-selected', isSel);
    btn.onclick = function () {
      selectedGroupCap = c;
      capChips.forEach(function (b) {
        var active = +b.getAttribute('data-cap') === selectedGroupCap;
        b.setAttribute('aria-checked', String(active));
        b.classList.toggle('is-selected', active);
      });
      $('wd-name-text').textContent = 'Your name shows above your avatar, only to the friends you invite. Up to ' + selectedGroupCap + ' of you can explore together.';
    };
  });
  $('wd-name-eyebrow').textContent = group ? 'Explore with a group' : 'Explore with a friend';
  $('wd-name-text').textContent = group
    ? (selectedGroupCap ? 'Your name shows above your avatar, only to the friends you invite. Up to ' + selectedGroupCap + ' of you can explore together.' : 'Your name shows above your avatar, only to the friends you invite.')
    : 'Your name shows above your avatar, only to the friend you invite.';
  $('wd-name-go-label').textContent = group ? 'Create group link' : 'Create invite link';
  var input = $('wd-name-input');
  input.value = savedName();
  nameHelp(input, $('wd-name-help'), null);
  $('wd-name-form').onsubmit = function (e) {
    e.preventDefault();
    if (group && !selectedGroupCap) {
      toast('Please choose a group size.');
      return;
    }
    var name = readName(input, $('wd-name-help'));
    if (!name) return;
    startTogether(city, mode, name, group ? selectedGroupCap : 2);
  };
  $('wd-name-back').onclick = function () { showHome(); };
  setTimeout(function () { try { input.focus({ preventScroll: true }); } catch (_e) {} }, 60);
}

function nameHelp(input, help, error) {
  input.classList.toggle('is-error', !!error);
  input.setAttribute('aria-invalid', error ? 'true' : 'false');
  help.classList.toggle('is-error', !!error);
  help.textContent = error || help.getAttribute('data-hint') || help.textContent;
  if (!help.getAttribute('data-hint') && !error) help.setAttribute('data-hint', help.textContent);
}

function readName(input, help) {
  if (!help.getAttribute('data-hint')) help.setAttribute('data-hint', help.textContent);
  var raw = input.value;
  var name = cleanName(raw);
  if (!name) {
    nameHelp(input, help, raw.trim() ? 'Use up to 20 letters, numbers or spaces (no links or symbols).' : 'Add your name so your friends know it’s you.');
    try { input.focus(); } catch (_e) {}
    return null;
  }
  input.value = name;
  nameHelp(input, help, null);
  saveName(name);
  return name;
}

function startTogether(city, mode, name, cap) {
  if (!webglAvailable()) {
    showStatus('webgl');
    return;
  }
  var btn = $('wd-name-go');
  btn.disabled = true;
  var finalCap = mode === 'group' ? (cap || selectedGroupCap || 6) : 2;
  createSession(city, mode, finalCap).then(function (code) {
    btn.disabled = false;
    setPath('/studio/world/' + code);
    invite = code;
    track('world_session_created', { city: city, mode: mode, cap: finalCap });
    enterWorld(city, { code: code, joined: false, name: name });
  }).catch(function () {
    btn.disabled = false;
    showStatus('together', function () { askName(mode, city); });
  });
}

function setPath(path) {
  try { history.replaceState(null, '', path); } catch (_e) {}
}

function checkInvite() {
  $('wd-boot').hidden = false;
  checkSession(invite).then(function (st) {
    if (st.state === 'open' || st.state === 'rejoin') {
      if (!CITIES[st.city] || CITIES[st.city].status !== 'live') return showStatus('invalid');
      showJoin(st.city, st.state === 'rejoin', st);
    } else if (st.state === 'full') {
      if (st.mode === 'group') {
        showStatus('full-group', null, st.cap ? 'This group was set for up to ' + st.cap + ' people. Start your own and invite your friends.' : null);
      } else {
        showStatus('full');
      }
    } else {
      showStatus(st.state === 'expired' ? st.state : 'invalid');
    }
  }).catch(function () {
    showStatus('load', function () { checkInvite(); });
  });
}

function showJoin(city, rejoin, st) {
  var group = !!(st && st.mode === 'group');
  show('wd-screen-join');
  var p = ensurePreview();
  if (p) {
    p.attach($('wd-join-preview'));
    p.setAvatar(avatar);
  }
  var name = CITIES[city].name;
  $('wd-join-title').textContent = rejoin ? 'Back to ' + name : 'You’re invited to explore ' + name;
  $('wd-join-text').textContent = rejoin
    ? 'Pick up where you left off. If your friend is still there, you’ll see them.'
    : group
      ? 'Your friends are exploring ' + name + '. Join the group, find the LensBooths together and take strips side by side.'
      : 'Your friend is waiting in ' + name + '. Find the LensBooths together and take a strip side by side.';
  if (group && !rejoin) $('wd-join-title').textContent = 'You’re invited to a group in ' + name;
  $('wd-join-label').textContent = rejoin ? 'Go back in' : group ? 'Join the group' : 'Join your friend';
  var nameInput = $('wd-join-name');
  if (!nameInput.value) nameInput.value = savedName();
  $('wd-join-look').onclick = function () {
    afterLook = function () { showJoin(city, rejoin, st); };
    showStart(false);
  };
  $('wd-join').onclick = function () {
    var you = readName(nameInput, $('wd-join-help'));
    if (!you) return;
    track('world_session_joined', { city: city, rejoin: rejoin ? 1 : 0, mode: group ? 'group' : 'friend' });
    enterWorld(city, { code: invite, joined: true, name: you });
  };
}

function afterCreator() {
  var wasFirst = firstRun;
  if (afterLook) {
    var next = afterLook;
    afterLook = null;
    next();
    return;
  }
  showHome(wasFirst);
}

function setZoom(focus) {
  $('wd-zoom-face').setAttribute('aria-pressed', String(focus === 'face'));
  $('wd-zoom-body').setAttribute('aria-pressed', String(focus !== 'face'));
  if (preview) preview.setFocus(focus);
}

function showCreator(isFirst, draft, opts) {
  opts = opts || {};
  firstRun = !!isFirst;
  show('wd-screen-avatar');
  $('wd-avatar-step').textContent = 'Step 2 of ' + (firstRun && !afterLook ? 3 : 2);
  $('wd-cancel').hidden = false;
  $('wd-cancel').querySelector('span').textContent = 'Back';
  $('wd-save').querySelector('span').textContent = firstRun ? 'This is me' : 'Save my look';
  var p = ensurePreview();
  if (p) p.attach($('wd-creator-preview'));
  if (!creator) {
    creator = new Creator({
      panel: $('wd-panel'),
      tabs: $('wd-tabs'),
      onChange: function (cfg) { if (preview) preview.setAvatar(cfg); },
      onTab: function (tab, focus) { setZoom(focus); }
    });
  }
  if (opts.keep && creator.cfg) creator.edit(draft || creator.cfg, creator.tab);
  else creator.edit(draft || avatar || defaultAvatar(), opts.tab);
  draftNote = opts.keep ? draftNote : (opts.note || '');
  var note = $('wd-creator-note');
  note.textContent = draftNote;
  note.hidden = !draftNote;
  if (p) p.setAvatar(creator.cfg);
  $('wd-random').onclick = function () {
    creator.randomise();
    draftNote = '';
    note.hidden = true;
  };
  $('wd-zoom-face').onclick = function () { setZoom('face'); };
  $('wd-zoom-body').onclick = function () { setZoom('body'); };
  $('wd-save').onclick = function () {
    var saved = saveAvatar(creator.cfg);
    avatar = cloneAvatar(creator.cfg);
    track(firstRun ? 'world_avatar_created' : 'world_avatar_edited', {});
    if (!saved) toastSave();
    if (preview) preview.cheer();
    if (world) {
      world.resumeWithAvatar(avatar);
      return;
    }
    afterCreator();
  };

  $('wd-cancel').onclick = function () { showStart(firstRun); };
}

function toast(msg, ms) {
  var pill = $('wd-pill');
  if (!pill) return;
  $('wd-pill-text').textContent = msg;
  pill.hidden = false;
  pill.classList.add('is-on');
  clearTimeout(pill._timer);
  pill._timer = setTimeout(function () {
    pill.classList.remove('is-on');
    pill.hidden = true;
  }, ms || 3200);
}

function toastSave() {
  toast('We couldn’t save your look on this device, so it’s only kept for this visit.', 5000);
}

function enterWorld(city, social) {
  if (!webglAvailable()) {
    showStatus('webgl');
    return;
  }
  if (preview) {
    preview.dispose();
    preview = null;
  }
  $('wd-explore').disabled = true;
  track('world_city_entered', { city: city });
  import('./world-view.js').then(function (mod) {
    $('wd-explore').disabled = false;
    var failedEarly = false;
    var opened = mod.openWorld({
      city: city,
      avatar: avatar,
      code: social ? social.code : null,
      joined: social ? !!social.joined : false,
      name: social ? social.name || null : null,
      onExit: function () {
        world = null;
        if (social) {

          invite = null;
          setPath('/studio/world');
        }
        showHome();
      },
      onEditLook: function () {
        showStart(false);
      },
      onFail: function (kind) {
        failedEarly = true;
        world = null;
        showStatus(kind, function () { showHome(); enterWorld(city, social); });
      }
    });
    if (!failedEarly) world = opened;
  }).catch(function () {
    $('wd-explore').disabled = false;
    showStatus('load', function () { enterWorld(city, social); });
  });
}

function exposeDebug() {
  var host = window.location.hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') return;
  window.__wdDebug = {
    avatar: function () { return avatar; },
    preview: function () { return preview; },
    setAvatar: function (cfg) { avatar = cfg; if (preview) preview.setAvatar(cfg); },
    world: function () { return world; },
    creator: function () { return creator; },
    start: function () { showStart(!avatar); },
    enter: function (city, code) { enterWorld(city || 'bengaluru', code ? { code: code, joined: true } : null); },
    together: function (city, mode, name, cap) { startTogether(city || 'bengaluru', mode || 'friend', name || null, cap); }
  };
}

function boot() {
  exposeDebug();
  if (!webglAvailable()) {
    showStatus('webgl');
    return;
  }
  avatar = loadAvatar();
  if (avatar && (avatar.model === null || avatar.model === undefined)) avatar = null;

  if (avatar) saveAvatar(avatar);

  if (avatar && avatar.model !== null && avatar.model !== undefined) loadModel(avatar.model).catch(function () {});
  fontsReady().then(function () {
    if (!avatar) {

      if (invite) afterLook = function () { checkInvite(); };
      showStart(true);
      return;
    }
    if (invite) checkInvite();
    else if (window.location.hash === '#look') showStart(false);
    else showHome();
  });
  track('world_opened', {});
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
