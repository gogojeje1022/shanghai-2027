// 지도: Leaflet + 고덕지도(AutoNavi) 타일. 중국 지도는 GCJ-02 좌표계라서
// 구글/OSM(WGS-84) 좌표와 수백 m 어긋난다 → 앱 내부 좌표는 모두 GCJ-02 로 저장하고,
// OSM 레이어를 볼 때만 WGS-84 로 변환해서 그린다.

const PI = Math.PI;
const A = 6378245.0;
const EE = 0.00669342162296594323;

function tLat(x, y) {
  let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  r += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3;
  r += ((20 * Math.sin(y * PI) + 40 * Math.sin((y / 3) * PI)) * 2) / 3;
  r += ((160 * Math.sin((y / 12) * PI) + 320 * Math.sin((y * PI) / 30)) * 2) / 3;
  return r;
}
function tLng(x, y) {
  let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  r += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3;
  r += ((20 * Math.sin(x * PI) + 40 * Math.sin((x / 3) * PI)) * 2) / 3;
  r += ((150 * Math.sin((x / 12) * PI) + 300 * Math.sin((x / 30) * PI)) * 2) / 3;
  return r;
}
export function wgs2gcj([lat, lng]) {
  let dLat = tLat(lng - 105, lat - 35);
  let dLng = tLng(lng - 105, lat - 35);
  const rad = (lat / 180) * PI;
  let magic = Math.sin(rad);
  magic = 1 - EE * magic * magic;
  const sq = Math.sqrt(magic);
  dLat = (dLat * 180) / (((A * (1 - EE)) / (magic * sq)) * PI);
  dLng = (dLng * 180) / ((A / sq) * Math.cos(rad) * PI);
  return [lat + dLat, lng + dLng];
}
export function gcj2wgs([lat, lng]) {
  const g = wgs2gcj([lat, lng]);
  return [lat * 2 - g[0], lng * 2 - g[1]];
}

// ---------- 거리·이동시간 ----------
export function distKm(a, b) {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * PI) / 180;
  const dLng = ((b[1] - a[1]) * PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * PI) / 180) * Math.cos((b[0] * PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
// 시내 기준 대략치: 1.2km 이하는 도보, 그 이상은 지하철/택시 (+대기·환승 10분), 40km 넘으면 고속철/차량
export function travel(a, b) {
  if (!a || !b) return null;
  const km = distKm(a, b) * 1.3;
  if (km < 0.15) return { km, min: 0, mode: 'same', label: '바로 옆' };
  if (km <= 1.4) return { km, min: Math.max(3, Math.round((km / 4.5) * 60)), mode: 'walk', label: '🚶 도보' };
  if (km <= 40) return { km, min: Math.round((km / 22) * 60 + 10), mode: 'metro', label: '🚇 지하철/택시' };
  return { km, min: Math.round((km / 90) * 60 + 30), mode: 'far', label: '🚄 고속철/차량' };
}

// ---------- 고덕 앱/웹 링크 (좌표 기반, 정확) ----------
export function amapMarker(loc, name) {
  return `https://uri.amap.com/marker?position=${loc[1]},${loc[0]}&name=${encodeURIComponent(name)}&coordinate=gaode&callnative=1`;
}
export function amapRoute(from, to, fromName, toName, mode = 'bus') {
  const f = from ? `from=${from[1]},${from[0]},${encodeURIComponent(fromName || '출발')}&` : '';
  return `https://uri.amap.com/navigation?${f}to=${to[1]},${to[0]},${encodeURIComponent(toName)}&mode=${mode}&policy=1&coordinate=gaode&callnative=1`;
}

// ---------- 타일 레이어 ----------
export const LAYERS = {
  amap: { label: '고덕 (중문·정확)', gcj: true, url: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', sub: '1234', attr: '© AutoNavi 高德地图' },
  amapEn: { label: '고덕 (영문)', gcj: true, url: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=en&size=1&scale=1&style=8&x={x}&y={y}&z={z}', sub: '1234', attr: '© AutoNavi 高德地图' },
  sat: { label: '위성', gcj: true, url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}', sub: '1234', attr: '© AutoNavi 高德地图' },
  osm: { label: 'OpenStreetMap', gcj: false, url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', sub: 'abc', attr: '© OpenStreetMap' },
};

export function makeMap(el, { layer = 'amap', center = [31.228, 121.475], zoom = 13 } = {}) {
  const L = window.L;
  const map = L.map(el, { zoomControl: true, attributionControl: true, tap: true }).setView(center, zoom);
  map._layerKey = null;
  setLayer(map, layer);
  return map;
}

export function setLayer(map, key) {
  const L = window.L;
  const conf = LAYERS[key] || LAYERS.amap;
  if (map._tile) map.removeLayer(map._tile);
  map._tile = L.tileLayer(conf.url, { subdomains: conf.sub, maxZoom: 18, attribution: conf.attr }).addTo(map);
  // 화면 좌표 ↔ 저장(GCJ) 좌표 변환기
  map._toView = conf.gcj ? (p) => p : gcj2wgs;
  map._fromView = conf.gcj ? (p) => p : wgs2gcj;
  map._layerKey = key;
}

// ---------- 장소 검색 (Nominatim, WGS → GCJ 변환) ----------
export async function searchPlace(q) {
  const p = new URLSearchParams({ format: 'json', q, limit: '6', 'accept-language': 'ko,zh,en', viewbox: '119.9,32.0,122.2,30.0', bounded: '1' });
  const r = await fetch(`https://nominatim.openstreetmap.org/search?${p}`);
  const j = await r.json();
  return j.map((x) => ({ name: x.display_name, loc: wgs2gcj([Number(x.lat), Number(x.lon)]) }));
}

export function pinIcon({ color = '#ef4444', text = '', size = 28, cls = '' } = {}) {
  return window.L.divIcon({
    className: `pin ${cls}`,
    html: `<div class="pin-in" style="--c:${color};--s:${size}px"><span>${text}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
}
