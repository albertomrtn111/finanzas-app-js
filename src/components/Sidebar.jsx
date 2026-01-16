'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';

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
    { label: 'Productos inversión', href: '/productos', icon: '💼' },
    { label: 'Importar datos', href: '/importar', icon: '📥' },
];

// Get current page title from path
function getPageTitle(pathname) {
    const item = menuItems.find(i => i.href === pathname);
    if (item) return item.label;
    if (pathname.startsWith('/inversiones')) return 'Inversiones';
    if (pathname.startsWith('/perfil')) return 'Mi Perfil';
    if (pathname.startsWith('/onboarding')) return 'Configuración';
    return 'NextFinance';
}

export default function Sidebar() {
    const pathname = usePathname();
    const [isOpen, setIsOpen] = useState(false);

    // Close drawer on route change
    useEffect(() => {
        setIsOpen(false);
    }, [pathname]);

    // Close drawer on Escape key
    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape') setIsOpen(false);
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, []);

    // Prevent body scroll when drawer is open, dispatch layout change on close
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
            // Dispatch custom event for charts to re-render after sidebar closes
            setTimeout(() => {
                window.dispatchEvent(new Event('app:layoutchange'));
            }, 50);
        }
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
                    aria-label="Toggle menu"
                >
                    <span className="hamburger-icon">{isOpen ? '✕' : '☰'}</span>
                </button>
                <div className="mobile-brand" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
                    {/* Logo removed for mobile as requested - keeps header clean */}
                    <span className="mobile-title">{pageTitle}</span>
                </div>
                <Link href="/perfil" className="mobile-profile-btn">
                    👤
                </Link>
            </div>

            {/* Overlay */}
            <div
                className={`sidebar-overlay ${isOpen ? 'active' : ''}`}
                onClick={() => setIsOpen(false)}
            />

            {/* Sidebar Drawer */}
            <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
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
                    <Link href="/perfil" title="Mi perfil" className="sidebar-profile-btn">
                        👤
                    </Link>
                </div>

                <nav className="sidebar-nav">
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
                            >
                                <span>{item.icon}</span>
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                <div className="sidebar-footer">
                    <button
                        onClick={() => signOut({ callbackUrl: '/login' })}
                        className="sidebar-link"
                    >
                        <span>🚪</span>
                        <span>Cerrar sesión</span>
                    </button>
                </div>
            </aside>
        </>
    );
}
