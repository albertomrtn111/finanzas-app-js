'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';

// Contraseña y sesiones del usuario, en Mi Perfil.
export default function SecuritySettings({ hasPassword }) {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [repeatPassword, setRepeatPassword] = useState('');
    const [saving, setSaving] = useState(false);
    const [closing, setClosing] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    const handlePassword = async event => {
        event.preventDefault();
        setMessage({ type: '', text: '' });
        if (newPassword !== repeatPassword) {
            setMessage({ type: 'error', text: 'Las dos contraseñas nuevas no coinciden' });
            return;
        }
        setSaving(true);
        try {
            const res = await fetch('/api/user/password', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, newPassword }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'No se pudo guardar la contraseña');
            setMessage({ type: 'success', text: data.message });
            setCurrentPassword('');
            setNewPassword('');
            setRepeatPassword('');
            setTimeout(() => signOut({ callbackUrl: '/login' }), 2000);
        } catch (error) {
            setMessage({ type: 'error', text: error.message });
            setSaving(false);
        }
    };

    const handleCloseAll = async () => {
        if (!window.confirm('¿Cerrar la sesión en todos tus dispositivos, también en este? Tendrás que volver a entrar.')) return;
        setClosing(true);
        setMessage({ type: '', text: '' });
        const res = await fetch('/api/user/sessions', { method: 'DELETE' });
        if (!res.ok) {
            setClosing(false);
            setMessage({ type: 'error', text: 'No se pudieron cerrar las sesiones' });
            return;
        }
        await signOut({ callbackUrl: '/login' });
    };

    return (
        <div className="card business-spaced">
            <div className="card-header"><h3>Seguridad</h3></div>
            <div className="card-body mcp-body">
                <form onSubmit={handlePassword} className="security-form">
                    <h4>{hasPassword ? 'Cambiar contraseña' : 'Crear una contraseña'}</h4>
                    {!hasPassword && <p className="text-muted">Tu cuenta entra con Google. Si creas una contraseña, también podrás entrar con tu email.</p>}
                    {hasPassword && (
                        <div className="form-group">
                            <label className="form-label" htmlFor="currentPassword">Contraseña actual</label>
                            <input id="currentPassword" type="password" className="form-input" autoComplete="current-password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
                        </div>
                    )}
                    <div className="form-group">
                        <label className="form-label" htmlFor="newPassword">Nueva contraseña</label>
                        <input id="newPassword" type="password" className="form-input" autoComplete="new-password" minLength={8} maxLength={72} value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
                        <small className="text-muted">Entre 8 y 72 caracteres.</small>
                    </div>
                    <div className="form-group">
                        <label className="form-label" htmlFor="repeatPassword">Repite la nueva contraseña</label>
                        <input id="repeatPassword" type="password" className="form-input" autoComplete="new-password" minLength={8} maxLength={72} value={repeatPassword} onChange={e => setRepeatPassword(e.target.value)} required />
                    </div>
                    <button className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar contraseña'}</button>
                    <p className="text-muted">Al guardarla se cerrará la sesión en todos tus dispositivos y tendrás que entrar de nuevo.</p>
                </form>

                {message.text && <div role={message.type === 'error' ? 'alert' : 'status'} className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-danger'}`}>{message.text}</div>}

                <div className="security-sessions">
                    <h4>Sesiones abiertas</h4>
                    <p className="text-muted">Si has entrado desde un dispositivo que ya no usas o crees que alguien más tiene acceso, cierra todas las sesiones. Los accesos de la IA se revocan aparte, en «Conectar tu IA».</p>
                    <button type="button" className="btn btn-secondary" onClick={handleCloseAll} disabled={closing}>{closing ? 'Cerrando...' : 'Cerrar sesión en todos los dispositivos'}</button>
                </div>
            </div>
        </div>
    );
}
