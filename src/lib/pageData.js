// Lectura en el servidor de lo que pintan Resumen, Patrimonio e Inversiones › Resumen (Tarea NF-20).
// Las páginas son Server Components: llaman aquí con el usuario de la sesión y reciben los datos listos.
// Si la base de datos falla, el error sube hasta error.js («Reintentar»): nunca se pinta como «sin datos».
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from './auth.js';
import prisma from './db.js';
import { madridToday, monthRange, yearRange } from './personalSummary.js';
import { loadPersonalSummary, recordYears } from './personalSummaryData.js';
import { buildResumenView } from './resumenView.js';
import { buildInversionesView, buildPatrimonioView } from './wealth.js';

// Usuario de la sesión. El layout de (dashboard) también redirige, pero la página se renderiza en
// paralelo con él, así que no puede leer datos sin comprobarlo ella misma.
export async function requireUserId() {
    const session = await getServerSession(authOptions);
    const userId = Number(session?.user?.id);
    if (!Number.isSafeInteger(userId) || userId < 1) redirect('/login');
    return userId;
}

export function todayInSpain() {
    return madridToday();
}

const SNAPSHOT_FIELDS = { id: true, date: true, account: true, current_value: true };

export async function loadResumen(userId, period, today = madridToday()) {
    const { from, to } = period.view === 'year' ? yearRange(period.year) : monthRange(period.year, period.month + 1);
    const series = yearRange(period.year);
    const [summary, years] = await Promise.all([
        loadPersonalSummary(userId, { from, to, today, seriesFrom: series.from, seriesTo: series.to }),
        recordYears(userId),
    ]);
    return buildResumenView({ summary, years, period, today });
}

export async function loadPatrimonio(userId, { months, today = madridToday() }) {
    const [cash, investments] = await Promise.all([
        prisma.cashSnapshot.findMany({ where: { user_id: userId }, select: SNAPSHOT_FIELDS }),
        prisma.investment.findMany({ where: { user_id: userId }, select: { ...SNAPSHOT_FIELDS, asset_type: true, contribution: true } }),
    ]);
    return buildPatrimonioView({ cash, investments, today, months });
}

export async function loadInversiones(userId, { months, today = madridToday() }) {
    const investments = await prisma.investment.findMany({
        where: { user_id: userId },
        select: { ...SNAPSHOT_FIELDS, asset_type: true, contribution: true },
    });
    return buildInversionesView({ investments, today, months });
}
