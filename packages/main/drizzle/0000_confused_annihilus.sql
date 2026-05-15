CREATE TABLE `downloads` (
	`track_id` text PRIMARY KEY NOT NULL,
	`downloaded_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `logs` (
	`id` text PRIMARY KEY NOT NULL,
	`message` text NOT NULL,
	`timestamp` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `playlist_tracks` (
	`playlist_id` text NOT NULL,
	`track_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`playlist_id`, `track_id`)
);
--> statement-breakpoint
CREATE TABLE `playlists` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`image_url` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recent_playlists` (
	`playlist_id` text PRIMARY KEY NOT NULL,
	`position` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`artist` text NOT NULL,
	`album` text NOT NULL,
	`album_id` text,
	`source_server_id` text,
	`is_hi_res` integer DEFAULT false NOT NULL,
	`duration` text NOT NULL,
	`size_mb` integer NOT NULL,
	`cover_tone` text NOT NULL,
	`cover_url` text,
	`updated_at` integer NOT NULL
);
