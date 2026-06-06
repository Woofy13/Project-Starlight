import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, serverStatesTable } from "@workspace/db";
import {
  ListServersResponse,
  UpdateServerStatusBody,
  UpdateServerStatusResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const SEED_SERVERS = [
  { id: "mio", name: "Mio" },
  { id: "bo", name: "Bo" },
  { id: "aaryn", name: "Aaryn" },
  { id: "new-tunes", name: "New Tunes" },
];

async function seedServers(): Promise<void> {
  for (const s of SEED_SERVERS) {
    await db
      .insert(serverStatesTable)
      .values({ id: s.id, name: s.name, status: "off", updatedAt: null })
      .onConflictDoNothing();
  }
}

router.get("/servers", async (req, res): Promise<void> => {
  await seedServers();
  const rows = await db.select().from(serverStatesTable).orderBy(serverStatesTable.name);
  res.json(ListServersResponse.parse(rows.map((r) => ({
    ...r,
    updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
  }))));
});

router.patch("/servers/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const parsed = UpdateServerStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [row] = await db
    .update(serverStatesTable)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(eq(serverStatesTable.id, id))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Server not found" });
    return;
  }

  res.json(UpdateServerStatusResponse.parse({
    ...row,
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
  }));
});

export default router;
