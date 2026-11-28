'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import SpaceSwitcher from '@/components/SpaceSwitcher';
import useIsMobile from '@/components/useIsMobile';

const menuItems = [
    { label: 'Inicio', href: '/', icon: '🏠' },
    { label: 'Registro', href: '/registro', icon: '➕' },
    { label: 'Resumen', href: '/resumen', icon: '📊' },
    { section: 'Inversiones' },
    { label: 'Registro inversiones', href: '/inversiones/registro', icon: '📈' },
    { label: 'Resumen inversiones', href: '/inversiones/resumen', icon: '📊' },
    { section: 'Patrimonio' },
    { label: 'Registro efectivo', href: '/efectivo', icon: '💶' },
    { label: 'Patrimonio', href: '/patrimonio', icon: '💼' },
    { section: 'Configuración' },
    { label: 'Presupuestos', href: '/presupuestos', icon: '💰' },
    { label: 'Categorías', href: '/categorias', icon: '🏷️' },
    { label: 'Reglas de clasificación', href: '/reglas', icon: '🧭' },
    { label: 'Productos inversión', href: '/productos', icon: '💼' },
    { label: 'Importar datos', href: '/importar', icon: '📥' },
];

// Get current page title from path
function getPageTitle(pathname) {
    const item = menuItems.find(i => i.href === pathname);
    if (item) return item.label;
    if (pathname.startsWith('/inversiones')) return 'Inversiones';
    if (pathname.startsWith('/perfil')) return 'Mi perfil';
    if (pathname.startsWith('/onboarding')) return 'Configuración';
    return 'NextFinance';
}

export default function Sidebar() {
    const pathname = usePathname();
    const [isOpen, setIsOpen] = useState(false);
    const isMobile = useIsMobile();

    // Close drawer on route change
    useEffect(() => {
        const timer = setTimeout(() => setIsOpen(false), 0);
        return () => clearTimeout(timer);
    }, [pathname]);

    // Close drawer on Escape key
    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape') setIsOpen(false);
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, []);

    // Sin desplazamiento de fondo mientras el menú está abierto en el móvil.
    useEffect(() => {
        document.body.style.overflow = isOpen ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

    const pageTitle = getPageTitle(pathname);

    return (
        <>
            {/* Mobile Topbar */}
            <div className="mobile-topbar">
                <button
                    className="hamburger-btn"
                    onClick={() => setIsOpen(!isOpen)}
                    aria-label={isOpen ? 'Cerrar menú' : 'Abrir menú'}
                    aria-expanded={isOpen}
                    aria-controls="menu-principal"
                >
                    <span className="hamburger-icon" aria-hidden="true">{isOpen ? '✕' : '☰'}</span>
                </button>
                <div className="mobile-brand" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
                    {/* Logo removed for mobile as requested - keeps header clean */}
                    <span className="mobile-title">{pageTitle}</span>
                </div>
                <Link href="/perfil" className="mobile-profile-btn" aria-label="Mi perfil">
                    <span aria-hidden="true">👤</span>
                </Link>
            </div>

            {/* Overlay */}
            <div
                className={`sidebar-overlay ${isOpen ? 'active' : ''}`}
                onClick={() => setIsOpen(false)}
            />

            {/* Sidebar Drawer */}
            {/* En el móvil, cerrado, el menú queda fuera del alcance del tabulador y del lector de pantalla. */}
            <aside id="menu-principal" className={`sidebar ${isOpen ? 'open' : ''}`} inert={isMobile && !isOpen ? true : undefined}>
                {/* Header with logo and user avatar */}
                <div className="sidebar-header">
                    <Link href="/" className="sidebar-logo">
                        <Image
                            src="/NextFinance.png"
                            alt="NextFinance"
                            width={28}
                            height={28}
                            priority
                            style={{ borderRadius: '6px' }}
                        />
                        <span>NextFinance</span>
                    </Link>
                    <Link href="/perfil" className="sidebar-profile-btn" aria-label="Mi perfil">
                        <span aria-hidden="true">👤</span>
                    </Link>
                </div>

                <nav className="sidebar-nav" aria-label="Navegación personal">
                    {menuItems.map((item, index) => {
                        if (item.section) {
                            return (
                                <div key={index} className="sidebar-section">
                                    {item.section}
                                </div>
                            );
                        }

                        const isActive = pathname === item.href;

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`sidebar-link ${isActive ? 'active' : ''}`}
                                aria-current={isActive ? 'page' : undefined}
                            >
                                <span aria-hidden="true">{item.icon}</span>
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                <SpaceSwitcher current="personal" />

                <div className="sidebar-footer">
                    <button
                        onClick={() => signOut({ callbackUrl: '/login' })}
                        className="sidebar-link"
                    >
                        <span aria-hidden="true">🚪</span>
                        <span>Cerrar sesión</span>
                    </button>
                </div>
            </aside>
        </>
    );
}
