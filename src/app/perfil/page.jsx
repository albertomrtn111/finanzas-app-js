'use client';

import { useState, useEffect } from 'react';

export default function PerfilPage() {
    const [profile, setProfile] = useState({ name: '', email: '', authMethod: 'credentials' });
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    // Export state
    const [exportFormat, setExportFormat] = useState('zip');
    const [exportScope, setExportScope] = useState('all');
    const [exporting, setExporting] = useState(false);
    const [exportMessage, setExportMessage] = useState({ type: '', text: '' });

    useEffect(() => {
        loadProfile();
    }, []);

    const loadProfile = async () => {
        try {
            const res = await fetch('/api/user/profile');
            if (res.ok) {
                const data = await res.json();
                setProfile(data);
                setName(data.name || '');
            }
        } catch (error) {
            console.error('Error loading profile:', error);
        }
        setLoading(false);
    };

    const handleSave = async () => {
        if (!name.trim()) {
            setMessage({ type: 'error', text: 'El nombre no puede estar vacío' });
            return;
        }

        setSaving(true);
        setMessage({ type: '', text: '' });

        try {
            const res = await fetch('/api/user/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim() })
            });

            if (res.ok) {
                const data = await res.json();
                setProfile(prev => ({ ...prev, name: data.name }));
                setMessage({ type: 'success', text: '¡Guardado correctamente!' });
                setTimeout(() => setMessage({ type: '', text: '' }), 3000);
            } else {
                const error = await res.json();
                setMessage({ type: 'error', text: error.error || 'Error al guardar' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Error de conexión' });
        }
        setSaving(false);
    };

    const handleExport = async () => {
        setExporting(true);
        setExportMessage({ type: '', text: '' });

        try {
            // Build URL with params
            const params = new URLSearchParams({ format: exportFormat, scope: exportScope });

            if (exportScope === 'month') {
                const now = new Date();
                params.set('year', now.getFullYear().toString());
                params.set('month', (now.getMonth() + 1).toString()); // 1-12
            }

            const res = await fetch(`/api/export?${params.toString()}`);

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Error al exportar');
            }

            // Get blob and trigger download
            const blob = await res.blob();
            const contentDisposition = res.headers.get('Content-Disposition');
            let filename = `finanzas-export.${exportFormat}`;

            if (contentDisposition) {
                const match = contentDisposition.match(/filename="(.+)"/);
                if (match) filename = match[1];
            }

            // Create download link
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            setExportMessage({ type: 'success', text: '¡Exportación completada!' });
            setTimeout(() => setExportMessage({ type: '', text: '' }), 3000);

        } catch (error) {
            console.error('Export error:', error);
            setExportMessage({ type: 'error', text: error.message || 'Error al exportar' });
        }
        setExporting(false);
    };

    if (loading) {
        return (
            <div className="page-container">
                <div className="flex-center" style={{ minHeight: '400px' }}>
                    <div className="spinner"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Mi Perfil</h1>
                <p className="page-subtitle">Gestiona tu cuenta y exporta tus datos</p>
            </div>

            <div className="grid grid-2 gap-lg">
                {/* Profile Info Card */}
                <div className="card">
                    <div className="card-header">
                        <h3>Información personal</h3>
                    </div>
                    <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {/* Avatar */}
                        <div style={{ textAlign: 'center' }}>
                            <div style={{
                                width: '80px',
                                height: '80px',
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, var(--primary), var(--primary-dark, #2563eb))',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: '0 auto',
                                fontSize: '2rem',
                                color: 'white',
                                fontWeight: 600
                            }}>
                                {(profile.name || profile.email || '?')[0].toUpperCase()}
                            </div>
                        </div>

                        {/* Name */}
                        <div className="form-group">
                            <label className="form-label">Nombre</label>
                            <input
                                type="text"
                                className="form-input"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Tu nombre"
                                maxLength={50}
                            />
                        </div>

                        {/* Email (read-only) */}
                        <div className="form-group">
                            <label className="form-label">Email</label>
                            <input
                                type="email"
                                className="form-input"
                                value={profile.email || ''}
                                disabled
                                style={{
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-secondary)',
                                    cursor: 'not-allowed'
                                }}
                            />
                        </div>

                        {/* Password */}
                        <div className="form-group">
                            <label className="form-label">Contraseña</label>
                            <input
                                type="password"
                                className="form-input"
                                value={profile.authMethod === 'google' ? '' : '••••••••'}
                                disabled
                                placeholder={profile.authMethod === 'google' ? 'Gestionada por Google' : ''}
                                style={{
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-secondary)',
                                    cursor: 'not-allowed'
                                }}
                            />
                            {profile.authMethod === 'google' && (
                                <small style={{ color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                                    🔒 Gestionada por Google
                                </small>
                            )}
                        </div>

                        {message.text && (
                            <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-danger'}`}>
                                {message.text}
                            </div>
                        )}

                        <button
                            className="btn btn-primary"
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {saving ? 'Guardando...' : 'Guardar cambios'}
                        </button>
                    </div>
                </div>

                {/* Export Card */}
                <div className="card">
                    <div className="card-header">
                        <h3>📦 Exportar datos</h3>
                    </div>
                    <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <p className="text-muted">
                            Descarga todos tus datos financieros en formato ZIP (múltiples CSV) o JSON.
                        </p>

                        {/* Format selector */}
                        <div className="form-group">
                            <label className="form-label">Formato</label>
                            <div className="radio-group">
                                <label className="radio-label">
                                    <input
                                        type="radio"
                                        name="format"
                                        value="zip"
                                        checked={exportFormat === 'zip'}
                                        onChange={(e) => setExportFormat(e.target.value)}
                                    />
                                    <span>📁 ZIP (CSVs)</span>
                                </label>
                                <label className="radio-label">
                                    <input
                                        type="radio"
                                        name="format"
                                        value="json"
                                        checked={exportFormat === 'json'}
                                        onChange={(e) => setExportFormat(e.target.value)}
                                    />
                                    <span>📄 JSON</span>
                                </label>
                            </div>
                        </div>

                        {/* Scope selector */}
                        <div className="form-group">
                            <label className="form-label">Alcance</label>
                            <div className="radio-group">
                                <label className="radio-label">
                                    <input
                                        type="radio"
                                        name="scope"
                                        value="all"
                                        checked={exportScope === 'all'}
                                        onChange={(e) => setExportScope(e.target.value)}
                                    />
                                    <span>📊 Todo</span>
                                </label>
                                <label className="radio-label">
                                    <input
                                        type="radio"
                                        name="scope"
                                        value="month"
                                        checked={exportScope === 'month'}
                                        onChange={(e) => setExportScope(e.target.value)}
                                    />
                                    <span>📅 Mes actual</span>
                                </label>
                            </div>
                        </div>

                        {exportMessage.text && (
                            <div className={`alert ${exportMessage.type === 'success' ? 'alert-success' : 'alert-danger'}`}>
                                {exportMessage.text}
                            </div>
                        )}

                        <button
                            className="btn btn-primary"
                            onClick={handleExport}
                            disabled={exporting}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                        >
                            {exporting ? (
                                <>
                                    <span className="spinner-small"></span>
                                    Exportando...
                                </>
                            ) : (
                                <>
                                    📥 Exportar datos
                                </>
                            )}
                        </button>

                        <small className="text-muted">
                            Incluye: ingresos, gastos, presupuestos, inversiones, efectivo, categorías y productos.
                        </small>
                    </div>
                </div>
            </div>
        </div>
    );
}
