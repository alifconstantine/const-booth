/**
 * Template Selection Controller (ConstBooth Native Style)
 * Bulletproof vanilla JS implementation with zero React hydration dependencies.
 */
(function () {
  'use strict';

  var allTemplates = [];
  var state = {
    search: '',
    size: 'all',
    slots: 'all',
    sort: 'popular',
    category: 'all',
    tag: null,
    page: 1,
    itemsPerPage: 12
  };

  var TRENDING_TAGS = [
    'cute', 'kartun', 'party', 'snoopy', 'miffy',
    'aesthetic', 'bucin', 'vintage', 'music', 'pink',
    'polkadot', 'spiderman'
  ];

  function getBoothId() {
    try {
      var params = new URLSearchParams(window.location.search);
      return params.get('booth');
    } catch (_e) {
      return null;
    }
  }

  function filterAndSortTemplates() {
    return allTemplates.filter(function (t) {
      // Category filter (ratio-based)
      if (state.category === '1:3' && t.ratio !== '1:3') return false;
      if (state.category === '2:3' && t.ratio !== '2:3') return false;
      if (state.category === 'others' && (t.ratio === '1:3' || t.ratio === '2:3')) return false;

      // Dropdown size filter
      if (state.size !== 'all') {
        if (state.size === 'others' && (t.ratio === '1:3' || t.ratio === '2:3')) return false;
        if (state.size !== 'others' && t.ratio !== state.size) return false;
      }

      // Photos slots filter
      if (state.slots !== 'all' && t.slotsCount !== parseInt(state.slots, 10)) {
        return false;
      }

      // Tag filter
      if (state.tag) {
        var tagLower = state.tag.toLowerCase();
        var matchTag = (t.name && t.name.toLowerCase().indexOf(tagLower) !== -1) ||
                       (t.creator && t.creator.toLowerCase().indexOf(tagLower) !== -1);
        if (!matchTag) return false;
      }

      // Keyword search
      if (state.search.trim()) {
        var q = state.search.toLowerCase().trim();
        var matchSearch = (t.name && t.name.toLowerCase().indexOf(q) !== -1) ||
                          (t.creator && t.creator.toLowerCase().indexOf(q) !== -1) ||
                          (t.ratio && t.ratio.toLowerCase().indexOf(q) !== -1);
        if (!matchSearch) return false;
      }

      return true;
    }).sort(function (a, b) {
      if (state.sort === 'popular') return (b.usedTimes || 0) - (a.usedTimes || 0);
      if (state.sort === 'newest') return String(b.id || '').localeCompare(String(a.id || ''));
      if (state.sort === 'name') return String(a.name || '').localeCompare(String(b.name || ''));
      return 0;
    });
  }

  function render() {
    var container = document.getElementById('template-selection-app');
    if (!container) return;

    var filtered = filterAndSortTemplates();
    var totalPages = Math.ceil(filtered.length / state.itemsPerPage) || 1;
    if (state.page > totalPages) state.page = totalPages;
    if (state.page < 1) state.page = 1;

    var start = (state.page - 1) * state.itemsPerPage;
    var paged = filtered.slice(start, start + state.itemsPerPage);
    var boothId = getBoothId();

    var count1x3 = allTemplates.filter(function (t) { return t.ratio === '1:3'; }).length;
    var count2x3 = allTemplates.filter(function (t) { return t.ratio === '2:3'; }).length;
    var countOthers = allTemplates.filter(function (t) { return t.ratio !== '1:3' && t.ratio !== '2:3'; }).length;

    var isCardActive = (state.category === '2:3' || state.size === '2:3');

    var html = '';

    // Flow trail & Header
    html += '<header class="ts-header">';
    html += '  <nav class="ts-flow-trail" aria-label="Creation progress">';
    html += '    <a href="' + (boothId ? '/booth?booth=' + encodeURIComponent(boothId) : '/booth') + '">1. Booth</a>';
    html += '    <span aria-hidden="true">&rsaquo;</span>';
    html += '    <span class="is-active" aria-current="step">2. Style</span>';
    html += '    <span aria-hidden="true">&rsaquo;</span>';
    html += '    <span>3. Snap</span>';
    html += '  </nav>';
    html += '  <h1 class="ts-hero-title">Pilih Template <span class="accent">Photobooth</span></h1>';
    html += '  <p class="ts-hero-sub">Jelajahi template photostrip karya para creator — pilih, foto, dan bagikan hasilnya.</p>';

    // Mode Switcher Tabs (Functional instant filter)
    html += '  <div class="ts-mode-tabs-wrap">';
    html += '    <div class="ts-mode-tabs" role="tablist" aria-label="Format Photobooth">';
    html += '      <button type="button" class="ts-mode-tab' + (!isCardActive ? ' active' : '') + '" data-mode="strip" role="tab" aria-selected="' + (!isCardActive ? 'true' : 'false') + '">';
    html += '        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="15" y2="15"/></svg>';
    html += '        Photo Strips';
    html += '      </button>';
    html += '      <button type="button" class="ts-mode-tab' + (isCardActive ? ' active' : '') + '" data-mode="card" role="tab" aria-selected="' + (isCardActive ? 'true' : 'false') + '">';
    html += '        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><rect x="6" y="6" width="12" height="9" rx="1.5"/><line x1="9" y1="19" x2="9" y2="19"/><line x1="12" y1="19" x2="12" y2="19"/><line x1="15" y1="19" x2="15" y2="19"/></svg>';
    html += '        Instant Frames';
    html += '      </button>';
    html += '    </div>';
    html += '  </div>';
    html += '</header>';

    // Filter Toolbar
    html += '<section class="ts-toolbar" aria-label="Template filters">';
    html += '  <span class="ts-toolbar-filter-label">Filter by:</span>';

    // Size dropdown
    html += '  <div class="ts-dropdown">';
    html += '    <select id="ts-select-size" aria-label="Filter by Size">';
    html += '      <option value="all"' + (state.size === 'all' ? ' selected' : '') + '>All Sizes</option>';
    html += '      <option value="1:3"' + (state.size === '1:3' ? ' selected' : '') + '>1:3 (Strip Vertikal)</option>';
    html += '      <option value="2:3"' + (state.size === '2:3' ? ' selected' : '') + '>2:3 (Photocard)</option>';
    if (countOthers > 0) {
      html += '      <option value="others"' + (state.size === 'others' ? ' selected' : '') + '>Others (A4/A3)</option>';
    }
    html += '    </select>';
    html += '  </div>';

    // Slots dropdown
    html += '  <div class="ts-dropdown">';
    html += '    <select id="ts-select-slots" aria-label="Filter by Types">';
    html += '      <option value="all"' + (state.slots === 'all' ? ' selected' : '') + '>All Types</option>';
    html += '      <option value="2"' + (state.slots === '2' ? ' selected' : '') + '>2 Photos</option>';
    html += '      <option value="3"' + (state.slots === '3' ? ' selected' : '') + '>3 Photos</option>';
    html += '      <option value="4"' + (state.slots === '4' ? ' selected' : '') + '>4 Photos</option>';
    html += '      <option value="6"' + (state.slots === '6' ? ' selected' : '') + '>6 Photos</option>';
    html += '      <option value="8"' + (state.slots === '8' ? ' selected' : '') + '>8 Photos</option>';
    html += '    </select>';
    html += '  </div>';

    // Sort dropdown
    html += '  <div class="ts-dropdown">';
    html += '    <select id="ts-select-sort" aria-label="Sort Templates">';
    html += '      <option value="popular"' + (state.sort === 'popular' ? ' selected' : '') + '>Most Popular</option>';
    html += '      <option value="newest"' + (state.sort === 'newest' ? ' selected' : '') + '>Newest</option>';
    html += '      <option value="name"' + (state.sort === 'name' ? ' selected' : '') + '>Name A-Z</option>';
    html += '    </select>';
    html += '  </div>';

    // Search wrap
    html += '  <div class="ts-search-wrap">';
    html += '    <div class="ts-search-input-box">';
    html += '      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
    html += '      <input type="text" id="ts-search-input" class="ts-search-input" placeholder="Search Templates..." value="' + state.search.replace(/"/g, '&quot;') + '">';
    if (state.search) {
      html += '    <button type="button" id="ts-search-clear" class="ts-search-clear" aria-label="Clear search">&times;</button>';
    }
    html += '    </div>';
    html += '    <button type="button" id="ts-search-btn" class="ts-search-btn">Search</button>';
    html += '  </div>';
    html += '</section>';

    // Trending Tags Bar
    html += '<section class="ts-trending-bar" aria-label="Trending tags">';
    html += '  <span class="ts-trending-label">';
    html += '    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>';
    html += '    Trending Today:';
    html += '  </span>';
    TRENDING_TAGS.forEach(function (tag) {
      var isActive = state.tag === tag;
      html += '<button type="button" class="ts-tag-chip' + (isActive ? ' active' : '') + '" data-tag="' + tag + '">#' + tag + '</button>';
    });
    if (state.tag) {
      html += '<button type="button" class="ts-cat-btn" id="ts-clear-tag">Clear #' + state.tag + ' &times;</button>';
    }
    html += '</section>';

    // Category Tabs (All + Ratio categories only, no fake Top 100)
    html += '<nav class="ts-category-tabs" aria-label="Ratio categories">';
    html += '  <button type="button" class="ts-cat-btn' + (state.category === 'all' ? ' active' : '') + '" data-cat="all">Semua (' + allTemplates.length + ')</button>';
    html += '  <button type="button" class="ts-cat-btn' + (state.category === '1:3' ? ' active' : '') + '" data-cat="1:3">Strip 1:3 (' + count1x3 + ')</button>';
    html += '  <button type="button" class="ts-cat-btn' + (state.category === '2:3' ? ' active' : '') + '" data-cat="2:3">Card 2:3 (' + count2x3 + ')</button>';
    if (countOthers > 0) {
      html += '  <button type="button" class="ts-cat-btn' + (state.category === 'others' ? ' active' : '') + '" data-cat="others">Format Lain (' + countOthers + ')</button>';
    }
    html += '</nav>';

    // Grid of cards
    if (paged.length > 0) {
      html += '<main class="ts-grid" id="main-content">';
      paged.forEach(function (tmpl) {
        var imgUrl = tmpl.thumbnailUrl || tmpl.frameUrl;
        html += '<article class="ts-card" data-tmpl-id="' + tmpl.id + '" tabindex="0" role="button" aria-label="Select template ' + tmpl.name + '">';
        html += '  <div class="ts-card-badges">';
        html += '    <span class="ts-badge-slots">' + tmpl.slotsCount + ' photos</span>';
        html += '  </div>';

        html += '  <div class="ts-card-preview-wrap">';
        html += '    <img src="' + imgUrl + '" alt="' + tmpl.name + '" class="ts-card-preview-img" loading="lazy" onerror="this.src=\'' + (tmpl.frameUrl || imgUrl) + '\'">';
        html += '    <div class="ts-card-overlay">';
        html += '      <span class="ts-btn-start">';
        html += '        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
        html += '        Start Creating';
        html += '      </span>';
        html += '    </div>';
        html += '  </div>';

        html += '  <div class="ts-card-footer">';
        html += '    <h3 class="ts-card-title" title="' + tmpl.name + '">' + tmpl.name + '</h3>';
        html += '    <p class="ts-card-author">by ' + tmpl.creator + '</p>';
        html += '  </div>';
        html += '</article>';
      });
      html += '</main>';
    } else {
      html += '<div class="ts-empty-state">';
      html += '  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
      html += '  <div class="ts-empty-title">Tidak ada template ditemukan</div>';
      html += '  <p>Coba gunakan kata kunci pencarian lain atau reset filter Anda.</p>';
      html += '  <button type="button" class="ts-search-btn" id="ts-btn-reset-filters" style="margin-top:12px">Reset Semua Filter</button>';
      html += '</div>';
    }

    // Pagination
    if (totalPages > 1) {
      html += '<nav class="ts-pagination" aria-label="Pagination">';
      html += '  <button type="button" class="ts-page-btn" data-page="' + (state.page - 1) + '"' + (state.page === 1 ? ' disabled' : '') + ' aria-label="Previous page">&larr; Prev</button>';

      for (var p = 1; p <= totalPages; p++) {
        if (p === 1 || p === totalPages || (p >= state.page - 2 && p <= state.page + 2)) {
          html += '<button type="button" class="ts-page-btn' + (state.page === p ? ' active' : '') + '" data-page="' + p + '">' + p + '</button>';
        } else if (p === state.page - 3 || p === state.page + 3) {
          html += '<span style="padding:0 4px;color:#9ca3af">...</span>';
        }
      }

      html += '  <button type="button" class="ts-page-btn" data-page="' + (state.page + 1) + '"' + (state.page === totalPages ? ' disabled' : '') + ' aria-label="Next page">Next &rarr;</button>';
      html += '  <span class="ts-page-info">Halaman ' + state.page + ' dari ' + totalPages + ' (' + filtered.length + ' template)</span>';
      html += '</nav>';
    }

    container.innerHTML = html;
  }

  function selectTemplateById(id) {
    var card = document.querySelector('.ts-card[data-tmpl-id="' + id + '"]');
    if (card) {
      card.style.transform = 'scale(0.97)';
      card.style.borderColor = '#F12850';
      var btn = card.querySelector('.ts-btn-start');
      if (btn) {
        btn.innerHTML = '<span style="display:inline-block;animation:spin 0.8s linear infinite;margin-right:6px">⏳</span> Masuk Booth...';
      }
    }

    var tmpl = allTemplates.find(function (t) {
      return String(t.id) === String(id);
    });
    if (!tmpl) {
      console.error('Template not found for id:', id);
      return;
    }

    console.log('Selected template:', tmpl.name, tmpl);

    try {
      // All templates from /strips (both 1:3 vertical strips and 2:3 cards / A4 / etc)
      // are captured and composited via the core booth camera engine (camera.min.js)
      localStorage.setItem('outputMode', 'strip');
      localStorage.removeItem('cardLayout');

      // Clear any previous capture/output leftovers so camera always opens fresh
      sessionStorage.setItem('lb_strip_locked', '1');
      sessionStorage.removeItem('lb_pending_strip');
      sessionStorage.removeItem('lb_ic_photos');
      sessionStorage.removeItem('lb_from_output');

      if (tmpl.isOriginal && tmpl.originalKey) {
        localStorage.setItem('stripStyle', tmpl.originalKey);
        localStorage.removeItem('jepretoTemplate');
      } else {
        localStorage.setItem('stripStyle', tmpl.shortId || tmpl.id);
        localStorage.setItem('jepretoTemplate', JSON.stringify(tmpl));
      }
    } catch (e) {
      console.error('Error saving template to storage:', e);
    }

    if (typeof window.showLoader === 'function') {
      window.showLoader('Entering Booth');
    }

    var boothId = getBoothId();
    if (boothId) {
      try {
        var styleKey = (tmpl.isOriginal && tmpl.originalKey) ? tmpl.originalKey : (tmpl.shortId || tmpl.id);
        fetch('/api/booth-output', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            boothId: boothId,
            outputMode: 'strip',
            stripStyle: styleKey,
            template: tmpl,
            photoCount: tmpl.slotsCount || 3
          })
        }).catch(function () {});
      } catch (_e) {}
    }
    var target = boothId
      ? '/camera?booth=' + encodeURIComponent(boothId)
      : '/camera';

    setTimeout(function () {
      window.location.href = target;
    }, 60);
  }

  // Delegated event listener for clicks across the entire page
  document.addEventListener('click', function (e) {
    // 0. Mode tabs click (Photo Strips vs Instant Frames)
    var modeBtn = e.target.closest('.ts-mode-tab');
    if (modeBtn && modeBtn.getAttribute('data-mode')) {
      e.preventDefault();
      var mode = modeBtn.getAttribute('data-mode');
      if (mode === 'card') {
        state.category = '2:3';
        state.size = '2:3';
      } else {
        state.category = '1:3';
        state.size = '1:3';
      }
      state.page = 1;
      render();
      return;
    }

    // 1. Card click
    var card = e.target.closest('.ts-card');
    if (card) {
      e.preventDefault();
      var id = card.getAttribute('data-tmpl-id');
      if (id) selectTemplateById(id);
      return;
    }

    // 2. Tag chip click
    var tagChip = e.target.closest('.ts-tag-chip');
    if (tagChip) {
      e.preventDefault();
      var tag = tagChip.getAttribute('data-tag');
      state.tag = (state.tag === tag) ? null : tag;
      state.page = 1;
      render();
      return;
    }

    // 3. Clear tag
    if (e.target.id === 'ts-clear-tag') {
      e.preventDefault();
      state.tag = null;
      state.page = 1;
      render();
      return;
    }

    // 4. Category tab click
    var catBtn = e.target.closest('.ts-cat-btn');
    if (catBtn && catBtn.getAttribute('data-cat')) {
      e.preventDefault();
      var cat = catBtn.getAttribute('data-cat');
      state.category = cat;
      if (cat === '1:3' || cat === '2:3' || cat === 'others') {
        state.size = cat;
      } else if (cat === 'all') {
        state.size = 'all';
      }
      state.page = 1;
      render();
      return;
    }

    // 5. Pagination button
    var pageBtn = e.target.closest('.ts-page-btn');
    if (pageBtn && !pageBtn.disabled) {
      e.preventDefault();
      var pageNum = parseInt(pageBtn.getAttribute('data-page'), 10);
      if (!isNaN(pageNum) && pageNum >= 1) {
        state.page = pageNum;
        render();
        window.scrollTo({ top: 120, behavior: 'smooth' });
      }
      return;
    }

    // 6. Search button
    if (e.target.id === 'ts-search-btn') {
      e.preventDefault();
      var input = document.getElementById('ts-search-input');
      if (input) state.search = input.value;
      state.page = 1;
      render();
      return;
    }

    // 7. Clear search
    if (e.target.id === 'ts-search-clear') {
      e.preventDefault();
      state.search = '';
      state.page = 1;
      render();
      return;
    }

    // 8. Reset filters
    if (e.target.id === 'ts-btn-reset-filters') {
      e.preventDefault();
      state.search = '';
      state.size = 'all';
      state.slots = 'all';
      state.sort = 'popular';
      state.category = 'all';
      state.tag = null;
      state.page = 1;
      render();
      return;
    }
  });

  // Delegated change listener for selects
  document.addEventListener('change', function (e) {
    if (e.target.id === 'ts-select-size') {
      state.size = e.target.value;
      if (state.size === '1:3' || state.size === '2:3' || state.size === 'others') {
        state.category = state.size;
      } else if (state.size === 'all') {
        state.category = 'all';
      }
      state.page = 1;
      render();
    } else if (e.target.id === 'ts-select-slots') {
      state.slots = e.target.value;
      state.page = 1;
      render();
    } else if (e.target.id === 'ts-select-sort') {
      state.sort = e.target.value;
      state.page = 1;
      render();
    }
  });

  // Enter key in search box
  document.addEventListener('keydown', function (e) {
    if (e.target.id === 'ts-search-input' && e.key === 'Enter') {
      e.preventDefault();
      state.search = e.target.value;
      state.page = 1;
      render();
    }
    // Enter / Space on focused card
    var card = e.target.closest && e.target.closest('.ts-card');
    if (card && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      var id = card.getAttribute('data-tmpl-id');
      if (id) selectTemplateById(id);
    }
  });

  // Initialization: fetch data and render
  function init() {
    var container = document.getElementById('template-selection-app');
    if (!container) return;

    // If embedded data is available
    if (window.__ALL_TEMPLATES_DATA__ && Array.isArray(window.__ALL_TEMPLATES_DATA__)) {
      allTemplates = window.__ALL_TEMPLATES_DATA__;
      render();
      return;
    }

    // Otherwise fetch JSON
    fetch('/assets/all-templates.json')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        allTemplates = data;
        render();
      })
      .catch(function (err) {
        console.error('Failed to load templates catalog:', err);
      });
  }

  window.__initTemplateSelection = init;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Safety retry in case DOM was still streaming or Next.js swapped nodes
  var checkTimer = setInterval(function () {
    var app = document.getElementById('template-selection-app');
    if (app && (!app.querySelector('.ts-grid') && !app.querySelector('.ts-empty-state'))) {
      init();
    } else if (app && (app.querySelector('.ts-grid') || app.querySelector('.ts-empty-state'))) {
      clearInterval(checkTimer);
    }
  }, 100);
  setTimeout(function () {
    clearInterval(checkTimer);
  }, 3000);

  // Safety hide loader on page show
  window.addEventListener('pageshow', function () {
    if (typeof window.hideLoader === 'function') window.hideLoader();
    var loader = document.getElementById('lensbooth-global-loader');
    if (loader) loader.classList.remove('visible');
  });
})();
