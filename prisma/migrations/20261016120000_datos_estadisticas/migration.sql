-- AlterTable
ALTER TABLE `publicaciones` ADD COLUMN `externo_id` VARCHAR(64) NULL;

-- AlterTable
ALTER TABLE `metricas` ADD COLUMN `actualizado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `compartidos` INTEGER NULL,
    ADD COLUMN `fuente` ENUM('youtube_api', 'csv', 'manual') NOT NULL DEFAULT 'manual',
    ADD COLUMN `suscriptores` INTEGER NULL;

-- CreateTable
CREATE TABLE `integraciones` (
    `id` VARCHAR(191) NOT NULL,
    `canal_id` VARCHAR(191) NOT NULL,
    `proveedor` ENUM('google') NOT NULL,
    `cuenta` VARCHAR(191) NULL,
    `youtube_canal_id` VARCHAR(64) NULL,
    `calendario_id` VARCHAR(191) NOT NULL DEFAULT 'primary',
    `refresh_token_cifrado` TEXT NOT NULL,
    `alcances` TEXT NOT NULL,
    `conectado_por_id` VARCHAR(191) NULL,
    `ultima_sincronizacion` DATETIME(3) NULL,
    `ultimo_error` TEXT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    UNIQUE INDEX `integraciones_canal_id_proveedor_key`(`canal_id`, `proveedor`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `eventos_calendario` (
    `id` VARCHAR(191) NOT NULL,
    `canal_id` VARCHAR(191) NOT NULL,
    `origen` ENUM('panel', 'google') NOT NULL,
    `tipo` VARCHAR(20) NOT NULL,
    `video_id` VARCHAR(191) NULL,
    `google_event_id` VARCHAR(255) NULL,
    `titulo` VARCHAR(300) NOT NULL,
    `inicio` DATETIME(3) NOT NULL,
    `fin` DATETIME(3) NULL,
    `todo_el_dia` BOOLEAN NOT NULL DEFAULT false,
    `actualizado_en` DATETIME(3) NOT NULL,

    INDEX `eventos_calendario_canal_id_inicio_idx`(`canal_id`, `inicio`),
    UNIQUE INDEX `eventos_calendario_canal_id_google_event_id_key`(`canal_id`, `google_event_id`),
    UNIQUE INDEX `eventos_calendario_canal_id_video_id_tipo_key`(`canal_id`, `video_id`, `tipo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `publicaciones_canal_id_plataforma_externo_id_key` ON `publicaciones`(`canal_id`, `plataforma`, `externo_id`);

-- AddForeignKey
ALTER TABLE `integraciones` ADD CONSTRAINT `integraciones_canal_id_fkey` FOREIGN KEY (`canal_id`) REFERENCES `canales`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `integraciones` ADD CONSTRAINT `integraciones_conectado_por_id_fkey` FOREIGN KEY (`conectado_por_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `eventos_calendario` ADD CONSTRAINT `eventos_calendario_canal_id_fkey` FOREIGN KEY (`canal_id`) REFERENCES `canales`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `eventos_calendario` ADD CONSTRAINT `eventos_calendario_canal_id_video_id_fkey` FOREIGN KEY (`canal_id`, `video_id`) REFERENCES `videos`(`canal_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;
