'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import SpaceSwitcher from '@/components/SpaceSwitcher';
import useIsMobile from '@/components/useIsMobile';

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
    const [open, setOpen] = useState(false);
    const isMobile = useIsMobile();
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
            <button className="hamburger-btn" onClick={() => setOpen(!open)} aria-label={open ? 'Cerrar menú de empresa' : 'Abrir menú de empresa'} aria-expanded={open} aria-controls="menu-empresa"><span className="hamburger-icon" aria-hidden="true">{open ? '✕' : '☰'}</span></button>
            <span className="mobile-title business-mobile-title">{current?.[1] || business.name}</span>
            <Link href={`${base}/perfil`} className="mobile-profile-btn" aria-label="Mi perfil"><span aria-hidden="true">👤</span></Link>
        </div>
        <div className={`sidebar-overlay ${open ? 'active' : ''}`} onClick={() => setOpen(false)} />
        <aside id="menu-empresa" className={`sidebar ${open ? 'open' : ''}`} inert={isMobile && !open ? true : undefined}>
            <div className="sidebar-header"><Link href={base + '/resumen'} className="sidebar-logo"><span aria-hidden="true">🏢</span><span className="business-name">{business.name}</span></Link><Link href={`${base}/perfil`} className="sidebar-profile-btn" aria-label="Mi perfil"><span aria-hidden="true">👤</span></Link></div>
            <div className="business-space-label">Espacio de empresa</div>
            <nav className="sidebar-nav" aria-label="Navegación de empresa">
                {ITEMS.map(([slug, label, icon]) => <Link key={slug} href={`${base}/${slug}`} className={`sidebar-link ${pathname === `${base}/${slug}` ? 'active' : ''}`} aria-current={pathname === `${base}/${slug}` ? 'page' : undefined}><span aria-hidden="true">{icon}</span><span>{label}</span></Link>)}
            </nav>
            <SpaceSwitcher current={business.id} />
            <div className="sidebar-footer">
                <button onClick={() => signOut({ callbackUrl: '/login' })} className="sidebar-link"><span aria-hidden="true">🚪</span><span>Cerrar sesión</span></button>
            </div>
        </aside>
    </>;
}
