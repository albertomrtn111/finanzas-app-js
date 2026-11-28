// Carga desde la base de datos lo que necesita el resumen personal y lo calcula con el módulo compartido.
// Lo usan /api/summary, /api/summary/home y la herramienta resumen_personal del MCP.
import prisma from './db.js';
import { computePersonalSummary, madridToday, summaryLoadRange } from './personalSummary.js';

const utc = key => new Date(`${key}T00:00:00.000Z`);

export function dateWhere(from, to) {
    return { gte: utc(from), lte: utc(to) };
}

export async function loadPersonalSummary(userId, { from, to, today = madridToday(), seriesFrom = null, seriesTo = null }) {
    const range = summaryLoadRange({ from, to, today, seriesFrom, seriesTo });
    const where = { user_id: userId, date: dateWhere(range.from, range.to) };
    const [expenses, incomes, budgets] = await Promise.all([
        prisma.expense.findMany({
            where,
            select: { id: true, date: true, amount: true, category: true, subcategory: true, expense_type: true, notes: true },
        }),
        prisma.income.findMany({ where, select: { id: true, date: true, amount: true, category: true } }),
        prisma.budget.findMany({ where: { user_id: userId }, select: { category: true, monthly_amount: true } }),
    ]);
    return computePersonalSummary({ expenses, incomes, budgets, from, to, today, seriesFrom, seriesTo });
}

// Primer y último año con movimientos, para ofrecer solo años con sentido en los selectores.
export async function recordYears(userId) {
    const where = { user_id: userId };
    const [expenses, incomes] = await Promise.all([
        prisma.expense.aggregate({ where, _min: { date: true }, _max: { date: true } }),
        prisma.income.aggregate({ where, _min: { date: true }, _max: { date: true } }),
    ]);
    const years = [expenses._min.date, expenses._max.date, incomes._min.date, incomes._max.date]
        .filter(Boolean).map(date => new Date(date).getUTCFullYear());
    return years.length ? { first: Math.min(...years), last: Math.max(...years) } : { first: null, last: null };
}

// Momento del último registro personal (gasto, ingreso, saldo o inversión), para «Última actualización».
export async function lastRecordAt(userId) {
    const where = { user_id: userId };
    const rows = await Promise.all([
        prisma.expense.aggregate({ where, _max: { created_at: true } }),
        prisma.income.aggregate({ where, _max: { created_at: true } }),
        prisma.cashSnapshot.aggregate({ where, _max: { created_at: true } }),
        prisma.investment.aggregate({ where, _max: { created_at: true } }),
    ]);
    const times = rows.map(r => r._max.created_at).filter(Boolean).map(date => new Date(date).getTime());
    return times.length ? new Date(Math.max(...times)).toISOString() : null;
}
