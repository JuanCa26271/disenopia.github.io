CREATE DATABASE IF NOT EXISTS `maga` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `maga`;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `order_item_customizations`;
DROP TABLE IF EXISTS `order_items`;
DROP TABLE IF EXISTS `orders`;
DROP TABLE IF EXISTS `customers`;
DROP TABLE IF EXISTS `product_reference_images`;
DROP TABLE IF EXISTS `products`;
DROP TABLE IF EXISTS `categories`;
DROP TABLE IF EXISTS `customization_extras`;
DROP TABLE IF EXISTS `typography_fonts`;
DROP TABLE IF EXISTS `design_templates`;
DROP TABLE IF EXISTS `workshop_holidays`;
DROP TABLE IF EXISTS `workshop_config`;
DROP TABLE IF EXISTS `ticket_sequences`;
DROP TABLE IF EXISTS `uploaded_assets`;
DROP TABLE IF EXISTS `admin_users`;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE `admin_users` (
  `id` CHAR(36) NOT NULL,
  `username` VARCHAR(120) NOT NULL,
  `password_hash` TEXT NOT NULL,
  `must_change_password` TINYINT(1) NOT NULL DEFAULT 1,
  `failed_login_attempts` INT NOT NULL DEFAULT 0,
  `locked_until` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `admin_users_username_key` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `categories` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(180) NOT NULL,
  `base_prep_time_minutes` INT NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `categories_name_key` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `products` (
  `id` CHAR(36) NOT NULL,
  `category_id` CHAR(36) NOT NULL,
  `name` VARCHAR(180) NOT NULL,
  `description` TEXT NOT NULL,
  `base_price` DECIMAL(10,2) NOT NULL,
  `prep_time_minutes` INT NOT NULL,
  `stock_available` INT NOT NULL DEFAULT 0,
  `is_customizable` TINYINT(1) NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `products_category_active_idx` (`category_id`, `is_active`),
  CONSTRAINT `fk_products_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `product_reference_images` (
  `id` CHAR(36) NOT NULL,
  `product_id` CHAR(36) NOT NULL,
  `image_url` VARCHAR(2048) NOT NULL,
  `alt_text` VARCHAR(255) NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `product_reference_images_product_sort_key` (`product_id`, `sort_order`),
  CONSTRAINT `fk_product_images_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `customization_extras` (
  `id` CHAR(36) NOT NULL,
  `extra_type` ENUM('TELA_TRASLUCIDA','MONO','PLANTA_PEQUENA','HOJA_OPALINA','FLORES','AROMA','LIBRO_MINIATURA','CENTRO_MESA','OTRO') NOT NULL,
  `name` VARCHAR(180) NOT NULL,
  `additional_cost` DECIMAL(10,2) NOT NULL,
  `additional_prep_minutes` INT NOT NULL DEFAULT 0,
  `preview_image_url` VARCHAR(2048) NULL,
  `is_available` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `customization_extras_available_type_idx` (`is_available`, `extra_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `typography_fonts` (
  `id` CHAR(36) NOT NULL,
  `font_family_name` VARCHAR(120) NOT NULL,
  `google_font_url` VARCHAR(2048) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `typography_fonts_family_key` (`font_family_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `design_templates` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(180) NOT NULL,
  `event_category` VARCHAR(120) NOT NULL,
  `template_image_url` VARCHAR(2048) NOT NULL,
  `print_width_mm` DECIMAL(8,2) NOT NULL,
  `print_height_mm` DECIMAL(8,2) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `design_templates_event_active_idx` (`event_category`, `is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `customers` (
  `id` CHAR(36) NOT NULL,
  `first_name_encrypted` TEXT NOT NULL,
  `last_name_encrypted` TEXT NOT NULL,
  `phone_encrypted` TEXT NOT NULL,
  `encryption_iv` VARCHAR(128) NOT NULL,
  `encryption_auth_tag` VARCHAR(128) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `orders` (
  `id` CHAR(36) NOT NULL,
  `ticket_code` VARCHAR(40) NOT NULL,
  `customer_id` CHAR(36) NOT NULL,
  `status` ENUM('PENDIENTE','EN_PRODUCCION','TERMINADO','ENTREGADO','CANCELADO') NOT NULL DEFAULT 'PENDIENTE',
  `total_amount` DECIMAL(10,2) NOT NULL,
  `calculated_ready_date` DATE NOT NULL,
  `customer_requested_date` DATE NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `orders_ticket_code_key` (`ticket_code`),
  KEY `orders_status_ready_idx` (`status`, `calculated_ready_date`),
  KEY `orders_requested_date_idx` (`customer_requested_date`),
  KEY `orders_customer_id_idx` (`customer_id`),
  CONSTRAINT `fk_orders_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `order_items` (
  `id` CHAR(36) NOT NULL,
  `order_id` CHAR(36) NOT NULL,
  `product_id` CHAR(36) NOT NULL,
  `quantity` INT NOT NULL,
  `unit_price_calculated` DECIMAL(10,2) NOT NULL,
  `subtotal` DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `order_items_order_idx` (`order_id`),
  KEY `order_items_product_idx` (`product_id`),
  CONSTRAINT `fk_order_items_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_order_items_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `order_item_customizations` (
  `id` CHAR(36) NOT NULL,
  `order_item_id` CHAR(36) NOT NULL,
  `extra_id` CHAR(36) NULL,
  `custom_text` VARCHAR(500) NULL,
  `font_id` CHAR(36) NULL,
  `template_id` CHAR(36) NULL,
  `customer_photo_url` VARCHAR(2048) NULL,
  `generated_high_res_print_url` VARCHAR(2048) NULL,
  `print_width_mm` DECIMAL(8,2) NULL,
  `print_height_mm` DECIMAL(8,2) NULL,
  `is_printed` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `order_customizations_print_idx` (`is_printed`, `order_item_id`),
  KEY `fk_customizations_extra` (`extra_id`),
  KEY `fk_customizations_font` (`font_id`),
  KEY `fk_customizations_template` (`template_id`),
  CONSTRAINT `fk_customizations_order_item` FOREIGN KEY (`order_item_id`) REFERENCES `order_items` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_customizations_extra` FOREIGN KEY (`extra_id`) REFERENCES `customization_extras` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_customizations_font` FOREIGN KEY (`font_id`) REFERENCES `typography_fonts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_customizations_template` FOREIGN KEY (`template_id`) REFERENCES `design_templates` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `workshop_config` (
  `id` CHAR(36) NOT NULL,
  `daily_work_minutes` INT NOT NULL DEFAULT 480,
  `minimum_buffer_hours` INT NOT NULL DEFAULT 24,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `workshop_holidays` (
  `id` CHAR(36) NOT NULL,
  `workshop_config_id` CHAR(36) NOT NULL,
  `holiday_date` DATE NOT NULL,
  `label` VARCHAR(180) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `workshop_holidays_config_date_key` (`workshop_config_id`, `holiday_date`),
  CONSTRAINT `fk_holidays_workshop_config` FOREIGN KEY (`workshop_config_id`) REFERENCES `workshop_config` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `ticket_sequences` (
  `year` INT NOT NULL,
  `last_number` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `uploaded_assets` (
  `id` CHAR(36) NOT NULL,
  `purpose` ENUM('PRODUCT_REFERENCE','COLLECTION_REFERENCE','SYSTEM_CUSTOMIZATION','ORDER_CUSTOMIZATION','LEGACY') NOT NULL DEFAULT 'LEGACY',
  `storage_key` VARCHAR(512) NOT NULL,
  `content_type` VARCHAR(120) NOT NULL,
  `size_bytes` INT NOT NULL,
  `width_pixels` INT NOT NULL,
  `height_pixels` INT NOT NULL,
  `encryption_iv` VARCHAR(128) NOT NULL,
  `encryption_auth_tag` VARCHAR(128) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uploaded_assets_storage_key` (`storage_key`),
  KEY `uploaded_assets_purpose_created_idx` (`purpose`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Datos iniciales de demostración
INSERT INTO `admin_users` (`id`, `username`, `password_hash`, `must_change_password`) VALUES
('00000000-0000-4000-8000-000000000001', 'MAGA@ADMON', '$argon2id$v=19$m=19456,t=2,p=1$maga$hash', 0);

INSERT INTO `categories` (`id`, `name`, `base_prep_time_minutes`, `is_active`) VALUES
('10000000-0000-4000-8000-000000000001', 'Velas decoradas', 60, 1),
('10000000-0000-4000-8000-000000000002', 'Aromatizantes caseros', 45, 1),
('10000000-0000-4000-8000-000000000003', 'Yesos para pintar', 60, 1),
('10000000-0000-4000-8000-000000000004', 'Centros de mesa', 90, 1),
('10000000-0000-4000-8000-000000000005', 'Libros miniatura para colorear', 45, 1);

INSERT INTO `products` (`id`, `category_id`, `name`, `description`, `base_price`, `prep_time_minutes`, `stock_available`, `is_customizable`, `is_active`) VALUES
('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Velas decoradas', 'Velas artesanales para tus celebraciones.', 180.00, 1440, 5, 1, 1),
('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'Aromatizantes caseros', 'Fragancias artesanales para llenar de calma cada rincón.', 95.00, 1440, 8, 1, 1),
('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'Yesos para pintar', 'Piezas creativas para colorear y compartir.', 75.00, 1440, 10, 1, 1),
('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 'Centros de mesa', 'Detalles hechos a mano para decorar tu celebración.', 240.00, 1440, 3, 1, 1),
('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005', 'Libros miniatura para colorear', 'Un recuerdo pequeño para grandes momentos.', 110.00, 1440, 6, 1, 1);

INSERT INTO `customization_extras` (`id`, `extra_type`, `name`, `additional_cost`, `additional_prep_minutes`, `is_available`) VALUES
('30000000-0000-4000-8000-000000000001', 'TELA_TRASLUCIDA', 'Envoltura tela traslúcida', 25.00, 10, 1),
('30000000-0000-4000-8000-000000000002', 'MONO', 'Moños', 15.00, 5, 1),
('30000000-0000-4000-8000-000000000003', 'PLANTA_PEQUENA', 'Plantas chiquitas', 35.00, 15, 1),
('30000000-0000-4000-8000-000000000004', 'HOJA_OPALINA', 'Hoja opalina personalizada', 30.00, 20, 1),
('30000000-0000-4000-8000-000000000005', 'FLORES', 'Flores secas', 28.00, 10, 1);

INSERT INTO `typography_fonts` (`id`, `font_family_name`, `google_font_url`, `is_active`) VALUES
('40000000-0000-4000-8000-000000000001', 'Playfair Display', 'https://fonts.googleapis.com/css2?family=Playfair+Display', 1),
('40000000-0000-4000-8000-000000000002', 'Cinzel', 'https://fonts.googleapis.com/css2?family=Cinzel', 1),
('40000000-0000-4000-8000-000000000003', 'Montserrat', 'https://fonts.googleapis.com/css2?family=Montserrat', 1);

INSERT INTO `design_templates` (`id`, `name`, `event_category`, `template_image_url`, `print_width_mm`, `print_height_mm`, `is_active`) VALUES
('50000000-0000-4000-8000-000000000001', 'Bautizo · flores suaves', 'Bautizo', '/assets/Logo.jpg', 50.00, 35.00, 1),
('50000000-0000-4000-8000-000000000002', 'Boda · minimalista', 'Boda', '/assets/Logo.jpg', 50.00, 35.00, 1);

INSERT INTO `workshop_config` (`id`, `daily_work_minutes`, `minimum_buffer_hours`) VALUES
('00000000-0000-4000-8000-000000000001', 240, 24);

INSERT INTO `ticket_sequences` (`year`, `last_number`) VALUES (2026, 1);

