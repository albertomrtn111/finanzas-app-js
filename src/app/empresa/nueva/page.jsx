'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

export default function NuevaEmpresa() {
    const router = useRouter();
    const { update } = useSession();
    const [name, setName] = useState('');
    const [kind, setKind] = useState('SELF_EMPLOYED');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const submit = async event => {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            const response = await fetch('/api/businesses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, kind }) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'No se pudo crear el espacio');
            await update();
            router.replace(`/empresa/${result.id}/resumen`);
            router.refresh();
        } catch (cause) {
            setError(cause.message);
        } finally { setSaving(false); }
    };
    return <div className="auth-container"><div className="auth-card">
        <h1 className="auth-title">Añade tu empresa</h1>
        <p className="auth-subtitle">El espacio de empresa tendrá sus propias cuentas, operaciones e IVA.</p>
        <form onSubmit={submit}>
            <div className="form-group"><label className="form-label" htmlFor="businessName">Nombre del negocio</label><input id="businessName" className="form-input" value={name} maxLength={120} onChange={e => setName(e.target.value)} required /></div>
            <div className="form-group"><label className="form-label" htmlFor="businessKind">Tipo</label><select id="businessKind" className="form-input form-select" value={kind} onChange={e => setKind(e.target.value)}><option value="SELF_EMPLOYED">Autónomo</option><option value="COMPANY">Sociedad</option></select></div>
            {error && <div role="alert" className="alert alert-danger">{error}</div>}
            <button className="btn btn-primary w-full" disabled={saving}>{saving ? 'Creando...' : 'Crear espacio de empresa'}</button>
        </form>
    </div></div>;
}
