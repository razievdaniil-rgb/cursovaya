-- AlterTable
ALTER TABLE "manufacturers" ADD COLUMN     "actual_address" VARCHAR(1024),
ALTER COLUMN "country_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "external_registry_id" INTEGER,
ADD COLUMN     "frnsi_id" VARCHAR(64),
ADD COLUMN     "legal_system" VARCHAR(16),
ADD COLUMN     "models_description" TEXT,
ALTER COLUMN "category_id" DROP NOT NULL,
ALTER COLUMN "risk_class_id" DROP NOT NULL,
ALTER COLUMN "origin_type_id" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "products_external_registry_id_key" ON "products"("external_registry_id");

