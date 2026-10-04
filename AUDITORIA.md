# Auditoría funcional de NextFinance

Fecha: 4 de octubre de 2026.

## Alcance

Se revisaron autenticación, control de acceso, rutas de datos, movimientos, presupuestos, categorías, productos, inversiones, efectivo, patrimonio, resumen, incorporación inicial, importación, exportación, interfaz móvil, configuración y proceso de compilación.

## Hallazgos corregidos

| Prioridad | Problema | Corrección |
| --- | --- | --- |
| Crítica | La edición de gastos e ingresos modificaba el registro antes de comprobar su propietario. | Las actualizaciones y eliminaciones filtran por identificador y usuario dentro de la operación de base de datos. |
| Alta | Varias pantallas calculaban totales históricos usando solo los primeros 50 movimientos. | La paginación se aplica únicamente cuando se solicita; el registro conserva páginas de 50. |
| Alta | La exportación consultaba columnas inexistentes y fallaba. | Las columnas ahora coinciden con el esquema; se completan las notas y subcategorías. |
| Alta | Los presupuestos se eliminaban antes de crear los nuevos, con riesgo de perderlos si fallaba el guardado. | Validación previa y sustitución dentro de una transacción. |
| Alta | Renombrar categorías podía dejar movimientos o presupuestos con nombres incoherentes. | Cambio transaccional y comprobación de existencia y duplicados. |
| Alta | El importador no leía CSV separados por punto y coma, campos entrecomillados ni importes españoles. | Análisis CSV y validación de fechas e importes; las filas fallidas siguen visibles. |
| Alta | Valores actuales de cuentas podían contarse varias veces o elegirse del movimiento incorrecto en la misma fecha. | Se selecciona el último registro por cuenta, fecha e identificador; se usa el saldo vigente al calcular periodos anteriores. |
| Media | Las fechas de entrada y los filtros mensuales dependían de la zona horaria. | Fechas locales en formularios y límites UTC para fechas de la base de datos. |
| Media | La pantalla de categorías calculaba el porcentaje de gastos siempre como cero. | Se suma correctamente el gasto por categoría. |
| Media | El selector de mes/año del inicio no cambiaba ningún dato. | Ahora filtra movimientos recientes, ingresos, gastos, ahorro y aportaciones del periodo. |
| Media | Guardar el asistente inicial podía fallar y aun así avanzar. | Se comprueba la respuesta y se muestra un error antes de avanzar. |
| Media | Se podían guardar importes, fechas e identificadores inválidos. | Validación del lado del servidor y respuestas 400 para entradas incorrectas. |
| Media | El acceso con Google aparecía sin configurar el proveedor; la asociación de cuentas no verificaba suficientemente identidad y sesión. | Proveedor opcional, correo verificado, comprobación de identificador de Google y actualización del nombre desde la base de datos. |
| Media | El panel y el resumen podían mostrar ceros o datos parciales si fallaba una consulta. | Estado de error visible y opción de reintento. |
| Baja | La compilación dependía de descargar fuentes externas, había avisos de Next.js y fallaba el análisis estático. | Fuentes locales de reserva, convención `proxy`, metadatos corregidos y análisis estático limpio. |
| Baja | Controles pequeños o sin acción y formularios con errores silenciosos. | Objetivos táctiles más grandes, mensajes de error y eliminación del botón de notificaciones sin función. |

Además, se añadieron cabeceras para impedir almacenamiento de respuestas API sensibles, nombres coherentes en las exportaciones, selección de mes/año para exportar, actualización de sesión tras cambiar el nombre y documentación de puesta en marcha.

## Verificación

- `npm run lint`: correcto.
- `npm test`: 8 pruebas correctas, incluidas fechas, importes, paginación, CSV y saldos por cuenta; también pasan en una zona horaria americana.
- `npm run build`: correcto.
- `npx prisma validate`: correcto.
- `git diff --check`: correcto.
- Acceso y registro revisados visualmente a 375 px, sin desplazamiento horizontal.
- Una consulta sin sesión a `/api/expenses` devolvió 401.

## Límites de la comprobación

La base de datos de `.env` no fue accesible desde este entorno (`P1001` de Prisma). No se pudieron ejecutar pruebas de integración con registros reales, verificar la correspondencia exacta entre tablas desplegadas y esquema Prisma ni abrir pantallas privadas con una sesión válida. La aplicación comparte tablas preexistentes y este repositorio no incluye migraciones.

La importación envía movimientos uno a uno. Si se pierde la conexión justo después de guardar una fila, el navegador no puede confirmar si se creó; esa fila queda marcada para revisión manual antes de repetirla. Para eliminar esa incertidumbre haría falta persistir identificadores de importación en la base de datos.
