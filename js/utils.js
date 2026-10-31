export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const toMin = (hhmm) => {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return h * 60 + (m || 0);
};
export const fmt = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
export const snap = (min, step = 15) => Math.round(min / step) * step;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const WD = ['일', '월', '화', '수', '목', '금', '토'];
export const dateObj = (d) => new Date(`${d}T00:00:00`);
export const weekday = (d) => dateObj(d).getDay();
export const dayLabel = (d) => {
  const o = dateObj(d);
  return `${o.getMonth() + 1}/${o.getDate()} (${WD[o.getDay()]})`;
};
export const durLabel = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h}시간` : '', m ? `${m}분` : ''].filter(Boolean).join(' ') || '0분';
};

// 상하이 현재 시각 (UTC+8)
export function shanghaiNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const g = (t) => parts.find((p) => p.type === t)?.value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, min: (Number(g('hour')) % 24) * 60 + Number(g('minute')) };
}

export function dday(target) {
  const now = new Date();
  const t = dateObj(target);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((t - today) / 86400000);
}

// ---------- 링크 ----------
export function youtubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('/')[0] || null;
    if (u.hostname.includes('youtube.com')) {
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/\/(shorts|embed|live|v)\/([\w-]{6,})/);
      if (m) return m[2];
    }
  } catch {}
  return null;
}

export function linkInfo(url) {
  const yt = youtubeId(url);
  if (yt) return { type: 'youtube', icon: '▶️', label: 'YouTube', id: yt, thumb: `https://i.ytimg.com/vi/${yt}/mqdefault.jpg` };
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    return { type: 'web', icon: '🔗', label: url };
  }
  const table = [
    ['xiaohongshu', '📕', '샤오홍슈'], ['xhslink', '📕', '샤오홍슈'], ['bilibili', '📺', '빌리빌리'],
    ['instagram', '📷', '인스타그램'], ['blog.naver', '📝', '네이버 블로그'], ['naver.me', '📝', '네이버'],
    ['tistory', '📝', '티스토리'], ['trip.com', '🏨', 'Trip.com'], ['dianping', '⭐', '다중디엔핑'],
    ['amap', '🗺️', '고덕지도'], ['google', '🗺️', 'Google'], ['klook', '🎟️', 'Klook'], ['tiktok', '🎵', 'TikTok'],
  ];
  const hit = table.find(([k]) => host.includes(k));
  return { type: 'web', icon: hit?.[1] || '🔗', label: hit?.[2] || host.replace(/^www\./, '') };
}

const titleCache = new Map();
export async function fetchLinkTitle(url) {
  if (titleCache.has(url)) return titleCache.get(url);
  try {
    const r = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
    const j = await r.json();
    const t = j.title || null;
    titleCache.set(url, t);
    return t;
  } catch {
    return null;
  }
}

// ---------- 지도 ----------
export function mapLinks(q) {
  const k = encodeURIComponent(q);
  return {
    amap: `https://uri.amap.com/search?keyword=${k}&city=310000`,
    baidu: `https://map.baidu.com/search/${k}?querytype=s&wd=${k}&c=289`,
    google: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q + ' 上海')}`,
  };
}

// ---------- Trip.com ----------
export function tripSearchUrl({ checkin, checkout, adults = 3, rooms = 1, keyword = '' }) {
  const p = new URLSearchParams({ city: '2', cityName: 'Shanghai', checkin, checkout, adult: adults, crn: rooms, curr: 'KRW', locale: 'ko-KR' });
  if (keyword) p.set('keyword', keyword);
  return `https://kr.trip.com/hotels/list?${p}`;
}

// 트립닷컴 예약확인 메일/페이지 텍스트에서 정보 추출 (최대한 추측)
export function parseBookingText(text) {
  const out = {};
  const dates = [...text.matchAll(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/g)].map(
    (m) => `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`,
  );
  const ci = text.match(/(체크인|Check-?in|入住)[^\d]{0,20}(20\d{2}[^\n]{0,14})/i);
  const co = text.match(/(체크아웃|Check-?out|退房)[^\d]{0,20}(20\d{2}[^\n]{0,14})/i);
  const pick = (m) => {
    const d = m && m[2].match(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
    return d ? `${d[1]}-${d[2].padStart(2, '0')}-${d[3].padStart(2, '0')}` : null;
  };
  out.checkin = pick(ci) || dates[0];
  out.checkout = pick(co) || dates[1];
  const conf = text.match(/(예약\s*번호|예약번호|Booking\s*(No\.?|number|ID)|订单号|확인\s*번호)[^\w]{0,6}([A-Z0-9]{6,})/i);
  if (conf) out.conf = conf[3];
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const nameLine = lines.find((l) => /(hotel|호텔|酒店|resort|inn|suites)/i.test(l) && l.length < 80);
  if (nameLine) out.name = nameLine.replace(/^(호텔명|숙소|Hotel name)\s*[:：]?\s*/i, '');
  const cnAddr = lines.find((l) => /上海.*(路|街|号)/.test(l));
  if (cnAddr) out.cn = cnAddr.replace(/^(주소|Address|地址)\s*[:：]?\s*/i, '');
  const price = text.match(/(₩|KRW)\s*([\d,]+)/);
  if (price) out.price = Number(price[2].replace(/,/g, ''));
  const url = text.match(/https?:\/\/[^\s]*trip\.com[^\s]*/i);
  if (url) out.url = url[0];
  return out;
}

export function nightsBetween(a, b) {
  return Math.max(0, Math.round((dateObj(b) - dateObj(a)) / 86400000));
}

export function won(n) {
  return `₩${Math.round(n || 0).toLocaleString('ko-KR')}`;
}
export function yuan(n) {
  return `¥${(Math.round((n || 0) * 100) / 100).toLocaleString('ko-KR')}`;
}
