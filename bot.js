/************************************************************
 * Telegram Kino Bot — QISM 1/5 (≈100 qator)
 * Poydevor: importlar, fayllar, util funklar, boshlang‘ich yuklash
 ************************************************************/

// 1) Kutubxonalar
const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");
const path = require("path");

// 2) Config (TOKENNI ALMASHTIR!)
const BOT_TOKEN = "7782418983:AAFw1FYb-ESFb-1abiSudFlzhukTAkylxFA"; // <-- tokeningiz
if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN topilmadi. Iltimos kodga token yozing.");
  process.exit(1);
}
const bot = new Telegraf(BOT_TOKEN);

// 3) Fayl yo'llari
const DATA_DIR = __dirname;
const ADMINS_FILE   = path.join(DATA_DIR, "admins.json");
const CHANNELS_FILE = path.join(DATA_DIR, "channels.json");
const MOVIES_FILE   = path.join(DATA_DIR, "movies.json");
const USERS_FILE    = path.join(DATA_DIR, "users.json");
const STATE_FILE    = path.join(DATA_DIR, "state.json");   // adminlar uchun jarayon holati

// 4) JSON helperlari
function readJSON(file, defVal) {
  try {
    if (!fs.existsSync(file)) return defVal;
    const raw = fs.readFileSync(file, "utf8");
    if (!raw.trim()) return defVal;
    return JSON.parse(raw);
  } catch (e) {
    console.error("JSON o‘qishda xato:", file, e.message);
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
let ADMINS   = readJSON(ADMINS_FILE,   ["8165064673"]);   // default admin ID (string)
let CHANNELS = readJSON(CHANNELS_FILE, ["@saikostars"]);  // kanal usernamelari
let MOVIES   = readJSON(MOVIES_FILE,   {});               // { "kod": "file_id" | {file_id, caption} }
let USERS    = readJSON(USERS_FILE,    {});               // { userId: { subscribed: bool, ... } }
let STATE    = readJSON(STATE_FILE,    {});               // { adminId: { mode, step, ... } }

// 6) Ma'lumotlarni normallashtirish (xavfsiz holat)
if (!Array.isArray(ADMINS)) ADMINS = [];
if (!Array.isArray(CHANNELS)) CHANNELS = [];
if (typeof MOVIES !== "object" || Array.isArray(MOVIES)) MOVIES = {};
if (typeof USERS  !== "object" || Array.isArray(USERS))  USERS  = {};
if (typeof STATE  !== "object" || Array.isArray(STATE))  STATE  = {};

// 7) Kichik util funktsiyalar
const isAdmin = (ctx) => ADMINS.includes(String(ctx.from?.id || "")));

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
      // Kanal yopiq yoki bot a'zo emas — tekshira olmadik, xavfsizlik uchun missingga qo‘shamiz
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

// ——— QISM 1 yakunlandi ———
/************************************************************
 * Telegram Kino Bot — QISM 2/5 (≈100 qator)
 * Start, obuna tekshirish, admin menyu, bekor qilish
 ************************************************************/

// 11) /start — foydalanuvchini kutib olish va kanallar ro‘yxatini berish
bot.start(async (ctx) => {
  try {
    const uid = String(ctx.from.id);
    ensureUser(uid);

    // Foydalanuvchini “subscribed: false” qilib qo‘yamiz (tekshirguncha)
    setUser(uid, { subscribed: false, first_name: ctx.from.first_name || "", username: ctx.from.username || "" });

    // Kanal tugmalari bilan chaqiramiz
    await ctx.reply(
      `Salom, ${ctx.from.first_name || "do‘st"}!\n\n` +
      `Botdan foydalanish uchun quyidagi kanallarga obuna bo‘ling, so‘ng “✅ Tekshirish” tugmasini bosing.`,
      channelKeyboard()
    );

    // Agar admin bo‘lsa, admin menyusini reply keyboard qilib beramiz
    if (isAdmin(ctx)) {
      await ctx.reply(
        "Admin panel:",
        Markup.keyboard([
          ["🎬 Kino qo‘shish", "📢 Reklama yuborish"],
          ["📊 Statistika", "⚙️ Sozlamalar"],
          ["⛔ Bekor qilish"]
        ]).resize()
      );
    } else {
      // Oddiy foydalanuvchi uchun reply keyboardni olib tashlaymiz — faqat inline ishlaydi
      await ctx.reply("🎬 Kino kodini yuborishingiz mumkin (obuna tasdiqlangach).", Markup.removeKeyboard());
    }
  } catch (e) {
    console.error("start error:", e);
    await ctx.reply("Xatolik yuz berdi. Keyinroq urinib ko‘ring.");
  }
});

// 12) Tekshirish (callback orqali) — “✅ Tekshirish” tugmasi
bot.action("check_subs", async (ctx) => {
  try {
    await ctx.answerCbQuery(); // loading tugadi
    const uid = String(ctx.from.id);
    ensureUser(uid);

    const missing = await notSubscribedChannels(ctx, uid);
    if (missing.length > 0) {
      // Hali hammasiga obuna bo‘lmagan
      const rows = missing.map((ch) => {
        const url = `https://t.me/${String(ch).replace("@", "")}`;
        return [Markup.button.url(`${ch} ga obuna bo‘lish`, url)];
      });
      rows.push([Markup.button.callback("✅ Yana tekshirish", "check_subs")]);

      // oldingi xabarni yangilashga urinamiz
      try {
        await ctx.editMessageText(
          "Hali hammasiga obuna bo‘lmadingiz. Iltimos quyidagilarga a‘zo bo‘ling:",
          Markup.inlineKeyboard(rows)
        );
      } catch {
        await ctx.reply(
          "Hali hammasiga obuna bo‘lmadingiz. Iltimos quyidagilarga a‘zo bo‘ling:",
          Markup.inlineKeyboard(rows)
        );
      }
      return;
    }

    // Obuna to‘liq — foydalanuvchini “subscribed: true” qilamiz
    setUser(uid, { subscribed: true });

    // Oldingi xabarni tasdiqlashga harakat qilamiz
    try { await ctx.editMessageText("✅ Obuna tasdiqlandi!"); } catch {}

    // Endi kino kodini so‘raymiz
    await ctx.reply("✅ Obuna tasdiqlandi!\n\nEndi kino kodini yuboring (masalan: 1001).");
  } catch (e) {
    console.error("check_subs error:", e);
    await ctx.reply("Tekshirishda xatolik. Keyinroq urinib ko‘ring.");
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
        "Hali ham obuna to‘liq emas. Iltimos quyidagilarga a‘zo bo‘ling va yana /check yuboring:",
        channelKeyboard()
      );
    }
    setUser(uid, { subscribed: true });
    await ctx.reply("✅ Obuna tasdiqlandi! Endi kino kodini yuboring.");
  } catch (e) {
    console.error("/check error:", e);
    await ctx.reply("Xatolik yuz berdi. Keyinroq urinib ko‘ring.");
  }
});

// 14) /admin — faqat adminlarga ko‘rinadigan bosh menyu
bot.command("admin", async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.reply(
    "Admin panel:",
    Markup.keyboard([
      ["🎬 Kino qo‘shish", "📢 Reklama yuborish"],
      ["📊 Statistika", "⚙️ Sozlamalar"],
      ["⛔ Bekor qilish"]
    ]).resize()
  );
});

// 15) Bekor qilish — har qanday admin jarayonini to‘xtatadi
bot.hears("⛔ Bekor qilish", async (ctx) => {
  const uid = String(ctx.from.id);
  if (isAdmin(ctx)) {
    clearState(uid);
    await ctx.reply("✅ Admin jarayoni bekor qilindi.", Markup.removeKeyboard());
    // Admin menyusini qaytadan beramiz
    await ctx.reply(
      "Admin panel:",
      Markup.keyboard([
        ["🎬 Kino qo‘shish", "📢 Reklama yuborish"],
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

// 17) Har qanday xato uchun global catcher (qoladi)
bot.catch((err) => {
  console.error("Bot xato:", err);
});

// ——— QISM 2 yakunlandi ———
// ====== 3-QISM ======

/************************************************************
 * Telegram Kino Bot — QISM 3/5 (≈100 qator)
 * Admin: Kino qo‘shish, ro‘yxatlash, reklama
 ************************************************************/

// 18) Admin: "🎬 Kino qo‘shish"
bot.hears("🎬 Kino qo‘shish", async (ctx) => {
  if (!isAdmin(ctx)) return;
  startState(ctx.from.id, { mode: "add_movie", step: 1 });
  await ctx.reply("🎬 Kino kodi va fayl yuboring.\n\nMasalan: 1001 (kodni yuboring).");
});

// 19) Admin: Kino qo‘shish — kodni yuborish
bot.on("text", async (ctx, next) => {
  const uid = String(ctx.from.id);
  const st = STATE[uid];

  if (!st || st.mode !== "add_movie") return next();

  if (st.step === 1) {
    const code = ctx.message.text.trim();
    if (MOVIES[code]) {
      return ctx.reply("❌ Bu kod allaqachon mavjud. Boshqa kod kiriting.");
    }
    patchState(uid, { step: 2, data: { code } });
    return ctx.reply("✅ Kod qabul qilindi.\n\nEndi kino faylini yuboring (video, document, photo).");
  }

  return next();
});

// 20) Admin: Kino faylini qabul qilish
bot.on(["video", "document", "photo"], async (ctx, next) => {
  const uid = String(ctx.from.id);
  const st = STATE[uid];

  if (!st || st.mode !== "add_movie" || st.step !== 2) return next();

  const code = st.data.code;
  let file_id = null;

  if (ctx.message.video) file_id = ctx.message.video.file_id;
  else if (ctx.message.document) file_id = ctx.message.document.file_id;
  else if (ctx.message.photo) file_id = ctx.message.photo.pop().file_id;

  if (!file_id) return ctx.reply("❌ Faylni aniqlab bo‘lmadi. Video, document yoki photo yuboring.");

  MOVIES[code] = { file_id, caption: ctx.message.caption || "" };
  writeJSON(MOVIES_FILE, MOVIES);

  clearState(uid);

  await ctx.reply(`✅ Kino muvaffaqiyatli qo‘shildi!\n📌 Kod: ${code}`);
});

// 21) Admin: "📂 Kinolar ro‘yxati"
bot.hears("📂 Kinolar ro‘yxati", async (ctx) => {
  if (!isAdmin(ctx)) return;
  const codes = Object.keys(MOVIES);
  if (codes.length === 0) return ctx.reply("❌ Hozircha kino yo‘q.");

  let text = "🎬 Kinolar ro‘yxati:\n\n";
  codes.forEach((c, i) => {
    text += `${i + 1}) Kod: <code>${c}</code>\n`;
  });

  await ctx.reply(text, { parse_mode: "HTML" });
});

// 22) Admin: "📢 Reklama yuborish"
bot.hears("📢 Reklama yuborish", async (ctx) => {
  if (!isAdmin(ctx)) return;
  startState(ctx.from.id, { mode: "send_ads", step: 1 });
  await ctx.reply("📢 Reklama matnini yuboring:");
});

// 23) Admin: Reklama matnini qabul qilish va jo‘natish
bot.on("text", async (ctx, next) => {
  const uid = String(ctx.from.id);
  const st = STATE[uid];

  if (!st || st.mode !== "send_ads") return next();

  const msg = ctx.message.text;
  const allUsers = Object.keys(USERS);

  let sent = 0;
  for (const u of allUsers) {
    try {
      await bot.telegram.sendMessage(u, `📢 Reklama:\n\n${msg}`);
      sent++;
    } catch (e) {
      console.log(`❌ ${u} ga yuborilmadi:`, e.message);
    }
  }

  clearState(uid);

  await ctx.reply(`✅ Reklama yuborildi!\n📨 Yuborilganlar: ${sent} ta foydalanuvchi`);
});

// ——— QISM 3 yakunlandi ———
// 4-QISM: Kinolarni ko‘rish va foydalanuvchiga yuborish

// Kino ro‘yxatini olish
bot.command("kinolar", (ctx) => {
  let movies = fs.existsSync("movies.json") ? JSON.parse(fs.readFileSync("movies.json")) : [];

  if (movies.length === 0) {
    return ctx.reply("📂 Hozircha kinolar qo‘shilmagan.");
  }

  let buttons = movies.map((movie, index) => [
    Markup.button.callback(movie.title, `movie_${index}`)
  ]);

  ctx.reply("🎬 Kinolar ro‘yxati:", Markup.inlineKeyboard(buttons));
});

// Tanlangan kinoni chiqarish
bot.action(/movie_(\d+)/, (ctx) => {
  let movies = fs.existsSync("movies.json") ? JSON.parse(fs.readFileSync("movies.json")) : [];
  let index = parseInt(ctx.match[1]);

  if (!movies[index]) return ctx.reply("❌ Kino topilmadi.");

  let movie = movies[index];
  ctx.replyWithPhoto(movie.image, {
    caption: `🎬 *${movie.title}*\n📌 ${movie.description}\n\n👉 [Ko‘rish](${movie.link})`,
    parse_mode: "Markdown"
  });
});
// ===================== 5-QISM: Kino ro‘yxatini chiqarish =====================

// /kinolar komandasi orqali barcha kinolarni ko‘rish
bot.command("kinolar", (ctx) => {
  try {
    if (movies.length === 0) {
      return ctx.reply("❌ Hozircha kino qo‘shilmagan.");
    }

    let text = "🎬 *Kinolar ro‘yxati:*\n\n";
    movies.forEach((movie, index) => {
      text += `${index + 1}. ${movie.title}\nKod: \`${movie.code}\`\n🎥 Link: ${movie.url}\n\n`;
    });

    ctx.replyWithMarkdown(text);
  } catch (err) {
    console.error("Kinolarni chiqarishda xato:", err);
    ctx.reply("❌ Xatolik yuz berdi, keyinroq urinib ko‘ring.");
  }
});

// /kino [kod] orqali bitta kinoni chiqarish
bot.command("kino", (ctx) => {
  try {
    const args = ctx.message.text.split(" ");
    if (args.length < 2) {
      return ctx.reply("ℹ️ Iltimos kino kodini kiriting. Masalan:\n`/kino A123`", { parse_mode: "Markdown" });
    }

    const code = args[1];
    const movie = movies.find((m) => m.code === code);

    if (!movie) {
      return ctx.reply("❌ Bunday kodli kino topilmadi.");
    }

    ctx.reply(
      `🎬 *${movie.title}*\n📺 Link: ${movie.url}`,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    console.error("Kino topishda xato:", err);
    ctx.reply("❌ Kino topishda xatolik yuz berdi.");
  }
});
// 6-qism: Botni tugatish va ishga tushirish

// Xatolarni tutish
bot.catch((err, ctx) => {
  console.error(`Botda xato:`, err);
});

// Botni ishga tushirish
bot.launch()
  .then(() => {
    console.log("Bot muvaffaqiyatli ishga tushdi ✅");
  })
  .catch((err) => {
    console.error("Botni ishga tushirishda xato ❌", err);
  });

// Graceful stop (server o‘chirilganda botni to‘xtatish)
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
