'use strict';

module.exports = function registerRoutes(context) {
    const {
        route,
        SERVER,
        TIME,
        FIELD_LIMITS,
        VALIDATION,
        RATE_LIMITS,
        db,
        HttpError,
        ROLES,
        str,
        isEmail,
        failIf,
        newId,
        hashPassword,
        save,
        sign,
        sessionCookie,
        SESSION_DAYS,
        checkPassword,
        publicUser,
        receiptView,
        beneficiaryView,
        appView,
        shiftView
    } = context;

    function startSession(req, user) {
        const token = sign({ uid: user.id, exp: Date.now() + SESSION_DAYS * TIME.millisecondsPerDay });
        return { 'Set-Cookie': sessionCookie(req, token, SESSION_DAYS * TIME.secondsPerDay) };
    }

    route('POST', '/api/auth/signup', { limit: ['auth', RATE_LIMITS.accountSignup] }, async ctx => {
        const { body, req } = ctx;
        const name = str(body.name, FIELD_LIMITS.name);
        const email = str(body.email, FIELD_LIMITS.email).toLowerCase();
        const password = typeof body.password === 'string' ? body.password : '';
        const role = ROLES.includes(body.role) ? body.role : 'donor';
        const errors = {};
        if (name.length < 2) {
            errors.name = 'Enter your full name.';
        }
        if (!isEmail(email)) {
            errors.email = 'Enter a valid email, like name@example.com.';
        }
        if (password.length < VALIDATION.minimumPasswordLength || password.length > VALIDATION.maximumPasswordLength) {
            errors.password = 'Use at least 8 characters.';
        }
        if (!body.terms) {
            errors.terms = 'Accept the terms to continue.';
        }
        failIf(errors);
        if (db.users.some(u => {
            return u.email === email;
        })) {
            throw new HttpError(409, 'An account with this email exists. Sign in instead.', { email: 'An account with this email exists. Sign in instead.' });
        }
        const user = {
            id: newId(),
            name,
            email,
            role,
            passwordHash: await hashPassword(password),
            createdAt: new Date().toISOString()
        };
        db.users.push(user);
        save();
        ctx.headers = startSession(req, user);
        ctx.status = 201;
        return publicUser(user);
    });

    const DUMMY_HASH = 'x:' + '0'.repeat(SERVER.dummyPasswordHashLength);
    route('POST', '/api/auth/login', { limit: ['auth', RATE_LIMITS.accountLogin] }, async ctx => {
        const email = str(ctx.body.email, 160).toLowerCase();
        const password = typeof ctx.body.password === 'string' ? ctx.body.password : '';
        const user = db.users.find(u => {
            return u.email === email;
        });
        const ok = await checkPassword(password, user ? user.passwordHash : DUMMY_HASH);
        if (!user || !ok) {
            throw new HttpError(401, 'Email or password is incorrect.');
        }
        ctx.headers = startSession(ctx.req, user);
        return publicUser(user);
    });

    route('POST', '/api/auth/logout', ctx => {
        ctx.headers = { 'Set-Cookie': sessionCookie(ctx.req, '', 0) };
    });

    route('GET', '/api/me', ({ user }) => {
        return (user ? publicUser(user) : null);
    });

    route('PATCH', '/api/me', { auth: true }, ({ user, body }) => {
        const name = str(body.name, FIELD_LIMITS.name);
        failIf(name.length < 2 ? { name: 'Enter your full name.' } : {});
        user.name = name;
        save();
        return publicUser(user);
    });

    route('POST', '/api/me/password', { auth: true, limit: ['auth', 8] }, async ({ user, body }) => {
        const next = typeof body.next === 'string' ? body.next : '';
        const errors = {};
        if (!(await checkPassword(String(body.current || ''), user.passwordHash))) {
            errors.current = 'Current password is incorrect.';
        }
        if (next.length < VALIDATION.minimumPasswordLength) {
            errors.next = 'Use at least 8 characters.';
        }
        failIf(errors);
        user.passwordHash = await hashPassword(next);
        save();
    });

    route('POST', '/api/me/delete', { auth: true, limit: ['auth', 5] }, async ctx => {
        const { user, body } = ctx;
        if (user.role === 'admin') {
            throw new HttpError(400, 'The administrator account cannot be deleted here.');
        }
        if (!(await checkPassword(String(body.password || ''), user.passwordHash))) {
            throw new HttpError(400, 'Password is incorrect.', { password: 'Password is incorrect.' });
        }
        db.users = db.users.filter(u => {
            return u.id !== user.id;
        });
        db.donations.forEach(d => {
            if (d.userId === user.id) {
                d.userId = null;
            }
        });
        db.applications.forEach(a => {
            if (a.userId === user.id) {
                a.userId = null;
            }
        });
        db.inKind.forEach(k => {
            if (k.userId === user.id) {
                k.userId = null;
            }
        });
        db.shifts.forEach(s => {
            s.signups = s.signups.filter(x => {
                return x.userId !== user.id;
            });
        });
        save();
        ctx.headers = { 'Set-Cookie': sessionCookie(ctx.req, '', 0) };
    });

    route('GET', '/api/me/donations', { auth: true }, ({ user }) => {
        return db.donations.filter(d => {
            return d.userId === user.id || d.email === user.email;
        }).reverse().map(receiptView);
    });

    route('GET', '/api/me/impact', { auth: true }, ({ user }) => {
        const ids = new Set();
        db.donations.filter(d => {
            return d.userId === user.id || d.email === user.email;
        }).forEach(d => {
            return d.allocations.forEach(a => {
                return a.beneficiaryId && ids.add(a.beneficiaryId);
            });
        });
        return db.beneficiaries.filter(b => {
            return ids.has(b.id);
        }).map(beneficiaryView);
    });

    route('GET', '/api/me/applications', { auth: true }, ({ user }) => {
        return db.applications.filter(a => {
            return a.userId === user.id || a.contact.toLowerCase() === user.email;
        }).reverse().map(appView);
    });

    route('GET', '/api/me/shifts', { auth: true }, ({ user }) => {
        return db.shifts.filter(s => {
            return s.signups.some(x => {
                return x.userId === user.id;
            });
        }).sort((a, b) => {
            return a.date.localeCompare(b.date);
        }).map(s => {
            return shiftView(s, user);
        });
    });

    route('GET', '/api/donations/:id', { auth: true }, ({ user, params }) => {
        const d = db.donations.find(x => {
            return x.id === params.id;
        });
        if (!d || !(user.role === 'admin' || d.userId === user.id || d.email === user.email)) {
            throw new HttpError(404, 'Receipt not found.');
        }
        return receiptView(d);
    });

    route('POST', '/api/shifts/:id/join', { auth: true }, ({ user, params }) => {
        const s = db.shifts.find(x => {
            return x.id === params.id;
        });
        if (!s) {
            throw new HttpError(404, 'Shift not found.');
        }
        if (s.signups.some(x => {
            return x.userId === user.id;
        })) {
            throw new HttpError(409, 'You have already joined this shift.');
        }
        if (s.signups.length >= s.capacity) {
            throw new HttpError(409, 'This shift is full.');
        }
        s.signups.push({ userId: user.id, name: user.name, email: user.email });
        save();
        return shiftView(s, user);
    });

    route('POST', '/api/shifts/:id/leave', { auth: true }, ({ user, params }) => {
        const s = db.shifts.find(x => {
            return x.id === params.id;
        });
        if (!s) {
            throw new HttpError(404, 'Shift not found.');
        }
        s.signups = s.signups.filter(x => {
            return x.userId !== user.id;
        });
        save();
        return shiftView(s, user);
    });
};
