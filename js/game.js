const modal = document.getElementById('game-modal');

function openGameModal() {
    if (window.initResetButton) window.initResetButton();
    // 모달을 다시 열면 가이드 플래그 리셋하여 한 번 더 표시
    handGuideShown = false;
    showHandGuides();
    setTimeout(() => {
        initDesktopGameResizer();
        resize();
        restoreDesktopGameWidth();
        positionHandGuides(); // resize 후 정확한 좌표로 재계산
    }, 50);
}
// --- [기존 게임 로직] ---
const canvas = document.getElementById('pianoCanvas');
const ctx = canvas.getContext('2d');
const statusMsg = document.getElementById('status-msg');
let playBtn = document.getElementById('btn-play');
window.playBtn = playBtn;
const gameContainer = document.getElementById('game-container');
const gameWrapper = document.getElementById('game-wrapper');
// ── WebGL 렌더링 (Phase B) ───────────────────────────────
// true: 낙하 노트/연결바를 WebGL(PIXI)로 렌더 (글로우 저비용). PIXI 미가용 시 자동 2D 폴백.
// 문제가 생기면 false 로 바꾸면 즉시 기존 2D 경로로 복귀.
const USE_WEBGL = true;
let _routeWebGL = false; // 현재 프레임을 WebGL로 그릴지 (loop()에서만 true)
// zoom-level은 삭제되었으므로 float-zoom-level을 사용
const zoomLevelDisplay = document.getElementById('float-zoom-level');
const sectionSelect = document.getElementById('sel-section');
const controlsDiv = document.getElementById('controls');
const speedText = document.getElementById('txt-speed');
const songNameDisplay = document.getElementById('song-name-display');

// MP3 동기화 객체
const audioSync = new AudioSync();
let currentSongId = null;
let songMetadata = null; // JSON 메타데이터 (title, composer, bpm 등)

// 전역 변수들을 window 객체에 할당하여 다른 모듈에서 접근 가능하도록 함
window.sectionSelect = sectionSelect;
window.controlsDiv = controlsDiv;
window.speedText = speedText;
window.songNameDisplay = songNameDisplay;
window.audioSync = audioSync;
const staticKeyCanvas = document.createElement('canvas');
const staticKeyCtx = staticKeyCanvas.getContext('2d');
const progressContainer = document.getElementById('progress-container');
const progressFill = document.getElementById('progress-fill');
const progressHandle = document.getElementById('progress-handle');
const fullscreenBtn = document.getElementById('btn-fullscreen');
const metronomeBtn = document.getElementById('btn-metronome');
const metronomeText = document.getElementById('txt-metronome');
// 손가락 색상 가이드 요소
const leftHandGuide = document.getElementById('left-hand-guide');
const rightHandGuide = document.getElementById('right-hand-guide');
// 가이드를 이미 본 적 있는지 추적하는 플래그 (한 번만 표시)
let handGuideShown = false;

// 메뉴판 하단 ~ 건반 상단 사이 영역을 getBoundingClientRect()로 계산하여 가이드 배치
function positionHandGuides() {
    const innerContainer = document.getElementById('game-inner-container');
    if (!leftHandGuide || !rightHandGuide || !innerContainer || !controlsDiv || !canvas) return;
    if (logicalHeight <= 0) return;

    const parentRect = innerContainer.getBoundingClientRect();
    const controlsRect = controlsDiv.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    // 1. 노트 영역 상단 = 메뉴판(controls) 하단
    const noteTop = controlsRect.bottom - parentRect.top;

    // 2. 건반 상단 Y좌표 계산 (캔버스 내 건반 시작 위치를 화면 좌표로 변환)
    const canvasScale = canvasRect.height / logicalHeight;
    const keyboardTopScreen = canvasRect.top + (logicalHeight - keyHeight) * canvasScale;

    // 3. 노트 영역 하단 = 건반 상단 (game-wrapper 범위 내로 클램핑)
    const wrapperRect = gameWrapper.getBoundingClientRect();
    const effectiveBottom = Math.min(keyboardTopScreen, wrapperRect.bottom);
    const noteBottom = effectiveBottom - parentRect.top;

    const noteHeight = Math.max(0, noteBottom - noteTop);
    const noteWidth = parentRect.width;

    // 가이드 크기: 게임 영역 너비의 20%, 최소 80px 최대 140px
    const guideW = Math.min(140, Math.max(80, noteWidth * 0.20));
    // 하단 고정: 건반 상단 기준으로 위쪽에 배치
    const guideH = Math.min(guideW * 1.6, noteHeight * 0.6);
    const guideTop = noteBottom - guideH;

    // 왼손 가이드: 게임 영역 왼쪽 바깥 하단
    leftHandGuide.style.top = guideTop + 'px';
    leftHandGuide.style.left = (-guideW - 4) + 'px';
    leftHandGuide.style.width = guideW + 'px';
    leftHandGuide.style.height = guideH + 'px';

    // 오른손 가이드: 게임 영역 오른쪽 바깥 하단
    rightHandGuide.style.top = guideTop + 'px';
    rightHandGuide.style.left = (noteWidth + 4) + 'px';
    rightHandGuide.style.width = guideW + 'px';
    rightHandGuide.style.height = guideH + 'px';
}

function hideHandGuides() {
    if (leftHandGuide) leftHandGuide.classList.add('hidden');
    if (rightHandGuide) rightHandGuide.classList.add('hidden');
}

function showHandGuides() {
    if (handGuideShown) return;
    if (leftHandGuide) leftHandGuide.classList.remove('hidden');
    if (rightHandGuide) rightHandGuide.classList.remove('hidden');
    positionHandGuides();
}

// 손가락 가이드 위치 업데이트 (리사이즈/줌 시 호출)
function updateHandGuidePosition() {
    positionHandGuides();
}

// DOM 접근 최적화: 체크박스 요소 캐싱
let chkRight = null;
let chkLeft = null;
// devicePixelRatio를 그대로 쓰면 해상도는 높은데 GPU가 약한 기기(예: Adreno 610급)에서
// 캔버스 내부 픽셀 수가 불필요하게 커져 매 프레임 그릴 양이 늘어남.
// 1.5로 캡을 씌워서 시각적 선명도는 거의 유지하면서 래스터 작업량을 줄임.
const MAX_DPR = 1.5;
let dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
let logicalWidth = 800;
let logicalHeight = 600;
const fallingSpeed = 200;
// 활성 노트/연결바의 글로우(shadowBlur) 반경. Canvas 2D의 shadowBlur는 모바일에서 특히 비용이 큰 연산이라
// 기존 20에서 12로 낮춰 화음(여러 음 동시 발광) 구간의 프레임 비용을 줄임. 글로우가 약간 얇아지는 정도의 시각적 차이만 있음.
const ACTIVE_GLOW_BLUR = 12;
const startNote = 21; 
const endNote = 109;
const BLACK_KEY_WIDTH_RATIO = 0.72 * 1.08; 
const BLACK_KEY_HEIGHT_RATIO = 0.5; // 검은 건반 높이 = 흰 건반 높이의 50%

// ===============================
// 건반 높이/확대 단순화 (lg/md/sm)
// - 100% 기준 흰건반 높이를 px로 고정
// - 확대 시 가로는 줌 비율 그대로, 세로는 "증가분의 70%"만 따라감
//   예) 200%: 가로 2.0x, 세로 1 + (2.0-1)*0.7 = 1.7x
// ===============================
const WHITE_KEY_HEIGHT_PC     = 90;  // PC용 건반 높이 (768px 초과)
const WHITE_KEY_HEIGHT_MOBILE = 38;  // 모바일용 건반 높이 (768px 이하)
const VERTICAL_ZOOM_RATE = 0.9;
function getVerticalZoomFactor(zoomPercent) {
    const z = zoomPercent / 100;
    return 1 + (z - 1) * VERTICAL_ZOOM_RATE;
}


let keyHeight = 100;
let judgmentLineOffset = keyHeight * 1.2;

let isDraggingLine = false;
let didDragLine = false;
let currentZoom = 100;
let baseWidth = 1000;
let baseHeight = 1000;
let baseKeyHeight = 0; // 100%일 때의 건반 높이 기준값 
let isPlaying = false;
let audioOffset = 0; // MP3 앞 여백 오프셋
let isPaused = false;
let pauseTime = 0;
let pauseCurrentTime = 0; // 일시정지 시점의 currentTime (곡 시간 기준)

// ── 재생 타이머 (단일 시계: performance.now 기준) ─────────────
// MP3 제거 후 외부 오디오 시계가 없으므로 performance.now() 가 유일한 진실의 원천.
// 곡 시간 = _baseSongTime + (now - _startWall) * speed
let _baseSongTime = 0;   // 마지막 앵커 시점의 곡 시간(초)
let _startWall = 0;      // 마지막 앵커 시점의 performance.now()
let startTime = 0;
function anchorClock(songTime) {
    _baseSongTime = songTime;
    _startWall = performance.now();
}
let animationId;
let speed = 1.0;
let currentLoop = 0;
let loopCount = 0;
let metronomeEnabled = false;
let metronomeTimer = null;
let metronomeBeat = 0;
let metronomeLastBeatIndex = -1;
let metronomeAudioContext = null;

function getEffectiveMetronomeBpm() {
    const bpm = Number(detectedBpm) || 120;
    return Math.max(20, Math.round(bpm * speed));
}

function updateMetronomeUi() {
    if (metronomeText) metronomeText.innerText = getEffectiveMetronomeBpm() + ' BPM';
    if (metronomeBtn) {
        metronomeBtn.innerText = metronomeEnabled ? 'ON' : 'OFF';
        metronomeBtn.classList.toggle('active', metronomeEnabled);
        metronomeBtn.setAttribute('aria-pressed', metronomeEnabled ? 'true' : 'false');
    }
}

function playMetronomeClick(accent) {
    try {
        if (!metronomeAudioContext) {
            metronomeAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (metronomeAudioContext.state === 'suspended') metronomeAudioContext.resume();
        const now = metronomeAudioContext.currentTime;
        const osc = metronomeAudioContext.createOscillator();
        const gain = metronomeAudioContext.createGain();
        osc.type = 'square';
        osc.frequency.value = accent ? 1200 : 850;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(accent ? 0.22 : 0.14, now + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
        osc.connect(gain);
        gain.connect(metronomeAudioContext.destination);
        osc.start(now);
        osc.stop(now + 0.06);
    } catch (e) {}
}

function startMetronome() {
    metronomeEnabled = true;
    if (metronomeTimer) clearTimeout(metronomeTimer);
    metronomeTimer = null;
    metronomeBeat = 0;
    metronomeLastBeatIndex = -1;
    updateMetronomeUi();
}

function stopMetronome(updateUi = true) {
    if (metronomeTimer) clearTimeout(metronomeTimer);
    metronomeTimer = null;
    metronomeEnabled = false;
    if (updateUi) updateMetronomeUi();
}

function pauseMetronomeTimer() {
    if (metronomeTimer) clearTimeout(metronomeTimer);
    metronomeTimer = null;
}

function restartMetronomeIfEnabled() {
    if (metronomeEnabled) {
        metronomeBeat = 0;
        metronomeLastBeatIndex = -1;
        updateMetronomeUi();
    }
    else updateMetronomeUi();
}

function updateMetronomeFromSongTime(songTime) {
    if (!metronomeEnabled || !isPlaying || isPaused || songTime < 0) return;
    const bpm = Number(detectedBpm) || 120;
    const beatDuration = 60 / bpm;
    if (beatDuration <= 0) return;

    const beatIndex = Math.floor(songTime / beatDuration);
    if (beatIndex === metronomeLastBeatIndex) return;

    const beatsPerMeasure = Array.isArray(detectedTimeSignature) ? (detectedTimeSignature[0] || 4) : 4;
    playMetronomeClick(beatIndex % beatsPerMeasure === 0);
    metronomeBeat = beatIndex + 1;
    metronomeLastBeatIndex = beatIndex;
}
let isResetting = false; // 재설정 중 플래그 (이벤트 리스너 중복 실행 방지)

let notes = []; 
let notesByPitch = {}; // 성능 최적화: 음높이(미디 번호)별로 노트를 미리 그룹화한 인덱스. drawFullHeightBeams에서 매 프레임 전체 notes 배열을 filter()하는 대신 이걸 조회함 (곡 로드 시 1회만 생성)
let currentSection = null; 
let songDuration = 0;
let isDefaultSong = false;
let currentSongSections = []; 

let measureTimes = []; 
let detectedTimeSignature = [4, 4]; 
let detectedBpm = 120;
// (detectedKeySignature 제거됨 — 분리선이 실제 노트 hand 데이터 기반으로 계산)
// (Tone.js Sampler 제거됨 — MP3 재생으로 전환)
let currentPressedNotes = []; 
let nextNoteIndex = 0; 
const timingTolerance = 0.2;

// ===== 키 플래시 시스템 (경계선 폭발 효과) =====
let keyFlashes = {}; // { midi: { color, life, x, w } }

function triggerKeyFlash(midi, color) {
    const keyW = logicalWidth / totalWhiteKeys;
    const x = getNoteX(midi);
    const w = isWhiteKey(midi) ? keyW - 2 : keyW * BLACK_KEY_WIDTH_RATIO;
    keyFlashes[midi] = { color, life: 1.0, x, w };
}

function drawKeyFlashes() {
    const borderY = logicalHeight - keyHeight; // 건반 상단 = 노트/건반 경계선

    Object.keys(keyFlashes).forEach(midi => {
        const f = keyFlashes[midi];
        if (f.life <= 0) { delete keyFlashes[midi]; return; }

        const cx = f.x + f.w / 2;
        const spread = f.w * (1 + (1 - f.life) * 4); // 좌우로 퍼지는 폭
        const height = 12 * f.life; // 위아래로 퍼지는 높이

        ctx.save();

        // 좌우로 퍼지는 타원형 폭발
        const _h=f.color.replace('#',''), _r=parseInt(_h.slice(0,2),16), _g=parseInt(_h.slice(2,4),16), _b=parseInt(_h.slice(4,6),16);
        const grad = ctx.createRadialGradient(cx, borderY, 0, cx, borderY, spread);
        grad.addColorStop(0,   `rgba(${_r},${_g},${_b},1.0)`);
        grad.addColorStop(0.3, `rgba(${_r},${_g},${_b},0.7)`);
        grad.addColorStop(1,   `rgba(${_r},${_g},${_b},0.0)`);

        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = f.life;
        ctx.fillStyle = grad;

        // 타원형으로 그리기
        ctx.beginPath();
        ctx.ellipse(cx, borderY, spread, height, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        f.life -= 0.07;
    });
}
let score = { correct: 0, missed: 0, total: 0 };
// (MIDI 입출력 배열 제거됨)
const COLORS = { RED: '#ff4444', YELLOW: '#ffeb3b', GREEN: '#00e676', BLUE: '#536dfe', PURPLE: '#d05ce3' };
const FINGER_COLOR_MAP = { 1: COLORS.RED, 2: COLORS.YELLOW, 3: COLORS.GREEN, 4: COLORS.BLUE, 5: COLORS.PURPLE };
const LEFT_FINGER_COLOR_MAP = { 5: COLORS.RED, 4: COLORS.YELLOW, 3: COLORS.GREEN, 2: COLORS.BLUE, 1: COLORS.PURPLE };
// (BYPASS_TRACK_MAP 제거됨 — MIDI 트랙 매핑 불필요)

// ===== 피아노 신디사이저 (한손 연습 모드용) =====
// MP3는 양손이 하나의 파일로 합쳐져 있어 개별 손 분리가 불가능하므로,
// 한손 모드에서는 MP3를 음소거하고 Web Audio API 신디사이저로 선택된 손의 노트만 재생한다.
// MP3 대신 실제 피아노 샘플(SoundFont)로 모든 음을 합성한다.
// 배속을 바꿔도 "노트 트리거 간격"만 달라질 뿐 샘플 자체는 원음이라 음 깨짐이 없다.
// soundfont-player 미로드/로딩 전에는 기존 사인+배음 합성음으로 자동 폴백.
class PianoSynth {
    constructor() {
        this.audioContext = null;
        this.masterGain = null;
        this.isInitialized = false;
        this.instrument = null;          // soundfont-player 샘플 피아노
        this._loadingInstrument = false;
    }

    init() {
        if (this.isInitialized) return;
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = 0.85;
            this.masterGain.connect(this.audioContext.destination);
            this.isInitialized = true;
            this._loadInstrument();
        } catch (e) {
            console.error('PianoSynth init failed:', e);
        }
    }

    // 피아노 샘플 로드 (한 번만). 실패해도 폴백 합성음으로 계속 동작.
    _loadInstrument() {
        if (this.instrument || this._loadingInstrument) return;
        if (typeof Soundfont === 'undefined') {
            console.warn('soundfont-player 미로드 — 합성음으로 동작합니다.');
            return;
        }
        this._loadingInstrument = true;
        Soundfont.instrument(this.audioContext, 'acoustic_grand_piano', { destination: this.masterGain })
            .then(inst => { this.instrument = inst; console.log('🎹 피아노 샘플 로드 완료'); })
            .catch(e => { console.warn('피아노 샘플 로드 실패, 합성음 폴백:', e); })
            .finally(() => { this._loadingInstrument = false; });
    }

    resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        // 컨텍스트가 살아난 뒤에도 샘플이 없으면 재시도
        if (this.isInitialized && !this.instrument) this._loadInstrument();
    }

    playNote(midi, duration) {
        if (!this.isInitialized) this.init();
        if (!this.audioContext) return;
        this.resume();
        const dur = Math.max(0.1, duration);

        // 1순위: 샘플 피아노 (자연 음정·감쇠, 배속 왜곡 없음)
        if (this.instrument) {
            try {
                this.instrument.play(midi, this.audioContext.currentTime, { duration: dur, gain: 1.4 });
                return;
            } catch (e) { /* 폴백으로 진행 */ }
        }

        // 폴백: 사인+배음 합성 (샘플 로딩 전 잠깐 동안만)
        this._playSynth(midi, dur);
    }

    _playSynth(midi, dur) {
        const freq = 440 * Math.pow(2, (midi - 69) / 12);
        const now = this.audioContext.currentTime;

        const noteGain = this.audioContext.createGain();
        noteGain.connect(this.masterGain);

        const attackTime = 0.008;
        const decayTime = 0.15;
        const sustainLevel = 0.2;
        const releaseTime = Math.min(0.4, dur * 0.3);
        const sustainEnd = now + Math.max(dur - releaseTime, attackTime + decayTime + 0.01);

        noteGain.gain.setValueAtTime(0, now);
        noteGain.gain.linearRampToValueAtTime(0.45, now + attackTime);
        noteGain.gain.exponentialRampToValueAtTime(Math.max(0.001, sustainLevel), now + attackTime + decayTime);
        noteGain.gain.setValueAtTime(Math.max(0.001, sustainLevel), sustainEnd);
        noteGain.gain.exponentialRampToValueAtTime(0.001, sustainEnd + releaseTime);

        const harmonics = [
            { ratio: 1, gain: 1.0 },
            { ratio: 2, gain: 0.4 },
            { ratio: 3, gain: 0.15 },
            { ratio: 4, gain: 0.06 },
        ];

        const endTime = sustainEnd + releaseTime + 0.05;
        harmonics.forEach(h => {
            if (freq * h.ratio > 20000) return;
            const osc = this.audioContext.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq * h.ratio;
            const hGain = this.audioContext.createGain();
            hGain.gain.value = h.gain;
            osc.connect(hGain);
            hGain.connect(noteGain);
            osc.start(now);
            osc.stop(endTime);
        });
    }

    setVolume(val) {
        if (this.masterGain) {
            this.masterGain.gain.value = Math.max(0, Math.min(1, val));
        }
    }

    stopAll() {
        // 샘플 피아노: 예약/재생 중인 모든 노트 정지
        if (this.instrument && this.instrument.stop) {
            try { this.instrument.stop(); } catch (e) {}
        }
    }
}

const pianoSynth = new PianoSynth();
let useSynth = false; // true: 한손 모드 (신디사이저 사용)

const noteNamesList = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function getNoteName(midi) { return noteNamesList[midi % 12]; }

// 좌우 분리선 X 좌표 (logicalWidth 기준, Canvas에 직접 렌더링)
let centerGuideLogicalX = -1; // -1이면 미계산 상태
// (midiToFreq 제거됨 — MP3 재생 방식에서는 주파수 변환 불필요)
function isWhiteKey(midi) { const note = midi % 12; return [0, 2, 4, 5, 7, 9, 11].includes(note); }

let totalWhiteKeys = 0;
// 성능 최적화: 각 미디 노트 이전까지의 흰건반 개수를 미리 계산해서 캐싱
// (기존엔 getNoteX 호출마다 반복문을 다시 돌렸는데, 노트마다/프레임마다 호출되니 비용이 컸음)
const _whiteKeyCountBefore = {};
for(let i = startNote; i < endNote; i++) {
    _whiteKeyCountBefore[i] = totalWhiteKeys;
    if(isWhiteKey(i)) totalWhiteKeys++;
}
function getNoteX(midi) {
    const keyW = logicalWidth / totalWhiteKeys;
    const whiteKeyCount = _whiteKeyCountBefore[midi] !== undefined ? _whiteKeyCountBefore[midi] : 0;
    if (!isWhiteKey(midi)) { return (whiteKeyCount * keyW) - (keyW * (BLACK_KEY_WIDTH_RATIO / 2)); }
    return whiteKeyCount * keyW;
}

// 좌우 분리선 위치 계산: 왼손 최고음과 오른손 최저음의 중간 지점
function updateCenterGuidePosition() {
    try {
        if (!notes || !Array.isArray(notes) || notes.length === 0 ||
            logicalWidth <= 0 || totalWhiteKeys <= 0) {
            centerGuideLogicalX = logicalWidth / 2;
            return;
        }

        const leftNotes = notes.filter(n => n && n.hand === 'left');
        const rightNotes = notes.filter(n => n && n.hand === 'right');

        // 양손 노트가 모두 있어야 분리선 의미 있음
        if (leftNotes.length === 0 || rightNotes.length === 0) {
            centerGuideLogicalX = logicalWidth / 2;
            return;
        }

        const leftHighestMidi = Math.max(...leftNotes.map(n => n.note));
        const rightLowestMidi = Math.min(...rightNotes.map(n => n.note));

        const keyW = logicalWidth / totalWhiteKeys;

        // 각 키의 중심 X 좌표 계산
        function keyCenterX(midi) {
            const x = getNoteX(midi);
            return isWhiteKey(midi) ? x + keyW / 2 : x + keyW * BLACK_KEY_WIDTH_RATIO / 2;
        }

        const leftCenterX = keyCenterX(leftHighestMidi);
        const rightCenterX = keyCenterX(rightLowestMidi);
        centerGuideLogicalX = (leftCenterX + rightCenterX) / 2;

    } catch (e) {
        console.error('updateCenterGuidePosition error:', e);
        centerGuideLogicalX = logicalWidth / 2;
    }
}

// 좌우 분리선을 Canvas에 직접 렌더링 (노트/건반/기준선보다 뒤에 표시)
function drawCenterGuide() {
    if (centerGuideLogicalX <= 0 || logicalWidth <= 0) return;

    const showRight = chkRight ? chkRight.checked : true;
    const showLeft = chkLeft ? chkLeft.checked : true;

    // 양손 모드일 때만 표시
    const hasLeft = showLeft && notes.some(n => n && n.hand === 'left');
    const hasRight = showRight && notes.some(n => n && n.hand === 'right');
    if (!hasLeft || !hasRight) return;

    const viewHeight = logicalHeight - keyHeight; // 건반 상단까지만

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(centerGuideLogicalX, 0);
    ctx.lineTo(centerGuideLogicalX, viewHeight);
    ctx.stroke();
    ctx.restore();
}
function prerenderKeyboard() {
    staticKeyCanvas.width = logicalWidth * dpr;
    staticKeyCanvas.height = keyHeight * dpr;
    staticKeyCtx.resetTransform();
    staticKeyCtx.scale(dpr, dpr);
    const y = 0; 
    const keyW = logicalWidth / totalWhiteKeys;
    const whiteFontSize = Math.max(10, Math.min(Math.floor(keyW * 0.8), Math.floor(keyHeight * 0.5)));
    
    const blackKeyRealWidth = keyW * BLACK_KEY_WIDTH_RATIO;
    const blackKeyHeight = keyHeight * BLACK_KEY_HEIGHT_RATIO;
    
    const blackFontSize = Math.max(9, Math.min(Math.floor(blackKeyRealWidth * 0.6), Math.floor(blackKeyHeight * 0.5)));
    staticKeyCtx.textAlign = 'center';
    staticKeyCtx.textBaseline = 'middle';
    
    let whiteIndex = 0;
    for(let i = startNote; i < endNote; i++) {
        if(isWhiteKey(i)) {
            const x = whiteIndex * keyW;

            // 흰 건반: 아이보리 그라디언트 (상단=크림, 하단=순백)
            const whiteGrad = staticKeyCtx.createLinearGradient(x, y, x, y + keyHeight);
            whiteGrad.addColorStop(0,    '#c8c0b0');
            whiteGrad.addColorStop(0.06, '#ede8da');
            whiteGrad.addColorStop(0.5,  '#faf7f0');
            whiteGrad.addColorStop(1,    '#ffffff');
            staticKeyCtx.fillStyle = whiteGrad;
            staticKeyCtx.fillRect(x, y, keyW - 1, keyHeight);

            // 왼쪽 하이라이트 (입체감)
            const leftHL = staticKeyCtx.createLinearGradient(x, y, x + keyW * 0.15, y);
            leftHL.addColorStop(0, 'rgba(255,255,255,0.55)');
            leftHL.addColorStop(1, 'rgba(255,255,255,0)');
            staticKeyCtx.fillStyle = leftHL;
            staticKeyCtx.fillRect(x, y, keyW * 0.15, keyHeight);

            // 오른쪽 경계 그림자
            staticKeyCtx.fillStyle = 'rgba(0,0,0,0.22)';
            staticKeyCtx.fillRect(x + keyW - 2, y, 2, keyHeight);

            // 상단 테두리
            staticKeyCtx.fillStyle = 'rgba(60,40,20,0.35)';
            staticKeyCtx.fillRect(x, y, keyW - 1, 1);

            // 하단 테두리 (건반 끝 어두운 라인)
            staticKeyCtx.fillStyle = 'rgba(0,0,0,0.3)';
            staticKeyCtx.fillRect(x, y + keyHeight - 2, keyW - 1, 2);

            // C 건반 하단 빨간 바
            if (i % 12 === 0) {
                const barH = Math.max(3, keyHeight * 0.08);
                const barW = (keyW - 1) * 0.8;
                const barX = x + (keyW - 1) * 0.1;
                const barY = y + keyHeight - barH - 2;
                staticKeyCtx.fillStyle = '#E53935';
                staticKeyCtx.beginPath();
                if (staticKeyCtx.roundRect) {
                    staticKeyCtx.roundRect(barX, barY, barW, barH, 2);
                } else {
                    staticKeyCtx.rect(barX, barY, barW, barH);
                }
                staticKeyCtx.fill();
            }

            staticKeyCtx.fillStyle = '#000';
            staticKeyCtx.font = whiteFontSize + 'px Arial';
            staticKeyCtx.fillText(getNoteName(i), x + keyW/2, y + keyHeight - (whiteFontSize * 0.7));
            if (i % 12 === 0) {
                const octave = (i / 12) - 1;
                if (octave >= 1 && octave <= 8) {
                    staticKeyCtx.save();
                    const baseStr = getNoteName(i);
                    const baseMetric = staticKeyCtx.measureText(baseStr);
                    const numFontSize = Math.max(7, Math.floor(whiteFontSize * 0.5)); // 폰트 축소
                    staticKeyCtx.font = numFontSize + 'px Arial';
                    staticKeyCtx.fillStyle = '#ff0000';
                    staticKeyCtx.textAlign = 'left';
                    const numX = (x + keyW/2) + (baseMetric.width * 0.15);
                    const noteY = y + keyHeight - (whiteFontSize * 0.7);
                    const yLift = whiteFontSize * 0.45; // 위로 더 올림
                    staticKeyCtx.textBaseline = 'bottom';
                    staticKeyCtx.fillText(octave, numX, noteY - yLift);
                    staticKeyCtx.restore();
                }
            }
            whiteIndex++;
        }
    }
    whiteIndex = 0;
    for(let i = startNote; i < endNote; i++) {
        if(isWhiteKey(i)) {
            whiteIndex++;
        } else {
            const w = keyW * BLACK_KEY_WIDTH_RATIO;
            const x = (whiteIndex * keyW) - (w / 2);
            const h = keyHeight * BLACK_KEY_HEIGHT_RATIO;

            // 검은 건반: 상단 밝고 하단 어두운 그라디언트 (입체감)
            const blackGrad = staticKeyCtx.createLinearGradient(x, y, x, y + h);
            blackGrad.addColorStop(0,    '#686868');
            blackGrad.addColorStop(0.07, '#2e2e2e');
            blackGrad.addColorStop(0.5,  '#1a1a1a');
            blackGrad.addColorStop(1,    '#080808');
            staticKeyCtx.fillStyle = blackGrad;
            staticKeyCtx.beginPath();
            if (staticKeyCtx.roundRect) {
                staticKeyCtx.roundRect(x, y, w, h, [0, 0, 4, 4]);
            } else {
                staticKeyCtx.rect(x, y, w, h);
            }
            staticKeyCtx.fill();

            // 검은 건반 왼쪽 하이라이트
            const bLeftHL = staticKeyCtx.createLinearGradient(x, y, x + w * 0.35, y);
            bLeftHL.addColorStop(0, 'rgba(255,255,255,0.18)');
            bLeftHL.addColorStop(1, 'rgba(255,255,255,0)');
            staticKeyCtx.fillStyle = bLeftHL;
            staticKeyCtx.beginPath();
            if (staticKeyCtx.roundRect) {
                staticKeyCtx.roundRect(x, y, w * 0.35, h, [0, 0, 4, 0]);
            } else {
                staticKeyCtx.rect(x, y, w * 0.35, h);
            }
            staticKeyCtx.fill();

            // 검은 건반 상단 하이라이트 선
            staticKeyCtx.fillStyle = 'rgba(255,255,255,0.3)';
            staticKeyCtx.fillRect(x + 1, y, w - 2, 1);

            staticKeyCtx.fillStyle = '#fff';
            staticKeyCtx.font = blackFontSize + 'px Arial';
            const sharpName = getNoteName(i);
            staticKeyCtx.save();
            staticKeyCtx.textBaseline = 'bottom';
            drawSmartText(staticKeyCtx, sharpName, x + w/2, y + h - (blackFontSize * 0.2));
            staticKeyCtx.restore();
        }
    }
}
function drawJudgmentLine() {
    const y = (logicalHeight - keyHeight) - judgmentLineOffset; 
    
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = '#00d2ff'; 
    ctx.lineWidth = 2; 
    ctx.globalAlpha = 0.6; 
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00d2ff';
    ctx.moveTo(0, y);
    ctx.lineTo(logicalWidth, y);
    ctx.stroke();
    ctx.restore();
}
function drawSmartText(targetCtx, text, x, y) {
    if (!text.includes('#')) {
        targetCtx.fillText(text, x, y);
        return;
    }
    const base = text.replace('#', '');
    const sharp = '♯';
    targetCtx.save();
    const currentFont = targetCtx.font; 
    const sizeMatch = currentFont.match(/(\d+)px/);
    const fontSize = sizeMatch ? parseInt(sizeMatch[1]) : 12;
    const isBold = currentFont.includes('bold');
    const fontFamily = 'Arial'; 
    
    const baseFont = (isBold ? "bold " : "") + fontSize + "px " + fontFamily;
    const sharpSize = Math.max(9, Math.floor(fontSize * 0.6)); 
    const sharpFont = (isBold ? "bold " : "") + sharpSize + "px " + fontFamily;
    targetCtx.font = baseFont;
    targetCtx.textAlign = 'center'; 
    targetCtx.fillText(base, x, y);
    
    const baseMetric = targetCtx.measureText(base);
    const sharpX = x + (baseMetric.width / 2) - (fontSize * 0.1); 
    let yLift = fontSize * 0.6; 
    if (targetCtx.textBaseline === 'bottom') yLift = fontSize * 1.1; 
    else if (targetCtx.textBaseline === 'middle') yLift = fontSize * 0.9; 
    else if (targetCtx.textBaseline === 'alphabetic') yLift = fontSize * 0.95; 
    
    targetCtx.font = sharpFont;
    targetCtx.textAlign = 'left'; 
    targetCtx.fillText(sharp, sharpX, y - yLift);
    targetCtx.restore();
}
function drawFingerSmart(ctx, text, x, y, isShort, maxWidth) {
    let fingerStr = String(text);
    let isLeft = fingerStr.startsWith('L');
    let numberStr = isLeft ? fingerStr.substring(1) : fingerStr;
    ctx.save();
    let numFontSize = 36; 
    if (maxWidth) {
        let maxFont = maxWidth * 0.8; 
        if (numFontSize > maxFont) numFontSize = Math.max(10, Math.floor(maxFont));
    }
    ctx.font = numFontSize + 'px Arial';
    ctx.textBaseline = 'middle'; 
    ctx.textAlign = 'center';

    // 텍스트 색에 따라 외곽선 색 반대로 (검은글씨→흰테두리, 흰글씨→검은테두리)
    const textColor = ctx.fillStyle;
    const outlineColor = (textColor === '#000' || textColor === '#000000') 
        ? 'rgba(255,255,255,0.85)' 
        : 'rgba(0,0,0,0.75)';
    const outlineWidth = Math.max(2.5, numFontSize * 0.15);

    if (isLeft) {
        let boxSize = numFontSize * 1.1; 
        let halfBox = boxSize / 2;
        let centerY = y - (numFontSize * 0.5);
        // 사각형: 외곽선 후 노트색 선
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = outlineColor;
        ctx.beginPath();
        ctx.rect(x - halfBox, centerY - halfBox, boxSize, boxSize);
        ctx.stroke();
        ctx.strokeStyle = textColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(x - halfBox, centerY - halfBox, boxSize, boxSize);
        ctx.stroke();
        // 숫자
        ctx.lineWidth = outlineWidth;
        ctx.strokeStyle = outlineColor;
        ctx.lineJoin = 'round';
        ctx.strokeText(numberStr, x, centerY + (numFontSize * 0.05));
        ctx.fillText(numberStr, x, centerY + (numFontSize * 0.05)); 
    } else {
        ctx.textBaseline = 'alphabetic';
        ctx.lineWidth = outlineWidth;
        ctx.strokeStyle = outlineColor;
        ctx.lineJoin = 'round';
        ctx.strokeText(numberStr, x, y);
        ctx.fillText(numberStr, x, y);
    }
    ctx.restore();
}
// (WebMIDI 키보드 입력 코드 제거됨 — MP3 재생 방식으로 전환)
// (MIDI 파일 업로드 코드 제거됨 — JSON + MP3 로딩으로 전환)

// JSON 곡 데이터를 내부 노트 형식으로 변환
function parseSongJSON(jsonData) {
    songMetadata = {
        title: jsonData.title || 'Unknown',
        composer: jsonData.composer || '',
        bpm: jsonData.bpm || 120,
        timeSignature: jsonData.timeSignature || '4/4',
        totalDuration: jsonData.totalDuration || 0,
        difficulty: jsonData.difficulty || 'intermediate',
        noteCount: jsonData.noteCount || 0
    };

    // 박자/BPM 설정
    const tsParts = songMetadata.timeSignature.split('/');
    detectedTimeSignature = tsParts.length === 2 ? [parseInt(tsParts[0]), parseInt(tsParts[1])] : [4, 4];
    detectedBpm = songMetadata.bpm;
    restartMetronomeIfEnabled();

    const processedNotes = [];
    const measureSet = new Set();

    (jsonData.notes || []).forEach(n => {
        const hand = (n.hand === 'L') ? 'left' : 'right';
        const fingerNum = n.finger;
        let color, fingerLabel;

        if (hand === 'right') {
            color = FINGER_COLOR_MAP[fingerNum] || COLORS.RED;
            fingerLabel = fingerNum ? String(fingerNum) : '';
        } else {
            color = LEFT_FINGER_COLOR_MAP[fingerNum] || COLORS.PURPLE;
            fingerLabel = fingerNum ? ('L' + fingerNum) : '';
        }

        processedNotes.push({
            note: n.midi,
            startTime: n.time,
            durationTime: n.duration,
            hand: hand,
            finger: fingerLabel,
            color: color,
            idleColor: color,
            played: false,
            synthTriggered: false,
            scoreStatus: 'pending'
        });

        if (n.measure !== null && n.measure !== undefined) {
            measureSet.add(n.measure);
        }
    });

    processedNotes.sort((a, b) => {
        if (a.startTime !== b.startTime) return a.startTime - b.startTime;
        if (a.hand !== b.hand) return a.hand === 'right' ? -1 : 1;
        // 양손 모두 낮은 pitch 먼저 (finger 순서는 JSON 데이터 그대로)
        return a.note - b.note;
    });
    notes = processedNotes;

    // 음높이별 노트 인덱스 생성 (곡 로드 시 1회만) — drawFullHeightBeams 최적화용
    notesByPitch = {};
    notes.forEach(n => {
        if (!notesByPitch[n.note]) notesByPitch[n.note] = [];
        notesByPitch[n.note].push(n);
    });

    // 마디 시간 계산 (JSON의 measure 필드 기반)
    const sortedMeasures = Array.from(measureSet).sort((a, b) => a - b);
    measureTimes = [];
    sortedMeasures.forEach(m => {
        const firstNoteInMeasure = processedNotes.find(n => {
            const jsonNote = (jsonData.notes || []).find(jn => jn.midi === n.note && Math.abs(jn.time - n.startTime) < 0.001);
            return jsonNote && jsonNote.measure === m;
        });
        if (firstNoteInMeasure) {
            measureTimes.push(firstNoteInMeasure.startTime);
        }
    });
    if (measureTimes.length === 0 || measureTimes[0] > 1.0) measureTimes.unshift(0);

    // 곡 전체 길이 - JSON 기준 (MP3 제거)
    const lastNote = notes[notes.length - 1];
    const lastNoteEnd = lastNote ? (lastNote.startTime + lastNote.durationTime) : 0;
    const jsonDuration = jsonData.totalDuration || (lastNoteEnd + 0.5);
    songDuration = jsonDuration;

    updateSectionDropdown();
    stopGame(true);

    // 현재곡을 '곡 선택' 버튼 안에 표시 (별도 플로팅 제거)
    const songSelectBtn = document.getElementById('btn-song-select-tablet');
    if (songSelectBtn) songSelectBtn.innerText = '현재곡 : ' + songMetadata.title;
    if (songNameDisplay) { songNameDisplay.innerText = ''; songNameDisplay.style.display = 'none'; }
    // 양손/한손 모드에 따라 고정 시작 줌 레벨 설정 (체크박스 상태 고려)
    updateZoomBasedOnHands();
    // 좌우 분리선 위치 및 높이 업데이트 (안전하게 호출)
    setTimeout(() => {
        try {
            updateCenterGuidePosition();
        } catch (e) {
            console.error('분리선 위치 업데이트 중 에러:', e);
        }
    }, 100);
    const tsStr = detectedTimeSignature.join('/');
    const hasLeft = notes.some(n => n.hand === 'left');
    const hasRight = notes.some(n => n.hand === 'right');
    const handInfo = (hasLeft && hasRight) ? '양손' : (hasRight ? '오른손' : '왼손');
    statusMsg.innerText = `${songMetadata.title}\n(BPM: ${detectedBpm}, 박자: ${tsStr}, ${handInfo})\n재생 버튼을 눌러 시작하세요`;
    statusMsg.style.display = 'block';
}

// 곡 로딩 함수 (JSON + MP3)
async function loadAndStartSong(songId) {
    try {
        statusMsg.innerText = '곡을 로딩 중입니다...';
        statusMsg.style.display = 'block';

        // JSON 데이터 로드
        const songResult = await loadSongData(songId);

        // MP3 제거: 오디오 파일 로드 대신 피아노 샘플을 미리 준비
        pianoSynth.init();

        // JSON → 내부 노트 형식 변환
        currentSongId = songId;
        isDefaultSong = false;
        parseSongJSON(songResult.data);

        console.log('곡 로드 완료:', songResult.info.title, '- 노트:', notes.length);
    } catch (err) {
        console.error('곡 로딩 실패:', err);
        statusMsg.innerText = '곡 로딩에 실패했습니다.\n' + err.message;
        statusMsg.style.display = 'block';
    }
}
window.loadAndStartSong = loadAndStartSong;

// 손 선택 모드에 따라 MP3 볼륨과 신디사이저 모드를 전환
function updateHandAudioMode() {
    // MP3 제거: 양손/한손 구분 없이 항상 샘플 피아노로 재생한다.
    // 어떤 손을 소리낼지는 loop()의 노트 트리거에서 체크박스 기준으로 결정.
    useSynth = true;
    pianoSynth.init();
    pianoSynth.resume();
    // 재생 중 손을 바꾸면, 아직 안 지난 노트의 트리거 플래그만 초기화하여 다시 소리나게 함
    if (isPlaying) {
        const currentTime = getCurrentTime();
        notes.forEach(n => {
            if (n.startTime > currentTime) {
                n.synthTriggered = false;
            }
        });
    }
}
window.updateHandAudioMode = updateHandAudioMode;

function drawFullHeightBeams(activeBeams, notes, currentTime) {
    const viewHeight = logicalHeight - keyHeight;
    const keyW = logicalWidth / totalWhiteKeys;
    const bWidth = keyW / 4;
    const judgmentY = viewHeight - judgmentLineOffset; // 기준선 위치
    
    Object.keys(activeBeams).forEach(midi => {
        const info = activeBeams[midi];
        if (info.source === 'input') return;
        const x = getNoteX(midi);
        const beamX = x + (isWhiteKey(midi) ? keyW/2 : keyW*BLACK_KEY_WIDTH_RATIO/2) - (bWidth / 2);
        
        let beamStartY = viewHeight; // 기본값: 바를 그리지 않음
        if (notes && currentTime !== undefined) {
            // DOM 접근 최적화: 체크박스 상태를 한 번만 확인
            const showRight = chkRight ? chkRight.checked : true;
            const showLeft = chkLeft ? chkLeft.checked : true;
            // 성능 최적화: 전체 notes 배열을 filter하지 않고, 음높이별로 미리 그룹화된 작은 배열(notesByPitch)만 조회
            const candidateNotes = notesByPitch[parseInt(midi)] || [];
            const relevantNotes = candidateNotes.filter(n => {
                if(n.hand === 'right' && !showRight) return false;
                if(n.hand === 'left' && !showLeft) return false;
                return true;
            });
            
            if (relevantNotes.length > 0) {
                let lowestYBottom = viewHeight;
                let hasReachedJudgmentLine = false;
                
                relevantNotes.forEach(n => {
                    const timeDiff = n.startTime - currentTime;
                    const yBottom = viewHeight - (timeDiff * fallingSpeed);
                    const yTop = yBottom - (n.durationTime * fallingSpeed);
                    if (yBottom > 0 && yTop < viewHeight) {
                        // 노트의 밑면이 기준선에 닿았거나 기준선 아래로 내려갔는지 확인
                        if (yBottom >= judgmentY) {
                            hasReachedJudgmentLine = true;
                            // 기준선 아래에 있는 노트의 밑면만 lowestYBottom 계산에 포함
                            // 기준선 위에 있는 노트는 바 계산에서 제외
                            if (yBottom < lowestYBottom) {
                                lowestYBottom = yBottom;
                            }
                        }
                    }
                });
                
                // 노트의 밑면이 기준선에 닿았을 때만 바를 그림
                if (hasReachedJudgmentLine) {
                    // 바는 기준선 아래에 있는 노트의 밑면부터 건반까지만 그림
                    // lowestYBottom은 이미 기준선 아래에 있는 노트만 포함하므로
                    // 기준선 위에는 바가 나타나지 않음
                    beamStartY = lowestYBottom;
                }
            }
        }
        
        // 바는 beamStartY부터 건반(viewHeight)까지만 그림
        const beamHeight = viewHeight - beamStartY;
        if (_routeWebGL) {
            if (beamHeight > 0) JPRenderer.addRect(beamX, beamStartY, bWidth, beamHeight, info.color || '#888', 1.0, true, 0);
        } else {
            ctx.save();
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1.0;
            ctx.shadowBlur = ACTIVE_GLOW_BLUR;
            ctx.shadowColor = info.color || '#888';
            ctx.fillStyle = info.color || '#888';
            if (beamHeight > 0) {
                ctx.fillRect(beamX, beamStartY, bWidth, beamHeight);
            }
            ctx.restore();
        }
    });
}
function drawNotes(currentTime) {
    const viewHeight = logicalHeight - keyHeight;
    const keyW = logicalWidth / totalWhiteKeys;
    
    const judgmentY = viewHeight - judgmentLineOffset;
    ctx.textAlign = 'center';
    
    // DOM 접근 최적화: 체크박스 상태를 한 번만 확인
    const showRight = chkRight ? chkRight.checked : true;
    const showLeft = chkLeft ? chkLeft.checked : true;
    notes.forEach(n => {
        if(n.hand === 'right' && !showRight) return;
        if(n.hand === 'left' && !showLeft) return;
        const timeDiff = n.startTime - currentTime;
        // 화면 밖 노트 필터링 강화 (성능 최적화)
        if (timeDiff + n.durationTime < -1) return; // 이미 지나간 노트
        if (timeDiff * fallingSpeed > viewHeight + 100) return; // 너무 먼 미래의 노트 (100px 여유)
        if (n.startTime > songDuration) return; // songDuration 넘은 노트 표시 안 함
        const y = viewHeight - (timeDiff * fallingSpeed);
        const height = Math.max(n.durationTime * fallingSpeed, 20);
        if (y - height > viewHeight + 50) return; // 화면 위로 완전히 벗어난 경우 (50px 여유)
        if (y < -50) return; // 화면 아래로 완전히 벗어난 경우 (50px 여유)
        const x = getNoteX(n.note);
        const width = isWhiteKey(n.note) ? keyW - 2 : keyW * BLACK_KEY_WIDTH_RATIO;
        const radius = width * 0.1;
        const isActive = y >= judgmentY;
        if (_routeWebGL) {
            // 노트 본체는 WebGL로 (글로우는 active일 때 렌더러가 처리). 텍스트는 아래에서 2D로.
            JPRenderer.addRect(x, y - height, width, height - 2, n.color || '#888', isActive ? 1.0 : 0.6, isActive, radius);
        } else {
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(x, y - height, width, height - 2, radius);
            else ctx.rect(x, y - height, width, height - 2);
            ctx.save();
            if (isActive) {
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = 1.0;
                ctx.shadowBlur = ACTIVE_GLOW_BLUR;
                ctx.shadowColor = n.color || '#888';
            } else {
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = 0.6;
                ctx.shadowBlur = 0;
            }
            ctx.fillStyle = n.color || '#888';
            ctx.fill();
            ctx.restore();
        }

        // ── 음이름 + 운지 (노트 위에 표시) ──
        ctx.save();
        if (!isActive) ctx.globalAlpha = 0.6;
        const noteOutlineW = Math.max(2, Math.floor(width * 0.12));
        ctx.lineJoin = 'round';
        const noteName = getNoteName(n.note);
        const centerX = x + width / 2;
        const isSharp = noteName.includes('#');
        const baseChar = noteName.replace('#', '');
        const baseFontSize = Math.floor(width * 1.14);

        function drawNC(txt, tx, ty) {
            ctx.globalCompositeOperation = 'source-over';
            ctx.lineWidth = noteOutlineW;
            ctx.strokeStyle = '#000';
            ctx.fillStyle = '#fff';
            ctx.strokeText(txt, tx, ty);
            ctx.fillText(txt, tx, ty);
        }

        // 음이름 Y 위치 계산 (샵뱃지 Y에도 사용)
        let _noteNameMidY;
        if (n.finger) {
            if (height < 35) {
                _noteNameMidY = y - height / 2;
                ctx.font = baseFontSize + 'px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                drawNC(baseChar, centerX, _noteNameMidY);
                ctx.fillStyle = '#fff';
                drawFingerSmart(ctx, n.finger, centerX, y - height - 8, true, width);
            } else {
                let contentBottomY = (y - 2) + (baseFontSize * 0.2);
                _noteNameMidY = contentBottomY - baseFontSize * 0.5;
                ctx.font = baseFontSize + 'px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                drawNC(baseChar, centerX, contentBottomY);
                contentBottomY -= (baseFontSize * 0.9);
                contentBottomY -= 8;
                drawFingerSmart(ctx, n.finger, centerX, contentBottomY, false, width);
            }
        } else {
            if (height < 35) {
                _noteNameMidY = y - height / 2;
                ctx.font = baseFontSize + 'px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                drawNC(baseChar, centerX, _noteNameMidY);
            } else {
                let contentBottomY = (y - 2) + (baseFontSize * 0.2);
                _noteNameMidY = contentBottomY - baseFontSize * 0.5;
                ctx.font = baseFontSize + 'px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                drawNC(baseChar, centerX, contentBottomY);
            }
        }
        ctx.restore();

        // ── 샵 뱃지: source-over만 사용 ──
        if (isSharp) {
            const _r = Math.max(6, baseFontSize * 0.38);
            const _bx = x + width + _r * 0.5;
            const _by = _noteNameMidY;
            ctx.save();
            ctx.globalCompositeOperation = 'source-over';
            if (!isActive) ctx.globalAlpha = 0.6;
            ctx.beginPath();
            ctx.arc(_bx, _by, _r, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
            const _sf = Math.max(7, Math.floor(_r * 1.2));
            ctx.font = _sf + 'px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#000';
            ctx.fillText('#', _bx, _by);
            ctx.restore();
        }
    });
}
function drawKeyboard(keyVisuals) {
    // Canvas 상태 리셋 (drawNotes에서 설정된 globalAlpha 등이 영향을 주지 않도록)
    ctx.save();
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';
    
    const y = logicalHeight - keyHeight;
    const keyW = logicalWidth / totalWhiteKeys;
    
    // 건반과 위 공간을 구분하는 경계선 (2px + 5px) - 메인 캔버스에 직접 그리기
    const borderY = y - 3; // 건반 위 3px 위치 (기존 7px의 약 절반)
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, borderY, logicalWidth, 2); // 첫 번째 선: 2px
    ctx.fillRect(0, borderY + 2, logicalWidth, 5); // 두 번째 선: 5px (첫 번째 선 위에)
    
    ctx.drawImage(staticKeyCanvas, 0, 0, logicalWidth * dpr, keyHeight * dpr, 0, y, logicalWidth, keyHeight);
    
    // 1단계: 노트가 있는 흰 건반 색칠 (하위 레이어)
    let whiteIndex = 0;
    for(let i = startNote; i < endNote; i++) {
        if(isWhiteKey(i)) {
            const visual = keyVisuals[i];
            if(visual) {
                const x = whiteIndex * keyW;
                ctx.save();
                ctx.fillStyle = visual.color || '#00d2ff';
                if (visual.status === 1) ctx.globalAlpha = 0.4; 
                else ctx.globalAlpha = 1.0; 
                ctx.fillRect(x, y, keyW - 1, keyHeight);
                ctx.restore();

                // C 건반 빨간 바 재렌더링 (색칠로 덮인 경우)
                if (i % 12 === 0) {
                    const barH = Math.max(3, keyHeight * 0.08);
                    const barW = (keyW - 1) * 0.8;
                    const barX = x + (keyW - 1) * 0.1;
                    const barY = y + keyHeight - barH - 2;
                    ctx.fillStyle = '#E53935';
                    ctx.beginPath();
                    if (ctx.roundRect) {
                        ctx.roundRect(barX, barY, barW, barH, 2);
                    } else {
                        ctx.rect(barX, barY, barW, barH);
                    }
                    ctx.fill();
                }

                const whiteFontSize = Math.max(10, Math.min(Math.floor(keyW * 0.8), Math.floor(keyHeight * 0.5)));
                ctx.fillStyle = '#000';
                ctx.font = whiteFontSize + 'px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(getNoteName(i), x + keyW/2, y + keyHeight - (whiteFontSize * 0.7));
            }
            whiteIndex++;
        }
    }
    
    // 2단계: 노트가 없는 검은 건반 다시 그리기 (기본 검정색으로 덮어씀, 상위 레이어)
    whiteIndex = 0;
    for(let i = startNote; i < endNote; i++) {
        if(isWhiteKey(i)) {
            whiteIndex++;
        } else {
            const visual = keyVisuals[i];
            const w = keyW * BLACK_KEY_WIDTH_RATIO;
            const x = (whiteIndex * keyW) - (w / 2);
            const h = keyHeight * BLACK_KEY_HEIGHT_RATIO;
            
            // 검은 건반에 직접 노트가 없으면 기본 검정색으로 다시 그리기
            // (visual.source === 'note'면 이 키비주얼을 만든 노트가 이미 존재한다는 뜻이라 notes.some() 재검사는 불필요했음 — 매 프레임 36개 건반 × 전체 노트배열 스캔 비용 제거)
            const hasDirectNote = visual && visual.source === 'note';
            if (!hasDirectNote) {
                ctx.save();
                ctx.fillStyle = '#000';
                ctx.globalAlpha = 1.0;
                ctx.fillRect(x, y, w, h);
                ctx.restore();
                
                // 검은 건반 텍스트 다시 그리기
                const blackFontSize = Math.max(9, Math.min(Math.floor(w * 0.6), Math.floor(h * 0.5)));
                ctx.fillStyle = '#fff';
                ctx.font = blackFontSize + 'px Arial'; 
                ctx.save(); 
                ctx.textBaseline = 'bottom';
                drawSmartText(ctx, getNoteName(i), x + w/2, y + h - (blackFontSize * 0.2)); 
                ctx.restore();
            }
        }
    }
    
    // 3단계: 노트가 있는 검은 건반 색칠 (상위 레이어)
    whiteIndex = 0;
    for(let i = startNote; i < endNote; i++) {
        if(isWhiteKey(i)) {
            whiteIndex++;
        } else {
            const visual = keyVisuals[i];
            const w = keyW * BLACK_KEY_WIDTH_RATIO;
            const x = (whiteIndex * keyW) - (w / 2);
            const h = keyHeight * BLACK_KEY_HEIGHT_RATIO;
            
            // 검은 건반에 직접 노트가 있을 때만 색상 적용
            const hasDirectNote = visual && visual.source === 'note';
            if (hasDirectNote) {
                ctx.save();
                ctx.fillStyle = visual.color;
                if (visual.status === 1) ctx.globalAlpha = 0.5; 
                else ctx.globalAlpha = 1.0; 
                ctx.fillRect(x, y, w, h);
                ctx.restore();
                
                const blackFontSize = Math.max(9, Math.min(Math.floor(w * 0.6), Math.floor(h * 0.5)));
                ctx.fillStyle = (visual.color === COLORS.YELLOW || visual.color === COLORS.GREEN) ? '#000' : '#fff';
                ctx.font = blackFontSize + 'px Arial'; 
                ctx.save(); 
                ctx.textBaseline = 'bottom';
                drawSmartText(ctx, getNoteName(i), x + w/2, y + h - (blackFontSize * 0.2)); 
                ctx.restore();
            }
        }
    }
    
    
    // Canvas 상태 복원 (drawNotes에서 설정된 globalAlpha 등이 영향을 주지 않도록)
    ctx.restore();
}
function alignViewToMode() {
    const containerWidth = gameWrapper.clientWidth;
    const finalKeyW = logicalWidth / totalWhiteKeys;
    const showRight = chkRight ? chkRight.checked : true;
    const showLeft = chkLeft ? chkLeft.checked : true;

    let targetMidi = 60;

    if (notes.length > 0) {
        // 첫 번째 시간대의 노트들 수집 (첫 코드)
        const firstTime = notes.filter(n =>
            (n.hand === 'right' && showRight) || (n.hand === 'left' && showLeft)
        ).reduce((min, n) => Math.min(min, n.startTime), Infinity);

        const firstChordNotes = notes.filter(n =>
            Math.abs(n.startTime - firstTime) < 0.05
        );

        const firstRightNotes = firstChordNotes.filter(n => n.hand === 'right' && showRight).map(n => n.note);
        const firstLeftNotes = firstChordNotes.filter(n => n.hand === 'left' && showLeft).map(n => n.note);

        if (showRight && showLeft && firstRightNotes.length > 0 && firstLeftNotes.length > 0) {
            // 양손: 왼손 최고음과 오른손 최저음의 중간음 → 중앙분리선 위치로
            const leftHighest = Math.max(...firstLeftNotes);
            const rightLowest = Math.min(...firstRightNotes);
            const midMidi = Math.round((leftHighest + rightLowest) / 2);
            // 중앙분리선 X 위치를 화면 중앙에 맞춤
            let midWhiteIdx = 0;
            for (let i = startNote; i < midMidi; i++) { if (isWhiteKey(i)) midWhiteIdx++; }
            const midX = isWhiteKey(midMidi)
                ? midWhiteIdx * finalKeyW + finalKeyW / 2
                : midWhiteIdx * finalKeyW;
            const maxScroll = Math.max(0, logicalWidth - containerWidth);
            let targetScroll = midX - containerWidth / 2;
            gameWrapper.scrollLeft = Math.max(0, Math.min(targetScroll, maxScroll));

        } else if (showRight && firstRightNotes.length > 0) {
            // 오른손만: 첫 코드 중간음이 화면 중앙
            const minR = Math.min(...firstRightNotes);
            const maxR = Math.max(...firstRightNotes);
            targetMidi = Math.round((minR + maxR) / 2);
            let whiteIdx = 0;
            for (let i = startNote; i < targetMidi; i++) { if (isWhiteKey(i)) whiteIdx++; }
            const targetX = whiteIdx * finalKeyW + finalKeyW / 2;
            const maxScroll = Math.max(0, logicalWidth - containerWidth);
            gameWrapper.scrollLeft = Math.max(0, Math.min(targetX - containerWidth / 2, maxScroll));

        } else if (showLeft && firstLeftNotes.length > 0) {
            // 왼손만: 첫 코드 중간음이 화면 중앙
            const minL = Math.min(...firstLeftNotes);
            const maxL = Math.max(...firstLeftNotes);
            targetMidi = Math.round((minL + maxL) / 2);
            let whiteIdx = 0;
            for (let i = startNote; i < targetMidi; i++) { if (isWhiteKey(i)) whiteIdx++; }
            const targetX = whiteIdx * finalKeyW + finalKeyW / 2;
            const maxScroll = Math.max(0, logicalWidth - containerWidth);
            gameWrapper.scrollLeft = Math.max(0, Math.min(targetX - containerWidth / 2, maxScroll));
        }
    }
    gameContainer.style.marginLeft = '0px';
}
function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const wrapperRect = gameWrapper.getBoundingClientRect();
    if (wrapperRect.width === 0) return;
    
    // 실제 모바일/태블릿에서 높이가 0이면 최소 높이 사용
    let actualWrapperHeight = wrapperRect.height;
    if (actualWrapperHeight === 0 || actualWrapperHeight < 100) {
        // 최소 높이를 화면 높이의 50%로 설정
        const minHeight = Math.max(300, window.innerHeight * 0.5);
        if (actualWrapperHeight === 0) {
            // wrapper 높이가 0이면 강제로 최소 높이 설정
            gameWrapper.style.minHeight = minHeight + 'px';
            // 강제 리플로우를 통해 즉시 높이 재계산
            void gameWrapper.offsetHeight; // 리플로우 강제 실행
            const newRect = gameWrapper.getBoundingClientRect();
            if (newRect.height > 0) {
                actualWrapperHeight = newRect.height;
            } else {
                actualWrapperHeight = minHeight;
            }
        }
        // 최소 높이 보장
        if (actualWrapperHeight < 100) {
            actualWrapperHeight = Math.max(actualWrapperHeight, minHeight);
        }
    }
    
    // 100% 기준: 모든 흰색 건반이 좌우로 모두 보이는 상태
    // baseWidth/baseHeight는 항상 wrapper 크기에 맞춤 (화면 회전/리사이즈 대응)
    baseWidth = wrapperRect.width;
    baseHeight = Math.max(400, actualWrapperHeight);
    
    const containerWidth = baseWidth * (currentZoom / 100);
    const containerHeight = baseHeight * getVerticalZoomFactor(currentZoom);
    gameContainer.style.width = containerWidth + 'px';
    gameContainer.style.height = containerHeight + 'px';
    logicalWidth = containerWidth;
    logicalHeight = containerHeight;
    
    // 건반 높이 계산: PC/모바일 분리 적용
    baseKeyHeight = window.innerWidth > 768 ? WHITE_KEY_HEIGHT_PC : WHITE_KEY_HEIGHT_MOBILE;
    keyHeight = baseKeyHeight * getVerticalZoomFactor(currentZoom);
    if (!didDragLine && !isDraggingLine) {
        judgmentLineOffset = keyHeight * 1.2;
    }
    
    // logicalHeight가 0이면 강제로 최소값 설정
    if (logicalHeight <= 0) {
        logicalHeight = Math.max(300, window.innerHeight * 0.5);
        gameContainer.style.height = logicalHeight + 'px';
    }
    
    // canvas 크기 설정 (최소값 보장)
    const minCanvasWidth = 100;
    const minCanvasHeight = 100;
    canvas.width = Math.max(minCanvasWidth, logicalWidth * dpr);
    canvas.height = Math.max(minCanvasHeight, logicalHeight * dpr);
    
    ctx.resetTransform();
    ctx.scale(dpr, dpr);
    zoomLevelDisplay.innerText = currentZoom + '%';
    prerenderKeyboard();
    if (window.JPRenderer) JPRenderer.resize(logicalWidth, logicalHeight);
    // 기준선 위에 플로팅 버튼 위치 업데이트
    updateFloatingZoomControlsPosition();
    // 손가락 가이드 위치 업데이트
    updateHandGuidePosition();
    // 좌우 분리선 위치 및 높이 업데이트 (안전하게 호출)
    if (logicalWidth > 0 && totalWhiteKeys > 0) {
        try {
            updateCenterGuidePosition();
        } catch (e) {
            console.error('분리선 위치 업데이트 중 에러:', e);
        }
    }
    if (isPaused && notes.length > 0) {
        renderFrameAt(pauseCurrentTime || 0);
    } else if (!isPlaying) {
        alignViewToMode();
        drawJudgmentLine(); 
        drawKeyboard([]);
        // 기준선 위에 플로팅 버튼 위치 업데이트
        updateFloatingZoomControlsPosition();
    }
    // 건반 하단이 항상 화면에 보이도록 스크롤 제한
    constrainScrollToKeepKeyboardVisible();
    
    // 하단 고정: position: absolute + bottom으로 하단 정렬
    gameContainer.style.bottom = '5px';
    gameContainer.style.top = 'auto';
}

const resizeObserver = new ResizeObserver(entries => {
    window.requestAnimationFrame(() => {
        if (!Array.isArray(entries) || !entries.length) return;
        if(modal.style.display !== 'none') resize();
    });
});
resizeObserver.observe(gameWrapper);

let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (customDesktopGameWidth > 0 && window.innerWidth > 768) {
            applyDesktopGameWidth(customDesktopGameWidth, false);
            return;
        }
        resize();
    }, 250);
});
window.addEventListener('orientationchange', () => {
    setTimeout(() => { resize(); }, 200);
});

if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = document.getElementById('jellypiano-game') || document.documentElement;
        if (!document.fullscreenElement) {
            if (target.requestFullscreen) target.requestFullscreen();
        } else if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    });
    document.addEventListener('fullscreenchange', () => {
        setTimeout(() => { resize(); }, 100);
    });
}

if (metronomeBtn) {
    metronomeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (metronomeEnabled) stopMetronome();
        else startMetronome();
    });
    updateMetronomeUi();
}

// ── 백그라운드 자동 일시정지 ──────────────────────────────
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (isPlaying && !isPaused) {
            pauseGame();
            window._pausedByVisibility = true;
        }
    } else {
        window._pausedByVisibility = false;
    }
});

// ── 화면 자동 회전 잠금 해제 ──────────────────────────────
(function() {
    const orientation = screen.orientation || screen.mozOrientation || screen.msOrientation;
    if (orientation && orientation.unlock) {
        try { orientation.unlock(); } catch(e) {}
    }
})();

// 건반 하단이 항상 화면에 보이도록 스크롤 제한
function constrainScrollToKeepKeyboardVisible() {
    if (!gameWrapper || !gameContainer) return;
    const wrapperH = gameWrapper.clientHeight;
    const keyboardBottom = logicalHeight;
    const minScrollTop = Math.max(0, keyboardBottom - wrapperH);
    
    // 건반 하단이 화면 하단에 고정되도록 스크롤 제한
    if (gameWrapper.scrollTop < minScrollTop) {
        gameWrapper.scrollTop = minScrollTop;
    }
}

// 스크롤 이벤트 리스너 (즉시 제한 적용)
gameWrapper.addEventListener('scroll', () => {
    constrainScrollToKeepKeyboardVisible();
});

const DESKTOP_GAME_ASPECT = 14 / 16;
let customDesktopGameWidth = 0;

function getSidebarWidth() {
    const root = document.getElementById('jellypiano-game');
    const value = root ? getComputedStyle(root).getPropertyValue('--sidebar-width') : '';
    return parseFloat(value) || 0;
}

function getDesktopGameWidthBounds() {
    const sidebarWidth = getSidebarWidth();
    const availableW = Math.max(320, window.innerWidth - sidebarWidth);
    const maxByHeight = Math.max(320, window.innerHeight * DESKTOP_GAME_ASPECT);
    const max = Math.max(360, Math.min(availableW, maxByHeight));
    const min = Math.min(max, Math.max(360, availableW * 0.45));
    return { min, max };
}

function applyDesktopGameWidth(width, persist) {
    if (window.innerWidth <= 768 || !gameWrapper) return;
    const bounds = getDesktopGameWidthBounds();
    const nextWidth = Math.max(bounds.min, Math.min(bounds.max, width));
    const nextHeight = nextWidth / DESKTOP_GAME_ASPECT;
    customDesktopGameWidth = nextWidth;

    gameWrapper.style.width = nextWidth + 'px';
    gameWrapper.style.height = nextHeight + 'px';
    gameWrapper.style.maxWidth = 'none';
    gameWrapper.style.maxHeight = 'none';
    gameWrapper.style.bottom = 'auto';

    const bottomPanel = document.getElementById('bottom-panel');
    if (bottomPanel) {
        bottomPanel.style.width = nextWidth + 'px';
    }

    if (persist) {
        try { localStorage.setItem('jellypianoDesktopGameWidth', String(Math.round(nextWidth))); } catch (e) {}
    }
    resize();
}

function restoreDesktopGameWidth() {
    if (window.innerWidth <= 768) return;
    let savedWidth = 0;
    try { savedWidth = parseFloat(localStorage.getItem('jellypianoDesktopGameWidth') || '0'); } catch (e) {}
    if (savedWidth > 0) {
        applyDesktopGameWidth(savedWidth, false);
    }
}

function initDesktopGameResizer() {
    if (!gameWrapper || gameWrapper.querySelector('.desktop-game-resize-handle')) return;

    const style = document.createElement('style');
    style.textContent = `
        #jellypiano-game .desktop-game-resize-handle {
            display: none;
            position: absolute;
            z-index: 80;
            pointer-events: auto;
        }
        @media (min-width: 769px) {
            #jellypiano-game .desktop-game-resize-handle {
                display: block;
            }
            #jellypiano-game .desktop-game-resize-handle.edge-right {
                top: 0;
                right: -7px;
                width: 14px;
                height: 100%;
                cursor: ew-resize;
            }
            #jellypiano-game .desktop-game-resize-handle.corner-right {
                right: -8px;
                bottom: -8px;
                width: 18px;
                height: 18px;
                border-right: 2px solid rgba(255,255,255,0.7);
                border-bottom: 2px solid rgba(255,255,255,0.7);
                cursor: nwse-resize;
            }
        }
    `;
    document.head.appendChild(style);

    const edge = document.createElement('div');
    edge.className = 'desktop-game-resize-handle edge-right';
    const corner = document.createElement('div');
    corner.className = 'desktop-game-resize-handle corner-right';
    gameWrapper.appendChild(edge);
    gameWrapper.appendChild(corner);

    function startDrag(e) {
        if (window.innerWidth <= 768) return;
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startW = gameWrapper.getBoundingClientRect().width;
        const pointerId = e.pointerId;
        e.currentTarget.setPointerCapture(pointerId);

        function move(ev) {
            const nextW = startW + ((ev.clientX - startX) * 2);
            applyDesktopGameWidth(nextW, false);
        }

        function end(ev) {
            e.currentTarget.releasePointerCapture(pointerId);
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', end);
            if (customDesktopGameWidth > 0) applyDesktopGameWidth(customDesktopGameWidth, true);
        }

        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', end, { once: true });
    }

    edge.addEventListener('pointerdown', startDrag);
    corner.addEventListener('pointerdown', startDrag);
    restoreDesktopGameWidth();
}


function setZoom(newZoom) {
    const wrapperW = gameWrapper.clientWidth;
    let wrapperH = gameWrapper.clientHeight;
    const currentMarginLeft = parseFloat(gameContainer.style.marginLeft) || 0;
    const centerContentX = gameWrapper.scrollLeft + (wrapperW / 2) - currentMarginLeft;
    const centerRatio = centerContentX / logicalWidth;
    if (newZoom < 100) newZoom = 100; 
    if (newZoom > 300) newZoom = 300;
    // 짝수로 반올림 (20% 단위로 증감)
    currentZoom = Math.round(newZoom / 2) * 2;
    
    // 실제 모바일/태블릿에서 높이가 0이면 최소 높이 사용
    if (wrapperH === 0 || wrapperH < 100) {
        const minHeight = Math.max(300, window.innerHeight * 0.5);
        if (wrapperH === 0) {
            gameWrapper.style.minHeight = minHeight + 'px';
            // 강제 리플로우를 통해 즉시 높이 재계산
            void gameWrapper.offsetHeight; // 리플로우 강제 실행
            wrapperH = gameWrapper.clientHeight || minHeight;
        }
        if (wrapperH < 100) {
            wrapperH = Math.max(wrapperH, minHeight);
        }
    }
    
    // baseWidth/baseHeight는 항상 wrapper 크기에 맞춤 (화면 회전/리사이즈 대응)
    baseWidth = wrapperW;
    baseHeight = Math.max(400, wrapperH);
    
    const newTotalWidth = baseWidth * (currentZoom / 100);
    const newTotalHeight = baseHeight * getVerticalZoomFactor(currentZoom);
    gameContainer.style.width = newTotalWidth + 'px';
    gameContainer.style.height = newTotalHeight + 'px';
    zoomLevelDisplay.innerText = currentZoom + '%';
    logicalWidth = newTotalWidth;
    logicalHeight = newTotalHeight;
    
    // logicalHeight가 0이면 강제로 최소값 설정
    if (logicalHeight <= 0) {
        logicalHeight = Math.max(300, window.innerHeight * 0.5);
        gameContainer.style.height = logicalHeight + 'px';
    }
    
    // keyHeight 계산: PC/모바일 분리 적용
    baseKeyHeight = window.innerWidth > 768 ? WHITE_KEY_HEIGHT_PC : WHITE_KEY_HEIGHT_MOBILE;
    keyHeight = baseKeyHeight * getVerticalZoomFactor(currentZoom);

    // canvas 크기 설정 (최소값 보장)
    const minCanvasWidth = 100;
    const minCanvasHeight = 100;
    canvas.width = Math.max(minCanvasWidth, logicalWidth * dpr);
    canvas.height = Math.max(minCanvasHeight, logicalHeight * dpr);
    
    ctx.resetTransform();
    ctx.scale(dpr, dpr);
    // 기준선 위에 플로팅 버튼 위치 업데이트
    updateFloatingZoomControlsPosition();
    // 손가락 가이드 위치 업데이트
    updateHandGuidePosition();
    const newCenterContentX = centerRatio * newTotalWidth;
    const newScroll = newCenterContentX - (wrapperW / 2);
    const maxScroll = Math.max(0, logicalWidth - wrapperW);
    if (logicalWidth < wrapperW) {
        gameWrapper.scrollLeft = 0;
        const margin = (wrapperW - logicalWidth) / 2;
        gameContainer.style.marginLeft = margin + 'px';
    } else {
        gameContainer.style.marginLeft = '0px';
        gameWrapper.scrollLeft = Math.max(0, Math.min(newScroll, maxScroll));
    }
    
    // 하단 고정: position: absolute + bottom으로 하단 정렬
    gameContainer.style.bottom = '5px';
    gameContainer.style.top = 'auto';

    prerenderKeyboard();
    if (window.JPRenderer) JPRenderer.resize(logicalWidth, logicalHeight);
    // 좌우 분리선 위치 및 높이 업데이트 (안전하게 호출)
    if (logicalWidth > 0 && totalWhiteKeys > 0) {
        try {
            updateCenterGuidePosition();
        } catch (e) {
            console.error('분리선 위치 업데이트 중 에러:', e);
        }
    }
    if (!isPlaying) {
        drawJudgmentLine(); 
        drawKeyboard([]);
    } else if (isPaused) {
        if (notes.length > 0) {
            drawJudgmentLine(); 
            drawKeyboard([]); 
        }
    }
}
function updateZoomBasedOnHands() {
    if (notes.length === 0) return;
    
    const showRight = chkRight ? chkRight.checked : true;
    const showLeft = chkLeft ? chkLeft.checked : true;
    
    const hasLeftHand = showLeft && notes.some(n => n.hand === 'left');
    const hasRightHand = showRight && notes.some(n => n.hand === 'right');
    const isTwoHands = hasLeftHand && hasRightHand;
    
    // 양손 모드: 180%, 한손 모드: 230%
    const defaultZoom = isTwoHands ? 180 : 230;
    setZoom(defaultZoom);
}

// 핀치 줌 기능 제거됨
// 게임 모달 내부에서 마우스 스크롤 차단, 브라우저 기본 줌만 허용
const gameInnerContainer = document.getElementById('game-inner-container');
gameInnerContainer.addEventListener('wheel', (e) => {
    const target = e.target;
    
    // 예외 처리: 입력 요소나 버튼에서는 기본 동작 허용
    if (target.tagName === 'INPUT' || 
        target.tagName === 'SELECT' || 
        target.tagName === 'BUTTON' ||
        target.closest('button') ||
        target.closest('select') ||
        target.closest('input')) {
        return; // 기본 동작 허용
    }
    
    // Ctrl + 휠: 브라우저 기본 줌 허용 (아무것도 하지 않음)
    if (e.ctrlKey) {
        return; // 브라우저 기본 줌 동작 허용
    }
    
    // Ctrl 없이 휠: 스크롤 차단
    e.preventDefault();
}, { passive: false });
let zoomTimer = null;
function startZoom(delta) {
    if (zoomTimer) return;
    setZoom(currentZoom + delta);
    zoomTimer = setInterval(() => { setZoom(currentZoom + delta); }, 100);
}
function stopZoom() {
    if (zoomTimer) { clearInterval(zoomTimer); zoomTimer = null; }
}
function attachLongPress(elementId, delta) {
    const btn = document.getElementById(elementId);
    if (!btn) return;
    const handleStart = (e) => {
        // 이벤트 전파를 확실히 막아서 부모 요소의 드래그 이벤트 방지
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (e.cancelable) e.preventDefault(); 
        startZoom(delta);
    };
    const handleStop = (e) => { 
        if (e) {
            e.stopPropagation();
            e.stopImmediatePropagation();
        }
        stopZoom(); 
    };
    btn.addEventListener('mousedown', handleStart);
    btn.addEventListener('mouseup', handleStop);
    btn.addEventListener('mouseleave', handleStop);
    btn.addEventListener('touchstart', handleStart, { passive: false });
    btn.addEventListener('touchend', handleStop);
    btn.addEventListener('touchcancel', handleStop);
}
attachLongPress('float-zoom-in', 10);
attachLongPress('float-zoom-out', -10);

zoomLevelDisplay.addEventListener('click', () => { updateZoomBasedOnHands(); });
zoomLevelDisplay.addEventListener('click', (e) => { e.stopPropagation(); updateZoomBasedOnHands(); });
// updateSpeed 함수는 window 객체에 할당하여 다른 모듈에서 접근 가능하도록 함
function updateSpeed(delta) {
    let newSpeed = Math.round((speed + delta) * 10) / 10;
    if (newSpeed < 0.1) newSpeed = 0.1;
    if (newSpeed > 1.5) newSpeed = 1.5;
    const songTimeBeforeChange = getCurrentTime();
    speed = newSpeed;
    if (isPlaying || isPaused) {
        if (isPaused) pauseCurrentTime = songTimeBeforeChange;
        anchorClock(songTimeBeforeChange);
    }
    audioSync.speed = speed;
    speedText.innerText = speed.toFixed(1) + 'x';
    updateMetronomeUi();
}
window.updateSpeed = updateSpeed;

// 속도 조절 버튼과 체크박스 이벤트 리스너는 desktop-menu-buttons.js와 mobile-menu-buttons.js에서 처리됨
// alignViewToMode, updateZoomBasedOnHands, updateCenterGuidePosition은 window 객체에 할당
window.alignViewToMode = alignViewToMode;
window.updateZoomBasedOnHands = updateZoomBasedOnHands;
window.updateCenterGuidePosition = updateCenterGuidePosition;
// (playTone 제거됨 — MP3가 모든 오디오 재생을 담당)
function getCurrentTime() {
    if (!isPlaying) return pauseCurrentTime || 0;
    // 노트 미리보기(카운트다운) 중: (구간시작 - previewTime) → 구간시작 으로 진행
    if (window._previewActive) {
        const elapsed = (performance.now() - window._previewStartWall) / 1000;
        return (window._previewBase || 0) + (elapsed - window._previewTime);
    }
    // 단일 시계: 앵커 이후 경과 wall-clock × 배속
    return _baseSongTime + ((performance.now() - _startWall) / 1000) * speed;
}
function loop() {
    const currentTime = getCurrentTime();
    updateMetronomeFromSongTime(currentTime);
    // 노트 기준 종료 체크 (isPlaying 체크보다 먼저!)
    if (isPlaying && songDuration > 0 && currentTime > songDuration) { 
        handleSongEnd(); return; 
    }
    if(!isPlaying) return;
    
    if (songDuration > 0) {
        const percent = Math.min(100, Math.max(0, (currentTime / songDuration) * 100));
        progressFill.style.width = percent + '%';
        progressHandle.style.left = percent + '%';
    }
    
    ctx.clearRect(0, 0, logicalWidth, logicalHeight);
    // WebGL 노트 레이어: 이번 프레임 라우팅 여부 결정 후 초기화
    _routeWebGL = USE_WEBGL && window.JPRenderer && JPRenderer.ready;
    if (_routeWebGL) JPRenderer.clear();
    drawCenterGuide(); // 분리선을 가장 먼저 그려서 다른 요소 뒤에 표시
    const activeBeams = {};
    const keyVisuals = {};
    const viewHeight = logicalHeight - keyHeight;
    const judgmentY = viewHeight - judgmentLineOffset; // 기준선 위치
    // DOM 접근 최적화: 체크박스 상태를 한 번만 확인
    const showRight = chkRight ? chkRight.checked : true;
    const showLeft = chkLeft ? chkLeft.checked : true;
    notes.forEach(n => {
        if(n.hand === 'right' && !showRight) return;
        if(n.hand === 'left' && !showLeft) return;
        const timeDiff = n.startTime - currentTime;
        const yTop = viewHeight - (timeDiff * fallingSpeed) - (n.durationTime * fallingSpeed); 
        const yBottom = viewHeight - (timeDiff * fallingSpeed); 
        const isPlayingNote = (currentTime >= n.startTime && currentTime < n.startTime + n.durationTime);
        // 노트의 밑면이 기준선에 닿았는지 확인 (바가 연결될 때)
        const hasReachedJudgmentLine = (yBottom >= judgmentY && yBottom > 0 && yTop < viewHeight);
        if (isPlayingNote) {
            keyVisuals[n.note] = { status: 2, color: n.idleColor, source: 'note' };
        } else if (hasReachedJudgmentLine) {
            // 기준선에 닿아 바가 연결될 때부터 흐리게 표시
            if (!activeBeams[n.note]) {
                const beamInfo = { status: 1, color: n.idleColor, source: 'note' };
                activeBeams[n.note] = beamInfo;
                keyVisuals[n.note] = beamInfo;
            }
        }
        // 키 플래시: 노트가 건반에 처음 닿는 순간 발생
        if (!n._particleSpawned && currentTime >= n.startTime && currentTime < n.startTime + 0.1) {
            triggerKeyFlash(n.note, n.idleColor);
            n._particleSpawned = true;
        }
        // 재설정 시 파티클 플래그 초기화는 resetGameData에서 처리
    });
    for (let i = nextNoteIndex; i < notes.length; i++) {
        const n = notes[i];
        const isHandActive = (n.hand === 'right' && (chkRight ? chkRight.checked : true)) || (n.hand === 'left' && (chkLeft ? chkLeft.checked : true));
        if (currentTime > n.startTime + timingTolerance && !n.played && n.scoreStatus !== 'missed' && n.scoreStatus !== 'ignored') {
            if (isHandActive) { n.scoreStatus = 'missed'; score.missed++; }
            else { n.scoreStatus = 'ignored'; }
            nextNoteIndex++;
        } else if (currentTime > n.startTime + n.durationTime + 0.5) {
            nextNoteIndex = i + 1;
        }
    }
    drawFullHeightBeams(activeBeams, notes, currentTime);
    // 신디사이저 노트 재생 (한손 모드: MP3 음소거 + 선택된 손만 신디사이저로 재생)
    if (useSynth) {
        notes.forEach(n => {
            if (!n.synthTriggered && currentTime >= n.startTime && currentTime < n.startTime + n.durationTime + 0.05) {
                const isHandActive = (n.hand === 'right' && showRight) || (n.hand === 'left' && showLeft);
                if (isHandActive) {
                    pianoSynth.playNote(n.note, n.durationTime / speed);
                    n.synthTriggered = true;
                }
            }
        });
    }
    // 지나간 노트를 played로 표시 (시각 효과용)
    notes.forEach(n => {
        if (!n.played && currentTime >= n.startTime + n.durationTime) {
            n.played = true;
        }
    });
    drawNotes(currentTime); 
    currentPressedNotes.forEach(n => { keyVisuals[n.note] = { status: 2, color: n.color || '#00d2ff', source: 'input' }; });
    drawKeyboard(keyVisuals);
    drawKeyFlashes();
    drawJudgmentLine(); // 판정선은 항상 맨 위에
    let endTime = songDuration;
    if (currentSection !== null) {
        const sectionIdx = parseInt(document.getElementById('sel-section').value);
        const groupSize = 4;
        const startMeasureIdx = sectionIdx * groupSize;
        const endMeasureIdx = Math.min(startMeasureIdx + groupSize, measureTimes.length - 1);
        if (measureTimes[endMeasureIdx]) { endTime = measureTimes[endMeasureIdx] + 0.1; }
    }
    if (currentTime > endTime) { 
        console.log('🔴 handleSongEnd 호출! currentTime:', currentTime, 'endTime:', endTime);
        handleSongEnd(); return; 
    }
    // (MP3 제거: 외부 오디오 시계와의 드리프트 보정 불필요 — 단일 시계가 진실)

    // WebGL 노트 레이어 한 프레임 렌더 후 라우팅 플래그 해제
    if (_routeWebGL) { JPRenderer.flush(); _routeWebGL = false; }

    animationId = requestAnimationFrame(loop);
    window.animationId = animationId;
}
// 정적 프레임 렌더 (일시정지/시크/대기) — loop()과 동일 구성 + WebGL 라우팅 포함.
// 이게 없으면 일시정지 때 WebGL 노트가 지워진 채 다시 안 그려져 노트가 사라짐.
function renderFrameAt(currentTime) {
    ctx.clearRect(0, 0, logicalWidth, logicalHeight);
    _routeWebGL = USE_WEBGL && window.JPRenderer && JPRenderer.ready;
    if (_routeWebGL) JPRenderer.clear();
    drawCenterGuide();
    const activeBeams = {};
    const keyVisuals = {};
    const viewHeight = logicalHeight - keyHeight;
    const judgmentY = viewHeight - judgmentLineOffset;
    const showRight = chkRight ? chkRight.checked : true;
    const showLeft = chkLeft ? chkLeft.checked : true;
    notes.forEach(n => {
        if (n.hand === 'right' && !showRight) return;
        if (n.hand === 'left' && !showLeft) return;
        const timeDiff = n.startTime - currentTime;
        const yTop = viewHeight - (timeDiff * fallingSpeed) - (n.durationTime * fallingSpeed);
        const yBottom = viewHeight - (timeDiff * fallingSpeed);
        const isPlayingNote = (currentTime >= n.startTime && currentTime < n.startTime + n.durationTime);
        const hasReachedJudgmentLine = (yBottom >= judgmentY && yBottom > 0 && yTop < viewHeight);
        if (isPlayingNote) {
            keyVisuals[n.note] = { status: 2, color: n.idleColor, source: 'note' };
        } else if (hasReachedJudgmentLine) {
            if (!activeBeams[n.note]) {
                const beamInfo = { status: 1, color: n.idleColor, source: 'note' };
                activeBeams[n.note] = beamInfo;
                keyVisuals[n.note] = beamInfo;
            }
        }
    });
    drawFullHeightBeams(activeBeams, notes, currentTime);
    drawNotes(currentTime);
    currentPressedNotes.forEach(n => { keyVisuals[n.note] = { status: 2, color: n.color || '#00d2ff', source: 'input' }; });
    drawKeyboard(keyVisuals);
    drawJudgmentLine();
    if (_routeWebGL) { JPRenderer.flush(); _routeWebGL = false; }
}
// 기준선 드래그를 위한 공통 함수
function checkLineHit(clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleY = logicalHeight / rect.height;
    const y = (clientY - rect.top) * scaleY;
    const lineY = (logicalHeight - keyHeight) - judgmentLineOffset;
    return Math.abs(y - lineY) <= 15;
}

function startLineDrag(clientY) {
    isDraggingLine = true;
    didDragLine = false;
    canvas.style.cursor = 'ns-resize';
}

function updateLineDrag(clientY) {
    if (!isDraggingLine) return;
    didDragLine = true;
    const rect = canvas.getBoundingClientRect();
    const scaleY = logicalHeight / rect.height;
    const y = (clientY - rect.top) * scaleY;
    
    let newOffset = (logicalHeight - keyHeight) - y;
    newOffset = Math.max(0, Math.min(newOffset, logicalHeight - keyHeight));
    
    judgmentLineOffset = newOffset;
    
    // 기준선 위에 플로팅 버튼 위치 업데이트
    updateFloatingZoomControlsPosition();
    
    if (!isPlaying || isPaused) {
        resize(); 
    }
}

function endLineDrag() {
    if (isDraggingLine) {
        isDraggingLine = false;
        canvas.style.cursor = 'default';
        setTimeout(() => { didDragLine = false; }, 50);
    }
}

// 마우스 이벤트 (데스크탑)
canvas.addEventListener('mousedown', (e) => {
    if (modal.style.display === 'none') return;
    if (checkLineHit(e.clientY)) {
        startLineDrag(e.clientY);
        e.preventDefault(); 
        e.stopPropagation();
    }
});

document.addEventListener('mousemove', (e) => {
    if (isDraggingLine) {
        updateLineDrag(e.clientY);
    } else {
        if (e.target === canvas && modal.style.display !== 'none') {
            const rect = canvas.getBoundingClientRect();
            const scaleY = logicalHeight / rect.height;
            const mouseY = (e.clientY - rect.top) * scaleY;
            const lineY = (logicalHeight - keyHeight) - judgmentLineOffset;
            
            if (Math.abs(mouseY - lineY) <= 15) {
                canvas.style.cursor = 'ns-resize';
            } else {
                canvas.style.cursor = 'default';
            }
        }
    }
});

document.addEventListener('mouseup', () => {
    endLineDrag();
});

// 터치 이벤트 (모바일/태블릿)
canvas.addEventListener('touchstart', (e) => {
    if (modal.style.display === 'none') return;
    // 재설정 버튼 터치 시 무시
    if (window.isResetButtonPressed || 
        e.target.closest('#btn-stop') || 
        e.target.id === 'btn-stop') {
        return;
    }
    if (e.touches.length === 1) { // 한 손가락 터치만 처리
        const touch = e.touches[0];
        if (checkLineHit(touch.clientY)) {
            startLineDrag(touch.clientY);
            e.preventDefault(); 
            e.stopPropagation();
        }
    }
}, { passive: false });

document.addEventListener('touchmove', (e) => {
    if (isDraggingLine && e.touches.length === 1) {
        const touch = e.touches[0];
        updateLineDrag(touch.clientY);
        e.preventDefault(); 
        e.stopPropagation();
    }
}, { passive: false });

document.addEventListener('touchend', (e) => {
    // 재설정 버튼 터치 시 무시
    if (window.isResetButtonPressed || 
        e.target.closest('#btn-stop') || 
        e.target.id === 'btn-stop') {
        return;
    }
    if (isDraggingLine) {
        endLineDrag();
        e.preventDefault();
        e.stopPropagation();
    }
}, { passive: false });
let songEndHandled = false;
function handleSongEnd() {
    if (songEndHandled) return;
    songEndHandled = true;
    setTimeout(() => { songEndHandled = false; }, 1500);
    const repeatSetting = loopCount; // sel-repeat 값과 동기화된 loopCount 사용
    if (currentLoop < repeatSetting - 1) { currentLoop++; resetPlaybackToSectionStart(); resumeAfterReset(); loop(); }
    else { stopGame(true); statusMsg.innerText = "연습 완료!"; statusMsg.style.display = 'block'; }
}
function resetPlaybackToSectionStart() {
    const sectionIdx = parseInt(document.getElementById('sel-section').value);
    let loopStartTime = 0;
    if (sectionIdx !== -1) {
        const startMeasureIdx = sectionIdx * 4;
        if (startMeasureIdx < measureTimes.length) { loopStartTime = measureTimes[startMeasureIdx]; }
    }
    // 시작 위치 설정 (단일 시계 기준)
    pauseCurrentTime = loopStartTime;
    pianoSynth.stopAll();
    notes.forEach(n => { if (n.startTime < loopStartTime) { n.played = true; n.synthTriggered = true; } else { n.played = false; n.synthTriggered = false; n.scoreStatus = 'pending'; if (n.idleColor) n.color = n.idleColor; } });
}
function resumeAfterReset() {
    // 반복 재생 시 호출 - 단일 시계를 구간 시작점으로 재앵커
    anchorClock(pauseCurrentTime);
    pianoSynth.resume();
    restartMetronomeIfEnabled();
}
function updateSectionDropdown() {
    sectionSelect.innerHTML = '<option value="-1">전곡</option>';
    if (measureTimes.length > 0) { 
        const groupSize = 4; 
        const totalMeasures = measureTimes.length - 1;
        const actualLines = Math.ceil(totalMeasures / groupSize);
        const displayLines = Math.max(actualLines, 6);
        for(let i=0; i < displayLines; i++) {
            const opt = document.createElement('option');
            opt.value = i; 
            if (i < actualLines) { opt.text = `${i+1}째줄`; } 
            else { opt.text = `${i+1}째줄 (없음)`; opt.disabled = true; }
            sectionSelect.appendChild(opt);
        }
    }
}
async function playGame() {
    if (notes.length === 0) { return; }
    controlsDiv.classList.add('hidden-controls');
    hideHandGuides();
    handGuideShown = true; // 재생 후에는 다시 표시하지 않음
    const sectionIdx = parseInt(document.getElementById('sel-section').value);
    currentSection = (sectionIdx === -1) ? null : sectionIdx;

    // 사용자 제스처 시점에 오디오 컨텍스트 활성화 (브라우저 자동재생 정책)
    pianoSynth.init();
    pianoSynth.resume();

    // 한손/양손 모드에 따라 오디오 모드 전환 (항상 샘플 피아노)
    updateHandAudioMode();

    if (isPaused) {
        isPaused = false;
        isPlaying = true;

        // 일시정지 지점부터 단일 시계 재앵커
        anchorClock(pauseCurrentTime);

        (window.playBtn || playBtn).innerText = "\u23F8 일시정지";
        statusMsg.style.display = 'none';
        restartMetronomeIfEnabled();
        loop();
    } else {
        if (isPlaying) return;
        resetPlaybackToSectionStart();
        isPlaying = true;
        isPaused = false;

        const loopStartTime = pauseCurrentTime; // 구간 시작 시간 (전곡이면 0)
        const previewTime = 3.0; // 노트 미리보기 시간(초)
        const previewStartWall = performance.now();

        // getCurrentTime이 음수를 반환하도록 - 노트 미리보기 구현
        window._previewStartWall = previewStartWall;
        window._previewTime = previewTime;
        window._previewBase = loopStartTime;
        window._previewActive = true;

        // 카운트다운 표시
        let countdown = Math.ceil(previewTime);
        statusMsg.innerText = countdown + '...';
        statusMsg.style.display = 'block';
        const countdownInterval = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                statusMsg.innerText = countdown + '...';
            } else {
                clearInterval(countdownInterval);
                statusMsg.style.display = 'none';
            }
        }, 1000);

        // MP3를 미리 준비 (태블릿 딜레이 최소화)
        // 음소거 상태로 미리 play → pause (브라우저 오디오 컨텍스트 활성화)
        // (MP3 프리로드 제거됨 — 샘플 피아노 사용)

        // previewTime 후 MP3 시작 - requestAnimationFrame으로 정확한 타이밍 보장
        const targetWall = previewStartWall + previewTime * 1000;
        const waitForStart = () => {
            const now = performance.now();
            if (now >= targetWall - 16) { // 한 프레임(16ms) 이내
                window._previewActive = false;
                anchorClock(loopStartTime); // 단일 시계 시작점 고정
                restartMetronomeIfEnabled();
                // _previewActive를 끈 직후부터 다음 syncSmoothTime() 호출 전까지
                // _smoothWall/_smoothAudio가 갱신 안 된 상태(0 또는 이전 곡의 낡은 값)로 남아있으면
                // getCurrentTime()이 그 사이에 호출될 때 wallElapsed가 비정상적으로 커져서
                // "거대한 프레임 드랍"으로 오인되고, 노트가 위로 튕기는 것처럼 보이는 버그가 있었음.
                // → 50ms 뒤로 미루지 않고 즉시 동기화해서 그 공백을 없앰 (50ms 뒤 보정은 미세조정용으로 유지)
                // (단일 시계 앵커는 위 anchorClock에서 처리)
            } else {
                requestAnimationFrame(waitForStart);
            }
        };
        setTimeout(() => requestAnimationFrame(waitForStart), previewTime * 1000 - 100);

        (window.playBtn || playBtn).innerText = "\u23F8 일시정지";
        loop();
    }
}
function pauseGame() {
    if (!isPlaying) return;

    // 일시정지 시점의 곡 시간 저장 (단일 시계 기준)
    pauseCurrentTime = getCurrentTime();
    // 샘플 피아노 정지
    pianoSynth.stopAll();
    pauseMetronomeTimer();

    isPlaying = false;
    isPaused = true;
    cancelAnimationFrame(animationId); animationId = null; window.animationId = null;;

    (window.playBtn || playBtn).innerText = "\u25B6 재생";
    statusMsg.innerText = "일시정지됨\n(화면을 터치하면 다시 시작됩니다)";
    statusMsg.style.display = 'block';
    controlsDiv.classList.remove('hidden-controls');

    // 일시정지 프레임을 다시 그려 노트가 사라지지 않게 함 (WebGL 포함)
    if (notes.length > 0) renderFrameAt(pauseCurrentTime);
    else if (window.JPRenderer) JPRenderer.clearAll();
}
// resetGameData 함수 정의
function resetGameData() {
    // 재설정 중 플래그 설정 (이벤트 리스너 중복 실행 방지)
    isResetting = true;
    
    notes = [];
    notesByPitch = {};
    measureTimes = [];
    currentSongSections = [];
    songDuration = 0;
    currentSongId = null;
    songMetadata = null;

    // MP3 정지 및 볼륨 복원
    audioSync.stop();
    audioSync.volume = 1.0;
    // 신디사이저 정지 및 모드 초기화
    pianoSynth.stopAll();
    useSynth = false;

    // 곡 이름 초기화 ('곡 선택' 버튼 기본 라벨 복원)
    const songSelectBtn = document.getElementById('btn-song-select-tablet');
    if (songSelectBtn) songSelectBtn.innerText = '곡 선택';
    if (songNameDisplay) { songNameDisplay.innerText = ''; songNameDisplay.style.display = 'none'; }
    
    // 구간 드롭다운 업데이트 (MIDI 파일이 없으므로 "전곡"만 남음)
    updateSectionDropdown();
    
    // 구간 초기화 (전곡) - updateSectionDropdown() 이후에 설정
    if (sectionSelect) sectionSelect.value = '-1';
    
    // 반복 초기화 (1회)
    const repeatSelect = document.getElementById('sel-repeat');
    if (repeatSelect) repeatSelect.value = '1';
    loopCount = 1;
    
    // 속도 초기화 (1.0x)
    speed = 1.0;
    if (speedText) speedText.innerText = '1.0x';
    restartMetronomeIfEnabled();
    
    // 오른손/왼손 버튼 초기화 (둘 다 체크) - 외부 변수 재사용
    chkRight = document.getElementById('chk-right');
    chkLeft = document.getElementById('chk-left');
    if (chkRight) chkRight.checked = true;
    if (chkLeft) chkLeft.checked = true;
    
    // 루프 카운터 초기화
    currentLoop = 0;
    
    stopGame(true);
    
    // 오른손/왼손 변경 이벤트 트리거하여 뷰 업데이트
    if (chkRight || chkLeft) {
        try {
            alignViewToMode();
            updateZoomBasedOnHands();
            updateCenterGuidePosition();
        } catch (e) {
            console.error('뷰 업데이트 중 에러:', e);
        }
    }
    
    // 재설정 완료 후 플래그 해제
    isResetting = false;
}

// window 객체에 할당하여 다른 모듈에서 접근 가능하도록 함
window.resetGameData = resetGameData;

function stopGame(fullReset = true) {
    if (fullReset) stopMetronome();
    isPlaying = false;
    isPaused = false;
    cancelAnimationFrame(animationId); animationId = null; window.animationId = null;;
    // WebGL 노트 레이어 잔상 제거 (이후 정적 화면은 2D로 그림)
    if (window.JPRenderer) JPRenderer.clearAll();
    // 키 플래시 초기화
    keyFlashes = {};
    notes.forEach(n => { n._particleSpawned = false; });
    // MP3 정지
    audioSync.pause();
    // 신디사이저 정지
    pianoSynth.stopAll();
    (window.playBtn || playBtn).innerText = "\u25B6 재생";
    if (progressFill) progressFill.style.width = '0%';
    if (progressHandle) progressHandle.style.left = '0%';
    if(fullReset) {
        notes.forEach(n => {
            n.played = false;
            n.synthTriggered = false;
            n.scoreStatus = 'pending';
            if (n.idleColor) n.color = n.idleColor;
            else {
                if (n.hand === 'left') {
                    const fKey = n.finger ? n.finger.toString().replace('L', '') : '';
                    n.color = LEFT_FINGER_COLOR_MAP[fKey] || '#888';
                } else {
                    n.color = FINGER_COLOR_MAP[n.finger] || '#888';
                }
            }
        });
        nextNoteIndex = 0;
        score = { correct: 0, missed: 0, total: 0 };
        statusMsg.innerText = notes.length > 0 ? "재생 버튼을 눌러 시작하세요" : "곡을 선택하여\n연습을 시작하세요";
        statusMsg.style.display = 'block';
        currentLoop = 0;
        renderFrameAt(0); // 첫 노트들을 시작 위치에 표시 (대기 화면, WebGL 포함)
    }
    controlsDiv.classList.remove('hidden-controls');
}
// 메뉴 버튼 초기화는 desktop-menu-buttons.js와 mobile-menu-buttons.js에서 처리됨

// 구간 선택과 반복 선택 이벤트 리스너는 desktop-menu-buttons.js와 mobile-menu-buttons.js에서 처리됨
// loopCount는 window 객체에 할당하여 다른 모듈에서 접근 가능하도록 함
window.loopCount = loopCount;
Object.defineProperty(window, 'loopCount', {
    get: () => loopCount,
    set: (val) => { loopCount = val; },
    configurable: true
});

const floatingZoomControls = document.getElementById('floating-zoom-controls');

// 메뉴판이 보일 때의 top 위치를 기록 (메뉴판 숨김과 무관하게 동일 위치 유지)
let _zoomControlsFixedTop = 0;

// 플로팅 줌 버튼 위치 업데이트: 게임 모달 상단 기준 고정
function updateFloatingZoomControlsPosition() {
    // 줌 컨트롤은 이제 사이드바 안에 일반 배치되므로 절대위치 계산을 하지 않음 (no-op)
    return;

    const gameInnerContainer = document.getElementById('game-inner-container');
    if (!gameInnerContainer) return;

    // 메뉴판이 보이는 상태일 때만 기준 위치 갱신
    if (!controlsDiv.classList.contains('hidden-controls')) {
        const parentRect = gameInnerContainer.getBoundingClientRect();
        const controlsRect = controlsDiv.getBoundingClientRect();
        _zoomControlsFixedTop = controlsRect.bottom - parentRect.top + 8;
    }

    // 메뉴판이 보이든 숨겨지든 항상 동일한 위치
    if (_zoomControlsFixedTop > 0) {
        floatingZoomControls.style.top = _zoomControlsFixedTop + 'px';
    }
    floatingZoomControls.style.bottom = 'auto';
    floatingZoomControls.style.left = '0px';
}

// 초기 위치 설정
if (floatingZoomControls) {
    updateFloatingZoomControlsPosition();
}

// 전역 변수들을 window 객체에 할당하여 다른 모듈에서 접근 가능하도록 함
window.modal = modal;
window.canvas = canvas;
// 동적으로 업데이트되는 변수들은 getter/setter 사용
Object.defineProperty(window, 'isDraggingLine', {
    get: () => isDraggingLine,
    set: (val) => { isDraggingLine = val; },
    configurable: true
});
Object.defineProperty(window, 'didDragLine', {
    get: () => didDragLine,
    set: (val) => { didDragLine = val; },
    configurable: true
});
Object.defineProperty(window, 'isPlaying', {
    get: () => isPlaying,
    set: (val) => { isPlaying = val; },
    configurable: true
});
Object.defineProperty(window, 'isPaused', {
    get: () => isPaused,
    set: (val) => { isPaused = val; },
    configurable: true
});
window.playGame = playGame;
window.pauseGame = pauseGame;
window.stopGame = stopGame;
window.isResetting = false;
window.openGameModal = openGameModal;

// 전역 이벤트 리스너는 desktop-events.js에서 처리됨
console.log('✅ 데스크탑 전역 이벤트 리스너가 활성화됩니다.');

function initApp() {
    // 팝업으로 열렸는지 감지
    const urlParams = new URLSearchParams(window.location.search);
    const isPopup = urlParams.get('popup') === 'true' || (window.opener !== null && window.opener !== undefined);
    if (isPopup) {
        document.body.classList.add('popup-window');
    }

    // 게임 모달을 기본으로 표시
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    stopGame(true);
    drawKeyboard([]);

    // DOM 접근 최적화: 체크박스 요소 초기화
    chkRight = document.getElementById('chk-right');
    chkLeft = document.getElementById('chk-left');

    // WebGL 노트 렌더러 초기화 (비동기). 준비되면 JP_onRendererReady → resize로 크기 동기화.
    window.JP_onRendererReady = function () { try { resize(); } catch (e) {} };
    if (USE_WEBGL && window.JPRenderer) JPRenderer.init(gameContainer, canvas, dpr);

    setTimeout(() => {
        resize();

        // 기본 곡 자동 로드 (Fur Elise)
        const defaultSong = SONG_LIST[0];
        if (defaultSong) {
            loadAndStartSong(defaultSong.id);
        }
    }, 50);
}
initApp();

// ===== 곡 선택 패널 =====
const songDurationCache = {};

function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return '--:--';
    const totalSeconds = Math.round(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return minutes + ':' + String(secs).padStart(2, '0');
}

function getSongJsonPath(song) {
    const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
    return isLocal ? ('json/' + song.id + '.json') : song.jsonPath;
}

function inferSongDuration(data) {
    if (!data) return 0;
    if (Number.isFinite(Number(data.totalDuration))) return Number(data.totalDuration);
    if (Number.isFinite(Number(data.duration))) return Number(data.duration);
    const notes = Array.isArray(data.notes) ? data.notes : [];
    return notes.reduce((max, note) => {
        const start = Number(note.time) || 0;
        const duration = Number(note.duration) || 0;
        return Math.max(max, start + duration);
    }, 0);
}

async function hydrateSongDuration(song, targetEl) {
    if (!targetEl) return;
    if (songDurationCache[song.id]) {
        targetEl.innerText = formatDuration(songDurationCache[song.id]);
        return;
    }
    try {
        const response = await fetch(getSongJsonPath(song));
        if (!response.ok) throw new Error('duration fetch failed');
        const data = await response.json();
        const duration = inferSongDuration(data);
        songDurationCache[song.id] = duration;
        targetEl.innerText = formatDuration(duration);
    } catch (e) {
        targetEl.innerText = '--:--';
    }
}

function openSongSelectPanel() {
    const overlay = document.getElementById('song-select-overlay');
    const songListDiv = document.getElementById('song-list');
    if (!overlay || !songListDiv) return;

    const difficultyLabel = { beginner: 'Beginner', easy: 'Easy', intermediate: 'Intermediate', advanced: 'Advanced' };

    songListDiv.innerHTML = '';
    const songs = getSongList();
    songs.forEach(song => {
        const item = document.createElement('div');
        item.className = 'song-item' + (song.id === currentSongId ? ' active' : '');
        item.innerHTML =
            '<div class="song-item-top">' +
                '<div class="song-title">' + song.title + '</div>' +
                '<span class="difficulty-badge ' + song.difficulty + '">' + (difficultyLabel[song.difficulty] || song.difficulty) + '</span>' +
            '</div>' +
            '<div class="song-info">' +
                '<span class="song-composer">' + (song.composer || '') + '</span>' +
                '<span class="song-duration" data-song-id="' + song.id + '">--:--</span>' +
            '</div>';
        hydrateSongDuration(song, item.querySelector('.song-duration'));
        item.addEventListener('click', () => {
            closeSongSelectPanel();
            loadAndStartSong(song.id);
        });
        songListDiv.appendChild(item);
    });

    overlay.style.display = 'flex';
}

function closeSongSelectPanel() {
    const overlay = document.getElementById('song-select-overlay');
    if (overlay) overlay.style.display = 'none';
}

window.openSongSelectPanel = openSongSelectPanel;
window.closeSongSelectPanel = closeSongSelectPanel;

// ===== 모바일 햄버거: 사이드바 드로어 토글 =====
const btnHamburger = document.getElementById('btn-hamburger');
if (btnHamburger) {
    btnHamburger.addEventListener('click', (e) => {
        e.stopPropagation();
        const root = document.getElementById('jellypiano-game');
        if (root) root.classList.toggle('sidebar-open');
    });
}
// 드로어 바깥 클릭 시 닫기 (캡처 단계에서 처리해 재생/일시정지 토글로 새지 않게 함)
document.addEventListener('click', (e) => {
    const root = document.getElementById('jellypiano-game');
    if (!root || !root.classList.contains('sidebar-open')) return;
    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.contains(e.target)) return; // 사이드바 내부 클릭은 유지
    root.classList.remove('sidebar-open');
    e.stopPropagation();
    e.preventDefault();
}, true);

// 곡 선택 버튼 이벤트
const btnSongSelectTablet = document.getElementById('btn-song-select-tablet');
const btnSongPanelClose = document.getElementById('btn-song-panel-close');

if (btnSongSelectTablet) btnSongSelectTablet.addEventListener('click', (e) => { e.stopPropagation(); openSongSelectPanel(); });
if (btnSongPanelClose) btnSongPanelClose.addEventListener('click', (e) => { e.stopPropagation(); closeSongSelectPanel(); });

// 오버레이 배경 클릭으로 닫기
const songSelectOverlay = document.getElementById('song-select-overlay');
if (songSelectOverlay) {
    songSelectOverlay.addEventListener('click', (e) => {
        if (e.target === songSelectOverlay) closeSongSelectPanel();
    });
}

// ===== 프로그레스바 시크(클릭으로 이동) =====
if (progressContainer) {
    // 진행바 hover 시 시간 툴팁 - body에 fixed 위치로 추가
    const progressTooltip = document.createElement('div');
    progressTooltip.id = 'progress-time-tooltip';
    progressTooltip.style.cssText = 'position:fixed;background:rgba(0,0,0,0.85);color:#fff;padding:4px 10px;border-radius:6px;font-size:13px;font-weight:bold;pointer-events:none;transform:translateX(-50%);white-space:nowrap;z-index:99999;display:none;border:1px solid rgba(255,255,255,0.3);';
    document.body.appendChild(progressTooltip);

    progressContainer.style.cursor = 'pointer';

    progressContainer.addEventListener('mousemove', (e) => {
        if (songDuration <= 0) return;
        const rect = progressContainer.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const hoverTime = ratio * songDuration;
        const min = Math.floor(hoverTime / 60);
        const sec = Math.floor(hoverTime % 60);
        const ms = Math.floor((hoverTime % 1) * 10);
        progressTooltip.innerText = min > 0 ? min+':'+String(sec).padStart(2,'0')+'.'+ms : sec+'.'+ms+'초';
        progressTooltip.style.display = 'block';
        progressTooltip.style.left = e.clientX + 'px';
        progressTooltip.style.top = (rect.top - 35) + 'px';
    });

    progressContainer.addEventListener('mouseleave', () => {
        progressTooltip.style.display = 'none';
    });

    progressContainer.addEventListener('click', (e) => {
        if (notes.length === 0 || songDuration <= 0) return;
        const rect = progressContainer.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const targetTime = ratio * songDuration;

        pauseCurrentTime = targetTime;
        if (isPlaying) anchorClock(targetTime);

        // 노트 상태 업데이트
        notes.forEach(n => {
            if (n.startTime + n.durationTime < targetTime) {
                n.played = true;
            } else {
                n.played = false;
                n.scoreStatus = 'pending';
                if (n.idleColor) n.color = n.idleColor;
            }
        });
        nextNoteIndex = 0;

        // 프로그레스바 UI 업데이트
        const percent = ratio * 100;
        progressFill.style.width = percent + '%';
        progressHandle.style.left = percent + '%';

        // 일시정지 상태면 화면 다시 그리기 (WebGL 포함)
        if (isPaused || !isPlaying) {
            renderFrameAt(targetTime);
        }
    });
}

// MP3 재생 종료 시 곡 끝 처리
audioSync.onEnded(() => {
    if (isPlaying) {
        // MP3가 끝나면 무조건 handleSongEnd 호출
        handleSongEnd();
    }
});

// ===== 데스크탑 이벤트 리스너 =====

// 데스크탑 전용 이벤트 리스너 모듈

(function() {
    'use strict';
    
    // 데스크탑 전용 전역 이벤트 리스너
    let clickTimeout = null;
    
    document.addEventListener('click', (e) => {
        if (window.modal && window.modal.style.display === 'none') return;

        // 곡 선택 패널 클릭 시 무시 (곡 선택 후 자동재생 방지)
        if (e.target.closest('#song-select-overlay')) return;

        // 회원가입 팝업 클릭 시 무시 (팝업 닫기 후 자동재생 방지)
        if (e.target.closest('#signup-prompt-overlay')) return;

        // 재설정 버튼 플래그 체크 (가장 먼저, 가장 중요)
        if (window.isResetButtonPressed) {
            return;
        }

        // 재설정 버튼 클릭 시 전역 클릭 이벤트 즉시 무시 (여러 방법으로 체크)
        const stopBtn = e.target.closest('#btn-stop');
        if (stopBtn || e.target.id === 'btn-stop' || e.target === stopBtn) {
            return;
        }
        
        // 재생 버튼 클릭 시 전역 클릭 이벤트 무시
        if (e.target.id === 'btn-play' || e.target.closest('#btn-play')) {
            return;
        }

        if (window.didDragLine) return;
        
        // controls 내부 요소는 무시
        if (e.target.closest('#controls')) {
            const interactiveElement = e.target.closest('button, select, input, label, .file-upload');
            if (interactiveElement) {
                // 재설정 버튼인지 다시 한번 확인
                if (interactiveElement.id === 'btn-stop' || interactiveElement.closest('#btn-stop')) {
                    return;
                }
                return;
            }
        }
        if (e.target.closest('#floating-zoom-controls')) return;
        // 사이드바 내부 클릭(컨트롤들)은 재생/일시정지 토글로 새지 않게 무시
        if (e.target.closest('#sidebar')) return;

        // 기준선 드래그 중이면 클릭 이벤트 무시
        if (window.isDraggingLine) return;
        
        if (clickTimeout) {
            clearTimeout(clickTimeout);
            clickTimeout = null;
            if (window.stopGame) window.stopGame(true); 
        } else {
            clickTimeout = setTimeout(() => {
                clickTimeout = null;
                // 재설정 버튼이 아닌지 다시 한번 확인
                if (!window.isResetButtonPressed) {
                    if (window.isPlaying) {
                        if (window.pauseGame) window.pauseGame();
                    } else {
                        if (window.playGame) window.playGame();
                    }
                }
            }, 250); 
        }
    });
    
})();

// ===== 데스크탑 메뉴 버튼 초기화 =====

// 데스크탑 전용 메뉴 버튼 초기화 모듈

(function() {
    'use strict';
    
    // 데스크탑 전용 메뉴 버튼 초기화 함수
    function initDesktopMenuButtons() {
        // 재생 버튼 초기화
        initPlayButton();
        
        // 재설정 버튼 초기화
        initResetButton();
        
        // 곡 선택 버튼 초기화
        initSongSelectButtons();
        
        // 구간 선택 초기화
        initSectionSelect();
        
        // 반복 선택 초기화
        initRepeatSelect();
        
        // 속도 조절 버튼 초기화
        initSpeedButtons();
        
        // 오른손/왼손 체크박스 초기화
        initHandCheckboxes();
        
    }
    
    // 재생 버튼 초기화
    function initPlayButton() {
        const playBtn = document.getElementById('btn-play');
        if (!playBtn) {
            console.warn('재생 버튼을 찾을 수 없습니다.');
            return;
        }
        
        // 기존 이벤트 리스너 제거 (중복 방지)
        const newPlayBtn = playBtn.cloneNode(true);
        playBtn.parentNode.replaceChild(newPlayBtn, playBtn);
        
        // 클릭 이벤트 리스너 등록 (캡처 단계에서 최고 우선순위)
        newPlayBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
            if (e.cancelable) {
                e.preventDefault();
            }
            if (window.isPlaying) {
                if (window.pauseGame) window.pauseGame();
            } else {
                if (window.playGame) window.playGame();
            }
        }, { capture: true, passive: false });
        
        // window 객체에 업데이트
        window.playBtn = newPlayBtn;
    }
    
    // 재설정 버튼 초기화
    function initResetButton() {
        // 기존 버튼이 있다면 제거
        const existingBtn = document.getElementById('btn-stop');
        if (existingBtn) {
            existingBtn.remove();
        }
        
        // group-left 요소 찾기
        const groupLeft = document.querySelector('.group-left');
        if (!groupLeft) {
            console.error('group-left 요소를 찾을 수 없습니다.');
            return;
        }
        
        // 새 재설정 버튼 생성
        const stopBtn = document.createElement('button');
        stopBtn.id = 'btn-stop';
        stopBtn.className = 'stop';
        stopBtn.textContent = '■ 재설정';
        
        // playBtn 다음에 삽입
        const playBtn = document.getElementById('btn-play');
        if (playBtn && playBtn.nextSibling) {
            groupLeft.insertBefore(stopBtn, playBtn.nextSibling);
        } else {
            groupLeft.appendChild(stopBtn);
        }
        
        // 재설정 핸들러
        const handleReset = (e) => {
            // 이벤트 전파 완전 차단
            if (e) {
                e.stopPropagation();
                e.stopImmediatePropagation();
                if (e.cancelable) {
                    e.preventDefault();
                }
            }
            
            // 플래그 즉시 설정 (전역 리스너가 무시하도록)
            window.isResetButtonPressed = true;

            // resetGameData 호출
            if (window.resetGameData) {
                try {
                    window.resetGameData();
                } catch (err) {
                    console.error('❌ resetGameData 실행 중 오류:', err);
                }
            } else {
                console.error('❌ resetGameData 함수가 아직 로드되지 않았습니다.');
            }
            
            // 플래그 해제
            setTimeout(() => {
                window.isResetButtonPressed = false;
            }, 300);
            
            return false;
        };
        
        // 클릭 이벤트 리스너 등록 (캡처 단계에서 최고 우선순위)
        stopBtn.addEventListener('click', handleReset, { capture: true, passive: false });
    }
    
    // 곡 선택 버튼 초기화
    function initSongSelectButtons() {
        // 곡 선택 버튼은 main.js에서 직접 이벤트 리스너를 등록함
        // 여기서는 추가 초기화가 필요한 경우에만 처리
    }
    
    // 구간 선택 초기화
    function initSectionSelect() {
        const sectionSelect = document.getElementById('sel-section');
        if (!sectionSelect) {
            console.warn('구간 선택 요소를 찾을 수 없습니다.');
            return;
        }
        
        sectionSelect.addEventListener('change', () => {
            if (window.stopGame) {
                window.stopGame(true);
            }
        });
    }

    // 반복 선택 초기화
    function initRepeatSelect() {
        const repeatSelect = document.getElementById('sel-repeat');
        if (!repeatSelect) {
            console.warn('반복 선택 요소를 찾을 수 없습니다.');
            return;
        }
        
        repeatSelect.addEventListener('change', (e) => {
            if (window.loopCount !== undefined) {
                window.loopCount = parseInt(e.target.value);
            }
        });
    }

    // 속도 조절 버튼 초기화
    function initSpeedButtons() {
        const speedUpBtn = document.getElementById('btn-speed-up');
        const speedDownBtn = document.getElementById('btn-speed-down');
        
        if (speedUpBtn) {
            speedUpBtn.addEventListener('click', () => {
                if (window.updateSpeed) {
                    window.updateSpeed(0.1);
                }
            });
        }
        
        if (speedDownBtn) {
            speedDownBtn.addEventListener('click', () => {
                if (window.updateSpeed) {
                    window.updateSpeed(-0.1);
                }
            });
        }
    }

    // 오른손/왼손 체크박스 초기화
    function initHandCheckboxes() {
        const chkRight = document.getElementById('chk-right');
        const chkLeft = document.getElementById('chk-left');

        if (chkRight) {
            chkRight.addEventListener('change', () => {
                if (window.alignViewToMode) window.alignViewToMode();
                if (window.updateZoomBasedOnHands) window.updateZoomBasedOnHands();
                if (window.updateCenterGuidePosition) {
                    try {
                        window.updateCenterGuidePosition();
                    } catch (e) {
                        console.error('분리선 위치 업데이트 중 에러:', e);
                    }
                }
                // 한손/양손 모드에 따라 오디오 모드 전환 (곡 재생 중에도 즉시 반영)
                if (window.updateHandAudioMode) window.updateHandAudioMode();
            });
        }

        if (chkLeft) {
            chkLeft.addEventListener('change', () => {
                if (window.alignViewToMode) window.alignViewToMode();
                if (window.updateZoomBasedOnHands) window.updateZoomBasedOnHands();
                if (window.updateCenterGuidePosition) {
                    try {
                        window.updateCenterGuidePosition();
                    } catch (e) {
                        console.error('분리선 위치 업데이트 중 에러:', e);
                    }
                }
                // 한손/양손 모드에 따라 오디오 모드 전환 (곡 재생 중에도 즉시 반영)
                if (window.updateHandAudioMode) window.updateHandAudioMode();
            });
        }

    }

    // DOM이 준비되면 초기화
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            // resetGameData가 정의될 때까지 대기
            if (window.resetGameData) {
                initDesktopMenuButtons();
            } else {
                setTimeout(() => {
                    if (window.resetGameData) {
                        initDesktopMenuButtons();
                    }
                }, 100);
            }
        }, { once: true });
    } else {
        // resetGameData가 정의될 때까지 대기
        if (window.resetGameData) {
            initDesktopMenuButtons();
        } else {
            setTimeout(() => {
                if (window.resetGameData) {
                    initDesktopMenuButtons();
                }
            }, 100);
        }
    }
    
    // openGameModal에서도 재초기화
    const originalOpenGameModal = window.openGameModal;
    if (originalOpenGameModal) {
        window.openGameModal = function() {
            originalOpenGameModal.apply(this, arguments);
            setTimeout(() => {
                initDesktopMenuButtons();
            }, 50);
        };
    }
    
})();
