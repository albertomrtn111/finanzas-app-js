'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

export default function ElegirCuentaPage() {
    const router = useRouter();
    const { update } = useSession();
    const [accountMode, setAccountMode] = useState('PERSONAL');
    const [businessName, setBusinessName] = useState('');
    const [businessKind, setBusinessKind] = useState('SELF_EMPLOYED');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    const submit = async event => {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            const response = await fetch('/api/user/account-setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountMode, businessName, businessKind }) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'No se pudo configurar la cuenta');
            await update();
            router.replace(accountMode === 'COMPANY' ? '/empresa' : '/onboarding');
            router.refresh();
        } catch (cause) {
            setError(cause.message);
        } finally {
            setSaving(false);
        }
    };

    return <div className="auth-container"><div className="auth-card">
        <h1 className="auth-title">Configura tu cuenta</h1>
        <p className="auth-subtitle">Elige los espacios que usarás. Más adelante podrás añadir Empresa desde tu perfil.</p>
        <form onSubmit={submit}>
            <fieldset className="form-group account-choice"><legend className="form-label">Quiero gestionar</legend>
                {[["PERSONAL", "Finanzas personales"], ["COMPANY", "Empresa"], ["BOTH", "Personal y empresa"]].map(([value, label]) => <label className="choice-option" key={value}>
                    <input type="radio" name="accountMode" value={value} checked={accountMode === value} onChange={() => setAccountMode(value)} />{label}
                </label>)}
            </fieldset>
            {accountMode !== 'PERSONAL' && <><div className="form-group"><label className="form-label" htmlFor="businessName">Nombre del negocio</label><input id="businessName" className="form-input" value={businessName} onChange={e => setBusinessName(e.target.value)} maxLength={120} required /></div>
                <div className="form-group"><label className="form-label" htmlFor="businessKind">Tipo</label><select id="businessKind" className="form-input form-select" value={businessKind} onChange={e => setBusinessKind(e.target.value)}><option value="SELF_EMPLOYED">Autónomo</option><option value="COMPANY">Sociedad</option></select></div></>}
            {error && <div className="alert alert-danger" role="alert">{error}</div>}
            <button className="btn btn-primary w-full" disabled={saving}>{saving ? 'Guardando...' : 'Continuar'}</button>
        </form>
    </div></div>;
}
