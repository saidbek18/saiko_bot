/************************************************************
 * Telegram Kino Bot — To'liq versiya
 ************************************************************/

// 1) Kutubxonalar
const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");
const path = require("path");
const express = require("express");

// 2) Bot sozlamalari
const BOT_TOKEN = process.env.BOT_TOKEN || "7782418983:AAFw1FYb-ESFb-1abiSudFlzhukTAkylxFA";
if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN topilmadi.");
  process.exit(1);
}
const bot = new Telegraf(BOT_TOKEN);

const app = express();
const PORT = process.env.PORT || 10000;
app.use(bot.webhookCallback("/secret-path"));

// Status sahifasi uchun route
app.get("/", (req, res) => {
  res.send("Bot ishlayapti! 🤖");
});

// Server ishga tushishi
app.listen(PORT, async () => {
  console.log(`Server ${PORT} portda ishlayapti ✅`);
  try {
    await bot.telegram.setWebhook(`https://saiko-bot.onrender.com/secret-path`);
    console.log("Webhook muvaffaqiyatli o‘rnatildi ✅");
  } catch (err) {
    console.error("Webhook o‘rnatishda xato ❌", err);
  }
});

// 3) Fayl yo'llari
const DATA_DIR = __dirname;
const ADMINS_FILE = path.join(DATA_DIR, "admins.json");
const CHANNELS_FILE = path.join(DATA_DIR, "channels.json");
const MOVIES_FILE = path.join(DATA_DIR, "movies.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const STATE_FILE = path.join(DATA_DIR, "state.json");

// 4) JSON helperlari
function readJSON(file, defVal) {
  try {
    if (!fs.existsSync(file)) return defVal;
    const raw = fs.readFileSync(file, "utf8");
    if (!raw.trim()) return defVal;
    return JSON.parse(raw);
  } catch (e) {
    console.error("JSON o'qishda xato:", file, e.message);
    return defVal;
  }
}

function writeJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (e) {
    console.error("JSON yozishda xato:", file, e.message);
    return false;
  }
}

// 5) Dastlabki ma'lumotlarni yuklash
let ADMINS = readJSON(ADMINS_FILE, ["8165064673"]);
let CHANNELS = readJSON(CHANNELS_FILE, ["@saikokino"]);
let MOVIES = readJSON(MOVIES_FILE, {});
let USERS = readJSON(USERS_FILE, {});
let STATE = readJSON(STATE_FILE, {});

// 6) Ma'lumotlarni normallashtirish
if (!Array.isArray(ADMINS)) ADMINS = [];
if (!Array.isArray(CHANNELS)) CHANNELS = [];
if (typeof MOVIES !== "object" || Array.isArray(MOVIES)) MOVIES = {};
if (typeof USERS !== "object" || Array.isArray(USERS)) USERS = {};
if (typeof STATE !== "object" || Array.isArray(STATE)) STATE = {};

// 6) Ma'lumotlarni normallashtirish (xavfsiz holat)
if (!Array.isArray(ADMINS)) ADMINS = [];
if (!Array.isArray(CHANNELS)) CHANNELS = [];
if (typeof MOVIES !== "object" || Array.isArray(MOVIES)) MOVIES = {};
if (typeof USERS !== "object" || Array.isArray(USERS)) USERS = {};
if (typeof STATE !== "object" || Array.isArray(STATE)) STATE = {};

// 7) Kichik util funktsiyalar
const isAdmin = (ctx) => ADMINS.includes(String(ctx.from?.id || ""));

function ensureUser(userId, defaults = {}) {
  const uid = String(userId);
  if (!USERS[uid]) {
    USERS[uid] = { subscribed: false, createdAt: Date.now(), ...defaults };
    writeJSON(USERS_FILE, USERS);
  }
  return USERS[uid];
}

function setUser(userId, patch) {
  const uid = String(userId);
  USERS[uid] = { ...(USERS[uid] || {}), ...patch };
  writeJSON(USERS_FILE, USERS);
  return USERS[uid];
}

// 8) Kanal tugmalari (inline)
function channelKeyboard() {
  const rows = CHANNELS.map((ch) => {
    const url = `https://t.me/${String(ch).replace("@", "")}`;
    return [Markup.button.url(String(ch), url)];
  });
  rows.push([Markup.button.callback("✅ Tekshirish", "check_subs")]);
  return Markup.inlineKeyboard(rows);
}

// 9) Obuna tekshirish (haqiqiy)
async function notSubscribedChannels(ctx, userId = null) {
  const uid = userId || ctx.from?.id;
  if (!uid) return CHANNELS.slice();
  const missing = [];
  for (const ch of CHANNELS) {
    try {
      const res = await ctx.telegram.getChatMember(ch, uid);
      const st = res?.status;
      if (!["member", "creator", "administrator"].includes(st)) missing.push(ch);
    } catch (e) {
      missing.push(ch);
    }
  }
  return missing;
}

// 10) Admin holati (state) boshqaruvi
function startState(adminId, payload) {
  STATE[String(adminId)] = { step: 0, mode: null, data: {}, ...payload };
  writeJSON(STATE_FILE, STATE);
}

function patchState(adminId, patch) {
  const uid = String(adminId);
  STATE[uid] = { ...(STATE[uid] || {}), ...patch };
  writeJSON(STATE_FILE, STATE);
  return STATE[uid];
}

function clearState(adminId) {
  delete STATE[String(adminId)];
  writeJSON(STATE_FILE, STATE);
}

// 11) /start — foydalanuvchini kutib olish va kanallar ro'yxatini berish
bot.start(async (ctx) => {
  try {
    const uid = String(ctx.from.id);
    ensureUser(uid);

    setUser(uid, { subscribed: false, first_name: ctx.from.first_name || "", username: ctx.from.username || "" });

    await ctx.reply(
      `Salom, ${ctx.from.first_name || "do'st"}!\n\n` +
      `Botdan foydalanish uchun quyidagi kanallarga obuna bo'ling, so'ng "✅ Tekshirish" tugmasini bosing.`,
      channelKeyboard()
    );

    if (isAdmin(ctx)) {
      await ctx.reply(
        "Admin panel:",
        Markup.keyboard([
          ["🎬 Kino qo'shish", "📢 Reklama yuborish"]
        ]).resize()
      );
    } else {
      await ctx.reply("🎬 Kino kodini yuborishingiz mumkin (obuna tasdiqlangach).", Markup.removeKeyboard());
    }
  } catch (e) {
    console.error("start error:", e);
    await ctx.reply("Xatolik yuz berdi. Keyinroq urinib ko'ring.");
  }
});

// 12) Tekshirish (callback orqali) — "✅ Tekshirish" tugmasi
bot.action("check_subs", async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const uid = String(ctx.from.id);
    ensureUser(uid);

    const missing = await notSubscribedChannels(ctx, uid);
    if (missing.length > 0) {
      const rows = missing.map((ch) => {
        const url = `https://t.me/${String(ch).replace("@", "")}`;
        return [Markup.button.url(`${ch} ga obuna bo'lish`, url)];
      });
      rows.push([Markup.button.callback("✅ Yana tekshirish", "check_subs")]);

      try {
        await ctx.editMessageText(
          "Hali hammasiga obuna bo'lmadingiz. Iltimos quyidagilarga a'zo bo'ling:",
          Markup.inlineKeyboard(rows)
        );
      } catch {
        await ctx.reply(
          "Hali hammasiga obuna bo'lmadingiz. Iltimos quyidagilarga a'zo bo'ling:",
          Markup.inlineKeyboard(rows)
        );
      }
      return;
    }

    setUser(uid, { subscribed: true });

    try { await ctx.editMessageText("✅ Obuna tasdiqlandi!"); } catch {}

    await ctx.reply(
      `✅ Obuna tasdiqlandi!\n\nSalom, *${ctx.from.first_name || ctx.from.username || "do'st"}* 👋\nEndi kino kodini yuboring (masalan: 1001).`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    console.error("check_subs error:", e);
    await ctx.reply("Tekshirishda xatolik. Keyinroq urinib ko'ring.");
  }
});

// 13) /check — fallback (agar foydalanuvchi slash bilan yozsa)
bot.command("check", async (ctx) => {
  try {
    const uid = String(ctx.from.id);
    ensureUser(uid);
    const missing = await notSubscribedChannels(ctx, uid);
    if (missing.length > 0) {
      return ctx.reply(
        "Hali ham obuna to'liq emas. Iltimos quyidagilarga a'zo bo'ling va yana /check yuboring:",
        channelKeyboard()
      );
    }

    setUser(uid, { subscribed: true });
    await ctx.reply(
      `✅ Obuna tasdiqlandi!\n\nSalom, *${ctx.from.first_name || ctx.from.username || "do'st"}* 👋\nEndi kino kodini yuboring (masalan: 1001).`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    console.error("/check error:", e);
    await ctx.reply("Xatolik yuz berdi. Keyinroq urinib ko'ring.");
  }
});

// 14) /admin — faqat adminlarga ko'rinadigan bosh menyu
bot.command("admin", async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.reply(
    "Admin panel:",
    Markup.keyboard([
      ["🎬 Kino qo'shish", "📢 Reklama yuborish"],
      ["📊 Statistika", "⚙️ Sozlamalar"],
      ["⛔ Bekor qilish"]
    ]).resize()
  );
});

// 15) Bekor qilish — har qanday admin jarayonini to'xtatadi
bot.hears("⛔ Bekor qilish", async (ctx) => {
  const uid = String(ctx.from.id);
  if (isAdmin(ctx)) {
    clearState(uid);
    await ctx.reply("✅ Admin jarayoni bekor qilindi.", Markup.removeKeyboard());
    await ctx.reply(
      "Admin panel:",
      Markup.keyboard([
        ["🎬 Kino qo'shish", "📢 Reklama yuborish"],
        ["📊 Statistika", "⚙️ Sozlamalar"],
        ["⛔ Bekor qilish"]
      ]).resize()
    );
  } else {
    await ctx.reply("Bekor qilindi.", Markup.removeKeyboard());
  }
});

// 16) Oddiy yordamchi komandalar
bot.command("help", async (ctx) => {
  await ctx.reply(
    "Yordam:\n" +
    "— /start — boshlash\n" +
    "— /check — obunani tekshirish\n" +
    "— Kino kodini yuboring: masalan, 1001\n" +
    (isAdmin(ctx) ? "— /admin — admin panel\n" : "")
  );
});

// 17) 🎬 Kino qo'shish tugmasi
bot.hears("🎬 Kino qo'shish", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("⛔ Siz admin emassiz!");

  startState(ctx.from.id, { mode: "add_movie", step: 1, data: {} });
  await ctx.reply("🎬 Kino uchun kod yuboring (masalan: 1001):");
});

// 18) 1-bosqich: kod qabul qilish
bot.on("text", async (ctx, next) => {
  const uid = String(ctx.from.id);
  const st = STATE[uid];

  if (!st || st.mode !== "add_movie" || st.step !== 1) return next();

  patchState(uid, { step: 2, data: { code: ctx.message.text.trim() } });
  return ctx.reply("📎 Kino videosini yuboring:");
});

// 19) 2-bosqich: video qabul qilish
bot.on("video", async (ctx, next) => {
  const uid = String(ctx.from.id);
  const st = STATE[uid];

  if (!st || st.mode !== "add_movie" || st.step !== 2) return next();

  patchState(uid, { step: 3, data: { ...st.data, file_id: ctx.message.video.file_id } });
  return ctx.reply("✍️ Kino matnini yuboring:");
});

// 20) 3-bosqich: caption qabul qilish va saqlash
bot.on("text", async (ctx, next) => {
  const uid = String(ctx.from.id);
  const st = STATE[uid];

  if (!st || st.mode !== "add_movie" || st.step !== 3) return next();

  const caption = ctx.message.text;
  const { code, file_id } = st.data;

  MOVIES[code] = { file_id, caption };
  writeJSON(MOVIES_FILE, MOVIES);

  clearState(uid);

  return ctx.reply(
    `✅ Kino qo'shildi!\n\n📌 Kod: ${code}\n🎬 Matn: ${caption}`
  );
});

// 21) === Reklama yuborish ===
bot.hears("📢 Reklama yuborish", async (ctx) => {
  if (!isAdmin(ctx)) return;
  startState(ctx.from.id, { mode: "send_ads", step: 1, data: {} });
  await ctx.reply("📢 Reklama uchun rasm yuboring yoki /skip bu bosqichni o'tkazing.");
});

// 22) 1-bosqich: Rasm olish yoki skip
bot.on("photo", async (ctx, next) => {
  const uid = String(ctx.from.id);
  const st = STATE[uid];
  if (!st || st.mode !== "send_ads" || st.step !== 1) return next();

  const file_id = ctx.message.photo.pop().file_id;
  patchState(uid, { step: 2, data: { photo: file_id } });
  return ctx.reply("✅ Rasm qabul qilindi.\n\nEndi reklama matnini yuboring:");
});

bot.command("skip", async (ctx) => {
  const uid = String(ctx.from.id);
  const st = STATE[uid];
  if (!st || st.mode !== "send_ads" || st.step !== 1) return;
  patchState(uid, { step: 2, data: {} });
  return ctx.reply("⏩ Rasm bosqichi o'tkazildi.\n\nEndi reklama matnini yuboring:");
});

// 23) 2-bosqich: Matn olish
bot.on("text", async (ctx, next) => {
  const uid = String(ctx.from.id);
  const st = STATE[uid];
  if (!st || st.mode !== "send_ads" || st.step !== 2) return next();

  patchState(uid, { step: 3, data: { ...st.data, text: ctx.message.text } });
  return ctx.reply("✍️ Endi tugma uchun nom kiriting (masalan: Obuna bo'lish).");
});

// 24) 3-bosqich: Tugma nomi
bot.on("text", async (ctx, next) => {
  const uid = String(ctx.from.id);
  const st = STATE[uid];
  if (!st || st.mode !== "send_ads" || st.step !== 3) return next();

  patchState(uid, { step: 4, data: { ...st.data, btn_text: ctx.message.text } });
  return ctx.reply("🔗 Endi tugma uchun link yuboring (masalan: https://t.me/saikostars).");
});

// 25) 4-bosqich: Tugma linki va reklama yuborish
bot.on("text", async (ctx, next) => {
  const uid = String(ctx.from.id);
  const st = STATE[uid];
  if (!st || st.mode !== "send_ads" || st.step !== 4) return next();

  const btn_url = ctx.message.text;
  const { text, photo, btn_text } = st.data;

  const keyboard = Markup.inlineKeyboard([[Markup.button.url(btn_text, btn_url)]]);

  const allUsers = Object.keys(USERS);
  let sent = 0;

  for (const u of allUsers) {
    try {
      if (photo) {
        await bot.telegram.sendPhoto(u, photo, { caption: text, reply_markup: keyboard.reply_markup });
      } else {
        await bot.telegram.sendMessage(u, text, keyboard);
      }
      sent++;
    } catch (e) {
      console.log(`❌ ${u} ga yuborilmadi:`, e.message);
    }
  }

  clearState(uid);
  return ctx.reply(`✅ Reklama yuborildi!\n📨 Yuborilganlar: ${sent} ta foydalanuvchi`);
});

// 26) Kino kodini yuborgan foydalanuvchi
bot.on("text", async (ctx, next) => {
  try {
    const uid = String(ctx.from.id);
    const user = ensureUser(uid);

    const st = STATE[uid];
    if (st && st.mode) return next();

    if (!user.subscribed) {
      return ctx.reply("❌ Siz hali kanallarga obuna bo'lmadingiz.\nIltimos, /start buyrug'ini qayta yuboring.");
    }

    const code = ctx.message.text.trim();

    if (!MOVIES[code]) {
      return ctx.reply("❌ Bunday kodli kino topilmadi.\nIltimos boshqa kod kiriting.");
    }

    const movie = MOVIES[code];

    if (movie.file_id) {
      await ctx.replyWithVideo(movie.file_id, {
        caption: movie.caption || `🎬 Kod: ${code}`
      });
    } else {
      await ctx.reply("❌ Bu kodli kino fayli saqlanmagan.");
    }
  } catch (e) {
    console.error("kino chiqarishda xato:", e);
    await ctx.reply("❌ Kino chiqarishda xatolik yuz berdi.");
  }
});

// 27) /kinolar komandasi orqali barcha kinolarni ko'rish
bot.command("kinolar", async (ctx) => {
  try {
    const movieCodes = Object.keys(MOVIES);
    if (movieCodes.length === 0) {
      return ctx.reply("❌ Hozircha kino qo'shilmagan.");
    }

    let text = "🎬 *Kinolar ro'yxati:*\n\n";
    movieCodes.forEach((code, index) => {
      const movie = MOVIES[code];
      text += `${index + 1}. Kod: \`${code}\`\nMatn: ${movie.caption || "Matnsiz"}\n\n`;
    });

    await ctx.replyWithMarkdown(text);
  } catch (err) {
    console.error("Kinolarni chiqarishda xato:", err);
    await ctx.reply("❌ Xatolik yuz berdi, keyinroq urinib ko'ring.");
  }
});

// 28) /kino [kod] orqali bitta kinoni chiqarish
bot.command("kino", async (ctx) => {
  try {
    const args = ctx.message.text.split(" ");
    if (args.length < 2) {
      return ctx.reply("ℹ️ Iltimos kino kodini kiriting. Masalan:\n`/kino 1001`", { parse_mode: "Markdown" });
    }

    const code = args[1];
    const movie = MOVIES[code];

    if (!movie) {
      return ctx.reply("❌ Bunday kodli kino topilmadi.");
    }

    if (movie.file_id) {
      await ctx.replyWithVideo(movie.file_id, {
        caption: movie.caption || `🎬 Kod: ${code}`
      });
    } else {
      await ctx.reply("❌ Bu kodli kino fayli saqlanmagan.");
    }
  } catch (err) {
    console.error("Kino topishda xato:", err);
    await ctx.reply("❌ Kino topishda xatolik yuz berdi.");
  }
});

// 29) Xatolarni tutish
bot.catch((err, ctx) => {
  console.error(`Botda xato:`, err);
});

// 30) Webhook server (Render uchun)
const express = require("express");
const app = express();

app.use(bot.webhookCallback("/secret-path"));

// Status sahifasi uchun route
app.get("/", (req, res) => {
  res.send("Bot ishlayapti! 🤖");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, async () => {
  console.log(`Server ${PORT} portda ishlayapti ✅`);
  try {
    await bot.telegram.setWebhook(`https://saiko-bot.onrender.com/secret-path`);
    console.log("Webhook muvaffaqiyatli o‘rnatildi ✅");
  } catch (err) {
    console.error("Webhook o‘rnatishda xato ❌", err);
  }
});



// 31) Graceful stop (server o'chirilganda botni to'xtatish)
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
