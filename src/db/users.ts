import { and, desc, eq } from 'drizzle-orm';
import { db } from './index.js';
import { savedPalettes, users, type SavedPaletteRecord, type UserRecord } from './schema.js';

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string | null,
): Promise<UserRecord> {
  try {
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: displayName ?? null,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          displayName: displayName ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();

    const user = result[0];
    if (!user) {
      throw new Error('User record could not be persisted.');
    }
    return user;
  } catch (error) {
    console.error('Database user upsert failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function listSavedPalettes(uid: string): Promise<SavedPaletteRecord[]> {
  try {
    const rows = await db
      .select({
        palette: savedPalettes,
      })
      .from(savedPalettes)
      .innerJoin(users, eq(savedPalettes.userId, users.id))
      .where(eq(users.uid, uid))
      .orderBy(desc(savedPalettes.updatedAt));

    return rows.map((row) => row.palette);
  } catch (error) {
    console.error('Database palette list query failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function createSavedPalette(
  uid: string,
  email: string,
  input: { title: string; colors: string[]; notes?: string | null; displayName?: string | null },
): Promise<SavedPaletteRecord> {
  try {
    const user = await getOrCreateUser(uid, email, input.displayName);
    const result = await db
      .insert(savedPalettes)
      .values({
        userId: user.id,
        title: input.title,
        colors: input.colors,
        notes: input.notes ?? null,
      })
      .returning();

    const created = result[0];
    if (!created) {
      throw new Error('Saved palette could not be created.');
    }
    return created;
  } catch (error) {
    console.error('Database palette insert failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function deleteSavedPalette(uid: string, paletteId: number): Promise<boolean> {
  try {
    const owner = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.uid, uid))
      .limit(1);

    const user = owner[0];
    if (!user) return false;

    const deleted = await db
      .delete(savedPalettes)
      .where(and(eq(savedPalettes.id, paletteId), eq(savedPalettes.userId, user.id)))
      .returning({ id: savedPalettes.id });

    return deleted.length > 0;
  } catch (error) {
    console.error('Database palette delete failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}
