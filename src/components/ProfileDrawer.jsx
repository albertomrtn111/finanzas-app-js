'use client';

import { useState, useEffect } from 'react';

export default function ProfileDrawer({ isOpen, onClose }) {
    const [profile, setProfile] = useState({ name: '', email: '', authMethod: 'credentials' });
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    useEffect(() => {
        if (isOpen) {
            loadProfile();
        }
    }, [isOpen]);

    const loadProfile = async () => {
        setLoading(true);
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

        if (name.trim().length > 50) {
            setMessage({ type: 'error', text: 'El nombre es demasiado largo (máx. 50 caracteres)' });
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

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="drawer-backdrop"
                onClick={onClose}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0, 0, 0, 0.5)',
                    zIndex: 999,
                    opacity: isOpen ? 1 : 0,
                    transition: 'opacity 0.2s ease'
                }}
            />

            {/* Drawer */}
            <div
                className="profile-drawer"
                style={{
                    position: 'fixed',
                    top: 0,
                    right: 0,
                    width: '100%',
                    maxWidth: '400px',
                    height: '100vh',
                    background: 'var(--bg-primary)',
                    boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.15)',
                    zIndex: 1000,
                    display: 'flex',
                    flexDirection: 'column',
                    transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
                    transition: 'transform 0.3s ease'
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '1.5rem',
                    borderBottom: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Mi perfil</h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            fontSize: '1.5rem',
                            cursor: 'pointer',
                            color: 'var(--text-secondary)',
                            padding: '0.25rem'
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* Content */}
                <div style={{ padding: '1.5rem', flex: 1, overflowY: 'auto' }}>
                    {loading ? (
                        <div className="flex-center" style={{ padding: '2rem' }}>
                            <div className="spinner"></div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {/* Avatar */}
                            <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
                                <div style={{
                                    width: '80px',
                                    height: '80px',
                                    borderRadius: '50%',
                                    background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
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

                            {/* Name field */}
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

                            {/* Email field (read-only) */}
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

                            {/* Password field */}
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

                            {/* Message */}
                            {message.text && (
                                <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-danger'}`}>
                                    {message.text}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '1.5rem',
                    borderTop: '1px solid var(--border-color)',
                    display: 'flex',
                    gap: '1rem'
                }}>
                    <button
                        className="btn btn-secondary"
                        onClick={onClose}
                        style={{ flex: 1 }}
                    >
                        Cerrar
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={saving || loading}
                        style={{ flex: 1 }}
                    >
                        {saving ? 'Guardando...' : 'Guardar'}
                    </button>
                </div>
            </div>
        </>
    );
}
