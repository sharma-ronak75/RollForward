const historyHtml = a => {
    return `<div class="notice"><strong>${esc(a.ref)}</strong> ${statusTag(a.status)}<ul class="timeline" style="margin-top:.75rem">${[...a.history].reverse().map(h => {
        return `<li><strong>${esc(h.status)}</strong> · ${fmtDate(h.at)}<br><span class="small muted">${esc(h.note)}</span></li>`;
    }).join('')}</ul></div>`;
};

async function viewImpact() {
    const [c, supporters] = await Promise.all([api('/campaign'), api('/supporters')]);
    const largest = Math.max(1, ...c.byType.map(t => {
        return t.count;
    }));
    main.innerHTML = `<div class="page"><h1 style="font-size:2rem">Campaign impact</h1>
    <div class="stats"><div class="stat"><b>${num(c.raised)}</b>raised</div><div class="stat"><b>${num(c.aidsFunded, false)}</b>aids funded</div><div class="stat"><b>${num(c.peopleSupported, false)}</b>people supported</div><div class="stat"><b>${num(c.openApplications, false)}</b>open applications</div><div class="stat"><b>${num(c.itemsReceived, false)}</b>accessories received</div></div>
    <div class="cols"><section class="card stack"><h3>Aids funded by type</h3><div class="bars">${c.byType.map(t => {
        return `<div class="bar"><span>${esc(t.label)}</span>${bar(Math.round(t.count / largest * 100), t.label)}<strong>${t.count}</strong></div>`;
    }).join('')}</div>
      <div class="track" role="img" aria-label="90 percent equipment, 10 percent delivery and verification" style="display:flex;height:1.2rem"><i style="width:90%;background:#1b6fd1"></i><i style="width:10%;background:#e08a12"></i></div>
      </section>
    <aside class="card"><h3>Recent supporters</h3>${supporters.length ? `<ul style="padding-left:1.2rem;margin:0">${supporters.map(s => {
        return `<li>${esc(s.name)} ${s.detail ? `<span class="muted small">· ${esc(s.detail)}</span>` : ''}</li>`;
    }).join('')}</ul>` : '<p class="muted small">No supporters yet. <a href="#/items">Be the first!</a></p>'}</aside></div>
    <h2 style="margin-top:2rem">Delivered</h2>
    ${c.delivered.length ? `<div class="grid">${c.delivered.map(b => {
        return `<article class="card person"><div class="head">${avatar(b)}<div><h3><a href="#/b/${b.id}">${esc(b.name)}</a></h3><span class="tag ok">Delivered</span></div></div><strong>${esc(b.aid)}</strong>${b.updates[0] ? `<p class="muted">${esc(b.updates[0].text)}</p>` : ''}</article>`;
    }).join('')}</div>` : '<p class="muted">Delivery stories will appear here.</p>'}</div>`;
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
      <fieldset style="border:0;padding:0;margin:.5rem 0 0"><legend class="fld">Availability</legend><div class="row">${['Weekdays', 'Weekends', 'Evenings'].map(t => {
        return chk('times', t, { value: t });
    }).join('')}</div><p class="err" data-err="times"></p></fieldset>
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


const itemRow = () => {
    return `<div class="item-row card flat stack">
  <div class="grid2">${sel('type', 'Item', app.cat.accessoryTypes)}${sel('condition', 'Condition', app.cat.conditions, 'Good')}</div>
  <div class="grid2">${fld('quantity', 'Quantity', {
        type: 'number',
        value: 1,
        min: 1,
        max: 500
    })}${fld('description', 'Details', { hint: 'size, model, notes' })}</div>
  <button type="button" class="btn btn-ghost btn-sm" style="align-self:start" data-act="rm-item">Remove this item</button></div>`;
};

const pledgeHtml = (k, headline) => {
    return `<div class="notice"><div class="row between"><strong>${headline || esc(k.ref)}</strong>${statusTag(k.status)}</div>
  <p class="small muted" style="margin:.4rem 0">${esc(k.ref)} · ${fmtDate(k.createdAt)} · ${esc(k.method)}${k.pickupDate ? ` · hand-over ${fmtDay(k.pickupDate)}` : ''}</p>
  <ul style="margin:0 0 .5rem;padding-left:1.2rem">${k.items.map(i => {
        return `<li>${i.quantity} × ${esc(i.type)} <span class="muted small">(${esc(i.condition)}${i.description ? ', ' + esc(i.description) : ''})</span></li>`;
    }).join('')}</ul>
  <p class="small muted" style="margin:0">Contact: ${esc(k.name)}${k.organisation ? ', ' + esc(k.organisation) : ''} · ${esc(k.phone)} · ${esc(k.email)}<br>Address: ${esc(addressLine(k.address))}</p>
  <ul class="timeline" style="margin-top:.75rem">${[...k.history].reverse().map(h => {
        return `<li><strong>${esc(h.status)}</strong> · ${fmtDate(h.at)}<br><span class="small muted">${esc(h.note)}</span></li>`;
    }).join('')}</ul></div>`;
};

async function itemDonationPanel() {
    const user = app.me || {};
    const pledges = app.me ? await api('/me/inkind') : [];

    return `<div class="cols">
      <section>
        <h2>Donate an item</h2>
        <p class="muted">Cushions, walking aids, gloves, ramps and working used wheelchairs all help someone move more safely. Tell us what you have and how to reach you, and a coordinator will arrange the hand-over.</p>
        <form data-form="items" novalidate>
          <h3>What are you donating?</h3>
          <div id="item-rows" class="stack">${itemRow()}</div>
          <p class="err" data-err="items"></p>
          <button type="button" class="btn btn-ghost btn-sm" data-act="add-item">+ Add another item</button>

          <h3 style="margin-top:1.5rem">Your details</h3>
          <div class="grid2">${fld('name', 'Full name', { value: user.name || '', auto: 'name' })}${fld('email', 'Email', { type: 'email', value: user.email || '', auto: 'email' })}</div>
          ${fld('organisation', 'Organisation (optional)', { auto: 'organization' })}
          ${contactBlock('Address', 'Where we collect from, or where we send your acknowledgement letter.')}

          <h3 style="margin-top:1.5rem">Hand-over</h3>
          ${sel('method', 'How will the items reach us?', app.cat.methods)}
          ${fld('notes', 'Pickup times or special instructions (optional)', { rows: 2 })}
          ${chk('consent', 'I confirm these items are mine to give, clean and safe to use.')}
          ${chk('anonymous', 'Keep my name off the public supporters list')}
          <button class="btn btn-accent" style="margin-top:.75rem" type="submit">Submit item donation</button>
        </form>
        <div id="items-result"></div>
      </section>

      <aside class="stack">
        <div class="card">
          <h3>What we can use</h3>
          <ul class="muted" style="padding-left:1.2rem;margin:0">
            <li>Items that are clean, working and safe</li>
            <li>Wheelchairs with all wheels, brakes and footrests</li>
            <li>New or lightly used cushions, gloves and braces</li>
            <li>Walking sticks, crutches and walkers</li>
          </ul>
          <p class="small muted" style="margin-bottom:0">We inspect every item. Anything we cannot pass on safely is declined, and we will tell you why.</p>
        </div>

        <div class="card">
          <h3>Track a pledge</h3>
          <form data-form="track-inkind" novalidate>
            ${fld('ref', 'Reference', { hint: 'e.g. IK-1A2B3C4D' })}
            ${fld('email', 'Email used')}
            <button class="btn btn-sm" type="submit">Check status</button>
          </form>
          <div id="track-result"></div>
        </div>

        ${app.me ? `<div class="card"><h3>Your pledges</h3>${pledges.length ? pledges.map(pledge => {
            return `<p class="small"><strong>${esc(pledge.ref)}</strong> · ${pledge.totalItems} item(s)<br>${statusTag(pledge.status)}</p>`;
        }).join('') : '<p class="small muted">No item donations yet.</p>'}</div>` : ''}
      </aside>
    </div>`;
}

async function viewItems() {
    return viewDonate('item');
}

const FAQ = [
    ['Who qualifies for an aid?', 'Low-income people with a disability, including amputees and people with paralysis, blindness or cerebral palsy, who are referred by a clinic or NGO.'],
    ['How are beneficiaries vetted?', 'We confirm the referral with the clinic, then a coordinator completes a home or clinic assessment. Only then is the person approved and listed in the directory, using a first name, age and state only.'],
    ['How much can I give?', 'You can donate money from ₹100 upwards. On the Donate Us page, choose Donate money and enter an amount, or choose Donate an item to pledge useful items such as cushions, crutches or a working used wheelchair. We inspect donated items before passing them on.'],
    ['Can I fund a specific person?', 'Yes. Choose a beneficiary when making a money donation on the Donate Us page. Funds beyond their need go to other people waiting for the same type of aid, closest to complete first. If nobody else needs that aid, the money joins the general fund for the next matching request.'],
    ['How will I know it worked?', 'When an aid is delivered, the coordinator posts a dated update. Donors with an account see these under “My account”.'],
    ['Is my data private?', 'Your account password is stored as a salted scrypt hash and your session cookie is HTTP-only. You can delete your account at any time from your account settings; your gifts stay on record without your link to them.'],
    ['What physical items can I donate?', 'Yes. Use the Donate Us page to pledge cushions, walking aids, gloves, ramps, used wheelchairs and more. Give your contact number and address, choose drop-off, pickup or shipping, and a coordinator will arrange the hand-over. Items must be clean, safe and yours to give; we inspect everything before it is passed on.'],
];
function viewFaq() {
    main.innerHTML = `<div class="page" style="max-width:820px"><h1 style="font-size:2rem">Questions and answers</h1>${FAQ.map(([q, a]) => {
        return `<details class="faq"><summary>${q}</summary><p style="margin:.5rem 0 0">${a}</p></details>`;
    }).join('')}
    <p>If you wanna help more, Consider <a href="#/volunteer">Talk to a volunteer</a> or <a href="#/apply">start an application</a>.</p></div>`;
}


let accountMode = 'in';
let accountTab = 'giving';
