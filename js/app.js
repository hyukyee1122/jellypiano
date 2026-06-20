// ===== 젤리피아노 앱 모듈 (app.js) =====
// common + song-loader + audio-sync + desktop-events + desktop-menu-buttons 통합

// --- 공통 변수 ---
if (typeof window.isResetButtonPressed === 'undefined') {
    window.isResetButtonPressed = false;
}

// --- 곡 목록 및 로딩 ---
const BASE_URL = (location.hostname === 'jellypiano.com' || location.hostname === 'www.jellypiano.com')
    ? 'https://ecimg.cafe24img.com/pg2484b41829542061/jellypiano/web/jellypiano/' : '';

const AUDIO_BASE_URL = 'https://hyukyee1122.github.io/jellypiano/mp3/';

const SONG_LIST = [
{ id: 'Hometown', title: '고향의 봄', titleEn: 'Spring of My Hometown', composer: '홍난파', jsonPath: 'https://hyukyee1122.github.io/jellypiano/json/Hometown.json?v=2', audioPath: AUDIO_BASE_URL + 'Hometown.mp3', difficulty: 'beginner' },
    { id: 'Oppasaenggak', title: '오빠생각', titleEn: 'Thinking of My Brother', composer: '박태준', jsonPath: 'https://hyukyee1122.github.io/jellypiano/json/Oppasaenggak.json?v=2', audioPath: AUDIO_BASE_URL + 'Oppasaenggak.mp3', difficulty: 'beginner' },
    { id: 'TheLoveofGod', title: '그 크신 하나님의 사랑', titleEn: 'The Love of God', composer: 'Claudia Lehman Mays', jsonPath: 'https://hyukyee1122.github.io/jellypiano/json/TheLoveofGod.json', audioPath: AUDIO_BASE_URL + 'TheLoveofGod.mp3', difficulty: 'beginner' },
    { id: 'ChordScalePractice', title: '코드 스케일 연습', titleEn: 'Chord Scale Practice', composer: '', jsonPath: 'https://hyukyee1122.github.io/jellypiano/json/ChordScalePractice.json', audioPath: AUDIO_BASE_URL + 'ChordScalePractice.mp3', difficulty: 'beginner' },
    { id: 'ChordsPractice', title: '코드 연습', titleEn: 'Chords Practice', composer: '', jsonPath: 'https://hyukyee1122.github.io/jellypiano/json/ChordsPractice.json', audioPath: AUDIO_BASE_URL + 'ChordsPractice.mp3', difficulty: 'beginner' },
    { id: 'PentatonicPractice', title: '펜타토닉 연습', titleEn: 'Pentatonic Practice', composer: '', jsonPath: 'https://hyukyee1122.github.io/jellypiano/json/PentatonicPractice.json', audioPath: AUDIO_BASE_URL + 'PentatonicPractice.mp3', difficulty: 'beginner' },
    { id: 'LilyOfTheValley', title: '내 진정 사모하는', titleEn: 'The Lily of the Valley', composer: '', jsonPath: 'https://hyukyee1122.github.io/jellypiano/json/LilyOfTheValley.json', audioPath: AUDIO_BASE_URL + 'LilyOfTheValley.mp3', difficulty: 'beginner' },
    { id: 'SesangBanghwang', title: '세상에서 방황할 때', titleEn: 'Lord, I Am a Sinner', composer: '안철호', jsonPath: 'https://hyukyee1122.github.io/jellypiano/json/SesangBanghwang.json', audioPath: AUDIO_BASE_URL + 'SesangBanghwang.mp3', difficulty: 'beginner' },
    { id: 'CanonInD', title: '캐논 in D', titleEn: 'Canon in D', composer: 'Johann Pachelbel', jsonPath: 'https://hyukyee1122.github.io/jellypiano/json/CanonInD.json?v=4', audioPath: AUDIO_BASE_URL + 'CanonInD.mp3', difficulty: 'easy' },
    // === 기존 곡 (mscz 기반으로 재생성 예정) ===
    // { id: 'Ode_to_Joy',       title: 'Ode to Joy',              composer: 'L. van Beethoven', jsonPath: BASE_URL + 'json/Ode_to_Joy.json',       audioPath: AUDIO_BASE_URL + 'Ode_to_Joy.mp3',       difficulty: 'beginner' },
    // { id: 'Greensleeves',     title: 'Greensleeves',            composer: 'Traditional',      jsonPath: BASE_URL + 'json/Greensleeves.json',     audioPath: AUDIO_BASE_URL + 'Greensleeves.mp3',     difficulty: 'easy' },
    // { id: 'Minuet_in_G',      title: 'Minuet in G Major',       composer: 'J.S. Bach',        jsonPath: BASE_URL + 'json/Minuet_in_G.json',      audioPath: AUDIO_BASE_URL + 'Minuet_in_G.mp3',      difficulty: 'easy' },
    // { id: 'Canon_in_D_Easy',  title: 'Canon in D',              composer: 'Pachelbel',        jsonPath: BASE_URL + 'json/Canon_in_D_Easy.json',  audioPath: AUDIO_BASE_URL + 'Canon_in_D_Easy.mp3',  difficulty: 'easy' },
    // { id: 'Waltz_Am_Chopin',  title: 'Waltz in A Minor',        composer: 'F. Chopin',        jsonPath: BASE_URL + 'json/Waltz_Am_Chopin.json',  audioPath: AUDIO_BASE_URL + 'Waltz_Am_Chopin.mp3',  difficulty: 'intermediate' },
    // { id: 'Fur_Elise',        title: 'Für Elise',               composer: 'L. van Beethoven', jsonPath: BASE_URL + 'json/Fur_Elise.json',        audioPath: AUDIO_BASE_URL + 'Fur_Elise.mp3',        difficulty: 'intermediate' },
    // { id: 'Moonlight_Sonata', title: 'Moonlight Sonata 1st Mov', composer: 'L. van Beethoven', jsonPath: BASE_URL + 'json/Moonlight_Sonata.json', audioPath: AUDIO_BASE_URL + 'Moonlight_Sonata.mp3', difficulty: 'intermediate' },
    // { id: 'Nocturne_Op9_No2', title: 'Nocturne Op.9 No.2',      composer: 'F. Chopin',        jsonPath: BASE_URL + 'json/Nocturne_Op9_No2.json', audioPath: AUDIO_BASE_URL + 'Nocturne_Op9_No2.mp3', difficulty: 'intermediate' },
    // { id: 'The_Entertainer',  title: 'The Entertainer',         composer: 'Scott Joplin',     jsonPath: BASE_URL + 'json/The_Entertainer.json',  audioPath: AUDIO_BASE_URL + 'The_Entertainer.mp3',  difficulty: 'intermediate' }
];

async function loadSongData(songId) {
    const songInfo = SONG_LIST.find(s => s.id === songId);
    if (!songInfo) throw new Error('곡을 찾을 수 없습니다: ' + songId);

    // 로컬 개발 서버(localhost)에서는 같은 출처의 로컬 파일을 사용한다.
    // 운영(jellypiano.com 등)에서는 기존 원격 URL을 그대로 사용한다.
    const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
    const jsonPath = isLocal ? ('json/' + songId + '.json') : songInfo.jsonPath;
    const audioPath = isLocal ? ('mp3/' + songId + '.mp3') : songInfo.audioPath;

    const response = await fetch(jsonPath);
    if (!response.ok) throw new Error('JSON 로드 실패: ' + jsonPath);
    const jsonData = await response.json();

    return {
        info: { ...songInfo, audioPath },
        data: jsonData,
        audioPath: audioPath
    };
}

function getSongList() {
    return SONG_LIST;
}

window.SONG_LIST = SONG_LIST;
window.loadSongData = loadSongData;
window.getSongList = getSongList;

// --- MP3 재생 + 시간 동기화 (AudioSync) ---
class AudioSync {
    constructor() {
        this.audio = new Audio();
        this.audio.preload = 'auto';
        this._speed = 1.0;
        this._loaded = false;
        this._onEndedCallback = null;
    }

    load(audioUrl) {
        return new Promise((resolve, reject) => {
            this._loaded = false;
            this.audio.src = audioUrl;
            this.audio.oncanplaythrough = () => {
                this._loaded = true;
                resolve();
            };
            this.audio.onerror = (e) => reject(new Error('오디오 로드 실패: ' + audioUrl));
            this.audio.load();
        });
    }

    play(startTime) {
        if (!this._loaded) return Promise.reject(new Error('오디오가 로드되지 않았습니다'));
        if (typeof startTime === 'number') {
            this.audio.currentTime = startTime;
        }
        this.audio.playbackRate = this._speed;
        return this.audio.play();
    }

    pause() {
        this.audio.pause();
    }

    stop() {
        this.audio.pause();
        this.audio.currentTime = 0;
    }

    resume() {
        this.audio.playbackRate = this._speed;
        return this.audio.play();
    }

    seek(time) {
        const clamped = Math.max(0, Math.min(time, this.duration));
        this.audio.currentTime = clamped;
    }

    get currentTime() {
        return this.audio.currentTime;
    }

    set currentTime(t) {
        this.audio.currentTime = t;
    }

    get duration() {
        return this.audio.duration || 0;
    }

    get speed() {
        return this._speed;
    }

    set speed(val) {
        this._speed = val;
        if (!this.audio.paused) {
            this.audio.playbackRate = val;
        }
    }

    get paused() {
        return this.audio.paused;
    }

    get loaded() {
        return this._loaded;
    }

    get volume() {
        return this.audio.volume;
    }

    set volume(val) {
        this.audio.volume = Math.max(0, Math.min(1, val));
    }

    onEnded(callback) {
        this._onEndedCallback = callback;
        this.audio.onended = callback;
    }
}

window.AudioSync = AudioSync;
