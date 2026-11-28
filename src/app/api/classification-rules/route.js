import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireUser } from '@/lib/session';
import { parseId } from '@/lib/apiValidation';
import { badRequest } from '@/lib/apiResponses';
import { webContext } from '@/lib/changeLog';
import { RuleError, createManualRule, deleteRule, listRules, updateManualRule } from '@/lib/classificationRuleStore';

// Reglas de clasificación del usuario (Tarea NF-4), para la página Configuración › Reglas de clasificación.
// Cada cambio queda en el registro de cambios (source WEB) y la IA lo puede deshacer.

const PERSONAL_MODES = ['PERSONAL', 'BOTH'];
// Sin espacio elegido todavía no hay nada que clasificar.
const OPTIONS = { deny: ['UNSET'] };

async function handle(work, label) {
    try {
        return await work();
    } catch (error) {
        if (error instanceof RuleError) return NextResponse.json({ error: error.message }, { status: error.status });
        if (error?.code === 'P2002') return NextResponse.json({ error: 'Ya hay una regla para ese comercio y sentido' }, { status: 409 });
        console.error(`Error ${label} reglas de clasificación:`, error);
        return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
    }
}

async function body(request) {
    const data = await request.json().catch(() => null);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
}

// Lo que el formulario puede enviar (nombres de la base de datos).
function ruleFields(data) {
    const { merchant, pattern, direction, destination, business_id, account_id, flow_type, category, subcategory, payment_method, expense_type, source } = data;
    return { merchant, pattern, direction, destination, business_id, account_id, flow_type, category, subcategory, payment_method, expense_type, source };
}

// GET - Reglas del usuario y las opciones del formulario: categorías, métodos de pago usados y
// empresas con sus cuentas (solo las suyas).
export async function GET() {
    return handle(async () => {
        const auth = await requireUser(OPTIONS);
        if (auth.response) return auth.response;
        const { userId } = auth;
        const personal = PERSONAL_MODES.includes(auth.accountMode);
        const where = { user_id: userId };
        const [rules, businesses, expense, income, methods] = await Promise.all([
            listRules(userId),
            prisma.business.findMany({ where: { owner_user_id: userId }, orderBy: { id: 'asc' }, select: { id: true, name: true, accounts: { orderBy: { id: 'asc' }, select: { id: true, name: true } } } }),
            personal ? prisma.expenseCategory.findMany({ where, orderBy: { name: 'asc' }, select: { name: true } }) : [],
            personal ? prisma.incomeCategory.findMany({ where, orderBy: { name: 'asc' }, select: { name: true } }) : [],
            personal ? prisma.expense.groupBy({ by: ['payment_method'], where: { ...where, payment_method: { not: null } }, _count: true }) : [],
        ]);
        return NextResponse.json({
            rules,
            personal,
            businesses,
            categories: { expense: expense.map(row => row.name), income: income.map(row => row.name) },
            paymentMethods: methods.sort((a, b) => b._count - a._count).map(row => row.payment_method),
        }, { headers: { 'Cache-Control': 'no-store' } });
    }, 'obteniendo');
}

// POST - Crear una regla manual.
export async function POST(request) {
    return handle(async () => {
        const auth = await requireUser(OPTIONS);
        if (auth.response) return auth.response;
        const data = await body(request);
        if (!data) return badRequest('Datos inválidos');
        const change = webContext(auth.userId, 'reglas:crear');
        const { rule } = await prisma.$transaction(tx => createManualRule(tx, change, ruleFields(data), { personal: PERSONAL_MODES.includes(auth.accountMode) }));
        const [full] = await listRules(auth.userId, { id: rule.id });
        return NextResponse.json(full || rule, { status: 201 });
    }, 'creando');
}

// PUT - Editar una regla (se envía entera). Pasa a ser manual: el aprendizaje ya no la cambia.
export async function PUT(request) {
    return handle(async () => {
        const auth = await requireUser(OPTIONS);
        if (auth.response) return auth.response;
        const data = await body(request);
        const id = parseId(data?.id);
        if (!id) return badRequest('Identificador inválido');
        const change = webContext(auth.userId, 'reglas:editar');
        const { rule } = await prisma.$transaction(tx => updateManualRule(tx, change, id, ruleFields(data), { personal: PERSONAL_MODES.includes(auth.accountMode) }));
        const [full] = await listRules(auth.userId, { id: rule.id });
        return NextResponse.json(full || rule);
    }, 'editando');
}

// DELETE - Borrar una regla (?id=). Si era aprendida, se volverá a aprender en la próxima importación.
export async function DELETE(request) {
    return handle(async () => {
        const auth = await requireUser(OPTIONS);
        if (auth.response) return auth.response;
        const id = parseId(new URL(request.url).searchParams.get('id'));
        if (!id) return badRequest('Identificador inválido');
        await prisma.$transaction(tx => deleteRule(tx, webContext(auth.userId, 'reglas:borrar'), id));
        return NextResponse.json({ message: 'Regla eliminada' });
    }, 'borrando');
}
