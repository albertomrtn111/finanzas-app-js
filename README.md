# NextFinance

Aplicación de finanzas personales con Next.js, NextAuth y Prisma. Permite registrar ingresos, gastos, presupuestos, saldos de efectivo e inversiones, consultar resúmenes e importar o exportar datos.

## Preparación

1. Instala las dependencias con `npm ci`.
2. Copia `env-example.txt` a `.env` y configura `DATABASE_URL`, `NEXTAUTH_URL` y `NEXTAUTH_SECRET`. La autenticación con Google es opcional; requiere `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`.
3. Si la base ya tiene las tablas personales y todavía no existe `_prisma_migrations`, registra la migración inicial con `npx prisma migrate resolve --applied 20261004_personal_baseline`. Después aplica `npx prisma migrate deploy`. En una base vacía basta con `npx prisma migrate deploy`.
4. Genera el cliente de Prisma con `npx prisma generate`.
5. Inicia la aplicación con `npm run dev` y abre `http://localhost:3000`.

Las tablas personales existían antes de que este repositorio incorporase migraciones. `20261004_personal_baseline` reproduce su esquema para instalaciones nuevas y debe marcarse como aplicada, sin ejecutarla, en bases existentes. `20261005_business_module` añade `users.account_mode` y las tablas de Empresa. Haz una copia de seguridad antes de aplicarla. El cliente de Prisma y el servidor necesitan la migración aplicada para usar las nuevas rutas.

## Vercel

El repositorio sigue conectado a un proyecto de Vercel que nunca ha llegado a desplegar: la app se publica en el servidor propio. `vercel.json` desactiva los despliegues automáticos (`git.deploymentEnabled: false`) para que Vercel no cree despliegues fallidos ni marque en rojo cada PR. Para quitar la conexión del todo, se desconecta el repositorio en el panel de Vercel.

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

## MCP para la IA

`/api/mcp` es un servidor MCP (HTTP, sin sesión) que da a Claude u otra IA lectura y escritura sobre los datos personales y de cada empresa del usuario dueño del token.

- **Herramientas:** contexto y espacios; búsqueda, resumen (desviación frente al presupuesto, tasa de ahorro, comparación con el periodo anterior) y patrimonio personal; crear, editar y borrar gastos, ingresos, saldos, inversiones, categorías, presupuestos y productos; resumen, operaciones, movimientos, cuentas, previsiones y presupuestos de empresa; historial de cambios y deshacer.
- **Importar capturas y extractos:** la IA lee la imagen o el fichero y llama a `preparar_importacion`, que no guarda nada y devuelve por fila los posibles duplicados (`seguro` o `posible`), las filas repetidas dentro del lote, la clasificación sugerida según el historial y las facturas pendientes que podría saldar. Tras la confirmación del usuario, `importar_movimientos` lo guarda todo de una vez (o nada, si alguna fila es inválida), omite lo ya registrado y deja la importación en `import_batches`. `ver_importaciones` las lista, y `deshacer_cambio` con su lote la deshace entera. El prompt `importar_extracto` guía el proceso.
- **Registro de cambios:** cada escritura queda en `change_log` con el estado anterior y posterior. `deshacer_cambio` revierte por id o por lote, y se detiene si el registro cambió después, salvo que se indique `forzar`. Los adjuntos de una operación borrada no se recuperan.
- **Acceso:** cada petición lleva `Authorization: Bearer <token>`. En `mcp_tokens` solo se guarda el hash del token. Publícalo siempre detrás de HTTPS.
- **Desde la app:** en Mi Perfil › «Conectar tu IA (MCP)» cada usuario ve la dirección del MCP, crea sus accesos (el token se muestra una sola vez), copia el comando para Claude Code o la configuración JSON y revoca los que ya no use. Máximo 10 accesos activos por usuario.
- **Aislamiento:** cada acceso solo lee y escribe los datos de su usuario (lo personal y sus empresas). `test/mcp.isolation.test.mjs` lo comprueba con dos usuarios.

### Puesta en marcha en el servidor

1. Copia de seguridad y `npx prisma migrate deploy` (aplica `20261122_mcp_fase_1`, con las tablas `mcp_tokens` y `change_log`, y `20261122_mcp_fase_2`, con `import_batches`).
2. Crea un acceso: `node scripts/mcp-token.mjs crear <email> "Claude"`. El token se muestra una sola vez. Para ver o revocar accesos: `listar <email>` y `revocar <id>`.
3. Conecta Claude Code: `claude mcp add --transport http nextfinance https://<tu-dominio>/api/mcp --header "Authorization: Bearer <token>"`.

Claude en la web, el escritorio y el móvil necesita que el conector inicie sesión con OAuth; queda para la tarea NF-6.

### Prueba de extremo a extremo

`test/mcp.integration.test.mjs` recorre las herramientas contra una app en marcha. Crea y borra registros, así que úsala solo con una base de datos de pruebas:

```bash
MCP_TEST_URL=http://localhost:3000/api/mcp MCP_TEST_TOKEN=<token de pruebas> MCP_TEST_FOREIGN_BUSINESS=<id de empresa de otro usuario> node --test test/mcp.integration.test.mjs
MCP_TEST_URL=http://localhost:3000/api/mcp MCP_TEST_TOKEN=<token de A> MCP_TEST_TOKEN_OTRO=<token de B> node --test test/mcp.isolation.test.mjs
```
