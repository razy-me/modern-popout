// modern-popout.js
(async function initModernPopout() {
    try {
        if (!window.Spicetify || !Spicetify.Player || !Spicetify.Topbar) {
            setTimeout(initModernPopout, 1000);
            return;
        }

        let pipWindow = null;
        let isExpanded = false;
        let isDragging = false;
        let lastManualResizeTime = 0;

        // Size ratios
        const defaultCollapsedW = 260;
        const defaultCollapsedH = 88;
        const defaultExpandedW = 260;
        const defaultExpandedH = 175;

        // Restore persisted sizes (clamped to sane bounds)
        function loadSizes() {
            try {
                const raw = localStorage.getItem('modern-popout:sizes');
                if (!raw) return;
                const s = JSON.parse(raw);
                collapsedW = clamp(s.collapsedW, 160, 800);
                collapsedH = clamp(s.collapsedH, 40, 300);
                expandedW = clamp(s.expandedW, collapsedW, 1200);
                expandedH = clamp(s.expandedH, 60, 600);
            } catch (e) { /* corrupted sizes – ignore */ }
        }
        function clamp(v, min, max) {
            v = Number(v);
            if (!Number.isFinite(v)) return min;
            return Math.max(min, Math.min(max, Math.round(v)));
        }
        function saveSizes() {
            try {
                localStorage.setItem('modern-popout:sizes', JSON.stringify({
                    collapsedW, collapsedH, expandedW, expandedH
                }));
            } catch (e) { /* storage full/blocked */ }
        }

        let collapsedW = defaultCollapsedW;
        let collapsedH = defaultCollapsedH;
        let expandedW = defaultExpandedW;
        let expandedH = defaultExpandedH;
        loadSizes();

        function formatTime(ms) {
            if (!ms || isNaN(ms)) return '0:00';
            const totalSeconds = Math.max(0, Math.floor(ms / 1000));
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }

        const ICONS = {
            play: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-play"><polygon points="6 3 20 12 6 21 6 3"/></svg>',
            pause: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pause"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>',
            skipForward: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-skip-forward"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>',
            skipBack: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-skip-back"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>',
            shuffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shuffle"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>',
            repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-repeat"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
            heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-heart"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
            heartFilled: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-heart"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
            volumeHigh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>',
            volumeMute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>'
        };

        const CSS = `
            :root {
                --spotify-green: var(--spice-button, #1db954);
                --spotify-green-glow: rgba(29, 185, 84, 0.4);
                --text-main: var(--spice-text, #ffffff);
                --text-sub: var(--spice-subtext, rgba(255, 255, 255, 0.7));
                --bg-color: var(--spice-main, #121212);
                --glass-bg: rgba(18, 18, 22, 0.75);
                --glass-border: rgba(255, 255, 255, 0.12);
                --hover-bg: rgba(255, 255, 255, 0.12);
            }
            body.has-album-art {
                --text-main: #ffffff;
                --text-sub: rgba(255, 255, 255, 0.72);
                --bg-color: #000000;
            }
            body {
                margin: 0;
                padding: 0;
                overflow: hidden;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                background: #0a0a0c;
                color: var(--text-main);
                user-select: none;
                -webkit-user-select: none;
            }

            /* Ambient background glow */
            #background-blur {
                position: absolute;
                left: -20px;
                right: -20px;
                height: calc(2 * var(--expanded-h, 175px) - var(--collapsed-h, 88px) + 40px);
                background-size: cover;
                background-position: center;
                filter: blur(28px) brightness(0.65) saturate(2);
                z-index: -1;
                opacity: 0;
                transition: opacity 0.6s ease;
                transform: scale(1.1);
            }
            body.has-album-art #background-blur {
                opacity: 0.85;
            }
            body.has-album-art #background-blur::after {
                content: '';
                position: absolute;
                inset: 0;
                background: radial-gradient(circle at center, rgba(0, 0, 0, 0.2) 0%, rgba(0, 0, 0, 0.55) 100%);
            }
            #container:not(.inverted) #background-blur {
                top: calc(var(--collapsed-h, 88px) - var(--expanded-h, 175px) - 20px);
            }
            #container.inverted #background-blur {
                bottom: calc(var(--collapsed-h, 88px) - var(--expanded-h, 175px) - 20px);
            }

            /* Glassmorphism Card Container */
            #container {
                position: relative;
                z-index: 1;
                display: flex;
                flex-direction: column;
                width: 100vw;
                height: 100vh;
                box-sizing: border-box;
                padding: 10px 12px;
                background: var(--glass-bg);
                backdrop-filter: blur(24px) saturate(190%);
                -webkit-backdrop-filter: blur(24px) saturate(190%);
                border: 1px solid var(--glass-border);
                box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.18), 0 8px 32px rgba(0, 0, 0, 0.5);
                border-radius: 18px;
            }
            #container.inverted {
                flex-direction: column-reverse;
            }

            /* Pill State (Top Section) */
            #pill-area {
                display: flex;
                align-items: center;
                height: 52px;
                flex-shrink: 0;
                min-height: 0;
                overflow: hidden;
            }

            /* Realistic Vinyl Record */
            #album-art-wrap {
                position: relative;
                width: 50px;
                height: 50px;
                flex-shrink: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                filter: drop-shadow(0 6px 12px rgba(0,0,0,0.65));
            }
            #album-art-wrap::after {
                content: '';
                position: absolute;
                width: 11px;
                height: 11px;
                background: radial-gradient(circle, #222 25%, #666 45%, #999 55%, #181818 75%);
                border: 1.5px solid rgba(255,255,255,0.7);
                border-radius: 50%;
                z-index: 4;
                pointer-events: none;
                box-shadow: 0 0 4px rgba(0,0,0,0.9);
            }
            #album-art {
                width: 100%;
                height: 100%;
                border-radius: 50%;
                object-fit: cover;
                animation: spin 8s linear infinite;
                box-shadow: inset 0 0 0 2px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(255,255,255,0.25);
                transition: opacity 0.3s ease;
            }
            #album-art-grooves {
                position: absolute;
                inset: 0;
                border-radius: 50%;
                pointer-events: none;
                z-index: 2;
                background:
                    radial-gradient(circle, transparent 36%, rgba(255,255,255,0.03) 37%, transparent 38%, rgba(255,255,255,0.04) 50%, transparent 51%, rgba(255,255,255,0.03) 66%, transparent 67%, rgba(255,255,255,0.05) 84%, transparent 85%),
                    conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(255,255,255,0.16) 45deg, transparent 90deg, transparent 180deg, rgba(255,255,255,0.16) 225deg, transparent 270deg);
                mix-blend-mode: screen;
                animation: spin 8s linear infinite;
            }
            body.has-album-art #album-art.is-playing {
                animation: spin 8s linear infinite, art-glow 3s ease-in-out infinite alternate;
            }
            #album-art.hidden-art {
                visibility: hidden;
            }
            @keyframes spin {
                100% { transform: rotate(360deg); }
            }
            @keyframes art-glow {
                from { box-shadow: inset 0 0 0 2px rgba(0,0,0,0.7), 0 0 6px rgba(29,185,84,0.3); }
                to   { box-shadow: inset 0 0 0 2px rgba(0,0,0,0.7), 0 0 16px rgba(29,185,84,0.75); }
            }
            #album-art.paused,
            #album-art-grooves.paused {
                animation-play-state: paused;
            }

            /* Track Info & Typography */
            #track-info {
                margin-left: 10px;
                display: flex;
                flex-direction: column;
                justify-content: center;
                overflow: hidden;
                white-space: nowrap;
                flex-grow: 1;
                mask-image: linear-gradient(to right, black 88%, transparent 100%);
                -webkit-mask-image: linear-gradient(to right, black 88%, transparent 100%);
            }

            .marquee-container {
                overflow: hidden;
                position: relative;
                width: 100%;
            }
            .marquee-content {
                display: inline-block;
                white-space: nowrap;
            }
            .marquee-content.scroll {
                animation: marquee 8s ease-in-out infinite alternate;
            }
            @keyframes marquee {
                0% { transform: translateX(0); }
                10% { transform: translateX(0); }
                90% { transform: translateX(var(--scroll-offset, 0px)); }
                100% { transform: translateX(var(--scroll-offset, 0px)); }
            }

            #title {
                font-size: 13.5px;
                font-weight: 700;
                letter-spacing: -0.015em;
                line-height: 1.25;
                color: var(--text-main);
                text-shadow: 0 1px 3px rgba(0,0,0,0.7);
            }
            #artist {
                font-size: 11.5px;
                color: var(--text-sub);
                font-weight: 500;
                line-height: 1.25;
                margin-top: 1px;
                text-shadow: 0 1px 2px rgba(0,0,0,0.6);
            }

            /* Soundwave Animated Equalizer */
            .popout-eq {
                display: inline-flex;
                align-items: flex-end;
                gap: 2px;
                height: 11px;
                margin-left: 6px;
                vertical-align: middle;
                opacity: 0;
                transition: opacity 0.25s ease;
                flex-shrink: 0;
            }
            .popout-eq.is-playing {
                opacity: 0.95;
            }
            .eq-bar {
                width: 2.5px;
                border-radius: 1px;
                background: var(--spotify-green, #1db954);
                box-shadow: 0 0 4px var(--spotify-green, #1db954);
            }
            .bar-1 { height: 100%; animation: eq-anim 0.8s ease-in-out infinite alternate; }
            .bar-2 { height: 60%; animation: eq-anim 0.6s ease-in-out infinite alternate 0.2s; }
            .bar-3 { height: 80%; animation: eq-anim 0.7s ease-in-out infinite alternate 0.4s; }
            @keyframes eq-anim {
                0% { height: 20%; }
                100% { height: 100%; }
            }

            /* Progress Bar */
            #progress-container {
                display: flex;
                flex-direction: column;
                flex-shrink: 0;
                margin-top: 5px;
                margin-bottom: 3px;
            }
            #progress-bar-bg {
                width: 100%;
                height: 4px;
                background: rgba(255, 255, 255, 0.18);
                border-radius: 999px;
                position: relative;
                cursor: pointer;
                transition: height 0.15s ease;
            }
            #progress-bar-bg:hover,
            #progress-container.is-scrubbing #progress-bar-bg {
                height: 6px;
            }
            #progress-bar-fill {
                height: 100%;
                background: linear-gradient(90deg, var(--spotify-green, #1db954), #20df68);
                box-shadow: 0 0 8px var(--spotify-green-glow);
                border-radius: 999px;
                width: 100%;
                transform-origin: left;
                transform: scaleX(0);
                pointer-events: none;
                transition: transform 0.1s linear;
                position: relative;
            }
            #progress-bar-thumb {
                position: absolute;
                right: -4px;
                top: 50%;
                transform: translateY(-50%) scale(0);
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: #ffffff;
                box-shadow: 0 2px 6px rgba(0,0,0,0.6);
                transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
                pointer-events: none;
            }
            #progress-bar-bg:hover #progress-bar-thumb,
            #progress-container.is-scrubbing #progress-bar-thumb {
                transform: translateY(-50%) scale(1);
            }

            #time-info {
                display: flex;
                justify-content: space-between;
                font-size: 9.5px;
                font-weight: 600;
                color: var(--text-sub);
                font-variant-numeric: tabular-nums;
                margin-top: 3px;
                height: 0;
                opacity: 0;
                overflow: hidden;
                transition: opacity 0.2s ease, height 0.2s ease;
            }
            .expanded #time-info {
                height: 12px;
                opacity: 0.9;
            }

            /* Volume HUD Capsule */
            #volume-hud {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) scale(0.85);
                background: rgba(18, 18, 22, 0.92);
                border: 1px solid rgba(255, 255, 255, 0.22);
                padding: 6px 14px;
                border-radius: 20px;
                font-size: 11.5px;
                font-weight: 700;
                color: #ffffff;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
                z-index: 100;
                display: flex;
                align-items: center;
                gap: 8px;
                backdrop-filter: blur(16px);
                -webkit-backdrop-filter: blur(16px);
                box-shadow: 0 8px 24px rgba(0,0,0,0.65), inset 0 1px 1px rgba(255,255,255,0.25);
            }
            #volume-hud.visible {
                opacity: 1;
                transform: translate(-50%, -50%) scale(1);
            }
            #volume-hud svg {
                width: 15px;
                height: 15px;
            }

            /* Expanded State (Controls) */
            #expanded-area {
                display: flex;
                flex-direction: column;
                justify-content: center;
                height: 0;
                flex-grow: 0;
                flex-shrink: 0;
                opacity: 0;
                transform: translateY(6px);
                transition: opacity 0.2s ease, transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
                pointer-events: none;
                overflow: hidden;
            }
            .expanded #expanded-area {
                height: auto;
                flex-grow: 1;
                flex-shrink: 1;
                opacity: 1;
                transform: translateY(0);
                pointer-events: auto;
            }

            #controls {
                display: flex;
                justify-content: center;
                gap: 5px;
                align-items: center;
                margin-top: 5px;
                margin-bottom: 2px;
            }
            .control-btn {
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.08);
                color: var(--text-main);
                cursor: pointer;
                width: 31px;
                height: 31px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
                opacity: 0.85;
                position: relative;
                padding: 0;
            }
            .control-btn:hover {
                opacity: 1;
                background: rgba(255, 255, 255, 0.18);
                border-color: rgba(255, 255, 255, 0.2);
                transform: scale(1.12);
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            }
            .control-btn:active {
                transform: scale(0.92);
            }
            .control-btn svg {
                width: 17px;
                height: 17px;
            }
            #play-pause {
                background: #ffffff;
                color: #121212;
                opacity: 1;
                width: 37px;
                height: 37px;
                border: none;
                box-shadow: 0 4px 16px rgba(255, 255, 255, 0.25), 0 2px 6px rgba(0, 0, 0, 0.4);
            }
            #play-pause:hover {
                transform: scale(1.1);
                background: #ffffff;
                box-shadow: 0 6px 20px rgba(255, 255, 255, 0.45);
            }
            #play-pause svg {
                width: 20px;
                height: 20px;
            }
            @keyframes icon-pop {
                0%   { transform: scale(0.6); opacity: 0.4; }
                60%  { transform: scale(1.18); opacity: 1; }
                100% { transform: scale(1); opacity: 1; }
            }
            .control-btn.pop svg {
                animation: icon-pop 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
            }

            /* Active states */
            .control-btn.active {
                color: var(--spotify-green);
                opacity: 1;
                background: rgba(29, 185, 84, 0.15);
                border-color: rgba(29, 185, 84, 0.3);
            }
            @keyframes dot-pop {
                from { transform: translateX(-50%) scale(0); }
                to   { transform: translateX(-50%) scale(1); }
            }
            .control-btn.active::after {
                content: '';
                position: absolute;
                bottom: 2px;
                left: 50%;
                transform: translateX(-50%);
                width: 4px;
                height: 4px;
                border-radius: 50%;
                background: var(--spotify-green);
                box-shadow: 0 0 5px var(--spotify-green);
                animation: dot-pop 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
            }

            .control-btn#btn-heart.active {
                color: #ff3b5c;
                background: rgba(255, 59, 92, 0.15);
                border-color: rgba(255, 59, 92, 0.35);
                filter: drop-shadow(0 0 6px rgba(255, 59, 92, 0.5));
                animation: heart-pulse 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            }
            .control-btn#btn-heart.active::after {
                background: #ff3b5c;
                box-shadow: 0 0 5px #ff3b5c;
            }
            @keyframes heart-pulse {
                0%   { transform: scale(0.7); }
                60%  { transform: scale(1.25); }
                100% { transform: scale(1); }
            }

            @media (prefers-reduced-motion: reduce) {
                #album-art,
                #album-art-grooves,
                body.has-album-art #album-art.is-playing,
                .marquee-content.scroll,
                .control-btn.pop svg,
                .control-btn.active::after,
                .eq-bar {
                    animation: none !important;
                }
                #progress-bar-fill,
                #expanded-area {
                    transition-duration: 0.01ms !important;
                }
            }
        `;

        function syncThemeVariables(targetDoc) {
            try {
                const computed = window.getComputedStyle(document.documentElement);
                const root = targetDoc.documentElement;
                for (let i = 0; i < document.documentElement.style.length; i++) {
                    const prop = document.documentElement.style[i];
                    if (prop.startsWith('--spice-')) {
                        root.style.setProperty(prop, document.documentElement.style.getPropertyValue(prop));
                    }
                }
                const commonSpiceVars = [
                    '--spice-text', '--spice-subtext', '--spice-main', '--spice-sidebar',
                    '--spice-player', '--spice-card', '--spice-shadow', '--spice-selected-row',
                    '--spice-button', '--spice-button-active', '--spice-button-disabled',
                    '--spice-tab-active', '--spice-notification', '--spice-notification-error',
                    '--spice-misc', '--spice-accent'
                ];
                commonSpiceVars.forEach(v => {
                    const val = computed.getPropertyValue(v);
                    if (val) root.style.setProperty(v, val);
                });
            } catch (e) {
                console.warn("Modern Popout: Theme variable sync failed", e);
            }
        }

        function isCurrentTrackLiked() {
            const item = Spicetify.Player.data?.item;
            if (!item) return false;
            return item.metadata?.['collection.in_collection'] === 'true' || item.metadata?.starred === 'true';
        }

        async function toggleHeart(btn) {
            const uri = Spicetify.Player.data?.item?.uri;
            if (!uri) return;
            try {
                if (Spicetify.Platform?.LibraryAPI?.add && Spicetify.Platform?.LibraryAPI?.remove) {
                    const isLiked = isCurrentTrackLiked();
                    if (isLiked) {
                        await Spicetify.Platform.LibraryAPI.remove({ uris: [uri] });
                    } else {
                        await Spicetify.Platform.LibraryAPI.add({ uris: [uri] });
                    }
                    if (btn) {
                        btn.innerHTML = !isLiked ? ICONS.heartFilled : ICONS.heart;
                        btn.classList.toggle('active', !isLiked);
                    }
                } else if (typeof Spicetify.Player.toggleHeart === 'function') {
                    Spicetify.Player.toggleHeart();
                    setTimeout(() => {
                        const liked = isCurrentTrackLiked();
                        if (btn) {
                            btn.innerHTML = liked ? ICONS.heartFilled : ICONS.heart;
                            btn.classList.toggle('active', liked);
                        }
                    }, 100);
                }
            } catch (err) {
                console.warn("Modern Popout: toggleHeart error", err);
            }
        }

        function createUI(doc) {
            doc.body.innerHTML = '';
            syncThemeVariables(doc);
            const style = doc.createElement('style');
            style.innerHTML = CSS;
            doc.head.appendChild(style);
            doc.documentElement.style.setProperty('--collapsed-h', `${collapsedH}px`);
            doc.documentElement.style.setProperty('--expanded-h', `${expandedH}px`);

            const bg = doc.createElement('div');
            bg.id = 'background-blur';

            const container = doc.createElement('div');
            container.id = 'container';

            const pillArea = doc.createElement('div');
            pillArea.id = 'pill-area';

            const imgWrap = doc.createElement('div');
            imgWrap.id = 'album-art-wrap';

            const img = doc.createElement('img');
            img.id = 'album-art';
            img.alt = '';

            const grooves = doc.createElement('div');
            grooves.id = 'album-art-grooves';

            imgWrap.appendChild(img);
            imgWrap.appendChild(grooves);

            const trackInfo = doc.createElement('div');
            trackInfo.id = 'track-info';

            const titleContainer = doc.createElement('div');
            titleContainer.style.display = 'flex';
            titleContainer.style.alignItems = 'center';
            titleContainer.style.overflow = 'hidden';

            const titleMarquee = doc.createElement('div');
            titleMarquee.className = 'marquee-container';
            const title = doc.createElement('div');
            title.id = 'title';
            title.className = 'marquee-content';
            titleMarquee.appendChild(title);

            const eq = doc.createElement('div');
            eq.className = 'popout-eq';
            eq.innerHTML = '<span class="eq-bar bar-1"></span><span class="eq-bar bar-2"></span><span class="eq-bar bar-3"></span>';

            titleContainer.appendChild(titleMarquee);
            titleContainer.appendChild(eq);

            const artistMarquee = doc.createElement('div');
            artistMarquee.className = 'marquee-container';
            const artist = doc.createElement('div');
            artist.id = 'artist';
            artist.className = 'marquee-content';
            artistMarquee.appendChild(artist);

            trackInfo.appendChild(titleContainer);
            trackInfo.appendChild(artistMarquee);

            pillArea.appendChild(imgWrap);
            pillArea.appendChild(trackInfo);

            const progressContainer = doc.createElement('div');
            progressContainer.id = 'progress-container';
            const progressBg = doc.createElement('div');
            progressBg.id = 'progress-bar-bg';
            const progressFill = doc.createElement('div');
            progressFill.id = 'progress-bar-fill';
            const progressThumb = doc.createElement('div');
            progressThumb.id = 'progress-bar-thumb';
            progressFill.appendChild(progressThumb);
            progressBg.appendChild(progressFill);

            const timeInfo = doc.createElement('div');
            timeInfo.id = 'time-info';
            const timeCur = doc.createElement('span');
            timeCur.id = 'time-cur';
            timeCur.innerText = '0:00';
            const timeDur = doc.createElement('span');
            timeDur.id = 'time-dur';
            timeDur.innerText = '0:00';
            timeInfo.appendChild(timeCur);
            timeInfo.appendChild(timeDur);

            progressContainer.appendChild(progressBg);
            progressContainer.appendChild(timeInfo);

            const expandedArea = doc.createElement('div');
            expandedArea.id = 'expanded-area';

            const controls = doc.createElement('div');
            controls.id = 'controls';

            const btnShuffle = doc.createElement('button');
            btnShuffle.className = 'control-btn';
            btnShuffle.title = 'Zufallswiedergabe (S)';
            btnShuffle.setAttribute('aria-label', 'Zufallswiedergabe');
            btnShuffle.innerHTML = ICONS.shuffle;
            btnShuffle.onclick = () => Spicetify.Player.toggleShuffle();

            const btnPrev = doc.createElement('button');
            btnPrev.className = 'control-btn';
            btnPrev.title = 'Zurück (J)';
            btnPrev.setAttribute('aria-label', 'Vorheriger Track');
            btnPrev.innerHTML = ICONS.skipBack;
            btnPrev.onclick = () => Spicetify.Player.back();

            const btnPlay = doc.createElement('button');
            btnPlay.className = 'control-btn';
            btnPlay.id = 'play-pause';
            btnPlay.title = 'Abspielen/Pause (Leertaste)';
            btnPlay.setAttribute('aria-label', 'Abspielen oder pausieren');
            btnPlay.onclick = () => Spicetify.Player.togglePlay();

            const btnNext = doc.createElement('button');
            btnNext.className = 'control-btn';
            btnNext.title = 'Weiter (K)';
            btnNext.setAttribute('aria-label', 'Nächster Track');
            btnNext.innerHTML = ICONS.skipForward;
            btnNext.onclick = () => Spicetify.Player.next();

            const btnRepeat = doc.createElement('button');
            btnRepeat.className = 'control-btn';
            btnRepeat.title = 'Wiederholen (R)';
            btnRepeat.setAttribute('aria-label', 'Wiederholen');
            btnRepeat.innerHTML = ICONS.repeat;
            btnRepeat.onclick = () => Spicetify.Player.toggleRepeat();

            const btnHeart = doc.createElement('button');
            btnHeart.className = 'control-btn';
            btnHeart.id = 'btn-heart';
            btnHeart.title = 'Lieblingssong (L)';
            btnHeart.setAttribute('aria-label', 'Lieblingssong');
            btnHeart.innerHTML = ICONS.heart;
            btnHeart.onclick = () => toggleHeart(btnHeart);

            controls.appendChild(btnShuffle);
            controls.appendChild(btnPrev);
            controls.appendChild(btnPlay);
            controls.appendChild(btnNext);
            controls.appendChild(btnRepeat);
            controls.appendChild(btnHeart);

            expandedArea.appendChild(controls);

            const volHud = doc.createElement('div');
            volHud.id = 'volume-hud';
            volHud.innerHTML = `${ICONS.volumeHigh}<span id="volume-text">100%</span>`;

            container.appendChild(bg);
            container.appendChild(pillArea);
            container.appendChild(progressContainer);
            container.appendChild(expandedArea);
            container.appendChild(volHud);

            doc.body.appendChild(container);

            let isScrubbing = false;
            function handleScrub(e) {
                const rect = progressBg.getBoundingClientRect();
                const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                progressFill.style.transform = `scaleX(${pos})`;
                const dur = Spicetify.Player.getDuration();
                if (dur > 0) timeCur.innerText = formatTime(pos * dur);
                return pos;
            }

            progressBg.addEventListener('mousedown', (e) => {
                isScrubbing = true;
                progressContainer.classList.add('is-scrubbing');
                const pos = handleScrub(e);
                const onMove = (ev) => { if (isScrubbing) handleScrub(ev); };
                const onUp = (ev) => {
                    if (isScrubbing) {
                        isScrubbing = false;
                        progressContainer.classList.remove('is-scrubbing');
                        const finalPos = handleScrub(ev);
                        Spicetify.Player.seek(finalPos * Spicetify.Player.getDuration());
                        doc.removeEventListener('mousemove', onMove);
                        doc.removeEventListener('mouseup', onUp);
                    }
                };
                doc.addEventListener('mousemove', onMove);
                doc.addEventListener('mouseup', onUp);
            });

            return {
                bg, container, img, grooves, eq, title, artist, progressFill, timeCur, timeDur,
                btnPlay, btnShuffle, btnRepeat, btnHeart, volHud, getIsScrubbing: () => isScrubbing
            };
        }

        async function togglePiP() {
            if (!window.documentPictureInPicture) {
                Spicetify.showNotification("Modern Popout: Document PiP is not supported by your Spotify version.");
                return;
            }

            if (pipWindow) {
                pipWindow.close();
                pipWindow = null;
                return;
            }

            try {
                pipWindow = await window.documentPictureInPicture.requestWindow({
                    width: collapsedW,
                    height: collapsedH
                });

                pipWindow.resizeTo(collapsedW, collapsedH);

                const ui = createUI(pipWindow.document);
                setupStateSync(ui);
                setupInteractivity(pipWindow, ui);
                setupKeyboard(pipWindow, ui);

                pipWindow.addEventListener("pagehide", () => {
                    pipWindow = null;
                    isExpanded = false;
                });

            } catch (error) {
                console.error("Failed to open PiP:", error);
                Spicetify.showNotification("Failed to open Modern Popout");
            }
        }

        function popIcon(btn, html) {
            if (btn.innerHTML !== html) {
                btn.innerHTML = html;
                btn.classList.remove('pop');
                void btn.offsetWidth; // restart animation
                btn.classList.add('pop');
                setTimeout(() => btn.classList.remove('pop'), 320);
            }
        }

        let progressInterval;
        function setupStateSync(ui) {
            function updateTrack() {
                const track = Spicetify.Player.data ? Spicetify.Player.data.item : null;
                const body = ui.container.ownerDocument.body;
                if (!track) {
                    ui.title.innerText = "No track playing";
                    ui.artist.innerText = "Spotify";
                    ui.img.removeAttribute('src');
                    ui.img.classList.add('hidden-art');
                    if (ui.grooves) ui.grooves.style.display = 'none';
                    ui.bg.style.backgroundImage = "";
                    body.classList.remove('has-album-art');
                    updateControls();
                    setTimeout(updateMarqueeOffsets, 50);
                    return;
                }

                const meta = track.metadata;
                ui.title.innerText = meta.title || "Unknown Title";
                ui.artist.innerText = meta.artist_name || "Unknown Artist";

                const coverUrl = meta.image_url;
                if (coverUrl) {
                    ui.img.src = coverUrl;
                    ui.img.classList.remove('hidden-art');
                    if (ui.grooves) ui.grooves.style.display = 'block';
                    ui.bg.style.backgroundImage = `url('${coverUrl}')`;
                    body.classList.add('has-album-art');
                } else {
                    ui.img.removeAttribute('src');
                    ui.img.classList.add('hidden-art');
                    if (ui.grooves) ui.grooves.style.display = 'none';
                    ui.bg.style.backgroundImage = "";
                    body.classList.remove('has-album-art');
                }
                updateControls();
                setTimeout(updateMarqueeOffsets, 50);
            }

            function updateControls() {
                const isPlaying = Spicetify.Player.isPlaying();
                popIcon(ui.btnPlay, isPlaying ? ICONS.pause : ICONS.play);
                ui.img.classList.toggle('is-playing', isPlaying);
                ui.img.classList.toggle('paused', !isPlaying);
                if (ui.grooves) ui.grooves.classList.toggle('paused', !isPlaying);
                if (ui.eq) ui.eq.classList.toggle('is-playing', isPlaying);

                ui.btnShuffle.classList.toggle('active', !!Spicetify.Player.getShuffle());
                const repeatMode = Spicetify.Player.getRepeat();
                ui.btnRepeat.classList.toggle('active', repeatMode !== 0);

                const liked = isCurrentTrackLiked();
                ui.btnHeart.innerHTML = liked ? ICONS.heartFilled : ICONS.heart;
                ui.btnHeart.classList.toggle('active', liked);
            }

            function updateProgress() {
                if (!pipWindow) return;
                if (ui.getIsScrubbing && ui.getIsScrubbing()) return;
                const progress = Spicetify.Player.getProgress();
                const duration = Spicetify.Player.getDuration();
                const ratio = duration > 0 ? progress / duration : 0;
                ui.progressFill.style.transform = `scaleX(${ratio})`;
                if (ui.timeCur) ui.timeCur.innerText = formatTime(progress);
                if (ui.timeDur) ui.timeDur.innerText = formatTime(duration);
            }

            updateTrack();

            Spicetify.Player.addEventListener('songchange', updateTrack);
            Spicetify.Player.addEventListener('onplaypause', updateControls);
            Spicetify.Player.addEventListener('appchange', updateControls);

            clearInterval(progressInterval);
            updateProgress();
            progressInterval = setInterval(updateProgress, 250);

            pipWindow.addEventListener('pagehide', () => {
                Spicetify.Player.removeEventListener('songchange', updateTrack);
                Spicetify.Player.removeEventListener('onplaypause', updateControls);
                Spicetify.Player.removeEventListener('appchange', updateControls);
                clearInterval(progressInterval);
            });
        }

        let volHudTimeout;
        function showVolumeHUD(win, ui, vol) {
            const hud = ui.volHud || win.document.getElementById('volume-hud');
            const text = win.document.getElementById('volume-text');
            if (!hud || !text) return;
            const pct = Math.round(vol * 100);
            text.innerText = `${pct}%`;
            hud.classList.add('visible');
            clearTimeout(volHudTimeout);
            volHudTimeout = setTimeout(() => hud.classList.remove('visible'), 1200);
        }

        // --- Keyboard controls inside the popout ---
        let lastVolume = 0.5;
        function setupKeyboard(win, ui) {
            win.document.addEventListener('keydown', (e) => {
                switch (e.key) {
                    case ' ':
                        e.preventDefault();
                        Spicetify.Player.togglePlay();
                        break;
                    case 'ArrowLeft':
                        e.preventDefault();
                        Spicetify.Player.seek(Math.max(0, Spicetify.Player.getProgress() - 5000));
                        break;
                    case 'ArrowRight':
                        e.preventDefault();
                        Spicetify.Player.seek(Math.min(Spicetify.Player.getDuration(), Spicetify.Player.getProgress() + 5000));
                        break;
                    case 'ArrowUp':
                        e.preventDefault();
                        Spicetify.Player.setVolume(Math.min(1, Spicetify.Player.getVolume() + 0.05));
                        showVolumeHUD(win, ui, Spicetify.Player.getVolume());
                        break;
                    case 'ArrowDown':
                        e.preventDefault();
                        Spicetify.Player.setVolume(Math.max(0, Spicetify.Player.getVolume() - 0.05));
                        showVolumeHUD(win, ui, Spicetify.Player.getVolume());
                        break;
                    case 'm':
                    case 'M':
                        e.preventDefault();
                        const curV = Spicetify.Player.getVolume();
                        if (curV > 0) {
                            lastVolume = curV;
                            Spicetify.Player.setVolume(0);
                            showVolumeHUD(win, ui, 0);
                        } else {
                            Spicetify.Player.setVolume(lastVolume || 0.5);
                            showVolumeHUD(win, ui, lastVolume || 0.5);
                        }
                        break;
                    case 'j':
                    case 'J':
                        e.preventDefault();
                        Spicetify.Player.back();
                        break;
                    case 'k':
                    case 'K':
                        e.preventDefault();
                        Spicetify.Player.next();
                        break;
                    case 'l':
                    case 'L':
                        e.preventDefault();
                        toggleHeart(ui.btnHeart);
                        break;
                    case 's':
                    case 'S':
                        e.preventDefault();
                        Spicetify.Player.toggleShuffle();
                        break;
                    case 'r':
                    case 'R':
                        e.preventDefault();
                        Spicetify.Player.toggleRepeat();
                        break;
                }
            });
        }

        // --- Dynamic Marquee Offset Calculator ---
        function updateMarqueeOffsets() {
            if (!pipWindow) return;
            const titleEl = pipWindow.document.getElementById('title');
            const artistEl = pipWindow.document.getElementById('artist');
            if (!titleEl || !artistEl) return;

            const titleContainer = titleEl.parentElement;
            const artistContainer = artistEl.parentElement;

            if (titleContainer && artistContainer && titleContainer.clientWidth > 0 && artistContainer.clientWidth > 0) {
                const titleContainerWidth = titleContainer.clientWidth;
                const titleScrollWidth = titleEl.scrollWidth;

                if (titleScrollWidth > titleContainerWidth) {
                    const fadeWidth = titleContainerWidth * 0.1;
                    const titleOffset = titleScrollWidth - titleContainerWidth + fadeWidth + 4;
                    titleEl.style.setProperty('--scroll-offset', `-${titleOffset}px`);
                    titleEl.classList.add('scroll');
                } else {
                    titleEl.style.setProperty('--scroll-offset', '0px');
                    titleEl.classList.remove('scroll');
                }

                const artistContainerWidth = artistContainer.clientWidth;
                const artistScrollWidth = artistEl.scrollWidth;

                if (artistScrollWidth > artistContainerWidth) {
                    const fadeWidth = artistContainerWidth * 0.1;
                    const artistOffset = artistScrollWidth - artistContainerWidth + fadeWidth + 4;
                    artistEl.style.setProperty('--scroll-offset', `-${artistOffset}px`);
                    artistEl.classList.add('scroll');
                } else {
                    artistEl.style.setProperty('--scroll-offset', '0px');
                    artistEl.classList.remove('scroll');
                }
            }
        }

        function setupInteractivity(win, ui) {
            let resizeHandler;
            let resizeSaveTimer = null;
            let animationFrameId = null;
            let isAnimating = false;
            let dragStartX = 0, dragStartY = 0, winStartX = 0, winStartY = 0;
            let dragActivated = false;   // becomes true only after real movement
            let dragWasExpanded = false; // whether a collapse is owed on drag start

            let isProgrammaticResize = false;
            let programmaticResizeTimer = null;

            function setWindowSize(targetW, targetH, inverted = false) {
                isAnimating = true;
                isProgrammaticResize = true;
                clearTimeout(programmaticResizeTimer);

                const currentW = win.outerWidth;
                const currentH = win.outerHeight;
                const deltaH = targetH - currentH;

                if (inverted && deltaH !== 0) {
                    win.moveTo(win.screenX, win.screenY - deltaH);
                }
                win.resizeTo(targetW, targetH);

                setTimeout(() => {
                    isAnimating = false;
                    updateMarqueeOffsets();
                    programmaticResizeTimer = setTimeout(() => {
                        isProgrammaticResize = false;
                    }, 400);
                }, 150);
            }

            // Mouse wheel volume control anywhere on the popout
            win.addEventListener('wheel', (e) => {
                e.preventDefault();
                const currentVol = Spicetify.Player.getVolume();
                const step = e.deltaY < 0 ? 0.05 : -0.05;
                const newVol = Math.max(0, Math.min(1, currentVol + step));
                Spicetify.Player.setVolume(newVol);
                showVolumeHUD(win, ui, newVol);
            }, { passive: false });

            let hoverTimeout;
            let isMouseInside = false;

            const handleMouseEnter = () => {
                if (isDragging || (ui.getIsScrubbing && ui.getIsScrubbing())) return;
                isMouseInside = true;
                clearTimeout(hoverTimeout);
                hoverTimeout = setTimeout(() => {
                    if (!pipWindow || pipWindow.closed) return;
                    if (!isMouseInside) return;
                    isExpanded = true;
                    const isBottomHalf = win.screenY > (screen.availHeight / 2);

                    ui.container.classList.toggle('inverted', isBottomHalf);
                    ui.container.classList.add('expanded');

                    setWindowSize(expandedW, expandedH, isBottomHalf);
                }, 100);
            };

            const handleMouseLeave = (force = false) => {
                if (isDragging || (ui.getIsScrubbing && ui.getIsScrubbing())) return;
                clearTimeout(hoverTimeout);

                const executeCollapse = () => {
                    if (!pipWindow || pipWindow.closed) return;
                    if (isMouseInside && !force) return;

                    isExpanded = false;
                    const isBottomHalf = ui.container.classList.contains('inverted');
                    ui.container.classList.remove('expanded');

                    setWindowSize(collapsedW, collapsedH, isBottomHalf);
                };

                if (force) {
                    executeCollapse();
                } else {
                    hoverTimeout = setTimeout(executeCollapse, 150);
                }
            };

            const onMouseLeaveEvent = (e) => {
                if (e && e.relatedTarget && win.document.contains(e.relatedTarget)) {
                    return;
                }
                isMouseInside = false;
                handleMouseLeave();
            };

            win.document.documentElement.addEventListener('mouseenter', handleMouseEnter);
            win.document.documentElement.addEventListener('mouseleave', onMouseLeaveEvent);
            win.document.addEventListener('mouseleave', onMouseLeaveEvent);

            win.document.addEventListener('mousemove', (e) => {
                if (e.clientX < 0 || e.clientX > win.innerWidth || e.clientY < 0 || e.clientY > win.innerHeight) {
                    isMouseInside = false;
                    handleMouseLeave();
                } else {
                    if (!isMouseInside) {
                        isMouseInside = true;
                        if (!isExpanded) handleMouseEnter();
                    }
                }
            });

            win.document.addEventListener('mouseout', (e) => {
                if (!e.relatedTarget && !e.toElement) {
                    isMouseInside = false;
                    handleMouseLeave();
                }
            });

            win.addEventListener('blur', () => {
                isDragging = false;
                setTimeout(() => {
                    if (!win || win.closed) return;
                    const isHovered = win.document.querySelector(':hover');
                    if (!isHovered) {
                        isMouseInside = false;
                        handleMouseLeave(true);
                    }
                }, 120);
            });

            // Periodic fallback check to catch missed fast cursor exits
            const hoverCheckInterval = setInterval(() => {
                if (win && win.document && isExpanded && !isDragging && !(ui.getIsScrubbing && ui.getIsScrubbing())) {
                    const isHovered = win.document.querySelector(':hover');
                    if (!isHovered || !isMouseInside) {
                        isMouseInside = false;
                        handleMouseLeave(true);
                    }
                }
            }, 250);

            win.addEventListener("pagehide", () => {
                clearInterval(hoverCheckInterval);
            });

            // --- Dragging Logic ---
            // A plain click must NOT yank the window: dragging (with its
            // collapse + recenter) only kicks in after ~6px of movement.
            win.document.addEventListener('mousedown', (e) => {
                const interactive = e.target.closest('button, #progress-bar-bg, #progress-bar-fill, .control-btn');
                if (interactive) return;

                isDragging = true;
                dragActivated = false;
                dragWasExpanded = false;

                clearTimeout(hoverTimeout);
                dragStartX = e.screenX;
                dragStartY = e.screenY;
                winStartX = win.screenX;
                winStartY = win.screenY;

                win.document.addEventListener('mousemove', onDrag);
                win.document.addEventListener('mouseup', onDragEnd);
                win.addEventListener('mouseup', onDragEnd);
            });

            function beginActualDrag() {
                dragActivated = true;
                dragWasExpanded = isExpanded || (win.outerHeight > collapsedH + 5);

                isAnimating = false;
                if (resizeHandler) win.removeEventListener("resize", resizeHandler);

                // Force collapsed state layout
                ui.container.classList.remove('expanded');
                isExpanded = false;

                if (dragWasExpanded) {
                    // Center the collapsed window under the mouse immediately
                    const cx = (dragStartX + (lastEventScreenX - dragStartX)) - collapsedW / 2;
                    const cy = (dragStartY + (lastEventScreenY - dragStartY)) - collapsedH / 2;
                    const newWinX = Math.round(cx);
                    const newWinY = Math.round(cy);

                    win.resizeTo(collapsedW, collapsedH);
                    win.moveTo(newWinX, newWinY);

                    winStartX = newWinX;
                    winStartY = newWinY;
                }
            }

            let lastEventScreenX = 0, lastEventScreenY = 0;

            function onDrag(e) {
                if (!isDragging) return;
                lastEventScreenX = e.screenX;
                lastEventScreenY = e.screenY;

                if (!dragActivated) {
                    const dx = e.screenX - dragStartX;
                    const dy = e.screenY - dragStartY;
                    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
                    beginActualDrag();
                }

                const deltaX = e.screenX - dragStartX;
                const deltaY = e.screenY - dragStartY;
                win.moveTo(winStartX + deltaX, winStartY + deltaY);
            }

            function onDragEnd(e) {
                const wasActivated = dragActivated;
                isDragging = false;
                dragActivated = false;
                win.document.removeEventListener('mousemove', onDrag);
                win.document.removeEventListener('mouseup', onDragEnd);
                win.removeEventListener('mouseup', onDragEnd);

                if (!wasActivated) return; // plain click – nothing moved

                // If mouse is still inside, expand again
                if (e.clientX >= 0 && e.clientX <= win.innerWidth && e.clientY >= 0 && e.clientY <= win.innerHeight) {
                    isMouseInside = true;
                    handleMouseEnter();
                } else {
                    isMouseInside = false;
                    handleMouseLeave(true);
                }
            }

            // --- Resizing Logic ---
            resizeHandler = () => {
                if (isAnimating || isDragging || isProgrammaticResize) return;

                let currentW = win.outerWidth;
                let currentH = win.outerHeight;

                lastManualResizeTime = performance.now();

                if (isExpanded) {
                    expandedW = currentW;
                    expandedH = currentH;
                    collapsedW = currentW; // Width is always identical

                    const scaleH = expandedH / defaultExpandedH;
                    collapsedH = Math.max(40, Math.round(defaultCollapsedH * scaleH));
                } else {
                    collapsedW = currentW;
                    collapsedH = currentH;
                    expandedW = currentW; // Width is always identical

                    const scaleH = collapsedH / defaultCollapsedH;
                    expandedH = Math.max(60, Math.round(defaultExpandedH * scaleH));
                }
                win.document.documentElement.style.setProperty('--collapsed-h', `${collapsedH}px`);
                win.document.documentElement.style.setProperty('--expanded-h', `${expandedH}px`);

                updateMarqueeOffsets();

                if (resizeSaveTimer) clearTimeout(resizeSaveTimer);
                resizeSaveTimer = setTimeout(saveSizes, 500);
            };

            // Bind initial resize listener
            win.addEventListener("resize", resizeHandler);
        }


        const PIP_SELECTORS = [
            '.main-nowPlayingBar-pictureInPictureButton',
            'button[data-testid="pip-button"]',
            'button[aria-label*="Picture-in-picture"]',
            'button[aria-label*="picture-in-picture"]',
            'button[aria-label*="Miniplayer"]',
            'button[aria-label*="miniplayer"]'
        ];

        const handlePipClick = (e) => {
            const target = e.target;
            if (!target) return;
            for (const selector of PIP_SELECTORS) {
                const btn = target.closest(selector);
                if (btn) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    togglePiP();
                    return;
                }
            }
        };

        // Intercept clicks in capture phase so Spotify's native PiP listener never executes
        // and React's virtual DOM tree is preserved intact.
        window.addEventListener('click', handlePipClick, true);

        if (Spicetify.Topbar) {
            new Spicetify.Topbar.Button("Modern Popout", "mini-player", togglePiP);
        }
        if (Spicetify.Menu) {
            new Spicetify.Menu.Item("Modern Popout", false, togglePiP).register();
        }

        console.log("Modern Popout: Loaded successfully!");
    } catch (err) {
        console.error("Modern Popout startup error details: ", err);
        if (window.Spicetify && Spicetify.showNotification) {
            Spicetify.showNotification("Modern Popout startup error: " + err.message);
        }
    }
})();
