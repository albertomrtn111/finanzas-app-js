-- Tarea NF-15: integridad de los datos de empresa.
-- Borrar una cuenta con movimientos o una operación con cobros o pagos vinculados ya no arrastra
-- en cascada esos registros: la base de datos lo impide (NO ACTION). NO ACTION se comprueba al final
-- de la sentencia, así que borrar una empresa o un usuario entero sigue borrando todo lo suyo.
-- Se mantienen en cascada los vínculos de un movimiento borrado y los adjuntos de una operación.

-- DropForeignKey
ALTER TABLE "business_allocations" DROP CONSTRAINT "business_allocations_activity_id_fkey";

-- DropForeignKey
ALTER TABLE "business_movements" DROP CONSTRAINT "business_movements_account_id_fkey";

-- CreateIndex
CREATE INDEX "business_allocations_movement_id_idx" ON "business_allocations"("movement_id");

-- CreateIndex
CREATE INDEX "business_attachments_activity_id_idx" ON "business_attachments"("activity_id");

-- AddForeignKey
ALTER TABLE "business_movements" ADD CONSTRAINT "business_movements_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "business_accounts"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_allocations" ADD CONSTRAINT "business_allocations_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "business_activities"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
