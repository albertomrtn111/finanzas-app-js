import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import archiver from 'archiver';
import { badRequest } from '@/lib/apiResponses';


export const dynamic = 'force-dynamic';

/**
 * GET /api/export
 * Query params:
 *   - format: 'zip' | 'json' (default: 'zip')
 *   - scope: 'all' | 'month' (default: 'all')
 *   - year: number (required if scope=month, e.g. 2026)
 *   - month: 1-12 (required if scope=month, 1=January)
 */
export async function GET(request) {
    try {
        // Auth check
        const session = await getServerSession(authOptions);
        if (!session?.user?.id || ['COMPANY', 'UNSET'].includes(session.user.accountMode)) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const { searchParams } = new URL(request.url);

        const format = searchParams.get('format') || 'zip';
        const scope = searchParams.get('scope') || 'all';
        const year = Number(searchParams.get('year') ?? new Date().getUTCFullYear());
        const month = Number(searchParams.get('month') ?? new Date().getUTCMonth() + 1);

        // Validate params
        if (!['zip', 'json'].includes(format)) {
            return NextResponse.json({ error: 'Formato inválido (zip o json)' }, { status: 400 });
        }
        if (!['all', 'month'].includes(scope)) {
            return NextResponse.json({ error: 'Scope inválido (all o month)' }, { status: 400 });
        }
        if (scope === 'month' && (!Number.isInteger(year) || year < 1900 || year > 2100 ||
            !Number.isInteger(month) || month < 1 || month > 12)) {
            return badRequest('Año o mes inválido');
        }

        // Build date filter for month scope
        let dateFilter = {};
        if (scope === 'month') {
            const startDate = new Date(Date.UTC(year, month - 1, 1));
            const endDate = new Date(Date.UTC(year, month, 1));
            dateFilter = {
                date: {
                    gte: startDate,
                    lt: endDate
                }
            };
        }

        // Fetch all user data
        const [
            incomes,
            expenses,
            budgets,
            cashSnapshots,
            investments,
            investmentProducts,
            expenseCategories,
            incomeCategories
        ] = await Promise.all([
            prisma.income.findMany({
                where: { user_id: userId, ...(scope === 'month' ? dateFilter : {}) },
                select: { id: true, date: true, amount: true, category: true, source: true, notes: true }
            }),
            prisma.expense.findMany({
                where: { user_id: userId, ...(scope === 'month' ? dateFilter : {}) },
                select: { id: true, date: true, amount: true, category: true, subcategory: true, payment_method: true, expense_type: true, notes: true }
            }),
            prisma.budget.findMany({
                where: { user_id: userId },
                select: { id: true, category: true, monthly_amount: true }
            }),
            prisma.cashSnapshot.findMany({
                where: { user_id: userId, ...(scope === 'month' ? dateFilter : {}) },
                select: { id: true, date: true, account: true, current_value: true, notes: true }
            }),
            prisma.investment.findMany({
                where: { user_id: userId, ...(scope === 'month' ? dateFilter : {}) },
                select: { id: true, date: true, account: true, asset_type: true, current_value: true, contribution: true, notes: true }
            }),
            prisma.investmentProduct.findMany({
                where: { user_id: userId },
                select: { id: true, name: true, asset_type: true }
            }),
            prisma.expenseCategory.findMany({
                where: { user_id: userId },
                select: { id: true, name: true }
            }),
            prisma.incomeCategory.findMany({
                where: { user_id: userId },
                select: { id: true, name: true }
            })
        ]);

        // Metadata
        const metadata = {
            userId,
            userEmail: session.user.email,
            generatedAt: new Date().toISOString(),
            scope,
            format,
            ...(scope === 'month' ? { year, month } : {})
        };

        const data = {
            metadata,
            incomes: formatDates(incomes),
            expenses: formatDates(expenses),
            budgets,
            cash_snapshots: formatDates(cashSnapshots),
            investments: formatDates(investments),
            investment_products: investmentProducts,
            expense_categories: expenseCategories,
            income_categories: incomeCategories
        };

        // Generate filename
        const now = new Date();
        const timestamp = now.toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
        const filename = `finanzas-export_${scope === 'month' ? `${year}-${String(month).padStart(2, '0')}` : 'completo'}_${timestamp}`;

        if (format === 'json') {
            // Return JSON file
            const jsonContent = JSON.stringify(data, null, 2);
            return new Response(jsonContent, {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Disposition': `attachment; filename="${filename}.json"`
                }
            });
        }

        // Generate ZIP with CSVs
        const zipBuffer = await generateZip(data);

        return new Response(zipBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="${filename}.zip"`
            }
        });

    } catch (error) {
        console.error('Export error:', error);
        return NextResponse.json({ error: 'Error al exportar datos' }, { status: 500 });
    }
}

// Format dates to ISO string for consistency
function formatDates(records) {
    return records.map(record => {
        const formatted = { ...record };
        if (formatted.date) {
            formatted.date = new Date(formatted.date).toISOString().split('T')[0];
        }
        return formatted;
    });
}

// Generate ZIP file with CSVs
async function generateZip(data) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        const archive = archiver('zip', { zlib: { level: 9 } });

        archive.on('data', chunk => chunks.push(chunk));
        archive.on('end', () => resolve(Buffer.concat(chunks)));
        archive.on('error', reject);

        // Add metadata.json
        archive.append(JSON.stringify(data.metadata, null, 2), { name: 'metadata.json' });

        // Add CSVs for each data type
        const tables = [
            { name: 'incomes', data: data.incomes },
            { name: 'expenses', data: data.expenses },
            { name: 'budgets', data: data.budgets },
            { name: 'cash_snapshots', data: data.cash_snapshots },
            { name: 'investments', data: data.investments },
            { name: 'investment_products', data: data.investment_products },
            { name: 'expense_categories', data: data.expense_categories },
            { name: 'income_categories', data: data.income_categories }
        ];

        for (const table of tables) {
            archive.append(toCSV(table.data), { name: `${table.name}.csv` });
        }

        archive.finalize();
    });
}

// Simple helper to convert array of objects to CSV
function toCSV(data) {
    if (!data || !data.length) return '';

    // Get headers from first object
    const headers = Object.keys(data[0]);
    const headerRow = headers.join(';');

    const rows = data.map(row => {
        return headers.map(header => {
            const val = row[header];
            if (val === null || val === undefined) return '';
            if (val instanceof Date) return val.toISOString();
            // Escape quotes if necessary, though simple data usually doesn't need it.
            // For safety, wrap in quotes if it contains delimiter
            // Spreadsheet programs can execute formulas in imported CSV files.
            const str = /^[\s]*[=+@-]/.test(String(val)) && typeof val === 'string'
                ? `'${val}` : String(val);
            if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        }).join(';');
    });

    return [headerRow, ...rows].join('\n');
}
