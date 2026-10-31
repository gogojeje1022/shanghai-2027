// 저장소: Firebase 설정이 있으면 Firestore 실시간 공유, 없으면 이 브라우저(localStorage)에만 저장

export const COLLS = ['items', 'hotels', 'ideas', 'checklist', 'expenses', 'settings'];
const FB_VER = '10.12.2';

function emptyData() {
  return Object.fromEntries(COLLS.map((c) => [c, {}]));
}

export async function createStore({ firebaseConfig, tripKey, onStatus }) {
  if (firebaseConfig && tripKey) {
    try {
      return await firestoreStore(firebaseConfig, tripKey, onStatus);
    } catch (e) {
      console.error('Firebase 연결 실패, 로컬 모드로 전환', e);
      onStatus?.('error', 'Firebase 연결 실패 – 이 기기에만 저장 중');
    }
  }
  return localStore(tripKey || 'local', onStatus);
}

function localStore(key, onStatus) {
  const LS = `sh2027:${key}`;
  let data = emptyData();
  try {
    Object.assign(data, JSON.parse(localStorage.getItem(LS) || '{}'));
  } catch {}
  const subs = new Set();
  const emit = () => subs.forEach((f) => f(data));
  const save = () => {
    try {
      localStorage.setItem(LS, JSON.stringify(data));
    } catch (e) {
      console.warn(e);
    }
  };
  window.addEventListener('storage', (e) => {
    if (e.key !== LS) return;
    try {
      data = Object.assign(emptyData(), JSON.parse(e.newValue || '{}'));
      emit();
    } catch {}
  });
  onStatus?.('local', '이 기기에만 저장 중 (공유하려면 설정 → Firebase 연결)');
  return {
    mode: 'local',
    get data() {
      return data;
    },
    isEmpty: () => !data.settings?.main?.seeded,
    put(coll, obj) {
      data[coll] = { ...data[coll], [obj.id]: obj };
      save();
      emit();
    },
    del(coll, id) {
      const next = { ...data[coll] };
      delete next[id];
      data[coll] = next;
      save();
      emit();
    },
    subscribe(fn) {
      subs.add(fn);
      fn(data);
      return () => subs.delete(fn);
    },
  };
}

async function firestoreStore(config, tripKey, onStatus) {
  const base = `https://www.gstatic.com/firebasejs/${FB_VER}`;
  const { initializeApp } = await import(`${base}/firebase-app.js`);
  const fs = await import(`${base}/firebase-firestore.js`);
  const app = initializeApp(config);
  let db;
  try {
    db = fs.initializeFirestore(app, {
      localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
    });
  } catch {
    db = fs.getFirestore(app);
  }

  const data = emptyData();
  const subs = new Set();
  let emitQueued = false;
  const emit = () => {
    if (emitQueued) return;
    emitQueued = true;
    queueMicrotask(() => {
      emitQueued = false;
      subs.forEach((f) => f(data));
    });
  };

  const loaded = new Set();
  let resolveReady;
  const ready = new Promise((r) => (resolveReady = r));

  for (const coll of COLLS) {
    const ref = fs.collection(db, 'trips', tripKey, coll);
    fs.onSnapshot(
      ref,
      { includeMetadataChanges: true },
      (snap) => {
        const next = {};
        snap.forEach((d) => (next[d.id] = { ...d.data(), id: d.id }));
        data[coll] = next;
        loaded.add(coll);
        if (loaded.size === COLLS.length) resolveReady();
        const pending = snap.metadata.hasPendingWrites;
        const cached = snap.metadata.fromCache;
        if (cached) onStatus?.('offline', '오프라인 – 연결되면 자동 동기화');
        else onStatus?.('live', pending ? '저장 중…' : '실시간 공유 중');
        emit();
      },
      (err) => {
        console.error(err);
        onStatus?.('error', `동기화 오류: ${err.code || err.message}`);
        loaded.add(coll);
        if (loaded.size === COLLS.length) resolveReady();
      },
    );
  }

  // 첫 스냅샷(캐시 포함)을 기다리되, 네트워크가 느리면 4초 후 진행
  await Promise.race([ready, new Promise((r) => setTimeout(r, 4000))]);

  const clean = (o) => JSON.parse(JSON.stringify(o)); // undefined 제거

  return {
    mode: 'firebase',
    get data() {
      return data;
    },
    isEmpty: () => !data.settings?.main?.seeded,
    put(coll, obj) {
      data[coll] = { ...data[coll], [obj.id]: obj };
      emit();
      fs.setDoc(fs.doc(db, 'trips', tripKey, coll, obj.id), clean(obj)).catch((e) =>
        onStatus?.('error', `저장 실패: ${e.code || e.message}`),
      );
    },
    del(coll, id) {
      const next = { ...data[coll] };
      delete next[id];
      data[coll] = next;
      emit();
      fs.deleteDoc(fs.doc(db, 'trips', tripKey, coll, id)).catch((e) =>
        onStatus?.('error', `삭제 실패: ${e.code || e.message}`),
      );
    },
    subscribe(fn) {
      subs.add(fn);
      fn(data);
      return () => subs.delete(fn);
    },
  };
}
