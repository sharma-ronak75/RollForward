const forms = {
    async donate(form, v) {
        const r = await api('/donations', { method: 'POST', body: v });
        await celebrate({
            payment: { amount: r.amount, ref: r.id },
            onPaid: () => {
                $('#receipt').innerHTML = receiptHtml(r, { embedded: true });
            },
            processing: { title: 'Recording your donation…', note: 'Please do not close this window', steps: ['Validating', 'Allocating', 'Saving'] },
            title: `Thank you, ${first(r.name)}!`,
            big: r.amount,
            bigMoney: true,
            sub: r.quantity ? `${r.quantity} × ${r.item} sponsored` : 'Your gift will help someone move forward',
            lines: r.allocations.map(a => {
                return `${money(a.amount)} → ${a.to}`;
            }),
            ref: r.id,
            refLabel: 'Receipt',
            onClose: () => {
                return $('#receipt').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
            },
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
        const items = $$('.item-row', form).map(r => {
            return ({
                type: $('[name=type]', r).value,
                condition: $('[name=condition]', r).value,
                quantity: $('[name=quantity]', r).value,
                description: $('[name=description]', r).value
            });
        });
        const k = await api('/inkind', { method: 'POST', body: { ...v, items } });
        $('#items-result').innerHTML = pledgeHtml(k, `Thank you, ${esc(first(k.name))}! Pledge ${esc(k.ref)} received`) +
            `<p class="small muted">Keep this reference. A coordinator will call or email you to arrange the hand-over. <button class="btn btn-ghost btn-sm" data-act="print">Print</button></p>`;
        form.reset();
        $$('.item-row', form).slice(1).forEach(r => {
            return r.remove();
        });
        await celebrate({
            processing: { title: 'Registering your pledge…', note: 'Just a moment', steps: ['Checking', 'Recording', 'Notifying'] },
            title: `Thank you, ${first(k.name)}!`,
            big: k.totalItems,
            bigMoney: false,
            bigSuffix: k.totalItems === 1 ? ' item pledged' : ' items pledged',
            sub: 'A coordinator will contact you to arrange the hand-over',
            lines: k.items.map(i => {
                return `${i.quantity} × ${i.type} (${i.condition})`;
            }),
            ref: k.ref,
            refLabel: 'Pledge',
            onClose: () => {
                return $('#items-result').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
            },
        });
    },
    async 'track-inkind'(form, v) {
        $('#track-result').innerHTML = pledgeHtml(await api('/inkind/track', { method: 'POST', body: v }));
    },
    async 'admin-inkind'(form, v) {
        await api('/admin/inkind/' + form.dataset.ref, { method: 'PATCH', body: v });
        toast('Pledge updated.');
        viewAdmin();
    },
    async login(form, v) {
        afterAuth(await api('/auth/login', { method: 'POST', body: v }));
    },
    async signup(form, v) {
        afterAuth(await api('/auth/signup', { method: 'POST', body: v }));
    },
    async profile(form, v) {
        app.me = await api('/me', { method: 'PATCH', body: v });
        buildChrome();
        toast('Saved.');
        viewProfile();
    },
    async password(form, v) {
        await api('/me/password', { method: 'POST', body: v });
        form.reset();
        toast('Password changed.');
    },
    async delete(form, v) {
        if (!confirm('Delete your account? This cannot be undone.')) {
            return;
        }
        await api('/me/delete', { method: 'POST', body: v });
        app.me = null;
        buildChrome();
        toast('Account deleted.');
        location.hash = '#/';
        route();
    },
    async 'admin-app'(form, v) {
        await api('/admin/applications/' + form.dataset.ref, { method: 'PATCH', body: v });
        toast('Review saved.');
        viewAdmin();
    },
    async 'admin-update'(form, v) {
        await api(`/admin/beneficiaries/${form.dataset.id}/updates`, { method: 'POST', body: v });
        toast('Update posted.');
        viewAdmin();
    },
    async 'admin-shift'(form, v) {
        await api('/admin/shifts', { method: 'POST', body: v });
        toast('Shift added.');
        viewAdmin();
    },
};

document.addEventListener('submit', async event => {
    if (event.target.closest('[data-live-filter]')) {
        return event.preventDefault();
    }
    const form = event.target.closest('form[data-form]');
    if (!form) {
        return;
    }
    event.preventDefault();
    const button = $('[type=submit]', form);
    showErrors(form, {});
    if (button) {
        button.disabled = true;
    }
    try {
        await forms[form.dataset.form](form, formValues(form));
    }
    catch (error) {
        if (!document.contains(form)) {
            return;
        }
        const fields = { ...error.fields };
        if (!Object.keys(fields).length && $('[data-err=form]', form)) {
            fields.form = error.message;
        }
        showErrors(form, fields);
        toast(error.message, true);
    } finally {
        if (button) {
            button.disabled = false;
        }
    }
});


const actions = {
    print: () => {
        return window.print();
    },
    qty(el) {
        const input = $('[name=quantity]');
        input.value = Math.max(UI_LIMITS.minimumDonationQuantity, Math.min(UI_LIMITS.maximumDonationQuantity, (Number(input.value) || UI_LIMITS.minimumDonationQuantity) + Number(el.dataset.d)));
        input.dispatchEvent(new Event('input', { bubbles: true }));
    },
    mode(el) {
        accountMode = el.dataset.mode;
        viewAccount();
    },
    'donate-tab'(el) {
        const selectedMode = el.dataset.mode;
        const tabs = $$('[data-act=donate-tab]');
        const panels = $$('[data-donate-panel]');
        const toggle = $('.seg');

        if (!toggle || !['item', 'amount'].includes(selectedMode)) {
            return;
        }

        toggle.dataset.mode = selectedMode;
        tabs.forEach(tab => {
            return tab.setAttribute('aria-selected', String(tab.dataset.mode === selectedMode));
        });
        panels.forEach(panel => {
            const visible = panel.dataset.donatePanel === selectedMode;
            panel.hidden = !visible;
            if (visible && !REDUCED) {
                panel.classList.remove('pane-in');
                void panel.offsetWidth;
                panel.classList.add('pane-in');
            }
        });

        if (selectedMode === 'amount') {
            $('.donate-amount-input')?.focus({ preventScroll: true });
        }
    },
    'quick-amt'(el) {
        const input = $('[name=amount]');
        input.value = el.dataset.amt;
        input.dispatchEvent(new Event('input', { bubbles: true }));
    },
    'close-modal'() {
        closeModal();
    },
    'add-item'() {
        const box = $('#item-rows');
        if (box.children.length >= UI_LIMITS.maximumItemsPerPledge) {
            return toast(`You can add up to ${UI_LIMITS.maximumItemsPerPledge} items per pledge.`, true);
        }
        box.insertAdjacentHTML('beforeend', itemRow());
    },
    'rm-item'(el) {
        const box = $('#item-rows');
        if (box.children.length > 1) {
            el.closest('.item-row').remove();
        }
    },
    async logout() {
        await api('/auth/logout', { method: 'POST' });
        app.me = null;
        buildChrome();
        toast('Signed out.');
        location.hash = '#/';
        route();
    },
    'acc-tab'(el) {
        accountTab = el.dataset.tab;
        $$('[data-act=acc-tab]').forEach(b => {
            return b.setAttribute('aria-selected', String(b.dataset.tab === accountTab));
        });
        profileTab();
    },
    'admin-tab'(el) {
        adminTab = el.dataset.tab;
        $$('[data-act=admin-tab]').forEach(b => {
            return b.setAttribute('aria-selected', String(b.dataset.tab === adminTab));
        });
        adminBody();
    },
    async join(el) {
        await api(`/shifts/${el.dataset.id}/join`, { method: 'POST' });
        toast('You are signed up.');
        route();
    },
    async leave(el) {
        await api(`/shifts/${el.dataset.id}/leave`, { method: 'POST' });
        toast('Cancel successful.');
        route();
    },
    async share(el) {
        const url = location.origin + '/#/b/' + el.dataset.id;
        const text = `Help fund ${el.dataset.name}'s mobility aid with Roll Forward`;
        if (navigator.share) {
            try {
                await navigator.share({ title: 'Roll Forward', text, url });
                return;
            } catch (e) {
                if (e.name === 'AbortError') {
                    return;
                }
            }
        }
        try {
            await navigator.clipboard.writeText(url);
            toast('Link copied.');
        } catch (e) {
            prompt('Copy this link:', url);
        }
    },
};
document.addEventListener('click', async event => {
    const el = event.target.closest('[data-act]');
    if (el && actions[el.dataset.act]) {
        try {
            await actions[el.dataset.act](el);
        } catch (error) {
            toast(error.message, true);
        }
    }
});
