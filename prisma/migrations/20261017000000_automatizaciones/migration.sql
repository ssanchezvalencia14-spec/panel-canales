-- CreateTable
CREATE TABLE `alertas` (
    `id` VARCHAR(191) NOT NULL,
    `canal_id` VARCHAR(191) NOT NULL,
    `video_id` VARCHAR(191) NULL,
    `tipo` VARCHAR(40) NOT NULL,
    `clave` VARCHAR(120) NOT NULL,
    `mensaje` VARCHAR(500) NOT NULL,
    `gravedad` VARCHAR(10) NOT NULL DEFAULT 'aviso',
    `abierta_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `cerrada_en` DATETIME(3) NULL,
    `notificada_en` DATETIME(3) NULL,

    INDEX `alertas_canal_id_cerrada_en_idx`(`canal_id`, `cerrada_en`),
    INDEX `alertas_canal_id_clave_idx`(`canal_id`, `clave`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `informes` (
    `id` VARCHAR(191) NOT NULL,
    `canal_id` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(30) NOT NULL,
    `semana` VARCHAR(10) NOT NULL,
    `titulo` VARCHAR(200) NOT NULL,
    `contenido` LONGTEXT NOT NULL,
    `estado` ENUM('borrador', 'enviado', 'error') NOT NULL DEFAULT 'borrador',
    `datos` JSON NULL,
    `costo` DECIMAL(10, 4) NULL,
    `ejecucion_id` VARCHAR(191) NULL,
    `generado_por_id` VARCHAR(191) NULL,
    `aprobado_por_id` VARCHAR(191) NULL,
    `aprobado_en` DATETIME(3) NULL,
    `enviado_en` DATETIME(3) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    INDEX `informes_canal_id_creado_en_idx`(`canal_id`, `creado_en`),
    UNIQUE INDEX `informes_canal_id_tipo_semana_key`(`canal_id`, `tipo`, `semana`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `alertas` ADD CONSTRAINT `alertas_canal_id_fkey` FOREIGN KEY (`canal_id`) REFERENCES `canales`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alertas` ADD CONSTRAINT `alertas_canal_id_video_id_fkey` FOREIGN KEY (`canal_id`, `video_id`) REFERENCES `videos`(`canal_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `informes` ADD CONSTRAINT `informes_canal_id_fkey` FOREIGN KEY (`canal_id`) REFERENCES `canales`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `informes` ADD CONSTRAINT `informes_generado_por_id_fkey` FOREIGN KEY (`generado_por_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `informes` ADD CONSTRAINT `informes_aprobado_por_id_fkey` FOREIGN KEY (`aprobado_por_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
