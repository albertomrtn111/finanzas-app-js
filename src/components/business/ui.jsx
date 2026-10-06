'use client';

import { useCallback, useEffect, useState } from 'react';

export const euro = value => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
export const shortDate = value => value ? new Date(value).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';
export const dateInput = value => value ? new Date(value).toISOString().slice(0, 10) : '';
export const todayKey = () => new Date().toLocaleDateString('en-CA');

export async function businessRequest(url, options) {
    const response = await fetch(url, options);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'No se pudo completar la operación');
    return result;
}

export function useBusinessData(businessId, resources) {
    const resourcesKey = resources.join(',');
    const [data, setData] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const entries = await Promise.all(resourcesKey.split(',').map(async name => [name, await businessRequest(`/api/businesses/${businessId}${name === 'business' ? '' : `/${name}`}`)]));
            setData(Object.fromEntries(entries));
        } catch (cause) {
            setError(cause.message);
        } finally { setLoading(false); }
    }, [businessId, resourcesKey]);
    useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);
    return { data, loading, error, refresh: load };
}

export function PageHeader({ title, subtitle, children }) {
    return <div className="page-header business-page-header"><div><h1 className="page-title">{title}</h1><p className="page-subtitle">{subtitle}</p></div>{children && <div className="business-header-actions">{children}</div>}</div>;
}

export function StatCard({ label, value, help, tone = '' }) {
    return <div className={`card business-stat ${tone}`}><div className="card-body"><span className="business-stat-label">{label}</span><strong className="business-stat-value">{value}</strong>{help && <span className="business-stat-help">{help}</span>}</div></div>;
}

export function LoadState({ loading, error, retry }) {
    if (loading) return <div className="card"><div className="card-body">Cargando datos de empresa…</div></div>;
    if (error) return <div className="alert alert-danger" role="alert">{error} <button className="btn btn-secondary" onClick={retry}>Reintentar</button></div>;
    return null;
}

export function EmptyState({ text }) {
    return <div className="business-empty">{text}</div>;
}
