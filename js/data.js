// 여행 기본 정보 + 상하이 장소 데이터베이스 (추천 일정·자동완성에 사용)

export const TRIP = {
  title: '상하이 여행 2027',
  days: ['2027-02-26', '2027-02-27', '2027-02-28', '2027-03-01'],
  people: [
    { id: 'yj', name: '용준', color: '#3b82f6' },
    { id: 'mh', name: '민혜', color: '#ec4899' },
    { id: 'dj', name: '다정', color: '#f59e0b' },
  ],
  // 시간표에 표시하는 범위 (현지 시각, 분)
  dayStart: 7 * 60,
  dayEnd: 24 * 60,
};

export const CATS = {
  flight: { label: '항공', icon: '✈️', color: '#64748b' },
  move: { label: '이동', icon: '🚇', color: '#94a3b8' },
  hotel: { label: '숙소', icon: '🏨', color: '#8b5cf6' },
  sight: { label: '관광', icon: '📸', color: '#0ea5e9' },
  food: { label: '식사', icon: '🥟', color: '#ef4444' },
  cafe: { label: '카페', icon: '☕', color: '#a16207' },
  shop: { label: '쇼핑', icon: '🛍️', color: '#db2777' },
  night: { label: '야경·바', icon: '🌃', color: '#4f46e5' },
  rest: { label: '휴식·마사지', icon: '💆', color: '#10b981' },
  etc: { label: '기타', icon: '📌', color: '#6b7280' },
};

export const AREAS = {
  bund: '와이탄·난징동루',
  oldcity: '예원·구시가지',
  pudong: '푸둥·루자쭈이',
  xintiandi: '신톈디·톈쯔팡',
  french: '프랑스조계(우캉루·안푸루)',
  jingan: '징안·난징시루',
  westbund: '웨스트번드(쉬후이 강변)',
  hongqiao: '훙차오·치바오',
  north: '북와이탄·훙커우',
  qingpu: '주자자오(근교)',
  disney: '디즈니(푸둥 외곽)',
  suzhou: '쑤저우(근교·고속철)',
  zhouzhuang: '저우좡(근교)',
  hangzhou: '항저우(근교·고속철)',
};

// 동선상 인접 지역 (추천 시 다음 지역 고를 때 사용)
export const NEAR = {
  bund: ['oldcity', 'pudong', 'north', 'jingan', 'xintiandi'],
  oldcity: ['bund', 'xintiandi', 'pudong'],
  pudong: ['bund', 'oldcity', 'north'],
  xintiandi: ['oldcity', 'french', 'bund'],
  french: ['xintiandi', 'jingan', 'westbund'],
  jingan: ['french', 'bund'],
  westbund: ['french', 'xintiandi'],
  hongqiao: ['french', 'westbund'],
  north: ['bund', 'pudong'],
  qingpu: ['hongqiao'],
  disney: [],
  suzhou: [],
  zhouzhuang: [],
  hangzhou: [],
};

// tags: history, night, shop, food, cafe, photo, art, culture, relax, theme
// best: am | pm | night | any,  dur: 분,  closed: 휴무 요일(0=일)
export const PLACES = [
  { id: 'bund', group: 'bund', name: '와이탄', cn: '外滩', cat: 'sight', area: 'bund', dur: 60, best: 'night', tags: ['night', 'photo', 'history'], tip: '해 진 직후(18시 전후) 푸둥 스카이라인 조명이 켜질 때가 베스트. 22시에 조명 꺼짐.' },
  { id: 'bund-am', group: 'bund', name: '와이탄 아침 산책', cn: '外滩', cat: 'sight', area: 'bund', dur: 45, best: 'am', tags: ['photo', 'history'], tip: '사람 적은 아침에 유럽풍 건축물 사진 찍기 좋음.' },
  { id: 'nanjingdong', name: '난징동루 보행가', cn: '南京东路步行街', cat: 'shop', area: 'bund', dur: 60, best: 'pm', tags: ['shop', 'night'], tip: '와이탄과 바로 연결. 저녁 네온이 예쁨.' },
  { id: 'cruise', name: '황푸강 유람선', cn: '黄浦江游船(十六铺码头)', cat: 'night', area: 'bund', dur: 60, best: 'night', tags: ['night', 'photo'], tip: '스류푸 부두 출발. 트립닷컴/현장 구매 가능. 19~21시 추천.' },
  { id: 'peoplesq', name: '인민광장·상하이 박물관', cn: '上海博物馆(人民广场)', cat: 'sight', area: 'bund', dur: 90, best: 'any', tags: ['history', 'art', 'culture'], tip: '무료(예약 필요). 월요일 휴관.', closed: [1] },
  { id: 'yuyuan', name: '예원', cn: '豫园', cat: 'sight', area: 'oldcity', dur: 90, best: 'am', tags: ['history', 'photo', 'culture'], tip: '정원은 오전에 한산. 월요일 휴원.', closed: [1] },
  { id: 'yuyuan-bazaar', name: '예원상성·성황묘', cn: '豫园商城', cat: 'shop', area: 'oldcity', dur: 60, best: 'any', tags: ['shop', 'culture', 'night'], tip: '밤에 조명 켜진 구곡교가 예쁨.' },
  { id: 'nanxiang', name: '난샹만두점 (샤오롱바오)', cn: '南翔馒头店(豫园店)', cat: 'food', area: 'oldcity', dur: 60, best: 'any', tags: ['food'], tip: '1층 테이크아웃 줄이 길면 2~3층 좌석 이용.' },
  { id: 'pearl', group: 'tower', name: '동방명주', cn: '东方明珠广播电视塔', cat: 'sight', area: 'pudong', dur: 90, best: 'pm', tags: ['photo', 'theme'], tip: '유리바닥 전망대.' },
  { id: 'shtower', group: 'tower', name: '상하이타워 118층 전망대', cn: '上海中心大厦观光厅', cat: 'sight', area: 'pudong', dur: 90, best: 'night', tags: ['night', 'photo'], tip: '중국 최고층 전망대. 일몰 30분 전 입장 추천 (2월 일몰 약 18시).' },
  { id: 'swfc', group: 'tower', name: '상하이 세계금융센터 (병따개)', cn: '上海环球金融中心观光厅', cat: 'sight', area: 'pudong', dur: 75, best: 'night', tags: ['night', 'photo'], tip: '상하이타워 대안. 100층 유리 스카이워크.' },
  { id: 'lujiazui-walk', name: '루자쭈이 육교·빈강대도 산책', cn: '陆家嘴滨江大道', cat: 'sight', area: 'pudong', dur: 45, best: 'night', tags: ['night', 'photo'], tip: '와이탄을 반대편에서 보는 뷰.' },
  { id: 'ifc', name: 'IFC몰 (국금센터)', cn: '上海国金中心商场', cat: 'shop', area: 'pudong', dur: 75, best: 'any', tags: ['shop'], tip: '애플스토어, 명품, 맛집 많음.' },
  { id: 'museum-east', name: '상하이 박물관 동관', cn: '上海博物馆东馆', cat: 'sight', area: 'pudong', dur: 120, best: 'any', tags: ['history', 'art', 'culture'], tip: '2024년 개관한 신관. 예약 필요, 월요일 휴관.', closed: [1] },
  { id: 'xintiandi', name: '신톈디', cn: '新天地', cat: 'sight', area: 'xintiandi', dur: 75, best: 'pm', tags: ['photo', 'cafe', 'night', 'shop'], tip: '스쿠먼 골목 + 레스토랑/바. 저녁 분위기 좋음.' },
  { id: 'tianzifang', name: '톈쯔팡', cn: '田子坊', cat: 'shop', area: 'xintiandi', dur: 90, best: 'pm', tags: ['shop', 'photo', 'culture'], tip: '좁은 골목 공방·기념품 거리.' },
  { id: 'wukang', name: '우캉맨션·우캉루 산책', cn: '武康大楼', cat: 'sight', area: 'french', dur: 90, best: 'am', tags: ['photo', 'cafe', 'history'], tip: '플라타너스 거리 산책. 오전 햇살에 사진 잘 나옴.' },
  { id: 'anfu', name: '안푸루 카페 거리', cn: '安福路', cat: 'cafe', area: 'french', dur: 90, best: 'pm', tags: ['cafe', 'shop', 'photo'], tip: '로컬 힙한 카페·편집숍. 우캉루와 걸어서 연결.' },
  { id: 'huaihai', name: '화이하이중루 쇼핑', cn: '淮海中路', cat: 'shop', area: 'french', dur: 90, best: 'pm', tags: ['shop'], tip: 'TX화이하이, iapm 등 쇼핑몰 밀집.' },
  { id: 'guangming', name: '광명촌 (셴러우 웨빙)', cn: '光明邨大酒家', cat: 'food', area: 'french', dur: 45, best: 'any', tags: ['food'], tip: '고기 월병 테이크아웃 줄 서는 곳.' },
  { id: 'jingan-temple', name: '징안사', cn: '静安寺', cat: 'sight', area: 'jingan', dur: 45, best: 'any', tags: ['culture', 'photo'], tip: '도심 속 금빛 사찰.' },
  { id: 'roastery', name: '스타벅스 리저브 로스터리', cn: '星巴克臻选上海烘焙工坊', cat: 'cafe', area: 'jingan', dur: 60, best: 'any', tags: ['cafe'], tip: '세계 최대급 스타벅스 로스터리. 난징시루.' },
  { id: 'zhangyuan', name: '장위안 (张园)', cn: '张园', cat: 'shop', area: 'jingan', dur: 75, best: 'pm', tags: ['shop', 'photo', 'history'], tip: '리모델링한 석고문 단지 + 럭셔리 매장.' },
  { id: 'julu', name: '쥐루루 바 거리', cn: '巨鹿路', cat: 'night', area: 'jingan', dur: 90, best: 'night', tags: ['night'], tip: '칵테일 바 밀집. 상하이 바 문화 체험.' },
  { id: 'westbund-walk', name: '웨스트번드 강변 산책', cn: '徐汇滨江', cat: 'sight', area: 'westbund', dur: 60, best: 'pm', tags: ['photo', 'relax', 'art'], tip: '자전거/산책. 노을 맛집.' },
  { id: 'longmuseum', name: '롱 미술관 웨스트번드', cn: '龙美术馆(西岸馆)', cat: 'sight', area: 'westbund', dur: 90, best: 'any', tags: ['art'], tip: '건축 자체가 볼거리. 월요일 휴관.', closed: [1] },
  { id: 'qibao', name: '치바오 고진', cn: '七宝老街', cat: 'sight', area: 'hongqiao', dur: 90, best: 'any', tags: ['culture', 'food', 'photo'], tip: '훙차오 공항 가는 길에 들르기 좋은 작은 수향마을.' },
  { id: 'zhujiajiao', name: '주자자오 수향마을', cn: '朱家角古镇', cat: 'sight', area: 'qingpu', dur: 240, best: 'am', tags: ['culture', 'photo', 'history'], tip: '반나절 코스. 지하철 17호선 주자자오역. 나룻배 추천.' },
  { id: 'disney', name: '상하이 디즈니랜드', cn: '上海迪士尼乐园', cat: 'sight', area: 'disney', dur: 600, best: 'am', tags: ['theme'], tip: '하루 종일. 공식 앱으로 티켓·프리미어 액세스 구매.' },
  { id: 'north-bund', name: '북와이탄·백년 건축', cn: '北外滩滨江', cat: 'sight', area: 'north', dur: 60, best: 'pm', tags: ['photo', 'history'], tip: '와이탄보다 한적한 강변. 1933 라오창팡과 묶기.' },
  { id: '1933', name: '1933 라오창팡', cn: '1933老场坊', cat: 'sight', area: 'north', dur: 60, best: 'pm', tags: ['photo', 'art'], tip: '옛 도축장을 개조한 독특한 건축물.' },
  { id: 'era', noAuto: true, name: 'ERA 서커스 (时空之旅)', cn: '上海马戏城 ERA时空之旅', cat: 'night', area: 'jingan', dur: 90, best: 'night', tags: ['night', 'culture', 'theme'], tip: '19:30 공연. 미리 예약.' },
  { id: 'massage', name: '발마사지', cn: '足疗按摩', cat: 'rest', area: 'any', dur: 90, best: 'night', tags: ['relax'], tip: '하루 마무리로 강추. 지점 많은 체인점 이용.' },
  // 식사
  { id: 'jiajia', name: '자자탕바오 (샤오롱바오)', cn: '佳家汤包(黄河路店)', cat: 'food', area: 'bund', dur: 60, best: 'am', tags: ['food'], tip: '현지인 샤오롱바오 맛집. 인민광장 근처.' },
  { id: 'xiaoyang', name: '샤오양성젠 (군만두)', cn: '小杨生煎', cat: 'food', area: 'any', dur: 45, best: 'any', tags: ['food'], tip: '어디에나 지점 있음. 국물 튀니 조심.' },
  { id: 'laojishi', name: '라오지스 (상하이 본방요리)', cn: '老吉士酒家', cat: 'food', area: 'french', dur: 90, best: 'any', tags: ['food'], tip: '홍샤오러우 등 상하이 전통요리. 예약 추천.' },
  { id: 'haidilao', name: '하이디라오 훠궈', cn: '海底捞火锅', cat: 'food', area: 'any', dur: 90, best: 'night', tags: ['food'], tip: '본고장 서비스 체험. 늦게까지 영업.' },
  { id: 'dintaifung', name: '딘타이펑 (IFC)', cn: '鼎泰丰(国金中心店)', cat: 'food', area: 'pudong', dur: 75, best: 'any', tags: ['food'], tip: '실패 없는 선택.' },
  { id: 'xintiandi-dinner', name: '신톈디 레스토랑 저녁', cn: '新天地', cat: 'food', area: 'xintiandi', dur: 90, best: 'night', tags: ['food', 'night'], tip: '분위기 있는 저녁.' },
  { id: 'lailai', name: '라이라이 샤오롱 (게살)', cn: '莱莱小笼', cat: 'food', area: 'bund', dur: 60, best: 'any', tags: ['food'], tip: '게살 샤오롱바오.' },
  { id: 'crabnoodle', name: '게살비빔면 (셰황몐)', cn: '蟹黄面', cat: 'food', area: 'oldcity', dur: 45, best: 'am', tags: ['food'], tip: '비싸지만 상하이 별미.' },
  { id: 'manner', name: '매너 커피', cn: 'Manner Coffee', cat: 'cafe', area: 'any', dur: 30, best: 'am', tags: ['cafe'], tip: '상하이 로컬 커피 체인. 저렴하고 맛있음.' },
  // 근교 당일치기 (추천 일정에는 자동으로 넣지 않음 – 직접 추가)
  { id: 'suzhou-garden', name: '쑤저우 졸정원', cn: '苏州拙政园', cat: 'sight', area: 'suzhou', dur: 120, best: 'am', tags: ['history', 'culture', 'photo'], tip: '훙차오역 → 쑤저우역 고속철 약 30분. 세계문화유산 정원.' },
  { id: 'pingjiang', name: '쑤저우 핑장루', cn: '苏州平江路历史街区', cat: 'sight', area: 'suzhou', dur: 90, best: 'pm', tags: ['photo', 'cafe', 'culture'], tip: '운하 따라 걷는 옛 거리. 졸정원에서 도보 15분.' },
  { id: 'zhouzhuang', name: '저우좡 수향마을', cn: '周庄古镇', cat: 'sight', area: 'zhouzhuang', dur: 240, best: 'am', tags: ['culture', 'photo', 'history'], tip: '"중국 제일 수향". 상하이에서 차로 약 1시간 30분, 투어 상품 이용이 편함.' },
  { id: 'hangzhou', name: '항저우 서호', cn: '杭州西湖', cat: 'sight', area: 'hangzhou', dur: 300, best: 'am', tags: ['photo', 'relax', 'culture'], tip: '훙차오역 → 항저우동역 고속철 약 1시간. 하루 통째로 필요.' },
];

// 좌표 [위도, 경도] – 고덕지도(GCJ-02) 기준 대략 위치. 지도 탭에서 핀을 옮겨 보정 가능.
export const LOC = {
  bund: [31.2397, 121.4906], 'bund-am': [31.2405, 121.4903], nanjingdong: [31.2380, 121.4800], cruise: [31.2295, 121.4975],
  peoplesq: [31.2283, 121.4757], yuyuan: [31.2272, 121.4921], 'yuyuan-bazaar': [31.2263, 121.4905], nanxiang: [31.2268, 121.4913],
  pearl: [31.2397, 121.4998], shtower: [31.2335, 121.5055], swfc: [31.2345, 121.5075], 'lujiazui-walk': [31.2380, 121.4965],
  ifc: [31.2370, 121.5020], 'museum-east': [31.2230, 121.5420], xintiandi: [31.2195, 121.4750], tianzifang: [31.2087, 121.4700],
  wukang: [31.2050, 121.4380], anfu: [31.2140, 121.4420], huaihai: [31.2195, 121.4680], guangming: [31.2190, 121.4660],
  'jingan-temple': [31.2240, 121.4460], roastery: [31.2318, 121.4590], zhangyuan: [31.2290, 121.4610], julu: [31.2230, 121.4550],
  'westbund-walk': [31.1800, 121.4650], longmuseum: [31.1720, 121.4640], qibao: [31.1580, 121.3550], zhujiajiao: [31.1110, 121.0560],
  disney: [31.1440, 121.6620], 'north-bund': [31.2490, 121.5010], 1933: [31.2580, 121.4950], era: [31.2780, 121.4530],
  jiajia: [31.2370, 121.4720], laojishi: [31.2050, 121.4430], dintaifung: [31.2368, 121.5025], 'xintiandi-dinner': [31.2192, 121.4755],
  lailai: [31.2385, 121.4825], crabnoodle: [31.2258, 121.4898],
  'suzhou-garden': [31.3240, 120.6290], pingjiang: [31.3150, 120.6320], zhouzhuang: [31.1170, 120.8490], hangzhou: [30.2460, 120.1550],
};
PLACES.forEach((p) => (p.loc = LOC[p.id] || null));

export const AIRPORT = { name: '훙차오 공항 T1', cn: '上海虹桥国际机场T1航站楼', loc: [31.1965, 121.3420] };

export const INTERESTS = [
  { id: 'night', label: '🌃 야경' },
  { id: 'photo', label: '📸 사진 명소' },
  { id: 'food', label: '🥟 맛집' },
  { id: 'cafe', label: '☕ 카페' },
  { id: 'shop', label: '🛍️ 쇼핑' },
  { id: 'history', label: '🏯 역사·문화' },
  { id: 'art', label: '🎨 미술관' },
  { id: 'relax', label: '💆 마사지·휴식' },
];

export const DEFAULT_CHECKLIST = [
  '여권 (유효기간 6개월 이상)',
  '중국 무비자 입국 정책 연장 여부 확인 (2026년 말까지 시행 중 → 출발 전 재확인)',
  '알리페이 / 위챗페이 설치 + 해외카드 등록',
  'eSIM 또는 로밍 (구글·카톡 쓰려면 로밍/홍콩 eSIM)',
  '디디(DiDi) 앱 설치 – 알리페이 안에서도 호출 가능',
  '고덕지도(Amap) 또는 바이두지도 설치',
  '번역기 (파파고 오프라인 중국어 다운로드)',
  '항공권 e-티켓 / 숙소 바우처 캡처',
  '여행자 보험',
  '보조배터리 (기내 반입, 중국 3C 인증 확인)',
  '돼지코 필요 없음 (220V, 한국 플러그 대부분 사용 가능)',
  '따뜻한 외투 (2월 말 상하이 3~11℃, 습하고 쌀쌀)',
  '우산 (비 오는 날 많음)',
  '현금 약간 (CNY 500~1000)',
];
