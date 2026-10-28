import os, asyncio, logging, threading
from datetime import datetime, timezone, timedelta
from http.server import HTTPServer, BaseHTTPRequestHandler

import asyncpg
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.error import BadRequest, TelegramError
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
    "horse": "Horse",
}
SERVER_ORDER = ["mio", "bo", "new-tunes", "aaryn", "horse"]
BOARD_MSG_KEY = "telegram_board_message_id"


async def get_pool():
    return await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=3)


async def seed(pool):
    async with pool.acquire() as conn:
        await conn.execute(
            "ALTER TABLE server_states ADD COLUMN IF NOT EXISTS updated_by text"
        )
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


async def set_server_state(pool, server_id: str, actor: str, turn_on: bool):
    async with pool.acquire() as conn:
        if turn_on:
            return await conn.fetchrow(
                "UPDATE server_states "
                "SET status = 'on', updated_at = NOW(), updated_by = $2 "
                "WHERE id = $1 AND status = 'off' "
                "RETURNING status, updated_at, updated_by",
                server_id, actor,
            )
        return await conn.fetchrow(
            "UPDATE server_states "
            "SET status = 'off', updated_at = NULL, updated_by = NULL "
            "WHERE id = $1 AND status = 'on' AND (updated_by = $2 OR updated_by IS NULL) "
            "RETURNING status, updated_at, updated_by",
            server_id, actor,
        )


def to_sgt(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(SGT).strftime("%I:%M %p").lstrip("0")


def display_name(user):
    if user is None:
        return "Unknown"
    return user.username or user.first_name or "Unknown"


def escape_md(text):
    for ch in ("\\", "_", "*", "`", "["):
        text = text.replace(ch, "\\" + ch)
    return text


def build_board(rows):
    sorted_rows = sorted(rows, key=lambda r: SERVER_ORDER.index(r["id"]) if r["id"] in SERVER_ORDER else 99)
    lines = []
    for r in sorted_rows:
        if r["status"] == "on":
            since = to_sgt(r["updated_at"]) or "unknown"
            by = r.get("updated_by")
            if by:
                lines.append(f"🔴 {r['name']} — In Use (by {escape_md(by)} since {since})")
            else:
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


def get_board_lock(application):
    lock = application.bot_data.get("board_lock")
    if lock is None:
        lock = asyncio.Lock()
        application.bot_data["board_lock"] = lock
    return lock


async def _apply_board(application, pool, rows):
    application.bot_data["servers"] = rows
    text = build_board(rows)
    markup = build_keyboard()
    board_msg_id = application.bot_data.get("board_msg_id")
    if board_msg_id is None:
        board_msg_id = await get_board_msg_id(pool)
        application.bot_data["board_msg_id"] = board_msg_id

    if board_msg_id is not None:
        try:
            await application.bot.edit_message_text(
                chat_id=CHAT_ID,
                message_id=board_msg_id,
                text=text,
                parse_mode="Markdown",
                reply_markup=markup,
            )
            return
        except BadRequest as e:
            if "not modified" in str(e).lower():
                return
            log.warning("Board edit failed, recreating card: %s", e)
            try:
                await application.bot.delete_message(
                    chat_id=CHAT_ID, message_id=board_msg_id
                )
            except TelegramError as de:
                log.warning("Could not delete old card %s: %s", board_msg_id, de)
            await delete_board_msg_id(pool)
            application.bot_data["board_msg_id"] = None

    msg = await application.bot.send_message(
        chat_id=CHAT_ID,
        text=text,
        parse_mode="Markdown",
        reply_markup=markup,
    )
    if not msg or not msg.message_id:
        return
    await save_board_msg_id(pool, msg.message_id)
    application.bot_data["board_msg_id"] = msg.message_id
    try:
        await application.bot.pin_chat_message(
            chat_id=CHAT_ID, message_id=msg.message_id, disable_notification=True
        )
    except TelegramError as pe:
        log.warning("Could not pin card %s: %s", msg.message_id, pe)


async def send_or_update_board(application, pool, rows=None):
    async with get_board_lock(application):
        if rows is None:
            rows = [dict(r) for r in await get_servers(pool)]
        await _apply_board(application, pool, rows)


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if str(update.effective_chat.id) != CHAT_ID:
        return
    await send_or_update_board(context.application, context.bot_data["pool"])


async def callback_toggle(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if str(update.effective_chat.id) != CHAT_ID:
        return
    query = update.callback_query
    server_id = query.data.replace("toggle:", "")
    actor = display_name(update.effective_user)
    app = context.application
    pool = context.bot_data["pool"]

    async with get_board_lock(app):
        rows = app.bot_data.get("servers")
        if rows is None:
            rows = [dict(r) for r in await get_servers(pool)]
            app.bot_data["servers"] = rows

        current = next((r for r in rows if r["id"] == server_id), None)
        if current is None:
            await query.answer()
            return

        owner = current.get("updated_by")
        if current["status"] == "on" and owner is not None and owner != actor:
            since = to_sgt(current["updated_at"]) or "unknown"
            await query.answer(
                text=f"{current['name']} is in use by {owner} since {since}",
                show_alert=True,
            )
            return

        answer_task = asyncio.create_task(query.answer())

        turning_on = current["status"] != "on"
        now = datetime.now(timezone.utc)
        optimistic = []
        for r in rows:
            d = dict(r)
            if d["id"] == server_id:
                if turning_on:
                    d["status"] = "on"
                    d["updated_at"] = now
                    d["updated_by"] = actor
                else:
                    d["status"] = "off"
                    d["updated_at"] = None
                    d["updated_by"] = None
            optimistic.append(d)

        try:
            await _apply_board(app, pool, optimistic)
        except TelegramError as e:
            log.warning("Could not push optimistic board for %s: %s", server_id, e)

        try:
            await answer_task
        except TelegramError:
            pass

        try:
            saved = await set_server_state(pool, server_id, actor, turning_on)
        except Exception as e:
            log.error("Failed to save toggle for %s: %s", server_id, e)
            saved = None

        if saved is None:
            fresh = [dict(r) for r in await get_servers(pool)]
            await _apply_board(app, pool, fresh)
            return

        for d in app.bot_data.get("servers", []):
            if d["id"] == server_id:
                d["status"] = saved["status"]
                d["updated_at"] = saved["updated_at"]
                d["updated_by"] = saved["updated_by"]
                break


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


async def reset_all_servers(pool):
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE server_states SET status = 'off', updated_at = NULL, updated_by = NULL"
        )


async def daily_reset_loop(app, pool):
    while True:
        now = datetime.now(SGT)
        target = now.replace(hour=5, minute=0, second=0, microsecond=0)
        if now >= target:
            target += timedelta(days=1)
        await asyncio.sleep((target - now).total_seconds())
        log.info("Daily reset: setting all servers to free")
        await reset_all_servers(pool)
        await send_or_update_board(app, pool)


async def post_init(app: Application):
    pool = await get_pool()
    app.bot_data["pool"] = pool
    await seed(pool)
    await send_or_update_board(app, pool)
    asyncio.create_task(daily_reset_loop(app, pool))


def main():
    app = (
        Application.builder()
        .token(TOKEN)
        .post_init(post_init)
        .build()
    )
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("status", cmd_start))
    app.add_handler(CallbackQueryHandler(callback_toggle, pattern="^toggle:"))

    log.info("Starting polling...")
    app.run_polling(allowed_updates=["message", "callback_query"])


if __name__ == "__main__":
    threading.Thread(target=run_health_server, daemon=True).start()
    asyncio.set_event_loop(asyncio.new_event_loop())
    main()
