import { eq } from "drizzle-orm";
import { db, serverStatesTable, botConfigTable } from "@workspace/db";
import https from "node:https";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN!.trim();
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const BOARD_MSG_KEY = "telegram_board_message_id";

function httpsGet(urlStr: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(urlStr, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${parsed.description || data}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`Status ${res.statusCode}: ${data}`));
        }
      });
    }).on("error", reject);
  });
}

const SEED_SERVERS = [
  { id: "mio",       name: "Mio" },
  { id: "bo",        name: "Bo" },
  { id: "aaryn",     name: "Aaryn" },
  { id: "new-tunes", name: "New Tunes" },
];

const SERVER_ORDER = ["mio", "bo", "new-tunes", "aaryn"];

async function seedServers(): Promise<void> {
  for (const s of SEED_SERVERS) {
    await db
      .insert(serverStatesTable)
      .values({ id: s.id, name: s.name, status: "off", updatedAt: null })
      .onConflictDoNothing();
  }
}

function toSGT(date: Date): string {
  return date.toLocaleTimeString("en-SG", {
    timeZone: "Asia/Singapore",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function buildBoard(
  rows: { name: string; status: string; updatedAt: Date | null }[]
): string {
  const sorted = [...rows].sort((a, b) => {
    const aKey = a.name.toLowerCase().replace(" ", "-");
    const bKey = b.name.toLowerCase().replace(" ", "-");
    return SERVER_ORDER.indexOf(aKey) - SERVER_ORDER.indexOf(bKey);
  });

  const lines = sorted.map((r) => {
    if (r.status === "on") {
      const since = r.updatedAt ? toSGT(r.updatedAt) : "unknown";
      return `🔴 ${r.name} — In Use (Since ${since})`;
    }
    return `🟢 ${r.name} — Free`;
  });

  return [
    "📡 *Project Starlight — Live Status*",
    ...lines,
    `🕐 Updated: ${toSGT(new Date())}`,
  ].join("\n");
}

function buildKeyboard(): object {
  const buttons = SERVER_ORDER.map((id, i) => {
    const server = SEED_SERVERS.find((s) => s.id === id)!;
    return { text: `${i + 1} · ${server.name}`, callback_data: `toggle:${id}` };
  });
  return { inline_keyboard: [buttons] };
}

async function telegramPost(method: string, body: object): Promise<any> {
  const res = await fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function getBoardMessageId(): Promise<number | null> {
  const [row] = await db
    .select()
    .from(botConfigTable)
    .where(eq(botConfigTable.key, BOARD_MSG_KEY));
  return row ? parseInt(row.value, 10) : null;
}

async function saveBoardMessageId(id: number): Promise<void> {
  await db
    .insert(botConfigTable)
    .values({ key: BOARD_MSG_KEY, value: String(id) })
    .onConflictDoUpdate({
      target: botConfigTable.key,
      set: { value: String(id) },
    });
}

export async function sendOrUpdateStatusBoard(): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN || !CHAT_ID) return;

  try {
    const rows = await db.select().from(serverStatesTable);
    const text = buildBoard(rows);
    const reply_markup = buildKeyboard();
    const boardMessageId = await getBoardMessageId();

    if (boardMessageId === null) {
      const sent = await telegramPost("sendMessage", {
        chat_id: CHAT_ID,
        text,
        parse_mode: "Markdown",
        reply_markup,
      });

      if (sent?.ok && sent?.result?.message_id) {
        await saveBoardMessageId(sent.result.message_id);
        await telegramPost("pinChatMessage", {
          chat_id: CHAT_ID,
          message_id: sent.result.message_id,
          disable_notification: true,
        });
      }
    } else {
      const result = await telegramPost("editMessageText", {
        chat_id: CHAT_ID,
        message_id: boardMessageId,
        text,
        parse_mode: "Markdown",
        reply_markup,
      });

      if (!result?.ok) {
        await db.delete(botConfigTable).where(eq(botConfigTable.key, BOARD_MSG_KEY));
        await sendOrUpdateStatusBoard();
      }
    }
  } catch {
    // Non-fatal
  }
}

export async function handleToggle(serverId: string): Promise<void> {
  const [existing] = await db
    .select()
    .from(serverStatesTable)
    .where(eq(serverStatesTable.id, serverId));

  if (!existing) return;

  const newStatus = existing.status === "on" ? "off" : "on";

  await db
    .update(serverStatesTable)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(serverStatesTable.id, serverId));

  await sendOrUpdateStatusBoard();
}

async function parseUpdate(data: any): Promise<void> {
  console.log("Update received:", JSON.stringify(data).slice(0, 300));
  if (data?.callback_query) {
    const cq = data.callback_query;
    await telegramPost("answerCallbackQuery", { callback_query_id: cq.id }).catch((e) =>
      console.error("answerCallbackQuery failed:", e)
    );
    if (cq.data?.startsWith("toggle:")) {
      const serverId = cq.data.slice("toggle:".length);
      console.log(`Toggle for: ${serverId}`);
      handleToggle(serverId).catch((e) => console.error("handleToggle failed:", e));
    }
    return;
  }

  const text: string = data?.message?.text ?? "";
  if (text === "/start" || text === "/status") {
    sendOrUpdateStatusBoard().catch((e) => console.error("sendOrUpdateStatusBoard failed:", e));
  }
}

let offset = 0;

export async function startPolling(): Promise<void> {
  await seedServers().catch((e) => console.error("seedServers failed:", e));
  await sendOrUpdateStatusBoard().catch((e) => console.error("sendOrUpdateStatusBoard failed:", e));

  console.log("Bot started — polling for updates...");

  let pollCount = 0;
  while (true) {
    ++pollCount;
    try {
      const data = await httpsGet(
        `${TELEGRAM_API}/getUpdates?offset=${offset}&timeout=30`
      );

      if (data?.ok && Array.isArray(data.result)) {
        if (data.result.length > 0) {
          console.log(`[${pollCount}] Got ${data.result.length} update(s)`);
          for (const update of data.result) {
            await parseUpdate(update);
            offset = update.update_id + 1;
          }
        }
      } else {
        console.error(`[${pollCount}] getUpdates not ok:`, JSON.stringify(data).slice(0, 200));
      }
    } catch (err) {
      console.error(`[${pollCount}] Polling error:`, err);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}
