import { startPolling } from "./bot";

const required = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "DATABASE_URL"];
for (const env of required) {
  if (!process.env[env]) {
    console.error(`Missing required env: ${env}`);
    process.exit(1);
  }
}

startPolling().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
