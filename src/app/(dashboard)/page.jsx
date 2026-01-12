import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export default async function HomePage() {
    const session = await getServerSession(authOptions);

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">App de finanzas personales</h1>
                <p className="page-subtitle">
                    Bienvenido{session?.user?.email ? `, ${session.user.email}` : ''}. Selecciona una opción:
                </p>
            </div>

            {/* Balance */}
            <div className="grid grid-3 mb-lg">
                <div className="card">
                    <div className="card-body">
                        <h3 style={{ marginBottom: '1rem' }}>💶 Balance</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <Link href="/registro" className="btn btn-secondary w-full">
                                ➕ Registrar gastos / ingresos
                            </Link>
                            <Link href="/resumen" className="btn btn-secondary w-full">
                                📊 Resumen de mis gastos
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Inversiones */}
                <div className="card">
                    <div className="card-body">
                        <h3 style={{ marginBottom: '1rem' }}>📈 Inversiones</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <Link href="/inversiones/registro" className="btn btn-secondary w-full">
                                📈 Registrar inversiones
                            </Link>
                            <Link href="/inversiones/resumen" className="btn btn-secondary w-full">
                                📊 Resumen de mis inversiones
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Patrimonio */}
                <div className="card">
                    <div className="card-body">
                        <h3 style={{ marginBottom: '1rem' }}>💼 Patrimonio</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <Link href="/efectivo" className="btn btn-secondary w-full">
                                💶 Registrar efectivo
                            </Link>
                            <Link href="/patrimonio" className="btn btn-secondary w-full">
                                💼 Ver patrimonio
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            {/* Configuración */}
            <h3 style={{ marginBottom: '0.5rem' }}>⚙️ Configuración</h3>
            <p className="text-muted text-sm mb-md">
                Ajusta presupuestos, categorías y configura datos base de la aplicación.
            </p>

            <div className="grid grid-4">
                <div className="card">
                    <div className="card-body text-center">
                        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>💰</div>
                        <h4 style={{ marginBottom: '0.75rem' }}>Presupuestos</h4>
                        <Link href="/presupuestos" className="btn btn-primary btn-sm w-full">
                            Abrir
                        </Link>
                    </div>
                </div>

                <div className="card">
                    <div className="card-body text-center">
                        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🏷️</div>
                        <h4 style={{ marginBottom: '0.75rem' }}>Categorías</h4>
                        <Link href="/categorias" className="btn btn-primary btn-sm w-full">
                            Abrir
                        </Link>
                    </div>
                </div>

                <div className="card">
                    <div className="card-body text-center">
                        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📥</div>
                        <h4 style={{ marginBottom: '0.75rem' }}>Importar datos</h4>
                        <Link href="/importar" className="btn btn-primary btn-sm w-full">
                            Abrir
                        </Link>
                    </div>
                </div>

                <div className="card">
                    <div className="card-body text-center">
                        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>💼</div>
                        <h4 style={{ marginBottom: '0.75rem' }}>Productos inversión</h4>
                        <Link href="/productos" className="btn btn-primary btn-sm w-full">
                            Abrir
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
