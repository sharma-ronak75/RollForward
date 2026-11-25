'use strict';

module.exports = function registerRoutes(context) {
    const {
        route,
        FIELD_LIMITS,
        VALIDATION,
        DISPLAY_LIMITS,
        db,
        HttpError,
        AIDS,
        itemLabel,
        receiptView,
        IK_STATUSES,
        APP_STATUSES,
        VOLUNTEER_ROLES,
        isoDay,
        sum,
        totalRaised,
        beneficiaryView,
        str,
        failIf,
        firstName,
        aidKeyByName,
        save,
        newId,
        shiftView,
        addressLine,
        csvCell
    } = context;

    route('GET', '/api/admin/summary', { admin: true }, () => {
        const days = Array.from({ length: DISPLAY_LIMITS.adminDonationChartDays }, (_, index) => {
            return isoDay(index - DISPLAY_LIMITS.adminDonationChartDays + 1);
        });
        const perDay = days.map(day => {
            return ({
                day, amount: sum(db.donations.filter(d => {
                    return d.createdAt.startsWith(day);
                }), d => {
                    return d.amount;
                })
            });
        });
        const needByAid = Object.keys(AIDS).map(key => {
            return ({
                label: AIDS[key].name,
                need: sum(db.beneficiaries.filter(b => {
                    return b.aid === AIDS[key].name;
                }), b => {
                    return Math.max(0, b.cost - b.raised);
                }),
            });
        });
        return {
            raised: totalRaised(),
            donations: db.donations.length,
            donationTotal: sum(db.donations, d => {
                return d.amount;
            }),
            average: db.donations.length ? Math.round(sum(db.donations, d => {
                return d.amount;
            }) / db.donations.length) : 0,
            users: db.users.length,
            volunteers: db.volunteers.length,
            inKindByStatus: IK_STATUSES.map(st => {
                return ({
                    status: st, count: db.inKind.filter(k => {
                        return k.status === st;
                    }).length
                });
            }),
            generalFund: sum(db.donations.flatMap(d => {
                return d.allocations;
            }).filter(a => {
                return !a.beneficiaryId;
            }), a => {
                return a.amount;
            }),
            applicationsByStatus: APP_STATUSES.map(s => {
                return ({
                    status: s, count: db.applications.filter(a => {
                        return a.status === s;
                    }).length
                });
            }),
            awaitingDelivery: db.beneficiaries.filter(b => {
                return b.raised >= b.cost && !b.delivered;
            }).map(beneficiaryView),
            perDay,
            needByAid,
        };
    });

    route('GET', '/api/admin/applications', { admin: true }, () => {
        return [...db.applications].reverse();
    });

    route('PATCH', '/api/admin/applications/:ref', { admin: true }, ({ params, body }) => {
        const app = db.applications.find(a => {
            return a.ref === params.ref;
        });
        if (!app) {
            throw new HttpError(404, 'Application not found.');
        }
        const status = str(body.status, FIELD_LIMITS.status);
        const note = str(body.note, FIELD_LIMITS.notes);
        const publicStory = str(body.publicStory, FIELD_LIMITS.publicStory);
        const errors = {};
        if (!APP_STATUSES.includes(status)) {
            errors.status = 'Choose a valid status.';
        }
        if (status === 'Approved' && !app.beneficiaryId && publicStory.length < VALIDATION.minimumPublicStoryLength) {
            errors.publicStory = 'Write a short public story (no surnames, addresses or phone numbers) before approving.';
        }
        failIf(errors);
        if (status === 'Approved' && !app.beneficiaryId) {
            const id = db.nextBeneficiaryId++;
            db.beneficiaries.push({
                id,
                name: firstName(app.name),
                age: app.age,
                disability: app.disability,
                aid: app.aid,
                cost: AIDS[aidKeyByName(app.aid)].price,
                raised: 0,
                state: app.state,
                story: publicStory,
                delivered: false,
                updates: [],
                createdAt: new Date().toISOString(),
            });
            app.beneficiaryId = id;
        }
        if (status !== app.status || note) {
            app.history.push({ status, note: note || `Status changed to ${status}.`, at: new Date().toISOString() });
        }
        app.status = status;
        save();
        return app;
    });

    route('GET', '/api/admin/donations', { admin: true }, () => {
        return [...db.donations].reverse().map(d => {
            return ({ ...receiptView(d), userId: d.userId });
        });
    });

    route('GET', '/api/admin/donations.csv', { admin: true }, () => {
        const rows = [[
            'Receipt',
            'Date',
            'Name',
            'Email',
            'Phone',
            'Billing address',
            'Item',
            'Quantity',
            'Amount INR',
            'Anonymous',
            'Dedication',
            'Allocation'
        ]];
        db.donations.forEach(d => {
            return rows.push([
                d.id,
                d.createdAt,
                d.name,
                d.email,
                d.phone,
                addressLine(d.billing),
                itemLabel(d),
                d.quantity || '',
                d.amount,
                d.anonymous ? 'yes' : 'no',
                d.dedication,
                receiptView(d).allocations.map(a => {
                    return `${a.to}: ₹${a.amount}`;
                }).join('; ')
            ]);
        });
        return {
            raw: rows.map(r => {
                return r.map(csvCell).join(',');
            }).join('\n'), type: 'text/csv; charset=utf-8', filename: 'donations.csv'
        };
    });

    route('GET', '/api/admin/volunteers', { admin: true }, () => {
        return ({
            interests: [...db.volunteers].reverse(),
            shifts: db.shifts.map(s => {
                return ({ ...shiftView(s, null), signups: s.signups });
            }),
        });
    });

    route('GET', '/api/admin/beneficiaries', { admin: true }, () => {
        return db.beneficiaries.map(beneficiaryView);
    });

    route('POST', '/api/admin/beneficiaries/:id/updates', { admin: true }, ({ params, body }) => {
        const b = db.beneficiaries.find(x => {
            return x.id === Number(params.id);
        });
        if (!b) {
            throw new HttpError(404, 'Beneficiary not found.');
        }
        const text = str(body.text, FIELD_LIMITS.adminUpdate);
        const errors = {};
        if (text.length < VALIDATION.minimumBeneficiaryUpdateLength) {
            errors.text = 'Write a short update donors will see.';
        }
        if (body.delivered && b.raised < b.cost) {
            errors.delivered = 'Only fully funded aids can be marked delivered.';
        }
        failIf(errors);
        b.updates.push({ at: new Date().toISOString(), text });
        if (body.delivered) {
            b.delivered = true;
        }
        save();
        return beneficiaryView(b);
    });

    route('POST', '/api/admin/shifts', { admin: true }, ({ body }) => {
        const s = {
            id: 's' + newId(),
            title: str(body.title, FIELD_LIMITS.shiftTitle),
            role: str(body.role, FIELD_LIMITS.volunteerRole),
            date: str(body.date, FIELD_LIMITS.shiftDate),
            time: str(body.time, FIELD_LIMITS.shiftTime),
            location: str(body.location, FIELD_LIMITS.shiftLocation),
            capacity: Math.floor(Number(body.capacity)),
            signups: []
        };
        const errors = {};
        if (!s.title) {
            errors.title = 'Enter a title.';
        }
        if (!VOLUNTEER_ROLES.includes(s.role)) {
            errors.role = 'Choose a role.';
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date)) {
            errors.date = 'Choose a date.';
        }
        if (!s.time) {
            errors.time = 'Enter a time range.';
        }
        if (!s.location) {
            errors.location = 'Enter a location.';
        }
        if (!(s.capacity >= VALIDATION.minimumShiftCapacity && s.capacity <= VALIDATION.maximumShiftCapacity)) {
            errors.capacity = 'Enter a capacity from 1 to 200.';
        }
        failIf(errors);
        db.shifts.push(s);
        save();
        return shiftView(s, null);
    });
};
