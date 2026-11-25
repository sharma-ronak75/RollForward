async function viewAccount() {
    if (app.me) {
        return viewProfile();
    }
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
    const tabs = [
        ['giving', 'My giving'],
        ['items', 'Item pledges'],
        ['applications', 'Applications'],
        ['shifts', 'Shifts'],
        ['settings', 'Settings']
    ];
    main.innerHTML = `<div class="page"><div class="section-head"><div><h1 style="font-size:2rem;margin:0">Welcome, ${esc(first(u.name))}</h1><span class="tag">${esc(u.role)}</span> <span class="tag">${esc(u.email)}</span></div>
    <div class="row">${isAdmin() ? '<a class="btn btn-accent btn-sm" href="#/admin">Admin console</a>' : ''}<button class="btn btn-ghost btn-sm" data-act="logout">Sign out</button></div></div>
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => {
        return `<button role="tab" data-act="acc-tab" data-tab="${k}" aria-selected="${accountTab === k}">${l}</button>`;
    }).join('')}</div><div id="tab-body"><p class="loading">Loading…</p></div></div>`;
    await profileTab();
}
let tabToken = 0;
async function profileTab() {
    const u = app.me;
    const t = ++tabToken;
    const body = $('#tab-body');
    if (!body) {
        return;
    }
    body.innerHTML = '<p class="loading"><span class="spinner"></span>Loading…</p>';
    const html = await profileTabHtml(u);
    if (t !== tabToken || !document.contains(body)) {
        return;
    }
    body.innerHTML = html;
    tabFx(body);
}
async function profileTabHtml(u) {
    const body = { innerHTML: '' };

    if (accountTab === 'giving') {
        const [gifts, impact] = await Promise.all([api('/me/donations'), api('/me/impact')]);
        const total = gifts.reduce((s, g) => {
            return s + g.amount;
        }, 0);
        const aids = gifts.reduce((s, g) => {
            return s + g.quantity;
        }, 0);
        body.innerHTML = `<div class="stats"><div class="stat"><b>${num(total)}</b>given</div><div class="stat"><b>${num(aids, false)}</b>aids funded</div><div class="stat"><b>${num(impact.filter(b => {
            return b.status === 'Delivered';
        }).length, false)}</b>delivered</div></div>
      <div class="cols"><section class="card"><h3>Your gifts</h3>${gifts.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Item</th><th>Amount</th><th></th></tr></thead><tbody>${gifts.map(g => {
            return `<tr><td>${fmtDate(g.createdAt)}</td><td>${g.quantity ? g.quantity + ' × ' : ''}${esc(g.item)}</td><td>${money(g.amount)}</td><td><a href="#/receipt/${esc(g.id)}">Receipt</a></td></tr>`;
        }).join('')}</tbody></table></div>` : '<p class="empty">No gifts yet. <a href="#/items">Donate Us</a></p>'}</section>
      <aside class="card"><h3>People you helped</h3>${impact.length ? impact.map(b => {
            return `<div class="stack" style="margin-bottom:1rem"><div class="row">${avatar(b)}<div><a href="#/b/${b.id}"><strong>${esc(b.name)}</strong></a><br>${statusTag(b.status)}</div></div>${b.updates[0] ? `<p class="small muted">${fmtDate(b.updates[0].at)}: ${esc(b.updates[0].text)}</p>` : bar(b.percent, 'Funding')}</div>`;
        }).join('') : '<p class="muted small">Updates on the people you fund will appear here.</p>'}</aside></div>`;
    } else if (accountTab === 'items') {
        const list = await api('/me/inkind');
        body.innerHTML = list.length ? list.map(k => {
            return pledgeHtml(k, `${k.totalItems} item(s)`);
        }).join('') : '<p class="empty">No item pledges yet. <a href="#/items">Donate accessories</a></p>';
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


let adminTab = 'overview';
async function viewAdmin() {
    if (!isAdmin()) {
        return notFound('Administrators only.');
    }
    const tabs = [
        ['overview', 'Overview'],
        ['applications', 'Applications'],
        ['aids', 'Beneficiaries'],
        ['donations', 'Donations'],
        ['items', 'Item pledges'],
        ['volunteers', 'Volunteers']
    ];
    main.innerHTML = `<div class="page"><h1 style="font-size:2rem">Admin console</h1><div class="tabs" role="tablist">${tabs.map(([k, l]) => {
        return `<button role="tab" data-act="admin-tab" data-tab="${k}" aria-selected="${adminTab === k}">${l}</button>`;
    }).join('')}</div><div id="tab-body"><p class="loading">Loading…</p></div></div>`;
    await adminBody();
}
async function adminBody() {
    const t = ++tabToken;
    const host = $('#tab-body');
    if (!host) {
        return;
    }
    host.innerHTML = '<p class="loading"><span class="spinner"></span>Loading…</p>';
    const html = await adminBodyHtml();
    if (t !== tabToken || !document.contains(host)) {
        return;
    }
    host.innerHTML = html;
    tabFx(host);
}
async function adminBodyHtml() {
    const body = { innerHTML: '' };

    if (adminTab === 'overview') {
        const s = await api('/admin/summary');
        const peak = Math.max(1, ...s.perDay.map(d => {
            return d.amount;
        }));
        body.innerHTML = `<div class="stats"><div class="stat"><b>${num(s.raised)}</b>campaign total</div><div class="stat"><b>${num(s.donations, false)}</b>gifts recorded</div><div class="stat"><b>${num(s.average)}</b>average gift</div><div class="stat"><b>${num(s.users, false)}</b>accounts</div><div class="stat"><b>${num(s.generalFund)}</b>unallocated fund</div></div>
      <div class="cols"><section class="card stack"><h3>Gifts, last ${UI_LIMITS.adminDonationChartDays} days</h3><div class="days" role="img" aria-label="Daily gift totals">${s.perDay.map(d => {
            return `<div title="${d.day}: ${money(d.amount)}" style="height:${Math.max(3, d.amount / peak * 100)}%"></div>`;
        }).join('')}</div>
        <h3>Still needed by aid type</h3><div class="bars">${s.needByAid.map(n => {
            return `<div class="row between"><span>${esc(n.label)}</span><strong>${money(n.need)}</strong></div>`;
        }).join('')}</div></section>
        <aside class="stack"><div class="card"><h3>Applications</h3>${s.applicationsByStatus.map(a => {
            return `<div class="row between"><span>${esc(a.status)}</span><strong>${a.count}</strong></div>`;
        }).join('')}</div>
        <div class="card"><h3>Accessory pledges</h3>${s.inKindByStatus.map(a => {
            return `<div class="row between"><span>${esc(a.status)}</span><strong>${a.count}</strong></div>`;
        }).join('')}</div>
        <div class="card"><h3>Funded, awaiting delivery</h3>${s.awaitingDelivery.length ? s.awaitingDelivery.map(b => {
            return `<p style="margin:.25rem 0">${esc(b.name)} · ${esc(b.aid)}</p>`;
        }).join('') + '<p class="small muted">Post a delivery update under Beneficiaries.</p>' : '<p class="small muted">Nothing waiting.</p>'}</div></aside></div>`;
    } else if (adminTab === 'applications') {
        const list = await api('/admin/applications');
        body.innerHTML = list.length ? list.map(a => {
            return `<form class="card stack" style="margin-bottom:1rem" data-form="admin-app" data-ref="${esc(a.ref)}" novalidate>
      <div class="row between"><h3 style="margin:0">${esc(a.name)}, ${a.age} · ${esc(a.aid)}</h3>${statusTag(a.status)}</div>
      <p class="small muted" style="margin:0">${esc(a.ref)} · ${fmtDate(a.createdAt)} · ${esc(a.state)} · ${esc(a.contact)}<br>${esc(a.disability)} · referred by ${esc(a.referrer)}</p>
      <p>${esc(a.story)}</p>
      <div class="grid2">${sel('status', 'Status', app.cat.statuses, a.status)}${fld('note', 'Note for the applicant (optional)')}</div>
      ${a.beneficiaryId ? `<p class="small">Listed as <a href="#/b/${a.beneficiaryId}">beneficiary #${a.beneficiaryId}</a>.</p>` : fld('publicStory', 'Public story', { rows: 2, hint: 'required to approve · first name only, no surnames or contact details' })}
      <button class="btn btn-sm" style="align-self:start" type="submit">Save review</button></form>`;
        }).join('') : '<p class="empty">No applications yet.</p>';
    } else if (adminTab === 'aids') {
        const list = await api('/admin/beneficiaries');
        body.innerHTML = `<div class="grid">${list.map(b => {
            return `<form class="card stack" data-form="admin-update" data-id="${b.id}" novalidate>
      <div class="row">${avatar(b)}<div><strong>${esc(b.name)}</strong> · ${esc(b.aid)}<br>${statusTag(b.status)} <span class="small muted">${money(b.raised)} / ${money(b.cost)}</span></div></div>
      ${b.updates[0] ? `<p class="small muted" style="margin:0">Latest: ${esc(b.updates[0].text)}</p>` : ''}
      ${fld('text', 'Post an update', { rows: 2 })}
      ${b.remaining === 0 && b.status !== 'Delivered' ? chk('delivered', 'Mark as delivered') : ''}
      <button class="btn btn-sm" style="align-self:start" type="submit">Post update</button></form>`;
        }).join('')}</div>`;
    } else if (adminTab === 'items') {
        const list = await api('/admin/inkind');
        body.innerHTML = `<div class="row between" style="margin-bottom:.75rem"><span class="muted">${list.length} pledges</span><a class="btn btn-sm" href="/api/admin/inkind.csv" download>Download CSV</a></div>` +
            (list.length ? list.map(k => {
                return `<form class="card stack" style="margin-bottom:1rem" data-form="admin-inkind" data-ref="${esc(k.ref)}" novalidate>${pledgeHtml(k, `${k.totalItems} item(s) from ${esc(k.name)}`)}
        <div class="grid2">${sel('status', 'Status', app.cat.inKindStatuses, k.status)}${fld('pickupDate', 'Hand-over date', { type: 'date', value: k.pickupDate })}</div>${fld('note', 'Note for the donor (optional)')}
        <button class="btn btn-sm" style="align-self:start" type="submit">Save</button></form>`;
            }).join('') : '<p class="empty">No pledges yet.</p>');
    } else if (adminTab === 'donations') {
        const list = await api('/admin/donations');
        body.innerHTML = `<div class="row between" style="margin-bottom:.75rem"><span class="muted">${list.length} gifts</span><a class="btn btn-sm" href="/api/admin/donations.csv" download>Download CSV</a></div>
      <div class="card table-wrap">${list.length ? `<table class="data"><thead><tr><th>Receipt</th><th>Date</th><th>Donor</th><th>Item</th><th>Amount</th><th>Allocation</th></tr></thead><tbody>${list.map(d => {
            return `<tr><td>${esc(d.id)}</td><td>${fmtDate(d.createdAt)}</td><td>${esc(d.name)}<br><span class="small muted">${esc(d.email)}${d.phone ? ' · ' + esc(d.phone) : ''}${d.anonymous ? ' · anonymous' : ''}<br>${esc(addressLine(d.billing))}</span></td><td>${d.quantity ? d.quantity + ' × ' : ''}${esc(d.item)}</td><td>${money(d.amount)}</td><td class="small">${d.allocations.map(a => {
                return `${money(a.amount)} → ${esc(a.to)}`;
            }).join('<br>')}</td></tr>`;
        }).join('')}</tbody></table>` : '<p class="empty">No gifts yet.</p>'}</div>`;
    } else {
        const v = await api('/admin/volunteers');
        body.innerHTML = `<div class="cols"><section class="stack"><h3>Shifts</h3>${v.shifts.map(s => {
            return `<div class="card"><div class="row between"><strong>${esc(s.title)}</strong><span class="tag">${s.taken}/${s.capacity}</span></div><p class="small muted" style="margin:0">${fmtDay(s.date)} · ${esc(s.time)} · ${esc(s.location)}</p>${s.signups.length ? `<p class="small" style="margin:.4rem 0 0">${s.signups.map(x => {
                return esc(x.name);
            }).join(', ')}</p>` : ''}</div>`;
        }).join('')}
      <h3>Interest register</h3><div class="card table-wrap">${v.interests.length ? `<table class="data"><thead><tr><th>Name</th><th>Role</th><th>Availability</th></tr></thead><tbody>${v.interests.map(i => {
            return `<tr><td>${esc(i.name)}<br><span class="small muted">${esc(i.email)}</span></td><td>${esc(i.role)}</td><td>${esc(i.times.join(', '))}</td></tr>`;
        }).join('')}</tbody></table>` : '<p class="empty">No sign-ups yet.</p>'}</div></section>
      <form class="card" data-form="admin-shift" novalidate><h3>Add a shift</h3>${fld('title', 'Title')}${sel('role', 'Role', app.cat.volunteerRoles)}<div class="grid2">${fld('date', 'Date', { type: 'date' })}${fld('time', 'Time', { hint: 'e.g. 09:00-13:00' })}</div>${fld('location', 'Location')}${fld('capacity', 'Capacity', {
            type: 'number',
            value: 5,
            min: 1,
            max: 200
        })}<button class="btn btn-sm" type="submit">Add shift</button></form></div>`;
    }
    return body.innerHTML;
}

function notFound(msg = 'Page not found.') {
    main.innerHTML = `<div class="page empty"><h1>${esc(msg)}</h1><p><a class="btn" href="#/">Back to home</a></p></div>`;
}


const afterAuth = user => {
    app.me = user;
    buildChrome();
    location.hash = '#/account';
    viewAccount();
};
