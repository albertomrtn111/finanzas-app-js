// Reglas puras del registro de cambios (src/lib/changeLog.js), sin base de datos, para poder probarlas.
import { randomUUID } from 'node:crypto';

// Entidad registrada → modelo de Prisma y ámbito de propiedad.
export const ENTITIES = {
    expense: { model: 'expense', scope: 'user', label: 'gasto' },
    income: { model: 'income', scope: 'user', label: 'ingreso' },
    cash_snapshot: { model: 'cashSnapshot', scope: 'user', label: 'saldo de efectivo' },
    investment: { model: 'investment', scope: 'user', label: 'registro de inversión' },
    investment_product: { model: 'investmentProduct', scope: 'user', label: 'producto de inversión' },
    budget: { model: 'budget', scope: 'user', label: 'presupuesto' },
    expense_category: { model: 'expenseCategory', scope: 'user', label: 'categoría de gasto' },
    income_category: { model: 'incomeCategory', scope: 'user', label: 'categoría de ingreso' },
    business_activity: { model: 'businessActivity', scope: 'business', label: 'operación de empresa' },
    business_movement: { model: 'businessMovement', scope: 'business', label: 'movimiento de empresa' },
    business_account: { model: 'businessAccount', scope: 'business', label: 'cuenta de empresa' },
    business_cash_plan: { model: 'businessCashPlan', scope: 'business', label: 'previsión de empresa' },
    business_budget: { model: 'businessBudget', scope: 'business', label: 'presupuesto de empresa' },
    business_movement_links: { scope: 'business', label: 'vínculos de movimiento con facturas' },
    classification_rule: { model: 'classificationRule', scope: 'user', label: 'regla de clasificación' },
};

// Desde dónde se hizo el cambio: la IA (servidor MCP) o la web.
export const SOURCES = { MCP: 'IA (MCP)', WEB: 'web' };

const IGNORED_FIELDS = new Set(['updated_at', 'allocations']);

// Copia JSON fiel, para guardar en el registro de cambios y poder restaurar.
export function snapshot(value) {
    if (value === undefined || value === null) return null;
    return JSON.parse(JSON.stringify(value));
}

function scalars(record) {
    const result = {};
    for (const [key, value] of Object.entries(record || {})) {
        if (!IGNORED_FIELDS.has(key)) result[key] = value;
    }
    return result;
}

// JSON con las claves ordenadas: PostgreSQL (JSONB) no conserva el orden original.
function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
}

// ¿El registro sigue como quedó tras el cambio? updated_at y los vínculos no cuentan.
export function sameRecord(current, expected) {
    return canonical(scalars(snapshot(current))) === canonical(scalars(snapshot(expected)));
}

// Contexto de un cambio hecho desde la web. tool identifica la ruta y la acción: «gastos:crear»
// queda como «web:gastos:crear».
export function webContext(userId, tool) {
    return { userId, tool: `web:${tool}`, source: 'WEB' };
}

// Lote para agrupar los cambios de una sola petición y deshacerlos juntos.
export function newBatchId(prefix = 'web') {
    return `${prefix}-${randomUUID()}`;
}

const cents = value => Math.round(Number(String(value)) * 100);

// Guardar todos los presupuestos de golpe (la web los envía todos): qué hay que borrar, cambiar
// y crear para pasar de existing (registros) a wanted ({ category, monthly_amount }).
// Los que no cambian no se tocan, para que el registro de cambios solo recoja lo que cambió.
export function planBudgetReplacement(existing, wanted) {
    const current = new Map(existing.map(budget => [budget.category, budget]));
    const kept = new Set(wanted.map(budget => budget.category));
    const removed = existing.filter(budget => !kept.has(budget.category));
    const changed = [];
    const added = [];
    for (const budget of wanted) {
        const before = current.get(budget.category);
        if (!before) added.push(budget);
        else if (cents(before.monthly_amount) !== cents(budget.monthly_amount)) changed.push({ before, monthly_amount: budget.monthly_amount });
    }
    return { removed, changed, added };
}

// Quita del registro lo que no es la propia fila (p. ej., _count o los vínculos incluidos).
export function withoutRelations(record, keys = ['_count', 'allocations', 'attachments']) {
    const copy = { ...record };
    for (const key of keys) delete copy[key];
    return copy;
}
