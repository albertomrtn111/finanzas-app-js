// Llamadas del navegador a /api/expenses, /api/income y /api/categories para gastos e ingresos.
// Lanzan un Error con el mensaje del servidor (en español) cuando algo falla.

const ENDPOINT = { expense: '/api/expenses', income: '/api/income' };

async function failure(res, fallback) {
    const data = await res.json().catch(() => ({}));
    return new Error(data?.error || fallback);
}

async function request(url, init, fallback) {
    let res;
    try {
        res = await fetch(url, init);
    } catch (error) {
        if (error?.name === 'AbortError') throw error;
        throw new Error('Sin conexión con el servidor. Revisa la red e inténtalo de nuevo.');
    }
    if (!res.ok) throw await failure(res, fallback);
    return res;
}

// Página de movimientos con los filtros ya convertidos en consulta (filtersToQuery).
export async function fetchMovements(kind, query, { limit, offset = 0, signal } = {}) {
    const params = new URLSearchParams(query);
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    const res = await request(`${ENDPOINT[kind]}?${params}`, { signal }, 'No se han podido cargar los movimientos');
    const items = await res.json();
    return {
        items: Array.isArray(items) ? items : [],
        count: Number(res.headers.get('X-Total-Count')) || 0,
        total: res.headers.get('X-Total-Amount') || '0.00',
    };
}

// POST si no hay id; PUT para editar.
export async function saveMovement(kind, payload, id) {
    const res = await request(ENDPOINT[kind], {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(id ? { ...payload, id } : payload),
    }, `No se ha podido guardar el ${kind === 'income' ? 'ingreso' : 'gasto'}`);
    return res.json();
}

export async function deleteMovement(kind, id) {
    await request(`${ENDPOINT[kind]}?id=${encodeURIComponent(id)}`, { method: 'DELETE' }, `No se ha podido eliminar el ${kind === 'income' ? 'ingreso' : 'gasto'}`);
}

// Las categorías nuevas no se crean aparte: al guardar el movimiento, la API la da de alta si no
// existe. El formulario solo deja escribir un nombre nuevo tras elegir «+ Nueva categoría» y
// reutiliza la existente si coincide sin mayúsculas ni tildes.
export async function fetchCategories(kind, signal) {
    const res = await request(`/api/categories?type=${kind}`, { signal }, 'No se han podido cargar las categorías');
    const list = await res.json();
    return Array.isArray(list) ? list : [];
}
