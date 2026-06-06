import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const serverStatesTable = pgTable("server_states", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("off"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const insertServerStateSchema = createInsertSchema(serverStatesTable);
export type InsertServerState = z.infer<typeof insertServerStateSchema>;
export type ServerState = typeof serverStatesTable.$inferSelect;
