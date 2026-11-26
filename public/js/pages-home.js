async function viewHome() {
    const camp = await api('/campaign');
    main.innerHTML = `
  <section class="hero"><span class="orb o1"></span><span class="orb o2"></span><span class="orb o3"></span>${wheelSvg()}
    <div class="wrap">
      <div>
        <h1>Restoring mobility, independence and livelihoods</h1>
        <p class="lead">Roll Forward funds wheelchairs, tricycles, crutches, artificial limbs and white canes for low-income people with disabilities. Every aid is matched to a verified beneficiary and delivered through volunteers.</p>
        <div class="row"><a class="btn btn-accent" href="#/items">Donate Us</a><a class="btn btn-light" href="#/directory">Meet the beneficiaries</a></div>
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
      <div class="card step flat"><h3>Choose how to help</h3><p class="muted">Fund one specific beneficiary, donate a physical item or give any amount and we match it to the person closest to being funded.</p></div>
      <div class="card step flat"><h3>We deliver</h3><p class="muted">Once an aid is fully funded it is bought, assembled and delivered through a partner clinic.</p></div>
      <div class="card step flat"><h3>You see the result</h3><p class="muted">When an aid is delivered you get a dated update on your account, with the beneficiary's progress.</p></div>
    </div>
    <div class="band" style="margin-top:2.5rem"><div><h2 style="margin:0">Just ₹100 can change someones's life</h2><p style="margin:.25rem 0 0">Every donation counts. Donate now!</p></div><div class="row"><a class="btn btn-accent" href="#/items/amount/100">Donate ₹100</a><a class="btn btn-light" href="#/items">Donate Us</a></div></div>
  </div>`;
}

const dirFilters = {
    q: '',
    disability: '',
    aid: '',
    sort: 'closest',
    hideFunded: false
};

async function viewDirectory() {
    const cat = app.cat;
    main.innerHTML = `<div class="page"><h1 style="font-size:2rem">Vetted beneficiary requests</h1>
    <form class="filters" data-live-filter>
      ${fld('q', 'Search name, state or story', { value: dirFilters.q })}
      ${sel('disability', 'Disability type', [['', 'All'], ...cat.disabilities.filter(d => {
        return d !== 'Other';
    })], dirFilters.disability)}
      ${sel('aid', 'Aid needed', [['', 'All'], ...Object.values(cat.aids).map(a => {
        return a.name;
    })], dirFilters.aid)}
      ${sel('sort', 'Sort by', [
        ['closest', 'Closest to funded'],
        ['least', 'Least funded'],
        ['cheapest', 'Lowest cost'],
        ['newest', 'Newest']
    ], dirFilters.sort)}
    </form>
    <label class="check" style="margin:0 0 .5rem"><input type="checkbox" id="hide-funded" ${dirFilters.hideFunded ? 'checked' : ''}> <span>Hide fully funded</span></label>
    <p id="count" class="small muted" aria-live="polite"></p>
    <div id="list" class="grid"></div></div>`;
    const draw = async () => {
        const qs = new URLSearchParams({
            q: dirFilters.q,
            disability: dirFilters.disability,
            aid: dirFilters.aid,
            sort: dirFilters.sort,
            hideFunded: dirFilters.hideFunded ? '1' : ''
        });
        const list = await api('/beneficiaries?' + qs);
        $('#count').textContent = `${list.length} ${list.length === 1 ? 'beneficiary' : 'beneficiaries'} shown`;
        $('#list').innerHTML = list.map(personCard).join('') || '<p class="empty" style="grid-column:1/-1">No matches. Clear a filter or try a different search.</p>';
        stagger(REDUCED ? [] : [...$('#list').children]);
    };
    let timer;
    const onChange = () => {
        const v = formValues($('[data-live-filter]'));
        Object.assign(dirFilters, {
            q: v.q,
            disability: v.disability,
            aid: v.aid,
            sort: v.sort,
            hideFunded: $('#hide-funded').checked
        });
        clearTimeout(timer);
        timer = setTimeout(() => {
            return draw().catch(e => {
                return toast(e.message, true);
            });
        }, UI_TIMINGS.filterDebounceMs);
    };
    $('[data-live-filter]').addEventListener('input', onChange);
    $('#hide-funded').addEventListener('change', onChange);
    await draw();
}

async function viewDetail(id) {
    let b;
    try {
        b = await api('/beneficiaries/' + id);
    } catch (e) {
        return notFound('That beneficiary could not be found.');
    }
    main.innerHTML = `<div class="page"><p><a href="#/directory">← All beneficiaries</a></p>
    <div class="cols"><section class="stack">
      <div class="row">${avatar(b)}<div><h1 style="margin:0;font-size:2rem">${esc(b.name)}</h1><div class="age">Age: ${b.age}</div></div></div>
      <p class="meta">${esc(b.disability)} · ${esc(b.state)} ${statusTag(b.status)}</p>
      <p style="font-size:1.1rem">${esc(b.story)}</p>
      <h2>Updates</h2>
      ${b.updates.length ? `<ul class="timeline">${b.updates.map(u => {
        return `<li><strong>${fmtDate(u.at)}</strong><br>${esc(u.text)}</li>`;
    }).join('')}</ul>`
            : '<p class="muted">No updates yet. Donors are notified here when funding completes and the aid is delivered.</p>'}
    </section>
    <aside class="card stack"><h3>${esc(b.aid)}</h3>
      <div class="big">${money(b.raised)} <span class="small muted">of ${money(b.cost)}</span></div>
      ${bar(b.percent, 'Funding for ' + b.name)}
      <p class="small muted">${b.donors} supporter${b.donors === 1 ? '' : 's'} so far${b.remaining ? ` · ${money(b.remaining)} still needed` : ''}</p>
      ${b.status === 'Seeking funds' ? `<a class="btn btn-block" href="#/items/${b.id}">Fund ${esc(first(b.name))}'s aid</a>` : ''}
      <button class="btn btn-ghost btn-block" data-act="share" data-id="${b.id}" data-name="${esc(first(b.name))}">Share this page</button>
    </aside></div></div>`;
}
