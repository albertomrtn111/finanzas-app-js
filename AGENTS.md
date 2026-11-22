<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Notion: tareas y reuniones

Página del proyecto: [NextFinance](https://app.notion.com/p/420eecf751d18139967ce7de89428118) (espacio Ascentechlabs, teamspace HQ).

| Base | Fuente de datos |
| --- | --- |
| Tareas | `collection://420eecf7-51d1-8187-adba-000b7e0de74d` |
| Reuniones | No hay; el proyecto no tiene reuniones periódicas. |

Notion lo gestionan los agentes, sin pedir permiso cada vez. No se borra nada: para quitar algo, papelera.

**Propiedades de Tareas:** `Tarea` (título), `ID` (prefijo `NF`, se cita en PR y commits: «Tarea NF-2»), `Estado`, `Prioridad` (Alta, Media, Baja), `Tipo` (Bug, Mejora, Feature, Análisis, Gestión), `Módulo` (MCP, Personal, Empresa, Importación, Infraestructura, Notion), `Asignado`, `Esperando a` (Alberto), `PR`, `Desplegado`, `Fecha límite` y `Creada`.

**Vistas:** Pendientes, Tablero, Por módulo, ⛔ Bloqueadas, 🔍 En revisión y Completadas.

**Tareas abiertas:**

```sql
SELECT "userDefined:ID", "Tarea", "Estado", "Prioridad", "Módulo", "Esperando a", "PR"
FROM "collection://420eecf7-51d1-8187-adba-000b7e0de74d"
WHERE "Estado" <> 'Hecho'
```

### Ciclo de una tarea

Notion refleja el estado real en el momento en que cambia, con un comentario de una línea con fecha y motivo.

| Estado | Cuándo | Qué rellenar |
| --- | --- | --- |
| `Por hacer` | Recién creada | Cuerpo: **Qué pasa / Qué se espera / Hecho cuando** |
| `Stand-by` | Aparcada a propósito por Alberto | Comentario con el motivo |
| `En curso` | Al empezar a trabajar en ella | — |
| `En revisión` | PR abierto, falta fusionar o comprobar | `PR` |
| `Bloqueado` | Depende de un tercero | `Esperando a` y, en el comentario, qué se pidió y a quién |
| `Hecho` | Desplegado **y comprobado** en producción | `Desplegado` y un comentario con lo que cambió |

- Si un trabajo con código o cambio visible no tiene tarea, se crea aunque se cierre el mismo día. Antes, se buscan duplicados entre las abiertas.
- Si Alberto dice que algo ya está resuelto o pedido, se actualiza en ese momento.
- Cada sesión en paralelo actualiza solo sus tareas.

### Subida a producción

Los cambios van en una rama, con PR en español que cita la tarea por su ID. Antes de fusionar en `main` se pide el visto bueno de Alberto. Al abrir el PR, la tarea pasa a `En revisión`; al desplegar y comprobar en producción, a `Hecho` con la fecha en `Desplegado`.
