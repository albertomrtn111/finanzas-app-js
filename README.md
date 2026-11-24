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
npm test               # pruebas unitarias, sin base de datos
npm run build
npx prisma validate
```

### Pruebas de extremo a extremo

`npm run test:integration` lo hace todo con un solo comando:

1. Vacía la base de datos de `DATABASE_URL` y aplica las migraciones.
2. Crea dos usuarios con empresa y un acceso MCP cada uno.
3. Compila y arranca la app en un puerto libre.
4. Ejecuta, una detrás de otra, todas las pruebas `test/*.integration.test.mjs`. Cubren el MCP, el aislamiento entre usuarios en el MCP y en la web, el acceso y los adjuntos.

**Borra la base de datos entera.** Por eso solo acepta bases de datos locales, salvo que se indique `TEST_DATABASE_CONFIRM=borrar-todo`. Con Docker:

```bash
docker compose -f docker-compose.test.yml up -d
DATABASE_URL=postgresql://postgres:postgres@localhost:54329/nextfinance_test npm run test:integration
docker compose -f docker-compose.test.yml down
```

Sin Docker vale cualquier Postgres local de usar y tirar; por ejemplo, PGlite con `npx @electric-sql/pglite-socket` y `?connection_limit=1&pgbouncer=true` en la URL. Con `--sin-compilar` se reutiliza la última compilación.

## Datos

- El registro de movimientos muestra páginas de 50 elementos. Los resúmenes y cálculos históricos consultan todos los movimientos del usuario.
- La importación admite CSV separados por coma o punto y coma, campos entrecomillados, fechas `AAAA-MM-DD` o `DD/MM/AAAA` e importes con punto o coma decimal. Valida las filas antes de enviarlas y conserva las filas fallidas para revisarlas. Límite por archivo: 5 MB.
- La exportación ofrece JSON o ZIP con CSV. Puede abarcar todos los datos o los movimientos de un mes elegido. Presupuestos, productos y categorías se exportan completos también en la opción mensual, porque no son registros fechados.
- Las rutas de API requieren una sesión de usuario salvo el registro y las rutas de autenticación. Los datos financieros se filtran por usuario.

## Acceso

- **Límite de intentos:** el inicio de sesión se bloquea 15 minutos tras 5 fallos con el mismo email desde la misma IP, 20 fallos con el mismo email desde cualquier IP o 50 fallos desde una misma IP. El registro admite 5 altas por hora desde la misma IP. Los contadores viven en memoria y se reinician con cada despliegue. La IP se toma de `X-Real-Ip`, que pone Traefik.
- **Sin pistas sobre las cuentas:** el mensaje de error es el mismo exista o no el email, y la comprobación tarda lo mismo.
- **Sesiones:** cada lectura de la sesión se refresca desde la base de datos, así que el nombre, el tipo de cuenta y el onboarding nunca se quedan desfasados. `users.session_version` sube al cambiar la contraseña o al pulsar «Cerrar sesión en todos los dispositivos» (Mi Perfil › Seguridad), y entonces todas las sesiones anteriores dejan de valer. Los accesos de la IA (MCP) se revocan aparte.
- **Google:** si alguien entra con Google en una cuenta que tenía contraseña y aún no estaba vinculada, se borra esa contraseña y se cierran las demás sesiones, porque pudo ponerla cualquiera que registrase antes ese email. Desde Mi Perfil se puede crear una nueva.

## Despliegue

La app corre en un servidor propio con Docker y Traefik (`/srv/finanzas-app-js`, dominio `finanzas.ascenttech.cloud`). `Dockerfile` y `docker-compose.yml` están en el repositorio. El `.env` con los secretos solo existe en el servidor. Fusionar en `main` no publica nada: se despliega a mano con un solo comando.

```bash
ssh <servidor>
cd /srv/finanzas-app-js
scripts/deploy.sh --plan     # qué cambiaría, sin tocar nada
scripts/deploy.sh            # despliega origin/main
```

**Qué hace `scripts/deploy.sh`:**

1. Copia de la base de datos con `scripts/backup/backup-db.sh`.
2. Guarda la imagen en marcha etiquetada con su commit.
3. Avanza el código hasta `origin/main`, solo si es un avance rápido.
4. Construye la imagen `finanzas-app-js-web:<commit>`.
5. Aplica las migraciones pendientes.
6. Arranca la versión nueva y espera a que `/api/health` responda sana con esa versión.

**Vuelta atrás:**
- Si falla la construcción, las migraciones o la comprobación de salud, vuelve solo al código y a la imagen anteriores.
- Las migraciones no se deshacen solas: son solo hacia delante, y para eso está la copia previa.
- Para volver a mano a una versión anterior: `scripts/deploy.sh --volver <commit>`. Se conservan las 5 últimas imágenes.

**Comprobaciones:**
- `/api/health` dice si la app y la base de datos responden y qué versión está en marcha. No pide sesión y no da detalles internos.
- Docker la usa como comprobación de salud del contenedor, y sirve también para un monitor externo.
- Los errores del servidor quedan como una línea JSON cada uno en los registros: `docker logs finanzas_next 2>&1 | grep '"nivel":"error"'`.
- Si falta `DATABASE_URL`, `NEXTAUTH_SECRET` o `NEXTAUTH_URL`, la app no arranca y el despliegue vuelve atrás.

**Comprobaciones automáticas (CI):** en cada PR, GitHub Actions ejecuta:
- lint, pruebas unitarias y compilación;
- `npm audit` de las dependencias de producción;
- `scripts/check-migrations.mjs`, que comprueba que las migraciones coinciden con `schema.prisma`;
- `npm run test:integration` sobre un Postgres limpio.

## Copias de seguridad

La base de datos de producción se copia cada día con `scripts/backup/backup-db.sh`.

- **Qué hace:**
  - Lanza un `pg_dump` del contenedor `finanzas_postgres`.
  - Comprueba que la copia se puede leer y que tiene todas las tablas.
  - Guarda cuántas filas tenía cada tabla (`.filas`) y su suma de comprobación (`.sha256`).
  - Rota las copias: conserva 7 diarias, 4 semanales (de los domingos) y 12 mensuales (de los días 1).
- **Dónde:** `/srv/finanzas-app-js-backups/automaticas`, solo legible por el usuario `alberto`. El resultado de la última copia queda en `ultima-copia.txt`; si falla, en `ultima-copia-ERROR.txt`.
- **Fuera del servidor:** si `/srv/finanzas-app-js-backups/backup.env` define `BACKUP_REMOTE` (un destino de rclone) y `BACKUP_PASSPHRASE_FILE`, sube además una copia cifrada con gpg. Ese fichero no va al repositorio.
- **Prueba de restauración:** `scripts/backup/restore-test.sh` restaura la última copia en un Postgres temporal sin red y comprueba que cada tabla tiene las mismas filas que al copiarla. No toca la base de datos real. Detecta copias cortadas, alteradas o incompletas. El resultado queda en `ultima-restauracion.txt`.

Tareas programadas en el servidor (`crontab -e` del usuario `alberto`):

```cron
15 3 * * * /srv/finanzas-app-js/scripts/backup/backup-db.sh 2>&1 | logger -t finanzas-backup
40 4 1 * * /srv/finanzas-app-js/scripts/backup/restore-test.sh 2>&1 | logger -t finanzas-backup
```

Los registros se consultan con `journalctl -t finanzas-backup`.

**Restaurar de verdad** (por ejemplo, tras perder el servidor):

1. Para la app con `docker compose stop web`.
2. Haz una copia del estado actual, aunque esté dañado.
3. Recupera la copia elegida:
   ```bash
   docker exec -i finanzas_postgres pg_restore -U appuser -d finanzas --clean --if-exists --no-owner < copia.dump
   ```
4. Arranca la app y comprueba que todo está en su sitio.

## Empresa

- En el registro se puede elegir Personal, Empresa o Ambas. Cada empresa tiene cuentas, operaciones por devengo, movimientos de dinero, facturas externas registradas, previsiones e IVA separados de los datos personales.
- El líquido usa el saldo inicial más los movimientos reales hasta hoy. El resultado de gestión usa los ingresos y gastos incurridos del mes; los gastos incluyen el IVA que se haya marcado como no deducible. Los cobros y pagos se enlazan a operaciones sin volver a contarlos como nuevos ingresos o gastos.
- La previsión suma pendientes con vencimiento y planes futuros abiertos. Al registrar un plan como movimiento, márcalo como realizado para evitar duplicarlo en la previsión.
- El registro de IVA cubre el régimen general y operaciones interiores, exentas o no sujetas introducidas manualmente. Muestra un resumen orientativo y exporta el detalle en CSV; no presenta declaraciones ni emite facturas. Los regímenes especiales, operaciones intracomunitarias, inversión del sujeto pasivo y facturas rectificativas necesitan reglas adicionales antes de considerarse cubiertos.
- Los adjuntos PDF o imagen de hasta 5 MB se guardan en PostgreSQL y solo se descargan tras comprobar la titularidad de la empresa. Los envíos de más de 5 MB se rechazan antes de leerlos. Cada usuario tiene 200 MB para documentos, sumando todas sus empresas (`ATTACHMENT_QUOTA_MB` lo cambia). Los nombres conservan tildes y símbolos, y se descargan con cualquier nombre. Borrar una operación con documentos exige confirmarlo (`?adjuntos=borrar`), porque los documentos se borran con ella.

## MCP para la IA

`/api/mcp` es un servidor MCP (HTTP, sin sesión) que da a Claude u otra IA lectura y escritura sobre los datos personales y de cada empresa del usuario dueño del token.

- **Herramientas:** contexto y espacios; búsqueda, resumen (desviación frente al presupuesto, tasa de ahorro, comparación con el periodo anterior) y patrimonio personal; crear, editar y borrar gastos, ingresos, saldos, inversiones, categorías, presupuestos y productos; resumen, operaciones, movimientos, cuentas, previsiones y presupuestos de empresa; historial de cambios y deshacer.
- **Importar capturas y extractos:** la IA lee la imagen o el fichero y llama a `preparar_importacion`, que no guarda nada y devuelve por fila los posibles duplicados (`seguro` o `posible`), las filas repetidas dentro del lote, la clasificación sugerida según el historial y las facturas pendientes que podría saldar. Tras la confirmación del usuario, `importar_movimientos` lo guarda todo de una vez (o nada, si alguna fila es inválida), omite lo ya registrado y deja la importación en `import_batches`. `ver_importaciones` las lista, y `deshacer_cambio` con su lote la deshace entera. El prompt `importar_extracto` guía el proceso.
- **Registro de cambios:** cada escritura queda en `change_log` con el estado anterior y posterior. `deshacer_cambio` revierte por id o por lote, y se detiene si el registro cambió después, salvo que se indique `forzar`. Los adjuntos de una operación borrada no se recuperan.
- **Acceso:** cada petición lleva `Authorization: Bearer <token>`. En `mcp_tokens` solo se guarda el hash del token. Publícalo siempre detrás de HTTPS.
- **Desde la app:** en Mi Perfil › «Conectar tu IA (MCP)» cada usuario ve la dirección del MCP, crea sus accesos (el token se muestra una sola vez), copia el comando para Claude Code o la configuración JSON y revoca los que ya no use. Máximo 10 accesos activos por usuario.
- **Aislamiento:** cada acceso solo lee y escribe los datos de su usuario (lo personal y sus empresas). `test/mcp.isolation.integration.test.mjs` lo comprueba con dos usuarios.

### Puesta en marcha en el servidor

1. Copia de seguridad y `npx prisma migrate deploy` (aplica `20261122_mcp_fase_1`, con las tablas `mcp_tokens` y `change_log`, y `20261122_mcp_fase_2`, con `import_batches`).
2. Crea un acceso: `node scripts/mcp-token.mjs crear <email> "Claude"`. El token se muestra una sola vez. Para ver o revocar accesos: `listar <email>` y `revocar <id>`.
3. Conecta Claude Code: `claude mcp add --transport http nextfinance https://<tu-dominio>/api/mcp --header "Authorization: Bearer <token>"`.

Claude en la web, el escritorio y el móvil necesita que el conector inicie sesión con OAuth; queda para la tarea NF-6.

### Prueba de extremo a extremo

`test/mcp.integration.test.mjs` recorre todas las herramientas contra la app en marcha, y `test/mcp.isolation.integration.test.mjs` comprueba con dos usuarios que ninguno ve ni toca lo del otro. Las dos se ejecutan con `npm run test:integration` (ver «Comprobaciones»).
