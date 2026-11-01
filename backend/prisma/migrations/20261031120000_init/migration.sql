-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateTable
CREATE TABLE "account_statuses" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(128) NOT NULL,

    CONSTRAINT "account_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(128) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "account_status_id" UUID NOT NULL,
    "email_verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "replaced_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_agent" VARCHAR(512),
    "ip_hash" VARCHAR(64),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "countries" (
    "id" UUID NOT NULL,
    "iso2" CHAR(2) NOT NULL,
    "name" VARCHAR(128) NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regions" (
    "id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "name" VARCHAR(128) NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cities" (
    "id" UUID NOT NULL,
    "region_id" UUID NOT NULL,
    "name" VARCHAR(128) NOT NULL,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_types" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(128) NOT NULL,

    CONSTRAINT "organization_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_verification_statuses" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(128) NOT NULL,

    CONSTRAINT "organization_verification_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "organization_type_id" UUID NOT NULL,
    "verification_status_id" UUID NOT NULL,
    "name" VARCHAR(512) NOT NULL,
    "short_name" VARCHAR(255),
    "inn" VARCHAR(12),
    "ogrn" VARCHAR(15),
    "city_id" UUID,
    "address" VARCHAR(512),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_member_roles" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(128) NOT NULL,

    CONSTRAINT "organization_member_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "member_role_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMPTZ(6),

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("organization_id","user_id")
);

-- CreateTable
CREATE TABLE "manufacturers" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "name" VARCHAR(512) NOT NULL,
    "country_id" UUID NOT NULL,
    "city_id" UUID,
    "website" VARCHAR(512),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "manufacturers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_classes" (
    "id" UUID NOT NULL,
    "code" VARCHAR(8) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "risk_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_origin_types" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(128) NOT NULL,

    CONSTRAINT "product_origin_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registry_statuses" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(128) NOT NULL,

    CONSTRAINT "registry_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "manufacturer_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "risk_class_id" UUID NOT NULL,
    "origin_type_id" UUID NOT NULL,
    "current_registry_status_id" UUID NOT NULL,
    "name" VARCHAR(512) NOT NULL,
    "short_name" VARCHAR(255) NOT NULL,
    "registration_number" VARCHAR(64) NOT NULL,
    "registration_date" DATE,
    "registration_expires_at" DATE,
    "verified_at" TIMESTAMPTZ(6),
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_search_documents" (
    "product_id" UUID NOT NULL,
    "search_vector" tsvector,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_search_documents_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "storage_key" VARCHAR(512) NOT NULL,
    "alt_text" VARCHAR(512),
    "sort_order" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_types" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,

    CONSTRAINT "document_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_documents" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "document_type_id" UUID NOT NULL,
    "title" VARCHAR(512) NOT NULL,
    "storage_key" VARCHAR(512) NOT NULL,
    "document_number" VARCHAR(128),
    "issued_at" DATE,
    "valid_until" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registry_status_history" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "registry_status_id" UUID NOT NULL,
    "effective_at" TIMESTAMPTZ(6) NOT NULL,
    "source_run_id" UUID,
    "comment" VARCHAR(1024),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registry_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurement_units" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "symbol" VARCHAR(16),

    CONSTRAINT "measurement_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "characteristic_value_types" (
    "id" UUID NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "name" VARCHAR(128) NOT NULL,

    CONSTRAINT "characteristic_value_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "characteristic_definitions" (
    "id" UUID NOT NULL,
    "category_id" UUID,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "value_type_id" UUID NOT NULL,
    "unit_id" UUID,
    "is_comparable" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "characteristic_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_characteristic_values" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "characteristic_definition_id" UUID NOT NULL,
    "text_value" VARCHAR(1024),
    "numeric_value" DECIMAL(18,6),
    "boolean_value" BOOLEAN,
    "date_value" DATE,

    CONSTRAINT "product_characteristic_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currencies" (
    "id" UUID NOT NULL,
    "code" CHAR(3) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "symbol" VARCHAR(8) NOT NULL,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "license_number" VARCHAR(128),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_offers" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "currency_id" UUID NOT NULL,
    "region_id" UUID,
    "price" DECIMAL(14,2) NOT NULL,
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_until" TIMESTAMPTZ(6),
    "source_url" VARCHAR(1024),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analogue_types" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(128) NOT NULL,

    CONSTRAINT "analogue_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_analogues" (
    "product_id" UUID NOT NULL,
    "analogue_product_id" UUID NOT NULL,
    "analogue_type_id" UUID NOT NULL,
    "similarity_score" DECIMAL(5,4),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_analogues_pkey" PRIMARY KEY ("product_id","analogue_product_id")
);

-- CreateTable
CREATE TABLE "review_experience_periods" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "review_experience_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_statuses" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(128) NOT NULL,

    CONSTRAINT "review_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "author_organization_id" UUID,
    "experience_period_id" UUID NOT NULL,
    "review_status_id" UUID NOT NULL,
    "rating" SMALLINT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "published_at" TIMESTAMPTZ(6),

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_moderation_events" (
    "id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "moderator_user_id" UUID NOT NULL,
    "from_status_id" UUID NOT NULL,
    "to_status_id" UUID NOT NULL,
    "comment" VARCHAR(1024),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_moderation_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_lists" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "organization_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "saved_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_list_items" (
    "saved_list_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_list_items_pkey" PRIMARY KEY ("saved_list_id","product_id")
);

-- CreateTable
CREATE TABLE "comparisons" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "name" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "comparisons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comparison_items" (
    "comparison_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comparison_items_pkey" PRIMARY KEY ("comparison_id","product_id")
);

-- CreateTable
CREATE TABLE "notification_types" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,

    CONSTRAINT "notification_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_severities" (
    "id" UUID NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "name" VARCHAR(128) NOT NULL,

    CONSTRAINT "notification_severities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "notification_type_id" UUID NOT NULL,
    "severity_id" UUID NOT NULL,
    "product_id" UUID,
    "title" VARCHAR(512) NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_recipients" (
    "notification_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "delivered_at" TIMESTAMPTZ(6),
    "read_at" TIMESTAMPTZ(6),

    CONSTRAINT "notification_recipients_pkey" PRIMARY KEY ("notification_id","user_id")
);

-- CreateTable
CREATE TABLE "sync_sources" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "base_url" VARCHAR(512),
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "sync_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_run_statuses" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(128) NOT NULL,

    CONSTRAINT "sync_run_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" UUID NOT NULL,
    "sync_source_id" UUID NOT NULL,
    "status_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "records_read" INTEGER NOT NULL DEFAULT 0,
    "records_changed" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" VARCHAR(1024),
    "initiated_by_user_id" UUID,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_run_errors" (
    "id" UUID NOT NULL,
    "sync_run_id" UUID NOT NULL,
    "external_record_id" VARCHAR(128),
    "error_code" VARCHAR(64) NOT NULL,
    "message" VARCHAR(1024) NOT NULL,
    "payload_checksum" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_run_errors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_statuses_code_key" ON "account_statuses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_account_status_id_idx" ON "users"("account_status_id");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_replaced_by_id_key" ON "refresh_tokens"("replaced_by_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "countries_iso2_key" ON "countries"("iso2");

-- CreateIndex
CREATE UNIQUE INDEX "countries_name_key" ON "countries"("name");

-- CreateIndex
CREATE INDEX "regions_country_id_idx" ON "regions"("country_id");

-- CreateIndex
CREATE UNIQUE INDEX "regions_country_id_code_key" ON "regions"("country_id", "code");

-- CreateIndex
CREATE INDEX "cities_region_id_idx" ON "cities"("region_id");

-- CreateIndex
CREATE UNIQUE INDEX "cities_region_id_name_key" ON "cities"("region_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "organization_types_code_key" ON "organization_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "organization_verification_statuses_code_key" ON "organization_verification_statuses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_inn_key" ON "organizations"("inn");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_ogrn_key" ON "organizations"("ogrn");

-- CreateIndex
CREATE INDEX "organizations_organization_type_id_idx" ON "organizations"("organization_type_id");

-- CreateIndex
CREATE INDEX "organizations_verification_status_id_idx" ON "organizations"("verification_status_id");

-- CreateIndex
CREATE INDEX "organizations_city_id_idx" ON "organizations"("city_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_member_roles_code_key" ON "organization_member_roles"("code");

-- CreateIndex
CREATE INDEX "organization_members_user_id_idx" ON "organization_members"("user_id");

-- CreateIndex
CREATE INDEX "organization_members_member_role_id_idx" ON "organization_members"("member_role_id");

-- CreateIndex
CREATE INDEX "manufacturers_organization_id_idx" ON "manufacturers"("organization_id");

-- CreateIndex
CREATE INDEX "manufacturers_country_id_idx" ON "manufacturers"("country_id");

-- CreateIndex
CREATE INDEX "manufacturers_city_id_idx" ON "manufacturers"("city_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_slug_key" ON "product_categories"("slug");

-- CreateIndex
CREATE INDEX "product_categories_parent_id_idx" ON "product_categories"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "risk_classes_code_key" ON "risk_classes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "product_origin_types_code_key" ON "product_origin_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "registry_statuses_code_key" ON "registry_statuses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "products_registration_number_key" ON "products"("registration_number");

-- CreateIndex
CREATE INDEX "products_manufacturer_id_idx" ON "products"("manufacturer_id");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "products_risk_class_id_idx" ON "products"("risk_class_id");

-- CreateIndex
CREATE INDEX "products_origin_type_id_idx" ON "products"("origin_type_id");

-- CreateIndex
CREATE INDEX "products_current_registry_status_id_idx" ON "products"("current_registry_status_id");

-- CreateIndex
CREATE INDEX "products_registration_expires_at_idx" ON "products"("registration_expires_at");

-- CreateIndex
CREATE INDEX "product_images_product_id_idx" ON "product_images"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_images_product_id_sort_order_key" ON "product_images"("product_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "document_types_code_key" ON "document_types"("code");

-- CreateIndex
CREATE INDEX "product_documents_product_id_idx" ON "product_documents"("product_id");

-- CreateIndex
CREATE INDEX "product_documents_document_type_id_idx" ON "product_documents"("document_type_id");

-- CreateIndex
CREATE INDEX "registry_status_history_product_id_idx" ON "registry_status_history"("product_id");

-- CreateIndex
CREATE INDEX "registry_status_history_registry_status_id_idx" ON "registry_status_history"("registry_status_id");

-- CreateIndex
CREATE INDEX "registry_status_history_source_run_id_idx" ON "registry_status_history"("source_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "registry_status_history_product_id_effective_at_key" ON "registry_status_history"("product_id", "effective_at");

-- CreateIndex
CREATE UNIQUE INDEX "measurement_units_code_key" ON "measurement_units"("code");

-- CreateIndex
CREATE UNIQUE INDEX "characteristic_value_types_code_key" ON "characteristic_value_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "characteristic_definitions_code_key" ON "characteristic_definitions"("code");

-- CreateIndex
CREATE INDEX "characteristic_definitions_category_id_idx" ON "characteristic_definitions"("category_id");

-- CreateIndex
CREATE INDEX "characteristic_definitions_value_type_id_idx" ON "characteristic_definitions"("value_type_id");

-- CreateIndex
CREATE INDEX "characteristic_definitions_unit_id_idx" ON "characteristic_definitions"("unit_id");

-- CreateIndex
CREATE INDEX "product_characteristic_values_product_id_idx" ON "product_characteristic_values"("product_id");

-- CreateIndex
CREATE INDEX "product_characteristic_values_characteristic_definition_id_idx" ON "product_characteristic_values"("characteristic_definition_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_characteristic_values_product_id_characteristic_def_key" ON "product_characteristic_values"("product_id", "characteristic_definition_id");

-- CreateIndex
CREATE UNIQUE INDEX "currencies_code_key" ON "currencies"("code");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_organization_id_key" ON "suppliers"("organization_id");

-- CreateIndex
CREATE INDEX "supplier_offers_product_id_idx" ON "supplier_offers"("product_id");

-- CreateIndex
CREATE INDEX "supplier_offers_supplier_id_idx" ON "supplier_offers"("supplier_id");

-- CreateIndex
CREATE INDEX "supplier_offers_currency_id_idx" ON "supplier_offers"("currency_id");

-- CreateIndex
CREATE INDEX "supplier_offers_region_id_idx" ON "supplier_offers"("region_id");

-- CreateIndex
CREATE INDEX "supplier_offers_product_id_valid_from_valid_until_idx" ON "supplier_offers"("product_id", "valid_from", "valid_until");

-- CreateIndex
CREATE UNIQUE INDEX "analogue_types_code_key" ON "analogue_types"("code");

-- CreateIndex
CREATE INDEX "product_analogues_analogue_product_id_idx" ON "product_analogues"("analogue_product_id");

-- CreateIndex
CREATE INDEX "product_analogues_analogue_type_id_idx" ON "product_analogues"("analogue_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_experience_periods_code_key" ON "review_experience_periods"("code");

-- CreateIndex
CREATE UNIQUE INDEX "review_statuses_code_key" ON "review_statuses"("code");

-- CreateIndex
CREATE INDEX "reviews_product_id_idx" ON "reviews"("product_id");

-- CreateIndex
CREATE INDEX "reviews_author_user_id_idx" ON "reviews"("author_user_id");

-- CreateIndex
CREATE INDEX "reviews_author_organization_id_idx" ON "reviews"("author_organization_id");

-- CreateIndex
CREATE INDEX "reviews_review_status_id_idx" ON "reviews"("review_status_id");

-- CreateIndex
CREATE INDEX "reviews_experience_period_id_idx" ON "reviews"("experience_period_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_product_id_author_user_id_key" ON "reviews"("product_id", "author_user_id");

-- CreateIndex
CREATE INDEX "review_moderation_events_review_id_idx" ON "review_moderation_events"("review_id");

-- CreateIndex
CREATE INDEX "review_moderation_events_moderator_user_id_idx" ON "review_moderation_events"("moderator_user_id");

-- CreateIndex
CREATE INDEX "saved_lists_owner_user_id_idx" ON "saved_lists"("owner_user_id");

-- CreateIndex
CREATE INDEX "saved_lists_organization_id_idx" ON "saved_lists"("organization_id");

-- CreateIndex
CREATE INDEX "saved_list_items_product_id_idx" ON "saved_list_items"("product_id");

-- CreateIndex
CREATE INDEX "comparisons_owner_user_id_idx" ON "comparisons"("owner_user_id");

-- CreateIndex
CREATE INDEX "comparison_items_product_id_idx" ON "comparison_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "comparison_items_comparison_id_position_key" ON "comparison_items"("comparison_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "notification_types_code_key" ON "notification_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "notification_severities_code_key" ON "notification_severities"("code");

-- CreateIndex
CREATE INDEX "notifications_notification_type_id_idx" ON "notifications"("notification_type_id");

-- CreateIndex
CREATE INDEX "notifications_severity_id_idx" ON "notifications"("severity_id");

-- CreateIndex
CREATE INDEX "notifications_product_id_idx" ON "notifications"("product_id");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- CreateIndex
CREATE INDEX "notification_recipients_user_id_idx" ON "notification_recipients"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sync_sources_code_key" ON "sync_sources"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sync_run_statuses_code_key" ON "sync_run_statuses"("code");

-- CreateIndex
CREATE INDEX "sync_runs_sync_source_id_idx" ON "sync_runs"("sync_source_id");

-- CreateIndex
CREATE INDEX "sync_runs_status_id_idx" ON "sync_runs"("status_id");

-- CreateIndex
CREATE INDEX "sync_runs_initiated_by_user_id_idx" ON "sync_runs"("initiated_by_user_id");

-- CreateIndex
CREATE INDEX "sync_runs_started_at_idx" ON "sync_runs"("started_at");

-- CreateIndex
CREATE INDEX "sync_run_errors_sync_run_id_idx" ON "sync_run_errors"("sync_run_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_account_status_id_fkey" FOREIGN KEY ("account_status_id") REFERENCES "account_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regions" ADD CONSTRAINT "regions_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cities" ADD CONSTRAINT "cities_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_organization_type_id_fkey" FOREIGN KEY ("organization_type_id") REFERENCES "organization_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_verification_status_id_fkey" FOREIGN KEY ("verification_status_id") REFERENCES "organization_verification_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_member_role_id_fkey" FOREIGN KEY ("member_role_id") REFERENCES "organization_member_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manufacturers" ADD CONSTRAINT "manufacturers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manufacturers" ADD CONSTRAINT "manufacturers_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manufacturers" ADD CONSTRAINT "manufacturers_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "product_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_manufacturer_id_fkey" FOREIGN KEY ("manufacturer_id") REFERENCES "manufacturers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_risk_class_id_fkey" FOREIGN KEY ("risk_class_id") REFERENCES "risk_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_origin_type_id_fkey" FOREIGN KEY ("origin_type_id") REFERENCES "product_origin_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_current_registry_status_id_fkey" FOREIGN KEY ("current_registry_status_id") REFERENCES "registry_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_search_documents" ADD CONSTRAINT "product_search_documents_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_documents" ADD CONSTRAINT "product_documents_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_documents" ADD CONSTRAINT "product_documents_document_type_id_fkey" FOREIGN KEY ("document_type_id") REFERENCES "document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registry_status_history" ADD CONSTRAINT "registry_status_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registry_status_history" ADD CONSTRAINT "registry_status_history_registry_status_id_fkey" FOREIGN KEY ("registry_status_id") REFERENCES "registry_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registry_status_history" ADD CONSTRAINT "registry_status_history_source_run_id_fkey" FOREIGN KEY ("source_run_id") REFERENCES "sync_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characteristic_definitions" ADD CONSTRAINT "characteristic_definitions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characteristic_definitions" ADD CONSTRAINT "characteristic_definitions_value_type_id_fkey" FOREIGN KEY ("value_type_id") REFERENCES "characteristic_value_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characteristic_definitions" ADD CONSTRAINT "characteristic_definitions_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "measurement_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_characteristic_values" ADD CONSTRAINT "product_characteristic_values_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_characteristic_values" ADD CONSTRAINT "product_characteristic_values_characteristic_definition_id_fkey" FOREIGN KEY ("characteristic_definition_id") REFERENCES "characteristic_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_offers" ADD CONSTRAINT "supplier_offers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_offers" ADD CONSTRAINT "supplier_offers_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_offers" ADD CONSTRAINT "supplier_offers_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_offers" ADD CONSTRAINT "supplier_offers_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_analogues" ADD CONSTRAINT "product_analogues_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_analogues" ADD CONSTRAINT "product_analogues_analogue_product_id_fkey" FOREIGN KEY ("analogue_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_analogues" ADD CONSTRAINT "product_analogues_analogue_type_id_fkey" FOREIGN KEY ("analogue_type_id") REFERENCES "analogue_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_organization_id_fkey" FOREIGN KEY ("author_organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_experience_period_id_fkey" FOREIGN KEY ("experience_period_id") REFERENCES "review_experience_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_review_status_id_fkey" FOREIGN KEY ("review_status_id") REFERENCES "review_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_moderation_events" ADD CONSTRAINT "review_moderation_events_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_moderation_events" ADD CONSTRAINT "review_moderation_events_moderator_user_id_fkey" FOREIGN KEY ("moderator_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_moderation_events" ADD CONSTRAINT "review_moderation_events_from_status_id_fkey" FOREIGN KEY ("from_status_id") REFERENCES "review_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_moderation_events" ADD CONSTRAINT "review_moderation_events_to_status_id_fkey" FOREIGN KEY ("to_status_id") REFERENCES "review_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_lists" ADD CONSTRAINT "saved_lists_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_lists" ADD CONSTRAINT "saved_lists_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_list_items" ADD CONSTRAINT "saved_list_items_saved_list_id_fkey" FOREIGN KEY ("saved_list_id") REFERENCES "saved_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_list_items" ADD CONSTRAINT "saved_list_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparison_items" ADD CONSTRAINT "comparison_items_comparison_id_fkey" FOREIGN KEY ("comparison_id") REFERENCES "comparisons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparison_items" ADD CONSTRAINT "comparison_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_notification_type_id_fkey" FOREIGN KEY ("notification_type_id") REFERENCES "notification_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_severity_id_fkey" FOREIGN KEY ("severity_id") REFERENCES "notification_severities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_sync_source_id_fkey" FOREIGN KEY ("sync_source_id") REFERENCES "sync_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "sync_run_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_initiated_by_user_id_fkey" FOREIGN KEY ("initiated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_run_errors" ADD CONSTRAINT "sync_run_errors_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "sync_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

