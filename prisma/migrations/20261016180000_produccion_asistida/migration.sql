-- AlterTable
ALTER TABLE `videos` ADD COLUMN `gancho_forzado_en` DATETIME(3) NULL,
    ADD COLUMN `gancho_forzado_por_id` VARCHAR(191) NULL,
    ADD COLUMN `limite_gasto` DECIMAL(10, 2) NULL,
    ADD COLUMN `puntaje_gancho` JSON NULL,
    ADD COLUMN `revision_titulo` JSON NULL,
    ADD COLUMN `texto_miniatura` VARCHAR(120) NULL;

-- AlterTable
ALTER TABLE `ejecuciones` ADD COLUMN `registrado_por_id` VARCHAR(191) NULL,
    ADD COLUMN `salida_url` TEXT NULL;

-- CreateTable
CREATE TABLE `guiones` (
    `id` VARCHAR(191) NOT NULL,
    `canal_id` VARCHAR(191) NOT NULL,
    `video_id` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `contenido` LONGTEXT NOT NULL,
    `modelo` VARCHAR(64) NULL,
    `ejecucion_id` VARCHAR(191) NULL,
    `creado_por_id` VARCHAR(191) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `guiones_canal_id_video_id_idx`(`canal_id`, `video_id`),
    UNIQUE INDEX `guiones_video_id_version_key`(`video_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `ejecuciones_canal_id_video_id_idx` ON `ejecuciones`(`canal_id`, `video_id`);

-- AddForeignKey
ALTER TABLE `videos` ADD CONSTRAINT `videos_gancho_forzado_por_id_fkey` FOREIGN KEY (`gancho_forzado_por_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ejecuciones` ADD CONSTRAINT `ejecuciones_registrado_por_id_fkey` FOREIGN KEY (`registrado_por_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `guiones` ADD CONSTRAINT `guiones_canal_id_fkey` FOREIGN KEY (`canal_id`) REFERENCES `canales`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `guiones` ADD CONSTRAINT `guiones_canal_id_video_id_fkey` FOREIGN KEY (`canal_id`, `video_id`) REFERENCES `videos`(`canal_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `guiones` ADD CONSTRAINT `guiones_creado_por_id_fkey` FOREIGN KEY (`creado_por_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
