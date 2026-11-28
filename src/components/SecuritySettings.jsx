'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { jsonRequest, requestJson } from '@/lib/utils';
import { Field, useFeedback } from '@/components/ui';

// Contraseña y sesiones del usuario, en Mi Perfil.
export default function SecuritySettings({ hasPassword }) {
    const { toast, confirm } = useFeedback();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [repeatPassword, setRepeatPassword] = useState('');
    const [repeatError, setRepeatError] = useState('');
    const [saving, setSaving] = useState(false);
    const [closing, setClosing] = useState(false);

    const handlePassword = async event => {
        event.preventDefault();
        if (newPassword !== repeatPassword) {
            setRepeatError('Las dos contraseñas nuevas no coinciden');
            document.getElementById('repeatPassword')?.focus();
            return;
        }
        setSaving(true);
        try {
            const data = await requestJson('/api/user/password', jsonRequest('PATCH', { currentPassword, newPassword }));
            toast({ text: data.message || 'Contraseña guardada. Vuelve a entrar con la nueva.' });
            setCurrentPassword('');
            setNewPassword('');
            setRepeatPassword('');
            setTimeout(() => signOut({ callbackUrl: '/login' }), 2000);
        } catch (error) {
            toast({ type: 'error', text: error.message });
            setSaving(false);
        }
    };

    const handleCloseAll = async () => {
        const ok = await confirm({
            title: 'Cerrar todas las sesiones',
            text: '¿Cerrar la sesión en todos tus dispositivos, también en este? Tendrás que volver a entrar.',
            confirmLabel: 'Cerrar sesiones',
            danger: true,
        });
        if (!ok) return;
        setClosing(true);
        try {
            await requestJson('/api/user/sessions', { method: 'DELETE' });
            await signOut({ callbackUrl: '/login' });
        } catch (error) {
            setClosing(false);
            toast({ type: 'error', text: `No se han podido cerrar las sesiones: ${error.message}` });
        }
    };

    return (
        <section className="card business-spaced" aria-labelledby="seguridad-titulo">
            <div className="card-header"><h2 id="seguridad-titulo">Seguridad</h2></div>
            <div className="card-body mcp-body">
                <form onSubmit={handlePassword} className="security-form">
                    <h3>{hasPassword ? 'Cambiar contraseña' : 'Crear una contraseña'}</h3>
                    {!hasPassword && <p className="text-muted">Tu cuenta entra con Google. Si creas una contraseña, también podrás entrar con tu email.</p>}
                    {hasPassword && (
                        <Field label="Contraseña actual" htmlFor="currentPassword">
                            <input id="currentPassword" type="password" className="form-input" autoComplete="current-password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
                        </Field>
                    )}
                    <Field label="Nueva contraseña" htmlFor="newPassword" hint="Entre 8 y 72 caracteres.">
                        <input id="newPassword" type="password" className="form-input" autoComplete="new-password" minLength={8} maxLength={72} value={newPassword} onChange={e => setNewPassword(e.target.value)} aria-describedby="newPassword-ayuda" required />
                    </Field>
                    <Field label="Repite la nueva contraseña" htmlFor="repeatPassword" error={repeatError}>
                        <input
                            id="repeatPassword"
                            type="password"
                            className="form-input"
                            autoComplete="new-password"
                            minLength={8}
                            maxLength={72}
                            value={repeatPassword}
                            onChange={e => { setRepeatPassword(e.target.value); setRepeatError(''); }}
                            aria-invalid={Boolean(repeatError)}
                            aria-describedby={repeatError ? 'repeatPassword-error' : undefined}
                            required
                        />
                    </Field>
                    <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar contraseña'}</button>
                    <p className="text-muted">Al guardarla se cerrará la sesión en todos tus dispositivos y tendrás que entrar de nuevo.</p>
                </form>

                <div className="security-sessions">
                    <h3>Sesiones abiertas</h3>
                    <p className="text-muted">Si has entrado desde un dispositivo que ya no usas o crees que alguien más tiene acceso, cierra todas las sesiones. Los accesos de la IA se revocan aparte, en «Conectar tu IA».</p>
                    <button type="button" className="btn btn-secondary" onClick={handleCloseAll} disabled={closing}>{closing ? 'Cerrando…' : 'Cerrar sesión en todos los dispositivos'}</button>
                </div>
            </div>
        </section>
    );
}
