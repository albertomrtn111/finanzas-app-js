import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { badRequest } from '@/lib/apiResponses';
import { financialStatus, madridToday, monthRange, yearRange, yearSeries } from '@/lib/personalSummary';
import { loadPersonalSummary, recordYears } from '@/lib/personalSummaryData';

// Resumen personal de un mes o de un año para la página Resumen y Presupuestos.
// Todo el cálculo sale de src/lib/personalSummary.js, el mismo que usa la herramienta resumen_personal del MCP.
export async function GET(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id || ['COMPANY', 'UNSET'].includes(session.user.accountMode)) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const { searchParams } = new URL(request.url);
        const today = madridToday();

        const year = Number(searchParams.get('year') ?? today.slice(0, 4));
        const monthParam = searchParams.get('month');
        const month = monthParam !== null ? Number(monthParam) : -1;
        const period = searchParams.get('period') || 'year'; // 'month' o 'year'
        if (!Number.isInteger(year) || year < 1900 || year > 2100 ||
            !Number.isInteger(month) || month < -1 || month > 11 ||
            !['month', 'year'].includes(period) || (period === 'month' && month === -1)) {
            return badRequest('Periodo inválido');
        }

        const isMonth = period === 'month';
        const { from, to } = isMonth ? monthRange(year, month + 1) : yearRange(year);
        const series = yearRange(year);
        const [summary, years] = await Promise.all([
            loadPersonalSummary(userId, { from, to, today, seriesFrom: series.from, seriesTo: series.to }),
            recordYears(userId),
        ]);

        const { totals, budget, comparison } = summary;
        const status = financialStatus({ hasData: summary.hasData, budget, savings: totals.savings, savingsRate: totals.savingsRate });

        return NextResponse.json({
            kpi: {
                income: totals.income,
                expenses: totals.expenses,
                savings: totals.savings,
                savingsRate: totals.savingsRate,
                // Variaciones frente al tramo equivalente (ver comparison); null si no hay con qué comparar.
                trends: {
                    income: comparison.change.incomePct,
                    expenses: comparison.change.expensesPct,
                    savings: comparison.change.savingsPct,
                },
            },
            comparison,
            budget: {
                // Solo categorías con presupuesto: lo presupuestado frente a lo gastado en ellas.
                total: budget.total,
                usage: budget.spent,
                ratio: budget.ratio ?? 0,
                remaining: budget.remaining,
                unbudgeted: budget.unbudgetedSpent,
                unbudgetedCategories: budget.unbudgetedCategories,
                overCategories: budget.overCategories,
                months: budget.months,
                status: budget.status,
                categories: budget.categories,
            },
            status,
            charts: {
                monthly: yearSeries(summary.monthly, year),
                categories: summary.byCategory.filter(c => c.spent !== 0).map(c => ({ name: c.category, value: c.spent })),
                types: summary.byType.map(t => ({ name: t.name, value: t.amount })),
            },
            meta: {
                year,
                month,
                period,
                from,
                to,
                today,
                partial: summary.period.partial,
                hasData: summary.hasData,
                firstYear: years.first,
                lastYear: years.last,
            },
        });
    } catch (error) {
        console.error('Error en el resumen personal:', error);
        return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
    }
}
