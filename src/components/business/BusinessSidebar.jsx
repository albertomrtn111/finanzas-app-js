'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';

const ITEMS = [
    ['resumen', 'Inicio', '🏠'],
    ['cuentas', 'Cuentas', '🏦'],
    ['movimientos', 'Movimientos', '↔️'],
    ['operaciones', 'Ingresos y gastos', '📒'],
    ['facturas', 'Facturas registradas', '🧾'],
    ['pendientes', 'Por cobrar y pagar', '📅'],
    ['flujo', 'Flujo y previsión', '📈'],
    ['presupuestos', 'Presupuestos', '🎯'],
    ['iva', 'IVA', '🧮'],
    ['configuracion', 'Configuración', '⚙️'],
];

export default function BusinessSidebar({ business }) {
    const pathname = usePathname();
    const { data: session } = useSession();
    const [open, setOpen] = useState(false);
    const base = `/empresa/${business.id}`;
    const current = ITEMS.find(([slug]) => pathname === `${base}/${slug}`);
    useEffect(() => {
        const timer = setTimeout(() => setOpen(false), 0);
        return () => clearTimeout(timer);
    }, [pathname]);
    useEffect(() => {
        document.body.style.overflow = open ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [open]);
    return <>
        <div className="mobile-topbar business-topbar">
            <button className="hamburger-btn" onClick={() => setOpen(!open)} aria-label="Abrir menú de empresa" aria-expanded={open}><span className="hamburger-icon">{open ? '✕' : '☰'}</span></button>
            <span className="mobile-title business-mobile-title">{current?.[1] || business.name}</span>
            <Link href={`${base}/perfil`} className="mobile-profile-btn" aria-label="Mi perfil">👤</Link>
        </div>
        <div className={`sidebar-overlay ${open ? 'active' : ''}`} onClick={() => setOpen(false)} />
        <aside className={`sidebar ${open ? 'open' : ''}`}>
            <div className="sidebar-header"><Link href={base + '/resumen'} className="sidebar-logo"><span>🏢</span><span className="business-name">{business.name}</span></Link><Link href={`${base}/perfil`} className="sidebar-profile-btn" aria-label="Mi perfil">👤</Link></div>
            <div className="business-space-label">Espacio de empresa</div>
            <nav className="sidebar-nav" aria-label="Navegación de empresa">
                {ITEMS.map(([slug, label, icon]) => <Link key={slug} href={`${base}/${slug}`} className={`sidebar-link ${pathname === `${base}/${slug}` ? 'active' : ''}`}><span aria-hidden="true">{icon}</span><span>{label}</span></Link>)}
            </nav>
            <div className="sidebar-footer">
                {session?.user?.accountMode === 'BOTH' && <Link href="/" className="sidebar-link"><span>👤</span><span>Cambiar a personal</span></Link>}
                <button onClick={() => signOut({ callbackUrl: '/login' })} className="sidebar-link"><span>🚪</span><span>Cerrar sesión</span></button>
            </div>
        </aside>
    </>;
}
