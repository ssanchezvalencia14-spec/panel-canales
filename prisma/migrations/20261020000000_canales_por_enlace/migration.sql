-- AlterTable
ALTER TABLE `canales`
    ADD COLUMN `youtube_canal_id` VARCHAR(64) NULL,
    ADD COLUMN `youtube_handle` VARCHAR(100) NULL,
    ADD COLUMN `avatar_url` TEXT NULL,
    ADD COLUMN `suscriptores` INTEGER NULL,
    ADD COLUMN `vistas_totales` BIGINT NULL,
    ADD COLUMN `videos_totales` INTEGER NULL,
    ADD COLUMN `stats_actualizadas_en` DATETIME(3) NULL,
    ADD COLUMN `stats_error` TEXT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `canales_youtube_canal_id_key` ON `canales`(`youtube_canal_id`);

-- CreateTable
CREATE TABLE `videos_youtube` (
    `canal_id` VARCHAR(191) NOT NULL,
    `youtube_id` VARCHAR(16) NOT NULL,
    `titulo` VARCHAR(300) NOT NULL,
    `miniatura_url` TEXT NULL,
    `publicado_en` DATETIME(3) NOT NULL,
    `duracion_seg` INTEGER NULL,
    `vistas` INTEGER NULL,
    `likes` INTEGER NULL,
    `comentarios` INTEGER NULL,
    `actualizado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `videos_youtube_canal_id_publicado_en_idx`(`canal_id`, `publicado_en`),
    PRIMARY KEY (`canal_id`, `youtube_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `canal_snapshots` (
    `canal_id` VARCHAR(191) NOT NULL,
    `fecha` DATE NOT NULL,
    `suscriptores` INTEGER NULL,
    `vistas_totales` BIGINT NULL,
    `videos_totales` INTEGER NULL,

    PRIMARY KEY (`canal_id`, `fecha`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `videos_youtube` ADD CONSTRAINT `videos_youtube_canal_id_fkey` FOREIGN KEY (`canal_id`) REFERENCES `canales`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `canal_snapshots` ADD CONSTRAINT `canal_snapshots_canal_id_fkey` FOREIGN KEY (`canal_id`) REFERENCES `canales`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
