-- Versión de sesión: al cambiar la contraseña o cerrar todas las sesiones sube y las anteriores dejan de valer.
ALTER TABLE "users" ADD COLUMN "session_version" INTEGER NOT NULL DEFAULT 0;
