'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-'));

class Client {
    constructor() {
        this.cookie = '';
    }
    async call(method, url, body, raw) {
        const res = await fetch(BASE + url, {
            method, headers: { 'Content-Type': 'application/json', Cookie: this.cookie },
            body: method === 'GET' ? undefined : JSON.stringify(body || {}),
        });
        const set = res.headers.get('set-cookie');
        if (set) {
            this.cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
        }
        if (raw) {
            return { status: res.status, text: await res.text(), headers: res.headers };
        }
        return {
            status: res.status, data: await res.json().catch(() => {
                return null;
            })
        };
    }
}

const BILL = {
    phone: '+91 98765 43210',
    line1: '12 Park Street',
    city: 'Kolkata',
    postcode: '700016',
    country: 'India'
};

async function main() {
    const proc = spawn('node', [path.join(__dirname, '..', 'server.js')], {
        env: {
            ...process.env,
            PORT,
            DATA_DIR: dir,
            ADMIN_PASSWORD: 'adminpass123'
        }, stdio: 'ignore'
    });
    try {
        for (let i = 0; i < 50; i++) {
            try {
                await fetch(BASE + '/api/health');
                break;
            } catch (e) {
                await new Promise(r => {
                    return setTimeout(r, 100);
                });
            }
        }

        const anon = new Client();
        const donor = new Client();
        const admin = new Client();
        let r;

        r = await anon.call('GET', '/api/campaign');
        assert.equal(r.data.raised, 0, 'campaign starts at zero');
        assert.equal(r.data.goal, 500000);
        assert.equal((await anon.call('GET', '/api/beneficiaries')).data.length, 5, 'five beneficiaries');
        assert.ok((await anon.call('GET', '/api/beneficiaries')).data.every(b => {
            return b.raised === 0 && b.age > 0 && !/Person/.test(b.name);
        }));
        r = await anon.call('GET', '/api/catalogue');
        assert.ok(r.data.states.includes('Punjab'));
        assert.ok(!JSON.stringify(r.data).includes('Orthopedic'), 'no orthopedic wording in catalogue');
        assert.equal(r.data.aids.chair.name, 'Wheelchair');


        r = await anon.call('POST', '/api/donations', {
            option: 'chair',
            quantity: 1,
            name: '',
            email: 'bad'
        });
        assert.equal(r.status, 400);
        assert.ok(r.data.fields.name && r.data.fields.email);
        r = await anon.call('POST', '/api/donations', {
            option: 'cane',
            quantity: 1,
            beneficiaryId: 5,
            name: 'X',
            email: 'x@y.org',
            ...BILL
        });
        assert.equal(r.status, 201, 'white cane fully funds Lakshmi');
        r = await anon.call('POST', '/api/donations', {
            option: 'cane',
            quantity: 1,
            beneficiaryId: 5,
            name: 'X',
            email: 'x@y.org',
            ...BILL
        });
        assert.equal(r.status, 400, 'fully funded beneficiary rejected');

        r = await anon.call('POST', '/api/donations', {
            option: 'chair',
            quantity: 2,
            beneficiaryId: 2,
            name: 'Guest',
            email: 'g@y.org',
            ...BILL
        });
        assert.equal(r.status, 201);
        assert.equal(r.data.amount, 14250);

        assert.equal(r.data.allocations[0].amount, 7125);
        assert.equal(r.data.allocations.length, 2);
        assert.equal(r.data.allocations.reduce((s, a) => {
            return s + a.amount;
        }, 0), 14250);
        assert.equal((await anon.call('GET', '/api/beneficiaries/2')).data.status, 'Funded');
        assert.equal((await anon.call('GET', '/api/campaign')).data.raised, 14750);


        r = await donor.call('POST', '/api/auth/signup', {
            name: 'Dana Lee',
            email: 'Dana@Example.com',
            password: 'short',
            terms: true
        });
        assert.equal(r.status, 400);
        r = await donor.call('POST', '/api/auth/signup', {
            name: 'Dana Lee',
            email: 'Dana@Example.com',
            password: 'longenough1',
            terms: true,
            role: 'admin'
        });
        assert.equal(r.status, 201);
        assert.equal(r.data.role, 'donor', 'cannot self-assign admin');
        r = await new Client().call('POST', '/api/auth/signup', {
            name: 'Tech Person',
            email: 'tech@example.com',
            password: 'longenough1',
            terms: true,
            role: 'technician'
        });
        assert.equal(r.data.role, 'donor', 'technician role no longer exists');
        r = await new Client().call('POST', '/api/auth/signup', {
            name: 'Vol Person',
            email: 'vol@example.com',
            password: 'longenough1',
            terms: true,
            role: 'volunteer'
        });
        assert.equal(r.data.role, 'volunteer');
        assert.equal((await donor.call('GET', '/api/me')).data.email, 'dana@example.com');
        r = await new Client().call('POST', '/api/auth/signup', {
            name: 'Dana Lee',
            email: 'dana@example.com',
            password: 'longenough1',
            terms: true
        });
        assert.equal(r.status, 409);
        r = await new Client().call('POST', '/api/auth/login', { email: 'dana@example.com', password: 'wrong' });
        assert.equal(r.status, 401);

        r = await donor.call('POST', '/api/donations', {
            option: 'trike',
            quantity: 1,
            beneficiaryId: 3,
            anonymous: true,
            dedication: 'In honour of Mum',
            name: 'Dana Lee',
            email: 'dana@example.com',
            ...BILL
        });
        assert.equal(r.status, 201);
        const receiptId = r.data.id;
        assert.equal((await donor.call('GET', '/api/me/donations')).data.length, 1);
        assert.equal((await donor.call('GET', '/api/me/impact')).data[0].id, 3);
        assert.equal((await donor.call('GET', '/api/donations/' + receiptId)).status, 200);
        assert.equal((await anon.call('GET', '/api/donations/' + receiptId)).status, 401);
        assert.ok((await anon.call('GET', '/api/supporters')).data.some(s => {
            return s.name === 'Anonymous supporter';
        }));


        const AMT = {
            mode: 'amount',
            name: 'Amit',
            email: 'amit@example.com',
            ...BILL
        };
        r = await anon.call('POST', '/api/donations', { ...AMT, amount: 50 });
        assert.equal(r.status, 400);
        assert.ok(r.data.fields.amount, 'below minimum rejected');
        r = await anon.call('POST', '/api/donations', { ...AMT, amount: 'abc' });
        assert.equal(r.status, 400);
        assert.ok(r.data.fields.amount);
        r = await anon.call('POST', '/api/donations', {
            ...AMT,
            amount: 100,
            name: '',
            phone: '1'
        });
        assert.equal(r.status, 400);
        assert.ok(r.data.fields.name && r.data.fields.phone, 'billing still required');
        r = await anon.call('POST', '/api/donations', { ...AMT, amount: 1000, beneficiaryId: 1 });
        assert.equal(r.status, 201);
        assert.equal(r.data.amount, 1000);
        assert.equal(r.data.item, 'General donation');
        assert.equal(r.data.quantity, 0);
        assert.deepEqual(r.data.allocations.map(a => {
            return [a.beneficiaryId, a.amount];
        }), [[1, 1000]]);
        r = await anon.call('POST', '/api/donations', { ...AMT, amount: 600 });
        assert.equal(r.status, 201);
        assert.equal(r.data.allocations[0].beneficiaryId, 1, 'general gift goes to the only beneficiary still open (Rajesh)');
        assert.equal((await anon.call('POST', '/api/donations', { ...AMT, amount: 600, beneficiaryId: 5 })).status, 400, 'funded beneficiary rejected in amount mode too');


        r = await anon.call('POST', '/api/donations', {
            option: 'chair',
            quantity: 1,
            name: 'N',
            email: 'n@y.org',
            phone: '12',
            postcode: '!'
        });
        assert.equal(r.status, 400);
        assert.ok(r.data.fields.phone && r.data.fields.line1 && r.data.fields.postcode && r.data.fields.city && r.data.fields.country);
        assert.equal((await donor.call('GET', '/api/donations/' + receiptId)).data.billing.city, 'Kolkata');


        const kind = {
            name: 'Sam Roy',
            email: 'sam@example.com',
            organisation: 'Roy Medical',
            ...BILL,
            method: 'Courier',
            consent: true,
            items: [{ type: 'Wheelchair cushion', quantity: 4, condition: 'Like new' }, { type: 'Walker / rollator', quantity: 2, condition: 'Good' }]
        };
        r = await anon.call('POST', '/api/inkind', {
            ...kind,
            items: [{ type: 'Other', quantity: 1, condition: 'New' }],
            consent: false,
            phone: 'abc'
        });
        assert.equal(r.status, 400);
        assert.ok(r.data.fields.items && r.data.fields.consent && r.data.fields.phone);
        r = await anon.call('POST', '/api/inkind', kind);
        assert.equal(r.status, 201);
        assert.equal(r.data.totalItems, 6);
        assert.equal(r.data.status, 'Pledged');
        const ik = r.data.ref;
        assert.equal((await anon.call('POST', '/api/inkind/track', { ref: ik, email: 'other@x.org' })).status, 404);
        assert.equal((await anon.call('POST', '/api/inkind/track', { ref: ik, email: 'SAM@example.com' })).data.ref, ik);
        r = await donor.call('POST', '/api/inkind', { ...kind, email: 'dana@example.com', name: 'Dana Lee' });
        assert.equal((await donor.call('GET', '/api/me/inkind')).data.length, 1);


        assert.equal((await donor.call('GET', '/api/admin/summary')).status, 403);
        r = await fetch(BASE + '/api/donations', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
        assert.equal(r.status, 415);
        r = await fetch(BASE + '/api/donations', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{}' });
        assert.equal(r.status, 403);
        r = await fetch(BASE + '/../server.js');
        assert.notEqual(r.status, 200);
        r = await fetch(BASE + '/%2e%2e/server.js');
        assert.notEqual(r.status, 200);


        const form = {
            name: 'Gita Devi',
            age: 30,
            state: 'Punjab',
            contact: 'gita@example.com',
            disability: 'Amputee',
            aid: 'Artificial Limb',
            referrer: 'District Hospital',
            story: 'I lost my leg two years ago and need a prosthetic to resume my work.',
            consent: true
        };
        r = await anon.call('POST', '/api/applications', { ...form, story: 'short' });
        assert.equal(r.status, 400);
        r = await anon.call('POST', '/api/applications', { ...form, state: 'Atlantis' });
        assert.equal(r.status, 400);
        assert.ok(r.data.fields.state, 'state must be an Indian state');
        r = await anon.call('POST', '/api/applications', form);
        assert.equal(r.status, 200);
        const ref = r.data.ref;
        assert.equal((await anon.call('POST', '/api/applications/track', { ref, contact: 'wrong@x.org' })).status, 404);
        assert.equal((await anon.call('POST', '/api/applications/track', { ref, contact: 'GITA@example.com' })).data.status, 'Received');


        r = await admin.call('POST', '/api/auth/login', { email: 'admin@rollforward.local', password: 'adminpass123' });
        assert.equal(r.data.role, 'admin');
        r = await admin.call('PATCH', '/api/admin/applications/' + ref, { status: 'Approved' });
        assert.equal(r.status, 400, 'approval needs public story');
        r = await admin.call('PATCH', '/api/admin/applications/' + ref, { status: 'Approved', note: 'Home visit done', publicStory: 'A shop owner who needs an artificial limb to stand at her counter again.' });
        assert.equal(r.status, 200);
        const created = (await anon.call('GET', '/api/beneficiaries?q=gita')).data[0];
        assert.equal(created.name, 'Gita');
        assert.equal(created.age, 30);
        assert.equal(created.state, 'Punjab');
        assert.equal(created.cost, 14250);
        assert.ok(!JSON.stringify(created).includes('Devi'));
        assert.equal((await anon.call('POST', '/api/applications/track', { ref, contact: 'gita@example.com' })).data.history.length, 2);

        r = await admin.call('POST', '/api/admin/beneficiaries/2/updates', { text: 'Wheelchair delivered to Meena.', delivered: true });
        assert.equal(r.data.status, 'Delivered');
        r = await admin.call('POST', '/api/admin/beneficiaries/1/updates', { text: 'Fitting booked next week.', delivered: true });
        assert.equal(r.status, 400, 'cannot deliver unfunded aid');

        r = await admin.call('GET', '/api/admin/donations.csv', null, true);
        assert.ok(r.text.startsWith('Receipt,Date'));
        assert.ok(r.headers.get('content-disposition').includes('donations.csv'));
        assert.equal((await admin.call('GET', '/api/admin/summary')).data.donations, 5);
        assert.ok(r.text.includes('General donation'), 'amount gifts appear in the CSV');

        r = await admin.call('PATCH', '/api/admin/inkind/' + ik, { status: 'Arrangement confirmed' });
        assert.equal(r.status, 400, 'date required');
        r = await admin.call('PATCH', '/api/admin/inkind/' + ik, { status: 'Arrangement confirmed', pickupDate: '2026-12-05', note: 'Courier booked' });
        assert.equal(r.data.history.length, 2);
        assert.equal((await admin.call('PATCH', '/api/admin/inkind/' + ik, { status: 'Received' })).data.status, 'Received');
        assert.equal((await anon.call('GET', '/api/campaign')).data.itemsReceived, 6);
        assert.equal((await admin.call('GET', '/api/admin/inkind')).data.length, 2);
        assert.ok((await admin.call('GET', '/api/admin/inkind.csv', null, true)).text.includes('Roy Medical'));
        assert.equal((await donor.call('GET', '/api/admin/inkind')).status, 403);


        const shifts = (await donor.call('GET', '/api/shifts')).data;
        assert.ok(shifts.length >= 4);
        assert.equal((await anon.call('POST', `/api/shifts/${shifts[0].id}/join`)).status, 401);
        assert.equal((await donor.call('POST', `/api/shifts/${shifts[0].id}/join`)).data.joined, true);
        assert.equal((await donor.call('POST', `/api/shifts/${shifts[0].id}/join`)).status, 409);
        assert.equal((await donor.call('GET', '/api/me/shifts')).data.length, 1);
        assert.equal((await donor.call('POST', `/api/shifts/${shifts[0].id}/leave`)).data.taken, 0);
        assert.equal((await anon.call('POST', '/api/volunteers', {
            name: 'Vee',
            email: 'v@x.org',
            role: 'Event support',
            times: ['Weekends']
        })).status, 200);
        assert.equal((await anon.call('POST', '/api/volunteers', {
            name: 'Vee',
            email: 'v@x.org',
            role: 'Orthopedic technician',
            times: ['Weekends']
        })).status, 400, 'old orthopedic role is gone');


        assert.equal((await donor.call('POST', '/api/me/password', { current: 'longenough1', next: 'anotherpass9' })).status, 200);
        assert.equal((await donor.call('POST', '/api/me/delete', { password: 'bad' })).status, 400);
        assert.equal((await donor.call('POST', '/api/me/delete', { password: 'anotherpass9' })).status, 200);
        assert.equal((await donor.call('GET', '/api/me')).data, null);
        await new Promise(r => {
            return setTimeout(r, 400);
        });
        const saved = JSON.parse(fs.readFileSync(path.join(dir, 'db.json'), 'utf8'));
        assert.equal(saved.donations.length, 5);

        console.log('All API checks passed.');
    } finally {
        await new Promise(resolve => {
            proc.once('exit', resolve);
            proc.kill('SIGTERM');
        });
        fs.rmSync(dir, { recursive: true, force: true });
    }
}
main().catch(e => {
    console.error(e);
    process.exit(1);
});
