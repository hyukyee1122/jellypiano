// ===== 젤리피아노 WebGL 노트 렌더러 (renderer-pixi.js) — Phase B Milestone 1 =====
//
// 가장 비싼 부분(글로우가 걸린 낙하 노트 + 연결바)을 PIXI(WebGL)로 렌더링한다.
// - 글로우: 활성 노트/바를 별도 레이어에 그린 뒤 BlurFilter + 가산(additive) 블렌딩으로 저비용 재현.
//   (Canvas2D shadowBlur 는 모바일에서 프레임당 가장 비싼 연산이었음)
// - 텍스트/건반/판정선/분리선은 기존 2D 캔버스 그대로 (이 캔버스 위에 겹쳐 표시).
//
// 안전장치: PIXI 미로드/초기화 실패 시 ready=false 로 두어 game.js 가 100% 2D 경로로 자동 폴백한다.
// 즉 이 모듈이 깨져도 기존(현재) 동작보다 나빠지지 않는다.

(function () {
    'use strict';

    function hexToNum(c) {
        if (typeof c === 'number') return c;
        if (!c) return 0x888888;
        let h = String(c).replace('#', '');
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        const n = parseInt(h, 16);
        return isNaN(n) ? 0x888888 : n;
    }

    const JPRenderer = {
        ready: false,
        app: null,
        canvas: null,
        sharpG: null,   // 노트/바 본체 (선명)
        glowG: null,    // 활성 요소 글로우 (blur + additive)
        _initing: false,

        async init(container, beforeEl, dpr) {
            if (this._initing || this.ready) return;
            if (typeof PIXI === 'undefined') { console.warn('PIXI 미로드 — 노트 렌더는 2D로 폴백'); return; }
            if (!container) return;
            this._initing = true;
            try {
                const canvas = document.createElement('canvas');
                canvas.id = 'pixiCanvas';
                // 2D 캔버스(#pianoCanvas) 바로 앞에 삽입 → DOM 순서상 2D가 위(텍스트가 노트 위에 보이도록)
                if (beforeEl && beforeEl.parentNode === container) {
                    container.insertBefore(canvas, beforeEl);
                } else {
                    container.appendChild(canvas);
                }
                this.canvas = canvas;

                const app = new PIXI.Application();
                await app.init({
                    canvas: canvas,
                    width: 800,
                    height: 600,
                    backgroundAlpha: 0,
                    antialias: true,
                    resolution: Math.min(dpr || window.devicePixelRatio || 1, 1.5),
                    autoDensity: true,
                });
                this.app = app;
                app.ticker.stop(); // 자동 렌더 끔 — game.js 루프가 flush()로 수동 렌더

                this.glowG = new PIXI.Graphics();
                this.glowG.blendMode = 'add';
                try { this.glowG.filters = [new PIXI.BlurFilter({ strength: 10, quality: 3 })]; }
                catch (e) { this.glowG.filters = [new PIXI.BlurFilter(10)]; } // 구형 시그니처 폴백

                this.sharpG = new PIXI.Graphics();

                app.stage.addChild(this.glowG);
                app.stage.addChild(this.sharpG);

                // 프로브: 런타임 그리기 API(rect/fill/render)가 이 PIXI 버전과 호환되는지 미리 확인.
                // 여기서 던지면 catch로 가서 ready=false → game.js가 2D로 폴백 (루프 중 크래시 방지).
                this.sharpG.rect(0, 0, 1, 1).fill({ color: 0xffffff, alpha: 0 });
                this.sharpG.clear();
                app.renderer.render(app.stage);

                this.ready = true;
                console.log('🟢 WebGL 노트 렌더러 활성화');
                if (typeof window.JP_onRendererReady === 'function') window.JP_onRendererReady();
            } catch (e) {
                console.warn('WebGL 렌더러 초기화 실패 — 2D로 폴백:', e);
                this.ready = false;
            } finally {
                this._initing = false;
            }
        },

        resize(w, h) {
            if (!this.ready) return;
            try {
                this.app.renderer.resize(w, h);
                if (this.canvas) { this.canvas.style.width = '100%'; this.canvas.style.height = '100%'; }
            } catch (e) { /* noop */ }
        },

        clear() {
            if (!this.ready) return;
            this.sharpG.clear();
            this.glowG.clear();
        },

        // 사각형(노트/바). active=true 면 글로우 레이어에도 추가.
        addRect(x, y, w, h, color, alpha, active, radius) {
            if (!this.ready) return;
            const col = hexToNum(color);
            const a = (alpha === undefined) ? 1 : alpha;
            if (radius && this.sharpG.roundRect) this.sharpG.roundRect(x, y, w, h, radius);
            else this.sharpG.rect(x, y, w, h);
            this.sharpG.fill({ color: col, alpha: a });
            if (active) {
                const gx = x - 2, gy = y - 2, gw = w + 4, gh = h + 4;
                if (radius && this.glowG.roundRect) this.glowG.roundRect(gx, gy, gw, gh, radius + 2);
                else this.glowG.rect(gx, gy, gw, gh);
                this.glowG.fill({ color: col, alpha: 0.9 });
            }
        },

        flush() {
            if (!this.ready) return;
            try { this.app.renderer.render(this.app.stage); } catch (e) { /* noop */ }
        },

        // 정적(일시정지/정지) 전환 시 잔상 제거
        clearAll() {
            if (!this.ready) return;
            this.clear();
            this.flush();
        },
    };

    window.JPRenderer = JPRenderer;
})();
