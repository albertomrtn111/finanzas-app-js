import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireUser } from '@/lib/session';
import { parseId } from '@/lib/apiValidation';
import { badRequest } from '@/lib/apiResponses';
import { webContext } from '@/lib/changeLog';
import { RuleError, createManualRule, deleteRule, listRules, updateManualRule } from '@/lib/classificationRuleStore';

// Reglas de clasificación del usuario (Tarea NF-4), para las páginas Reglas de clasificación: la del
// espacio personal (todas las reglas) y la de cada empresa (?businessId=, solo las de esa empresa).
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

// Usuario de la sesión y, con ?businessId=, la empresa de la página (solo si es suya).
// Devuelve { userId, personal, businessId } o { response }.
async function scope(request) {
    const auth = await requireUser(OPTIONS);
    if (auth.response) return auth;
    const raw = new URL(request.url).searchParams.get('businessId');
    const base = { userId: auth.userId, personal: PERSONAL_MODES.includes(auth.accountMode), businessId: null };
    if (raw === null) return base;
    const businessId = parseId(raw);
    const business = businessId ? await prisma.business.findFirst({ where: { id: businessId, owner_user_id: auth.userId }, select: { id: true } }) : null;
    if (!business) return { response: NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 }) };
    return { ...base, businessId: business.id };
}

// Nombre del cambio en el registro: los de la página de una empresa se distinguen de los personales.
const tool = (auth, action) => (auth.businessId ? `empresa:reglas:${action}` : `reglas:${action}`);

// Categorías ya usadas en las operaciones de cada empresa, de más a menos usada.
async function businessCategories(businessIds) {
    const byBusiness = new Map(businessIds.map(id => [id, { expense: [], income: [] }]));
    if (!businessIds.length) return byBusiness;
    const used = await prisma.businessActivity.groupBy({ by: ['business_id', 'direction', 'category'], where: { business_id: { in: businessIds } }, _count: true });
    used.sort((a, b) => b._count - a._count || a.category.localeCompare(b.category, 'es'));
    for (const row of used) byBusiness.get(row.business_id)?.[row.direction === 'INCOME' ? 'income' : 'expense'].push(row.category);
    return byBusiness;
}

// GET - Reglas y opciones del formulario: categorías, métodos de pago usados y empresas con sus cuentas y
// categorías (solo las suyas). Con ?businessId=, solo las reglas y la empresa de esa página.
export async function GET(request) {
    return handle(async () => {
        const auth = await scope(request);
        if (auth.response) return auth.response;
        const { userId, businessId } = auth;
        const personal = auth.personal && !businessId;
        const where = { user_id: userId };
        const [rules, businesses, expense, income, methods] = await Promise.all([
            listRules(userId, businessId ? { business_id: businessId } : {}),
            prisma.business.findMany({
                where: { owner_user_id: userId, ...(businessId ? { id: businessId } : {}) }, orderBy: { id: 'asc' },
                select: { id: true, name: true, accounts: { orderBy: { id: 'asc' }, select: { id: true, name: true } } },
            }),
            personal ? prisma.expenseCategory.findMany({ where, orderBy: { name: 'asc' }, select: { name: true } }) : [],
            personal ? prisma.incomeCategory.findMany({ where, orderBy: { name: 'asc' }, select: { name: true } }) : [],
            personal ? prisma.expense.groupBy({ by: ['payment_method'], where: { ...where, payment_method: { not: null } }, _count: true }) : [],
        ]);
        const categoriesByBusiness = await businessCategories(businesses.map(business => business.id));
        return NextResponse.json({
            rules,
            personal,
            businessId,
            businesses: businesses.map(business => ({ ...business, categories: categoriesByBusiness.get(business.id) })),
            categories: { expense: expense.map(row => row.name), income: income.map(row => row.name) },
            paymentMethods: methods.sort((a, b) => b._count - a._count).map(row => row.payment_method),
        }, { headers: { 'Cache-Control': 'no-store' } });
    }, 'obteniendo');
}

// POST - Crear una regla manual (con ?businessId=, de esa empresa).
export async function POST(request) {
    return handle(async () => {
        const auth = await scope(request);
        if (auth.response) return auth.response;
        const data = await body(request);
        if (!data) return badRequest('Datos inválidos');
        const change = webContext(auth.userId, tool(auth, 'crear'));
        const { rule } = await prisma.$transaction(tx => createManualRule(tx, change, ruleFields(data), { personal: auth.personal, businessId: auth.businessId }));
        const [full] = await listRules(auth.userId, { id: rule.id });
        return NextResponse.json(full || rule, { status: 201 });
    }, 'creando');
}

// PUT - Editar una regla (se envía entera; con ?businessId=, solo una de esa empresa). Pasa a ser
// manual: el aprendizaje ya no la cambia.
export async function PUT(request) {
    return handle(async () => {
        const auth = await scope(request);
        if (auth.response) return auth.response;
        const data = await body(request);
        const id = parseId(data?.id);
        if (!id) return badRequest('Identificador inválido');
        const change = webContext(auth.userId, tool(auth, 'editar'));
        const { rule } = await prisma.$transaction(tx => updateManualRule(tx, change, id, ruleFields(data), { personal: auth.personal, businessId: auth.businessId }));
        const [full] = await listRules(auth.userId, { id: rule.id });
        return NextResponse.json(full || rule);
    }, 'editando');
}

// DELETE - Borrar una regla (?id=; con ?businessId=, solo una de esa empresa). Si era aprendida, se
// volverá a aprender en la próxima importación o corrección.
export async function DELETE(request) {
    return handle(async () => {
        const auth = await scope(request);
        if (auth.response) return auth.response;
        const id = parseId(new URL(request.url).searchParams.get('id'));
        if (!id) return badRequest('Identificador inválido');
        await prisma.$transaction(tx => deleteRule(tx, webContext(auth.userId, tool(auth, 'borrar')), id, { businessId: auth.businessId }));
        return NextResponse.json({ message: 'Regla eliminada' });
    }, 'borrando');
}
