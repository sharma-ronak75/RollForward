'use strict';

module.exports = function registerRoutes(context) {
    const {
        route,
        SERVER,
        FIELD_LIMITS,
        VALIDATION,
        RATE_LIMITS,
        DISPLAY_LIMITS,
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
        VOLUNTEER_ROLES,
        APP_STATUSES,
        ACCESSORY_TYPES,
        CONDITIONS,
        METHODS,
        IK_STATUSES,
        IK_RECEIVED,
        sum,
        str,
        failIf,
        isEmail,
        parseContact,
        firstName,
        beneficiaryView,
        totalRaised,
        receiptView,
        allocate,
        refCode,
        save,
        appView,
        newId,
        shiftView,
        isoDay
    } = context;

    route('GET', '/api/health', () => {
        return ({ ok: true });
    });

    route('GET', '/api/catalogue', () => {
        return ({
            accessoryTypes: ACCESSORY_TYPES,
            conditions: CONDITIONS,
            methods: METHODS,
            inKindStatuses: IK_STATUSES,
            aids: AIDS,
            states: INDIAN_STATES,
            minGift: MIN_GIFT,
            maxGift: MAX_GIFT,
            disabilities: DISABILITIES,
            volunteerRoles: VOLUNTEER_ROLES,
            statuses: APP_STATUSES
        });
    });

    route('GET', '/api/campaign', () => {
        const c = db.campaign;
        const donated = key => {
            return sum(db.donations.filter(d => {
                return d.option === key;
            }), d => {
                return d.quantity;
            });
        };
        const byType = Object.keys(AIDS).map(key => {
            return ({ key, label: AIDS[key].name, count: c.baseline[key] + donated(key) });
        });
        const aidsFunded = sum(byType, t => {
            return t.count;
        });
        const raised = totalRaised();
        const open = db.applications.filter(a => {
            return ['Received', 'Referral checked', 'Assessed'].includes(a.status);
        }).length;
        const need = sum(db.beneficiaries, b => {
            return Math.max(0, b.cost - b.raised);
        });
        return {
            goal: c.goal,
            raised,
            percent: Math.min(SERVER.percentageTotal, Math.round((raised / c.goal) * SERVER.percentageTotal)),
            aidsFunded,
            byType,
            peopleSupported: c.basePeople + aidsFunded,
            openApplications: c.baseOpenApplications + open,
            outstandingNeed: need,
            seeking: db.beneficiaries.filter(b => {
                return b.raised < b.cost;
            }).length,
            delivered: db.beneficiaries.filter(b => {
                return b.delivered;
            }).map(beneficiaryView).slice(0, DISPLAY_LIMITS.deliveredBeneficiaries),
            itemsReceived: sum(db.inKind.filter(k => {
                return IK_RECEIVED.includes(k.status);
            }), k => {
                return sum(k.items, i => {
                    return i.quantity;
                });
            }),
            split: { equipment: SERVER.equipmentSharePercent, delivery: SERVER.deliverySharePercent },
        };
    });

    route('GET', '/api/supporters', () => {
        const money = db.donations.map(d => {
            return ({ name: d.anonymous ? 'Anonymous supporter' : d.name, detail: `₹${d.amount.toLocaleString('en-IN')}`, at: d.createdAt });
        });
        const goods = db.inKind.map(k => {
            return ({
                name: k.anonymous ? 'Anonymous supporter' : (k.organisation || k.name), detail: `${sum(k.items, i => {
                    return i.quantity;
                })} item(s)`, at: k.createdAt
            });
        });
        const real = [...money, ...goods].sort((a, b) => {
            return b.at.localeCompare(a.at);
        }).slice(0, DISPLAY_LIMITS.supporters);
        const filler = db.campaign.baseSupporters.map(name => {
            return ({ name, detail: '' });
        });
        return [...real, ...filler].slice(0, DISPLAY_LIMITS.supporters);
    });

    route('GET', '/api/beneficiaries', ({ query }) => {
        const q = str(query.q, FIELD_LIMITS.searchQuery).toLowerCase();
        let list = db.beneficiaries.map(beneficiaryView).filter(b => {
            return (!query.disability || b.disability === query.disability) &&
                (!query.aid || b.aid === query.aid) &&
                (query.hideFunded !== '1' || b.status === 'Seeking funds') &&
                (b.name + ' ' + b.state + ' ' + b.disability + ' ' + b.story).toLowerCase().includes(q);
        });
        const sorts = {
            closest: (a, b) => {
                return (a.status === 'Seeking funds' ? 0 : 1) - (b.status === 'Seeking funds' ? 0 : 1) || a.remaining - b.remaining;
            },
            least: (a, b) => {
                return a.percent - b.percent;
            },
            cheapest: (a, b) => {
                return a.cost - b.cost;
            },
            newest: (a, b) => {
                return b.id - a.id;
            },
        };
        list.sort(sorts[query.sort] || sorts.closest);
        return list;
    });

    route('GET', '/api/beneficiaries/:id', ({ params }) => {
        const b = db.beneficiaries.find(x => {
            return x.id === Number(params.id);
        });
        if (!b) {
            throw new HttpError(404, 'Beneficiary not found.');
        }
        return beneficiaryView(b);
    });

    route('POST', '/api/donations', { limit: ['write', RATE_LIMITS.donationWrite] }, ctx => {
        const { body, user } = ctx;
        const byAmount = body.mode === 'amount';
        const option = byAmount ? GENERAL : str(body.option, FIELD_LIMITS.aidOption);
        const quantity = byAmount ? 0 : Math.floor(Number(body.quantity));
        const name = str(body.name, FIELD_LIMITS.name) || (user && user.name) || '';
        const email = (str(body.email, FIELD_LIMITS.email) || (user && user.email) || '').toLowerCase();
        const preferred = Number(body.beneficiaryId) || 0;
        const errors = {};
        let amount = 0;
        if (byAmount) {
            amount = Math.floor(Number(body.amount));
            if (!(amount >= MIN_GIFT && amount <= MAX_GIFT)) {
                errors.amount = `Enter an amount from ₹${MIN_GIFT.toLocaleString('en-IN')} to ₹${MAX_GIFT.toLocaleString('en-IN')}.`;
            }
        } else {
            if (!AIDS[option]) {
                errors.option = 'Choose what to fund.';
            }
            if (!(quantity >= VALIDATION.minimumDonationQuantity && quantity <= VALIDATION.maximumDonationQuantity)) {
                errors.quantity = 'Enter a quantity from 1 to 50.';
            }
        }
        if (!name) {
            errors.name = 'Enter your name.';
        }
        if (!isEmail(email)) {
            errors.email = 'Enter a valid email, like name@example.com.';
        }
        const { phone, address } = parseContact(body, errors);
        const target = preferred ? db.beneficiaries.find(b => {
            return b.id === preferred;
        }) : null;
        if (preferred && !target) {
            errors.beneficiaryId = 'That beneficiary does not exist.';
        }
        else if (target && target.raised >= target.cost) {
            errors.beneficiaryId = `${firstName(target.name)} is already fully funded. Choose another person or \"Any beneficiary\".`;
        }
        failIf(errors);

        if (!byAmount) {
            amount = AIDS[option].price * quantity;
        }
        const donation = {
            id: refCode('RF'),
            userId: user ? user.id : null,
            name,
            email,
            phone,
            billing: address,
            option,
            quantity,
            amount,
            anonymous: !!body.anonymous,
            dedication: str(body.dedication, FIELD_LIMITS.dedication),
            message: str(body.message, FIELD_LIMITS.message),
            createdAt: new Date().toISOString(),
            allocations: allocate(option, amount, preferred),
        };
        db.donations.push(donation);
        save();
        ctx.status = 201;
        return receiptView(donation);
    });

    route('POST', '/api/applications', { limit: ['write', RATE_LIMITS.applicationWrite] }, ({ body, user }) => {
        const a = {
            name: str(body.name, FIELD_LIMITS.name),
            age: Math.floor(Number(body.age)),
            state: str(body.state, FIELD_LIMITS.applicationState),
            contact: str(body.contact, FIELD_LIMITS.contact),
            disability: str(body.disability, FIELD_LIMITS.disability),
            aid: str(body.aid, FIELD_LIMITS.aidName),
            referrer: str(body.referrer, FIELD_LIMITS.referrer),
            story: str(body.story, FIELD_LIMITS.applicationStory),
        };
        const errors = {};
        if (!a.name) {
            errors.name = 'Enter the applicant name.';
        }
        if (!(a.age >= VALIDATION.minimumApplicantAge && a.age <= VALIDATION.maximumApplicantAge)) {
            errors.age = 'Enter an age from 1 to 110.';
        }
        if (!INDIAN_STATES.includes(a.state)) {
            errors.state = 'Choose your state.';
        }
        if (!a.contact) {
            errors.contact = 'Enter a phone number or email so we can reach you.';
        }
        if (!DISABILITIES.includes(a.disability)) {
            errors.disability = 'Choose a disability type.';
        }
        if (!aidKeyByName(a.aid)) {
            errors.aid = 'Choose the aid needed.';
        }
        if (!a.referrer) {
            errors.referrer = 'Enter the referring clinic, NGO or doctor.';
        }
        if (a.story.length < VALIDATION.minimumApplicationStoryLength) {
            errors.story = 'Write at least 40 characters so reviewers understand the need.';
        }
        if (!body.consent) {
            errors.consent = 'Consent is required for verification.';
        }
        failIf(errors);

        const now = new Date().toISOString();
        const app = {
            ref: refCode('AP'),
            userId: user ? user.id : null,
            ...a,
            status: 'Received',
            beneficiaryId: null,
            createdAt: now,
            history: [{ status: 'Received', note: 'Application received.', at: now }]
        };
        db.applications.push(app);
        save();
        return { ref: app.ref, status: app.status };
    });

    route('POST', '/api/applications/track', { limit: ['auth', RATE_LIMITS.applicationTracking] }, ({ body }) => {
        const ref = str(body.ref, FIELD_LIMITS.reference).toUpperCase();
        const contact = str(body.contact, FIELD_LIMITS.contact).toLowerCase();
        const app = db.applications.find(a => {
            return a.ref === ref && a.contact.toLowerCase() === contact;
        });
        if (!app) {
            throw new HttpError(404, 'No application matches that reference and contact detail.');
        }
        return appView(app);
    });

    route('POST', '/api/volunteers', { limit: ['write', RATE_LIMITS.volunteerSignup] }, ({ body, user }) => {
        const v = {
            name: str(body.name, FIELD_LIMITS.name),
            email: str(body.email, FIELD_LIMITS.email).toLowerCase(),
            role: str(body.role, FIELD_LIMITS.volunteerRole),
            times: Array.isArray(body.times) ? body.times.filter(t => {
                return ['Weekdays', 'Weekends', 'Evenings'].includes(t);
            }) : []
        };
        const errors = {};
        if (!v.name) {
            errors.name = 'Enter your name.';
        }
        if (!isEmail(v.email)) {
            errors.email = 'Enter a valid email.';
        }
        if (!VOLUNTEER_ROLES.includes(v.role)) {
            errors.role = 'Choose a role.';
        }
        if (!v.times.length) {
            errors.times = 'Choose at least one availability option.';
        }
        failIf(errors);
        db.volunteers.push({
            id: newId(),
            userId: user ? user.id : null,
            ...v,
            createdAt: new Date().toISOString()
        });
        save();
        return { ok: true };
    });

    route('GET', '/api/shifts', ({ user }) => {
        const today = isoDay(0);
        return db.shifts.filter(s => {
            return s.date >= today;
        }).sort((a, b) => {
            return a.date.localeCompare(b.date);
        }).map(s => {
            return shiftView(s, user);
        });
    });
};
