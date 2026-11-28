'use client';

import { useEffect, useState } from 'react';

const formatDate = value => (value ? new Date(value).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }) : 'Nunca');

function CopyBlock({ label, text }) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            setCopied(false);
        }
    };
    return (
        <div className="mcp-copy">
            {label && <span className="form-label">{label}</span>}
            <div className="mcp-copy-row">
                <pre className="mcp-code">{text}</pre>
                <button type="button" className="btn btn-secondary mcp-copy-btn" onClick={copy}>{copied ? 'Copiado' : 'Copiar'}</button>
            </div>
        </div>
    );
}

export default function McpAccess() {
    const [url, setUrl] = useState('');
    const [accesses, setAccesses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [name, setName] = useState('Claude Code');
    const [creating, setCreating] = useState(false);
    const [created, setCreated] = useState(null);
    const [message, setMessage] = useState({ type: '', text: '' });

    const fetchAccesses = async () => {
        const res = await fetch('/api/user/mcp-tokens', { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudieron cargar los accesos');
        return data;
    };

    const applyAccesses = data => {
        setUrl(data.url);
        setAccesses(data.accesos);
    };

    const load = async () => {
        try {
            applyAccesses(await fetchAccesses());
        } catch (error) {
            setMessage({ type: 'error', text: error.message });
        }
    };

    useEffect(() => {
        fetchAccesses()
            .then(applyAccesses)
            .catch(error => setMessage({ type: 'error', text: error.message }))
            .finally(() => setLoading(false));
    }, []);

    const handleCreate = async event => {
        event.preventDefault();
        setCreating(true);
        setMessage({ type: '', text: '' });
        try {
            const res = await fetch('/api/user/mcp-tokens', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo crear el acceso');
            setCreated({ token: data.token, name: data.acceso.name });
            setUrl(data.url);
            await load();
        } catch (error) {
            setMessage({ type: 'error', text: error.message });
        } finally {
            setCreating(false);
        }
    };

    const handleRevoke = async access => {
        if (!window.confirm(`¿Revocar el acceso «${access.name}»? La IA que lo use dejará de poder entrar.`)) return;
        setMessage({ type: '', text: '' });
        const res = await fetch(`/api/user/mcp-tokens/${access.id}`, { method: 'DELETE' });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            setMessage({ type: 'error', text: data.error || 'No se pudo revocar' });
            return;
        }
        if (created && access.token_prefix && created.token.startsWith(access.token_prefix)) setCreated(null);
        setMessage({ type: 'success', text: `Acceso «${access.name}» revocado` });
        await load();
    };

    const token = created?.token || '<tu-token>';
    const claudeCommand = `claude mcp add --transport http --scope user nextfinance ${url} --header "Authorization: Bearer ${token}"`;
    const jsonConfig = JSON.stringify({ mcpServers: { nextfinance: { type: 'http', url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2);
    const active = accesses.filter(a => !a.revoked_at);

    return (
        <div className="card business-spaced">
            <div className="card-header"><h3>Conectar tu IA (MCP)</h3></div>
            <div className="card-body mcp-body">
                <p className="text-muted">
                    Con un acceso, Claude u otra IA compatible con MCP puede consultar y registrar tus finanzas: resúmenes y desviaciones,
                    patrimonio, importar capturas o extractos del banco y deshacer cualquier cambio que haga.
                    Cada acceso entra <strong>solo en tus datos</strong> (lo personal y tus empresas); nunca ve los de otros usuarios.
                </p>

                {loading ? <div className="spinner"></div> : <>
                    <CopyBlock label="Dirección del servidor MCP" text={url} />

                    <form onSubmit={handleCreate} className="mcp-create">
                        <div className="form-group">
                            <label className="form-label" htmlFor="mcpTokenName">Nombre del acceso</label>
                            <input id="mcpTokenName" className="form-input" value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="Claude Code portátil" required />
                        </div>
                        <button className="btn btn-primary" disabled={creating || active.length >= 10}>{creating ? 'Creando...' : 'Crear acceso'}</button>
                    </form>

                    {created && <div className="alert alert-warning mcp-new">
                        <strong>Copia el token de «{created.name}» ahora: no se vuelve a mostrar.</strong>
                        <span>Guárdalo como una contraseña. Si lo pierdes o alguien lo ve, revócalo y crea otro.</span>
                        <CopyBlock text={created.token} />
                    </div>}

                    <div className="mcp-steps">
                        <h4>Cómo conectarlo</h4>
                        <ol>
                            <li>Crea un acceso arriba y copia su token.</li>
                            <li>
                                <strong>Claude Code</strong>: ejecuta en tu terminal{created ? ' (ya lleva tu token)' : ', cambiando <tu-token> por el tuyo'}:
                                <CopyBlock text={claudeCommand} />
                            </li>
                            <li>
                                <strong>Otros clientes</strong> que acepten servidores HTTP con cabeceras (Cursor, VS Code, un <code>.mcp.json</code>…):
                                <CopyBlock text={jsonConfig} />
                            </li>
                            <li>Pide a la IA «usa nextfinance y dime cómo voy este mes». Para importar, pásale una captura o un extracto y usa el prompt <code>importar_extracto</code>.</li>
                        </ol>
                        <p className="text-muted">Claude en la web y en el móvil necesita otro tipo de inicio de sesión (OAuth); llegará más adelante.</p>
                    </div>

                    {message.text && <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-danger'}`}>{message.text}</div>}

                    <div>
                        <h4>Tus accesos</h4>
                        {!accesses.length && <p className="text-muted">Todavía no has creado ninguno.</p>}
                        {!!accesses.length && <div className="table-container"><table className="table">
                            <thead><tr><th>Nombre</th><th>Token</th><th>Creado</th><th>Último uso</th><th>Estado</th><th></th></tr></thead>
                            <tbody>{accesses.map(access => <tr key={access.id}>
                                <td>{access.name}</td>
                                <td><code>{access.token_prefix}…</code></td>
                                <td>{formatDate(access.created_at)}</td>
                                <td>{formatDate(access.last_used_at)}</td>
                                <td>{access.revoked_at ? <span className="badge badge-danger">Revocado</span> : <span className="badge badge-success">Activo</span>}</td>
                                <td>{!access.revoked_at && <button type="button" className="btn btn-secondary" onClick={() => handleRevoke(access)}>Revocar</button>}</td>
                            </tr>)}</tbody>
                        </table></div>}
                    </div>
                </>}
            </div>
        </div>
    );
}
