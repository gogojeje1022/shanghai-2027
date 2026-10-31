// 추천 일정 생성기: 이미 잡힌 일정은 건드리지 않고 빈 시간만 채운다.
import { PLACES, NEAR, TRIP } from './data.js';
import { weekday, snap } from './utils.js';
import { travel } from './map.js';

const PACE = {
  relaxed: { start: 10 * 60, end: 21 * 60 + 30, gap: 30, factor: 1.15, move: 40 },
  normal: { start: 9 * 60, end: 22 * 60 + 30, gap: 15, factor: 1, move: 30 },
  packed: { start: 8 * 60 + 30, end: 23 * 60 + 30, gap: 0, factor: 0.85, move: 25 },
};

// 하루 테마(동선 묶음) 후보
const THEMES = [
  { key: 'classic', label: '예원 → 와이탄 → 푸둥 야경', areas: ['oldcity', 'bund', 'pudong'] },
  { key: 'french', label: '프랑스조계 산책 → 징안 쇼핑', areas: ['french', 'jingan', 'xintiandi'] },
  { key: 'xtd', label: '신톈디·톈쯔팡 → 웨스트번드/북와이탄', areas: ['xintiandi', 'westbund', 'north', 'bund'] },
];
const ARRIVAL_THEME = { key: 'arrival', label: '도착일: 난징동루 → 와이탄 야경', areas: ['bund', 'pudong', 'oldcity'] };
const DEPART_THEME = { key: 'depart', label: '출국일: 가볍게 → 공항', areas: ['french', 'hongqiao', 'jingan'] };

function busyOf(items, day) {
  return Object.values(items)
    .filter((i) => i.day === day)
    .map((i) => [i.start, i.end, i])
    .sort((a, b) => a[0] - b[0]);
}

function freeWindows(busy, start, end) {
  const out = [];
  let cur = start;
  for (const [s, e] of busy) {
    if (s > cur) out.push([cur, Math.min(s, end)]);
    cur = Math.max(cur, e);
    if (cur >= end) break;
  }
  if (cur < end) out.push([cur, end]);
  return out.filter(([s, e]) => e - s >= 30);
}

export function recommend(data, opts) {
  const { days, pace = 'normal', interests = [], disneyDay = '', zhujiajiaoDay = '', massage = true } = opts;
  const P = PACE[pace];
  const items = data.items || {};
  const used = new Set(Object.values(items).map((i) => i.placeId).filter(Boolean));
  const usedGroups = new Set([...used].map((id) => PLACES.find((p) => p.id === id)?.group).filter(Boolean));
  const proposals = [];
  const themesLeft = [...THEMES];
  const dayInfo = [];

  // 1) 날짜별 가용 시간 계산
  for (const day of days) {
    const busy = busyOf(items, day);
    let start = P.start;
    let end = P.end;
    for (const [s, e, it] of busy) {
      if (it.cat !== 'flight') continue;
      if (s < 14 * 60) start = Math.max(start, e); // 오전 비행 → 도착 이후부터
      else end = Math.min(end, busyStartBefore(busy, s)); // 오후 비행 → 공항 이동 전까지
    }
    const wins = freeWindows(busy, start, end);
    const free = wins.reduce((a, [s, e]) => a + e - s, 0);
    dayInfo.push({ day, busy, wins, free, idx: TRIP.days.indexOf(day) });
  }

  // 2) 날짜별 테마 배정
  for (const d of dayInfo) {
    if (d.day === disneyDay) d.theme = { key: 'disney', label: '디즈니랜드 하루', areas: ['disney'] };
    else if (d.day === zhujiajiaoDay) d.theme = { key: 'zjj', label: '오전 주자자오 → 오후 시내', areas: ['qingpu', 'french', 'xintiandi'] };
    else if (d.idx === 0) d.theme = ARRIVAL_THEME;
    else if (d.idx === TRIP.days.length - 1) d.theme = DEPART_THEME;
  }
  // 이미 일정이 많이 들어간 지역 테마는 뒤로
  for (const d of dayInfo.filter((x) => !x.theme)) {
    d.theme = themesLeft.shift() || THEMES[d.idx % THEMES.length];
  }
  // 도착일에 classic 을 쓰면 classic 테마의 장소가 중복되지 않도록 used 로 관리됨

  // 3) 날짜별 채우기
  for (const d of dayInfo) {
    if (d.theme.key === 'disney') {
      const w = d.wins.sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0];
      if (w && !used.has('disney')) {
        const p = PLACES.find((x) => x.id === 'disney');
        const s = Math.max(w[0], 8 * 60 + 30);
        proposals.push(mk(d.day, s, Math.min(w[1], 21 * 60), p, '하루 종일 디즈니 (식사는 파크 안에서)'));
        used.add('disney');
      }
      continue;
    }
    const ctx = { day: d.day, wd: weekday(d.day), theme: d.theme, P, interests, massage, used, usedGroups, proposals, items };
    // 출발 위치: 그날 첫 빈 시간 직전 일정의 위치 (예: 공항)
    ctx.curLoc = null;
    ctx.lunchDone = hasMeal(d.busy, 11 * 60, 14 * 60);
    ctx.dinnerDone = hasMeal(d.busy, 17 * 60 + 30, 20 * 60 + 30);
    ctx.cafeDone = d.busy.some(([, , i]) => i.cat === 'cafe');
    ctx.massageDone = d.busy.some(([, , i]) => i.cat === 'rest');
    ctx.curArea = null;
    for (const w of d.wins) {
      // 빈 시간 직전 일정(숙소 등)의 위치에서 출발
      const prev = d.busy.filter(([, e]) => e <= w[0]).pop()?.[2];
      const pl = prev && (prev.loc || PLACES.find((p) => p.id === prev.placeId)?.loc);
      if (pl) ctx.curLoc = pl;
      fillWindow(ctx, w[0], w[1]);
    }
  }
  return { proposals, themes: dayInfo.map((d) => ({ day: d.day, label: d.theme.label, free: d.free })) };
}

function busyStartBefore(busy, flightStart) {
  // 비행 전 공항 관련(이동/항공) 블록들의 가장 이른 시작 시각
  let s = flightStart;
  for (let i = busy.length - 1; i >= 0; i--) {
    const [bs, be, it] = busy[i];
    if (bs >= flightStart) continue;
    if ((it.cat === 'move' || it.cat === 'flight') && be >= s - 5) s = bs;
  }
  return s;
}

function hasMeal(busy, a, b) {
  return busy.some(([s, e, i]) => i.cat === 'food' && s < b && e > a);
}

function mk(day, start, end, p, reason) {
  return {
    day, start, end, placeId: p.id, title: p.name, cat: p.cat, cn: p.cn, area: p.area,
    memo: [p.tip, reason].filter(Boolean).join('\n'), reason,
  };
}

function fillWindow(ctx, ws, we) {
  const { P, theme } = ctx;
  let cur = ws;
  let guard = 0;
  while (we - cur >= 30 && guard++ < 20) {
    const lunchTime = !ctx.lunchDone && cur >= 11 * 60 + 15 && cur <= 14 * 60;
    const dinnerTime = !ctx.dinnerDone && cur >= 17 * 60 + 30 && cur <= 20 * 60;
    let pick = null;
    let reason = '';

    if (lunchTime || dinnerTime) {
      pick = best(ctx, cur, we, (p) => p.cat === 'food', dinnerTime ? 'dinner' : 'lunch');
      reason = dinnerTime ? '저녁 식사' : '점심 식사';
      if (pick) {
        if (dinnerTime) ctx.dinnerDone = true;
        else ctx.lunchDone = true;
      } else if (dinnerTime) ctx.dinnerDone = true;
      else ctx.lunchDone = true;
    }
    if (!pick) {
      pick = best(ctx, cur, we, (p) => p.cat !== 'food', 'sight');
      if (pick) reason = theme.areas.includes(pick.p.area) ? `오늘 동선: ${theme.label}` : '근처 추천';
    }
    if (!pick) {
      // 저녁 시간대까지 비워두고 다시 시도
      if (cur < 17 * 60 + 30 && we > 18 * 60) {
        cur = 17 * 60 + 30;
        continue;
      }
      break;
    }
    const { p, start, dur } = pick;
    ctx.proposals.push(mk(ctx.day, start, start + dur, p, reason));
    ctx.used.add(p.id);
    if (p.group) ctx.usedGroups.add(p.group);
    if (p.cat === 'cafe') ctx.cafeDone = true;
    if (p.cat === 'rest') ctx.massageDone = true;
    if (p.area !== 'any') ctx.curArea = p.area;
    if (p.loc) ctx.curLoc = p.loc;
    cur = start + dur + P.gap;
  }
}

function best(ctx, cur, we, filter, mode) {
  const { P, theme, interests, used, wd } = ctx;
  let bestOne = null;
  for (const p of PLACES) {
    if (!filter(p) || used.has(p.id) || p.noAuto) continue;
    if (p.group && ctx.usedGroups.has(p.group)) continue;
    if (p.id === 'disney' || p.area === 'disney') continue;
    if (p.area === 'qingpu' && theme.key !== 'zjj') continue;
    if (theme.key === 'zjj' && cur < 9 * 60 + 30 && p.id !== 'zhujiajiao' && !used.has('zhujiajiao')) continue;
    if (p.closed?.includes(wd)) continue;
    if (p.cat === 'cafe' && ctx.cafeDone) continue;
    if (p.cat === 'rest' && (!ctx.massage || ctx.massageDone || cur < 19 * 60)) continue;
    if (p.best === 'night' && p.cat !== 'food' && p.cat !== 'rest' && cur < 17 * 60 + 30) continue;
    if (p.best === 'am' && p.cat !== 'food' && cur > 15 * 60) continue;
    if (mode === 'lunch' && p.best === 'night') continue;

    const inTheme = theme.areas.indexOf(p.area);
    const near = ctx.curArea && (NEAR[ctx.curArea] || []).includes(p.area);
    if (inTheme < 0 && !near && p.area !== 'any' && p.area !== ctx.curArea) continue;

    // 실제 좌표가 있으면 거리 기반 이동시간, 없으면 지역이 바뀔 때 기본값
    const leg = ctx.curLoc && p.loc ? travel(ctx.curLoc, p.loc) : null;
    const move = leg ? Math.round(leg.min * (P.factor > 1 ? 1.2 : 1)) : ctx.curArea && p.area !== 'any' && p.area !== ctx.curArea ? P.move : 0;
    const start = snap(cur + move, 15);
    let dur = snap(p.dur * P.factor, 15);
    if (start + dur > we) {
      if (we - start >= Math.max(30, p.dur * 0.6)) dur = snap(we - start, 15);
      else continue;
    }

    let score = 0;
    score += p.tags.filter((t) => interests.includes(t)).length * 3;
    if (p.area === ctx.curArea) score += 4;
    else if (inTheme >= 0) score += 3 - inTheme * 0.5;
    else if (near) score += 1;
    if (p.best === 'night' && cur >= 18 * 60) score += 4;
    if (p.best === 'am' && cur < 12 * 60) score += 2;
    if (p.best === 'pm' && cur >= 13 * 60 && cur < 18 * 60) score += 1.5;
    if (p.area === 'any' && p.cat === 'food') score -= 1; // 지역 맛집 우선
    if (p.cat === 'rest') score += interests.includes('relax') ? 3 : 0.5;
    score -= move / 15; // 가까운 곳 우선 (동선 최소화)
    score += Math.random() * 1.6; // 다시 추천할 때마다 조금씩 다르게
    if (!bestOne || score > bestOne.score) bestOne = { p, start, dur, score };
  }
  return bestOne;
}
