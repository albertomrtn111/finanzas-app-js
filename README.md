# NextFinance

Aplicación de finanzas personales con Next.js, NextAuth y Prisma. Permite registrar ingresos, gastos, presupuestos, saldos de efectivo e inversiones, consultar resúmenes e importar o exportar datos.

## Preparación

1. Instala las dependencias con `npm ci`.
2. Copia `env-example.txt` a `.env` y configura `DATABASE_URL`, `NEXTAUTH_URL` y `NEXTAUTH_SECRET`. La autenticación con Google es opcional; requiere `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`.
3. En una base que ya tenga las tablas personales, aplica `npx prisma migrate deploy` para añadir el módulo Empresa.
4. Genera el cliente de Prisma con `npx prisma generate`.
5. Inicia la aplicación con `npm run dev` y abre `http://localhost:3000`.

Las tablas personales existían antes de que este repositorio incorporase migraciones. La migración `20261005_business_module` añade `users.account_mode` y las tablas de Empresa a esa base existente; no crea las tablas personales en una base vacía. Haz una copia de seguridad antes de aplicarla. El cliente de Prisma y el servidor necesitan la migración aplicada para usar las nuevas rutas.

## Comprobaciones

```bash
npm run lint
npm test
npm run build
npx prisma validate
```

## Datos

- El registro de movimientos muestra páginas de 50 elementos. Los resúmenes y cálculos históricos consultan todos los movimientos del usuario.
- La importación admite CSV separados por coma o punto y coma, campos entrecomillados, fechas `AAAA-MM-DD` o `DD/MM/AAAA` e importes con punto o coma decimal. Valida las filas antes de enviarlas y conserva las filas fallidas para revisarlas. Límite por archivo: 5 MB.
- La exportación ofrece JSON o ZIP con CSV. Puede abarcar todos los datos o los movimientos de un mes elegido. Presupuestos, productos y categorías se exportan completos también en la opción mensual, porque no son registros fechados.
- Las rutas de API requieren una sesión de usuario salvo el registro y las rutas de autenticación. Los datos financieros se filtran por usuario.

## Empresa

- En el registro se puede elegir Personal, Empresa o Ambas. Cada empresa tiene cuentas, operaciones por devengo, movimientos de dinero, facturas externas registradas, previsiones e IVA separados de los datos personales.
- El líquido usa el saldo inicial más los movimientos reales hasta hoy. El resultado de gestión usa los ingresos y gastos incurridos del mes; los gastos incluyen el IVA que se haya marcado como no deducible. Los cobros y pagos se enlazan a operaciones sin volver a contarlos como nuevos ingresos o gastos.
- La previsión suma pendientes con vencimiento y planes futuros abiertos. Al registrar un plan como movimiento, márcalo como realizado para evitar duplicarlo en la previsión.
- El registro de IVA cubre el régimen general y operaciones interiores, exentas o no sujetas introducidas manualmente. Muestra un resumen orientativo y exporta el detalle en CSV; no presenta declaraciones ni emite facturas. Los regímenes especiales, operaciones intracomunitarias, inversión del sujeto pasivo y facturas rectificativas necesitan reglas adicionales antes de considerarse cubiertos.
- Los adjuntos PDF o imagen de hasta 5 MB se guardan en PostgreSQL y solo se descargan tras comprobar la titularidad de la empresa.
