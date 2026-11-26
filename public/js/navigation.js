
const NAV = [
    ['/', 'Home'],
    ['/directory', 'Beneficiaries'],
    ['/items', 'Donate Us'],
    ['/apply', 'Apply'],
    ['/impact', 'Impact'],
    ['/volunteer', 'Volunteer'],
    ['/faq', 'FAQ']
];
function buildChrome() {
    const items = isAdmin() ? [...NAV, ['/admin', 'Admin']] : NAV;
    const current = '/' + (location.hash.slice(2).split('/')[0] || '');
    $('#nav').innerHTML = items.map(([path, label]) => {
        return `<a href="#${path}" ${path === current || (path === '/items' && current === '/give') || (path === '/directory' && current === '/b') ? 'aria-current="page"' : ''}>${label}</a>`;
    }).join('');
    $('#account-link').textContent = app.me ? first(app.me.name) : 'Sign in';
}

const ROUTES = [
    [/^\/?$/, viewHome],
    [/^\/directory$/, viewDirectory],
    [/^\/b\/(\d+)$/, viewDetail],
    [/^\/items\/amount\/(\d+)$/, n => {
        return viewDonate('amount', 0, Number(n));
    }],
    [/^\/items\/(\d+)$/, id => {
        return viewDonate('amount', Number(id));
    }],
    [/^\/items$/, viewItems],
    [/^\/give\/amount\/(\d+)$/, n => {
        return viewDonate('amount', 0, Number(n));
    }],
    [/^\/give(?:\/(\d+))?$/, id => {
        return viewGive(id);
    }],
    [/^\/receipt\/([\w-]+)$/, viewReceipt],
    [/^\/apply$/, viewApply],
    [/^\/impact$/, viewImpact],
    [/^\/volunteer$/, viewVolunteer],
    [/^\/faq$/, viewFaq],
    [/^\/readme$/, viewReadme],
    [/^\/more$/, viewMore],
    [/^\/account$/, viewAccount],
    [/^\/admin$/, viewAdmin],
];
let routeToken = 0;
async function route() {
    const path = location.hash.slice(1) || '/';
    const token = ++routeToken;
    buildChrome();
    $('#nav').classList.remove('open');
    $('#menu-btn').setAttribute('aria-expanded', 'false');
    const match = ROUTES.map(([re, fn]) => {
        return ({ m: path.match(re), fn });
    }).find(x => {
        return x.m;
    });
    progress('start');
    main.classList.remove('page-enter');
    main.innerHTML = '<p class="loading"><span class="spinner"></span>Loading…</p>';
    try {
        if (!match) {
            notFound();
        } else {
            await match.fn(...match.m.slice(1));
        }
        if (token === routeToken) {
            pageFx();
        }
    } catch (error) {
        if (token === routeToken) {
            main.innerHTML = `<div class="page empty"><h1>Something went wrong</h1><p>${esc(error.message)}</p><button class="btn" data-act="retry">Try again</button></div>`;
        }
    }
    if (token === routeToken) {
        progress('done');
        window.scrollTo(0, 0);
        main.focus({ preventScroll: true });
    }
}
actions.retry = () => {
    return route();
};
window.addEventListener('hashchange', route);
