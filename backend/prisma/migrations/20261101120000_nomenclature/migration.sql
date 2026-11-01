-- AlterTable
ALTER TABLE "products" ADD COLUMN     "nomenclature_type_id" UUID;

-- CreateTable
CREATE TABLE "nomenclature_sections" (
    "id" UUID NOT NULL,
    "number" VARCHAR(32) NOT NULL,
    "name" VARCHAR(512) NOT NULL,
    "parent_id" UUID,

    CONSTRAINT "nomenclature_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nomenclature_types" (
    "id" UUID NOT NULL,
    "code" INTEGER NOT NULL,
    "name" VARCHAR(512) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "nomenclature_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nomenclature_type_sections" (
    "type_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,

    CONSTRAINT "nomenclature_type_sections_pkey" PRIMARY KEY ("type_id","section_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nomenclature_sections_number_key" ON "nomenclature_sections"("number");

-- CreateIndex
CREATE INDEX "nomenclature_sections_parent_id_idx" ON "nomenclature_sections"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "nomenclature_types_code_key" ON "nomenclature_types"("code");

-- CreateIndex
CREATE INDEX "nomenclature_type_sections_section_id_idx" ON "nomenclature_type_sections"("section_id");

-- CreateIndex
CREATE INDEX "products_nomenclature_type_id_idx" ON "products"("nomenclature_type_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_nomenclature_type_id_fkey" FOREIGN KEY ("nomenclature_type_id") REFERENCES "nomenclature_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nomenclature_sections" ADD CONSTRAINT "nomenclature_sections_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "nomenclature_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nomenclature_type_sections" ADD CONSTRAINT "nomenclature_type_sections_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "nomenclature_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nomenclature_type_sections" ADD CONSTRAINT "nomenclature_type_sections_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "nomenclature_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

