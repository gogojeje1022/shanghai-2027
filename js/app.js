import { TRIP, CATS, AREAS, PLACES, INTERESTS, DEFAULT_CHECKLIST, AIRPORT } from './data.js';
import { createStore } from './store.js';
import { recommend } from './recommend.js';
import { makeMap, setLayer, LAYERS, travel, amapMarker, amapRoute, searchPlace, pinIcon } from './map.js';
import { firebaseConfig } from '../firebase-config.js';
import {
  uid, esc, toMin, fmt, snap, clamp, dayLabel, durLabel, shanghaiNow, dday, linkInfo, fetchLinkTitle,
  mapLinks, tripSearchUrl, parseBookingText, nightsBetween, won, yuan, youtubeId,
} from './utils.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const PEOPLE = Object.fromEntries(TRIP.people.map((p) => [p.id, p]));
const ALL = TRIP.people.map((p) => p.id);

// ---------- 공유 키 (#t=xxxx) ----------
function getTripKey() {
  const m = location.hash.match(/t=([\w-]{8,})/);
  if (m) {
    localStorage.setItem('sh2027:key', m[1]);
    return m[1];
  }
  let k = localStorage.getItem('sh2027:key');
  if (!k) {
    k = 'sh27-' + crypto.getRandomValues(new Uint32Array(4)).reduce((a, n) => a + n.toString(36), '');
    localStorage.setItem('sh2027:key', k);
  }
  history.replaceState(null, '', `#t=${k}`);
  return k;
}

const ui = {
  tab: localStorage.getItem('sh2027:tab') || 'plan',
  me: localStorage.getItem('sh2027:me') || '',
  filter: 'all',
  view: localStorage.getItem('sh2027:view') || 'grid',
  mDay: 0,
  dragging: false,
  status: ['local', ''],
};
let store;
let D = { items: {}, hotels: {}, ideas: {}, checklist: {}, expenses: {}, settings: {}, snapshots: {}, presence: {}, chat: {} };
const settings = () => D.settings.main || {};
const placeById = (id) => PLACES.find((p) => p.id === id);
// 일정/아이디어/숙소의 좌표: 직접 찍은 위치 > 장소DB 위치
const locOf = (x) => x?.loc || placeById(x?.placeId)?.loc || null;
const DAY_COLORS = ['#ef4444', '#2563eb', '#059669', '#d97706'];

// 같은 날 앞 일정에서 이 일정까지의 이동 정보
function legBefore(it, list) {
  const idx = list.findIndex((x) => x.id === it.id);
  for (let j = idx - 1; j >= 0; j--) {
    const prev = list[j];
    const a = locOf(prev);
    if (!a) continue;
    const b = locOf(it);
    const t = travel(a, b);
    if (!t) return null;
    return { ...t, prev, gap: it.start - prev.end, short: t.min > 0 && it.start - prev.end < t.min - 5 };
  }
  return null;
}

// ---------- 공통 ----------
function toast(msg, action) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span>${esc(msg)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => {
      action.fn();
      t.remove();
    };
    t.append(b);
  }
  $('#toasts').append(t);
  setTimeout(() => t.remove(), action ? action.ms || 6000 : 2500);
}

function stamp(obj) {
  return { ...obj, updatedBy: ui.me || null, updatedAt: Date.now() };
}
function put(coll, obj) {
  store.put(coll, stamp(obj));
}
function removeWithUndo(coll, id, label) {
  const prev = D[coll][id];
  store.del(coll, id);
  toast(`${label} 삭제됨`, { label: '되돌리기', fn: () => store.put(coll, prev) });
}
// 일정 전체를 next 로 바꾼다 (바뀐 것만 한 번에 저장) + 되돌리기
function itemOps(cur, next) {
  const ops = [];
  for (const id of Object.keys(cur)) if (!next[id]) ops.push({ coll: 'items', id });
  for (const [id, obj] of Object.entries(next))
    if (!cur[id] || JSON.stringify(cur[id]) !== JSON.stringify(obj)) ops.push({ coll: 'items', id, obj });
  return ops;
}
function replaceItems(next, msg) {
  const prev = { ...D.items };
  store.batch(itemOps(prev, next));
  toast(msg, { label: '되돌리기', ms: 10000, fn: () => (store.batch(itemOps(D.items, prev)), toast('되돌렸어요')) });
}

function avatar(pid, size = '') {
  const p = PEOPLE[pid];
  if (!p) return '';
  return `<span class="av ${size}" style="--c:${p.color}" title="${p.name}">${p.name[0]}</span>`;
}
function whoDots(who) {
  const w = who?.length ? who : ALL;
  if (w.length === ALL.length) return '<span class="who-all">👥</span>';
  return w.map((id) => avatar(id, 'xs')).join('');
}

function openModal(html, { wide = false, onClose } = {}) {
  closeModal();
  const wrap = document.createElement('div');
  wrap.className = 'modal-bg';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog">${html}</div>`;
  wrap.addEventListener('mousedown', (e) => {
    if (e.target === wrap) closeModal();
  });
  wrap._onClose = onClose;
  document.body.append(wrap);
  document.body.classList.add('noscroll');
  setTimeout(() => $('input:not([type=hidden]),textarea', wrap)?.focus?.(), 30);
  return $('.modal', wrap);
}
function closeModal() {
  const m = $('.modal-bg');
  if (m) {
    m._onClose?.();
    m.remove();
  }
  document.body.classList.remove('noscroll');
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

// ---------- 헤더 ----------
function renderHeader() {
  const dd = dday(TRIP.days[0]);
  const ddTxt = dd > 0 ? `D-${dd}` : dd === 0 ? 'D-DAY' : dd >= -3 ? `여행 ${1 - dd}일차` : '다녀왔어요';
  const [st, msg] = ui.status;
  $('#hdr').innerHTML = `
    <div class="hdr-l">
      <h1>🥟 ${esc(settings().title || TRIP.title)}</h1>
      <div class="sub">2/26(금) – 3/1(월) · 3박 4일 · <b>${ddTxt}</b></div>
    </div>
    <div class="hdr-r">
      <span class="sync ${st}" title="${esc(msg)}"><i></i>${st === 'live' ? '공유 중' : st === 'offline' ? '오프라인' : st === 'error' ? '오류' : '로컬'}</span>
      <div class="me-pick" title="나는 누구?">
        ${TRIP.people.map((p) => {
          const seen = lastSeen(p.id);
          return `<button class="av-btn ${ui.me === p.id ? 'on' : ''}" data-me="${p.id}" style="--c:${p.color}" title="${seen.title}">${p.name}<small class="seen ${seen.on ? 'on' : ''}">${seen.label}</small></button>`;
        }).join('')}
      </div>
    </div>`;
  $$('[data-me]').forEach((b) =>
    (b.onclick = () => {
      ui.me = b.dataset.me;
      localStorage.setItem('sh2027:me', ui.me);
      heartbeat();
      render();
    }),
  );
}

// ---------- 마지막 접속 ----------
function lastSeen(pid) {
  const at = D.presence[pid]?.at;
  if (!at) return { label: '접속 기록 없음', title: '아직 접속한 적 없음', on: false };
  const min = Math.floor((Date.now() - at) / 60000);
  const title = `마지막 접속: ${new Date(at).toLocaleString('ko-KR')}`;
  if (min < 3) return { label: '● 접속 중', title, on: true };
  if (min < 60) return { label: `${min}분 전`, title };
  if (min < 24 * 60) return { label: `${Math.floor(min / 60)}시간 전`, title };
  if (min < 7 * 24 * 60) return { label: `${Math.floor(min / 1440)}일 전`, title };
  return { label: new Date(at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }), title };
}
function heartbeat() {
  if (!ui.me || document.hidden) return;
  const prev = D.presence[ui.me]?.at || 0;
  if (Date.now() - prev < 60000) return; // 1분에 한 번만 기록
  store.put('presence', { id: ui.me, at: Date.now() });
}

function renderTabs() {
  const tabs = [
    ['plan', '🗓️', '일정'], ['map', '🗺️', '지도'], ['ideas', '💡', '가고싶은 곳'], ['hotel', '🏨', '숙소'],
    ['money', '💰', '경비'], ['prep', '✅', '준비'], ['more', '⚙️', '설정'],
  ];
  $('#tabs').innerHTML = tabs
    .map(([k, i, l]) => `<button class="${ui.tab === k ? 'on' : ''}" data-tab="${k}"><span>${i}</span>${l}</button>`)
    .join('');
  $$('[data-tab]').forEach((b) =>
    (b.onclick = () => {
      ui.tab = b.dataset.tab;
      localStorage.setItem('sh2027:tab', ui.tab);
      render();
      window.scrollTo({ top: 0 });
    }),
  );
}

// ---------- 일정 ----------
const PPM = () => (window.innerWidth < 760 ? 1.15 : 1.0); // px per minute

function visibleItems(day) {
  return Object.values(D.items)
    .filter((i) => i.day === day)
    .filter((i) => ui.filter === 'all' || !i.who?.length || i.who.includes(ui.filter))
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

function layoutLanes(list) {
  const res = new Map();
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = [];
    for (const it of cluster) {
      let l = lanes.findIndex((end) => end <= it.start);
      if (l < 0) {
        l = lanes.length;
        lanes.push(0);
      }
      lanes[l] = it.end;
      res.set(it.id, { lane: l });
    }
    for (const it of cluster) res.get(it.id).lanes = lanes.length;
    cluster = [];
  };
  for (const it of list) {
    if (it.start >= clusterEnd && cluster.length) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  if (cluster.length) flush();
  return res;
}

function blockHTML(it, lay, list) {
  const c = CATS[it.cat] || CATS.etc;
  const leg = legBefore(it, list);
  const warn = leg?.short ? `<span class="warn-dot" title="앞 일정(${esc(leg.prev.title)})에서 이동 약 ${leg.min}분 필요">⚠️${leg.min}분</span>` : '';
  const ppm = PPM();
  const top = (it.start - TRIP.dayStart) * ppm;
  const h = Math.max(18, (it.end - it.start) * ppm - 2);
  const w = 100 / lay.lanes;
  const yt = (it.links || []).some((l) => youtubeId(l.url));
  const short = it.end - it.start <= 35;
  return `<div class="block ${short ? 'short' : ''} ${it.locked ? 'locked' : ''} ${ui.sel?.has(it.id) ? 'sel' : ''}" data-id="${it.id}"
      style="top:${top}px;height:${h}px;left:calc(${w * lay.lane}% + 2px);width:calc(${w}% - 4px);--c:${c.color}">
      <div class="grip" title="끌어서 이동">⋮⋮</div>
      <div class="b-title">${warn}${c.icon} ${esc(it.title)}${yt ? ' <span class="yt-dot">▶</span>' : ''}</div>
      <div class="b-meta">${fmt(it.start)}–${fmt(it.end)} ${whoDots(it.who)}</div>
      ${it.cn && !short ? `<div class="b-cn">${esc(it.cn)}</div>` : ''}
      <div class="resize" title="끌어서 시간 조절"></div>
    </div>`;
}

function renderPlan(el) {
  const days = TRIP.days;
  const mobile = window.innerWidth < 760;
  const showDays = mobile && ui.view === 'grid' ? [days[ui.mDay]] : days;
  const hours = [];
  for (let h = TRIP.dayStart / 60; h < TRIP.dayEnd / 60; h++) hours.push(h);
  const ppm = PPM();
  const now = shanghaiNow();

  const toolbar = `
    <div class="toolbar">
      <button class="btn primary" id="btn-reco">✨ 추천 일정 만들기</button>
      <button class="btn" id="btn-add">＋ 일정 추가</button>
      <button class="btn" id="btn-snap">💾 저장함 <small class="muted">${Object.keys(D.snapshots).length}/${SNAP_MAX}</small></button>
      <button class="btn" id="btn-clear">🧹 비우기</button>
      <button class="btn ${ui.sel ? 'on' : ''}" id="btn-sel">☑️ 골라서 삭제</button>
      <div class="seg" id="filter">
        <button data-f="all" class="${ui.filter === 'all' ? 'on' : ''}">모두</button>
        ${TRIP.people.map((p) => `<button data-f="${p.id}" class="${ui.filter === p.id ? 'on' : ''}" style="--c:${p.color}">${p.name}</button>`).join('')}
      </div>
      <div class="seg" id="viewseg">
        <button data-v="grid" class="${ui.view === 'grid' ? 'on' : ''}">시간표</button>
        <button data-v="list" class="${ui.view === 'list' ? 'on' : ''}">목록</button>
      </div>
    </div>
    ${ui.sel ? `<div class="sel-bar">
      <b>${ui.sel.size}개 선택</b><span class="muted small">일정을 눌러서 고르세요</span><span class="sp"></span>
      <button class="chip" id="sel-all">${showDays.length === 1 ? '이 날' : '보이는 것'} 모두</button>
      <button class="chip" id="sel-none">선택 해제</button>
      <button class="btn danger" id="sel-del" ${ui.sel.size ? '' : 'disabled'}>🗑 ${ui.sel.size}개 삭제</button>
      <button class="btn" id="sel-done">완료</button>
    </div>` : ''}
    <div class="day-chips ${mobile && ui.view === 'grid' ? '' : 'hide'}">
      ${days.map((d, i) => `<button data-md="${i}" class="${i === ui.mDay ? 'on' : ''}">Day${i + 1}<small>${dayLabel(d)}</small></button>`).join('')}
    </div>`;

  if (ui.view === 'list') {
    el.innerHTML = toolbar + renderList(days);
  } else {
    el.innerHTML = `${toolbar}
      <div class="grid-wrap">
        <div class="grid" style="--cols:${showDays.length}">
          <div class="g-head-spacer"></div>
          ${showDays.map((d) => `<div class="g-head">${dayHead(d)}</div>`).join('')}
          <div class="g-times" style="height:${(TRIP.dayEnd - TRIP.dayStart) * ppm}px">
            ${hours.map((h) => `<div style="top:${(h * 60 - TRIP.dayStart) * ppm}px">${String(h).padStart(2, '0')}:00</div>`).join('')}
          </div>
          ${showDays
            .map((d) => {
              const list = visibleItems(d);
              const lay = layoutLanes(list);
              const nowLine =
                now.date === d && now.min >= TRIP.dayStart && now.min < TRIP.dayEnd
                  ? `<div class="now" style="top:${(now.min - TRIP.dayStart) * ppm}px"></div>`
                  : '';
              return `<div class="day-col" data-day="${d}" style="height:${(TRIP.dayEnd - TRIP.dayStart) * ppm}px;--hh:${60 * ppm}px">
                ${nowLine}${list.map((it) => blockHTML(it, lay.get(it.id), list)).join('')}
              </div>`;
            })
            .join('')}
        </div>
      </div>
      <p class="hint">빈 칸을 클릭하면 일정 추가 · 블록을 끌어서 이동(모바일은 ⋮⋮ 손잡이) · 아래 모서리를 끌어 시간 조절 · 모든 시간은 <b>현지(한국-1시간)</b></p>`;
    bindGrid(el);
    const wrap = $('.grid-wrap', el);
    if (wrap && !ui._scrolled) {
      wrap.scrollTop = (8 * 60 - TRIP.dayStart) * ppm;
      ui._scrolled = true;
    }
  }

  $('#btn-reco', el).onclick = openRecommend;
  $('#btn-snap', el).onclick = openSnapshots;
  $('#btn-clear', el).onclick = openClear;
  $('#btn-sel', el).onclick = () => ((ui.sel = ui.sel ? null : new Set()), render());
  if (ui.sel) {
    const shown = showDays.flatMap((d) => visibleItems(d).map((i) => i.id));
    $('#sel-all', el).onclick = () => (shown.forEach((id) => ui.sel.add(id)), render());
    $('#sel-none', el).onclick = () => (ui.sel.clear(), render());
    $('#sel-done', el).onclick = () => ((ui.sel = null), render());
    $('#sel-del', el).onclick = () => {
      const n = ui.sel.size;
      const next = { ...D.items };
      ui.sel.forEach((id) => delete next[id]);
      ui.sel = null;
      replaceItems(next, `${n}개 일정 삭제됨`);
    };
  }
  $('#btn-add', el).onclick = () => openItem({ day: showDays[0], start: 10 * 60, end: 11 * 60 });
  $$('[data-f]', el).forEach((b) => (b.onclick = () => ((ui.filter = b.dataset.f), render())));
  $$('[data-v]', el).forEach(
    (b) => (b.onclick = () => ((ui.view = b.dataset.v), localStorage.setItem('sh2027:view', ui.view), render())),
  );
  $$('[data-md]', el).forEach((b) => (b.onclick = () => ((ui.mDay = +b.dataset.md), render())));
  $$('[data-open]', el).forEach((b) => (b.onclick = (e) => {
    if (e.target.closest('a,button')) return;
    if (ui.sel) return toggleSel(b.dataset.open);
    openItem(D.items[b.dataset.open]);
  }));
  $$('[data-showmap]', el).forEach((b) => (b.onclick = () => showOnMap(D.items[b.dataset.showmap])));
  bindYT(el);
}

function toggleSel(id) {
  if (ui.sel.has(id)) ui.sel.delete(id);
  else ui.sel.add(id);
  render();
}

// ----- 일정 저장함 (최대 10개, 셋이 공유) -----
const SNAP_MAX = 10;
const keepItem = (i) => i.locked || /^h(in|out)-/.test(i.id);
const shortDate = (t) => new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function openSnapshots() {
  const snaps = Object.values(D.snapshots).sort((a, b) => b.createdAt - a.createdAt);
  const full = snaps.length >= SNAP_MAX;
  const cur = Object.values(D.items);
  const m = openModal(`
    <div class="m-head"><h2>💾 일정 저장함 <small class="muted">${snaps.length}/${SNAP_MAX}</small></h2><button class="x-btn" data-close>✕</button></div>
    <p class="muted">지금 시간표를 통째로 저장해두고 언제든 다시 불러올 수 있어요. 셋이 같이 보는 저장함이에요.</p>
    <form class="row-form" id="snap-form">
      <input name="name" maxlength="40" placeholder="이름 (예: 디즈니 버전, 쇼핑 위주)">
      <button class="btn primary" ${full ? 'disabled' : ''}>현재 일정 저장 (${cur.length}개)</button>
    </form>
    ${full ? '<p class="warn small">10개가 꽉 찼어요. 안 쓰는 걸 삭제하거나 “덮어쓰기”를 써주세요.</p>' : ''}
    <div class="snap-list">
      ${snaps.length ? '' : '<p class="empty">아직 저장한 일정이 없어요</p>'}
      ${snaps
        .map((sn) => `<div class="snap">
          <div class="snap-main">
            <b>${esc(sn.name)}</b>
            <small>${shortDate(sn.createdAt)} · ${PEOPLE[sn.by]?.name || '누군가'} · ${sn.items.length}개 (날짜별 ${TRIP.days.map((d) => sn.items.filter((i) => i.day === d).length).join('·')})</small>
          </div>
          <div class="snap-act">
            <button class="btn primary" data-sload="${sn.id}">불러오기</button>
            <button class="chip" data-sover="${sn.id}">덮어쓰기</button>
            <button class="chip" data-sren="${sn.id}">이름</button>
            <button class="chip danger" data-sdel="${sn.id}">삭제</button>
          </div>
          <details class="snap-more"><summary>내용 보기</summary>${TRIP.days
            .map((d, i) => {
              const l = sn.items.filter((x) => x.day === d).sort((a, b) => a.start - b.start);
              return `<div class="snap-day"><b>Day${i + 1}</b> ${l.length ? l.map((x) => `${fmt(x.start)} ${esc(x.title)}`).join(' · ') : '<span class="muted">비어 있음</span>'}</div>`;
            })
            .join('')}</details>
        </div>`)
        .join('')}
    </div>`, { wide: true });
  $$('[data-close]', m).forEach((b) => (b.onclick = closeModal));
  const snapItems = () => Object.values(D.items).map((i) => ({ ...i }));
  $('#snap-form', m).onsubmit = (e) => {
    e.preventDefault();
    if (Object.keys(D.snapshots).length >= SNAP_MAX) return toast('10개가 꽉 찼어요');
    const name = e.target.name.value.trim() || `${PEOPLE[ui.me]?.name || ''} 저장 ${shortDate(Date.now())}`.trim();
    put('snapshots', { id: uid(), name, items: snapItems(), createdAt: Date.now(), by: ui.me });
    toast(`“${name}” 저장했어요`);
    openSnapshots();
  };
  $$('[data-sload]', m).forEach((b) => (b.onclick = () => {
    const sn = D.snapshots[b.dataset.sload];
    if (!confirm(`“${sn.name}”(${sn.items.length}개)으로 시간표를 바꿀까요?\n지금 일정은 이 버전으로 바뀌어요. (10초 안에 되돌리기 가능)`)) return;
    closeModal();
    replaceItems(Object.fromEntries(sn.items.map((i) => [i.id, i])), `“${sn.name}” 불러왔어요`);
  }));
  $$('[data-sover]', m).forEach((b) => (b.onclick = () => {
    const sn = D.snapshots[b.dataset.sover];
    if (!confirm(`“${sn.name}”을 지금 일정(${Object.keys(D.items).length}개)으로 덮어쓸까요?`)) return;
    put('snapshots', { ...sn, items: snapItems(), createdAt: Date.now(), by: ui.me });
    toast('덮어썼어요');
    openSnapshots();
  }));
  $$('[data-sren]', m).forEach((b) => (b.onclick = () => {
    const sn = D.snapshots[b.dataset.sren];
    const name = prompt('새 이름', sn.name)?.trim();
    if (!name) return;
    put('snapshots', { ...sn, name });
    openSnapshots();
  }));
  $$('[data-sdel]', m).forEach((b) => (b.onclick = () => {
    const sn = D.snapshots[b.dataset.sdel];
    if (!confirm(`저장본 “${sn.name}”을 삭제할까요?`)) return;
    removeWithUndo('snapshots', sn.id, `“${sn.name}”`);
    openSnapshots();
  }));
}

// ----- 일정 비우기 -----
function openClear() {
  const all = Object.values(D.items);
  const canSave = Object.keys(D.snapshots).length < SNAP_MAX;
  const m = openModal(`
    <div class="m-head"><h2>🧹 일정 비우기</h2><button class="x-btn" data-close>✕</button></div>
    <form class="form" id="clear-form">
      <div class="full"><b>무엇을 비울까요?</b>
        <div class="chips-pick">
          <label><input type="radio" name="scope" value="all" checked><span>전체 4일</span></label>
          ${TRIP.days.map((d, i) => `<label><input type="radio" name="scope" value="${d}"><span>Day${i + 1} ${dayLabel(d)}</span></label>`).join('')}
          <label><input type="radio" name="scope" value="auto"><span>✨ 추천으로 넣은 것만</span></label>
        </div>
      </div>
      <label class="full inline"><input type="checkbox" name="keep" checked> ✈️ 항공·공항·숙소 체크인/아웃 일정은 남기기</label>
      <label class="full inline"><input type="checkbox" name="save" ${canSave ? 'checked' : 'disabled'}> 💾 비우기 전에 지금 일정을 저장함에 저장 ${canSave ? '' : '<small class="muted">(저장함이 꽉 찼어요)</small>'}</label>
      <p class="full warn" id="clear-count"></p>
      <div class="full m-actions"><span class="sp"></span><button type="button" class="btn" data-close>취소</button><button class="btn danger" id="clear-go">🧹 비우기</button></div>
    </form>`);
  $$('[data-close]', m).forEach((b) => (b.onclick = closeModal));
  const f = $('#clear-form', m);
  const targets = () => {
    const sc = f.scope.value;
    return all.filter((i) => (sc === 'all' || (sc === 'auto' ? i.auto : i.day === sc)) && !(f.keep.checked && keepItem(i)));
  };
  const upd = () => {
    const n = targets().length;
    $('#clear-count', m).textContent = n ? `${n}개 일정이 지워져요 (지운 뒤 10초 안에 되돌리기 가능)` : '지울 일정이 없어요';
    $('#clear-go', m).disabled = !n;
  };
  f.onchange = upd;
  upd();
  f.onsubmit = (e) => {
    e.preventDefault();
    const del = targets();
    if (!del.length) return;
    if (f.save.checked && !f.save.disabled)
      put('snapshots', { id: uid(), name: `비우기 전 자동저장 ${shortDate(Date.now())}`, items: all.map((i) => ({ ...i })), createdAt: Date.now(), by: ui.me });
    const next = { ...D.items };
    del.forEach((i) => delete next[i.id]);
    closeModal();
    replaceItems(next, `${del.length}개 일정을 비웠어요`);
  };
}

function showOnMap(it) {
  ui.tab = 'map';
  ui.mapDay = TRIP.days.indexOf(it.day);
  ui.mapFocus = it.id;
  localStorage.setItem('sh2027:tab', 'map');
  closeModal();
  render();
  window.scrollTo({ top: 0 });
}

// ---------- 지도 탭 ----------
const MV = { map: null, el: null, layers: null };

function renderMap(el) {
  const L = window.L;
  if (!L) {
    el.innerHTML = '<p class="empty">지도 라이브러리를 불러오지 못했어요 (인터넷 연결 확인)</p>';
    return;
  }
  const mapDay = ui.mapDay ?? -1; // -1 = 전체
  const show = ui.mapShow || (ui.mapShow = { ideas: true, lib: false, hotels: true });
  const layerKey = localStorage.getItem('sh2027:layer') || 'amap';
  el.innerHTML = `
    <div class="map-bar">
      <form class="map-search" id="msearch">
        <input id="msq" placeholder="🔍 장소 검색 – 中文 · English · 한국어 (예: 豫园, Yu Garden, 와이탄)" value="${esc(ui.mapSearch?.q || '')}" autocomplete="off">
        <button class="btn primary">검색</button>
        ${ui.mapSearch ? '<button type="button" class="btn" id="msclear">✕</button>' : ''}
      </form>
      <div class="seg wrap" id="mday">
        <button data-mday="-1" class="${mapDay === -1 ? 'on' : ''}">전체</button>
        ${TRIP.days.map((d, i) => `<button data-mday="${i}" class="${mapDay === i ? 'on' : ''}" style="--c:${DAY_COLORS[i]}"><i class="dot" style="background:${DAY_COLORS[i]}"></i>Day${i + 1} ${dayLabel(d)}</button>`).join('')}
      </div>
      <div class="map-tools">
        <label class="tog"><input type="checkbox" data-show="hotels" ${show.hotels ? 'checked' : ''}>🏨 숙소</label>
        <label class="tog"><input type="checkbox" data-show="ideas" ${show.ideas ? 'checked' : ''}>💡 찜</label>
        <label class="tog"><input type="checkbox" data-show="lib" ${show.lib ? 'checked' : ''}>📚 추천장소</label>
        <select id="mlayer">${Object.entries(LAYERS).map(([k, v]) => `<option value="${k}" ${k === layerKey ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
        <button class="chip" data-fit="city">시내</button>
        <button class="chip" data-fit="near">근교까지</button>
        <button class="chip ${ui.pinEdit ? 'on' : ''}" id="pinedit" title="일정 핀을 끌어서 위치 보정">✋ 핀 옮기기 ${ui.pinEdit ? 'ON' : ''}</button>
      </div>
    </div>
    <div class="map-layout">
      <div id="map-slot"></div>
      <aside class="map-side" id="map-side"></aside>
    </div>`;

  if (!MV.el) {
    MV.el = document.createElement('div');
    MV.el.id = 'bigmap';
    $('#map-slot', el).append(MV.el);
    MV.map = makeMap(MV.el, { layer: layerKey });
    MV.layers = L.layerGroup().addTo(MV.map);
    MV.el.addEventListener('click', onMapPopupClick);
    MV.firstFit = true;
  } else {
    $('#map-slot', el).append(MV.el);
    if (MV.map._layerKey !== layerKey) setLayer(MV.map, layerKey);
  }
  drawMapLayers(el, mapDay, show);
  setTimeout(() => {
    MV.map.invalidateSize();
    if (MV.pendingFit) {
      const b = MV.pendingFit;
      MV.pendingFit = null;
      if (typeof b === 'string') focusMarker(b);
      else MV.map.fitBounds(b, { padding: [40, 40], maxZoom: 15 });
    }
  }, 0);

  $$('[data-mday]', el).forEach((b) => (b.onclick = () => {
    ui.mapDay = +b.dataset.mday;
    ui.mapFocus = null;
    MV.firstFit = true;
    render();
  }));
  $$('[data-show]', el).forEach((c) => (c.onchange = () => ((show[c.dataset.show] = c.checked), render())));
  $('#mlayer', el).onchange = (e) => {
    localStorage.setItem('sh2027:layer', e.target.value);
    setLayer(MV.map, e.target.value);
    render();
  };
  $$('[data-fit]', el).forEach((b) => (b.onclick = () => {
    if (b.dataset.fit === 'city') MV.map.setView(MV.map._toView([31.225, 121.475]), 13);
    else MV.map.fitBounds([MV.map._toView([30.2, 120.1]), MV.map._toView([31.4, 121.75])]);
  }));
  $('#pinedit', el).onclick = () => ((ui.pinEdit = !ui.pinEdit), render());
  $('#msearch', el).onsubmit = (e) => {
    e.preventDefault();
    runMapSearch($('#msq', el).value.trim());
  };
  $('#msclear', el)?.addEventListener('click', () => ((ui.mapSearch = null), render()));
}

// 지도 검색: 앱 장소DB + 고덕(키 있으면) / OSM
async function runMapSearch(q) {
  if (!q) return;
  const ql = q.toLowerCase();
  const local = PLACES.filter((p) => p.loc && [p.name, p.cn, p.id].some((t) => t?.toLowerCase().includes(ql))).map((p) => ({
    name: p.name, cn: p.cn, en: '', addr: AREAS[p.area] || '', loc: p.loc, src: '앱 추천장소', placeId: p.id,
  }));
  ui.mapSearch = { q, results: local, loading: true };
  render();
  let remote = [];
  let failed = false;
  try {
    remote = await searchPlace(q, { amapKey: settings().amapKey });
  } catch {
    failed = true;
  }
  if (ui.mapSearch?.q !== q) return;
  ui.mapSearch = { q, results: [...local, ...remote], failed };
  MV.pendingFit = null;
  const pts = ui.mapSearch.results.map((r) => MV.map._toView(r.loc));
  if (pts.length === 1) MV.map.setView(pts[0], 16);
  else if (pts.length) MV.map.fitBounds(pts, { padding: [40, 40], maxZoom: 16 });
  render();
}

function drawMapLayers(el, mapDay, show) {
  const L = window.L;
  const map = MV.map;
  const V = map._toView;
  MV.layers.clearLayers();
  MV.markers = {};
  const bounds = [];
  const side = [];
  const days = mapDay === -1 ? TRIP.days : [TRIP.days[mapDay]];
  const usedPlaces = new Set();

  days.forEach((d) => {
    const di = TRIP.days.indexOf(d);
    const color = DAY_COLORS[di];
    const list = visibleItems(d);
    const pts = [];
    let n = 0;
    side.push(`<h4 style="color:${color}">Day ${di + 1} · ${dayLabel(d)}</h4>`);
    list.forEach((it) => {
      const loc = locOf(it);
      if (it.placeId) usedPlaces.add(it.placeId);
      const c = CATS[it.cat] || CATS.etc;
      if (!loc) {
        side.push(`<div class="ms-row noloc" data-open="${it.id}"><span class="num">·</span><div><b>${c.icon} ${esc(it.title)}</b><small>${fmt(it.start)} · 📍위치 없음 (탭해서 지정)</small></div></div>`);
        return;
      }
      n++;
      const last = pts[pts.length - 1];
      if (last && last[0] === loc[0] && last[1] === loc[1]) {
        // 같은 장소 연속(공항 등)은 번호만 이어서
      } else pts.push(loc);
      const leg = legBefore(it, list);
      const mk = L.marker(V(loc), { icon: pinIcon({ color, text: n }), draggable: !!ui.pinEdit, zIndexOffset: 1000 }).addTo(MV.layers);
      mk.bindPopup(
        `<div class="pop"><b>${c.icon} ${esc(it.title)}</b><div>${dayLabel(d)} ${fmt(it.start)}–${fmt(it.end)}</div>
         ${it.cn ? `<div class="pop-cn">${esc(it.cn)}</div>` : ''}
         ${leg && leg.min ? `<div class="small">← ${esc(leg.prev.title)}에서 ${leg.label} 약 ${leg.min}분</div>` : ''}
         <div class="pop-act"><button data-open="${it.id}">✏️ 일정 열기</button>
         <a href="${amapMarker(loc, it.title)}" target="_blank" rel="noopener">고덕에서 보기</a>
         ${leg ? `<a href="${amapRoute(locOf(leg.prev), loc, leg.prev.title, it.title, leg.mode === 'walk' ? 'walk' : 'bus')}" target="_blank" rel="noopener">길찾기</a>` : ''}</div></div>`,
      );
      mk.on('dragend', () => {
        put('items', { ...it, loc: map._fromView([mk.getLatLng().lat, mk.getLatLng().lng]) });
        toast(`${it.title} 위치 수정`);
      });
      MV.markers[it.id] = mk;
      bounds.push(V(loc));
      side.push(`<div class="ms-row" data-focus="${it.id}"><span class="num" style="background:${color}">${n}</span><div><b>${c.icon} ${esc(it.title)}</b><small>${fmt(it.start)}–${fmt(it.end)}${leg && leg.min ? ` · ${leg.label} ${leg.min}분${leg.short ? ' ⚠️' : ''}` : ''}</small></div></div>`);
    });
    if (pts.length > 1) L.polyline(pts.map(V), { color, weight: 4, opacity: 0.75, dashArray: '8 6' }).addTo(MV.layers);
  });

  if (show.hotels) {
    Object.values(D.hotels).forEach((h) => {
      const loc = h.loc;
      if (!loc) return;
      L.marker(V(loc), { icon: pinIcon({ color: '#7c3aed', text: '🏨', size: 32 }), zIndexOffset: 900 })
        .addTo(MV.layers)
        .bindPopup(`<div class="pop"><b>🏨 ${esc(h.name)}</b>${h.cn ? `<div class="pop-cn">${esc(h.cn)}</div>` : ''}<div class="pop-act"><a href="${amapMarker(loc, h.name)}" target="_blank" rel="noopener">고덕에서 보기</a></div></div>`);
      bounds.push(V(loc));
    });
  }
  if (show.ideas) {
    Object.values(D.ideas).forEach((i) => {
      const loc = locOf(i);
      if (!loc || (i.placeId && usedPlaces.has(i.placeId))) return;
      const votes = Object.keys(i.votes || {}).length;
      L.marker(V(loc), { icon: pinIcon({ color: '#db2777', text: votes ? `❤${votes}` : '💡', size: 26, cls: 'ghost' }) })
        .addTo(MV.layers)
        .bindPopup(`<div class="pop"><b>💡 ${esc(i.title)}</b>${i.memo ? `<div class="small">${esc(i.memo)}</div>` : ''}<div class="pop-act"><button data-idea-to-plan="${i.id}">🗓️ 일정에 넣기</button></div></div>`);
      if (i.placeId) usedPlaces.add(i.placeId);
    });
  }
  if (show.lib) {
    PLACES.forEach((p) => {
      if (!p.loc || usedPlaces.has(p.id)) return;
      const c = CATS[p.cat];
      L.marker(V(p.loc), { icon: pinIcon({ color: '#64748b', text: c.icon, size: 22, cls: 'ghost small' }) })
        .addTo(MV.layers)
        .bindPopup(`<div class="pop"><b>${c.icon} ${esc(p.name)}</b><div class="pop-cn">${esc(p.cn)}</div><div class="small">${AREAS[p.area] || ''} · ${durLabel(p.dur)}</div><div class="small">${esc(p.tip || '')}</div>
          <div class="pop-act"><button data-place-to-plan="${p.id}">🗓️ 일정에 넣기</button><button data-place-to-idea="${p.id}">💡 찜</button></div></div>`);
    });
  }

  const ms = ui.mapSearch;
  if (ms) {
    const amapKw = mapLinks(ms.q).amap;
    const rows = ms.results.map((r, i) => {
      const mk = L.marker(V(r.loc), { icon: pinIcon({ color: '#0ea5e9', text: String.fromCharCode(65 + (i % 26)), size: 30 }), zIndexOffset: 1200 }).addTo(MV.layers);
      const names = [r.cn, r.en].filter((t) => t && t !== r.name);
      mk.bindPopup(`<div class="pop"><b>🔍 ${esc(r.name)}</b>${names.length ? `<div class="pop-cn">${esc(names.join(' · '))}</div>` : ''}
        ${r.addr ? `<div class="small">${esc(r.addr)}</div>` : ''}
        <div class="pop-act"><button data-sr-plan="${i}">🗓️ 일정에 넣기</button><button data-sr-idea="${i}">💡 찜</button><button data-sr-taxi="${i}">🚕 택시카드</button>
        <a href="${amapMarker(r.loc, r.name)}" target="_blank" rel="noopener">고덕에서 보기</a></div></div>`);
      MV.markers[`sr${i}`] = mk;
      return `<div class="ms-row" data-focus="sr${i}"><span class="num" style="background:#0ea5e9">${String.fromCharCode(65 + (i % 26))}</span><div><b>${esc(r.name)}</b><small>${esc([...names, r.addr].filter(Boolean).join(' · '))} <i class="src">${r.src}</i></small></div></div>`;
    });
    side.unshift(`<div class="ms-search"><h4>🔍 “${esc(ms.q)}” ${ms.loading ? '<small class="muted">검색 중…</small>' : `<small class="muted">${ms.results.length}개</small>`}</h4>
      ${rows.join('')}
      ${!ms.loading && !ms.results.length ? `<p class="muted small">${ms.failed ? '검색 서버에 연결하지 못했어요.' : '결과가 없어요. 중국어 이름으로도 검색해보세요.'}</p>` : ''}
      <a class="chip" href="${amapKw}" target="_blank" rel="noopener">고덕지도 앱/웹에서 “${esc(ms.q)}” 검색 ↗</a>
      ${settings().amapKey ? '' : '<p class="muted small">고덕 Web API 키를 ⚙️ 설정에 넣으면 고덕 POI로 바로 검색돼요.</p>'}
    </div>`);
  }

  $('#map-side', el).innerHTML = side.join('') + '<p class="muted small">번호 = 그날 순서 · 점선 = 이동 동선 · 이동시간은 직선거리 기준 대략치</p>';
  $$('[data-focus]', el).forEach((r) => (r.onclick = () => focusMarker(r.dataset.focus)));
  $$('#map-side [data-open]', el).forEach((r) => (r.onclick = () => openItem(D.items[r.dataset.open])));

  // 실제 이동은 지도 크기 재계산 후 (renderMap 의 setTimeout)
  if (ui.mapFocus && MV.markers[ui.mapFocus]) {
    MV.pendingFit = ui.mapFocus;
    ui.mapFocus = null;
    MV.firstFit = false;
  } else if (MV.firstFit && bounds.length) {
    MV.pendingFit = bounds;
    MV.firstFit = false;
  }
}

function focusMarker(id) {
  const mk = MV.markers?.[id];
  if (!mk) return;
  MV.map.setView(mk.getLatLng(), Math.max(MV.map.getZoom(), 15));
  mk.openPopup();
}

function onMapPopupClick(e) {
  const b = e.target.closest('button');
  if (!b) return;
  const sr = (k) => ui.mapSearch?.results[+b.dataset[k]];
  if (b.dataset.srPlan) {
    const r = sr('srPlan');
    const p = r.placeId && placeById(r.placeId);
    if (p) return planFromPlace(p);
    openItem({ title: r.name, cn: r.cn || r.name, loc: r.loc, cat: 'sight', day: TRIP.days[ui.mapDay > 0 ? ui.mapDay : 1], start: 14 * 60, end: 15 * 60, memo: [r.en, r.addr].filter(Boolean).join('\n') });
  } else if (b.dataset.srIdea) {
    const r = sr('srIdea');
    put('ideas', { id: uid(), title: r.name, cn: r.cn || r.name, loc: r.loc, placeId: r.placeId || null, memo: [r.en, r.addr].filter(Boolean).join('\n'), cat: 'sight', links: [], votes: ui.me ? { [ui.me]: true } : {}, by: ui.me });
    toast(`${r.name} 찜!`);
  } else if (b.dataset.srTaxi) {
    const r = sr('srTaxi');
    openTaxi(r.cn || r.name, r.addr);
  } else if (b.dataset.open) openItem(D.items[b.dataset.open]);
  else if (b.dataset.placeToPlan) planFromPlace(placeById(b.dataset.placeToPlan));
  else if (b.dataset.placeToIdea) {
    const p = placeById(b.dataset.placeToIdea);
    put('ideas', { id: uid(), title: p.name, cn: p.cn, placeId: p.id, memo: p.tip, cat: p.cat, links: [], votes: ui.me ? { [ui.me]: true } : {}, by: ui.me });
    toast(`${p.name} 찜!`);
  } else if (b.dataset.ideaToPlan) {
    const i = D.ideas[b.dataset.ideaToPlan];
    openItem({ title: i.title, cn: i.cn, memo: i.memo, links: i.links, cat: i.cat || 'sight', placeId: i.placeId, loc: i.loc, day: TRIP.days[ui.mapDay > 0 ? ui.mapDay : 1], start: 14 * 60, end: 15 * 60 });
  }
}

// ---------- 위치 지정 위젯 (일정·숙소 편집창 안) ----------
function locPicker(box, initial, getQuery, onChange) {
  const L = window.L;
  let loc = initial;
  box.innerHTML = `
    <div class="lp-search"><input class="lp-q" placeholder="장소 검색 – 中文 · English"><button type="button" class="btn lp-go">검색</button>${loc ? '<button type="button" class="btn lp-clear">위치 지우기</button>' : ''}</div>
    <div class="lp-results"></div>
    <div class="lp-map"></div>
    <div class="small muted lp-txt"></div>`;
  const txt = $('.lp-txt', box);
  if (!L) {
    txt.textContent = '지도를 불러오지 못했어요';
    return;
  }
  const map = makeMap($('.lp-map', box), { layer: 'amap', center: loc || [31.228, 121.475], zoom: loc ? 15 : 12 });
  let mk = null;
  const setLoc = (p, pan = true) => {
    loc = p;
    if (!p) {
      if (mk) map.removeLayer(mk);
      mk = null;
    } else {
      if (!mk) {
        mk = L.marker(p, { draggable: true, icon: pinIcon({ color: '#ef4444', text: '📍' }) }).addTo(map);
        mk.on('dragend', () => setLoc([mk.getLatLng().lat, mk.getLatLng().lng], false));
      } else mk.setLatLng(p);
      if (pan) map.setView(p, Math.max(map.getZoom(), 15));
    }
    txt.textContent = p ? '📍 위치 지정됨 – 핀을 끌거나 지도를 눌러 수정' : '지도를 눌러 위치를 찍거나 검색하세요';
    onChange(p);
  };
  if (loc) setLoc(loc);
  else txt.textContent = '지도를 눌러 위치를 찍거나 검색하세요';
  map.on('click', (e) => setLoc([e.latlng.lat, e.latlng.lng], false));
  setTimeout(() => map.invalidateSize(), 50);

  const q = $('.lp-q', box);
  const go = async () => {
    const query = q.value.trim() || getQuery();
    if (!query) return;
    const res = $('.lp-results', box);
    res.innerHTML = '<span class="muted small">검색 중…</span>';
    try {
      const r = await searchPlace(query, { amapKey: settings().amapKey });
      res.innerHTML = r.length
        ? r.map((x, i) => `<button type="button" class="chip" data-r="${i}"><b>${esc(x.name)}</b>${x.en && x.en !== x.name ? ` ${esc(x.en)}` : ''}${x.addr ? ` <small class="muted">${esc(x.addr)}</small>` : ''}</button>`).join('')
        : '<span class="muted small">결과 없음 – 중국어 이름으로 검색하거나 지도를 직접 눌러 찍어주세요</span>';
      $$('[data-r]', res).forEach((b) => (b.onclick = () => setLoc(r[+b.dataset.r].loc)));
    } catch {
      res.innerHTML = '<span class="muted small">검색 실패 – 지도를 직접 눌러 찍어주세요</span>';
    }
  };
  $('.lp-go', box).onclick = go;
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      go();
    }
  });
  $('.lp-clear', box)?.addEventListener('click', () => setLoc(null));
  return { set: setLoc, map };
}

function dayHead(d) {
  const i = TRIP.days.indexOf(d);
  const notes = ['✈️ 도착', '', '', '✈️ 귀국'];
  const list = Object.values(D.items).filter((x) => x.day === d);
  const cost = list.reduce((a, x) => a + (Number(x.cost) || 0), 0);
  return `<b>Day ${i + 1}</b> ${dayLabel(d)} <span class="tag">${notes[i]}</span>
    <div class="dh-sub">${list.length}개 일정${cost ? ` · 예상 ${yuan(cost)}` : ''}</div>`;
}

function renderList(days) {
  const now = shanghaiNow();
  return `<div class="list">${days
    .map((d, i) => {
      const list = visibleItems(d);
      return `<section class="list-day">
        <h3>Day ${i + 1} · ${dayLabel(d)}</h3>
        ${list.length ? '' : '<p class="empty">아직 일정이 없어요</p>'}
        ${list
          .map((it, j) => {
            const c = CATS[it.cat] || CATS.etc;
            const leg = j > 0 ? legBefore(it, list) : null;
            const free = j > 0 ? it.start - list[j - 1].end : 0;
            const legTxt = leg && leg.min > 0
              ? `<span class="${leg.short ? 'bad' : ''}">${leg.label} 약 ${leg.min}분 · ${leg.km.toFixed(1)}km${leg.short ? ' ⚠️ 시간 부족' : ''}</span>
                 <a class="chip" target="_blank" rel="noopener" href="${amapRoute(locOf(leg.prev), locOf(it), leg.prev.title, it.title, leg.mode === 'walk' ? 'walk' : 'bus')}">고덕 길찾기</a>`
              : '';
            const gap = j > 0 && (free >= 30 || legTxt)
              ? `<div class="gap">${legTxt}${free >= 30 ? `<span>⏳ 여유 ${durLabel(free)}</span>` : ''}</div>`
              : '';
            const isNow = now.date === d && now.min >= it.start && now.min < it.end;
            return `${gap}<article class="card item-card ${isNow ? 'is-now' : ''} ${ui.sel?.has(it.id) ? 'sel' : ''}" data-open="${it.id}" style="--c:${c.color}">
              <div class="ic-time">${fmt(it.start)}<small>${fmt(it.end)}</small></div>
              <div class="ic-body">
                <div class="ic-title">${c.icon} ${esc(it.title)} ${whoDots(it.who)}</div>
                ${it.cn ? `<div class="ic-cn">${esc(it.cn)}</div>` : ''}
                ${it.memo ? `<div class="ic-memo">${esc(it.memo)}</div>` : ''}
                ${linksHTML(it.links)}
                <div class="ic-actions">
                  ${it.cn || locOf(it) ? mapBtns(it.cn || it.title, locOf(it), it.title) : ''}
                  ${locOf(it) ? `<button class="chip" data-showmap="${it.id}">📍 지도에서</button>` : ''}
                  ${it.cost ? `<span class="chip">💴 ${yuan(it.cost)}</span>` : ''}
                </div>
              </div>
            </article>`;
          })
          .join('')}
      </section>`;
    })
    .join('')}</div>`;
}

function mapBtns(q, loc = null, name = '') {
  const m = mapLinks(q);
  const amap = loc ? amapMarker(loc, name || q) : m.amap;
  return `<a class="chip" href="${amap}" target="_blank" rel="noopener">🗺️ 고덕</a>
    <a class="chip" href="${m.baidu}" target="_blank" rel="noopener">바이두</a>
    <a class="chip" href="${m.google}" target="_blank" rel="noopener">구글</a>
    <button class="chip taxi-btn" data-taxi="${esc(q)}">🚕 택시카드</button>`;
}

function linksHTML(links = [], removable = false) {
  if (!links?.length) return '';
  return `<div class="links">${links
    .map((l, idx) => {
      const info = linkInfo(l.url);
      const rm = removable ? `<button class="x" data-rmlink="${idx}" title="삭제">✕</button>` : '';
      if (info.type === 'youtube')
        return `<div class="yt-card"><button class="yt" data-yt="${info.id}" title="재생">
            <img src="${info.thumb}" loading="lazy" alt=""><span class="play">▶</span></button>
            <a href="${esc(l.url)}" target="_blank" rel="noopener" class="yt-title">${esc(l.title || 'YouTube 영상')}</a>${rm}</div>`;
      return `<div class="link-row"><a href="${esc(l.url)}" target="_blank" rel="noopener">${info.icon} ${esc(l.title || info.label)}</a>${rm}</div>`;
    })
    .join('')}</div>`;
}

function bindYT(el) {
  $$('[data-yt]', el).forEach(
    (b) =>
      (b.onclick = (e) => {
        e.stopPropagation();
        openYT(b.dataset.yt);
      }),
  );
  $$('[data-taxi]', el).forEach(
    (b) =>
      (b.onclick = (e) => {
        e.stopPropagation();
        openTaxi(b.dataset.taxi);
      }),
  );
}

function openYT(id) {
  const bg = document.createElement('div');
  bg.className = 'yt-modal';
  bg.innerHTML = `<div class="yt-frame"><iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div><button class="yt-close">✕ 닫기</button>`;
  bg.onclick = (e) => {
    if (e.target === bg || e.target.classList.contains('yt-close')) bg.remove();
  };
  document.body.append(bg);
}

function openTaxi(text, sub = '') {
  const bg = document.createElement('div');
  bg.className = 'taxi';
  bg.innerHTML = `<div class="taxi-in">
      <div class="taxi-lead">师傅，您好！请带我们去：</div>
      <div class="taxi-dest">${esc(text)}</div>
      ${sub ? `<div class="taxi-sub">${esc(sub)}</div>` : ''}
      <div class="taxi-lead small">谢谢！🙏</div>
      <div class="taxi-hint">기사님께 화면을 보여주세요 · 탭하면 닫힘</div>
    </div>`;
  bg.onclick = () => bg.remove();
  document.body.append(bg);
}

// ----- 드래그 / 리사이즈 -----
function bindGrid(el) {
  const ppm = PPM();
  let suppressClick = false;

  $$('.day-col', el).forEach((col) => {
    col.addEventListener('click', (e) => {
      if (e.target !== col || suppressClick || ui.sel) return;
      const y = e.offsetY;
      const start = clamp(snap(TRIP.dayStart + y / ppm, 30), TRIP.dayStart, TRIP.dayEnd - 30);
      openItem({ day: col.dataset.day, start, end: Math.min(start + 60, TRIP.dayEnd) });
    });
  });

  $$('.block', el).forEach((b) => {
    b.addEventListener('click', (e) => {
      if (suppressClick) return;
      if (e.target.closest('.resize')) return;
      if (ui.sel) return toggleSel(b.dataset.id);
      openItem(D.items[b.dataset.id]);
    });
    b.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || ui.sel) return;
      const onHandle = e.target.closest('.grip,.resize');
      if (e.pointerType !== 'mouse' && !onHandle) return; // 터치는 손잡이로만 (스크롤 유지)
      const it = D.items[b.dataset.id];
      if (!it) return;
      const resize = !!e.target.closest('.resize');
      const sx = e.clientX;
      const sy = e.clientY;
      let moved = false;
      let nd = it.day;
      let ns = it.start;
      let ne = it.end;
      const len = it.end - it.start;
      b.setPointerCapture(e.pointerId);

      const move = (ev) => {
        const dy = ev.clientY - sy;
        const dx = ev.clientX - sx;
        if (!moved && Math.hypot(dx, dy) < 5) return;
        if (!moved) {
          moved = true;
          ui.dragging = true;
          b.classList.add('dragging');
        }
        ev.preventDefault();
        const dm = snap(dy / ppm, 15);
        if (resize) {
          ne = clamp(it.end + dm, it.start + 15, TRIP.dayEnd);
          b.style.height = `${(ne - it.start) * ppm - 2}px`;
          $('.b-meta', b).firstChild.textContent = `${fmt(it.start)}–${fmt(ne)} `;
        } else {
          ns = clamp(it.start + dm, TRIP.dayStart, TRIP.dayEnd - len);
          ne = ns + len;
          b.style.top = `${(ns - TRIP.dayStart) * ppm}px`;
          b.style.pointerEvents = 'none';
          const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.day-col');
          b.style.pointerEvents = '';
          if (under && under.dataset.day !== nd) {
            nd = under.dataset.day;
            under.append(b);
            b.style.left = '2px';
            b.style.width = 'calc(100% - 4px)';
          }
          $('.b-meta', b).firstChild.textContent = `${fmt(ns)}–${fmt(ne)} `;
        }
      };
      const up = () => {
        b.removeEventListener('pointermove', move);
        b.removeEventListener('pointerup', up);
        b.removeEventListener('pointercancel', up);
        ui.dragging = false;
        if (moved) {
          suppressClick = true;
          setTimeout(() => (suppressClick = false), 60);
          if (nd !== it.day || ns !== it.start || ne !== it.end) {
            put('items', { ...it, day: nd, start: ns, end: ne });
            toast(`${it.title} → ${dayLabel(nd)} ${fmt(ns)}`);
          } else render();
        }
      };
      b.addEventListener('pointermove', move);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
    });
  });
}

// ----- 일정 편집 모달 -----
function placeOptions() {
  return PLACES.map((p) => `<option value="${esc(p.name)}">${esc(p.cn)} · ${AREAS[p.area] || '어디서나'}</option>`).join('');
}

function openItem(src = {}) {
  const isNew = !src.id || !D.items[src.id];
  const it = {
    id: src.id || uid(), title: '', cat: 'sight', day: TRIP.days[0], start: 600, end: 660,
    who: [...ALL], links: [], memo: '', cn: '', cost: '', ...src,
  };
  it.links = [...(it.links || [])];
  const m = openModal(`
    <div class="m-head"><h2>${isNew ? '새 일정' : '일정 수정'}</h2><button class="x-btn" data-close>✕</button></div>
    <form class="form" id="item-form" autocomplete="off">
      <label class="full">제목
        <input name="title" list="places" value="${esc(it.title)}" placeholder="장소나 할 일 (예: 와이탄 야경)" required>
        <datalist id="places">${placeOptions()}</datalist>
      </label>
      <div class="hint place-hint full"></div>
      <label>분류<select name="cat">${Object.entries(CATS).map(([k, c]) => `<option value="${k}" ${k === it.cat ? 'selected' : ''}>${c.icon} ${c.label}</option>`).join('')}</select></label>
      <label>날짜<select name="day">${TRIP.days.map((d, i) => `<option value="${d}" ${d === it.day ? 'selected' : ''}>Day${i + 1} ${dayLabel(d)}</option>`).join('')}</select></label>
      <label>시작<input type="time" name="start" step="300" value="${fmt(it.start)}"></label>
      <label>끝<input type="time" name="end" step="300" value="${fmt(it.end)}"></label>
      <div class="full">함께하는 사람
        <div class="who-pick">${TRIP.people.map((p) => `<label class="who-opt" style="--c:${p.color}"><input type="checkbox" name="who" value="${p.id}" ${it.who?.length ? (it.who.includes(p.id) ? 'checked' : '') : 'checked'}><span>${p.name}</span></label>`).join('')}</div>
      </div>
      <label class="full">중국어 이름 / 주소 <small>(택시카드·지도 검색에 사용)</small>
        <input name="cn" value="${esc(it.cn)}" placeholder="예: 外滩 / 上海市黄浦区中山东一路">
      </label>
      <details class="full loc-box" id="loc-box">
        <summary>📍 지도 위치 <span class="loc-state">${locOf(it) ? '✅ 지정됨' : '— 아직 없음 (지도·동선·이동시간에 필요)'}</span></summary>
        <div class="lp"></div>
      </details>
      <label>예상 비용 (1인, 위안)<input type="number" name="cost" min="0" step="1" value="${esc(it.cost)}"></label>
      <label class="full">메모<textarea name="memo" rows="3" placeholder="예약 정보, 꿀팁, 메뉴 추천…">${esc(it.memo)}</textarea></label>
      <div class="full">
        링크 <small>(유튜브는 바로 재생, 샤오홍슈·블로그·트립닷컴 등)</small>
        <div class="link-add"><input id="link-in" placeholder="https://youtu.be/... 붙여넣기"><button type="button" class="btn" id="link-btn">추가</button></div>
        <div id="links-box"></div>
      </div>
      <div class="full m-actions">
        ${isNew ? '' : '<button type="button" class="btn danger" id="del">삭제</button><button type="button" class="btn" id="dup">복제</button>'}
        ${it.cn ? `<button type="button" class="btn" id="taxi">🚕 택시카드</button>` : ''}
        ${!isNew && locOf(it) ? `<button type="button" class="btn" id="tomap">🗺️ 지도</button>` : ''}
        <span class="sp"></span>
        <button type="button" class="btn" data-close>취소</button>
        <button class="btn primary">저장</button>
      </div>
      ${it.updatedBy ? `<div class="full meta-line">마지막 수정: ${PEOPLE[it.updatedBy]?.name || '자동'} · ${new Date(it.updatedAt).toLocaleString('ko-KR')}</div>` : ''}
    </form>`);

  const f = $('#item-form', m);
  const drawLinks = () => {
    $('#links-box', m).innerHTML = linksHTML(it.links, true);
    $$('[data-rmlink]', m).forEach((b) => (b.onclick = () => (it.links.splice(+b.dataset.rmlink, 1), drawLinks())));
    bindYT(m);
  };
  drawLinks();
  const addLink = async () => {
    const url = $('#link-in', m).value.trim();
    if (!/^https?:\/\//.test(url)) return toast('http로 시작하는 링크를 붙여넣어 주세요');
    const l = { url };
    it.links.push(l);
    $('#link-in', m).value = '';
    drawLinks();
    const t = await fetchLinkTitle(url);
    if (t) {
      l.title = t;
      drawLinks();
      if (!f.title.value) f.title.value = t.slice(0, 40);
    }
  };
  $('#link-btn', m).onclick = addLink;
  $('#link-in', m).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addLink();
    }
  });
  $('#link-in', m).addEventListener('paste', () => setTimeout(addLink, 0));

  let picker = null;
  const locBox = $('#loc-box', m);
  const setLocState = (p) => ($('.loc-state', m).textContent = p ? '✅ 지정됨' : '— 아직 없음');
  locBox.addEventListener('toggle', () => {
    if (!locBox.open || picker) return;
    picker = locPicker($('.lp', locBox), locOf(it), () => f.cn.value || f.title.value, (p) => {
      it.loc = p;
      setLocState(p);
    });
  });
  $('#tomap', m)?.addEventListener('click', () => showOnMap(it));

  f.title.addEventListener('input', () => {
    const p = PLACES.find((x) => x.name === f.title.value);
    if (!p) return;
    f.cat.value = p.cat;
    f.cn.value = p.cn;
    it.loc = null;
    if (picker && p.loc) picker.set(p.loc);
    setLocState(p.loc);
    const s = toMin(f.start.value);
    f.end.value = fmt(Math.min(s + p.dur, TRIP.dayEnd));
    if (!f.memo.value) f.memo.value = p.tip || '';
    it.placeId = p.id;
    $('.place-hint', m).textContent = `📍 ${AREAS[p.area] || ''} · 권장 ${durLabel(p.dur)} — ${p.tip || ''}`;
  });
  f.start.addEventListener('change', () => {
    const len = it.end - it.start;
    f.end.value = fmt(Math.min(toMin(f.start.value) + len, TRIP.dayEnd));
  });

  $$('[data-close]', m).forEach((b) => (b.onclick = closeModal));
  $('#del', m)?.addEventListener('click', () => {
    closeModal();
    removeWithUndo('items', it.id, it.title);
  });
  $('#dup', m)?.addEventListener('click', () => {
    const copy = { ...it, id: uid(), title: it.title + ' (복사)', locked: false };
    put('items', copy);
    closeModal();
    toast('복제했어요');
  });
  $('#taxi', m)?.addEventListener('click', () => openTaxi(f.cn.value));

  f.onsubmit = (e) => {
    e.preventDefault();
    const s = toMin(f.start.value);
    let en = toMin(f.end.value);
    if (en <= s) en = s + 30;
    const who = $$('input[name=who]:checked', f).map((x) => x.value);
    put('items', {
      ...it, title: f.title.value.trim(), cat: f.cat.value, day: f.day.value, start: s, end: en,
      who: who.length === ALL.length ? [] : who, cn: f.cn.value.trim(), memo: f.memo.value, cost: f.cost.value ? Number(f.cost.value) : '',
      links: it.links, loc: it.loc || null, placeId: it.placeId || null,
    });
    closeModal();
    toast(isNew ? '일정 추가!' : '저장했어요');
  };
}

// ----- 추천 일정 -----
function openRecommend() {
  const prefs = settings().recoPrefs || { pace: 'normal', interests: ['night', 'food', 'photo', 'cafe'], disneyDay: '', zhujiajiaoDay: '', massage: true, days: TRIP.days };
  const m = openModal(`
    <div class="m-head"><h2>✨ 추천 일정 만들기</h2><button class="x-btn" data-close>✕</button></div>
    <p class="muted">이미 넣어둔 일정(항공·숙소 등)은 그대로 두고 <b>빈 시간만</b> 동선에 맞춰 채워요. 미리보기에서 골라서 넣을 수 있어요.</p>
    <form class="form" id="reco-form">
      <div class="full"><b>여행 속도</b>
        <div class="seg big">${[['relaxed', '🐢 여유롭게'], ['normal', '🚶 보통'], ['packed', '🏃 알차게']].map(([k, l]) => `<label><input type="radio" name="pace" value="${k}" ${prefs.pace === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
      </div>
      <div class="full"><b>관심사</b> (여러 개)
        <div class="chips-pick">${INTERESTS.map((i) => `<label><input type="checkbox" name="int" value="${i.id}" ${prefs.interests.includes(i.id) ? 'checked' : ''}><span>${i.label}</span></label>`).join('')}</div>
      </div>
      <div class="full"><b>채울 날짜</b>
        <div class="chips-pick">${TRIP.days.map((d, i) => `<label><input type="checkbox" name="days" value="${d}" ${prefs.days?.includes(d) ?? true ? 'checked' : ''}><span>Day${i + 1} ${dayLabel(d)}</span></label>`).join('')}</div>
      </div>
      <label>🏰 디즈니 가는 날<select name="disney"><option value="">안 가요</option>${TRIP.days.slice(1, 3).map((d) => `<option value="${d}" ${prefs.disneyDay === d ? 'selected' : ''}>${dayLabel(d)}</option>`).join('')}</select></label>
      <label>🛶 주자자오 수향마을<select name="zjj"><option value="">안 가요</option>${TRIP.days.slice(1, 3).map((d) => `<option value="${d}" ${prefs.zhujiajiaoDay === d ? 'selected' : ''}>${dayLabel(d)}</option>`).join('')}</select></label>
      <label class="full inline"><input type="checkbox" name="massage" ${prefs.massage ? 'checked' : ''}> 하루 마무리 발마사지 넣기</label>
      <div class="full m-actions"><span class="sp"></span><button class="btn primary">추천 받기 →</button></div>
    </form>
    <div id="reco-out"></div>`, { wide: true });
  $$('[data-close]', m).forEach((b) => (b.onclick = closeModal));
  const f = $('#reco-form', m);
  f.onsubmit = (e) => {
    e.preventDefault();
    const p = {
      pace: f.pace.value,
      interests: $$('input[name=int]:checked', f).map((x) => x.value),
      days: $$('input[name=days]:checked', f).map((x) => x.value),
      disneyDay: f.disney.value,
      zhujiajiaoDay: f.zjj.value,
      massage: f.massage.checked,
    };
    if (p.disneyDay && p.disneyDay === p.zhujiajiaoDay) return toast('디즈니와 주자자오는 다른 날로 골라주세요');
    put('settings', { ...settings(), id: 'main', recoPrefs: p });
    showProposals(m, p);
  };
}

function showProposals(m, prefs) {
  const { proposals, themes } = recommend(D, prefs);
  const out = $('#reco-out', m);
  if (!proposals.length) {
    out.innerHTML = '<p class="empty">채울 빈 시간이 없어요. 날짜를 더 고르거나 기존 일정을 비워보세요.</p>';
    return;
  }
  out.innerHTML = `<hr><h3>미리보기 <small class="muted">체크된 것만 들어가요</small></h3>
    ${themes
      .filter((t) => prefs.days.includes(t.day))
      .map((t) => {
        const ps = proposals.map((p, i) => [p, i]).filter(([p]) => p.day === t.day);
        return `<div class="reco-day"><h4>${dayLabel(t.day)} · <span class="muted">${esc(t.label)}</span></h4>
          ${ps.length ? '' : '<p class="muted small">빈 시간이 부족해요</p>'}
          ${ps
            .map(([p, i]) => {
              const c = CATS[p.cat];
              return `<label class="reco-row" style="--c:${c.color}"><input type="checkbox" data-pi="${i}" checked>
                <span class="t">${fmt(p.start)}–${fmt(p.end)}</span>
                <span>${c.icon} <b>${esc(p.title)}</b> <small class="muted">${esc(p.cn)} · ${AREAS[p.area] || '어디서나'}</small></span></label>`;
            })
            .join('')}
        </div>`;
      })
      .join('')}
    <div class="m-actions"><button class="btn" id="again">🎲 다시 추천</button><span class="sp"></span><button class="btn primary" id="apply">선택한 ${proposals.length}개 일정에 넣기</button></div>`;
  const updateCount = () =>
    ($('#apply', out).textContent = `선택한 ${$$('[data-pi]:checked', out).length}개 일정에 넣기`);
  $$('[data-pi]', out).forEach((c) => (c.onchange = updateCount));
  $('#again', out).onclick = () => showProposals(m, prefs);
  $('#apply', out).onclick = () => {
    const chosen = $$('[data-pi]:checked', out).map((c) => proposals[+c.dataset.pi]);
    for (const p of chosen) {
      const { reason, area, ...rest } = p;
      put('items', { ...rest, id: uid(), who: [], links: [], auto: true });
    }
    closeModal();
    toast(`${chosen.length}개 일정을 넣었어요 ✨`);
  };
  out.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- 가고싶은 곳 ----------
function renderIdeas(el) {
  const ideas = Object.values(D.ideas).sort((a, b) => voteCount(b) - voteCount(a) || b.updatedAt - a.updatedAt);
  const inPlan = new Set(Object.values(D.items).map((i) => i.placeId).filter(Boolean));
  const inIdeas = new Set(ideas.map((i) => i.placeId).filter(Boolean));
  const areaF = ui.areaF || 'all';
  el.innerHTML = `
    <div class="card add-idea">
      <h3>💡 가고 싶은 곳 / 보고 싶은 영상 모으기</h3>
      <p class="muted small">유튜브·샤오홍슈·블로그 링크를 붙여넣거나 장소 이름을 적어두세요. 셋이 ❤️ 투표하고, 확정되면 일정에 넣기!</p>
      <form id="idea-form" class="row-form">
        <input name="q" placeholder="링크 붙여넣기 또는 장소/메모 입력" autocomplete="off">
        <button class="btn primary">추가</button>
      </form>
    </div>
    <div class="idea-grid">${ideas.length ? ideas.map(ideaCard).join('') : '<p class="empty">아직 아무것도 없어요. 첫 아이디어를 추가해보세요!</p>'}</div>
    <details class="lib" ${ideas.length < 3 ? 'open' : ''}>
      <summary>📚 상하이 추천 장소 라이브러리 (${PLACES.length}곳)</summary>
      <div class="seg wrap" id="areaF"><button data-a="all" class="${areaF === 'all' ? 'on' : ''}">전체</button>${Object.entries(AREAS).map(([k, v]) => `<button data-a="${k}" class="${areaF === k ? 'on' : ''}">${v}</button>`).join('')}</div>
      <div class="lib-grid">${PLACES.filter((p) => areaF === 'all' || p.area === areaF)
        .map((p) => {
          const c = CATS[p.cat];
          return `<div class="lib-item" style="--c:${c.color}">
            <div><b>${c.icon} ${esc(p.name)}</b> <small class="muted">${esc(p.cn)}</small></div>
            <div class="small muted">${AREAS[p.area] || '어디서나'} · ${durLabel(p.dur)}${p.closed ? ' · 월요일 휴무' : ''}</div>
            <div class="small">${esc(p.tip || '')}</div>
            <div class="lib-act">
              ${inPlan.has(p.id) ? '<span class="chip ok">일정에 있음</span>' : `<button class="chip" data-lib-plan="${p.id}">🗓️ 일정에</button>`}
              ${inIdeas.has(p.id) ? '<span class="chip ok">찜함</span>' : `<button class="chip" data-lib-idea="${p.id}">💡 찜</button>`}
              <a class="chip" target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=${encodeURIComponent('상하이 ' + p.name)}">▶ 유튜브 검색</a>
            </div>
          </div>`;
        })
        .join('')}</div>
    </details>`;

  $('#idea-form', el).onsubmit = async (e) => {
    e.preventDefault();
    const q = e.target.q.value.trim();
    if (!q) return;
    e.target.q.value = '';
    const isUrl = /^https?:\/\//.test(q);
    const p = !isUrl && PLACES.find((x) => x.name.includes(q) || x.cn.includes(q));
    const idea = {
      id: uid(), title: isUrl ? '불러오는 중…' : q, links: isUrl ? [{ url: q }] : [], votes: ui.me ? { [ui.me]: true } : {},
      placeId: p?.id || null, cn: p?.cn || '', memo: p?.tip || '', cat: p?.cat || 'sight', by: ui.me,
    };
    put('ideas', idea);
    if (isUrl) {
      const t = await fetchLinkTitle(q);
      put('ideas', { ...D.ideas[idea.id], title: t || linkInfo(q).label, links: [{ url: q, title: t || '' }] });
    }
  };
  $$('[data-a]', el).forEach((b) => (b.onclick = () => ((ui.areaF = b.dataset.a), render())));
  $$('[data-lib-plan]', el).forEach((b) => (b.onclick = () => planFromPlace(PLACES.find((p) => p.id === b.dataset.libPlan))));
  $$('[data-lib-idea]', el).forEach((b) => (b.onclick = () => {
    const p = PLACES.find((x) => x.id === b.dataset.libIdea);
    put('ideas', { id: uid(), title: p.name, cn: p.cn, placeId: p.id, memo: p.tip, cat: p.cat, links: [], votes: ui.me ? { [ui.me]: true } : {}, by: ui.me });
    toast(`${p.name} 찜!`);
  }));
  $$('[data-vote]', el).forEach((b) => (b.onclick = () => {
    if (!ui.me) return toast('오른쪽 위에서 내 이름을 먼저 골라주세요');
    const idea = D.ideas[b.dataset.vote];
    const votes = { ...(idea.votes || {}) };
    if (votes[ui.me]) delete votes[ui.me];
    else votes[ui.me] = true;
    put('ideas', { ...idea, votes });
  }));
  $$('[data-idea-plan]', el).forEach((b) => (b.onclick = () => {
    const idea = D.ideas[b.dataset.ideaPlan];
    const p = PLACES.find((x) => x.id === idea.placeId);
    openItem({ title: idea.title, cn: idea.cn, memo: idea.memo, links: idea.links, cat: idea.cat || 'sight', placeId: idea.placeId, loc: idea.loc, day: TRIP.days[1], start: 14 * 60, end: 14 * 60 + (p?.dur || 60) });
  }));
  $$('[data-idea-del]', el).forEach((b) => (b.onclick = () => removeWithUndo('ideas', b.dataset.ideaDel, D.ideas[b.dataset.ideaDel].title)));
  $$('[data-idea-edit]', el).forEach((b) => (b.onclick = () => editIdea(D.ideas[b.dataset.ideaEdit])));
  bindYT(el);
}
const voteCount = (i) => Object.keys(i.votes || {}).length;

function ideaCard(i) {
  const votes = i.votes || {};
  const c = CATS[i.cat] || CATS.sight;
  return `<article class="card idea" style="--c:${c.color}">
    ${linksHTML(i.links)}
    <div class="idea-title">${c.icon} ${esc(i.title)}</div>
    ${i.cn ? `<div class="ic-cn">${esc(i.cn)}</div>` : ''}
    ${i.memo ? `<div class="ic-memo">${esc(i.memo)}</div>` : ''}
    <div class="idea-foot">
      <div class="votes">${TRIP.people.map((p) => `<button class="vote ${votes[p.id] ? 'on' : ''}" ${p.id === ui.me ? `data-vote="${i.id}"` : 'disabled'} style="--c:${p.color}" title="${p.name}">${votes[p.id] ? '❤️' : '🤍'}<small>${p.name}</small></button>`).join('')}</div>
      <div class="idea-act">
        <button class="chip" data-idea-plan="${i.id}">🗓️ 일정에</button>
        <button class="chip" data-idea-edit="${i.id}">✏️</button>
        <button class="chip" data-idea-del="${i.id}">🗑️</button>
      </div>
    </div>
  </article>`;
}

function editIdea(i) {
  const m = openModal(`
    <div class="m-head"><h2>아이디어 수정</h2><button class="x-btn" data-close>✕</button></div>
    <form class="form" id="f">
      <label class="full">제목<input name="title" value="${esc(i.title)}"></label>
      <label>분류<select name="cat">${Object.entries(CATS).map(([k, c]) => `<option value="${k}" ${k === i.cat ? 'selected' : ''}>${c.icon} ${c.label}</option>`).join('')}</select></label>
      <label>중국어 이름/주소<input name="cn" value="${esc(i.cn || '')}"></label>
      <label class="full">메모<textarea name="memo" rows="3">${esc(i.memo || '')}</textarea></label>
      <label class="full">링크 추가<input name="link" placeholder="https://..."></label>
      <div class="full m-actions"><span class="sp"></span><button class="btn primary">저장</button></div>
    </form>`);
  $$('[data-close]', m).forEach((b) => (b.onclick = closeModal));
  $('#f', m).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const links = [...(i.links || [])];
    const url = f.link.value.trim();
    if (url) links.push({ url, title: (await fetchLinkTitle(url)) || '' });
    put('ideas', { ...i, title: f.title.value, cat: f.cat.value, cn: f.cn.value, memo: f.memo.value, links });
    closeModal();
  };
}

function planFromPlace(p) {
  openItem({ title: p.name, cn: p.cn, cat: p.cat, memo: p.tip, placeId: p.id, day: TRIP.days[1], start: 14 * 60, end: 14 * 60 + p.dur });
}

// ---------- 숙소 ----------
function renderHotel(el) {
  const hotels = Object.values(D.hotels).sort((a, b) => (a.checkin || '').localeCompare(b.checkin || ''));
  const covered = new Set();
  hotels.forEach((h) => {
    for (const d of TRIP.days) if (h.checkin <= d && d < h.checkout) covered.add(d);
  });
  const missing = TRIP.days.slice(0, -1).filter((d) => !covered.has(d));
  el.innerHTML = `
    <div class="card trip-card">
      <div>
        <h3>🏨 Trip.com 숙소</h3>
        <p class="muted small">3명 · 2/26 체크인 → 3/1 체크아웃 (3박) 조건으로 바로 검색해요. 예약 후 <b>예약확인 메일 내용을 붙여넣으면</b> 자동으로 채워지고 일정표에 체크인/체크아웃이 들어가요.</p>
        ${missing.length ? `<p class="warn">⚠️ 아직 숙소 없는 밤: ${missing.map(dayLabel).join(', ')}</p>` : '<p class="ok-txt">✅ 모든 밤 숙소 확정!</p>'}
      </div>
      <div class="trip-btns">
        <a class="btn primary" target="_blank" rel="noopener" href="${tripSearchUrl({ checkin: TRIP.days[0], checkout: TRIP.days[3], adults: 3, rooms: 1 })}">Trip.com에서 검색 (1실)</a>
        <a class="btn" target="_blank" rel="noopener" href="${tripSearchUrl({ checkin: TRIP.days[0], checkout: TRIP.days[3], adults: 3, rooms: 2 })}">2실로 검색</a>
        <button class="btn" id="hotel-add">＋ 숙소 등록</button>
      </div>
    </div>
    <div class="area-guide card">
      <h4>📍 숙소 위치 추천</h4>
      <ul class="small">
        <li><b>와이탄·난징동루</b> – 첫 상하이라면 최고. 야경 걸어서, 지하철 2·10호선(훙차오 공항 직통 10호선)</li>
        <li><b>인민광장</b> – 1·2·8호선 환승, 어디든 이동 편함</li>
        <li><b>신톈디·프랑스조계</b> – 분위기·카페·맛집. 밤에도 예쁨</li>
        <li><b>징안사</b> – 쇼핑·로스터리 근처, 2·7·14호선</li>
      </ul>
    </div>
    <div class="hotel-list">${hotels.map(hotelCard).join('') || '<p class="empty">등록된 숙소가 없어요</p>'}</div>`;
  $('#hotel-add', el).onclick = () => editHotel();
  $$('[data-hedit]', el).forEach((b) => (b.onclick = () => editHotel(D.hotels[b.dataset.hedit])));
  $$('[data-hdel]', el).forEach((b) => (b.onclick = () => {
    const id = b.dataset.hdel;
    if (!confirm('숙소를 삭제할까요? (체크인/아웃 일정도 같이 지워져요)')) return;
    store.del('items', `hin-${id}`);
    store.del('items', `hout-${id}`);
    removeWithUndo('hotels', id, D.hotels[id].name);
  }));
  bindYT(el);
}

function hotelCard(h) {
  const n = h.checkin && h.checkout ? nightsBetween(h.checkin, h.checkout) : 0;
  const rate = settings().rate || 195;
  return `<article class="card hotel">
    <div class="h-top">
      <div>
        <h3>${esc(h.name)}</h3>
        ${h.cn ? `<div class="ic-cn">${esc(h.cn)}</div>` : ''}
        <div class="small muted">${h.checkin ? dayLabel(h.checkin) : '?'} → ${h.checkout ? dayLabel(h.checkout) : '?'} · ${n}박 ${h.rooms ? `· ${esc(h.rooms)}` : ''}</div>
      </div>
      <div class="h-price">${h.price ? `${won(h.price)}<small>1인 ${won(h.price / 3)}</small>` : ''}</div>
    </div>
    ${h.conf ? `<div class="conf">예약번호 <b>${esc(h.conf)}</b> <button class="chip" onclick="navigator.clipboard.writeText('${esc(h.conf)}')">복사</button></div>` : ''}
    ${h.memo ? `<div class="ic-memo">${esc(h.memo)}</div>` : ''}
    <div class="ic-actions">
      ${h.url ? `<a class="chip" href="${esc(h.url)}" target="_blank" rel="noopener">🏨 Trip.com 예약 보기</a>` : ''}
      ${h.cn || h.loc ? mapBtns(h.cn || h.name, h.loc, h.name) : ''}
      <button class="chip" data-hedit="${h.id}">✏️ 수정</button>
      <button class="chip" data-hdel="${h.id}">🗑️</button>
    </div>
    ${linksHTML(h.links)}
  </article>`;
}

function editHotel(h0) {
  const h = { id: uid(), name: '', checkin: TRIP.days[0], checkout: TRIP.days[3], cinTime: '15:00', coutTime: '11:00', links: [], ...h0 };
  const m = openModal(`
    <div class="m-head"><h2>${h0 ? '숙소 수정' : '숙소 등록'}</h2><button class="x-btn" data-close>✕</button></div>
    <details class="paste" ${h0 ? '' : 'open'}>
      <summary>📋 Trip.com 예약확인 메일/페이지 붙여넣기로 자동 입력</summary>
      <textarea id="paste" rows="4" placeholder="예약 확인 메일 전체를 복사해서 붙여넣으세요"></textarea>
      <button class="btn" id="parse" type="button">자동 채우기</button>
    </details>
    <form class="form" id="hf">
      <label class="full">숙소 이름<input name="name" value="${esc(h.name)}" required></label>
      <label class="full">Trip.com 예약/숙소 링크<input name="url" value="${esc(h.url || '')}" placeholder="https://kr.trip.com/..."></label>
      <label>체크인<input type="date" name="checkin" value="${h.checkin}"></label>
      <label>체크인 시간<input type="time" name="cinTime" value="${h.cinTime}"></label>
      <label>체크아웃<input type="date" name="checkout" value="${h.checkout}"></label>
      <label>체크아웃 시간<input type="time" name="coutTime" value="${h.coutTime}"></label>
      <label class="full">중국어 주소 <small>(택시카드용 – 예약 메일에 있음)</small><input name="cn" value="${esc(h.cn || '')}" placeholder="上海市黄浦区…"></label>
      <details class="full loc-box" id="hloc" ${h.loc ? '' : 'open'}><summary>📍 지도 위치 <span class="loc-state">${h.loc ? '✅ 지정됨' : '— 검색하거나 지도를 눌러 찍어주세요'}</span></summary><div class="lp"></div></details>
      <label>예약번호<input name="conf" value="${esc(h.conf || '')}"></label>
      <label>총 금액 (원)<input type="number" name="price" value="${esc(h.price || '')}"></label>
      <label class="full">객실 구성<input name="rooms" value="${esc(h.rooms || '')}" placeholder="예: 트리플룸 1실 / 더블+싱글"></label>
      <label class="full">메모<textarea name="memo" rows="2" placeholder="조식 포함, 무료취소 기한 …">${esc(h.memo || '')}</textarea></label>
      <label class="full inline"><input type="checkbox" name="toPlan" ${h0?.toPlan === false ? '' : 'checked'}> 일정표에 체크인·체크아웃 자동 표시</label>
      <div class="full m-actions"><span class="sp"></span><button type="button" class="btn" data-close>취소</button><button class="btn primary">저장</button></div>
    </form>`);
  $$('[data-close]', m).forEach((b) => (b.onclick = closeModal));
  const f = $('#hf', m);
  const hloc = $('#hloc', m);
  let hpicker = null;
  const initPicker = () => {
    if (hpicker || !hloc.open) return;
    hpicker = locPicker($('.lp', hloc), h.loc, () => f.name.value || f.cn.value, (p) => {
      h.loc = p;
      $('.loc-state', hloc).textContent = p ? '✅ 지정됨' : '— 없음';
    });
  };
  hloc.addEventListener('toggle', initPicker);
  setTimeout(initPicker, 50);
  $('#parse', m).onclick = () => {
    const r = parseBookingText($('#paste', m).value);
    let n = 0;
    for (const k of ['name', 'checkin', 'checkout', 'conf', 'cn', 'price', 'url']) {
      if (r[k] && f[k]) {
        f[k].value = r[k];
        n++;
      }
    }
    toast(n ? `${n}개 항목을 채웠어요. 확인해주세요!` : '찾은 정보가 없어요. 직접 입력해주세요');
  };
  f.onsubmit = (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    const hotel = { ...h, ...v, price: v.price ? Number(v.price) : '', toPlan: f.toPlan.checked, loc: h.loc || null };
    put('hotels', hotel);
    syncHotelItems(hotel);
    closeModal();
    toast('숙소 저장!');
  };
}

function syncHotelItems(h) {
  const inId = `hin-${h.id}`;
  const outId = `hout-${h.id}`;
  if (!h.toPlan) {
    store.del('items', inId);
    store.del('items', outId);
    return;
  }
  const base = { cat: 'hotel', cn: h.cn || '', loc: h.loc || null, links: h.url ? [{ url: h.url, title: 'Trip.com 예약' }] : [], who: [], locked: true, memo: [h.conf && `예약번호 ${h.conf}`, h.memo].filter(Boolean).join('\n') };
  // 첫날 '숙소로 이동' 일정 목적지를 첫 숙소로 연결 (동선·이동시간 계산용)
  const toHotel = D.items['to-hotel'];
  if (toHotel && h.checkin === TRIP.days[0] && h.loc) put('items', { ...toHotel, loc: h.loc, cn: h.cn || toHotel.cn, title: `숙소로 이동 · ${h.name}` });
  if (TRIP.days.includes(h.checkin)) {
    const s = toMin(h.cinTime || '15:00');
    put('items', { ...(D.items[inId] || {}), ...base, id: inId, title: `체크인 · ${h.name}`, day: h.checkin, start: D.items[inId]?.start ?? s, end: D.items[inId]?.end ?? s + 30 });
  }
  if (TRIP.days.includes(h.checkout)) {
    const s = toMin(h.coutTime || '11:00');
    put('items', { ...(D.items[outId] || {}), ...base, id: outId, title: `체크아웃 · ${h.name}`, memo: base.memo + '\n짐은 프런트에 맡기고 마지막 일정 다녀오기', day: h.checkout, start: D.items[outId]?.start ?? s - 30, end: D.items[outId]?.end ?? s });
  }
}

// ---------- 경비 ----------
function renderMoney(el) {
  const rate = Number(settings().rate) || 195;
  const ex = Object.values(D.expenses).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.updatedAt - a.updatedAt);
  const toKRW = (e) => (e.cur === 'KRW' ? Number(e.amount) : Number(e.amount) * rate);
  const paid = Object.fromEntries(ALL.map((id) => [id, 0]));
  const share = Object.fromEntries(ALL.map((id) => [id, 0]));
  let total = 0;
  for (const e of ex) {
    const k = toKRW(e);
    total += k;
    paid[e.paidBy] = (paid[e.paidBy] || 0) + k;
    const sp = e.split?.length ? e.split : ALL;
    sp.forEach((id) => (share[id] += k / sp.length));
  }
  const bal = ALL.map((id) => ({ id, v: paid[id] - share[id] }));
  const transfers = settle(bal);
  const planned = Object.values(D.items).reduce((a, i) => a + (Number(i.cost) || 0), 0);
  const hotelTotal = Object.values(D.hotels).reduce((a, h) => a + (Number(h.price) || 0), 0);

  el.innerHTML = `
    <div class="money-top">
      <div class="card stat"><small>쓴 돈 합계</small><b>${won(total)}</b><span>1인 평균 ${won(total / 3)}</span></div>
      <div class="card stat"><small>일정 예상 비용 (1인)</small><b>${yuan(planned)}</b><span>≈ ${won(planned * rate)}</span></div>
      <div class="card stat"><small>숙소 합계</small><b>${won(hotelTotal)}</b><span>1인 ${won(hotelTotal / 3)}</span></div>
      <div class="card stat"><small>환율 1 CNY =</small><b><input id="rate" type="number" value="${rate}" step="0.1"> 원</b><button class="chip" id="rate-fetch">최신 환율</button></div>
    </div>
    <div class="card">
      <h3>정산 🧮</h3>
      <div class="settle">${ALL.map((id) => `<div>${avatar(id)} 낸 돈 ${won(paid[id])} · 부담 ${won(share[id])} → <b class="${paid[id] - share[id] >= 0 ? 'plus' : 'minus'}">${paid[id] - share[id] >= 0 ? '+' : ''}${won(paid[id] - share[id])}</b></div>`).join('')}</div>
      ${transfers.length ? `<div class="transfers">${transfers.map((t) => `<div>${avatar(t.from)} → ${avatar(t.to)} <b>${won(t.amt)}</b> 보내기</div>`).join('')}</div>` : '<p class="muted small">정산할 금액이 없어요</p>'}
      <p class="muted small">※ 용준·민혜가 한 지갑이면 둘을 합쳐서 보면 돼요.</p>
    </div>
    <div class="card">
      <h3>지출 기록</h3>
      <form id="ex-form" class="ex-form">
        <input name="title" placeholder="무엇에? (예: 샤오롱바오)" required>
        <input name="amount" type="number" step="0.01" placeholder="금액" required>
        <select name="cur"><option value="CNY">위안</option><option value="KRW">원</option></select>
        <select name="paidBy">${TRIP.people.map((p) => `<option value="${p.id}" ${p.id === ui.me ? 'selected' : ''}>${p.name} 결제</option>`).join('')}</select>
        <select name="day">${TRIP.days.map((d) => `<option value="${d}">${dayLabel(d)}</option>`).join('')}<option value="before">출발 전</option></select>
        <div class="who-pick">${TRIP.people.map((p) => `<label class="who-opt" style="--c:${p.color}"><input type="checkbox" name="split" value="${p.id}" checked><span>${p.name}</span></label>`).join('')}</div>
        <button class="btn primary">기록</button>
      </form>
      <table class="ex-table">
        <thead><tr><th>날짜</th><th>내용</th><th>금액</th><th>결제</th><th>나눔</th><th></th></tr></thead>
        <tbody>${ex.map((e) => `<tr><td>${e.date === 'before' ? '출발 전' : dayLabel(e.date)}</td><td>${esc(e.title)}</td><td>${e.cur === 'KRW' ? won(e.amount) : `${yuan(e.amount)}<small> ≈${won(e.amount * rate)}</small>`}</td><td>${avatar(e.paidBy, 'xs')}</td><td>${(e.split?.length ? e.split : ALL).map((id) => avatar(id, 'xs')).join('')}</td><td><button class="x" data-exdel="${e.id}">✕</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">아직 기록이 없어요</td></tr>'}</tbody>
      </table>
    </div>`;

  $('#rate', el).onchange = (e) => put('settings', { ...settings(), id: 'main', rate: Number(e.target.value) });
  $('#rate-fetch', el).onclick = async () => {
    try {
      const j = await (await fetch('https://open.er-api.com/v6/latest/CNY')).json();
      const r = Math.round(j.rates.KRW * 10) / 10;
      put('settings', { ...settings(), id: 'main', rate: r });
      toast(`환율 업데이트: 1위안 = ${r}원`);
    } catch {
      toast('환율을 가져오지 못했어요');
    }
  };
  $('#ex-form', el).onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    const split = $$('input[name=split]:checked', f).map((x) => x.value);
    put('expenses', { id: uid(), title: f.title.value, amount: Number(f.amount.value), cur: f.cur.value, paidBy: f.paidBy.value, date: f.day.value, split: split.length === 3 ? [] : split });
    toast('기록했어요');
  };
  $$('[data-exdel]', el).forEach((b) => (b.onclick = () => removeWithUndo('expenses', b.dataset.exdel, '지출')));
}

function settle(bal) {
  const pos = bal.filter((b) => b.v > 1).map((b) => ({ ...b }));
  const neg = bal.filter((b) => b.v < -1).map((b) => ({ ...b }));
  const out = [];
  for (const n of neg) {
    for (const p of pos) {
      if (n.v >= -1) break;
      const amt = Math.min(-n.v, p.v);
      if (amt < 1) continue;
      out.push({ from: n.id, to: p.id, amt });
      n.v += amt;
      p.v -= amt;
    }
  }
  return out;
}

// ---------- 준비 ----------
function renderPrep(el) {
  const list = Object.values(D.checklist).sort((a, b) => (a.done - b.done) || (a.order ?? 0) - (b.order ?? 0));
  const done = list.filter((c) => c.done).length;
  const flights = Object.values(D.items).filter((i) => i.cat === 'flight' && i.id.startsWith('flight')).sort((a, b) => a.day.localeCompare(b.day));
  el.innerHTML = `
    <div class="card">
      <h3>✈️ 항공편</h3>
      ${flights.map((f) => `<div class="flight-row" data-open="${f.id}"><b>${dayLabel(f.day)}</b> ${esc(f.title)}<div class="small muted">${esc(f.memo || '')}</div></div>`).join('')}
      <p class="muted small">탭해서 편명·좌석 등을 메모해두세요.</p>
    </div>
    <div class="card">
      <h3>준비물 & 할 일 <small class="muted">${done}/${list.length}</small></h3>
      <div class="progress"><i style="width:${list.length ? (done / list.length) * 100 : 0}%"></i></div>
      <form id="ck-form" class="row-form"><input name="t" placeholder="추가할 항목" required>
        <select name="who"><option value="">공동</option>${TRIP.people.map((p) => `<option value="${p.id}">${p.name}</option>`).join('')}</select>
        <button class="btn primary">추가</button></form>
      <ul class="checklist">${list.map((c) => `<li class="${c.done ? 'done' : ''}"><label><input type="checkbox" data-ck="${c.id}" ${c.done ? 'checked' : ''}><span>${esc(c.text)}</span></label>${c.who ? avatar(c.who, 'xs') : ''}${c.done && c.doneBy ? `<small class="muted">✓${PEOPLE[c.doneBy]?.name || ''}</small>` : ''}<button class="x" data-ckdel="${c.id}">✕</button></li>`).join('')}</ul>
    </div>
    <div class="card info">
      <h3>📌 알아두면 좋은 것</h3>
      <ul class="small">
        <li><b>시차</b> 상하이 = 한국 -1시간. 이 앱의 시간은 전부 현지 시각.</li>
        <li><b>날씨</b> 2월 말 평균 3~11℃, 비 잦음. 경량패딩+우산.</li>
        <li><b>결제</b> 거의 모든 곳이 알리페이/위챗페이. 현금은 비상용.</li>
        <li><b>인터넷</b> 중국에선 구글·카카오·유튜브가 막혀요. 한국 로밍/홍콩 eSIM을 쓰면 이 앱(구글 Firebase)과 유튜브도 그대로 사용 가능.</li>
        <li><b>훙차오 공항</b> 김포 노선은 T1 이용. 지하철 10호선 T1역 → 난징동루·위위안 직통.</li>
        <li><b>긴급</b> 경찰 110 · 구급 120 · 주상하이 대한민국 총영사관 +86-21-6295-5000 (출발 전 재확인)</li>
        <li><b>월요일(3/1)</b> 상하이 박물관·예원 등 휴관/휴원 많음 – 추천 일정은 자동으로 피해요.</li>
      </ul>
    </div>`;
  $('#ck-form', el).onsubmit = (e) => {
    e.preventDefault();
    put('checklist', { id: uid(), text: e.target.t.value, who: e.target.who.value, done: false, order: Date.now() });
  };
  $$('[data-ck]', el).forEach((c) => (c.onchange = () => put('checklist', { ...D.checklist[c.dataset.ck], done: c.checked, doneBy: ui.me })));
  $$('[data-ckdel]', el).forEach((b) => (b.onclick = () => removeWithUndo('checklist', b.dataset.ckdel, '항목')));
  $$('[data-open]', el).forEach((b) => (b.onclick = () => openItem(D.items[b.dataset.open])));
}

// ---------- 설정 ----------
function renderMore(el) {
  const link = location.href.split('#')[0] + `#t=${ui.key}`;
  const fb = store.mode === 'firebase';
  el.innerHTML = `
    <div class="card">
      <h3>👥 함께 편집하기</h3>
      ${fb
        ? `<p>✅ Firebase 실시간 공유가 켜져 있어요. 아래 링크를 민혜·다정에게 보내면 같은 일정을 같이 편집해요.</p>`
        : `<p class="warn">지금은 <b>이 기기에만</b> 저장되고 있어요. 셋이 같이 편집하려면 README의 “Firebase 연결” 5분 설정을 해주세요.</p>`}
      <div class="row-form"><input readonly value="${esc(link)}" id="share"><button class="btn primary" id="copy">링크 복사</button></div>
      <p class="muted small">링크 끝의 <code>#t=…</code> 가 우리 여행방 비밀키예요. 이 링크를 아는 사람만 볼 수 있어요.</p>
    </div>
    <div class="card">
      <h3>여행 제목</h3>
      <div class="row-form"><input id="title" value="${esc(settings().title || TRIP.title)}"><button class="btn" id="title-save">저장</button></div>
    </div>
    <div class="card">
      <h3>🗺️ 고덕지도 검색 키 <small class="muted">(선택)</small></h3>
      <p class="muted small">비워둬도 지도 검색은 OpenStreetMap으로 돼요. 고덕 개방플랫폼(lbs.amap.com)의 <b>Web服务</b> 키를 넣으면 고덕 POI로 더 정확하게 검색돼요. 셋이 같이 써요.</p>
      <div class="row-form"><input id="amapkey" value="${esc(settings().amapKey || '')}" placeholder="고덕 Web服务 Key"><button class="btn" id="amapkey-save">저장</button></div>
    </div>
    <div class="card">
      <h3>💾 백업</h3>
      <div class="row-form">
        <button class="btn" id="export">JSON 내보내기</button>
        <label class="btn">JSON 가져오기<input type="file" id="import" accept="application/json" hidden></label>
        <button class="btn" id="ics">📅 캘린더(.ics) 내보내기</button>
      </div>
      <p class="muted small">가져오기는 같은 ID는 덮어쓰고 나머지는 추가해요.</p>
    </div>
    <div class="card">
      <h3>초기화</h3>
      <button class="btn danger" id="reseed">기본 항공 일정·준비물 다시 넣기</button>
    </div>`;
  $('#copy', el).onclick = async () => {
    await navigator.clipboard.writeText(link);
    toast('링크 복사됨! 카톡으로 보내주세요');
  };
  $('#amapkey-save', el).onclick = () => (put('settings', { ...settings(), id: 'main', amapKey: $('#amapkey', el).value.trim() }), toast('저장했어요'));
  $('#title-save', el).onclick = () => put('settings', { ...settings(), id: 'main', title: $('#title', el).value });
  $('#export', el).onclick = () => download(`shanghai-trip-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(D, null, 2), 'application/json');
  $('#import', el).onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const j = JSON.parse(await file.text());
      let n = 0;
      for (const coll of Object.keys(D)) for (const obj of Object.values(j[coll] || {})) (store.put(coll, obj), n++);
      toast(`${n}개 항목 가져옴`);
    } catch {
      toast('파일을 읽지 못했어요');
    }
  };
  $('#ics', el).onclick = () => download('shanghai-trip.ics', toICS(), 'text/calendar');
  $('#reseed', el).onclick = () => {
    seed(true);
    toast('기본 일정을 다시 넣었어요');
  };
}

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function toICS() {
  const z = (d, m) => `${d.replace(/-/g, '')}T${fmt(m).replace(':', '')}00`;
  const escI = (s) => String(s || '').replace(/[\\,;]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  const ev = Object.values(D.items).map((i) => [
    'BEGIN:VEVENT', `UID:${i.id}@shanghai2027`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;TZID=Asia/Shanghai:${z(i.day, i.start)}`, `DTEND;TZID=Asia/Shanghai:${z(i.day, i.end)}`,
    `SUMMARY:${escI((CATS[i.cat]?.icon || '') + ' ' + i.title)}`, `LOCATION:${escI(i.cn)}`,
    `DESCRIPTION:${escI([i.memo, ...(i.links || []).map((l) => l.url)].filter(Boolean).join('\n'))}`, 'END:VEVENT',
  ].join('\r\n'));
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//shanghai2027//KO', ...ev, 'END:VCALENDAR'].join('\r\n');
}

// ---------- 초기 데이터 ----------
function seed(force = false) {
  const [d1, , , d4] = TRIP.days;
  const T1 = '上海虹桥国际机场T1航站楼';
  const base = { who: [], links: [], locked: true, loc: AIRPORT.loc };
  const items = [
    { id: 'flight-out', day: d1, start: 11 * 60, end: 13 * 60, cat: 'flight', title: '김포 → 훙차오 (동방/상하이항공 공동운항)', cn: T1, memo: '김포 12:00 출발(한국시간) → 훙차오 T1 약 13:00 도착(현지)\n편명·정확한 도착시간은 e-티켓 확인\n김포공항 국제선 10:00까지 도착' },
    { id: 'arrive', day: d1, start: 13 * 60, end: 14 * 60, cat: 'move', title: '입국심사 · 짐 찾기', cn: T1, memo: '입국신고서(온라인 사전작성 가능) · 지문 등록\n공항에서 알리페이 결제 / 유심 확인' },
    { id: 'to-hotel', day: d1, start: 14 * 60, end: 15 * 60, cat: 'move', title: '숙소로 이동', cn: '', loc: null, memo: 'T1 → 지하철 10호선 (난징동루·위위안 직통) 또는 디디 택시 약 40~60분' },
    { id: 'to-airport', day: d4, start: 14 * 60, end: 15 * 60, cat: 'move', title: '훙차오 공항 T1으로 이동', cn: T1, memo: '호텔에서 짐 찾아서 출발. 국제선은 2시간 전 도착 권장' },
    { id: 'airport', day: d4, start: 15 * 60, end: 17 * 60, cat: 'flight', title: '체크인 · 출국심사 · 면세', cn: T1, memo: '' },
    { id: 'flight-back', day: d4, start: 17 * 60, end: 19 * 60, cat: 'flight', title: '훙차오 → 김포 (동방/상하이항공 공동운항)', cn: T1, memo: '17:00 출발(현지) → 김포 약 20:00 도착(한국시간)\n편명 e-티켓 확인' },
  ];
  for (const it of items) if (force || !D.items[it.id]) store.put('items', { ...base, ...it, updatedAt: Date.now() });
  if (!Object.keys(D.checklist).length)
    DEFAULT_CHECKLIST.forEach((t, i) => store.put('checklist', { id: `ck${i}`, text: t, done: false, order: i, who: '' }));
  store.put('settings', { rate: 195, ...settings(), id: 'main', seeded: true });
}

// ---------- 채팅 ----------
const chat = { open: false, lastRead: Number(localStorage.getItem('sh2027:chatRead') || 0), seen: null };
const chatMsgs = () => Object.values(D.chat).sort((a, b) => a.at - b.at);
const unreadCount = () => chatMsgs().filter((m) => m.at > chat.lastRead && m.by !== ui.me).length;

function linkify(text) {
  return esc(text).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
}

function initChat() {
  const fab = document.createElement('button');
  fab.id = 'chat-fab';
  fab.title = '채팅';
  fab.innerHTML = '💬<b class="badge" hidden></b>';
  const panel = document.createElement('aside');
  panel.id = 'chat';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="chat-head"><b>💬 우리끼리 채팅</b><span class="chat-who"></span><button class="x-btn" id="chat-close">✕</button></div>
    <div class="chat-list" id="chat-list"></div>
    <form class="chat-form" id="chat-form" autocomplete="off">
      <textarea id="chat-in" rows="1" placeholder="메시지 (Enter 전송 · Shift+Enter 줄바꿈)"></textarea>
      <button class="btn primary">전송</button>
    </form>`;
  document.body.append(fab, panel);
  fab.onclick = () => toggleChat(!chat.open);
  $('#chat-close', panel).onclick = () => toggleChat(false);
  const input = $('#chat-in', panel);
  const grow = () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  };
  input.addEventListener('input', grow);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      $('#chat-form', panel).requestSubmit();
    }
  });
  $('#chat-form', panel).onsubmit = (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    if (!ui.me) return askWho();
    const at = Date.now();
    put('chat', { id: `${at.toString(36)}-${uid()}`, by: ui.me, text: text.slice(0, 2000), at });
    input.value = '';
    grow();
    input.focus();
  };
  $('#chat-list', panel).addEventListener('click', (e) => {
    const b = e.target.closest('[data-chatdel]');
    if (b && confirm('이 메시지를 삭제할까요?')) store.del('chat', b.dataset.chatdel);
    const y = e.target.closest('[data-yt]');
    if (y) openYT(y.dataset.yt);
  });
  document.addEventListener('visibilitychange', () => chat.open && !document.hidden && markChatRead());
  // 기본은 펼침 (PC). 휴대폰은 전체화면이라 접힌 채로 시작. 직접 열고 닫으면 그 상태를 기억
  const saved = localStorage.getItem('sh2027:chatOpen');
  if (saved ? saved === '1' : window.innerWidth >= 760) toggleChat(true, false);
}

function toggleChat(open, remember = true) {
  chat.open = open;
  if (remember) localStorage.setItem('sh2027:chatOpen', open ? '1' : '0');
  $('#chat').hidden = !open;
  document.body.classList.toggle('chat-open', open);
  renderChat(true);
  if (open && remember) setTimeout(() => $('#chat-in').focus(), 30);
}

function markChatRead() {
  const last = chatMsgs().at(-1)?.at || 0;
  if (last > chat.lastRead) {
    chat.lastRead = last;
    localStorage.setItem('sh2027:chatRead', String(last));
  }
}

// 다른 사람이 보낸 새 메시지 → 채팅이 닫혀 있으면 알림
function notifyChat() {
  const msgs = chatMsgs();
  if (!chat.seen) {
    chat.seen = new Set(msgs.map((m) => m.id));
    return;
  }
  for (const m of msgs) {
    if (chat.seen.has(m.id)) continue;
    chat.seen.add(m.id);
    if (m.by === ui.me || (chat.open && !document.hidden)) continue;
    toast(`💬 ${PEOPLE[m.by]?.name || '누군가'}: ${m.text.slice(0, 40)}${m.text.length > 40 ? '…' : ''}`, { label: '열기', fn: () => toggleChat(true) });
  }
}

function renderChat(forceBottom = false) {
  if (!$('#chat-fab')) return;
  if (chat.open && !document.hidden) markChatRead();
  const n = unreadCount();
  const badge = $('#chat-fab .badge');
  badge.hidden = !n;
  badge.textContent = n > 99 ? '99+' : n;
  document.title = `${n ? `(${n}) ` : ''}상하이 여행 2027`;
  if (!chat.open) return;

  $('#chat .chat-who').innerHTML = TRIP.people
    .map((p) => `<span class="cw ${lastSeen(p.id).on ? 'on' : ''}" title="${lastSeen(p.id).title}">${avatar(p.id, 'xs')}</span>`)
    .join('');
  const list = $('#chat-list');
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
  const msgs = chatMsgs();
  let lastDay = '';
  let lastBy = '';
  let lastAt = 0;
  list.innerHTML = msgs.length
    ? msgs
        .map((m) => {
          const d = new Date(m.at);
          const day = d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
          const sep = day !== lastDay ? `<div class="chat-day">${day}</div>` : '';
          const cont = !sep && lastBy === m.by && m.at - lastAt < 5 * 60000;
          lastDay = day;
          lastBy = m.by;
          lastAt = m.at;
          const mine = m.by === ui.me;
          const p = PEOPLE[m.by];
          const yt = (m.text.match(/https?:\/\/[^\s]+/g) || []).map(youtubeId).find(Boolean);
          return `${sep}<div class="msg ${mine ? 'mine' : ''} ${cont ? 'cont' : ''}" style="--c:${p?.color || '#64748b'}">
            ${!mine && !cont ? `<div class="msg-name">${avatar(m.by, 'xs')} ${p?.name || '?'}</div>` : ''}
            <div class="msg-row">
              <div class="bubble">${linkify(m.text)}${yt ? `<button class="msg-yt" data-yt="${yt}"><img src="https://i.ytimg.com/vi/${yt}/mqdefault.jpg" alt=""><span>▶</span></button>` : ''}</div>
              <small class="msg-time">${d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}${mine ? ` <button class="msg-del" data-chatdel="${m.id}" title="삭제">✕</button>` : ''}</small>
            </div>
          </div>`;
        })
        .join('')
    : '<p class="empty">첫 메시지를 남겨보세요 👋<br><small>유튜브 링크를 보내면 바로 재생돼요</small></p>';
  if (forceBottom || atBottom) list.scrollTop = list.scrollHeight;
}

// ---------- 렌더 ----------
function render() {
  if (ui.dragging) return;
  renderHeader();
  renderTabs();
  const el = $('#main');
  const y = window.scrollY;
  const gridScroll = $('.grid-wrap')?.scrollTop;
  ({ plan: renderPlan, map: renderMap, ideas: renderIdeas, hotel: renderHotel, money: renderMoney, prep: renderPrep, more: renderMore }[ui.tab] || renderPlan)(el);
  if (gridScroll != null && $('.grid-wrap')) $('.grid-wrap').scrollTop = gridScroll;
  window.scrollTo(0, y);
  renderChat();
}

function askWho() {
  if (ui.me) return;
  const m = openModal(`
    <div class="welcome">
      <h2>🥟 상하이 여행 플래너</h2>
      <p>누구세요? (수정 기록·투표에 사용돼요)</p>
      <div class="who-big">${TRIP.people.map((p) => `<button data-iam="${p.id}" style="--c:${p.color}">${p.name}</button>`).join('')}</div>
    </div>`);
  $$('[data-iam]', m).forEach((b) => (b.onclick = () => {
    ui.me = b.dataset.iam;
    localStorage.setItem('sh2027:me', ui.me);
    closeModal();
    heartbeat();
    render();
  }));
}

async function main() {
  ui.key = getTripKey();
  let rerenderTimer;
  store = await createStore({
    firebaseConfig,
    tripKey: ui.key,
    onStatus: (s, msg) => {
      ui.status = [s, msg];
      if ($('#hdr').innerHTML) renderHeader();
    },
  });
  initChat();
  store.subscribe((data) => {
    D = data;
    notifyChat();
    renderChat();
    clearTimeout(rerenderTimer);
    rerenderTimer = setTimeout(() => {
      // 모달이 열려있는 동안에도 배경은 갱신 (모달 입력값은 유지됨)
      render();
    }, 30);
  });
  if (store.isEmpty()) seed();
  render();
  askWho();
  let lastW = window.innerWidth;
  window.addEventListener('resize', () => {
    if ((lastW < 760) !== (window.innerWidth < 760)) render();
    lastW = window.innerWidth;
  });
  // 1분마다: 현재시각 선·접속 시간 갱신, 2분마다 내 접속 기록
  setInterval(() => (ui.tab === 'plan' && !$('.modal-bg') ? render() : renderHeader()), 60000);
  heartbeat();
  setInterval(heartbeat, 2 * 60000);
  document.addEventListener('visibilitychange', heartbeat);
  // 첫 화면: 여행 기간이면 오늘 날짜로
  const today = shanghaiNow().date;
  const ti = TRIP.days.indexOf(today);
  if (ti >= 0) ui.mDay = ti;
}

main();
