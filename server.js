'use strict';


const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);
const { SERVER, TIME, FIELD_LIMITS, VALIDATION, RATE_LIMITS, DISPLAY_LIMITS } = require('./config/constants');

const registerPublicRoutes = require('./routes/public');
const registerAccountRoutes = require('./routes/accounts');
const registerAdminRoutes = require('./routes/admin');
const registerInKindRoutes = require('./routes/inkind');

const PORT = Number(process.env.PORT) || SERVER.defaultPort;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SESSION_DAYS = SERVER.sessionDurationDays;

fs.mkdirSync(DATA_DIR, { recursive: true });


const AIDS = {
    chair: {
        name: 'Wheelchair',
        label: 'Wheelchair',
        price: 7125,
        note: 'Funds one full wheelchair'
    },
    crutch: {
        name: 'Crutches',
        label: 'Crutches',
        price: 3800,
        note: 'A fitted pair of crutches'
    },
    trike: {
        name: 'Tricycle',
        label: 'Tricycle',
        price: 22800,
        note: 'Funds one full tricycle'
    },
    limb: {
        name: 'Artificial Limb',
        label: 'Artificial Limb',
        price: 14250,
        note: 'Limb with first fitting'
    },
    cane: {
        name: 'White Cane',
        label: 'White Cane',
        price: 500,
        note: 'Folding cane for walking safely'
    },
};
const GENERAL = 'general';
const itemLabel = d => {
    return (d.option === GENERAL ? 'General donation' : AIDS[d.option].label);
};
const MIN_GIFT = SERVER.minimumDonationInr;
const MAX_GIFT = SERVER.maximumDonationInr;
const INDIAN_STATES = [
    'Andhra Pradesh',
    'Arunachal Pradesh',
    'Assam',
    'Bihar',
    'Chhattisgarh',
    'Goa',
    'Gujarat',
    'Haryana',
    'Himachal Pradesh',
    'Jharkhand',
    'Karnataka',
    'Kerala',
    'Madhya Pradesh',
    'Maharashtra',
    'Manipur',
    'Meghalaya',
    'Mizoram',
    'Nagaland',
    'Odisha',
    'Punjab',
    'Rajasthan',
    'Sikkim',
    'Tamil Nadu',
    'Telangana',
    'Tripura',
    'Uttar Pradesh',
    'Uttarakhand',
    'West Bengal',
    'Delhi',
    'Jammu and Kashmir',
    'Ladakh',
    'Chandigarh',
    'Puducherry'
];
const aidKeyByName = name => {
    return Object.keys(AIDS).find(k => {
        return AIDS[k].name === name;
    });
};
const DISABILITIES = [
    'Amputee',
    'Paralysis',
    'Blindness',
    'Cerebral palsy',
    'Other'
];
const ROLES = ['donor', 'beneficiary', 'volunteer'];
const VOLUNTEER_ROLES = [
    'Delivery and logistics',
    'Event support',
    'Awareness and outreach',
    'Fundraising'
];
const APP_STATUSES = [
    'Received',
    'Referral checked',
    'Assessed',
    'Approved',
    'Declined'
];
const ACCESSORY_TYPES = [
    'Wheelchair cushion',
    'Walking stick / cane',
    'Walker / rollator',
    'Used wheelchair (working)',
    'Crutches (used)',
    'Prosthetic components',
    'Braces and splints',
    'Wheelchair gloves',
    'Portable ramp',
    'Other'
];
const CONDITIONS = [
    'New',
    'Like new',
    'Good',
    'Fair'
];
const METHODS = ['Courier', 'Self-shipping'];
const IK_STATUSES = [
    'Pledged',
    'Arrangement confirmed',
    'Received',
    'Accepted',
    'Distributed',
    'Declined'
];
const IK_RECEIVED = ['Received', 'Accepted', 'Distributed'];


let db;
let saveTimer = null;

const isoDay = offset => {
    return new Date(Date.now() + offset * TIME.millisecondsPerDay).toISOString().slice(0, 10);
};

function seed() {
    const now = new Date().toISOString();
    const b = (id, name, age, disability, aid, state, story) => {
        return ({
            id,
            name,
            age,
            disability,
            aid,
            cost: AIDS[aidKeyByName(aid)].price,
            raised: 0,
            state,
            story,
            delivered: false,
            updates: [],
            createdAt: now
        });
    };
    return {
        campaign: {
            goal: SERVER.defaultCampaignGoalInr,
            baseRaised: 0,
            basePeople: 0,
            baseOpenApplications: 0,
            baseline: {
                chair: 0,
                crutch: 0,
                trike: 0,
                limb: 0,
                cane: 0
            },
            baseSupporters: [],
        },
        beneficiaries: [
            b(1, 'Rajesh', 34, 'Amputee', 'Artificial Limb', 'Punjab', 'A bus conductor who lost his lower leg. An artificial limb would let him return to full-time work.'),
            b(2, 'Meena', 12, 'Cerebral palsy', 'Wheelchair', 'Bihar', 'Meena needs a supportive chair so she can sit with classmates and keep up with lessons.'),
            b(3, 'Mohan', 45, 'Paralysis', 'Tricycle', 'Uttar Pradesh', 'Mohan repairs phones but cannot get to customers. A tricycle would triple his daily reach.'),
            b(4, 'Sunita', 52, 'Paralysis', 'Wheelchair', 'Rajasthan', 'A seamstress who stopped working after a fall. A wheelchair would let her return to her workshop.'),
            b(5, 'Lakshmi', 41, 'Blindness', 'White Cane', 'Odisha', 'Lakshmi weaves baskets and sells them at the market. A cane would help her travel there safely on her own.'),
        ],
        nextBeneficiaryId: 6,
        donations: [],
        applications: [],
        volunteers: [],
        users: [],
        shifts: [
            {
                id: 's1',
                title: 'Wheelchair assembly day',
                role: 'Delivery and logistics',
                date: isoDay(5),
                time: '09:00-13:00',
                location: 'Central warehouse',
                capacity: 8,
                signups: []
            },
            {
                id: 's2',
                title: 'Distribution camp',
                role: 'Event support',
                date: isoDay(9),
                time: '10:00-15:00',
                location: 'Community centre',
                capacity: 6,
                signups: []
            },
            {
                id: 's3',
                title: 'Awareness walk',
                role: 'Awareness and outreach',
                date: isoDay(12),
                time: '08:30-12:30',
                location: 'City park',
                capacity: 10,
                signups: []
            },
            {
                id: 's4',
                title: 'Community fundraising drive',
                role: 'Fundraising',
                date: isoDay(16),
                time: '11:00-16:00',
                location: 'Online and local markets',
                capacity: 10,
                signups: []
            },
        ],
    };
}

function loadDb() {
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('Could not read db.json, starting fresh:', error.message);
        }
        return seed();
    }
}

function flush() {
    clearTimeout(saveTimer);
    saveTimer = null;
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DB_FILE);
}
function save() {
    if (!saveTimer) {
        saveTimer = setTimeout(flush, TIME.saveDebounceMs);
    }
}

db = loadDb();
db.inKind = db.inKind || [];


function loadSecret() {
    if (process.env.SESSION_SECRET) {
        return process.env.SESSION_SECRET;
    }
    const file = path.join(DATA_DIR, 'secret.key');
    try {
        return fs.readFileSync(file, 'utf8').trim();
    } catch (e) { /* create below */ }
    const secret = crypto.randomBytes(SERVER.sessionSecretBytes).toString('hex');
    fs.writeFileSync(file, secret, { mode: 0o600 });
    return secret;
}
const SECRET = loadSecret();

const b64 = buf => {
    return Buffer.from(buf).toString('base64url');
};
function sign(payload) {
    const body = b64(JSON.stringify(payload));
    const mac = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
    return body + '.' + mac;
}
function verify(token) {
    if (typeof token !== 'string') {
        return null;
    }
    const [body, mac] = token.split('.');
    if (!body || !mac) {
        return null;
    }
    const expected = crypto.createHmac('sha256', SECRET).update(body).digest();
    const given = Buffer.from(mac, 'base64url');
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
        return null;
    }
    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
        return payload.exp > Date.now() ? payload : null;
    } catch (e) {
        return null;
    }
}

async function hashPassword(password, salt = crypto.randomBytes(SERVER.passwordSaltBytes).toString('hex')) {
    const key = await scrypt(password, salt, SERVER.passwordKeyBytes);
    return `${salt}:${key.toString('hex')}`;
}
async function checkPassword(password, stored) {
    const [salt, hash] = String(stored).split(':');
    const key = await scrypt(password, salt || 'x', SERVER.passwordKeyBytes);
    const expected = Buffer.from(hash || '', 'hex');
    return expected.length === key.length && crypto.timingSafeEqual(key, expected);
}

async function ensureAdmin() {
    if (db.users.some(u => {
        return u.role === 'admin';
    })) {
        return;
    }
    const email = (process.env.ADMIN_EMAIL || 'admin@rollforward.local').toLowerCase();
    const generated = !process.env.ADMIN_PASSWORD;
    const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(SERVER.generatedAdminPasswordBytes).toString('base64url');
    db.users.push({
        id: newId(),
        name: 'Programme Admin',
        email,
        role: 'admin',
        passwordHash: await hashPassword(password),
        createdAt: new Date().toISOString()
    });
    flush();
    console.log(`\n  Admin account created: ${email}${generated ? '  password: ' + password : ''}`);
    if (generated) {
        console.log('  (shown once; set ADMIN_PASSWORD to choose your own)\n');
    }
}


class HttpError extends Error {
    constructor(status, message, fields) {
        super(message);
        this.status = status;
        this.fields = fields;
    }
}
const newId = () => {
    return crypto.randomBytes(SERVER.idBytes).toString('hex');
};
const refCode = prefix => {
    return prefix + '-' + crypto.randomBytes(SERVER.referenceCodeBytes).toString('hex').toUpperCase();
};
const str = (v, max = FIELD_LIMITS.defaultText) => {
    return (typeof v === 'string' ? v.trim().slice(0, max) : '');
};
const isEmail = v => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= FIELD_LIMITS.email;
};
const firstName = full => {
    return String(full).split(/[ ,]/)[0];
};
const sum = (list, pick) => {
    return list.reduce((total, item) => {
        return total + pick(item);
    }, 0);
};

function failIf(errors, message = 'Please fix the highlighted fields.') {
    if (Object.keys(errors).length) {
        throw new HttpError(400, message, errors);
    }
}

const PHONE_RE = /^\+?[0-9][0-9\s\-().]{6,19}$/;
const POSTCODE_RE = /^[A-Za-z0-9][A-Za-z0-9\s-]{2,13}$/;

function parseContact(body, errors) {
    const phone = str(body.phone, FIELD_LIMITS.phone);
    const address = {
        line1: str(body.line1, FIELD_LIMITS.streetAddress),
        line2: str(body.line2, FIELD_LIMITS.streetAddress),
        city: str(body.city, FIELD_LIMITS.city),
        state: str(body.state, FIELD_LIMITS.region),
        postcode: str(body.postcode, FIELD_LIMITS.postcode),
        country: str(body.country, FIELD_LIMITS.country)
    };
    if (!PHONE_RE.test(phone) || phone.replace(/\D/g, '').length < VALIDATION.minimumPhoneDigits) {
        errors.phone = 'Enter a phone number with country code, e.g. +91 98765 43210.';
    }
    if (!address.line1) {
        errors.line1 = 'Enter the street address.';
    }
    if (!address.city) {
        errors.city = 'Enter the city.';
    }
    if (!POSTCODE_RE.test(address.postcode)) {
        errors.postcode = 'Enter a valid postal / ZIP code.';
    }
    if (!address.country) {
        errors.country = 'Enter the country.';
    }
    return { phone, address };
}

const publicUser = u => {
    return ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role
    });
};

function beneficiaryView(b) {
    const remaining = Math.max(0, b.cost - b.raised);
    const donors = new Set(db.donations.filter(d => {
        return d.allocations.some(a => {
            return a.beneficiaryId === b.id;
        });
    }).map(d => {
        return d.userId || d.email;
    })).size;
    return {
        id: b.id,
        name: b.name,
        age: b.age,
        disability: b.disability,
        aid: b.aid,
        aidKey: aidKeyByName(b.aid),
        cost: b.cost,
        raised: Math.min(b.raised, b.cost),
        remaining,
        percent: Math.round((Math.min(b.raised, b.cost) / b.cost) * 100),
        state: b.state,
        story: b.story,
        createdAt: b.createdAt,
        donors,
        status: b.delivered ? 'Delivered' : remaining === 0 ? 'Funded' : 'Seeking funds',
        updates: [...b.updates].reverse(),
    };
}

function totalRaised() {
    return db.campaign.baseRaised + sum(db.donations, d => {
        return d.amount;
    });
}

function receiptView(d) {
    return {
        id: d.id,
        createdAt: d.createdAt,
        name: d.name,
        email: d.email,
        item: itemLabel(d),
        option: d.option,
        phone: d.phone,
        billing: d.billing,
        quantity: d.quantity,
        amount: d.amount,
        dedication: d.dedication,
        message: d.message,
        anonymous: d.anonymous,
        allocations: d.allocations.map(a => {
            return ({
                amount: a.amount,
                to: a.beneficiaryId ? (db.beneficiaries.find(b => {
                    return b.id === a.beneficiaryId;
                }) || {}).name || 'Beneficiary' : 'General fund (next matching request)',
                beneficiaryId: a.beneficiaryId,
            });
        }),
    };
}



function allocate(optionKey, amount, preferredId) {
    const open = b => {
        return b.cost - b.raised;
    };
    const preferred = db.beneficiaries.find(b => {
        return b.id === preferredId;
    });
    const sameAid = b => {
        return !AIDS[optionKey] || b.aid === AIDS[optionKey].name;
    };
    const matching = db.beneficiaries
        .filter(b => {
            return b !== preferred && sameAid(b) && open(b) > 0;
        })
        .sort((a, b) => {
            return open(a) - open(b);
        });
    const queue = [...(preferred ? [preferred] : []), ...matching];
    let left = amount;
    const allocations = [];
    for (const b of queue) {
        const take = Math.min(open(b), left);
        if (take > 0) {
            b.raised += take;
            left -= take;
            allocations.push({ beneficiaryId: b.id, amount: take });
        }
        if (!left) {
            break;
        }
    }
    if (left) {
        allocations.push({ beneficiaryId: null, amount: left });
    }
    return allocations;
}


const routes = [];
function route(method, pattern, opts, handler) {
    if (typeof opts === 'function') {
        handler = opts;
        opts = {};
    }
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => {
        keys.push(k);
        return '([^/]+)';
    }) + '$');
    routes.push({
        method,
        re,
        keys,
        opts,
        handler
    });
}

const buckets = new Map();
function limited(key, max, windowMs) {
    const now = Date.now();
    const hits = (buckets.get(key) || []).filter(t => {
        return now - t < windowMs;
    });
    hits.push(now);
    buckets.set(key, hits);
    return hits.length > max;
}
setInterval(() => {
    const cutoff = Date.now() - TIME.rateLimitBucketExpirationMs;
    for (const [k, v] of buckets) if (!v.some(t => {
        return t > cutoff;
    })) {
        buckets.delete(k);
    }
}, TIME.rateLimitCleanupIntervalMs).unref();

function parseCookies(header = '') {
    return Object.fromEntries(header.split(';').map(p => {
        return p.trim().split(/=(.*)/s).slice(0, 2);
    }).filter(p => {
        return p[0];
    }));
}
function currentUser(req) {
    const payload = verify(parseCookies(req.headers.cookie).rf_session);
    return payload ? db.users.find(u => {
        return u.id === payload.uid;
    }) || null : null;
}
function sessionCookie(req, value, maxAge) {
    const secure = process.env.COOKIE_SECURE === '1' || req.headers['x-forwarded-proto'] === 'https';
    return `rf_session=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', chunk => {
            size += chunk.length;
            if (size > SERVER.maxRequestBodyBytes) {
                reject(new HttpError(413, 'Request too large.'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            const text = Buffer.concat(chunks).toString();
            if (!text) {
                return resolve({});
            }
            try {
                const parsed = JSON.parse(text);
                resolve(parsed && typeof parsed === 'object' ? parsed : {});
            }
            catch (e) {
                reject(new HttpError(400, 'Invalid JSON.'));
            }
        });
        req.on('error', reject);
    });
}

const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none'",
};

function sendJson(res, status, data, extra = {}) {
    const body = JSON.stringify(data);
    res.writeHead(status, {
        ...SECURITY_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        ...extra
    });
    res.end(body);
}

async function handleApi(req, res, url) {
    const method = req.method;
    const ip = process.env.TRUST_PROXY === '1' ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress : req.socket.remoteAddress;
    try {
        if (method !== 'GET' && method !== 'HEAD') {
            const origin = req.headers.origin;
            if (origin) {
                let host;
                try {
                    host = new URL(origin).host;
                } catch (e) {
                    host = '';
                }
                if (host !== req.headers.host) {
                    throw new HttpError(403, 'Cross-origin request blocked.');
                }
            }
            if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
                throw new HttpError(415, 'Content-Type must be application/json.');
            }
        }
        const match = routes.map(r => {
            return ({ r, m: r.method === method && url.pathname.match(r.re) });
        }).find(x => {
            return x.m;
        });
        if (!match) {
            throw new HttpError(404, 'Not found.');
        }
        const { r, m } = match;
        if (r.opts.limit && limited(`${r.method} ${r.re.source}:${ip}`, r.opts.limit[1], TIME.rateLimitWindowMs)) {
            throw new HttpError(429, 'Too many requests. Please wait a minute and try again.');
        }

        const user = currentUser(req);
        if (r.opts.auth && !user) {
            throw new HttpError(401, 'Please sign in first.');
        }
        if (r.opts.admin && (!user || user.role !== 'admin')) {
            throw new HttpError(403, 'Administrators only.');
        }

        const ctx = {
            req,
            res,
            user,
            ip,
            status: 200,
            headers: {},
            params: Object.fromEntries(r.keys.map((k, i) => {
                return [k, decodeURIComponent(m[i + 1])];
            })),
            query: Object.fromEntries(url.searchParams),
            body: method === 'GET' ? {} : await readBody(req),
        };
        const result = await r.handler(ctx);
        if (result && result.raw !== undefined) {
            res.writeHead(200, {
                ...SECURITY_HEADERS,
                'Content-Type': result.type,
                'Content-Disposition': `attachment; filename="${result.filename}"`,
                'Cache-Control': 'no-store'
            });
            return res.end(result.raw);
        }
        sendJson(res, ctx.status, result === undefined ? { ok: true } : result, ctx.headers);
    } catch (error) {
        if (error instanceof HttpError) {
            return sendJson(res, error.status, { error: error.message, fields: error.fields || {} });
        }
        console.error(error);
        sendJson(res, 500, { error: 'Unexpected server error.' });
    }
}

const appView = a => {
    return ({
        ref: a.ref,
        name: a.name,
        aid: a.aid,
        status: a.status,
        createdAt: a.createdAt,
        history: a.history
    });
};

const shiftView = (s, user) => {
    return ({
        id: s.id,
        title: s.title,
        role: s.role,
        date: s.date,
        time: s.time,
        location: s.location,
        capacity: s.capacity,
        taken: s.signups.length,
        joined: !!user && s.signups.some(x => {
            return x.userId === user.id;
        }),
    });
};

const addressLine = address => {
    if (!address) {
        return '';
    }
    return [
        address.line1,
        address.line2,
        address.city,
        address.state,
        address.postcode,
        address.country
    ].filter(Boolean).join(', ');
};

const csvCell = value => {
    let cell = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(cell)) {
        cell = "'" + cell;
    }
    return /[",\n]/.test(cell) ? '"' + cell.replace(/"/g, '""') + '"' : cell;
};

const routeContext = {
    SERVER,
    TIME,
    FIELD_LIMITS,
    VALIDATION,
    RATE_LIMITS,
    DISPLAY_LIMITS,
    route,
    db,
    HttpError,
    AIDS,
    GENERAL,
    itemLabel,
    MIN_GIFT,
    MAX_GIFT,
    INDIAN_STATES,
    aidKeyByName,
    DISABILITIES,
    ROLES,
    VOLUNTEER_ROLES,
    APP_STATUSES,
    ACCESSORY_TYPES,
    CONDITIONS,
    METHODS,
    IK_STATUSES,
    IK_RECEIVED,
    isoDay,
    save,
    sum,
    str,
    isEmail,
    firstName,
    failIf,
    parseContact,
    publicUser,
    beneficiaryView,
    totalRaised,
    receiptView,
    allocate,
    refCode,
    newId,
    hashPassword,
    checkPassword,
    sign,
    sessionCookie,
    SESSION_DAYS,
    appView,
    shiftView,
    addressLine,
    csvCell,
};

registerPublicRoutes(routeContext);
registerAccountRoutes(routeContext);
registerAdminRoutes(routeContext);
registerInKindRoutes(routeContext);


const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.json': 'application/json',
    '.webmanifest': 'application/manifest+json'
};

function serveStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405);
        return res.end();
    }
    let rel;
    try {
        rel = decodeURIComponent(url.pathname);
    } catch (e) {
        res.writeHead(400);
        return res.end();
    }
    if (rel === '/') {
        rel = '/index.html';
    }
    const file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR + path.sep)) {
        res.writeHead(403);
        return res.end();
    }
    fs.readFile(file, (err, data) => {
        if (err) {
            res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain' });
            return res.end('Not found');
        }
        res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        res.end(req.method === 'HEAD' ? undefined : data);
    });
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
        handleApi(req, res, url);
    }
    else {
        serveStatic(req, res, url);
    }
});

ensureAdmin().then(() => {
    server.listen(PORT, () => {
        return console.log(`Roll Forward running at http://localhost:${PORT}`);
    });
});

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
        flush();
        process.exit(0);
    });
}

module.exports = { server };
