-- AlterTable
ALTER TABLE `videos` ADD COLUMN `drive_carpeta_id` VARCHAR(128) NULL,
    ADD COLUMN `drive_carpeta_url` TEXT NULL,
    ADD COLUMN `ficha_drive_id` VARCHAR(128) NULL,
    ADD COLUMN `ficha_drive_url` TEXT NULL,
    ADD COLUMN `ficha_publicacion` JSON NULL,
    ADD COLUMN `youtube_programado_para` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `integraciones` ADD COLUMN `drive_carpeta_id` VARCHAR(128) NULL;

-- CreateTable
CREATE TABLE `actividad` (
    `id` VARCHAR(191) NOT NULL,
    `canal_id` VARCHAR(191) NOT NULL,
    `video_id` VARCHAR(191) NULL,
    `user_id` VARCHAR(191) NULL,
    `accion` VARCHAR(40) NOT NULL,
    `resumen` VARCHAR(500) NOT NULL,
    `detalle` JSON NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `actividad_canal_id_creado_en_idx`(`canal_id`, `creado_en`),
    INDEX `actividad_canal_id_video_id_idx`(`canal_id`, `video_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `actividad` ADD CONSTRAINT `actividad_canal_id_fkey` FOREIGN KEY (`canal_id`) REFERENCES `canales`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `actividad` ADD CONSTRAINT `actividad_canal_id_video_id_fkey` FOREIGN KEY (`canal_id`, `video_id`) REFERENCES `videos`(`canal_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `actividad` ADD CONSTRAINT `actividad_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
