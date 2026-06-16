import os, asyncio, logging, threading
from datetime import datetime, timezone, timedelta
from http.server import HTTPServer, BaseHTTPRequestHandler

import asyncpg
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger(__name__)

SGT = timezone(timedelta(hours=8))

TOKEN = os.environ["TELEGRAM_BOT_TOKEN"].strip()
CHAT_ID = os.environ["TELEGRAM_CHAT_ID"].strip()
DATABASE_URL = os.environ["DATABASE_URL"].strip()

SERVERS = {
    "mio": "Mio",
    "bo": "Bo",
    "aaryn": "Aaryn",
    "new-tunes": "New Tunes",
}
SERVER_ORDER = ["mio", "bo", "new-tunes", "aaryn"]
BOARD_MSG_KEY = "telegram_board_message_id"


async def get_pool():
    return await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=3)


async def seed(pool):
    async with pool.acquire() as conn:
        for sid, name in SERVERS.items():
            await conn.execute(
                "INSERT INTO server_states (id, name, status) VALUES ($1, $2, 'off') ON CONFLICT (id) DO NOTHING",
                sid, name,
            )


async def get_board_msg_id(pool):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT value FROM bot_config WHERE key = $1", BOARD_MSG_KEY
        )
        return int(row["value"]) if row else None


async def save_board_msg_id(pool, msg_id: int):
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO bot_config (key, value) VALUES ($1, $2) "
            "ON CONFLICT (key) DO UPDATE SET value = $2",
            BOARD_MSG_KEY, str(msg_id),
        )


async def delete_board_msg_id(pool):
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM bot_config WHERE key = $1", BOARD_MSG_KEY)


async def get_servers(pool):
    async with pool.acquire() as conn:
        return await conn.fetch("SELECT * FROM server_states")


async def toggle_server(pool, server_id: str):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT status FROM server_states WHERE id = $1", server_id
        )
        if not row:
            return
        new_status = "off" if row["status"] == "on" else "on"
        await conn.execute(
            "UPDATE server_states SET status = $1, updated_at = NOW() WHERE id = $2",
            new_status, server_id,
        )


def to_sgt(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(SGT).strftime("%I:%M %p").lstrip("0")


def build_board(rows):
    sorted_rows = sorted(rows, key=lambda r: SERVER_ORDER.index(r["id"]) if r["id"] in SERVER_ORDER else 99)
    lines = []
    for r in sorted_rows:
        if r["status"] == "on":
            since = to_sgt(r["updated_at"]) or "unknown"
            lines.append(f"🔴 {r['name']} — In Use (Since {since})")
        else:
            lines.append(f"🟢 {r['name']} — Free")
    now = datetime.now(timezone.utc)
    updated = to_sgt(now)
    return "\n".join([
        "📡 *Project Starlight — Live Status*",
        *lines,
        f"🕐 Updated: {updated}",
    ])


def build_keyboard():
    buttons = [
        InlineKeyboardButton(f"{i + 1} · {SERVERS[sid]}", callback_data=f"toggle:{sid}")
        for i, sid in enumerate(SERVER_ORDER)
    ]
    return InlineKeyboardMarkup([buttons])


async def send_or_update_board(application, pool):
    servers = await get_servers(pool)
    text = build_board(servers)
    markup = build_keyboard()
    board_msg_id = await get_board_msg_id(pool)

    if board_msg_id is None:
        msg = await application.bot.send_message(
            chat_id=CHAT_ID,
            text=text,
            parse_mode="Markdown",
            reply_markup=markup,
        )
        if msg and msg.message_id:
            await save_board_msg_id(pool, msg.message_id)
            await application.bot.pin_chat_message(
                chat_id=CHAT_ID, message_id=msg.message_id, disable_notification=True
            )
    else:
        try:
            await application.bot.edit_message_text(
                chat_id=CHAT_ID,
                message_id=board_msg_id,
                text=text,
                parse_mode="Markdown",
                reply_markup=markup,
            )
        except Exception:
            await delete_board_msg_id(pool)
            await send_or_update_board(application, pool)


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if str(update.effective_chat.id) != CHAT_ID:
        return
    await send_or_update_board(context.application, context.bot_data["pool"])


async def callback_toggle(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if str(update.effective_chat.id) != CHAT_ID:
        return
    query = update.callback_query
    await query.answer()
    server_id = query.data.replace("toggle:", "")
    pool = context.bot_data["pool"]
    await toggle_server(pool, server_id)
    await send_or_update_board(context.application, pool)


class HealthHandler(BaseHTTPRequestHandler):
    def _ok(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")
    do_GET = _ok
    do_HEAD = _ok
    do_POST = _ok
    do_PUT = _ok
    do_DELETE = _ok
    do_OPTIONS = _ok
    do_PATCH = _ok
    def log_message(self, *a):
        pass


def run_health_server():
    port = int(os.environ.get("PORT", "10000"))
    HTTPServer(("0.0.0.0", port), HealthHandler).serve_forever()


async def main():
    pool = await get_pool()
    await seed(pool)

    app = Application.builder().token(TOKEN).build()
    app.bot_data["pool"] = pool

    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("status", cmd_start))
    app.add_handler(CallbackQueryHandler(callback_toggle, pattern="^toggle:"))

    await send_or_update_board(app, pool)
    log.info("Starting polling...")
    await app.run_polling(allowed_updates=["message", "callback_query"])


if __name__ == "__main__":
    threading.Thread(target=run_health_server, daemon=True).start()
    asyncio.run(main())
