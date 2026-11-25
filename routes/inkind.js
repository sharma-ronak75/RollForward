'use strict';

module.exports = function registerRoutes(context) {
    const {
        route,
        FIELD_LIMITS,
        VALIDATION,
        RATE_LIMITS,
        db,
        HttpError,
        ACCESSORY_TYPES,
        CONDITIONS,
        METHODS,
        IK_STATUSES,
        IK_RECEIVED,
        str,
        failIf,
        isEmail,
        parseContact,
        save,
        refCode,
        sum,
        addressLine,
        csvCell
    } = context;

    const inKindView = k => {
        return ({
            ref: k.ref,
            name: k.name,
            organisation: k.organisation,
            email: k.email,
            phone: k.phone,
            address: k.address,
            items: k.items,
            method: k.method,
            notes: k.notes,
            anonymous: k.anonymous,
            status: k.status,
            pickupDate: k.pickupDate,
            createdAt: k.createdAt,
            history: k.history,
            totalItems: sum(k.items, i => {
                return i.quantity;
            }),
        });
    };

    route('POST', '/api/inkind', { limit: ['write', RATE_LIMITS.inKindWrite] }, ctx => {
        const { body, user } = ctx;
        const errors = {};
        const name = str(body.name, FIELD_LIMITS.name) || (user && user.name) || '';
        const email = (str(body.email, FIELD_LIMITS.email) || (user && user.email) || '').toLowerCase();
        const method = str(body.method, FIELD_LIMITS.shiftTime);
        if (!name) {
            errors.name = 'Enter your name.';
        }
        if (!isEmail(email)) {
            errors.email = 'Enter a valid email, like name@example.com.';
        }
        const { phone, address } = parseContact(body, errors);
        if (!METHODS.includes(method)) {
            errors.method = 'Choose how the items will reach us.';
        }
        const items = (Array.isArray(body.items) ? body.items : []).slice(0, VALIDATION.maximumItemsPerPledge).map(i => {
            return ({
                type: str(i && i.type, FIELD_LIMITS.itemType),
                description: str(i && i.description, FIELD_LIMITS.itemDescription),
                quantity: Math.floor(Number(i && i.quantity)),
                condition: str(i && i.condition, FIELD_LIMITS.itemCondition),
            });
        });
        const badItem = items.some(i => {
            return !ACCESSORY_TYPES.includes(i.type) || !(i.quantity >= VALIDATION.minimumPledgeItemQuantity && i.quantity <= VALIDATION.maximumPledgeItemQuantity) || !CONDITIONS.includes(i.condition) || (i.type === 'Other' && i.description.length < 3);
        });
        if (!items.length || badItem) {
            errors.items = 'Add at least one item with a type, a quantity from 1 to 500 and a condition. "Other" needs a short description.';
        }
        if (!body.consent) {
            errors.consent = 'Please confirm the items are yours to give and are clean and safe to use.';
        }
        failIf(errors);
        const now = new Date().toISOString();
        const k = {
            ref: refCode('IK'),
            userId: user ? user.id : null,
            name,
            email,
            organisation: str(body.organisation, FIELD_LIMITS.organisation),
            phone,
            address,
            items,
            method,
            notes: str(body.notes, FIELD_LIMITS.notes),
            anonymous: !!body.anonymous,
            status: 'Pledged',
            pickupDate: '',
            createdAt: now,
            history: [{ status: 'Pledged', note: 'Pledge received. A coordinator will contact you to arrange hand-over.', at: now }],
        };
        db.inKind.push(k);
        save();
        ctx.status = 201;
        return inKindView(k);
    });

    route('POST', '/api/inkind/track', { limit: ['auth', 10] }, ({ body }) => {
        const ref = str(body.ref, FIELD_LIMITS.reference).toUpperCase();
        const email = str(body.email, FIELD_LIMITS.email).toLowerCase();
        const k = db.inKind.find(x => {
            return x.ref === ref && x.email === email;
        });
        if (!k) {
            throw new HttpError(404, 'No pledge matches that reference and email.');
        }
        return inKindView(k);
    });

    route('GET', '/api/me/inkind', { auth: true }, ({ user }) => {
        return db.inKind.filter(k => {
            return k.userId === user.id || k.email === user.email;
        }).reverse().map(inKindView);
    });

    route('GET', '/api/admin/inkind', { admin: true }, () => {
        return [...db.inKind].reverse().map(inKindView);
    });

    route('PATCH', '/api/admin/inkind/:ref', { admin: true }, ({ params, body }) => {
        const k = db.inKind.find(x => {
            return x.ref === params.ref;
        });
        if (!k) {
            throw new HttpError(404, 'Pledge not found.');
        }
        const status = str(body.status, FIELD_LIMITS.status);
        const note = str(body.note, FIELD_LIMITS.notes);
        const pickupDate = str(body.pickupDate, FIELD_LIMITS.shiftDate);
        const errors = {};
        if (!IK_STATUSES.includes(status)) {
            errors.status = 'Choose a valid status.';
        }
        if (status === 'Arrangement confirmed' && !/^\d{4}-\d{2}-\d{2}$/.test(pickupDate)) {
            errors.pickupDate = 'Choose the pickup / drop-off date.';
        }
        failIf(errors);
        if (pickupDate) {
            k.pickupDate = pickupDate;
        }
        const detail = status === 'Arrangement confirmed' ? `${note || 'Hand-over arranged.'} Date: ${k.pickupDate}.` : note;
        if (status !== k.status || note) {
            k.history.push({ status, note: detail || `Status changed to ${status}.`, at: new Date().toISOString() });
        }
        k.status = status;
        save();
        return inKindView(k);
    });

    route('GET', '/api/admin/inkind.csv', { admin: true }, () => {
        const rows = [[
            'Ref',
            'Date',
            'Status',
            'Name',
            'Organisation',
            'Email',
            'Phone',
            'Address',
            'Method',
            'Hand-over date',
            'Items'
        ]];
        db.inKind.forEach(k => {
            return rows.push([
                k.ref,
                k.createdAt,
                k.status,
                k.name,
                k.organisation,
                k.email,
                k.phone,
                addressLine(k.address),
                k.method,
                k.pickupDate,
                k.items.map(i => {
                    return `${i.quantity} x ${i.type} (${i.condition})${i.description ? ': ' + i.description : ''}`;
                }).join('; ')
            ]);
        });
        return {
            raw: rows.map(r => {
                return r.map(csvCell).join(',');
            }).join('\n'), type: 'text/csv; charset=utf-8', filename: 'accessory-pledges.csv'
        };
    });
};
