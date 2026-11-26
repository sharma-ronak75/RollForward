
const prog = $('#progress');
let progTimer;
function progress(state) {
    if (!prog || REDUCED) {
        return;
    }
    clearTimeout(progTimer);
    if (state === 'start') {
        prog.className = '';
        void prog.offsetWidth;
        prog.className = 'run';
    }
    else {
        prog.className = 'done';
        progTimer = setTimeout(() => {
            prog.className = '';
        }, UI_TIMINGS.progressCompletionMs);
    }
}


function stagger(els) {
    els.forEach((el, i) => {
        el.style.setProperty('--i', Math.min(i, UI_LIMITS.maximumStaggerIndex));
        el.classList.add('fx-in');
    });
}
function fxIn(root, tops) {
    if (REDUCED) {
        return;
    }
    const grids = $$('.grid, .steps, .stats', root);
    const skip = new Set(grids);
    stagger(tops.filter(el => {
        return !skip.has(el);
    }));
    grids.forEach(g => {
        return stagger([...g.children]);
    });
}
function countUp(root) {
    $$('[data-count]', root).forEach(el => {
        const end = Number(el.dataset.count);
        const isMoney = !!el.dataset.money;
        if (REDUCED || !end) {
            return;
        }
        const t0 = performance.now();
        const dur = UI_TIMINGS.countUpAnimationMs;
        const draw = v => {
            el.textContent = isMoney ? money(v) : v.toLocaleString('en-IN');
        };
        draw(0);
        const tick = now => {
            const k = Math.min(1, (now - t0) / dur);
            const e = 1 - Math.pow(1 - k, 3);
            draw(Math.round(end * e));
            if (k < 1) {
                requestAnimationFrame(tick);
            }
        };
        requestAnimationFrame(tick);
    });
}
function pageFx() {
    main.classList.add('page-enter');
    fxIn(main, $$(':scope > .page > *, :scope > .hero .wrap > *', main).filter(el => {
        return el.id !== 'tab-body';
    }));
    countUp(main);
}
function tabFx(body) {
    fxIn(body, [...body.children]);
    countUp(body);
}


const RIPPLE = '.btn, .chip, .tabs button, .nav a, .opt, .seg button, .qchip';
document.addEventListener('pointerdown', e => {
    if (REDUCED) {
        return;
    }
    const host = e.target.closest(RIPPLE);
    if (host && !host.disabled) {
        const r = host.getBoundingClientRect();
        const size = Math.max(r.width, r.height) * 2;
        const dot = document.createElement('span');
        dot.className = 'ripple';
        dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
        host.append(dot);
        setTimeout(() => {
            return dot.remove();
        }, UI_TIMINGS.rippleDurationMs);
    }
    if (e.target.closest('.btn:not(.btn-ghost):not(.btn-sm), .qchip')) {
        sparks(e.clientX, e.clientY);
    }
});
function sparks(x, y) {
    const colors = [
        '#ffc928',
        '#1b78d6',
        '#13b36a',
        '#ff6b6b',
        '#0fb5c9'
    ];
    for (let i = 0; i < UI_LIMITS.sparkCount; i++) {
        const d = document.createElement('i');
        const a = (Math.PI * 2 * i) / UI_LIMITS.sparkCount + Math.random() * .5;
        const dist = EFFECTS.sparkMinimumDistancePx + Math.random() * EFFECTS.sparkDistanceRangePx;
        d.className = 'spark';
        d.style.cssText = `left:${x}px;top:${y}px;background:${colors[i % colors.length]};--dx:${Math.cos(a) * dist}px;--dy:${Math.sin(a) * dist}px`;
        document.body.append(d);
        setTimeout(() => {
            return d.remove();
        }, UI_TIMINGS.sparkDurationMs);
    }
}


let confettiRaf = 0;
function confetti(canvas) {
    if (REDUCED) {
        return;
    }
    const dpr = Math.min(UI_LIMITS.maxDevicePixelRatio, window.devicePixelRatio || 1);
    const W = canvas.width = innerWidth * dpr;
    const H = canvas.height = innerHeight * dpr;
    const ctx = canvas.getContext('2d');
    const colors = [
        '#ffc928',
        '#1b78d6',
        '#13b36a',
        '#ff6b6b',
        '#8a52d0',
        '#0fb5c9',
        '#ffffff'
    ];
    const parts = [];
    const burst = (x, y, n, spread, power, angle) => {
        for (let i = 0; i < n; i++) {
            const a = angle + (Math.random() - .5) * spread;
            const sp = (power * .45 + Math.random() * power * .55) * dpr;
            parts.push({
                x,
                y,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp,
                w: (EFFECTS.confettiPieceMinimumWidthPx + Math.random() * EFFECTS.confettiPieceWidthRangePx) * dpr,
                h: (EFFECTS.confettiPieceMinimumHeightPx + Math.random() * EFFECTS.confettiPieceHeightRangePx) * dpr,
                rot: Math.random() * Math.PI * 2,
                vr: (Math.random() - .5) * .35,
                c: colors[(Math.random() * colors.length) | 0],
                round: Math.random() < .3,
                life: 0,
                wob: Math.random() * Math.PI * 2
            });
        }
    };
    burst(W / 2, H * 0.36, UI_LIMITS.primaryConfettiCount, Math.PI * 2, 17, 0);
    setTimeout(() => {
        burst(0, H * 0.85, UI_LIMITS.secondaryConfettiCount, 0.9, 26, -Math.PI / 3);
        burst(W, H * 0.85, UI_LIMITS.secondaryConfettiCount, 0.9, 26, -Math.PI * 2 / 3);
    }, UI_TIMINGS.confettiSecondBurstDelayMs);
    cancelAnimationFrame(confettiRaf);
    const frame = () => {
        ctx.clearRect(0, 0, W, H);
        let alive = 0;
        for (const p of parts) {
            p.life++;
            p.vy += EFFECTS.confettiGravity * dpr;
            p.vx *= EFFECTS.confettiFriction;
            p.vy *= EFFECTS.confettiFriction;
            p.x += p.vx + Math.sin(p.life * EFFECTS.confettiWobbleSpeed + p.wob) * EFFECTS.confettiWobbleDistance * dpr;
            p.y += p.vy;
            p.rot += p.vr;
            if (p.y > H + 40 || p.life > UI_LIMITS.maximumConfettiAgeFrames) {
                continue;
            }
            alive++;
            ctx.save();
            ctx.globalAlpha = Math.min(1, (UI_LIMITS.maximumConfettiAgeFrames - p.life) / UI_LIMITS.confettiFadeFrames);
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.c;
            if (p.round) {
                ctx.beginPath();
                ctx.arc(0, 0, p.h * .6, 0, 6.28);
                ctx.fill();
            } else {
                ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            }
            ctx.restore();
        }
        if (alive) {
            confettiRaf = requestAnimationFrame(frame);
        } else {
            ctx.clearRect(0, 0, W, H);
        }
    };
    confettiRaf = requestAnimationFrame(frame);
}


let modalState = null;
const wait = ms => {
    return new Promise(r => {
        return setTimeout(r, ms);
    });
};
function closeModal() {
    if (!modalState || !modalState.ready) {
        return;
    }
    const { root, prev, onClose, resolve, pay } = modalState;
    modalState = null;
    if (pay) {
        pay.resolve(false);
    }
    cancelAnimationFrame(confettiRaf);
    root.classList.add('closing');
    setTimeout(() => {
        root.className = 'modal-root';
        root.innerHTML = '';
        document.body.classList.remove('modal-open');
    }, REDUCED ? 0 : UI_TIMINGS.modalClosingMs);
    if (prev && prev.focus) {
        prev.focus({ preventScroll: true });
    }
    if (onClose && !pay) {
        setTimeout(onClose, UI_TIMINGS.modalCloseCallbackMs);
    }
    resolve();
}
function upiLink({ amount, ref }) {
    const params = [
        `pa=${encodeURIComponent(PAYMENT.upiId).replace(/%40/g, '@')}`,
        `pn=${encodeURIComponent(PAYMENT.payeeName)}`,
        `am=${Number(amount).toFixed(2)}`,
        'cu=INR',
        `tn=${encodeURIComponent(`${PAYMENT.payeeName} ${ref}`)}`,
    ];
    return `upi://pay?${params.join('&')}`;
}
// Shows a scannable payment QR and resolves true once payment is confirmed,
// or false if the person closes the popup first.
function awaitPayment(body, box, payment) {
    body.innerHTML = `<div class="m-stage m-pay">
    <h2 id="m-title">Scan to pay</h2>
    <div class="m-big">${num(payment.amount, true)}</div>
    <div class="m-qr">${qrSvg(upiLink(payment), { label: `UPI payment QR code for ${money(payment.amount)}` })}</div>
    <p class="muted m-pay-note">Pay using UPI</p>
    <div class="m-ref">Reference <b>${esc(payment.ref)}</b></div>
    <div class="row" style="justify-content:center"><button class="btn btn-ghost" data-act="close-modal">Cancel</button></div></div>`;
    countUp(body);
    box.focus({ preventScroll: true });
    return new Promise(resolve => {
        modalState.ready = true;
        modalState.pay = { resolve };
    });
}
function confirmPayment() {
    const { pay } = modalState;
    modalState.pay = null;
    modalState.ready = false;
    pay.resolve(true);
}
async function celebrate(cfg) {
    const root = $('#modal-root');
    const prev = document.activeElement;
    document.body.classList.add('modal-open');
    const step = (label, i) => {
        return `<li style="--i:${i}"><i></i>${esc(label)}</li>`;
    };
    root.className = 'modal-root open';
    root.innerHTML = `<div class="modal-backdrop" data-act="backdrop"></div><canvas class="confetti" aria-hidden="true"></canvas>
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title" tabindex="-1"><div class="modal-glow" aria-hidden="true"></div><div id="m-body"></div></div>`;
    const body = $('#m-body', root);
    const box = $('.modal', root);
    const done = new Promise(resolve => {
        modalState = {
            root,
            prev,
            resolve,
            onClose: cfg.onClose,
            ready: false
        };
    });
    if (cfg.payment) {
        const paid = await awaitPayment(body, box, cfg.payment);
        if (!paid) {
            return done;
        }
        if (cfg.onPaid) {
            cfg.onPaid();
        }
    }
    body.innerHTML = `<div class="m-stage" role="status"><div class="m-spin" aria-hidden="true"><i></i><i></i><i></i><svg viewBox="0 0 40 40"><rect x="10" y="18" width="20" height="14" rx="3"/><path d="M14 18v-4a6 6 0 0 1 12 0v4"/></svg></div>
    <h2 id="m-title">${esc(cfg.processing.title)}</h2><p class="muted">${esc(cfg.processing.note)}</p>
    <ul class="m-steps">${cfg.processing.steps.map(step).join('')}</ul></div>`;
    box.focus({ preventScroll: true });
    await wait(REDUCED ? UI_TIMINGS.processingReducedMotionMs : UI_TIMINGS.processingDurationMs);
    if (!modalState) {
        return;
    }
    const sparksHtml = Array.from({ length: UI_LIMITS.celebrationSparkCount }, (_, i) => {
        return `<i style="--a:${i * (UI_GEOMETRY.hueDegrees / UI_LIMITS.celebrationSparkCount)}deg;--c:${[
            '#ffc928',
            '#1b78d6',
            '#13b36a',
            '#ff6b6b',
            '#8a52d0'
        ][i % 5]}"></i>`;
    }).join('');
    body.innerHTML = `<div class="m-stage m-done">
    <div class="m-badge"><span class="m-sparks" aria-hidden="true">${sparksHtml}</span><svg viewBox="0 0 52 52" aria-hidden="true"><circle class="m-circle" cx="26" cy="26" r="24"/><path class="m-tick" d="M14 27l8 8 16-17"/></svg></div>
    <h2 id="m-title">${esc(cfg.title)}</h2>
    <div class="m-big">${num(cfg.big, !!cfg.bigMoney)}${cfg.bigSuffix ? `<small>${esc(cfg.bigSuffix)}</small>` : ''}</div>
    <p class="muted" style="margin:0 0 .8rem">${esc(cfg.sub)}</p>
    <ul class="m-lines">${cfg.lines.slice(0, UI_LIMITS.maximumCelebrationLines).map((l, i) => {
        return `<li style="--i:${i}">${esc(l)}</li>`;
    }).join('')}${cfg.lines.length > UI_LIMITS.maximumCelebrationLines ? `<li style="--i:5">+ ${cfg.lines.length - UI_LIMITS.maximumCelebrationLines} more</li>` : ''}</ul>
    <div class="m-ref">${esc(cfg.refLabel)} <b>${esc(cfg.ref)}</b></div>
    <div class="row" style="justify-content:center"><button class="btn btn-accent" data-act="close-modal">Done</button></div></div>`;
    modalState.ready = true;
    countUp(body);
    confetti($('.confetti', root));
    $('[data-act=close-modal]', root).focus({ preventScroll: true });
    return done;
}
document.addEventListener('click', e => {
    if (e.target.dataset && e.target.dataset.act === 'backdrop') {
        closeModal();
    }
});
document.addEventListener('keydown', e => {
    if (!modalState) {
        return;
    }
    if (e.key === 'Escape') {
        closeModal();
        return;
    }
    if (modalState.pay && PAYMENT.simulateWithSpace && (e.key === ' ' || e.code === 'Space')) {
        e.preventDefault();
        if (!e.repeat) {
            confirmPayment();
        }
        return;
    }
    if (e.key === 'Tab') {
        const f = $$('button, a[href]', $('.modal', modalState.root));
        if (f.length) {
            e.preventDefault();
            f[0].focus();
        } else {
            e.preventDefault();
        }
    }
});


const rootEl = document.documentElement;
let fontSize = Number(store.get('rf-font')) || UI_LIMITS.defaultFontSizePx;
const applyFont = () => {
    rootEl.style.setProperty('--fs', fontSize + 'px');
    store.set('rf-font', fontSize);
};
$('#text-larger').addEventListener('click', () => {
    fontSize = Math.min(UI_LIMITS.maximumFontSizePx, fontSize + UI_LIMITS.fontSizeStepPx);
    applyFont();
});
$('#text-smaller').addEventListener('click', () => {
    fontSize = Math.max(UI_LIMITS.minimumFontSizePx, fontSize - UI_LIMITS.fontSizeStepPx);
    applyFont();
});
function setContrast(on) {
    if (on) {
        rootEl.dataset.hc = '1';
    } else {
        delete rootEl.dataset.hc;
    }
    $('#contrast-toggle').setAttribute('aria-pressed', String(on));
    store.set('rf-hc', on ? '1' : '0');
}
$('#contrast-toggle').addEventListener('click', () => {
    return setContrast(rootEl.dataset.hc !== '1');
});
$('#theme-toggle').addEventListener('click', () => {
    const dark = rootEl.dataset.theme ? rootEl.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    rootEl.dataset.theme = dark ? 'light' : 'dark';
    store.set('rf-theme', rootEl.dataset.theme);
});
$('#menu-btn').addEventListener('click', () => {
    const open = $('#nav').classList.toggle('open');
    $('#menu-btn').setAttribute('aria-expanded', String(open));
});
applyFont();
if (store.get('rf-hc') === '1') {
    setContrast(true);
}
if (store.get('rf-theme')) {
    rootEl.dataset.theme = store.get('rf-theme');
}


(async function init() {
    try {
        [app.cat, app.me] = await Promise.all([api('/catalogue'), api('/me')]);
    }
    catch (error) {
        main.innerHTML = `<div class="page empty"><h1>Cannot reach the server</h1><p>${esc(error.message)}</p></div>`;
        return;
    }
    route();
})();
