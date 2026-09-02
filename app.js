/*
 * RELAY Support Console — application logic.
 *
 * Plain ES5-ish browser JavaScript, no framework, no build step.
 * Read it top to bottom: clock -> formatters -> state -> queries ->
 * renderers -> event wiring.
 */
(function () {
  'use strict';

  var DATA = window.RELAY_DATA;
  var MIN = 60 * 1000;
  var HOUR = 60 * MIN;

  /* =============================================================== clock */

  // The console runs on a simulated clock anchored to SIM_NOW, advancing in
  // real time. That is what keeps the SLA counters moving while the dates
  // from the design stay meaningful.
  var BOOT = Date.now();
  function now() { return DATA.SIM_NOW + (Date.now() - BOOT); }

  /* ========================================================== formatters */

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function fmtDateTime(ts) {
    var d = new Date(ts);
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function fmtShort(ts) {
    var d = new Date(ts);
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function sameDay(a, b) {
    var x = new Date(a), y = new Date(b);
    return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
  }

  function fmtRelative(ts, ref) {
    var d = new Date(ts);
    if (sameDay(ts, ref)) return 'dziś ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (sameDay(ts, ref - 24 * HOUR)) return 'wczoraj ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    return fmtShort(ts);
  }

  // "2h 14min" / "za 48 min" / "8h"
  function fmtSpan(ms) {
    var total = Math.max(0, Math.round(ms / MIN));
    if (total < 60) return total + ' min';
    var h = Math.floor(total / 60), m = total % 60;
    if (h < 48) return m ? h + 'h ' + m + 'min' : h + 'h';
    return Math.floor(h / 24) + ' dni';
  }

  // Deadline as shown in the Termin column.
  function dueCell(t, ref) {
    if (!t.dueAt) return { text: '—', cls: 't-plain' };
    if (t.status === 'Zamknięte') return { text: fmtShort(t.dueAt), cls: 't-closed' };
    var diff = t.dueAt - ref;
    if (diff <= 0) {
      return t.dueStyle === 'absolute'
        ? { text: fmtRelative(t.dueAt, ref), cls: 't-danger' }
        : { text: 'przekroczony', cls: 't-danger' };
    }
    if (t.dueStyle === 'absolute') return { text: fmtShort(t.dueAt), cls: 't-plain' };
    return { text: (diff < HOUR ? 'za ' : '') + fmtSpan(diff), cls: 't-plain' };
  }

  // Deadline as shown in the detail panel — more verbose, colour-coded.
  function duePanel(t, ref) {
    if (!t.dueAt) return { text: 'brak (bez SLA)', cls: 't-plain' };
    var diff = t.dueAt - ref;
    if (diff <= 0) return { text: 'przekroczono o ' + fmtSpan(-diff), cls: 't-danger' };
    return {
      text: 'pozostało ' + fmtSpan(diff),
      cls: diff < 4 * HOUR ? 't-warn' : 't-plain'
    };
  }

  var STATUS_CLS = {
    'Nowe': 't-link',
    'W toku': 't-warn',
    'Oczekuje na klienta': 't-ok',
    'Eskalacja': 't-danger',
    'Zamknięte': 't-closed'
  };
  var PRIORITY_CLS = { 'Wysoki': 't-danger', 'Średni': 't-warn', 'Niski': 't-ok' };

  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (n === 1) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  // 'auto' grouping omits the separator for 4-digit integers in pl-PL,
  // which would print 1284 instead of 1 284.
  function num(n) { return n.toLocaleString('pl-PL', { useGrouping: true }); }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function randomHex(len) {
    var out = '';
    while (out.length < len) out += Math.floor(Math.random() * 16).toString(16);
    return out.slice(0, len);
  }

  /* =============================================================== state */

  var DEFAULT_FILTERS = { status: '', priority: '', queue: 'Wsparcie 1. linii', q: '' };

  var state = {
    module: 'zgloszenia',
    applied: Object.assign({}, DEFAULT_FILTERS),
    sort: { key: 'id', dir: 'desc' },
    page: 1,
    pageSize: 10,
    selectedId: 4471,
    settings: { autoRefresh: true, liveSla: true, pageSize: 10 },
    inbox: [],                       // ids that arrived after the last refresh
    flash: [],                       // ids to highlight on the next render only
    sessionId: randomHex(4) + '-' + randomHex(4),
    replyOpen: false,
    busy: false
  };

  var SETTINGS_KEY = 'relay.settings.v1';

  function loadSettings() {
    try {
      var raw = window.localStorage.getItem(SETTINGS_KEY);
      if (raw) Object.assign(state.settings, JSON.parse(raw));
      state.pageSize = state.settings.pageSize || state.pageSize;
    } catch (e) { /* private mode, blocked storage — defaults are fine */ }
  }

  function saveSettings() {
    state.settings.pageSize = state.pageSize;
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    } catch (e) { /* ignore */ }
  }

  /* ============================================================= queries */

  // Lookup index — byId() runs on every SLA tick, so keep it O(1).
  var ticketIndex = Object.create(null);
  DATA.tickets.forEach(function (t) { ticketIndex[t.id] = t; });

  function byId(id) { return ticketIndex[id] || null; }

  function matches(t, f) {
    if (f.status && t.status !== f.status) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (f.queue && t.queue !== f.queue) return false;
    if (f.q) {
      var hay = t.id + ' ' + t.subject + ' ' + t.client + ' ' + t.contactEmail + ' ' +
        t.messages.map(function (m) { return m.body; }).join(' ');
      if (hay.toLowerCase().indexOf(f.q.trim().toLowerCase()) === -1) return false;
    }
    return true;
  }

  var SORTERS = {
    id:       function (t) { return t.id; },
    subject:  function (t) { return t.subject.toLowerCase(); },
    client:   function (t) { return t.client.toLowerCase(); },
    status:   function (t) { return DATA.statusOrder[t.status]; },
    priority: function (t) { return DATA.priorityOrder[t.priority]; },
    due:      function (t) { return t.dueAt === null ? Infinity : t.dueAt; }
  };

  function results() {
    var rows = DATA.tickets.filter(function (t) { return matches(t, state.applied); });
    var key = SORTERS[state.sort.key];
    var dir = state.sort.dir === 'asc' ? 1 : -1;

    rows.sort(function (a, b) {
      var x = key(a), y = key(b);
      if (x === y) return b.id - a.id;             // stable tie-break: newest first
      if (x === Infinity) return 1;                // tickets without SLA always last
      if (y === Infinity) return -1;
      return x > y ? dir : -dir;
    });
    return rows;
  }

  function customerHistory(t) {
    var all = DATA.tickets.filter(function (o) { return o.client === t.client && o.id !== t.id; });
    all.sort(function (a, b) { return b.id - a.id; });
    return { rows: all.slice(0, 3), total: all.length };
  }

  /* ================================================================= DOM */

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  var el = {};

  /* ============================================================ renderers */

  function renderCount(rows) {
    var total = rows.length;
    if (!total) {
      el.count.textContent = '(0 rekordów — brak wyników dla podanych kryteriów)';
      return;
    }
    var from = (state.page - 1) * state.pageSize + 1;
    var to = Math.min(total, state.page * state.pageSize);
    el.count.textContent = '(' + num(total) + ' ' +
      plural(total, 'rekord', 'rekordy', 'rekordów') +
      ', wyświetlono ' + from + '-' + to + ')';
  }

  function renderGrid(rows) {
    var start = (state.page - 1) * state.pageSize;
    var page = rows.slice(start, start + state.pageSize);
    var ref = now();
    var flash = state.flash;
    state.flash = [];

    if (!page.length) {
      el.body.innerHTML = '<tr><td colspan="6" class="cell-empty">' +
        'Brak zgłoszeń spełniających kryteria.<br>Zmień filtry i kliknij „Filtruj”.</td></tr>';
      return;
    }

    el.body.innerHTML = page.map(function (t) {
      var due = dueCell(t, ref);
      var isNew = flash.indexOf(t.id) !== -1;
      return '<tr data-id="' + t.id + '"' +
        (t.id === state.selectedId ? ' class="is-selected"' : (isNew ? ' class="is-new"' : '')) + '>' +
        '<td>' + t.id + '</td>' +
        '<td class="cell-subject" title="' + esc(t.subject) + '">' + esc(t.subject) + '</td>' +
        '<td title="' + esc(t.client) + '">' + esc(t.client) + '</td>' +
        '<td class="' + STATUS_CLS[t.status] + '" title="' + esc(t.status) + '">' + esc(t.status) + '</td>' +
        '<td class="' + PRIORITY_CLS[t.priority] + '">' + esc(t.priority) + '</td>' +
        '<td class="' + due.cls + '" data-due="' + t.id + '">' + due.text + '</td>' +
        '</tr>';
    }).join('');
  }

  function pageList(current, total) {
    var set = { 1: true };
    set[total] = true;

    // Window of four consecutive pages, anchored so the current one is inside.
    var from = Math.min(Math.max(1, current - 1), Math.max(1, total - 3));
    for (var p = from; p < from + 4 && p <= total; p++) set[p] = true;

    var pages = Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
    var out = [];
    pages.forEach(function (p, i) {
      if (i && p - pages[i - 1] > 1) out.push('gap');
      out.push(p);
    });
    return out;
  }

  function renderPager(rows) {
    var total = Math.max(1, Math.ceil(rows.length / state.pageSize));
    if (state.page > total) state.page = total;

    var html = state.page > 1
      ? '<a href="#" class="step" data-page="' + (state.page - 1) + '">« Poprzednia</a>'
      : '<span class="step is-off">« Poprzednia</span>';

    pageList(state.page, total).forEach(function (p) {
      if (p === 'gap') { html += '<span class="gap">...</span>'; return; }
      html += p === state.page
        ? '<span class="is-current">' + p + '</span>'
        : '<a href="#" data-page="' + p + '">' + p + '</a>';
    });

    html += state.page < total
      ? '<a href="#" class="step" data-page="' + (state.page + 1) + '">Następna »</a>'
      : '<span class="step is-off">Następna »</span>';

    el.pager.innerHTML = html;
  }

  function metaRow(label, valueHtml) {
    return '<dt>' + label + '</dt><dd>' + valueHtml + '</dd>';
  }

  function renderDetail() {
    var t = state.selectedId ? byId(state.selectedId) : null;

    if (!t) {
      el.detail.innerHTML =
        '<div class="panel__head"><span>Szczegóły zgłoszenia</span></div>' +
        '<div class="panel__empty"><p>Nie wybrano zgłoszenia.</p>' +
        '<p>Kliknij wiersz na liście, aby wyświetlić szczegóły.</p></div>';
      return;
    }

    var ref = now();
    var due = duePanel(t, ref);
    var hist = customerHistory(t);

    var thread = t.messages.map(function (m) {
      return '<div class="thread__msg' + (m.outgoing ? ' thread__msg--out' : '') + '">' +
        '<p class="thread__from">' + esc(m.from) + '  <b>&lt;' + esc(m.email) + '&gt;</b>' +
        '<span class="thread__at">' + fmtDateTime(m.at) + '</span></p>' +
        '<p class="thread__body">' + esc(m.body) + '</p>' +
        '</div>';
    }).join('');

    var history = hist.rows.length
      ? hist.rows.map(function (h) {
          return '<li><a href="#" data-goto="' + h.id + '">#' + h.id + '</a>' +
            '<span class="history__subject" title="' + esc(h.subject) + '">' + esc(h.subject) + '</span>' +
            '<span class="' + STATUS_CLS[h.status] + '">' + esc(h.status) + '</span></li>';
        }).join('')
      : '<li><span></span><span class="history__subject">Brak innych zgłoszeń tego klienta.</span><span></span></li>';

    el.detail.innerHTML =
      '<div class="panel__head">' +
        '<span>Zgłoszenie #' + t.id + '</span>' +
        '<span class="panel__actions">' +
          '<a href="#" data-detail="print">Drukuj</a><span aria-hidden="true">|</span>' +
          '<a href="#" data-detail="close">Zamknij</a>' +
        '</span>' +
      '</div>' +
      '<div class="panel__body">' +
        '<dl class="meta">' +
          metaRow('Klient:', '<a href="#" data-detail="client">' + esc(t.client) + '</a>') +
          metaRow('Kontakt:', '<a href="mailto:' + esc(t.contactEmail) + '">' + esc(t.contactEmail) + '</a>') +
          metaRow('Status:', '<span class="' + STATUS_CLS[t.status] + '">' + esc(t.status) + '</span>') +
          metaRow('Priorytet:', '<span class="' + PRIORITY_CLS[t.priority] + '">' + esc(t.priority) + '</span>') +
          metaRow('Utworzono:', fmtDateTime(t.createdAt)) +
          metaRow('Termin:', '<span class="' + due.cls + '" data-due-panel>' + due.text + '</span>') +
        '</dl>' +
        '<hr class="panel__rule">' +
        '<h2>Treść zgłoszenia</h2>' +
        '<div class="thread" id="thread">' + thread + '</div>' +
        '<h2>Historia klienta (' + hist.rows.length + ' z ' + hist.total + ')</h2>' +
        '<ul class="history">' + history + '</ul>' +
        (state.replyOpen ? composerHtml(t) : buttonsHtml()) +
        '<p class="panel__stamp">Ostatnia modyfikacja: ' + fmtDateTime(t.modifiedAt) +
          ' przez ' + esc(t.modifiedBy) + '  ·  ID sesji: ' + state.sessionId + '</p>' +
      '</div>';

    if (state.replyOpen) {
      var ta = $('#reply-body');
      if (ta) { ta.focus(); updateCharCount(); }
    }
  }

  function buttonsHtml() {
    return '<div class="panel__buttons">' +
      '<button type="button" class="btn btn--primary" data-detail="reply">Odpowiedz</button>' +
      '<button type="button" class="btn" data-detail="escalate">Eskaluj</button>' +
      '</div>';
  }

  var TEMPLATES = {
    ack: 'Dzień dobry,\n\ndziękujemy za zgłoszenie. Przyjęliśmy je do realizacji i wrócimy z informacją najpóźniej w ciągu 4 godzin roboczych.\n\nPozdrawiam,\nK. Nowak, Wsparcie 1. linii',
    info: 'Dzień dobry,\n\naby kontynuować diagnostykę, prosimy o przesłanie zrzutu ekranu z komunikatem błędu oraz przybliżonej godziny wystąpienia problemu.\n\nPozdrawiam,\nK. Nowak, Wsparcie 1. linii',
    tfa: 'Dzień dobry,\n\nzresetowaliśmy drugi czynnik uwierzytelnienia dla wskazanych kont. Prosimy o ponowne zalogowanie i skonfigurowanie aplikacji uwierzytelniającej od nowa.\n\nPozdrawiam,\nK. Nowak, Wsparcie 1. linii',
    close: 'Dzień dobry,\n\nzgłoszenie zostało rozwiązane. Zamykamy je po Państwa stronie — w razie nawrotu problemu prosimy o odpowiedź na tę wiadomość.\n\nPozdrawiam,\nK. Nowak, Wsparcie 1. linii'
  };

  function composerHtml(t) {
    return '<div class="composer" id="composer">' +
      '<div class="composer__row">' +
        '<label for="reply-tpl">Szablon:</label>' +
        '<select id="reply-tpl">' +
          '<option value="">— wybierz odpowiedź standardową —</option>' +
          '<option value="ack">Potwierdzenie przyjęcia zgłoszenia</option>' +
          '<option value="info">Prośba o dodatkowe informacje</option>' +
          '<option value="tfa">Reset drugiego czynnika (2FA)</option>' +
          '<option value="close">Zamknięcie zgłoszenia</option>' +
        '</select>' +
      '</div>' +
      '<textarea id="reply-body" placeholder="Treść odpowiedzi do ' + esc(t.contactEmail) + '..."></textarea>' +
      '<div class="composer__actions">' +
        '<button type="button" class="btn btn--primary" data-detail="send">Wyślij odpowiedź</button>' +
        '<button type="button" class="btn" data-detail="cancel-reply">Anuluj</button>' +
        '<span class="composer__count" id="reply-count">0 znaków</span>' +
      '</div>' +
    '</div>';
  }

  function updateCharCount() {
    var ta = $('#reply-body'), out = $('#reply-count');
    if (!ta || !out) return;
    var n = ta.value.length;
    out.textContent = n + ' ' + plural(n, 'znak', 'znaki', 'znaków');
  }

  function renderInbox() {
    if (!state.inbox.length) { el.newBadge.hidden = true; return; }
    el.newBadge.hidden = false;
    el.newBadge.textContent = '● ' + state.inbox.length + ' ' +
      plural(state.inbox.length, 'nowe zgłoszenie', 'nowe zgłoszenia', 'nowych zgłoszeń') +
      ' — odśwież listę';
  }

  function render() {
    var rows = results();
    renderPager(rows);      // may clamp state.page
    renderCount(rows);
    renderGrid(rows);
    renderDetail();
    renderInbox();
  }

  /* ------------------------------------------------------- SLA live tick */

  // Only the deadline cells are repainted, so selection, scroll position and
  // an open reply draft all survive the tick.
  function tickSla() {
    if (!state.settings.liveSla) return;
    var ref = now();

    $$('[data-due]').forEach(function (cell) {
      var t = byId(Number(cell.getAttribute('data-due')));
      if (!t) return;
      var due = dueCell(t, ref);
      if (cell.textContent !== due.text) cell.textContent = due.text;
      cell.className = due.cls;
    });

    var panelCell = $('[data-due-panel]');
    if (panelCell && state.selectedId) {
      var sel = byId(state.selectedId);
      if (sel) {
        var d = duePanel(sel, ref);
        panelCell.textContent = d.text;
        panelCell.className = d.cls;
      }
    }
  }

  /* ============================================================== chrome */

  function toast(message, kind) {
    var node = document.createElement('div');
    node.className = 'toast' + (kind ? ' toast--' + kind : '');
    node.innerHTML = '<span>' + message + '</span><button type="button" aria-label="Zamknij">✕</button>';

    var remove = function () {
      node.classList.add('is-out');
      window.setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 200);
    };
    node.querySelector('button').addEventListener('click', remove);
    window.setTimeout(remove, 5000);

    el.toasts.appendChild(node);
  }

  var modalResolve = null;

  function openModal(title, bodyHtml, actions) {
    el.modalTitle.textContent = title;
    el.modalBody.innerHTML = bodyHtml;
    el.modalActions.innerHTML = actions.map(function (a) {
      return '<button type="button" class="btn' + (a.primary ? ' btn--primary' : '') +
        '" data-modal="' + a.value + '">' + a.label + '</button>';
    }).join('');
    el.modal.hidden = false;

    var first = el.modalActions.querySelector('.btn--primary') || el.modalActions.querySelector('.btn');
    if (first) first.focus();

    return new Promise(function (resolve) { modalResolve = resolve; });
  }

  function closeModal(value) {
    el.modal.hidden = true;
    var resolve = modalResolve;
    modalResolve = null;
    if (resolve) resolve(value);
  }

  /* ------------------------------------------------- simulated server call */

  function withLoader(ms, done) {
    state.busy = true;
    el.loader.hidden = false;
    window.setTimeout(function () {
      el.loader.hidden = true;
      state.busy = false;
      done();
    }, ms);
  }

  /* ============================================================== filters */

  function readForm() {
    return {
      status: el.fStatus.value,
      priority: el.fPriority.value,
      queue: el.fQueue.value,
      q: el.fQ.value
    };
  }

  function writeForm(f) {
    el.fStatus.value = f.status;
    el.fPriority.value = f.priority;
    el.fQueue.value = f.queue;
    el.fQ.value = f.q;
  }

  function isDirty() {
    var a = readForm(), b = state.applied;
    return a.status !== b.status || a.priority !== b.priority || a.queue !== b.queue || a.q.trim() !== b.q.trim();
  }

  function refreshDirty() {
    var dirty = isDirty();
    el.hint.hidden = !dirty;
    el.btnFilter.classList.toggle('is-dirty', dirty);
  }

  function applyFilters() {
    if (state.busy) return;
    state.applied = readForm();
    state.page = 1;
    state.replyOpen = false;
    refreshDirty();

    withLoader(260 + Math.floor(Math.random() * 260), function () {
      var rows = results();

      // Keep the selection only if it still belongs to the result set.
      if (state.selectedId && !rows.some(function (t) { return t.id === state.selectedId; })) {
        state.selectedId = rows.length ? rows[0].id : null;
      }
      render();

      toast(rows.length
        ? 'Znaleziono <b>' + num(rows.length) + '</b> ' + plural(rows.length, 'zgłoszenie', 'zgłoszenia', 'zgłoszeń') + '.'
        : 'Brak zgłoszeń spełniających podane kryteria.', rows.length ? 'ok' : 'warn');
    });
  }

  /* =========================================================== navigation */

  function goToPage(page) {
    var total = Math.max(1, Math.ceil(results().length / state.pageSize));
    state.page = Math.min(Math.max(1, page), total);
    render();
    el.body.scrollIntoView({ block: 'nearest' });
  }

  function select(id, opts) {
    state.selectedId = id;
    state.replyOpen = false;

    var rows = results();
    var index = -1;
    for (var i = 0; i < rows.length; i++) if (rows[i].id === id) { index = i; break; }

    if (index === -1) {
      // Reachable from the customer-history list: the ticket exists but sits
      // outside the active filter (usually a different queue).
      var t = byId(id);
      render();
      if (t && !(opts && opts.quiet)) {
        toast('Zgłoszenie <b>#' + id + '</b> jest poza bieżącym filtrem (kolejka: ' + esc(t.queue) + ').', 'warn');
      }
      return;
    }

    state.page = Math.floor(index / state.pageSize) + 1;
    render();
  }

  function moveSelection(delta) {
    var rows = results();
    if (!rows.length) return;

    var index = -1;
    for (var i = 0; i < rows.length; i++) if (rows[i].id === state.selectedId) { index = i; break; }
    if (index === -1) index = (state.page - 1) * state.pageSize - delta;

    var next = Math.min(Math.max(0, index + delta), rows.length - 1);
    select(rows[next].id, { quiet: true });
  }

  function showModule(name) {
    state.module = name;

    $$('.sidebar__item').forEach(function (item) {
      var active = item.getAttribute('data-module') === name;
      item.classList.toggle('is-active', active);
      if (active) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });

    var known = { zgloszenia: 'module-zgloszenia', pulpit: 'module-pulpit' };
    $$('.module').forEach(function (m) { m.hidden = true; });

    if (known[name]) {
      $('#' + known[name]).hidden = false;
      if (name === 'pulpit') renderDashboard();
      return;
    }

    var titles = { klienci: 'Klienci', baza: 'Baza wiedzy', raporty: 'Raporty' };
    $('#stub-title').textContent = titles[name] || name;
    $('#stub-crumb').textContent = titles[name] || name;
    $('#module-stub').hidden = false;
  }

  function renderDashboard() {
    var ref = now();
    var open = DATA.tickets.filter(function (t) { return t.status !== 'Zamknięte'; });

    function count(status) {
      return DATA.tickets.filter(function (t) { return t.status === status; }).length;
    }
    var overdue = open.filter(function (t) { return t.dueAt && t.dueAt < ref; }).length;

    var tiles = [
      { label: 'Nowe', value: count('Nowe'), note: 'oczekuje na przypisanie', mod: 'link' },
      { label: 'W toku', value: count('W toku'), note: 'w obsłudze 1. i 2. linii', mod: 'warn' },
      { label: 'Eskalacje', value: count('Eskalacja'), note: 'wymaga decyzji', mod: 'danger' },
      { label: 'SLA przekroczone', value: overdue, note: 'na dziś, ' + fmtDateTime(ref).slice(0, 10), mod: 'danger' }
    ];

    $('#dash').innerHTML = tiles.map(function (t) {
      return '<div class="tile tile--' + t.mod + '">' +
        '<p class="tile__label">' + t.label + '</p>' +
        '<p class="tile__value">' + num(t.value) + '</p>' +
        '<p class="tile__note">' + t.note + '</p>' +
        '</div>';
    }).join('') +
      '<p class="dash__more">Łącznie ' + num(DATA.tickets.length) + ' zgłoszeń w bazie. ' +
      '<a href="#" data-module="zgloszenia">Przejdź do modułu Zgłoszenia</a>.</p>';
  }

  /* ======================================================== detail actions */

  function openReply() {
    state.replyOpen = true;
    renderDetail();
  }

  function sendReply() {
    var t = byId(state.selectedId);
    var ta = $('#reply-body');
    if (!t || !ta) return;

    var text = ta.value.trim();
    if (!text) {
      $('#composer').classList.add('is-invalid');
      window.setTimeout(function () {
        var c = $('#composer');
        if (c) c.classList.remove('is-invalid');
      }, 400);
      toast('Treść odpowiedzi nie może być pusta.', 'error');
      return;
    }

    var button = $('[data-detail="send"]');
    button.disabled = true;
    button.textContent = 'Wysyłanie...';

    window.setTimeout(function () {
      t.messages.push({
        from: 'Krzysztof Nowak',
        email: 'k.nowak@relay.local',
        at: now(),
        body: text,
        outgoing: true
      });
      t.modifiedAt = now();
      t.modifiedBy = 'k.nowak';
      if (t.status === 'Nowe') t.status = 'W toku';

      state.replyOpen = false;
      render();

      var thread = $('#thread');
      if (thread) thread.scrollTop = thread.scrollHeight;

      toast('Odpowiedź wysłana do <b>' + esc(t.contactEmail) + '</b>.', 'ok');
    }, 700);
  }

  function escalate() {
    var t = byId(state.selectedId);
    if (!t) return;

    openModal('Potwierdzenie eskalacji',
      '<p>Eskalować zgłoszenie <b>#' + t.id + '</b> do Wsparcia 2. linii?</p>' +
      '<p class="modal__hint">Obecny status: ' + esc(t.status) + ', kolejka: ' + esc(t.queue) + '. ' +
      'Priorytet zostanie podniesiony do „Wysoki”, a zgłoszenie zniknie z kolejki 1. linii. ' +
      'Operacja jest zapisywana w historii zgłoszenia.</p>',
      [{ label: 'Eskaluj', value: 'ok', primary: true }, { label: 'Anuluj', value: 'cancel' }]
    ).then(function (value) {
      if (value !== 'ok') return;

      t.status = 'Eskalacja';
      t.priority = 'Wysoki';
      t.queue = 'Wsparcie 2. linii';
      t.modifiedAt = now();
      t.modifiedBy = 'k.nowak';

      select(t.id, { quiet: true });
      toast('Zgłoszenie <b>#' + t.id + '</b> eskalowane do Wsparcia 2. linii.', 'ok');
    });
  }

  function closeDetail() {
    state.selectedId = null;
    state.replyOpen = false;
    render();
  }

  function filterByClient() {
    var t = byId(state.selectedId);
    if (!t) return;
    el.fQ.value = t.client;
    el.fQueue.value = '';
    refreshDirty();
    applyFilters();
  }

  /* ===================================================== settings / logout */

  function openSettings() {
    openModal('Ustawienia konsoli',
      '<label><input type="checkbox" id="s-refresh"' + (state.settings.autoRefresh ? ' checked' : '') + '>' +
        ' Automatyczne odświeżanie kolejki (co 20 s)</label>' +
      '<label><input type="checkbox" id="s-sla"' + (state.settings.liveSla ? ' checked' : '') + '>' +
        ' Licznik SLA odświeżany na żywo</label>' +
      '<label>Wiersze na stronę: <select id="s-size">' +
        [10, 25, 50, 100].map(function (n) {
          return '<option' + (n === state.pageSize ? ' selected' : '') + '>' + n + '</option>';
        }).join('') +
      '</select></label>' +
      '<p class="modal__hint">Ustawienia zapisywane są lokalnie w przeglądarce operatora.</p>',
      [{ label: 'Zapisz', value: 'ok', primary: true }, { label: 'Anuluj', value: 'cancel' }]
    ).then(function (value) {
      if (value !== 'ok') return;

      state.settings.autoRefresh = $('#s-refresh').checked;
      state.settings.liveSla = $('#s-sla').checked;
      state.pageSize = Number($('#s-size').value);
      el.pageSize.value = String(state.pageSize);
      saveSettings();

      state.page = 1;
      render();
      toast('Ustawienia zapisane.', 'ok');
    });
  }

  function logout() {
    openModal('Wylogowanie',
      '<p>Zakończyć sesję operatora <b>k.nowak</b>?</p>' +
      '<p class="modal__hint">Niezapisane odpowiedzi zostaną utracone.</p>',
      [{ label: 'Wyloguj', value: 'ok', primary: true }, { label: 'Anuluj', value: 'cancel' }]
    ).then(function (value) {
      if (value !== 'ok') return;
      document.body.innerHTML =
        '<div class="signout">' +
          '<h1>Sesja zakończona</h1>' +
          '<p>Zostałeś wylogowany z konsoli RELAY. ID sesji: ' + state.sessionId + '</p>' +
          '<button type="button" class="btn btn--primary" onclick="location.reload()">Zaloguj ponownie</button>' +
        '</div>';
    });
  }

  /* =================================================== incoming tickets */

  var MAX_INJECTED = 6;
  var injected = 0;

  function injectTicket() {
    if (injected >= MAX_INJECTED) return;
    injected++;

    var pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
    var client = pick(DATA.clients);
    var name = pick(DATA.firstNames) + ' ' + pick(DATA.lastNames);
    var maxId = DATA.tickets.reduce(function (m, t) { return Math.max(m, t.id); }, 0);
    var created = now();

    var ticket = {
      id: maxId + 1,
      subject: pick(DATA.subjects),
      client: client,
      contactName: name,
      contactEmail: name.toLowerCase().split(' ')[0][0] + '.' +
        name.toLowerCase().split(' ')[1].replace(/ł/g, 'l').normalize('NFD').replace(/[\u0300-\u036f]/g, '') +
        '@' + client.toLowerCase().replace(/ł/g, 'l').normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ')[0] + '.pl',
      status: 'Nowe',
      priority: pick(DATA.priorities),
      queue: 'Wsparcie 1. linii',
      createdAt: created,
      dueAt: created + (2 + Math.floor(Math.random() * 20)) * HOUR,
      dueStyle: 'countdown',
      modifiedAt: created,
      modifiedBy: 'system',
      messages: [{
        from: name,
        email: '',
        at: created,
        body: 'Dzień dobry,\n\nzgłoszenie utworzone automatycznie z formularza kontaktowego. ' +
          'Treść przekazana przez klienta jest w trakcie indeksowania.\n\nPozdrawiam,\n' + name,
        outgoing: false
      }]
    };
    ticket.messages[0].email = ticket.contactEmail;

    DATA.tickets.unshift(ticket);
    ticketIndex[ticket.id] = ticket;
    state.inbox.push(ticket.id);
    state.flash.push(ticket.id);

    // Only pull it straight into view when the operator is looking at the top
    // of the default listing — otherwise just flag it in the header.
    var atTop = state.page === 1 && state.sort.key === 'id' && state.sort.dir === 'desc';
    if (atTop && matches(ticket, state.applied)) render();
    else renderInbox();

    toast('Nowe zgłoszenie <b>#' + ticket.id + '</b> w kolejce: ' + esc(ticket.subject), 'warn');
  }

  function refreshInbox() {
    state.inbox = [];
    state.page = 1;
    state.sort = { key: 'id', dir: 'desc' };
    syncSortHeaders();
    render();
    toast('Lista odświeżona.', 'ok');
  }

  /* ================================================================ sort */

  function syncSortHeaders() {
    $$('.grid thead th').forEach(function (th) {
      var key = th.querySelector('button').getAttribute('data-sort');
      if (key === state.sort.key) th.setAttribute('aria-sort', state.sort.dir === 'asc' ? 'ascending' : 'descending');
      else th.removeAttribute('aria-sort');
    });
  }

  function sortBy(key) {
    if (state.sort.key === key) {
      state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      state.sort.key = key;
      // Text sorts read better ascending; everything else worst-first.
      state.sort.dir = (key === 'subject' || key === 'client') ? 'asc' : (key === 'id' ? 'desc' : 'asc');
    }
    state.page = 1;
    syncSortHeaders();
    render();
  }

  /* ================================================================ init */

  function fillSelects() {
    DATA.statuses.forEach(function (s) {
      el.fStatus.appendChild(new Option(s, s));
    });
    DATA.priorities.forEach(function (p) {
      el.fPriority.appendChild(new Option(p, p));
    });
    el.fQueue.appendChild(new Option('wszystkie kolejki', ''));
    DATA.queues.forEach(function (q) {
      el.fQueue.appendChild(new Option(q, q));
    });
  }

  function wire() {
    /* --- module navigation (sidebar, breadcrumbs, dashboard links) --- */
    document.addEventListener('click', function (event) {
      if (!event.target.closest) return;
      var link = event.target.closest('[data-module]');
      if (!link) return;
      event.preventDefault();
      showModule(link.getAttribute('data-module'));
    });

    /* --- account menu --- */
    $$('[data-action]').forEach(function (link) {
      link.addEventListener('click', function (event) {
        event.preventDefault();
        var action = link.getAttribute('data-action');
        if (action === 'settings') openSettings();
        if (action === 'logout') logout();
      });
    });

    /* --- filters --- */
    el.filters.addEventListener('submit', function (event) {
      event.preventDefault();
      applyFilters();
    });

    el.filters.addEventListener('reset', function (event) {
      event.preventDefault();
      writeForm(DEFAULT_FILTERS);
      refreshDirty();
      applyFilters();
    });

    el.filters.addEventListener('input', refreshDirty);
    el.filters.addEventListener('change', refreshDirty);

    /* --- grid: sorting --- */
    $$('.grid thead button').forEach(function (button) {
      button.addEventListener('click', function () { sortBy(button.getAttribute('data-sort')); });
    });

    /* --- grid: row selection --- */
    el.body.addEventListener('click', function (event) {
      var row = event.target.closest('tr[data-id]');
      if (!row) return;
      select(Number(row.getAttribute('data-id')), { quiet: true });
      el.body.focus({ preventScroll: true });
    });

    el.body.addEventListener('keydown', function (event) {
      var handled = true;
      switch (event.key) {
        case 'ArrowDown': moveSelection(1); break;
        case 'ArrowUp':   moveSelection(-1); break;
        case 'PageDown':  goToPage(state.page + 1); break;
        case 'PageUp':    goToPage(state.page - 1); break;
        case 'Home':      goToPage(1); break;
        case 'End':       goToPage(Math.ceil(results().length / state.pageSize)); break;
        default: handled = false;
      }
      if (handled) event.preventDefault();
    });

    /* --- pagination --- */
    el.pager.addEventListener('click', function (event) {
      var link = event.target.closest('[data-page]');
      if (!link) return;
      event.preventDefault();
      goToPage(Number(link.getAttribute('data-page')));
    });

    el.pageSize.addEventListener('change', function () {
      state.pageSize = Number(el.pageSize.value);
      state.page = 1;
      saveSettings();
      render();
    });

    /* --- detail panel (delegated: the panel is re-rendered often) --- */
    el.detail.addEventListener('click', function (event) {
      var goto = event.target.closest('[data-goto]');
      if (goto) {
        event.preventDefault();
        select(Number(goto.getAttribute('data-goto')));
        return;
      }

      var action = event.target.closest('[data-detail]');
      if (!action) return;
      var kind = action.getAttribute('data-detail');
      if (kind === 'print' || kind === 'close' || kind === 'client') event.preventDefault();

      if (kind === 'print')        window.print();
      if (kind === 'close')        closeDetail();
      if (kind === 'client')       filterByClient();
      if (kind === 'reply')        openReply();
      if (kind === 'send')         sendReply();
      if (kind === 'escalate')     escalate();
      if (kind === 'cancel-reply') { state.replyOpen = false; renderDetail(); }
    });

    el.detail.addEventListener('input', function (event) {
      if (event.target.id === 'reply-body') updateCharCount();
    });

    el.detail.addEventListener('change', function (event) {
      if (event.target.id !== 'reply-tpl') return;
      var key = event.target.value;
      if (!key) return;
      var ta = $('#reply-body');
      ta.value = TEMPLATES[key];
      ta.focus();
      updateCharCount();
    });

    /* --- inbox badge --- */
    el.newBadge.addEventListener('click', function (event) {
      event.preventDefault();
      refreshInbox();
    });

    /* --- modal --- */
    el.modal.addEventListener('click', function (event) {
      var button = event.target.closest('[data-modal]');
      if (button) { closeModal(button.getAttribute('data-modal')); return; }
      if (event.target === el.modal) closeModal('cancel');
    });

    /* --- global keyboard shortcuts --- */
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        if (!el.modal.hidden) { closeModal('cancel'); return; }
        if (state.replyOpen)   { state.replyOpen = false; renderDetail(); }
        return;
      }

      var inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (event.key === '/' && !inField) {
        event.preventDefault();
        el.fQ.focus();
        el.fQ.select();
      }
    });
  }

  function init() {
    el = {
      count:        $('#record-count'),
      newBadge:     $('#new-badge'),
      filters:      $('#filters'),
      fStatus:      $('#f-status'),
      fPriority:    $('#f-priority'),
      fQueue:       $('#f-queue'),
      fQ:           $('#f-q'),
      hint:         $('#filters-hint'),
      btnFilter:    $('#btn-filter'),
      body:         $('#grid-body'),
      pager:        $('#pager'),
      pageSize:     $('#page-size'),
      loader:       $('#loader'),
      detail:       $('#detail'),
      toasts:       $('#toasts'),
      modal:        $('#modal'),
      modalTitle:   $('#modal-title'),
      modalBody:    $('#modal-body'),
      modalActions: $('#modal-actions')
    };

    loadSettings();
    fillSelects();
    writeForm(state.applied);
    el.pageSize.value = String(state.pageSize);
    syncSortHeaders();
    wire();
    render();

    window.setInterval(tickSla, 1000);
    window.setInterval(function () {
      if (state.settings.autoRefresh && !state.busy && el.modal.hidden) injectTicket();
    }, 20000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
