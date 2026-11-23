import { relations } from 'drizzle-orm';
import { integer, jsonb, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const savedPalettes = pgTable('saved_palettes', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  colors: jsonb('colors').$type<string[]>().notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  savedPalettes: many(savedPalettes),
}));

export const savedPalettesRelations = relations(savedPalettes, ({ one }) => ({
  owner: one(users, {
    fields: [savedPalettes.userId],
    references: [users.id],
  }),
}));

export type UserRecord = typeof users.$inferSelect;
export type SavedPaletteRecord = typeof savedPalettes.$inferSelect;
