import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const careRecords = sqliteTable("care_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  deviceId: text("device_id").notNull(),
  recordDate: text("record_date").notNull(),
  completed: text("completed").notNull().default("[]"),
  soil: text("soil").notNull().default("unknown"),
  leaves: text("leaves").notNull().default("healthy"),
  bloom: text("bloom").notNull().default("unknown"),
  note: text("note").notNull().default(""),
  photoKey: text("photo_key"),
  fertilized: integer("fertilized", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("care_records_device_date_idx").on(table.deviceId, table.recordDate)]);
