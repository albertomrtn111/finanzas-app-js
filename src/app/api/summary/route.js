import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { badRequest } from '@/lib/apiResponses';

export async function GET(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const { searchParams } = new URL(request.url);

        const year = Number(searchParams.get('year') ?? new Date().getUTCFullYear());
        const monthParam = searchParams.get('month');
        const month = monthParam !== null ? Number(monthParam) : -1;
        const period = searchParams.get('period') || 'year'; // 'month' or 'year'
        if (!Number.isInteger(year) || year < 1900 || year > 2100 ||
            !Number.isInteger(month) || month < -1 || month > 11 ||
            !['month', 'year'].includes(period) || (period === 'month' && month === -1)) {
            return badRequest('Periodo inválido');
        }

        // Helpers to determine date ranges
        const getRange = (y, m, p) => {
            if (p === 'year' || m === -1) {
                return {
                    start: new Date(Date.UTC(y, 0, 1)),
                    end: new Date(Date.UTC(y + 1, 0, 1))
                };
            } else {
                return {
                    start: new Date(Date.UTC(y, m, 1)),
                    end: new Date(Date.UTC(y, m + 1, 1))
                };
            }
        };

        const currentRange = getRange(year, month, period);

        // Previous period for trends
        let prevRange;
        if (period === 'year' || month === -1) {
            prevRange = getRange(year - 1, -1, 'year');
        } else {
            // Previous month
            const prevDate = new Date(Date.UTC(year, month - 1, 1));
            prevRange = getRange(prevDate.getUTCFullYear(), prevDate.getUTCMonth(), 'month');
        }

        // 1. Fetch Aggregated Totals for Current and Previous Period
        // We can do this in parallel
        const [
            currIncomes, currExpenses,
            prevIncomes, prevExpenses,
            monthlySeriesIncomes, monthlySeriesExpenses,
            categories, types,
            budgets
        ] = await Promise.all([
            // Current Totals
            prisma.income.aggregate({
                _sum: { amount: true },
                where: { user_id: userId, date: { gte: currentRange.start, lt: currentRange.end } }
            }),
            prisma.expense.aggregate({
                _sum: { amount: true },
                where: { user_id: userId, date: { gte: currentRange.start, lt: currentRange.end } }
            }),
            // Previous Totals
            prisma.income.aggregate({
                _sum: { amount: true },
                where: { user_id: userId, date: { gte: prevRange.start, lt: prevRange.end } }
            }),
            prisma.expense.aggregate({
                _sum: { amount: true },
                where: { user_id: userId, date: { gte: prevRange.start, lt: prevRange.end } }
            }),
            // Monthly Series (Always for the full requested year to populate the bar chart)
            // GroupBy is not fully supported for date truncation in all Prisma versions efficiently without raw query or post-processing.
            // Since dataset is per-user, fetching simple fields (date, amount) for the WHOLE YEAR is usually okay, 
            // or we use groupBy on raw if needed. For now, let's fetch subset and aggregate in JS for the series to avoid specialized raw SQL compatibility issues if possible,
            // BUT for "thousands of movements" request, we should try raw query or groupBy.
            // Prisma groupBy doesn't support "month of date". 
            // Let's stick to: Fetch ALL for the year (lightweight objects) and aggregate in JS. 
            // It's still better than sending them to frontend.
            prisma.income.findMany({
                where: { user_id: userId, date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
                select: { date: true, amount: true }
            }),
            prisma.expense.findMany({
                where: { user_id: userId, date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
                select: { date: true, amount: true }
            }),
            // Categories (Current Period)
            prisma.expense.groupBy({
                by: ['category'],
                _sum: { amount: true },
                where: { user_id: userId, date: { gte: currentRange.start, lt: currentRange.end } },
                orderBy: { _sum: { amount: 'desc' } }
            }),
            // Types (Current Period)
            prisma.expense.groupBy({
                by: ['expense_type'],
                _sum: { amount: true },
                where: { user_id: userId, date: { gte: currentRange.start, lt: currentRange.end } }
            }),
            // Budgets (Total monthly base)
            prisma.budget.aggregate({
                _sum: { monthly_amount: true },
                where: { user_id: userId }
            })
        ]);

        const currentIncomeTotal = currIncomes._sum.amount?.toNumber() || 0;
        const currentExpenseTotal = currExpenses._sum.amount?.toNumber() || 0;
        const prevIncomeTotal = prevIncomes._sum.amount?.toNumber() || 0;
        const prevExpenseTotal = prevExpenses._sum.amount?.toNumber() || 0;

        // KPI Calculations
        const savings = currentIncomeTotal - currentExpenseTotal;
        const savingsRate = currentIncomeTotal > 0 ? (savings / currentIncomeTotal) * 100 : 0;

        const prevSavings = prevIncomeTotal - prevExpenseTotal;

        // Trends
        const calcTrend = (curr, prev) => prev > 0 ? ((curr - prev) / prev) * 100 : 0;
        const incomeTrend = calcTrend(currentIncomeTotal, prevIncomeTotal);
        const expenseTrend = calcTrend(currentExpenseTotal, prevExpenseTotal);
        const savingsTrend = prevSavings !== 0 ? ((savings - prevSavings) / Math.abs(prevSavings)) * 100 : 0;

        // Budget
        const monthlyBudgetBase = budgets._sum.monthly_amount?.toNumber() || 0;
        // If viewing year, multiply budget by 12, else 1
        const displayedBudget = (period === 'year' || month === -1) ? monthlyBudgetBase * 12 : monthlyBudgetBase;
        const budgetUsageRatio = displayedBudget > 0 ? (currentExpenseTotal / displayedBudget) * 100 : 0;

        // Monthly Series Processing
        const monthSeries = Array(12).fill(0).map((_, i) => ({
            month: i,
            name: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][i],
            income: 0,
            expenses: 0,
            savings: 0
        }));

        monthlySeriesIncomes.forEach(i => {
            const m = new Date(i.date).getUTCMonth();
            if (m >= 0 && m < 12) monthSeries[m].income += Number(i.amount);
        });
        monthlySeriesExpenses.forEach(e => {
            const m = new Date(e.date).getUTCMonth();
            if (m >= 0 && m < 12) monthSeries[m].expenses += Number(e.amount);
        });
        // Calc savings per month
        monthSeries.forEach(m => m.savings = m.income - m.expenses);

        // Filter out empty months? Or keep for chart consistency? Usually keep for bar chart x-axis.
        // Let's only return months that have something or up to current month? 
        // User usually likes to see full year axis or strictly active months. Let's keep all.

        const response = {
            kpi: {
                income: currentIncomeTotal,
                expenses: currentExpenseTotal,
                savings: savings,
                savingsRate: savingsRate,
                trends: {
                    income: incomeTrend,
                    expenses: expenseTrend,
                    savings: savingsTrend
                }
            },
            budget: {
                total: displayedBudget,
                usage: currentExpenseTotal,
                ratio: budgetUsageRatio
            },
            charts: {
                monthly: monthSeries,
                categories: categories.map(c => ({ name: c.category, value: c._sum.amount?.toNumber() || 0 })),
                types: types.map(t => ({ name: t.expense_type || 'Variable', value: t._sum.amount?.toNumber() || 0 }))
            },
            meta: {
                year,
                month,
                period
            }
        };

        return NextResponse.json(response);
    } catch (error) {
        console.error('Error in Summary API:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
