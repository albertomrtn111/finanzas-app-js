'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import McpAccess from '@/components/McpAccess';
import SecuritySettings from '@/components/SecuritySettings';
import { Field, LoadState, useFeedback } from '@/components/ui';
import { jsonRequest, monthOptions, requestJson } from '@/lib/utils';

const MONTHS = monthOptions();
const EXPORT_FORMATS = [{ value: 'zip', label: 'ZIP (un CSV por tipo de dato)' }, { value: 'json', label: 'JSON' }];
const EXPORT_SCOPES = [{ value: 'all', label: 'Todo' }, { value: 'month', label: 'Un mes' }];

// Grupo de opciones con su leyenda; cada opción lleva su etiqueta asociada.
function RadioGroup({ legend, name, options, value, onChange }) {
    return (
        <fieldset className="form-group radio-fieldset">
            <legend className="form-label">{legend}</legend>
            <div className="radio-group">
                {options.map(option => {
                    const id = `${name}-${option.value}`;
                    return (
                        <label key={option.value} className="radio-label" htmlFor={id}>
                            <input id={id} type="radio" name={name} value={option.value} checked={value === option.value} onChange={e => onChange(e.target.value)} />
                            <span>{option.label}</span>
                        </label>
                    );
                })}
            </div>
        </fieldset>
    );
}

export default function PerfilPage({ businessContext = false }) {
    const { update: updateSession } = useSession();
    const router = useRouter();
    const { toast } = useFeedback();
    const [profile, setProfile] = useState({ name: '', email: '', authMethod: 'credentials' });
    const [name, setName] = useState('');
    const [nameError, setNameError] = useState('');
    const [status, setStatus] = useState({ loading: true, error: '' });
    const [saving, setSaving] = useState(false);
    const [businessName, setBusinessName] = useState('');
    const [businessKind, setBusinessKind] = useState('SELF_EMPLOYED');
    const [creatingBusiness, setCreatingBusiness] = useState(false);

    // Exportación
    const [exportFormat, setExportFormat] = useState('zip');
    const [exportScope, setExportScope] = useState('all');
    const [exportYear, setExportYear] = useState(() => String(new Date().getFullYear()));
    const [exportMonth, setExportMonth] = useState(() => new Date().getMonth() + 1);
    const [yearError, setYearError] = useState('');
    const [exporting, setExporting] = useState(false);

    const loadProfile = useCallback(async () => {
        setStatus({ loading: true, error: '' });
        try {
            const data = await requestJson('/api/user/profile');
            setProfile(data);
            setName(data.name || '');
            setStatus({ loading: false, error: '' });
        } catch (error) {
            setStatus({ loading: false, error: error.message });
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => { void loadProfile(); }, 0);
        return () => clearTimeout(timer);
    }, [loadProfile]);

    const handleSave = async (event) => {
        event.preventDefault();
        if (!name.trim()) {
            setNameError('El nombre no puede estar vacío');
            document.getElementById('perfil-nombre')?.focus();
            return;
        }

        setSaving(true);
        try {
            const data = await requestJson('/api/user/profile', jsonRequest('PATCH', { name: name.trim() }));
            setProfile(prev => ({ ...prev, name: data.name }));
            await updateSession().catch(() => {});
            toast({ text: 'Nombre guardado' });
        } catch (error) {
            toast({ type: 'error', text: error.message });
        } finally {
            setSaving(false);
        }
    };

    const handleExport = async (event) => {
        event.preventDefault();
        if (exportScope === 'month' && (!/^\d{4}$/.test(exportYear) || Number(exportYear) < 1900 || Number(exportYear) > 2100)) {
            setYearError('Elige un año entre 1900 y 2100');
            document.getElementById('export-year')?.focus();
            return;
        }
        setExporting(true);
        try {
            const params = new URLSearchParams({ format: exportFormat, scope: exportScope });
            if (exportScope === 'month') {
                params.set('year', exportYear);
                params.set('month', String(exportMonth));
            }

            let res;
            try {
                res = await fetch(`/api/export?${params.toString()}`);
            } catch {
                throw new Error('No hay conexión con el servidor. Comprueba tu conexión y vuelve a intentarlo.');
            }
            if (!res.ok) {
                const error = await res.json().catch(() => ({}));
                throw new Error(error.error || 'No se han podido exportar los datos');
            }

            // Descarga del archivo con el nombre que propone el servidor
            const blob = await res.blob();
            const match = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/);
            const filename = match ? match[1] : `finanzas-export.${exportFormat}`;
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => window.URL.revokeObjectURL(url), 1000);
            document.body.removeChild(a);

            toast({ text: `Exportación lista: ${filename}` });
        } catch (error) {
            toast({ type: 'error', text: error.message });
        } finally {
            setExporting(false);
        }
    };

    const handleCreateBusiness = async (event) => {
        event.preventDefault();
        setCreatingBusiness(true);
        try {
            const result = await requestJson('/api/businesses', jsonRequest('POST', { name: businessName, kind: businessKind }));
            await updateSession();
            router.push(`/empresa/${result.id}/resumen`);
            router.refresh();
        } catch (error) {
            toast({ type: 'error', text: error.message });
            setCreatingBusiness(false);
        }
    };

    if (status.loading || status.error) {
        return (
            <div className="page-container">
                <div className="page-header"><h1 className="page-title">Mi Perfil</h1></div>
                <LoadState loading={status.loading} error={status.error} onRetry={loadProfile} label="Cargando tu perfil…" />
            </div>
        );
    }

    const businesses = profile.businesses || [];

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Mi Perfil</h1>
                <p className="page-subtitle">Gestiona tu acceso y tu seguridad, cambia de espacio financiero y conecta tu IA</p>
            </div>

            <section className="card business-spaced" aria-labelledby="perfil-espacios-titulo">
                <div className="card-header"><h2 id="perfil-espacios-titulo">Espacios financieros</h2></div>
                <div className="card-body business-list">
                    {profile.accountMode !== 'COMPANY' && <div className="business-line"><span>Personal</span><Link className="btn btn-secondary" href="/">Ir a Personal</Link></div>}
                    {businesses.map(business => (
                        <div className="business-line" key={business.id}>
                            <span>{business.name} · {business.kind === 'COMPANY' ? 'Sociedad' : 'Autónomo'}</span>
                            <Link className="btn btn-primary" href={`/empresa/${business.id}/resumen`}>Cambiar a cuenta de empresa</Link>
                        </div>
                    ))}
                    {businesses.length > 0 && <Link className="btn btn-secondary btn-fit" href="/empresa/nueva">Añadir otra empresa</Link>}
                    {businesses.length === 0 && (
                        <form onSubmit={handleCreateBusiness} className="business-form-grid">
                            <Field label="Nombre del negocio" htmlFor="newBusinessName">
                                <input id="newBusinessName" className="form-input" value={businessName} onChange={e => setBusinessName(e.target.value)} maxLength={120} required />
                            </Field>
                            <Field label="Tipo" htmlFor="newBusinessKind">
                                <select id="newBusinessKind" className="form-input form-select" value={businessKind} onChange={e => setBusinessKind(e.target.value)}>
                                    <option value="SELF_EMPLOYED">Autónomo</option>
                                    <option value="COMPANY">Sociedad</option>
                                </select>
                            </Field>
                            <div className="business-full">
                                <button type="submit" className="btn btn-primary" disabled={creatingBusiness}>{creatingBusiness ? 'Creando…' : 'Crear cuenta de empresa'}</button>
                            </div>
                        </form>
                    )}
                </div>
            </section>

            <McpAccess />

            <SecuritySettings hasPassword={profile.hasPassword} />

            <div className="grid grid-2 gap-lg">
                <section className="card" aria-labelledby="perfil-datos-titulo">
                    <div className="card-header">
                        <h2 id="perfil-datos-titulo">Información personal</h2>
                    </div>
                    <div className="card-body">
                        <div className="profile-avatar" aria-hidden="true">
                            {(profile.name || profile.email || '?')[0].toUpperCase()}
                        </div>
                        <form onSubmit={handleSave} noValidate>
                            <Field label="Nombre" htmlFor="perfil-nombre" error={nameError}>
                                <input
                                    id="perfil-nombre"
                                    type="text"
                                    className="form-input"
                                    value={name}
                                    onChange={(e) => { setName(e.target.value); setNameError(''); }}
                                    placeholder="Tu nombre"
                                    autoComplete="name"
                                    maxLength={50}
                                    aria-invalid={Boolean(nameError)}
                                    aria-describedby={nameError ? 'perfil-nombre-error' : undefined}
                                    required
                                />
                            </Field>
                            <Field label="Email" htmlFor="perfil-email" hint="El email con el que entras no se puede cambiar.">
                                <input id="perfil-email" type="email" className="form-input" value={profile.email || ''} readOnly aria-describedby="perfil-email-ayuda" />
                            </Field>
                            <div className="form-actions">
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? 'Guardando…' : 'Guardar cambios'}
                                </button>
                            </div>
                        </form>
                    </div>
                </section>

                {profile.accountMode !== 'COMPANY' && !businessContext && (
                    <section className="card" aria-labelledby="perfil-exportar-titulo">
                        <div className="card-header">
                            <h2 id="perfil-exportar-titulo">Exportar datos</h2>
                        </div>
                        <div className="card-body">
                            <p className="text-muted mb-md">
                                Descarga tus datos financieros personales en un ZIP (un CSV por tipo de dato) o en JSON.
                            </p>
                            <form onSubmit={handleExport}>
                                <RadioGroup legend="Formato" name="export-format" options={EXPORT_FORMATS} value={exportFormat} onChange={setExportFormat} />
                                <RadioGroup legend="Alcance" name="export-scope" options={EXPORT_SCOPES} value={exportScope} onChange={setExportScope} />

                                {exportScope === 'month' && (
                                    <div className="grid grid-2 gap-md">
                                        <Field label="Mes" htmlFor="export-month">
                                            <select id="export-month" className="form-input form-select" value={exportMonth} onChange={event => setExportMonth(Number(event.target.value))}>
                                                {MONTHS.map(month => <option key={month.value} value={month.value}>{month.label}</option>)}
                                            </select>
                                        </Field>
                                        <Field label="Año" htmlFor="export-year" error={yearError}>
                                            <input
                                                id="export-year"
                                                type="text"
                                                inputMode="numeric"
                                                maxLength={4}
                                                className="form-input"
                                                value={exportYear}
                                                onChange={event => { setExportYear(event.target.value.trim()); setYearError(''); }}
                                                aria-invalid={Boolean(yearError)}
                                                aria-describedby={yearError ? 'export-year-error' : undefined}
                                            />
                                        </Field>
                                    </div>
                                )}

                                <div className="form-actions">
                                    <button type="submit" className="btn btn-primary" disabled={exporting}>
                                        {exporting && <span className="spinner-small" aria-hidden="true"></span>}
                                        {exporting ? 'Exportando…' : 'Exportar datos'}
                                    </button>
                                </div>
                            </form>

                            <p className="text-muted text-sm mt-md">
                                Incluye ingresos, gastos, presupuestos, inversiones, efectivo, categorías y productos.
                            </p>
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}
