'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '₹' + Number(n).toLocaleString('en-IN');
const first = name => String(name).split(/[ ,]/)[0];
const fmtDate = iso => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const fmtDay = d => new Date(d + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

// number animation / transition
const num = (n, isMoney = true, cls = '') => `<span ${cls ? `class="${cls}"` : ''} data-count="${Number(n)}" ${isMoney ? 'data-money="1"' : ''}>${isMoney ? money(n) : Number(n).toLocaleString('en-IN')}</span>`;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* user is very mean and blocked the storage. im sad. */ } },
};

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method, credentials: 'same-origin',
    headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body || {}),
  });
  let data = null;
  try { data = await res.json(); } catch (e) { console.log(e) }
  if (!res.ok) { const err = new Error((data && data.error) || 'Something went wrong.'); err.fields = (data && data.fields) || {}; err.status = res.status; throw err; }
  return data;
}

function toast(message, bad = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (bad ? ' bad' : '');
  el.textContent = message;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 4200);
}

// form builder
const fld = (name, label, o = {}) => {
  const { type = 'text', value = '', rows = 0, hint = '', auto = '', min, max } = o;
  const control = rows
    ? `<textarea name="${name}" rows="${rows}">${esc(value)}</textarea>`
    : `<input name="${name}" type="${type}" value="${esc(value)}" autocomplete="${auto}" ${min != null ? `min="${min}"` : ''} ${max != null ? `max="${max}"` : ''}>`;
  return `<div><label class="fld"><span>${label}${hint ? ` <small>${hint}</small>` : ''}</span>${control}</label><p class="err" data-err="${name}"></p></div>`;
};
const sel = (name, label, choices, selected = '') =>
  `<div><label class="fld"><span>${label}</span><select name="${name}">${choices.map(c => {
    const [v, t] = Array.isArray(c) ? c : [c, c];
    return `<option value="${esc(v)}" ${String(v) === String(selected) ? 'selected' : ''}>${esc(t)}</option>`;
  }).join('')}</select></label><p class="err" data-err="${name}"></p></div>`;
const chk = (name, label, o = {}) =>
  `<div><label class="check"><input type="checkbox" name="${name}" ${o.checked ? 'checked' : ''} ${o.value ? `value="${esc(o.value)}" data-multi="1"` : ''}><span>${label}</span></label><p class="err" data-err="${name}"></p></div>`;

const addressLine = a => (a ? [a.line1, a.line2, a.city, a.state, a.postcode, a.country].filter(Boolean).join(', ') : '');
const contactBlock = (title, hint = '') => `<fieldset class="addr"><legend>${title}</legend>${hint ? `<p class="small muted" style="margin:0">${hint}</p>` : ''}
  <div class="grid2">${fld('phone', 'Contact number', { type: 'tel', auto: 'tel', hint: 'with country code' })}<div></div></div>
  ${fld('line1', 'Street address', { auto: 'address-line1' })}${fld('line2', 'Apartment, building or landmark (optional)', { auto: 'address-line2' })}
  <div class="grid2">${fld('city', 'City', { auto: 'address-level2' })}${fld('state', 'State / region', { auto: 'address-level1' })}${fld('postcode', 'Postal / ZIP code', { auto: 'postal-code' })}${fld('country', 'Country', { auto: 'country-name' })}</div></fieldset>`;

function formValues(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') {
      if (el.dataset.multi) { out[el.name] = out[el.name] || []; if (el.checked) out[el.name].push(el.value); } else out[el.name] = el.checked;
    } else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; } else out[el.name] = el.value;
  }
  return out;
}
function showErrors(form, fields = {}) {
  $$('[data-err]', form).forEach(p => { p.textContent = fields[p.dataset.err] || ''; });
  const firstBad = Object.keys(fields)[0];
  const el = firstBad && form.elements[firstBad];
  if (el && el.focus) el.focus();
}

// app state
const app = { me: null, cat: null };
const main = $('#main');
const avatarColor = id => `hsl(${(id * 47) % 360} 55% 36%)`;
const avatar = b => `<div class="avatar" style="background:${avatarColor(b.id)}" aria-hidden="true">${esc(b.name[0])}</div>`;
const isAdmin = () => app.me && app.me.role === 'admin';

function wheelSvg() {
  const spokes = Array.from({ length: 16 }, (_, i) => `<line x1="100" y1="100" x2="100" y2="14" transform="rotate(${i * 22.5} 100 100)"/>`).join('');
  return `<svg class="wheel" viewBox="0 0 200 200" fill="none" stroke="#fff" aria-hidden="true"><circle cx="100" cy="100" r="92" stroke-width="10"/><circle cx="100" cy="100" r="72" stroke-width="3"/><circle cx="100" cy="100" r="12" stroke-width="6"/><g stroke-width="2">${spokes}</g></svg>`;
}
const ring = percent => {
  const C = 2 * Math.PI * 45;
  return `<svg class="ring" viewBox="0 0 110 110" role="img" aria-label="${percent}% of goal"><circle class="bg" cx="55" cy="55" r="45"/><circle class="fg" cx="55" cy="55" r="45" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - percent / 100)}"/></svg>`;
};
const bar = (percent, label) => `<div class="track" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(label)}"><div class="fill" style="width:${percent}%"></div></div>`;
const statusTag = s => `<span class="tag ${s === 'Delivered' ? 'ok' : s === 'Funded' ? 'ok' : s === 'Declined' ? 'err' : ''}">${esc(s)}</span>`;

// views thingy
function personCard(b) {
  const action = b.status === 'Seeking funds'
    ? `<a class="btn btn-sm" href="#/give/${b.id}">Fund ${esc(first(b.name))}'s ${esc(b.aid.toLowerCase())}</a>`
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

async function viewHome() {
  const camp = await api('/campaign');
  main.innerHTML = `
  <section class="hero"><span class="orb o1"></span><span class="orb o2"></span><span class="orb o3"></span>${wheelSvg()}
    <div class="wrap">
      <div>
        <h1>Restoring mobility, independence and livelihoods</h1>
        <p class="lead">Roll Forward funds wheelchairs, tricycles, crutches, artificial limbs and white canes for low-income people with disabilities. Every aid is matched to a verified beneficiary and delivered through volunteers.</p>
        <div class="row"><a class="btn btn-accent" href="#/give">Sponsor an aid</a><a class="btn btn-light" href="#/directory">Meet the beneficiaries</a></div>
      </div>
      <div class="glass" aria-live="polite">
        <div class="ring-wrap">${ring(camp.percent)}<div><div class="small muted">Raised by this drive</div><div class="big">${num(camp.raised)}</div><div class="small muted">${camp.percent}% of ${money(camp.goal)} goal</div></div></div>
        <hr style="border:0;border-top:2px solid var(--line);margin:1rem 0">
        <div class="row between"><span><strong>${camp.seeking}</strong> beneficiaries seeking funds</span><span><strong>${money(camp.outstandingNeed)}</strong> still needed</span></div>
      </div>
    </div>
  </section>
  <div class="page">
    <h2>Working procedure</h2>
    <div class="steps" style="margin-top:1.4rem">
      <div class="card step flat"><h3>Verified first</h3><p class="muted">A clinic or NGO refers each person, and a coordinator completes a home or clinic assessment before they are listed.</p></div>
      <div class="card step flat"><h3>You choose</h3><p class="muted">Fund one specific beneficiary, pick an aid, or simply give any amount and we match it to the person closest to being funded.</p></div>
      <div class="card step flat"><h3>We deliver</h3><p class="muted">Once an aid is fully funded it is bought, assembled and delivered through a partner clinic.</p></div>
      <div class="card step flat"><h3>You see the result</h3><p class="muted">When an aid is delivered you get a dated update on your account, with the beneficiary's progress.</p></div>
    </div>
    <div class="band" style="margin-top:2.5rem"><div><h2 style="margin:0">Just ₹100 starts someone's journey</h2><p style="margin:.25rem 0 0">Every donation counts. Donate now!</p></div><div class="row"><a class="btn btn-accent" href="#/give/amount/100">Donate ₹100</a><a class="btn btn-light" href="#/items">Donate Us</a></div></div>
  </div>`;
}

const dirFilters = { q: '', disability: '', aid: '', sort: 'closest', hideFunded: false };

async function viewDirectory() {
  const cat = app.cat;
  main.innerHTML = `<div class="page"><h1 style="font-size:2rem">Vetted beneficiary requests</h1>
    <form class="filters" data-live-filter>
      ${fld('q', 'Search name, state or story', { value: dirFilters.q })}
      ${sel('disability', 'Disability type', [['', 'All'], ...cat.disabilities.filter(d => d !== 'Other')], dirFilters.disability)}
      ${sel('aid', 'Aid needed', [['', 'All'], ...Object.values(cat.aids).map(a => a.name)], dirFilters.aid)}
      ${sel('sort', 'Sort by', [['closest', 'Closest to funded'], ['least', 'Least funded'], ['cheapest', 'Lowest cost'], ['newest', 'Newest']], dirFilters.sort)}
    </form>
    <label class="check" style="margin:0 0 .5rem"><input type="checkbox" id="hide-funded" ${dirFilters.hideFunded ? 'checked' : ''}> <span>Hide fully funded</span></label>
    <p id="count" class="small muted" aria-live="polite"></p>
    <div id="list" class="grid"></div></div>`;
  const draw = async () => {
    const qs = new URLSearchParams({ q: dirFilters.q, disability: dirFilters.disability, aid: dirFilters.aid, sort: dirFilters.sort, hideFunded: dirFilters.hideFunded ? '1' : '' });
    const list = await api('/beneficiaries?' + qs);
    $('#count').textContent = `${list.length} ${list.length === 1 ? 'beneficiary' : 'beneficiaries'} shown`;
    $('#list').innerHTML = list.map(personCard).join('') || '<p class="empty" style="grid-column:1/-1">No matches. Clear a filter or try a different search.</p>';
    stagger(REDUCED ? [] : [...$('#list').children]);
  };
  let timer;
  const onChange = () => {
    const v = formValues($('[data-live-filter]'));
    Object.assign(dirFilters, { q: v.q, disability: v.disability, aid: v.aid, sort: v.sort, hideFunded: $('#hide-funded').checked });
    clearTimeout(timer); timer = setTimeout(() => draw().catch(e => toast(e.message, true)), 200);
  };
  $('[data-live-filter]').addEventListener('input', onChange);
  $('#hide-funded').addEventListener('change', onChange);
  await draw();
}

async function viewDetail(id) {
  let b;
  try { b = await api('/beneficiaries/' + id); } catch (e) { return notFound('That beneficiary could not be found.'); }
  main.innerHTML = `<div class="page"><p><a href="#/directory">← All beneficiaries</a></p>
    <div class="cols"><section class="stack">
      <div class="row">${avatar(b)}<div><h1 style="margin:0;font-size:2rem">${esc(b.name)}</h1><div class="age">Age: ${b.age}</div></div></div>
      <p class="meta">${esc(b.disability)} · ${esc(b.state)} ${statusTag(b.status)}</p>
      <p style="font-size:1.1rem">${esc(b.story)}</p>
      <h2>Updates</h2>
      ${b.updates.length ? `<ul class="timeline">${b.updates.map(u => `<li><strong>${fmtDate(u.at)}</strong><br>${esc(u.text)}</li>`).join('')}</ul>`
        : '<p class="muted">No updates yet. Donors are notified here when funding completes and the aid is delivered.</p>'}
    </section>
    <aside class="card stack"><h3>${esc(b.aid)}</h3>
      <div class="big">${money(b.raised)} <span class="small muted">of ${money(b.cost)}</span></div>
      ${bar(b.percent, 'Funding for ' + b.name)}
      <p class="small muted">${b.donors} supporter${b.donors === 1 ? '' : 's'} so far${b.remaining ? ` · ${money(b.remaining)} still needed` : ''}</p>
      ${b.status === 'Seeking funds' ? `<a class="btn btn-block" href="#/give/${b.id}">Fund ${esc(first(b.name))}'s aid</a>` : ''}
      <button class="btn btn-ghost btn-block" data-act="share" data-id="${b.id}" data-name="${esc(first(b.name))}">Share this page</button>
    </aside></div></div>`;
}

const optionCards = (cat, selected) => Object.entries(cat.aids).map(([key, o]) => `
  <label class="opt"><input type="radio" name="option" value="${key}" ${key === selected ? 'checked' : ''}><strong>${money(o.price)}</strong> ${esc(o.label)}<br><span class="small muted">${esc(o.note)}</span></label>`).join('');

function receiptHtml(r, { embedded = false } = {}) {
  return `<div class="receipt" role="status">
    <div class="row between"><h3 style="margin:0">${embedded ? `Thank you, ${esc(first(r.name))}!` : 'Donation receipt'}</h3><span class="tag">${esc(r.id)}</span></div>
    <p class="muted small">${fmtDate(r.createdAt)} · ${esc(r.name)} · ${esc(r.email)}${r.phone ? ' · ' + esc(r.phone) : ''}${r.billing ? `<br>Billing address: ${esc(addressLine(r.billing))}` : ''}</p>
    <table class="data"><thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead><tbody>
      <tr><td>${esc(r.item)}</td><td>${r.quantity || '—'}</td><td>${money(r.amount)}</td></tr></tbody></table>
    <h4 style="margin:1rem 0 .25rem">Where it went</h4>
    <ul style="margin:0;padding-left:1.2rem">${r.allocations.map(a => `<li>${money(a.amount)} → ${a.beneficiaryId ? `<a href="#/b/${a.beneficiaryId}">${esc(a.to)}</a>` : esc(a.to)}</li>`).join('')}</ul>
    ${r.dedication ? `<p><em>In honour of ${esc(r.dedication)}</em></p>` : ''}
    <div class="row no-print"><button class="btn btn-ghost btn-sm" data-act="print">Print receipt</button>${embedded && !app.me ? '<a class="btn btn-ghost btn-sm" href="#/account">Create an account to see all your gifts</a>' : ''}</div>
  </div>`;
}

let giveMode = 'item', presetAmount = 0;
const AMOUNT_OPTIONS = [100, 500, 1000, 5000];

async function viewGive(id) {
  const list = (await api('/beneficiaries?hideFunded=1&sort=closest'));
  const picked = Number(id) || 0;
  if (picked) giveMode = 'item';
  const u = app.me || {};
  const byAmount = giveMode === 'amount';
  const startOpt = picked ? (list.find(b => b.id === picked) || {}).aidKey || 'chair' : 'chair';
  main.innerHTML = `<div class="page"><div class="cols"><section>
    <h1 style="font-size:2rem">Sponsor a mobility aid</h1>
    <form data-form="donate" novalidate>
      <input type="hidden" name="mode" value="${giveMode}">
      <div class="seg" data-mode="${giveMode}" role="tablist" aria-label="How would you like to give?"><span class="seg-pill" aria-hidden="true"></span>
        <button type="button" role="tab" data-act="give-mode" data-mode="item" aria-selected="${!byAmount}">Choose an item</button>
        <button type="button" role="tab" data-act="give-mode" data-mode="amount" aria-selected="${byAmount}">Enter an amount</button></div>

      <div data-pane="item" ${byAmount ? 'hidden' : ''}>
        <fieldset style="border:0;padding:0;margin:0"><legend class="fld">Choose what to fund</legend>
          <div class="options" style="margin-top:.5rem">${optionCards(app.cat, startOpt)}</div><p class="err" data-err="option"></p></fieldset>
        <div><label class="fld"><span>Quantity</span><div class="qty"><button type="button" class="btn btn-ghost btn-sm" data-act="qty" data-d="-1" aria-label="Decrease quantity">-</button><input name="quantity" type="number" min="1" max="50" value="1" inputmode="numeric"><button type="button" class="btn btn-ghost btn-sm" data-act="qty" data-d="1" aria-label="Increase quantity">+</button></div></label><p class="err" data-err="quantity"></p></div>
      </div>

      <div data-pane="amount" ${byAmount ? '' : 'hidden'}>
        <label class="fld"><span>Amount you would like to give <small>minimum ${money(app.cat.minGift)}</small></span>
          <div class="amt-wrap"><b aria-hidden="true">₹</b><input name="amount" type="number" min="${app.cat.minGift}" max="${app.cat.maxGift}" step="1" inputmode="numeric" placeholder="500" value="${presetAmount || ''}"></div></label>
        <p class="err" data-err="amount"></p>
        <div class="row qchips" role="group" aria-label="Quick amounts">${AMOUNT_OPTIONS.map(n => `<button type="button" class="qchip" data-act="quick-amt" data-amt="${n}">${money(n)}</button>`).join('')}</div>
      </div>

      ${sel('beneficiaryId', 'Direct to', [[0, 'Any beneficiary (fastest match)'], ...list.map(b => [b.id, `${b.name} - ${b.aid} (${money(b.remaining)} left)`])], picked)}
      <div class="grid2">${fld('name', 'Your name', { value: u.name || '', auto: 'name' })}${fld('email', 'Email for receipt', { type: 'email', value: u.email || '', auto: 'email' })}</div>
      ${contactBlock('Billing details', 'Used on your receipt. We never show it publicly.')}
      ${fld('dedication', 'In honour of (optional)', { hint: 'shown on your receipt' })}
      ${chk('anonymous', 'Keep my name off the public supporters list')}
      <p class="notice" id="summary" style="margin:1rem 0" aria-live="polite"></p>
      <button class="btn btn-accent" type="submit">Confirm sponsorship</button>
    </form><div id="receipt"></div></section>
    <aside class="card stack"><h3>How your gift is used</h3>
      <p class="muted">Your gift goes to the person you choose first. If they need less than you give, the rest goes to others waiting, closest to complete first.</p>
      <p class="muted">90% buys equipment; 10% covers delivery and verification.</p>
      <p class="small muted"></p></aside></div></div>`;
  presetAmount = 0;
  const form = $('[data-form=donate]');
  const update = () => {
    const v = formValues(form), b = list.find(x => x.id === Number(v.beneficiaryId));
    let total, what;
    if (v.mode === 'amount') {
      total = Math.floor(Number(v.amount)) || 0; what = 'general donation';
      $$('.qchip', form).forEach(c => c.classList.toggle('on', Number(c.dataset.amt) === total));
    } else {
      const opt = app.cat.aids[v.option], q = Math.max(1, Math.min(50, Number(v.quantity) || 1));
      total = opt.price * q; what = `${q} × ${esc(opt.label)}`;
    }
    $('#summary').innerHTML = (total ? `<strong>Total: ${money(total)}</strong> (${what})` : '<strong>N/A</strong>') +
      (b && total ? `<br><span class="small muted">${esc(first(b.name))} needs ${money(b.remaining)} more${total > b.remaining ? `; the extra ${money(total - b.remaining)} goes to others waiting.` : '.'}</span>` : '');
  };
  form.addEventListener('input', update);
  form._update = update;
  update();
}

async function viewReceipt(id) {
  if (!app.me) return viewAccount();
  try { main.innerHTML = `<div class="page" style="max-width:640px">${receiptHtml(await api('/donations/' + id))}<p class="no-print"><a href="#/account">← My account</a></p></div>`; }
  catch (e) { notFound(e.message); }
}

async function viewApply() {
  const u = app.me || {};
  const mine = app.me ? await api('/me/applications') : [];
  main.innerHTML = `<div class="page"><div class="cols"><section>
    <h1 style="font-size:2rem">Apply for a mobility aid</h1>
    <p class="muted">Partner clinics review every application. A caregiver may apply on someone's behalf. You do not need an account, but you will need your reference number and contact detail to check progress.</p>
    <form data-form="apply" novalidate>
      <div class="grid2">
        ${fld('name', 'Applicant name', { value: u.name || '' })}${fld('age', 'Age', { type: 'number', min: 1, max: 110 })}
        ${sel('state', 'State', [['', 'Choose your state'], ...app.cat.states])}${fld('contact', 'Phone or email', { value: u.email || '' })}
        ${sel('disability', 'Disability type', app.cat.disabilities)}${sel('aid', 'Aid needed', Object.values(app.cat.aids).map(a => a.name))}
      </div>
      ${fld('referrer', 'Referring clinic, NGO or doctor')}
      ${fld('story', 'What will this aid change for you?', { rows: 4, hint: 'at least 40 characters' })}
      ${chk('consent', 'I consent to a home or clinic visit for verification.')}
      <button class="btn" type="submit">Submit application</button>
    </form><div id="apply-result"></div></section>
    <aside class="stack">
      <div class="card"><h3>How vetting works</h3><ol class="muted" style="padding-left:1.2rem;margin:0"><li>Application received</li><li>Referral checked with the clinic</li><li>Home or clinic assessment</li><li>Approved and listed in the directory</li><li>Funded and delivered</li></ol></div>
      <div class="card"><h3>Track an application</h3>
        <form data-form="track" novalidate>${fld('ref', 'Reference', { hint: 'e.g. AP-1A2B3C4D' })}${fld('contact', 'Phone or email used')}<button class="btn btn-sm" type="submit">Check status</button></form>
        <div id="track-result"></div></div>
      ${app.me ? `<div class="card"><h3>Your applications</h3>${mine.length ? mine.map(a => `<p class="small"><strong>${esc(a.ref)}</strong> ${esc(a.name)}, ${esc(a.aid)}<br>${statusTag(a.status)}</p>`).join('') : '<p class="small muted">None yet.</p>'}</div>` : ''}
    </aside></div></div>`;
}
const historyHtml = a => `<div class="notice"><strong>${esc(a.ref)}</strong> ${statusTag(a.status)}<ul class="timeline" style="margin-top:.75rem">${[...a.history].reverse().map(h => `<li><strong>${esc(h.status)}</strong> · ${fmtDate(h.at)}<br><span class="small muted">${esc(h.note)}</span></li>`).join('')}</ul></div>`;

async function viewImpact() {
  const [c, supporters] = await Promise.all([api('/campaign'), api('/supporters')]);
  const largest = Math.max(1, ...c.byType.map(t => t.count));
  main.innerHTML = `<div class="page"><h1 style="font-size:2rem">Campaign impact</h1>
    <div class="stats"><div class="stat"><b>${num(c.raised)}</b>raised</div><div class="stat"><b>${num(c.aidsFunded, false)}</b>aids funded</div><div class="stat"><b>${num(c.peopleSupported, false)}</b>people supported</div><div class="stat"><b>${num(c.openApplications, false)}</b>open applications</div><div class="stat"><b>${num(c.itemsReceived, false)}</b>accessories received</div></div>
    <div class="cols"><section class="card stack"><h3>Aids funded by type</h3><div class="bars">${c.byType.map(t => `<div class="bar"><span>${esc(t.label)}</span>${bar(Math.round(t.count / largest * 100), t.label)}<strong>${t.count}</strong></div>`).join('')}</div>
      <div class="track" role="img" aria-label="90 percent equipment, 10 percent delivery and verification" style="display:flex;height:1.2rem"><i style="width:90%;background:#1b6fd1"></i><i style="width:10%;background:#e08a12"></i></div>
      </section>
    <aside class="card"><h3>Recent supporters</h3>${supporters.length ? `<ul style="padding-left:1.2rem;margin:0">${supporters.map(s => `<li>${esc(s.name)} ${s.detail ? `<span class="muted small">· ${esc(s.detail)}</span>` : ''}</li>`).join('')}</ul>` : '<p class="muted small">No supporters yet. <a href="#/give">Be the first!</a></p>'}</aside></div>
    <h2 style="margin-top:2rem">Delivered</h2>
    ${c.delivered.length ? `<div class="grid">${c.delivered.map(b => `<article class="card person"><div class="head">${avatar(b)}<div><h3><a href="#/b/${b.id}">${esc(b.name)}</a></h3><span class="tag ok">Delivered</span></div></div><strong>${esc(b.aid)}</strong>${b.updates[0] ? `<p class="muted">${esc(b.updates[0].text)}</p>` : ''}</article>`).join('')}</div>` : '<p class="muted">Delivery stories will appear here.</p>'}</div>`;
}

async function viewVolunteer() {
  const shifts = await api('/shifts');
  const u = app.me || {};
  main.innerHTML = `<div class="page"><h1 style="font-size:2rem">Volunteer with us</h1>
    <h2>Upcoming shifts</h2>
    ${shifts.length ? `<div class="grid">${shifts.map(shiftCard).join('')}</div>` : '<p class="muted">No shifts scheduled right now. Leave your details below and we will be in touch.</p>'}
    ${app.me ? '' : '<p class="small muted">Sign in to claim a shift. <a href="#/account">Sign in or create an account</a></p>'}
    <form data-form="volunteer" class="card stack" style="margin-top:2rem;max-width:720px" novalidate>
      <h3>Not sure yet? Register your interest</h3>
      <div class="grid2">${fld('name', 'Name', { value: u.name || '' })}${fld('email', 'Email', { type: 'email', value: u.email || '' })}</div>
      ${sel('role', 'Role', app.cat.volunteerRoles)}
      <fieldset style="border:0;padding:0;margin:.5rem 0 0"><legend class="fld">Availability</legend><div class="row">${['Weekdays', 'Weekends', 'Evenings'].map(t => chk('times', t, { value: t })).join('')}</div><p class="err" data-err="times"></p></fieldset>
      <button class="btn" type="submit" style="align-self:start">Submit sign-up</button><div id="volunteer-result"></div></form></div>`;
}
const shiftCard = s => {
  const full = s.taken >= s.capacity;
  const act = s.joined ? `<button class="btn btn-ghost btn-sm" data-act="leave" data-id="${s.id}">Cancel</button>`
    : !app.me ? `<a class="btn btn-ghost btn-sm" href="#/account">Sign in to join</a>`
    : full ? '<span class="tag warn">Full</span>' : `<button class="btn btn-sm" data-act="join" data-id="${s.id}">Apply</button>`;
  return `<article class="card stack"><div class="row between"><span class="tag">${esc(s.role)}</span>${s.joined ? '<span class="tag ok">You are going</span>' : ''}</div>
    <h3 style="margin:0">${esc(s.title)}</h3><p class="muted" style="margin:0">${fmtDay(s.date)} · ${esc(s.time)}<br>${esc(s.location)}</p>
    ${bar(Math.round(s.taken / s.capacity * 100), 'Spots taken')}<div class="row between"><span class="small muted">${s.taken} of ${s.capacity} spots taken</span>${act}</div></article>`;
};

// accessory donations 
const itemRow = () => `<div class="item-row card flat stack">
  <div class="grid2">${sel('type', 'Item', app.cat.accessoryTypes)}${sel('condition', 'Condition', app.cat.conditions, 'Good')}</div>
  <div class="grid2">${fld('quantity', 'Quantity', { type: 'number', value: 1, min: 1, max: 500 })}${fld('description', 'Details', { hint: 'size, model, notes' })}</div>
  <button type="button" class="btn btn-ghost btn-sm" style="align-self:start" data-act="rm-item">Remove this item</button></div>`;

const pledgeHtml = (k, headline) => `<div class="notice"><div class="row between"><strong>${headline || esc(k.ref)}</strong>${statusTag(k.status)}</div>
  <p class="small muted" style="margin:.4rem 0">${esc(k.ref)} · ${fmtDate(k.createdAt)} · ${esc(k.method)}${k.pickupDate ? ` · hand-over ${fmtDay(k.pickupDate)}` : ''}</p>
  <ul style="margin:0 0 .5rem;padding-left:1.2rem">${k.items.map(i => `<li>${i.quantity} × ${esc(i.type)} <span class="muted small">(${esc(i.condition)}${i.description ? ', ' + esc(i.description) : ''})</span></li>`).join('')}</ul>
  <p class="small muted" style="margin:0">Contact: ${esc(k.name)}${k.organisation ? ', ' + esc(k.organisation) : ''} · ${esc(k.phone)} · ${esc(k.email)}<br>Address: ${esc(addressLine(k.address))}</p>
  <ul class="timeline" style="margin-top:.75rem">${[...k.history].reverse().map(h => `<li><strong>${esc(h.status)}</strong> · ${fmtDate(h.at)}<br><span class="small muted">${esc(h.note)}</span></li>`).join('')}</ul></div>`;

async function viewItems() {
  const u = app.me || {};
  const mine = app.me ? await api('/me/inkind') : [];
  main.innerHTML = `<div class="page"><div class="cols"><section>
    <h1 style="font-size:2rem">Donate Us</h1>
    <p class="muted">Not every gift is money. Cushions, walking aids, gloves, ramps and working used wheelchairs all help someone move more safely. Tell us what you have and how to reach you, and a coordinator will arrange the hand-over.</p>
    <form data-form="items" novalidate>
      <h3>What are you donating?</h3>
      <div id="item-rows" class="stack">${itemRow()}</div><p class="err" data-err="items"></p>
      <button type="button" class="btn btn-ghost btn-sm" data-act="add-item">+ Add another item</button>
      <h3 style="margin-top:1.5rem">Your details</h3>
      <div class="grid2">${fld('name', 'Full name', { value: u.name || '', auto: 'name' })}${fld('email', 'Email', { type: 'email', value: u.email || '', auto: 'email' })}</div>
      ${fld('organisation', 'Organisation (optional)', { auto: 'organization' })}
      ${contactBlock('Address', 'Where we collect from, or where we send your acknowledgement letter.')}
      <h3 style="margin-top:1.5rem">Hand-over</h3>
      ${sel('method', 'How will the items reach us?', app.cat.methods)}
      ${fld('notes', 'Pickup times or special instructions (optional)', { rows: 2 })}
      ${chk('consent', 'I confirm these items are mine to give, clean and safe to use.')}
      ${chk('anonymous', 'Keep my name off the public supporters list')}
      <button class="btn btn-accent" style="margin-top:.75rem" type="submit">Submit pledge</button>
    </form><div id="items-result"></div></section>
    <aside class="stack">
      <div class="card"><h3>What we can use</h3><ul class="muted" style="padding-left:1.2rem;margin:0"><li>Items that are clean, working and safe</li><li>Wheelchairs with all wheels, brakes and footrests</li><li>New or lightly used cushions, gloves and braces</li><li>Walking sticks, crutches and walkers</li></ul>
        <p class="small muted" style="margin-bottom:0">We inspect every item. Anything we cannot pass on safely is declined, and we will tell you why.</p></div>
      <div class="card"><h3>Track a pledge</h3><form data-form="track-inkind" novalidate>${fld('ref', 'Reference', { hint: 'e.g. IK-1A2B3C4D' })}${fld('email', 'Email used')}<button class="btn btn-sm" type="submit">Check status</button></form><div id="track-result"></div></div>
      ${app.me ? `<div class="card"><h3>Your pledges</h3>${mine.length ? mine.map(k => `<p class="small"><strong>${esc(k.ref)}</strong> · ${k.totalItems} item(s)<br>${statusTag(k.status)}</p>`).join('') : '<p class="small muted">None yet.</p>'}</div>` : ''}
    </aside></div></div>`;
}

const FAQ = [
  ['Who qualifies for an aid?', 'Low-income people with a disability, including amputees and people with paralysis, blindness or cerebral palsy, who are referred by a clinic or NGO.'],
  ['How are beneficiaries vetted?', 'We confirm the referral with the clinic, then a coordinator completes a home or clinic assessment. Only then is the person approved and listed in the directory, using a first name, age and state only.'],
  ['How much can I give?', 'Any amount from ₹100. You can also choose an item, such as a wheelchair at ₹7,125 including assembly and delivery through a partner clinic.'],
  ['Can I fund a specific person?', 'Yes. Choose a beneficiary on the sponsorship form. Funds beyond their need go to other people waiting for the same type of aid, closest to complete first. If nobody else needs that aid, the money joins the general fund for the next matching request.'],
  ['How will I know it worked?', 'When an aid is delivered, the coordinator posts a dated update. Donors with an account see these under “My account”.'],
  ['Is my data private?', 'Your account password is stored as a salted scrypt hash and your session cookie is HTTP-only. You can delete your account at any time from your account settings; your gifts stay on record without your link to them.'],
  ['Can I donate accessories instead of money?', 'Yes. Use "Donate Us" to pledge cushions, walking aids, gloves, ramps, used wheelchairs and more. Give your contact number and address, choose drop-off, pickup or shipping, and a coordinator will arrange the hand-over. Items must be clean, safe and yours to give; we inspect everything before it is passed on.'],
];
function viewFaq() {
  main.innerHTML = `<div class="page" style="max-width:820px"><h1 style="font-size:2rem">Questions and answers</h1>${FAQ.map(([q, a]) => `<details class="faq"><summary>${q}</summary><p style="margin:.5rem 0 0">${a}</p></details>`).join('')}
    <p>If you wanna help more, Consider <a href="#/volunteer">Talk to a volunteer</a> or <a href="#/apply">start an application</a>.</p></div>`;
}

// account 
let accountMode = 'in', accountTab = 'giving';

async function viewAccount() {
  if (app.me) return viewProfile();
  const up = accountMode === 'up';
  main.innerHTML = `<div class="page" style="max-width:520px"><div class="card stack"><h1 style="font-size:1.8rem">${up ? 'Create your account' : 'Welcome back'}</h1>
    <div class="row" role="group" aria-label="Account mode"><button class="btn btn-sm ${up ? 'btn-ghost' : ''}" data-act="mode" data-mode="in" aria-pressed="${!up}">Sign in</button><button class="btn btn-sm ${up ? '' : 'btn-ghost'}" data-act="mode" data-mode="up" aria-pressed="${up}">Sign up</button></div>
    <form data-form="${up ? 'signup' : 'login'}" novalidate>
      ${up ? fld('name', 'Full name', { auto: 'name' }) : ''}${fld('email', 'Email', { type: 'email', auto: 'email' })}${fld('password', 'Password', { type: 'password', auto: up ? 'new-password' : 'current-password', hint: up ? '8+ characters' : '' })}
      ${up ? sel('role', 'I am joining as', [['donor', 'A donor'], ['beneficiary', 'A beneficiary'], ['volunteer', 'A volunteer']]) + chk('terms', 'I agree to the terms and privacy notice.') : ''}
      <button class="btn btn-block" style="margin-top:.75rem" type="submit">${up ? 'Create account' : 'Sign in'}</button><p class="err" data-err="form"></p></form></div></div>`;
}

async function viewProfile() {
  const u = app.me;
  const tabs = [['giving', 'My giving'], ['items', 'Item pledges'], ['applications', 'Applications'], ['shifts', 'Shifts'], ['settings', 'Settings']];
  main.innerHTML = `<div class="page"><div class="section-head"><div><h1 style="font-size:2rem;margin:0">Welcome, ${esc(first(u.name))}</h1><span class="tag">${esc(u.role)}</span> <span class="tag">${esc(u.email)}</span></div>
    <div class="row">${isAdmin() ? '<a class="btn btn-accent btn-sm" href="#/admin">Admin console</a>' : ''}<button class="btn btn-ghost btn-sm" data-act="logout">Sign out</button></div></div>
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-act="acc-tab" data-tab="${k}" aria-selected="${accountTab === k}">${l}</button>`).join('')}</div><div id="tab-body"><p class="loading">Loading…</p></div></div>`;
  await profileTab();
}
let tabToken = 0;
async function profileTab() {
  const u = app.me, t = ++tabToken;
  const body = $('#tab-body');
  if (!body) return;
  body.innerHTML = '<p class="loading"><span class="spinner"></span>Loading…</p>';
  const html = await profileTabHtml(u);
  if (t !== tabToken || !document.contains(body)) return;
  body.innerHTML = html; tabFx(body);
}
async function profileTabHtml(u) {
  const body = { innerHTML: '' };

  if (accountTab === 'giving') {
    const [gifts, impact] = await Promise.all([api('/me/donations'), api('/me/impact')]);
    const total = gifts.reduce((s, g) => s + g.amount, 0), aids = gifts.reduce((s, g) => s + g.quantity, 0);
    body.innerHTML = `<div class="stats"><div class="stat"><b>${num(total)}</b>given</div><div class="stat"><b>${num(aids, false)}</b>aids funded</div><div class="stat"><b>${num(impact.filter(b => b.status === 'Delivered').length, false)}</b>delivered</div></div>
      <div class="cols"><section class="card"><h3>Your gifts</h3>${gifts.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Item</th><th>Amount</th><th></th></tr></thead><tbody>${gifts.map(g => `<tr><td>${fmtDate(g.createdAt)}</td><td>${g.quantity ? g.quantity + ' × ' : ''}${esc(g.item)}</td><td>${money(g.amount)}</td><td><a href="#/receipt/${esc(g.id)}">Receipt</a></td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No gifts yet. <a href="#/give">Sponsor an aid</a></p>'}</section>
      <aside class="card"><h3>People you helped</h3>${impact.length ? impact.map(b => `<div class="stack" style="margin-bottom:1rem"><div class="row">${avatar(b)}<div><a href="#/b/${b.id}"><strong>${esc(b.name)}</strong></a><br>${statusTag(b.status)}</div></div>${b.updates[0] ? `<p class="small muted">${fmtDate(b.updates[0].at)}: ${esc(b.updates[0].text)}</p>` : bar(b.percent, 'Funding')}</div>`).join('') : '<p class="muted small">Updates on the people you fund will appear here.</p>'}</aside></div>`;
  } else if (accountTab === 'items') {
    const list = await api('/me/inkind');
    body.innerHTML = list.length ? list.map(k => pledgeHtml(k, `${k.totalItems} item(s)`)).join('') : '<p class="empty">No item pledges yet. <a href="#/items">Donate accessories</a></p>';
  } else if (accountTab === 'applications') {
    const list = await api('/me/applications');
    body.innerHTML = list.length ? list.map(historyHtml).join('') : '<p class="empty">No applications yet. <a href="#/apply">Apply for an aid</a></p>';
  } else if (accountTab === 'shifts') {
    const list = await api('/me/shifts');
    body.innerHTML = list.length ? `<div class="grid">${list.map(shiftCard).join('')}</div>` : '<p class="empty">You have not joined any shifts. <a href="#/volunteer">Browse shifts</a></p>';
  } else {
    body.innerHTML = `<div class="grid2" style="align-items:start">
      <form class="card" data-form="profile" novalidate><h3>Your details</h3>${fld('name', 'Full name', { value: u.name })}<button class="btn btn-sm" type="submit">Save</button></form>
      <form class="card" data-form="password" novalidate><h3>Change password</h3>${fld('current', 'Current password', { type: 'password', auto: 'current-password' })}${fld('next', 'New password', { type: 'password', auto: 'new-password' })}<button class="btn btn-sm" type="submit">Change password</button></form>
      <form class="card" data-form="delete" novalidate><h3>Delete account</h3><p class="small muted">Removes your login and shift sign-ups. Past gifts stay on record without your link to them.</p>${fld('password', 'Confirm with your password', { type: 'password', auto: 'current-password' })}<button class="btn btn-danger btn-sm" type="submit">Delete my account</button></form></div>`;
  }
  return body.innerHTML;
}

// admin 
let adminTab = 'overview';
async function viewAdmin() {
  if (!isAdmin()) return notFound('Administrators only.');
  const tabs = [['overview', 'Overview'], ['applications', 'Applications'], ['aids', 'Beneficiaries'], ['donations', 'Donations'], ['items', 'Item pledges'], ['volunteers', 'Volunteers']];
  main.innerHTML = `<div class="page"><h1 style="font-size:2rem">Admin console</h1><div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-act="admin-tab" data-tab="${k}" aria-selected="${adminTab === k}">${l}</button>`).join('')}</div><div id="tab-body"><p class="loading">Loading…</p></div></div>`;
  await adminBody();
}
async function adminBody() {
  const t = ++tabToken, host = $('#tab-body');
  if (!host) return;
  host.innerHTML = '<p class="loading"><span class="spinner"></span>Loading…</p>';
  const html = await adminBodyHtml();
  if (t !== tabToken || !document.contains(host)) return;
  host.innerHTML = html; tabFx(host);
}
async function adminBodyHtml() {
  const body = { innerHTML: '' };

  if (adminTab === 'overview') {
    const s = await api('/admin/summary');
    const peak = Math.max(1, ...s.perDay.map(d => d.amount));
    body.innerHTML = `<div class="stats"><div class="stat"><b>${num(s.raised)}</b>campaign total</div><div class="stat"><b>${num(s.donations, false)}</b>gifts recorded</div><div class="stat"><b>${num(s.average)}</b>average gift</div><div class="stat"><b>${num(s.users, false)}</b>accounts</div><div class="stat"><b>${num(s.generalFund)}</b>unallocated fund</div></div>
      <div class="cols"><section class="card stack"><h3>Gifts, last 14 days</h3><div class="days" role="img" aria-label="Daily gift totals">${s.perDay.map(d => `<div title="${d.day}: ${money(d.amount)}" style="height:${Math.max(3, d.amount / peak * 100)}%"></div>`).join('')}</div>
        <h3>Still needed by aid type</h3><div class="bars">${s.needByAid.map(n => `<div class="row between"><span>${esc(n.label)}</span><strong>${money(n.need)}</strong></div>`).join('')}</div></section>
        <aside class="stack"><div class="card"><h3>Applications</h3>${s.applicationsByStatus.map(a => `<div class="row between"><span>${esc(a.status)}</span><strong>${a.count}</strong></div>`).join('')}</div>
        <div class="card"><h3>Accessory pledges</h3>${s.inKindByStatus.map(a => `<div class="row between"><span>${esc(a.status)}</span><strong>${a.count}</strong></div>`).join('')}</div>
        <div class="card"><h3>Funded, awaiting delivery</h3>${s.awaitingDelivery.length ? s.awaitingDelivery.map(b => `<p style="margin:.25rem 0">${esc(b.name)} · ${esc(b.aid)}</p>`).join('') + '<p class="small muted">Post a delivery update under Beneficiaries.</p>' : '<p class="small muted">Nothing waiting.</p>'}</div></aside></div>`;
  } else if (adminTab === 'applications') {
    const list = await api('/admin/applications');
    body.innerHTML = list.length ? list.map(a => `<form class="card stack" style="margin-bottom:1rem" data-form="admin-app" data-ref="${esc(a.ref)}" novalidate>
      <div class="row between"><h3 style="margin:0">${esc(a.name)}, ${a.age} · ${esc(a.aid)}</h3>${statusTag(a.status)}</div>
      <p class="small muted" style="margin:0">${esc(a.ref)} · ${fmtDate(a.createdAt)} · ${esc(a.state)} · ${esc(a.contact)}<br>${esc(a.disability)} · referred by ${esc(a.referrer)}</p>
      <p>${esc(a.story)}</p>
      <div class="grid2">${sel('status', 'Status', app.cat.statuses, a.status)}${fld('note', 'Note for the applicant (optional)')}</div>
      ${a.beneficiaryId ? `<p class="small">Listed as <a href="#/b/${a.beneficiaryId}">beneficiary #${a.beneficiaryId}</a>.</p>` : fld('publicStory', 'Public story', { rows: 2, hint: 'required to approve · first name only, no surnames or contact details' })}
      <button class="btn btn-sm" style="align-self:start" type="submit">Save review</button></form>`).join('') : '<p class="empty">No applications yet.</p>';
  } else if (adminTab === 'aids') {
    const list = await api('/admin/beneficiaries');
    body.innerHTML = `<div class="grid">${list.map(b => `<form class="card stack" data-form="admin-update" data-id="${b.id}" novalidate>
      <div class="row">${avatar(b)}<div><strong>${esc(b.name)}</strong> · ${esc(b.aid)}<br>${statusTag(b.status)} <span class="small muted">${money(b.raised)} / ${money(b.cost)}</span></div></div>
      ${b.updates[0] ? `<p class="small muted" style="margin:0">Latest: ${esc(b.updates[0].text)}</p>` : ''}
      ${fld('text', 'Post an update', { rows: 2 })}
      ${b.remaining === 0 && b.status !== 'Delivered' ? chk('delivered', 'Mark as delivered') : ''}
      <button class="btn btn-sm" style="align-self:start" type="submit">Post update</button></form>`).join('')}</div>`;
  } else if (adminTab === 'items') {
    const list = await api('/admin/inkind');
    body.innerHTML = `<div class="row between" style="margin-bottom:.75rem"><span class="muted">${list.length} pledges</span><a class="btn btn-sm" href="/api/admin/inkind.csv" download>Download CSV</a></div>` +
      (list.length ? list.map(k => `<form class="card stack" style="margin-bottom:1rem" data-form="admin-inkind" data-ref="${esc(k.ref)}" novalidate>${pledgeHtml(k, `${k.totalItems} item(s) from ${esc(k.name)}`)}
        <div class="grid2">${sel('status', 'Status', app.cat.inKindStatuses, k.status)}${fld('pickupDate', 'Hand-over date', { type: 'date', value: k.pickupDate })}</div>${fld('note', 'Note for the donor (optional)')}
        <button class="btn btn-sm" style="align-self:start" type="submit">Save</button></form>`).join('') : '<p class="empty">No pledges yet.</p>');
  } else if (adminTab === 'donations') {
    const list = await api('/admin/donations');
    body.innerHTML = `<div class="row between" style="margin-bottom:.75rem"><span class="muted">${list.length} gifts</span><a class="btn btn-sm" href="/api/admin/donations.csv" download>Download CSV</a></div>
      <div class="card table-wrap">${list.length ? `<table class="data"><thead><tr><th>Receipt</th><th>Date</th><th>Donor</th><th>Item</th><th>Amount</th><th>Allocation</th></tr></thead><tbody>${list.map(d => `<tr><td>${esc(d.id)}</td><td>${fmtDate(d.createdAt)}</td><td>${esc(d.name)}<br><span class="small muted">${esc(d.email)}${d.phone ? ' · ' + esc(d.phone) : ''}${d.anonymous ? ' · anonymous' : ''}<br>${esc(addressLine(d.billing))}</span></td><td>${d.quantity ? d.quantity + ' × ' : ''}${esc(d.item)}</td><td>${money(d.amount)}</td><td class="small">${d.allocations.map(a => `${money(a.amount)} → ${esc(a.to)}`).join('<br>')}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">No gifts yet.</p>'}</div>`;
  } else {
    const v = await api('/admin/volunteers');
    body.innerHTML = `<div class="cols"><section class="stack"><h3>Shifts</h3>${v.shifts.map(s => `<div class="card"><div class="row between"><strong>${esc(s.title)}</strong><span class="tag">${s.taken}/${s.capacity}</span></div><p class="small muted" style="margin:0">${fmtDay(s.date)} · ${esc(s.time)} · ${esc(s.location)}</p>${s.signups.length ? `<p class="small" style="margin:.4rem 0 0">${s.signups.map(x => esc(x.name)).join(', ')}</p>` : ''}</div>`).join('')}
      <h3>Interest register</h3><div class="card table-wrap">${v.interests.length ? `<table class="data"><thead><tr><th>Name</th><th>Role</th><th>Availability</th></tr></thead><tbody>${v.interests.map(i => `<tr><td>${esc(i.name)}<br><span class="small muted">${esc(i.email)}</span></td><td>${esc(i.role)}</td><td>${esc(i.times.join(', '))}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">No sign-ups yet.</p>'}</div></section>
      <form class="card" data-form="admin-shift" novalidate><h3>Add a shift</h3>${fld('title', 'Title')}${sel('role', 'Role', app.cat.volunteerRoles)}<div class="grid2">${fld('date', 'Date', { type: 'date' })}${fld('time', 'Time', { hint: 'e.g. 09:00-13:00' })}</div>${fld('location', 'Location')}${fld('capacity', 'Capacity', { type: 'number', value: 5, min: 1, max: 200 })}<button class="btn btn-sm" type="submit">Add shift</button></form></div>`;
  }
  return body.innerHTML;
}

function notFound(msg = 'Page not found.') {
  main.innerHTML = `<div class="page empty"><h1>${esc(msg)}</h1><p><a class="btn" href="#/">Back to home</a></p></div>`;
}

// form handlers 
const afterAuth = user => { app.me = user; buildChrome(); location.hash = '#/account'; viewAccount(); };

const forms = {
  async donate(form, v) {
    const r = await api('/donations', { method: 'POST', body: v });
    $('#receipt').innerHTML = receiptHtml(r, { embedded: true });
    await celebrate({
      processing: { title: 'Processing your payment…', note: 'Please do not close this window', steps: ['Verifying', 'Allocating', 'Confirming'] },
      title: `Thank you, ${first(r.name)}!`, big: r.amount, bigMoney: true,
      sub: r.quantity ? `${r.quantity} × ${r.item} sponsored` : 'Your gift will help someone move forward',
      lines: r.allocations.map(a => `${money(a.amount)} → ${a.to}`), ref: r.id, refLabel: 'Receipt',
      onClose: () => $('#receipt').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' }),
    });
  },
  async apply(form, v) {
    const r = await api('/applications', { method: 'POST', body: v });
    $('#apply-result').innerHTML = `<div class="notice"><strong>Application ${esc(r.ref)} received.</strong><br>Please take screenshot of the reference ID. You'll need it later.</div>`;
    form.reset();
  },
  async track(form, v) {
    const a = await api('/applications/track', { method: 'POST', body: v });
    $('#track-result').innerHTML = historyHtml(a);
  },
  async volunteer(form, v) {
    await api('/volunteers', { method: 'POST', body: v });
    $('#volunteer-result').innerHTML = `<div class="notice">Thank you, ${esc(first(v.name))}. We'll email you at ${esc(v.email)}.</div>`;
  },
  async items(form, v) {
    const items = $$('.item-row', form).map(r => ({ type: $('[name=type]', r).value, condition: $('[name=condition]', r).value, quantity: $('[name=quantity]', r).value, description: $('[name=description]', r).value }));
    const k = await api('/inkind', { method: 'POST', body: { ...v, items } });
    $('#items-result').innerHTML = pledgeHtml(k, `Thank you, ${esc(first(k.name))}! Pledge ${esc(k.ref)} received`) +
      `<p class="small muted">Keep this reference. A coordinator will call or email you to arrange the hand-over. <button class="btn btn-ghost btn-sm" data-act="print">Print</button></p>`;
    form.reset(); $$('.item-row', form).slice(1).forEach(r => r.remove());
    await celebrate({
      processing: { title: 'Registering your pledge…', note: 'Just a moment', steps: ['Checking', 'Recording', 'Notifying'] },
      title: `Thank you, ${first(k.name)}!`, big: k.totalItems, bigMoney: false, bigSuffix: k.totalItems === 1 ? ' item pledged' : ' items pledged',
      sub: 'A coordinator will contact you to arrange the hand-over',
      lines: k.items.map(i => `${i.quantity} × ${i.type} (${i.condition})`), ref: k.ref, refLabel: 'Pledge',
      onClose: () => $('#items-result').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' }),
    });
  },
  async 'track-inkind'(form, v) { $('#track-result').innerHTML = pledgeHtml(await api('/inkind/track', { method: 'POST', body: v })); },
  async 'admin-inkind'(form, v) { await api('/admin/inkind/' + form.dataset.ref, { method: 'PATCH', body: v }); toast('Pledge updated.'); viewAdmin(); },
  async login(form, v) { afterAuth(await api('/auth/login', { method: 'POST', body: v })); },
  async signup(form, v) { afterAuth(await api('/auth/signup', { method: 'POST', body: v })); },
  async profile(form, v) { app.me = await api('/me', { method: 'PATCH', body: v }); buildChrome(); toast('Saved.'); viewProfile(); },
  async password(form, v) { await api('/me/password', { method: 'POST', body: v }); form.reset(); toast('Password changed.'); },
  async delete(form, v) {
    if (!confirm('Delete your account? This cannot be undone.')) return;
    await api('/me/delete', { method: 'POST', body: v });
    app.me = null; buildChrome(); toast('Account deleted.'); location.hash = '#/'; route();
  },
  async 'admin-app'(form, v) {
    await api('/admin/applications/' + form.dataset.ref, { method: 'PATCH', body: v });
    toast('Review saved.'); viewAdmin();
  },
  async 'admin-update'(form, v) {
    await api(`/admin/beneficiaries/${form.dataset.id}/updates`, { method: 'POST', body: v });
    toast('Update posted.'); viewAdmin();
  },
  async 'admin-shift'(form, v) { await api('/admin/shifts', { method: 'POST', body: v }); toast('Shift added.'); viewAdmin(); },
};

document.addEventListener('submit', async event => {
  if (event.target.closest('[data-live-filter]')) return event.preventDefault();
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const button = $('[type=submit]', form);
  showErrors(form, {});
  if (button) button.disabled = true;
  try { await forms[form.dataset.form](form, formValues(form)); }
  catch (error) {
    if (!document.contains(form)) return;
    const fields = { ...error.fields };
    if (!Object.keys(fields).length && $('[data-err=form]', form)) fields.form = error.message;
    showErrors(form, fields);
    toast(error.message, true);
  } finally { if (button) button.disabled = false; }
});

// clicks 
const actions = {
  print: () => window.print(),
  qty(el) { const input = $('[name=quantity]'); input.value = Math.max(1, Math.min(50, (Number(input.value) || 1) + Number(el.dataset.d))); input.dispatchEvent(new Event('input', { bubbles: true })); },
  mode(el) { accountMode = el.dataset.mode; viewAccount(); },
  'give-mode'(el) {
    const form = el.closest('form'), mode = el.dataset.mode;
    if (giveMode === mode) return;
    giveMode = mode;
    $('[name=mode]', form).value = mode;
    $('.seg', form).dataset.mode = mode;
    $$('[data-act=give-mode]', form).forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
    $$('[data-pane]', form).forEach(p => {
      const show = p.dataset.pane === mode;
      p.hidden = !show;
      if (show && !REDUCED) { p.classList.remove('pane-in'); void p.offsetWidth; p.classList.add('pane-in'); }
    });
    if (mode === 'amount') $('[name=amount]', form).focus({ preventScroll: true });
    form._update();
  },
  'quick-amt'(el) { const input = $('[name=amount]'); input.value = el.dataset.amt; input.dispatchEvent(new Event('input', { bubbles: true })); },
  'close-modal'() { closeModal(); },
  'add-item'() { const box = $('#item-rows'); if (box.children.length >= 10) return toast('You can add up to 10 items per pledge.', true); box.insertAdjacentHTML('beforeend', itemRow()); },
  'rm-item'(el) { const box = $('#item-rows'); if (box.children.length > 1) el.closest('.item-row').remove(); },
  async logout() { await api('/auth/logout', { method: 'POST' }); app.me = null; buildChrome(); toast('Signed out.'); location.hash = '#/'; route(); },
  'acc-tab'(el) { accountTab = el.dataset.tab; $$('[data-act=acc-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === accountTab))); profileTab(); },
  'admin-tab'(el) { adminTab = el.dataset.tab; $$('[data-act=admin-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === adminTab))); adminBody(); },
  async join(el) { await api(`/shifts/${el.dataset.id}/join`, { method: 'POST' }); toast('You are signed up.'); route(); },
  async leave(el) { await api(`/shifts/${el.dataset.id}/leave`, { method: 'POST' }); toast('Cancel successful.'); route(); },
  async share(el) {
    const url = location.origin + '/#/b/' + el.dataset.id;
    const text = `Help fund ${el.dataset.name}'s mobility aid with Roll Forward`;
    if (navigator.share) { try { await navigator.share({ title: 'Roll Forward', text, url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(url); toast('Link copied.'); } catch (e) { prompt('Copy this link:', url); }
  },
};
document.addEventListener('click', async event => {
  const el = event.target.closest('[data-act]');
  if (el && actions[el.dataset.act]) {
    try { await actions[el.dataset.act](el); } catch (error) { toast(error.message, true); }
  }
});

// chrome + router 
const NAV = [['/', 'Home'], ['/directory', 'Beneficiaries'], ['/give', 'Sponsor'], ['/items', 'Donate Us'], ['/apply', 'Apply'], ['/impact', 'Impact'], ['/volunteer', 'Volunteer'], ['/faq', 'FAQ']];
function buildChrome() {
  const items = isAdmin() ? [...NAV, ['/admin', 'Admin']] : NAV;
  const current = '/' + (location.hash.slice(2).split('/')[0] || '');
  $('#nav').innerHTML = items.map(([path, label]) => `<a href="#${path}" ${path === current || (path === '/directory' && current === '/b') ? 'aria-current="page"' : ''}>${label}</a>`).join('');
  $('#account-link').textContent = app.me ? first(app.me.name) : 'Sign in';
}

const ROUTES = [
  [/^\/?$/, viewHome], [/^\/directory$/, viewDirectory], [/^\/b\/(\d+)$/, viewDetail], [/^\/give\/amount\/(\d+)$/, n => { giveMode = 'amount'; presetAmount = Number(n); return viewGive(0); }], [/^\/give(?:\/(\d+))?$/, id => viewGive(id)],
  [/^\/items$/, viewItems], [/^\/receipt\/([\w-]+)$/, viewReceipt], [/^\/apply$/, viewApply], [/^\/impact$/, viewImpact], [/^\/volunteer$/, viewVolunteer],
  [/^\/faq$/, viewFaq], [/^\/account$/, viewAccount], [/^\/admin$/, viewAdmin],
];
let routeToken = 0;
async function route() {
  const path = location.hash.slice(1) || '/';
  const token = ++routeToken;
  buildChrome();
  $('#nav').classList.remove('open');
  $('#menu-btn').setAttribute('aria-expanded', 'false');
  const match = ROUTES.map(([re, fn]) => ({ m: path.match(re), fn })).find(x => x.m);
  progress('start');
  main.classList.remove('page-enter');
  main.innerHTML = '<p class="loading"><span class="spinner"></span>Loading…</p>';
  try {
    if (!match) notFound(); else await match.fn(...match.m.slice(1));
    if (token === routeToken) pageFx();
  } catch (error) {
    if (token === routeToken) main.innerHTML = `<div class="page empty"><h1>Something went wrong</h1><p>${esc(error.message)}</p><button class="btn" data-act="retry">Try again</button></div>`;
  }
  if (token === routeToken) { progress('done'); window.scrollTo(0, 0); main.focus({ preventScroll: true }); }
}
actions.retry = () => route();
window.addEventListener('hashchange', route);


// visual effects 
const prog = $('#progress');
let progTimer;
function progress(state) {
  if (!prog || REDUCED) return;
  clearTimeout(progTimer);
  if (state === 'start') { prog.className = ''; void prog.offsetWidth; prog.className = 'run'; }
  else { prog.className = 'done'; progTimer = setTimeout(() => { prog.className = ''; }, 700); }
}

// another cool effect (definitely didn't steal it off of stackoverflow lmao)
function stagger(els) { els.forEach((el, i) => { el.style.setProperty('--i', Math.min(i, 12)); el.classList.add('fx-in'); }); }
function fxIn(root, tops) {
  if (REDUCED) return;
  const grids = $$('.grid, .steps, .stats', root), skip = new Set(grids);
  stagger(tops.filter(el => !skip.has(el)));
  grids.forEach(g => stagger([...g.children]));
}
function countUp(root) {
  $$('[data-count]', root).forEach(el => {
    const end = Number(el.dataset.count), isMoney = !!el.dataset.money;
    if (REDUCED || !end) return;
    const t0 = performance.now(), dur = 900;
    const draw = v => { el.textContent = isMoney ? money(v) : v.toLocaleString('en-IN'); };
    draw(0);
    const tick = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); draw(Math.round(end * e)); if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
}
function pageFx() {
  main.classList.add('page-enter');
  fxIn(main, $$(':scope > .page > *, :scope > .hero .wrap > *', main).filter(el => el.id !== 'tab-body'));
  countUp(main);
}
function tabFx(body) { fxIn(body, [...body.children]); countUp(body); }

// ripple + sparks on click
const RIPPLE = '.btn, .chip, .tabs button, .nav a, .opt, .seg button, .qchip';
document.addEventListener('pointerdown', e => {
  if (REDUCED) return;
  const host = e.target.closest(RIPPLE);
  if (host && !host.disabled) {
    const r = host.getBoundingClientRect(), size = Math.max(r.width, r.height) * 2;
    const dot = document.createElement('span');
    dot.className = 'ripple';
    dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    host.append(dot);
    setTimeout(() => dot.remove(), 700);
  }
  if (e.target.closest('.btn:not(.btn-ghost):not(.btn-sm), .qchip')) sparks(e.clientX, e.clientY);
});
function sparks(x, y) {
  const colors = ['#ffc928', '#1b78d6', '#13b36a', '#ff6b6b', '#0fb5c9'];
  for (let i = 0; i < 9; i++) {
    const d = document.createElement('i');
    const a = (Math.PI * 2 * i) / 9 + Math.random() * .5, dist = 28 + Math.random() * 28;
    d.className = 'spark';
    d.style.cssText = `left:${x}px;top:${y}px;background:${colors[i % colors.length]};--dx:${Math.cos(a) * dist}px;--dy:${Math.sin(a) * dist}px`;
    document.body.append(d);
    setTimeout(() => d.remove(), 650);
  }
}

// very cool looking confetti effect
let confettiRaf = 0;
function confetti(canvas) {
  if (REDUCED) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = canvas.width = innerWidth * dpr, H = canvas.height = innerHeight * dpr;
  const ctx = canvas.getContext('2d');
  const colors = ['#ffc928', '#1b78d6', '#13b36a', '#ff6b6b', '#8a52d0', '#0fb5c9', '#ffffff'];
  const parts = [];
  const burst = (x, y, n, spread, power, angle) => {
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - .5) * spread, sp = (power * .45 + Math.random() * power * .55) * dpr;
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, w: (6 + Math.random() * 7) * dpr, h: (4 + Math.random() * 5) * dpr, rot: Math.random() * 6.28, vr: (Math.random() - .5) * .35, c: colors[(Math.random() * colors.length) | 0], round: Math.random() < .3, life: 0, wob: Math.random() * 6.28 });
    }
  };
  burst(W / 2, H * .36, 150, Math.PI * 2, 17, 0);
  setTimeout(() => { burst(0, H * .85, 70, .9, 26, -Math.PI / 3); burst(W, H * .85, 70, .9, 26, -Math.PI * 2 / 3); }, 380);
  cancelAnimationFrame(confettiRaf);
  const frame = () => {
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (const p of parts) {
      p.life++; p.vy += .32 * dpr; p.vx *= .991; p.vy *= .991; p.x += p.vx + Math.sin(p.life * .08 + p.wob) * .6 * dpr; p.y += p.vy; p.rot += p.vr;
      if (p.y > H + 40 || p.life > 330) continue;
      alive++;
      ctx.save(); ctx.globalAlpha = Math.min(1, (330 - p.life) / 70); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c;
      if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.h * .6, 0, 6.28); ctx.fill(); } else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (alive) confettiRaf = requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
  };
  confettiRaf = requestAnimationFrame(frame);
}

// payment popup
let modalState = null;
const wait = ms => new Promise(r => setTimeout(r, ms));
function closeModal() {
  if (!modalState || !modalState.ready) return;
  const { root, prev, onClose, resolve } = modalState;
  modalState = null;
  cancelAnimationFrame(confettiRaf);
  root.classList.add('closing');
  setTimeout(() => { root.className = 'modal-root'; root.innerHTML = ''; document.body.classList.remove('modal-open'); }, REDUCED ? 0 : 260);
  if (prev && prev.focus) prev.focus({ preventScroll: true });
  if (onClose) setTimeout(onClose, 120);
  resolve();
}
async function celebrate(cfg) {
  const root = $('#modal-root');
  const prev = document.activeElement;
  document.body.classList.add('modal-open');
  const step = (label, i) => `<li style="--i:${i}"><i></i>${esc(label)}</li>`;
  root.className = 'modal-root open';
  root.innerHTML = `<div class="modal-backdrop" data-act="backdrop"></div><canvas class="confetti" aria-hidden="true"></canvas>
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title" tabindex="-1"><div class="modal-glow" aria-hidden="true"></div><div id="m-body"></div></div>`;
  const body = $('#m-body', root), box = $('.modal', root);
  const done = new Promise(resolve => { modalState = { root, prev, resolve, onClose: cfg.onClose, ready: false }; });
  body.innerHTML = `<div class="m-stage" role="status"><div class="m-spin" aria-hidden="true"><i></i><i></i><i></i><svg viewBox="0 0 40 40"><rect x="10" y="18" width="20" height="14" rx="3"/><path d="M14 18v-4a6 6 0 0 1 12 0v4"/></svg></div>
    <h2 id="m-title">${esc(cfg.processing.title)}</h2><p class="muted">${esc(cfg.processing.note)}</p>
    <ul class="m-steps">${cfg.processing.steps.map(step).join('')}</ul></div>`;
  box.focus({ preventScroll: true });
  await wait(REDUCED ? 200 : 1700);
  if (!modalState) return;
  const sparksHtml = Array.from({ length: 14 }, (_, i) => `<i style="--a:${i * (360 / 14)}deg;--c:${['#ffc928', '#1b78d6', '#13b36a', '#ff6b6b', '#8a52d0'][i % 5]}"></i>`).join('');
  body.innerHTML = `<div class="m-stage m-done">
    <div class="m-badge"><span class="m-sparks" aria-hidden="true">${sparksHtml}</span><svg viewBox="0 0 52 52" aria-hidden="true"><circle class="m-circle" cx="26" cy="26" r="24"/><path class="m-tick" d="M14 27l8 8 16-17"/></svg></div>
    <h2 id="m-title">${esc(cfg.title)}</h2>
    <div class="m-big">${num(cfg.big, !!cfg.bigMoney)}${cfg.bigSuffix ? `<small>${esc(cfg.bigSuffix)}</small>` : ''}</div>
    <p class="muted" style="margin:0 0 .8rem">${esc(cfg.sub)}</p>
    <ul class="m-lines">${cfg.lines.slice(0, 5).map((l, i) => `<li style="--i:${i}">${esc(l)}</li>`).join('')}${cfg.lines.length > 5 ? `<li style="--i:5">+ ${cfg.lines.length - 5} more</li>` : ''}</ul>
    <div class="m-ref">${esc(cfg.refLabel)} <b>${esc(cfg.ref)}</b></div>
    <div class="row" style="justify-content:center"><button class="btn btn-accent" data-act="close-modal">Done</button></div></div>`;
  modalState.ready = true;
  countUp(body);
  confetti($('.confetti', root));
  $('[data-act=close-modal]', root).focus({ preventScroll: true });
  return done;
}
document.addEventListener('click', e => { if (e.target.dataset && e.target.dataset.act === 'backdrop') closeModal(); });
document.addEventListener('keydown', e => {
  if (!modalState) return;
  if (e.key === 'Escape') closeModal();
  if (e.key === 'Tab') { const f = $$('button, a[href]', $('.modal', modalState.root)); if (f.length) { e.preventDefault(); f[0].focus(); } else e.preventDefault(); }
});

// display settings 
const rootEl = document.documentElement;
let fontSize = Number(store.get('rf-font')) || 17;
const applyFont = () => { rootEl.style.setProperty('--fs', fontSize + 'px'); store.set('rf-font', fontSize); };
$('#text-larger').addEventListener('click', () => { fontSize = Math.min(24, fontSize + 2); applyFont(); });
$('#text-smaller').addEventListener('click', () => { fontSize = Math.max(14, fontSize - 2); applyFont(); });
function setContrast(on) { if (on) rootEl.dataset.hc = '1'; else delete rootEl.dataset.hc; $('#contrast-toggle').setAttribute('aria-pressed', String(on)); store.set('rf-hc', on ? '1' : '0'); }
$('#contrast-toggle').addEventListener('click', () => setContrast(rootEl.dataset.hc !== '1'));
$('#theme-toggle').addEventListener('click', () => {
  const dark = rootEl.dataset.theme ? rootEl.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  rootEl.dataset.theme = dark ? 'light' : 'dark'; store.set('rf-theme', rootEl.dataset.theme);
});
$('#menu-btn').addEventListener('click', () => { const open = $('#nav').classList.toggle('open'); $('#menu-btn').setAttribute('aria-expanded', String(open)); });
applyFont();
if (store.get('rf-hc') === '1') setContrast(true);
if (store.get('rf-theme')) rootEl.dataset.theme = store.get('rf-theme');

// start 
(async function init() {
  try { [app.cat, app.me] = await Promise.all([api('/catalogue'), api('/me')]); }
  catch (error) { main.innerHTML = `<div class="page empty"><h1>Cannot reach the server</h1><p>${esc(error.message)}</p></div>`; return; }
  route();
})();
