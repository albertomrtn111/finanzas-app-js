import { NextResponse } from 'next/server';
import { requirePersonalUser } from '@/lib/session';
import prisma from '@/lib/db';
import { badRequest } from '@/lib/apiResponses';
import { madridToday, monthRange, periodTotals, rangeLabel, yearRange } from '@/lib/personalSummary';
import { dateWhere, lastRecordAt } from '@/lib/personalSummaryData';

const RECENT = 5;

// Datos ligeros para Inicio: totales del mes o del año en curso (mismo cálculo que Resumen y el MCP),
// los últimos movimientos del periodo y el momento del último registro. No descarga todos los movimientos.
export async function GET(request) {
    try {
        const auth = await requirePersonalUser();
        if (auth.response) return auth.response;
        const { userId } = auth;
        const period = new URL(request.url).searchParams.get('period') || 'month';
        if (!['month', 'year'].includes(period)) return badRequest('Periodo inválido');

        const today = madridToday();
        const [year, month] = today.split('-').map(Number);
        const { from, to } = period === 'month' ? monthRange(year, month) : yearRange(year);
        const where = { user_id: userId, date: dateWhere(from, to) };
        const recentQuery = { where, orderBy: [{ date: 'desc' }, { created_at: 'desc' }, { id: 'desc' }], take: RECENT };

        const [expenses, incomes, recentExpenses, recentIncomes, lastRecord] = await Promise.all([
            prisma.expense.findMany({ where, select: { date: true, amount: true } }),
            prisma.income.findMany({ where, select: { date: true, amount: true } }),
            prisma.expense.findMany({ ...recentQuery, select: { id: true, date: true, amount: true, category: true, notes: true, created_at: true } }),
            prisma.income.findMany({ ...recentQuery, select: { id: true, date: true, amount: true, category: true, source: true, created_at: true } }),
            lastRecordAt(userId),
        ]);

        const recent = [
            ...recentIncomes.map(r => ({ id: r.id, type: 'income', title: r.source || r.category, date: r.date, amount: r.amount, created_at: r.created_at })),
            ...recentExpenses.map(r => ({ id: r.id, type: 'expense', title: r.category, date: r.date, amount: r.amount, created_at: r.created_at })),
        ].sort((a, b) => (b.date - a.date) || (b.created_at - a.created_at)).slice(0, RECENT)
            .map(({ created_at, ...item }) => item);

        return NextResponse.json({
            period: { kind: period, from, to, label: rangeLabel(from, to) },
            totals: periodTotals({ expenses, incomes, from, to }),
            recent,
            lastRecordAt: lastRecord,
            today,
        });
    } catch (error) {
        console.error('Error en el resumen de Inicio:', error);
        return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
    }
}
