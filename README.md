# NextFinance

Aplicación de finanzas personales con Next.js, NextAuth y Prisma. Permite registrar ingresos, gastos, presupuestos, saldos de efectivo e inversiones, consultar resúmenes e importar o exportar datos.

## Preparación

1. Instala las dependencias con `npm ci`.
2. Copia `env-example.txt` a `.env` y configura `DATABASE_URL`, `NEXTAUTH_URL` y `NEXTAUTH_SECRET`. La autenticación con Google es opcional; requiere `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`.
3. Genera el cliente de Prisma con `npx prisma generate`.
4. Inicia la aplicación con `npm run dev` y abre `http://localhost:3000`.

El esquema de Prisma describe tablas PostgreSQL existentes compartidas con la aplicación Streamlit original. Este repositorio no contiene migraciones ni crea la base de datos. Comprueba que el esquema de la base de datos coincide con `prisma/schema.prisma` antes de usarla.

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
