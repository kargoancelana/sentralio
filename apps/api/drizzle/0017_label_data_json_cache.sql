-- Add label_data_json column to label_cache table for caching frontend label data
ALTER TABLE `label_cache` ADD COLUMN `label_data_json` MEDIUMTEXT;
