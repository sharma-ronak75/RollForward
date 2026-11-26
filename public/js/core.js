'use strict';



const $ = (s, r = document) => {
    return r.querySelector(s);
};
const $$ = (s, r = document) => {
    return [...r.querySelectorAll(s)];
};
const esc = t => {
    return String(t ?? '').replace(/[&<>"']/g, c => {
        return ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[c]);
    });
};
const money = n => {
    return '₹' + Number(n).toLocaleString('en-IN');
};
const first = name => {
    return String(name).split(/[ ,]/)[0];
};
const fmtDate = iso => {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};
const fmtDay = d => {
    return new Date(d + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

const num = (n, isMoney = true, cls = '') => {
    return `<span ${cls ? `class="${cls}"` : ''} data-count="${Number(n)}" ${isMoney ? 'data-money="1"' : ''}>${isMoney ? money(n) : Number(n).toLocaleString('en-IN')}</span>`;
};
const store = {
    get(k) {
        try {
            return localStorage.getItem(k);
        } catch (e) {
            return null;
        }
    },
    set(k, v) {
        try {
            localStorage.setItem(k, v);
        } catch (e) { /* storage blocked */ }
    },
};

async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch('/api' + path, {
        method,
        credentials: 'same-origin',
        headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
        body: method === 'GET' ? undefined : JSON.stringify(body || {}),
    });
    let data = null;
    try {
        data = await res.json();
    } catch (e) { /* empty body */ }
    if (!res.ok) {
        const err = new Error((data && data.error) || 'Something went wrong.');
        err.fields = (data && data.fields) || {};
        err.status = res.status;
        throw err;
    }
    return data;
}

function toast(message, bad = false) {
    const el = document.createElement('div');
    el.className = 'toast' + (bad ? ' bad' : '');
    el.textContent = message;
    $('#toasts').append(el);
    setTimeout(() => {
        return el.remove();
    }, UI_TIMINGS.toastDurationMs);
}


const fld = (name, label, o = {}) => {
    const { type = 'text', value = '', rows = 0, hint = '', auto = '', min, max } = o;
    const control = rows
        ? `<textarea name="${name}" rows="${rows}">${esc(value)}</textarea>`
        : `<input name="${name}" type="${type}" value="${esc(value)}" autocomplete="${auto}" ${min != null ? `min="${min}"` : ''} ${max != null ? `max="${max}"` : ''}>`;
    return `<div><label class="fld"><span>${label}${hint ? ` <small>${hint}</small>` : ''}</span>${control}</label><p class="err" data-err="${name}"></p></div>`;
};
const sel = (name, label, choices, selected = '') => {
    return `<div><label class="fld"><span>${label}</span><select name="${name}">${choices.map(c => {
        const [v, t] = Array.isArray(c) ? c : [c, c];
        return `<option value="${esc(v)}" ${String(v) === String(selected) ? 'selected' : ''}>${esc(t)}</option>`;
    }).join('')}</select></label><p class="err" data-err="${name}"></p></div>`;
};
const chk = (name, label, o = {}) => {
    return `<div><label class="check"><input type="checkbox" name="${name}" ${o.checked ? 'checked' : ''} ${o.value ? `value="${esc(o.value)}" data-multi="1"` : ''}><span>${label}</span></label><p class="err" data-err="${name}"></p></div>`;
};

const addressLine = a => {
    return (a ? [
        a.line1,
        a.line2,
        a.city,
        a.state,
        a.postcode,
        a.country
    ].filter(Boolean).join(', ') : '');
};
const contactBlock = (title, hint = '') => {
    return `<fieldset class="addr"><legend>${title}</legend>${hint ? `<p class="small muted" style="margin:0">${hint}</p>` : ''}
  <div class="grid2">${fld('phone', 'Contact number', { type: 'tel', auto: 'tel', hint: 'with country code' })}<div></div></div>
  ${fld('line1', 'Street address', { auto: 'address-line1' })}${fld('line2', 'Apartment, building or landmark (optional)', { auto: 'address-line2' })}
  <div class="grid2">${fld('city', 'City', { auto: 'address-level2' })}${fld('state', 'State / region', { auto: 'address-level1' })}${fld('postcode', 'Postal / ZIP code', { auto: 'postal-code' })}${fld('country', 'Country', { auto: 'country-name' })}</div></fieldset>`;
};

function formValues(form) {
    const out = {};
    for (const el of form.elements) {
        if (!el.name) {
            continue;
        }
        if (el.type === 'checkbox') {
            if (el.dataset.multi) {
                out[el.name] = out[el.name] || [];
                if (el.checked) {
                    out[el.name].push(el.value);
                }
            } else {
                out[el.name] = el.checked;
            }
        } else if (el.type === 'radio') {
            if (el.checked) {
                out[el.name] = el.value;
            }
        } else {
            out[el.name] = el.value;
        }
    }
    return out;
}
function showErrors(form, fields = {}) {
    $$('[data-err]', form).forEach(p => {
        p.textContent = fields[p.dataset.err] || '';
    });
    const firstBad = Object.keys(fields)[0];
    const el = firstBad && form.elements[firstBad];
    if (el && el.focus) {
        el.focus();
    }
}


const app = { me: null, cat: null };
const main = $('#main');
const avatarColor = id => {
    return `hsl(${(id * UI_GEOMETRY.avatarHueMultiplier) % UI_GEOMETRY.hueDegrees} 55% 36%)`;
};
const avatar = b => {
    return `<div class="avatar" style="background:${avatarColor(b.id)}" aria-hidden="true">${esc(b.name[0])}</div>`;
};
const isAdmin = () => {
    return app.me && app.me.role === 'admin';
};

function wheelSvg() {
    const spokes = Array.from({ length: UI_GEOMETRY.wheelSpokeCount }, (_, index) => {
        return `<line x1="100" y1="100" x2="100" y2="14" transform="rotate(${index * (UI_GEOMETRY.hueDegrees / UI_GEOMETRY.wheelSpokeCount)} 100 100)"/>`;
    }).join('');
    return `<svg class="wheel" viewBox="0 0 200 200" fill="none" stroke="#fff" aria-hidden="true"><circle cx="100" cy="100" r="92" stroke-width="10"/><circle cx="100" cy="100" r="72" stroke-width="3"/><circle cx="100" cy="100" r="12" stroke-width="6"/><g stroke-width="2">${spokes}</g></svg>`;
}
const ring = percent => {
    const C = 2 * Math.PI * UI_GEOMETRY.wheelRadius;
    return `<svg class="ring" viewBox="0 0 110 110" role="img" aria-label="${percent}% of goal"><circle class="bg" cx="55" cy="55" r="45"/><circle class="fg" cx="55" cy="55" r="45" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - percent / 100)}"/></svg>`;
};
const bar = (percent, label) => {
    return `<div class="track" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(label)}"><div class="fill" style="width:${percent}%"></div></div>`;
};
const statusTag = s => {
    return `<span class="tag ${s === 'Delivered' ? 'ok' : s === 'Funded' ? 'ok' : s === 'Declined' ? 'err' : ''}">${esc(s)}</span>`;
};


function personCard(b) {
    const action = b.status === 'Seeking funds'
        ? `<a class="btn btn-sm" href="#/items/${b.id}">Fund</a>`
        : statusTag(b.status);
    return `<article class="card person">
    <div class="head">${avatar(b)}<div class="grow"><h3><a href="#/b/${b.id}">${esc(b.name)}</a></h3>
      <div class="age">Age: ${b.age}</div></div></div>
    <p class="meta">${esc(b.disability)} · ${esc(b.state)}</p>
    <strong>Needs: ${esc(b.aid)}</strong>
    <p class="muted">${esc(b.story)}</p>
    ${bar(b.percent, 'Funding for ' + b.name)}
    <div class="row between"><span class="small muted">${money(b.raised)} of ${money(b.cost)}${b.donors ? ` · ${b.donors} supporter${b.donors > 1 ? 's' : ''}` : ''}</span>${action}</div>
  </article>`;
}
