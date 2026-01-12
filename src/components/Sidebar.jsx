'use client';

import Link from 'next/link';
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

export default function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <span>💰</span>
                <span>Finanzas</span>
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

            <div style={{ marginTop: 'auto', paddingTop: '2rem' }}>
                <button
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    className="sidebar-link"
                    style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                    <span>🚪</span>
                    <span>Cerrar sesión</span>
                </button>
            </div>
        </aside>
    );
}
