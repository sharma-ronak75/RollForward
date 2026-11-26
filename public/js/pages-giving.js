function receiptHtml(r, { embedded = false } = {}) {
    return `<div class="receipt" role="status">
    <div class="row between"><h3 style="margin:0">${embedded ? `Thank you, ${esc(first(r.name))}!` : 'Donation receipt'}</h3><span class="tag">${esc(r.id)}</span></div>
    <p class="muted small">${fmtDate(r.createdAt)} · ${esc(r.name)} · ${esc(r.email)}${r.phone ? ' · ' + esc(r.phone) : ''}${r.billing ? `<br>Billing address: ${esc(addressLine(r.billing))}` : ''}</p>
    <table class="data"><thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead><tbody>
      <tr><td>${esc(r.item)}</td><td>${r.quantity || '—'}</td><td>${money(r.amount)}</td></tr></tbody></table>
    <h4 style="margin:1rem 0 .25rem">Track</h4>
    <ul style="margin:0;padding-left:1.2rem">${r.allocations.map(a => {
        return `<li>${money(a.amount)} → ${a.beneficiaryId ? `<a href="#/b/${a.beneficiaryId}">${esc(a.to)}</a>` : esc(a.to)}</li>`;
    }).join('')}</ul>
    ${r.dedication ? `<p><em>In honour of ${esc(r.dedication)}</em></p>` : ''}
    <div class="row no-print"><button class="btn btn-ghost btn-sm" data-act="print">Print receipt</button>${embedded && !app.me ? '<a class="btn btn-ghost btn-sm" href="#/account">Create an account to see all your gifts</a>' : ''}</div>
  </div>`;
}

const QUICK_AMOUNTS = [
    100,
    500,
    1000,
    5000
];

async function viewDonate(initialMode = 'item', beneficiaryId = 0, initialAmount = 0) {
    const [beneficiaries, itemsPanel] = await Promise.all([
        api('/beneficiaries?hideFunded=1&sort=closest'),
        itemDonationPanel()
    ]);
    const selectedMode = initialMode === 'amount' ? 'amount' : 'item';
    const selectedBeneficiary = Number(beneficiaryId) || 0;
    const user = app.me || {};

    main.innerHTML = `<div class="page">
      <header class="stack" style="gap:.35rem;margin-bottom:1.25rem">
        <h1 style="font-size:2rem;margin:0">Donate Us</h1>
        <p class="muted" style="margin:0">Support someone's independence by donating useful mobility items or contributing money directly.</p>
      </header>

      <div class="seg" data-mode="${selectedMode}" role="tablist" aria-label="Choose how to donate">
        <span class="seg-pill" aria-hidden="true"></span>
        <button type="button" role="tab" data-act="donate-tab" data-mode="item" aria-selected="${selectedMode === 'item'}" aria-controls="donate-item-panel">Donate an item</button>
        <button type="button" role="tab" data-act="donate-tab" data-mode="amount" aria-selected="${selectedMode === 'amount'}" aria-controls="donate-money-panel">Donate money</button>
      </div>

      <section id="donate-item-panel" data-donate-panel="item" role="tabpanel" ${selectedMode === 'amount' ? 'hidden' : ''}>
        ${itemsPanel}
      </section>

      <section id="donate-money-panel" data-donate-panel="amount" role="tabpanel" ${selectedMode === 'item' ? 'hidden' : ''}>
        <div class="cols">
          <section>
            <h2>Donate money directly</h2>
            <p class="muted">Choose an amount and, if you wish, direct it to a specific beneficiary. No payment method is required in this demo. Confirming records the donation in the app.</p>
            <form data-form="donate" novalidate>
              <input type="hidden" name="mode" value="amount">

              <label class="fld">
                <span>Amount you would like to give <small>minimum ${money(app.cat.minGift)}</small></span>
                <div class="amt-wrap"><b aria-hidden="true">₹</b><input class="donate-amount-input" name="amount" type="number" min="${app.cat.minGift}" max="${app.cat.maxGift}" step="1" inputmode="numeric" placeholder="500" value="${initialAmount || ''}"></div>
              </label>
              <p class="err" data-err="amount"></p>
              <div class="row qchips" role="group" aria-label="Quick amounts">${QUICK_AMOUNTS.map(amount => {
                  return `<button type="button" class="qchip" data-act="quick-amt" data-amt="${amount}">${money(amount)}</button>`;
              }).join('')}</div>

              ${sel('beneficiaryId', 'Direct your donation to', [[0, 'Any beneficiary (fastest match)'], ...beneficiaries.map(beneficiary => {
                  return [beneficiary.id, `${beneficiary.name} - ${beneficiary.aid} (${money(beneficiary.remaining)} left)`];
              })], selectedBeneficiary)}
              <div class="grid2">${fld('name', 'Your name', { value: user.name || '', auto: 'name' })}${fld('email', 'Email for receipt', { type: 'email', value: user.email || '', auto: 'email' })}</div>
              ${contactBlock('Billing details', 'Used on your receipt. We never show it publicly.')}
              ${fld('dedication', 'In honour of (optional)', { hint: 'shown on your receipt' })}
              ${chk('anonymous', 'Keep my name off the public supporters list')}
              <p class="notice" id="summary" style="margin:1rem 0" aria-live="polite"></p>
              <button class="btn btn-accent" type="submit">Confirm donation</button>
            </form>
            <div id="receipt"></div>
          </section>

          <aside class="card stack">
            <h3>How your donation helps</h3>
            <p class="muted">Your donation goes to the person you choose first. If they need less than you give, the rest goes to others waiting, closest to complete first.</p>
            <p class="muted">90% buys equipment; 10% covers delivery and verification.</p>
          </aside>
        </div>
      </section>
    </div>`;

    const form = $('[data-form=donate]');
    const update = () => {
        const values = formValues(form);
        const amount = Math.floor(Number(values.amount)) || 0;
        const beneficiary = beneficiaries.find(person => {
            return person.id === Number(values.beneficiaryId);
        });

        $$('.qchip', form).forEach(chip => {
            return chip.classList.toggle('on', Number(chip.dataset.amt) === amount);
        });

        let summary = amount
            ? `<strong>Total: ${money(amount)}</strong> (money donation)`
            : '<strong>Enter an amount to see your total.</strong>';

        if (beneficiary && amount) {
            summary += `<br><span class="small muted">${esc(first(beneficiary.name))} needs ${money(beneficiary.remaining)} more${amount > beneficiary.remaining ? `; the extra ${money(amount - beneficiary.remaining)} goes to others waiting.` : '.'}</span>`;
        }

        $('#summary').innerHTML = summary;
    };

    form.addEventListener('input', update);
    form._update = update;
    update();
}

async function viewGive(id) {
    const mode = id ? 'amount' : 'item';
    return viewDonate(mode, Number(id) || 0);
}

async function viewReceipt(id) {
    if (!app.me) {
        return viewAccount();
    }
    try {
        main.innerHTML = `<div class="page" style="max-width:640px">${receiptHtml(await api('/donations/' + id))}<p class="no-print"><a href="#/account">← My account</a></p></div>`;
    }
    catch (e) {
        notFound(e.message);
    }
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
        ${sel('disability', 'Disability type', app.cat.disabilities)}${sel('aid', 'Aid needed', Object.values(app.cat.aids).map(a => {
        return a.name;
    }))}
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
      ${app.me ? `<div class="card"><h3>Your applications</h3>${mine.length ? mine.map(a => {
        return `<p class="small"><strong>${esc(a.ref)}</strong> ${esc(a.name)}, ${esc(a.aid)}<br>${statusTag(a.status)}</p>`;
    }).join('') : '<p class="small muted">None yet.</p>'}</div>` : ''}
    </aside></div></div>`;
}
