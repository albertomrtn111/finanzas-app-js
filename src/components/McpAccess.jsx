'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatDateTime } from '@/lib/dateFormat';
import { jsonRequest, requestJson } from '@/lib/utils';
import { Field, LoadState, VisuallyHidden, useFeedback } from '@/components/ui';

const formatDate = value => (value ? formatDateTime(value) : 'Nunca');

// Texto para copiar. «what» nombra lo que se copia («la dirección del servidor») para el botón y el aviso.
function CopyBlock({ label, what, text }) {
    const { toast } = useFeedback();
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            toast({ text: `Copiado: ${what}` });
        } catch {
            toast({ type: 'error', text: 'No se ha podido copiar. Selecciona el texto y cópialo a mano.' });
        }
    };
    return (
        <div className="mcp-copy">
            {label && <span className="form-label">{label}</span>}
            <div className="mcp-copy-row">
                <pre className="mcp-code">{text}</pre>
                <button type="button" className="btn btn-secondary mcp-copy-btn" onClick={copy} aria-label={`Copiar ${what}`}>Copiar</button>
            </div>
        </div>
    );
}

export default function McpAccess() {
    const { toast, confirm } = useFeedback();
    const [url, setUrl] = useState('');
    const [accesses, setAccesses] = useState([]);
    const [status, setStatus] = useState({ loading: true, error: '' });
    const [name, setName] = useState('Claude Code');
    const [creating, setCreating] = useState(false);
    const [created, setCreated] = useState(null);

    // silent: actualiza la lista sin sustituirla por la carga (después de crear o revocar).
    const load = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setStatus({ loading: true, error: '' });
        try {
            const data = await requestJson('/api/user/mcp-tokens', { cache: 'no-store' });
            setUrl(data.url);
            setAccesses(data.accesos);
            setStatus({ loading: false, error: '' });
        } catch (error) {
            if (silent) toast({ type: 'error', text: `No se ha podido actualizar la lista de accesos: ${error.message}` });
            else setStatus({ loading: false, error: error.message });
        }
    }, [toast]);

    useEffect(() => {
        const timer = setTimeout(() => { void load(); }, 0);
        return () => clearTimeout(timer);
    }, [load]);

    const handleCreate = async event => {
        event.preventDefault();
        setCreating(true);
        try {
            const data = await requestJson('/api/user/mcp-tokens', jsonRequest('POST', { name }));
            setCreated({ token: data.token, name: data.acceso.name });
            setUrl(data.url);
            toast({ text: `Acceso «${data.acceso.name}» creado. Copia el token ahora.` });
            await load({ silent: true });
        } catch (error) {
            toast({ type: 'error', text: error.message });
        } finally {
            setCreating(false);
        }
    };

    const handleRevoke = async access => {
        const ok = await confirm({
            title: 'Revocar acceso',
            text: `¿Revocar el acceso «${access.name}»? La IA que lo use dejará de poder entrar.`,
            confirmLabel: 'Revocar',
            danger: true,
        });
        if (!ok) return;
        try {
            await requestJson(`/api/user/mcp-tokens/${access.id}`, { method: 'DELETE' });
            if (created && access.token_prefix && created.token.startsWith(access.token_prefix)) setCreated(null);
            toast({ text: `Acceso «${access.name}» revocado` });
            await load({ silent: true });
        } catch (error) {
            toast({ type: 'error', text: error.message });
        }
    };

    const token = created?.token || '<tu-token>';
    const claudeCommand = `claude mcp add --transport http --scope user nextfinance ${url} --header "Authorization: Bearer ${token}"`;
    const jsonConfig = JSON.stringify({ mcpServers: { nextfinance: { type: 'http', url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2);
    const active = accesses.filter(a => !a.revoked_at);

    return (
        <section className="card business-spaced" aria-labelledby="mcp-titulo">
            <div className="card-header"><h2 id="mcp-titulo">Conectar tu IA (MCP)</h2></div>
            <div className="card-body mcp-body">
                <p className="text-muted">
                    Con un acceso, Claude u otra IA compatible con MCP puede consultar y registrar tus finanzas: resúmenes y desviaciones,
                    patrimonio, importar capturas o extractos del banco y deshacer cualquier cambio que haga.
                    Cada acceso entra <strong>solo en tus datos</strong> (lo personal y tus empresas); nunca ve los de otros usuarios.
                </p>

                <LoadState loading={status.loading} error={status.error} onRetry={() => load()} label="Cargando tus accesos…">
                    <CopyBlock label="Dirección del servidor MCP" what="la dirección del servidor MCP" text={url} />

                    <form onSubmit={handleCreate} className="mcp-create">
                        <Field label="Nombre del acceso" htmlFor="mcpTokenName" hint={active.length >= 10 ? 'Tienes 10 accesos activos, el máximo: revoca uno para crear otro.' : undefined}>
                            <input id="mcpTokenName" className="form-input" value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="Claude Code portátil" required aria-describedby={active.length >= 10 ? 'mcpTokenName-ayuda' : undefined} />
                        </Field>
                        <button type="submit" className="btn btn-primary" disabled={creating || active.length >= 10}>{creating ? 'Creando…' : 'Crear acceso'}</button>
                    </form>

                    {created && (
                        <div className="alert alert-warning mcp-new" role="status">
                            <strong>Copia el token de «{created.name}» ahora: no se vuelve a mostrar.</strong>
                            <span>Guárdalo como una contraseña. Si lo pierdes o alguien lo ve, revócalo y crea otro.</span>
                            <CopyBlock what="el token" text={created.token} />
                        </div>
                    )}

                    <div className="mcp-steps">
                        <h3>Cómo conectarlo</h3>
                        <ol>
                            <li>Crea un acceso arriba y copia su token.</li>
                            <li>
                                <strong>Claude Code</strong>: ejecuta en tu terminal{created ? ' (ya lleva tu token)' : ', cambiando <tu-token> por el tuyo'}:
                                <CopyBlock what="el comando de Claude Code" text={claudeCommand} />
                            </li>
                            <li>
                                <strong>Otros clientes</strong> que acepten servidores HTTP con cabeceras (Cursor, VS Code, un <code>.mcp.json</code>…):
                                <CopyBlock what="la configuración JSON" text={jsonConfig} />
                            </li>
                            <li>Pide a la IA «usa nextfinance y dime cómo voy este mes». Para importar, pásale una captura o un extracto y usa el prompt <code>importar_extracto</code>.</li>
                        </ol>
                        <p className="text-muted">Claude en la web y en el móvil necesita otro tipo de inicio de sesión (OAuth); llegará más adelante.</p>
                    </div>

                    <div>
                        <h3>Tus accesos</h3>
                        {!accesses.length && <p className="text-muted">Todavía no has creado ninguno.</p>}
                        {!!accesses.length && (
                            <div className="table-container">
                                <table className="table table-stack">
                                    <caption><VisuallyHidden>Accesos de IA a tus datos</VisuallyHidden></caption>
                                    <thead>
                                        <tr>
                                            <th scope="col">Nombre</th>
                                            <th scope="col">Token</th>
                                            <th scope="col">Creado</th>
                                            <th scope="col">Último uso</th>
                                            <th scope="col">Estado</th>
                                            <th scope="col"><VisuallyHidden>Acciones</VisuallyHidden></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {accesses.map(access => (
                                            <tr key={access.id}>
                                                <th scope="row" data-label="Nombre">{access.name}</th>
                                                <td data-label="Token"><code>{access.token_prefix}…</code></td>
                                                <td data-label="Creado">{formatDate(access.created_at)}</td>
                                                <td data-label="Último uso">{formatDate(access.last_used_at)}</td>
                                                <td data-label="Estado">{access.revoked_at ? <span className="badge badge-danger">Revocado</span> : <span className="badge badge-success">Activo</span>}</td>
                                                <td data-label="Acciones" className="table-actions">
                                                    {!access.revoked_at && <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => handleRevoke(access)} aria-label={`Revocar el acceso ${access.name}`}>Revocar</button>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </LoadState>
            </div>
        </section>
    );
}
