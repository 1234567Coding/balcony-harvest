/* The Balcony Harvest — shared site JS (vanilla, no dependencies).
   Features: site search, table of contents + scroll-spy, reading progress bar,
   sortable comparison tables, FAQ accordions, dark-mode toggle, back-to-top.
   Every feature checks for its required markup first, so pages degrade
   gracefully when JS is unavailable or a feature has nothing to attach to. */
(function () {
  'use strict';

  var doc = document;
  var rootEl = doc.documentElement;
  var reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }

  /* ---------- 6. Dark mode toggle ---------- */
  var themeBtn = $('#theme-toggle');
  function storedTheme() {
    try { return localStorage.getItem('bh-theme'); } catch (e) { return null; }
  }
  function systemTheme() {
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  function applyTheme(t) {
    if (t === 'dark') rootEl.setAttribute('data-theme', 'dark');
    else rootEl.removeAttribute('data-theme');
    if (themeBtn) themeBtn.setAttribute('aria-pressed', t === 'dark' ? 'true' : 'false');
  }
  applyTheme(storedTheme() || systemTheme());
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var next = rootEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('bh-theme', next); } catch (e) { /* storage unavailable */ }
      applyTheme(next);
    });
  }

  /* ---------- 1. Site-wide search ---------- */
  var searchForm = $('#site-search');
  var searchInput = $('#site-search-input');
  var searchResults = $('#site-search-results');
  if (searchForm && searchInput && searchResults) {
    var inArticles = /\/articles\//.test(window.location.pathname);
    var indexUrl = (inArticles ? '../' : '') + 'search-index.json';
    var searchIndex = null;

    if (window.fetch) {
      window.fetch(indexUrl).then(function (resp) {
        if (!resp.ok) throw new Error('index not found');
        return resp.json();
      }).then(function (data) {
        searchIndex = Array.isArray(data) ? data : [];
      }).catch(function () {
        searchIndex = []; /* fetch failed: show "no results" instead of breaking */
      });
    }

    function resultHref(url) {
      return inArticles ? url.replace(/^articles\//, '') : url;
    }

    function findMatches(q) {
      q = q.trim().toLowerCase();
      if (!searchIndex || q.length < 2) return [];
      var out = [];
      searchIndex.forEach(function (item) {
        var title = (item.title || '').toLowerCase();
        var excerpt = (item.excerpt || '').toLowerCase();
        var headings = ((item.headings || []).join(' ')).toLowerCase();
        var score = 0;
        if (title.indexOf(q) !== -1) score = 3;
        else if (headings.indexOf(q) !== -1) score = 2;
        else if (excerpt.indexOf(q) !== -1) score = 1;
        if (score > 0) out.push({ item: item, score: score });
      });
      out.sort(function (a, b) { return b.score - a.score; });
      return out.slice(0, 6).map(function (s) { return s.item; });
    }

    var activeIdx = -1;
    function render(q) {
      var matches = findMatches(q);
      activeIdx = -1;
      searchResults.innerHTML = '';
      if (q.trim().length < 2) {
        searchResults.hidden = true;
        searchInput.setAttribute('aria-expanded', 'false');
        return;
      }
      if (matches.length === 0) {
        var li = doc.createElement('li');
        li.className = 'search-empty';
        li.textContent = 'No guides found for \u201C' + q.trim() + '\u201D.';
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        searchResults.appendChild(li);
      } else {
        matches.forEach(function (item) {
          var li = doc.createElement('li');
          li.setAttribute('role', 'option');
          var a = doc.createElement('a');
          a.href = resultHref(item.url);
          var t = doc.createElement('span');
          t.className = 'search-title';
          t.textContent = item.title;
          var e = doc.createElement('span');
          e.className = 'search-excerpt';
          e.textContent = item.excerpt || '';
          a.appendChild(t);
          a.appendChild(e);
          li.appendChild(a);
          searchResults.appendChild(li);
        });
      }
      searchResults.hidden = false;
      searchInput.setAttribute('aria-expanded', 'true');
    }

    function setActive(idx) {
      var items = $all('li', searchResults);
      if (!items.length) return;
      activeIdx = (idx + items.length) % items.length;
      items.forEach(function (li, i) {
        var on = i === activeIdx;
        li.classList.toggle('active', on);
        li.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      var link = $('a', items[activeIdx]);
      if (link && activeIdx === 0) searchResults.scrollTop = 0;
    }

    searchInput.addEventListener('input', function () { render(searchInput.value); });
    searchInput.addEventListener('focus', function () { if (searchInput.value.trim().length >= 2) render(searchInput.value); });
    searchInput.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        searchResults.hidden = true;
        searchInput.setAttribute('aria-expanded', 'false');
        searchInput.blur();
      } else if (ev.key === 'ArrowDown' && !searchResults.hidden) {
        ev.preventDefault(); setActive(activeIdx + 1);
      } else if (ev.key === 'ArrowUp' && !searchResults.hidden) {
        ev.preventDefault(); setActive(activeIdx - 1);
      } else if (ev.key === 'Enter' && activeIdx >= 0 && !searchResults.hidden) {
        var link = $('a', $all('li', searchResults)[activeIdx]);
        if (link) { ev.preventDefault(); window.location.href = link.href; }
      }
    });
    doc.addEventListener('click', function (ev) {
      if (!searchForm.contains(ev.target)) {
        searchResults.hidden = true;
        searchInput.setAttribute('aria-expanded', 'false');
      }
    });
    searchForm.addEventListener('submit', function (ev) { ev.preventDefault(); });
  }

  /* ---------- Article-only features ---------- */
  var article = $('.article-body');

  /* ---------- 2. Table of contents + scroll-spy ---------- */
  if (article) {
    var headings = $all('h2, h3', article).filter(function (h) {
      return h.textContent.trim().length > 0 && !h.closest('.keep-reading');
    });
    if (headings.length >= 2) {
      var usedIds = {};
      function uniqueId(text) {
        var base = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
        var id = base, n = 1;
        while (usedIds[id] || doc.getElementById(id)) { n += 1; id = base + '-' + n; }
        usedIds[id] = true;
        return id;
      }
      var toc = doc.createElement('nav');
      toc.className = 'toc';
      toc.setAttribute('aria-label', 'On this page');
      var tocTitle = doc.createElement('p');
      tocTitle.className = 'toc-title';
      tocTitle.textContent = 'On this page';
      var tocList = doc.createElement('ul');
      headings.forEach(function (h) {
        if (!h.id) h.id = uniqueId(h.textContent.trim());
        var li = doc.createElement('li');
        if (h.tagName === 'H3') li.className = 'toc-sub';
        var a = doc.createElement('a');
        a.href = '#' + h.id;
        a.textContent = h.textContent.trim();
        li.appendChild(a);
        tocList.appendChild(li);
      });
      toc.appendChild(tocTitle);
      toc.appendChild(tocList);
      var anchor = $('.affiliate-note', article) || $('.article-meta', article) || $('h1', article);
      if (anchor && anchor.parentNode === article) anchor.parentNode.insertBefore(toc, anchor.nextSibling);
      else article.insertBefore(toc, article.firstChild);

      var tocLinks = $all('a', tocList);
      if ('IntersectionObserver' in window && !reducedMotion) {
        var spy = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting) {
              tocLinks.forEach(function (a) {
                a.classList.toggle('active', a.getAttribute('href') === '#' + en.target.id);
              });
            }
          });
        }, { rootMargin: '-15% 0px -70% 0px' });
        headings.forEach(function (h) { spy.observe(h); });
      }
    }
  }

  /* ---------- 3. Reading progress bar ---------- */
  if (article) {
    var bar = doc.createElement('div');
    bar.className = 'read-progress';
    bar.setAttribute('aria-hidden', 'true');
    var fill = doc.createElement('span');
    bar.appendChild(fill);
    doc.body.appendChild(bar);
    function updateProgress() {
      var rect = article.getBoundingClientRect();
      var total = rect.height - window.innerHeight;
      if (total <= 0) { fill.style.width = '0%'; return; }
      var done = Math.min(Math.max(-rect.top, 0), total);
      fill.style.width = (done / total * 100).toFixed(1) + '%';
    }
    var ticking = false;
    function onScrollProgress() {
      if (ticking) return;
      ticking = true;
      if (window.requestAnimationFrame) {
        window.requestAnimationFrame(function () { updateProgress(); ticking = false; });
      } else { updateProgress(); ticking = false; }
    }
    window.addEventListener('scroll', onScrollProgress, { passive: true });
    window.addEventListener('resize', onScrollProgress);
    updateProgress();
  }

  /* ---------- 4. Sortable comparison tables ---------- */
  $all('table.compare').forEach(function (table) {
    var rows = $all('tr', table);
    if (rows.length < 2) return;
    var headRow = rows[0];
    if (!$('th', headRow)) return;

    var thead = $('thead', table);
    if (!thead) {
      thead = doc.createElement('thead');
      table.insertBefore(thead, table.firstChild);
      thead.appendChild(headRow);
    }
    var tbody = $('tbody', table);
    if (!tbody) {
      tbody = doc.createElement('tbody');
      thead.parentNode.insertBefore(tbody, thead.nextSibling);
      $all('tr', table).forEach(function (r) {
        if (r.parentNode !== thead) tbody.appendChild(r);
      });
    }

    var ths = $all('th', thead);
    var directions = ths.map(function () { return 0; }); /* 0=unsorted, 1=asc, -1=desc */

    function cellText(row, i) {
      return row.cells[i] ? row.cells[i].textContent.trim() : '';
    }
    function numericPrefix(v) {
      var m = /^\s*~?\$?\s*(-?\d+(?:\.\d+)?)/.exec(v);
      return m ? parseFloat(m[1]) : null;
    }
    function sortRows(colIdx, dir) {
      var dataRows = $all('tr', tbody);
      dataRows.sort(function (a, b) {
        var va = cellText(a, colIdx), vb = cellText(b, colIdx);
        var na = numericPrefix(va), nb = numericPrefix(vb);
        var cmp;
        if (na !== null && nb !== null) cmp = na - nb;
        else cmp = va.localeCompare(vb, undefined, { numeric: true, sensitivity: 'base' });
        return cmp * dir;
      });
      dataRows.forEach(function (r) { tbody.appendChild(r); });
    }

    ths.forEach(function (th, i) {
      th.setAttribute('aria-sort', 'none');
      var btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'sort-btn';
      var label = th.textContent.trim();
      btn.setAttribute('aria-label', 'Sort by ' + (label || ('column ' + (i + 1))));
      while (th.firstChild) btn.appendChild(th.firstChild);
      var arrow = doc.createElement('span');
      arrow.className = 'sort-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      btn.appendChild(arrow);
      th.appendChild(btn);
      btn.addEventListener('click', function () {
        var dir = directions[i] === 1 ? -1 : 1;
        directions = ths.map(function () { return 0; });
        directions[i] = dir;
        ths.forEach(function (t, j) {
          t.setAttribute('aria-sort', j === i ? (dir === 1 ? 'ascending' : 'descending') : 'none');
        });
        sortRows(i, dir);
      });
    });
  });

  /* ---------- 5. FAQ accordions ---------- */
  $all('.faq dl').forEach(function (dl, dlIdx) {
    var items = [];
    var current = null;
    $all('dt, dd', dl).forEach(function (el) {
      if (el.tagName === 'DT') { current = { dt: el, dd: null }; items.push(current); }
      else if (current && !current.dd) { current.dd = el; }
    });
    items.forEach(function (item, i) {
      if (!item.dd) return;
      var wrap = doc.createElement('div');
      wrap.className = 'faq-item';
      dl.insertBefore(wrap, item.dt);
      wrap.appendChild(item.dt);
      wrap.appendChild(item.dd);

      var btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'faq-q';
      btn.setAttribute('aria-expanded', 'false');
      var ddId = 'faq-a-' + dlIdx + '-' + i;
      btn.setAttribute('aria-controls', ddId);
      while (item.dt.firstChild) btn.appendChild(item.dt.firstChild);
      item.dt.appendChild(btn);

      item.dd.id = ddId;
      item.dd.hidden = true;

      btn.addEventListener('click', function () {
        var open = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', open ? 'false' : 'true');
        item.dd.hidden = open;
      });
    });
  });

  /* ---------- 7. Back-to-top button ---------- */
  var toTop = doc.createElement('button');
  toTop.type = 'button';
  toTop.className = 'to-top';
  toTop.setAttribute('aria-label', 'Back to top');
  toTop.textContent = '\u2191';
  doc.body.appendChild(toTop);
  toTop.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  });
  function toggleToTop() {
    toTop.classList.toggle('show', window.scrollY > 600);
  }
  window.addEventListener('scroll', toggleToTop, { passive: true });
  toggleToTop();
})();
