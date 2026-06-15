import { pgTable, text } from "drizzle-orm/pg-core";

export const botConfigTable = pgTable("bot_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
