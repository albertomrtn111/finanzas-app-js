// Cliente HTTP con cookies para las pruebas de extremo a extremo contra la app en marcha.
export function client(base, ipAddress) {
    const jar = new Map();
    const store = res => {
        for (const raw of res.headers.getSetCookie()) {
            const pair = raw.split(';')[0];
            const at = pair.indexOf('=');
            const value = pair.slice(at + 1);
            if (!value || /expires=Thu, 01 Jan 1970/i.test(raw) || /max-age=0/i.test(raw)) jar.delete(pair.slice(0, at));
            else jar.set(pair.slice(0, at), value);
        }
    };
    const request = async (path, init = {}) => {
        const res = await fetch(`${base}${path}`, {
            redirect: 'manual',
            ...init,
            headers: { 'x-real-ip': ipAddress, cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...(init.headers || {}) },
        });
        store(res);
        return res;
    };
    return {
        request,
        async login(email, password) {
            const { csrfToken } = await (await request('/api/auth/csrf')).json();
            const res = await request('/api/auth/callback/credentials', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ csrfToken, email, password, json: 'true' }),
            });
            const data = await res.json().catch(() => ({}));
            return data.url ? new URL(data.url).searchParams.get('error') : 'sin respuesta';
        },
        async session() {
            return (await request('/api/auth/session')).json();
        },
        json(path, method, body) {
            return request(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
        },
    };
}
