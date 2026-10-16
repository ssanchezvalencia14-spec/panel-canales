-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NULL,
    `email_verificado` DATETIME(3) NULL,
    `imagen` TEXT NULL,
    `es_superadmin` BOOLEAN NOT NULL DEFAULT false,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `membresias` (
    `user_id` VARCHAR(191) NOT NULL,
    `canal_id` VARCHAR(191) NOT NULL,
    `rol` ENUM('admin', 'productor', 'revisor', 'lector') NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `membresias_canal_id_idx`(`canal_id`),
    PRIMARY KEY (`user_id`, `canal_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `accounts` (
    `user_id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `provider_account_id` VARCHAR(191) NOT NULL,
    `refresh_token` TEXT NULL,
    `access_token` TEXT NULL,
    `expires_at` INTEGER NULL,
    `token_type` VARCHAR(191) NULL,
    `scope` VARCHAR(191) NULL,
    `id_token` TEXT NULL,
    `session_state` VARCHAR(191) NULL,

    INDEX `accounts_user_id_idx`(`user_id`),
    PRIMARY KEY (`provider`, `provider_account_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sessions` (
    `session_token` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `expires` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sessions_session_token_key`(`session_token`),
    INDEX `sessions_user_id_idx`(`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `verification_tokens` (
    `identifier` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `expires` DATETIME(3) NOT NULL,

    PRIMARY KEY (`identifier`, `token`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `canales` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `idioma` VARCHAR(191) NOT NULL DEFAULT 'es',
    `zona_horaria` VARCHAR(191) NOT NULL,
    `hora_publicacion` VARCHAR(5) NOT NULL,
    `dias_publicacion` JSON NOT NULL,
    `color_acento` VARCHAR(7) NOT NULL,
    `pilares` JSON NOT NULL,
    `reglas` JSON NOT NULL,
    `limite_gasto_video` DECIMAL(10, 2) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    UNIQUE INDEX `canales_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `videos` (
    `id` VARCHAR(191) NOT NULL,
    `canal_id` VARCHAR(191) NOT NULL,
    `titulo` VARCHAR(300) NOT NULL,
    `pilar` VARCHAR(191) NULL,
    `fecha_publicacion` DATETIME(3) NULL,
    `estado` ENUM('idea', 'guion', 'verificacion', 'produccion', 'revision', 'aprobado', 'programado', 'publicado') NOT NULL DEFAULT 'idea',
    `gancho` TEXT NULL,
    `score_gancho` DOUBLE NULL,
    `fuentes_ok` BOOLEAN NOT NULL DEFAULT false,
    `notas` TEXT NULL,
    `aprobado_por_id` VARCHAR(191) NULL,
    `aprobado_en` DATETIME(3) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    INDEX `videos_canal_id_fecha_publicacion_idx`(`canal_id`, `fecha_publicacion`),
    INDEX `videos_canal_id_estado_idx`(`canal_id`, `estado`),
    UNIQUE INDEX `videos_canal_id_id_key`(`canal_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tareas` (
    `id` VARCHAR(191) NOT NULL,
    `canal_id` VARCHAR(191) NOT NULL,
    `video_id` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(191) NOT NULL,
    `descripcion` TEXT NULL,
    `responsable_id` VARCHAR(191) NULL,
    `estado` ENUM('pendiente', 'en_curso', 'hecha', 'bloqueada') NOT NULL DEFAULT 'pendiente',
    `fuente_url` TEXT NULL,
    `vence` DATETIME(3) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    INDEX `tareas_canal_id_estado_idx`(`canal_id`, `estado`),
    INDEX `tareas_canal_id_video_id_idx`(`canal_id`, `video_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activos` (
    `id` VARCHAR(191) NOT NULL,
    `canal_id` VARCHAR(191) NOT NULL,
    `video_id` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(191) NOT NULL,
    `url` TEXT NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `activos_canal_id_video_id_idx`(`canal_id`, `video_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `publicaciones` (
    `id` VARCHAR(191) NOT NULL,
    `canal_id` VARCHAR(191) NOT NULL,
    `video_id` VARCHAR(191) NOT NULL,
    `plataforma` ENUM('youtube', 'youtube_shorts', 'tiktok') NOT NULL,
    `url` TEXT NULL,
    `programada` DATETIME(3) NULL,
    `publicada` DATETIME(3) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `publicaciones_canal_id_video_id_idx`(`canal_id`, `video_id`),
    UNIQUE INDEX `publicaciones_canal_id_id_key`(`canal_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `metricas` (
    `id` VARCHAR(191) NOT NULL,
    `canal_id` VARCHAR(191) NOT NULL,
    `publicacion_id` VARCHAR(191) NOT NULL,
    `fecha` DATE NOT NULL,
    `vistas` INTEGER NULL,
    `retencion` DOUBLE NULL,
    `ctr` DOUBLE NULL,
    `likes` INTEGER NULL,
    `comentarios` INTEGER NULL,

    INDEX `metricas_canal_id_fecha_idx`(`canal_id`, `fecha`),
    UNIQUE INDEX `metricas_publicacion_id_fecha_key`(`publicacion_id`, `fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ejecuciones` (
    `id` VARCHAR(191) NOT NULL,
    `canal_id` VARCHAR(191) NOT NULL,
    `video_id` VARCHAR(191) NULL,
    `tipo` VARCHAR(191) NOT NULL,
    `estado` ENUM('en_cola', 'en_curso', 'ok', 'error') NOT NULL DEFAULT 'en_cola',
    `log` LONGTEXT NULL,
    `costo` DECIMAL(10, 4) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    INDEX `ejecuciones_canal_id_estado_idx`(`canal_id`, `estado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `membresias` ADD CONSTRAINT `membresias_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `membresias` ADD CONSTRAINT `membresias_canal_id_fkey` FOREIGN KEY (`canal_id`) REFERENCES `canales`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `videos` ADD CONSTRAINT `videos_canal_id_fkey` FOREIGN KEY (`canal_id`) REFERENCES `canales`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `videos` ADD CONSTRAINT `videos_aprobado_por_id_fkey` FOREIGN KEY (`aprobado_por_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tareas` ADD CONSTRAINT `tareas_canal_id_fkey` FOREIGN KEY (`canal_id`) REFERENCES `canales`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tareas` ADD CONSTRAINT `tareas_canal_id_video_id_fkey` FOREIGN KEY (`canal_id`, `video_id`) REFERENCES `videos`(`canal_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tareas` ADD CONSTRAINT `tareas_responsable_id_fkey` FOREIGN KEY (`responsable_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activos` ADD CONSTRAINT `activos_canal_id_fkey` FOREIGN KEY (`canal_id`) REFERENCES `canales`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activos` ADD CONSTRAINT `activos_canal_id_video_id_fkey` FOREIGN KEY (`canal_id`, `video_id`) REFERENCES `videos`(`canal_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `publicaciones` ADD CONSTRAINT `publicaciones_canal_id_fkey` FOREIGN KEY (`canal_id`) REFERENCES `canales`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `publicaciones` ADD CONSTRAINT `publicaciones_canal_id_video_id_fkey` FOREIGN KEY (`canal_id`, `video_id`) REFERENCES `videos`(`canal_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `metricas` ADD CONSTRAINT `metricas_canal_id_fkey` FOREIGN KEY (`canal_id`) REFERENCES `canales`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `metricas` ADD CONSTRAINT `metricas_canal_id_publicacion_id_fkey` FOREIGN KEY (`canal_id`, `publicacion_id`) REFERENCES `publicaciones`(`canal_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ejecuciones` ADD CONSTRAINT `ejecuciones_canal_id_fkey` FOREIGN KEY (`canal_id`) REFERENCES `canales`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ejecuciones` ADD CONSTRAINT `ejecuciones_canal_id_video_id_fkey` FOREIGN KEY (`canal_id`, `video_id`) REFERENCES `videos`(`canal_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;
