import RulesManager from '@/components/rules/RulesManager';

// Reglas de clasificación de una empresa (Tarea NF-4): solo las suyas, también para una cuenta que solo
// tiene empresas. El layout de la empresa ya comprueba que es del usuario de la sesión.
export default async function Page({ params }) {
    const { businessId } = await params;
    return <RulesManager businessId={Number(businessId)} />;
}
