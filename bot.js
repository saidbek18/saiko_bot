const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");
const path = require("path");

// ---------- CONFIG ----------
const BOT_TOKEN = "7782418983:AAFw1FYb-ESFb-1abiSudFlzhukTAkylxFA"; // siz bergan token
const DATA_DIR = __dirname;
const ADMINS_FILE = path.join(DATA_DIR, "admins.json");
const CHANNELS_FILE = path.join(DATA_DIR, "channels.json");
const MOVIES_FILE = path.join(DATA_DIR, "movies.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN topilmadi. Tokenni BOT_TOKEN ga yozing.");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ---------- fayllarni yuklash/funksiyalari ----------
function readJSON(filePath, defaultValue) {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw || "null") || defaultValue;
  } catch (e) {
    console.error("JSON read error:", filePath, e);
    return defaultValue;
  }
}
function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.error("JSON write error:", filePath, e);
  }
}

let ADMINS = readJSON(ADMINS_FILE, []);
let CHANNELS = readJSON(CHANNELS_FILE, []);
let MOVIES = readJSON(MOVIES_FILE, []);
let USERS = readJSON(USERS_FILE, []);

// ensure arrays
ADMINS = Array.isArray(ADMINS) ? ADMINS : [];
CHANNELS = Array.isArray(CHANNELS) ? CHANNELS : [];
MOVIES = Array.isArray(MOVIES) ? MOVIES : [];
USERS = Array.isArray(USERS) ? USERS : [];

// ---------- helper funktsiyalar ----------
async function checkSubscription(ctx, userId = null) {
  // userId berilmasa ctx.from.id ishlatadi
  const uid = userId || ctx.from.id;
  const notSubscribed = [];
  for (const ch of CHANNELS) {
    try {
      // getChatMember dan xatolik chiqsa (masalan kanal noto'g'ri) ham notSubscribed ga qo'shish uchun catch qilamiz
      const res = await ctx.telegram.getChatMember(ch, uid);
      if (["left", "kicked"].includes(res.status)) {
        notSubscribed.push(ch);
      }
    } catch (e) {
      // kanalga murojaat qilolmadi — xavfsizlik uchun uni ham notSubscribed hisoblaymiz
      notSubscribed.push(ch);
    }
  }
  return notSubscribed;
}

function ensureUser(userId) {
  if (!USERS.includes(userId)) {
    USERS.push(userId);
    writeJSON(USERS_FILE, USERS);
  }
}

// ---------- Admin state machine ----------

const adminStates = {};

function startAdminFlow(adminId, mode) {
  adminStates[String(adminId)] = { mode, step: 0, data: {} };
}
function getAdminState(adminId) {
  return adminStates[String(adminId)] || null;
}
function clearAdminState(adminId) {
  delete adminStates[String(adminId)];
}

// ---------- Start and subscription flow ----------
bot.start(async (ctx) => {
  try {
    const notSubscribed = await checkSubscription(ctx);
    if (notSubscribed.length > 0) {
      // Inline tugma bilan kanallarga yo'l ko'rsatamiz
      return ctx.reply(
        "Botdan foydalanish uchun quyidagi kanallarga obuna bo‘ling:",
        Markup.inlineKeyboard([
          ...notSubscribed.map((ch) => [Markup.button.url(ch, `Obuna bo‘lish`)]),
          [Markup.button.callback("✅ Tekshirish", "check_subs")]
        ])
      );
    }

    // agar hamma kanalga obuna bo'lsa
    ensureUser(ctx.from.id);
    return ctx.reply(`Salom, ${ctx.from.first_name}!\n🎬 Kino kodini yuboring 👇`);
  } catch (e) {
    console.error("start xato:", e);
    return ctx.reply("Xatolik yuz berdi. Qayta /start buyrug'ini yuboring.");
  }
});

// Tekshirish callback
bot.action("check_subs", async (ctx) => {
  try {
    await ctx.answerCbQuery(); // yuklanish belgisi o'chadi
    const notSubscribed = await checkSubscription(ctx);
    if (notSubscribed.length > 0) {
      return ctx.editMessageText(
        "Hali hammasiga obuna bo‘lmadingiz:",
        Markup.inlineKeyboard([
          ...notSubscribed.map((ch) => [Markup.button.url(ch, `Obuna bo‘lish`)]),
          [Markup.button.callback("✅ Tekshirish", "check_subs")]
        ])
      );
    }
    // hammasi obuna bo'ldi
    ensureUser(ctx.from.id);
    try { await ctx.editMessageText("✅ Obuna tasdiqlandi!"); } catch (e) { /* message o'zgargan bo'lishi mumkin */ }
    return ctx.reply(`Salom, ${ctx.from.first_name}!\n🎬 Kino kodini yuboring 👇`);
  } catch (e) {
    console.error("check_subs xato:", e);
    return ctx.reply("Tekshirishda xatolik. Qayta urinib ko'ring.");
  }
});

// ---------- Admin command: /admin (faqat adminlarga) ----------
bot.command("admin", (ctx) => {
  const uid = String(ctx.from.id);
  if (!ADMINS.includes(uid)) return; // admin bo'lmasa hech nima qilmaymiz
  // Reply keyboard admin uchun
  ctx.reply(
    "Admin panel:",
    Markup.keyboard([["🎬 Kino qo‘shish", "📢 Reklama yuborish"], ["⛔ Bekor qilish"]])
      .resize()
  );
});

// ---------- Admin ishlari: Kino qo'shish ----------
bot.hears("🎬 Kino qo‘shish", (ctx) => {
  const uid = String(ctx.from.id);
  if (!ADMINS.includes(uid)) return;
  startAdminFlow(uid, "add_movie");
  ctx.reply("Kino videosini yuboring (video fayl yoki telegram file_id bilan). Bekor qilish uchun '⛔ Bekor qilish' -ni bosing.");
});

// Admin: Reklama
bot.hears("📢 Reklama yuborish", (ctx) => {
  const uid = String(ctx.from.id);
  if (!ADMINS.includes(uid)) return;
  startAdminFlow(uid, "add_ad");
  ctx.reply("Reklama uchun rasm yoki video yuboring. Bekor qilish uchun '⛔ Bekor qilish' -ni bosing.");
});

// Bekor qilish
bot.hears("⛔ Bekor qilish", (ctx) => {
  const uid = String(ctx.from.id);
  if (ADMINS.includes(uid)) {
    clearAdminState(uid);
    ctx.reply("✅ Admin jarayoni bekor qilindi.", Markup.removeKeyboard());
  } else {
    ctx.reply("Amal bekor qilindi.");
  }
});

// Media handler: photo / video (admin jarayoni uchun)
bot.on(["photo", "video", "document"], async (ctx) => {
  try {
    const uid = String(ctx.from.id);
    const state = getAdminState(uid);
    if (!state) return; // admin state yo'q bo'lsa, bu media normal foydalanuvchi yuborgan — e'tibor bermaymiz

    if (state.mode === "add_movie") {
      // admin kino qo'shish jarayoni — kutilayotgan steplarga qarab ishlaymiz
      // step 0: file kutilmoqda
      if (!state.data.file_id) {
        // photo -> video ham mumkin; document ham video bo'lishi mumkin
        if (ctx.message.video) {
          state.data.file_id = ctx.message.video.file_id;
          state.step = 1;
          ctx.reply("Kino kodi kiriting (masalan: 1 yoki ABC123).");
        } else if (ctx.message.document) {
          // document yoki video
          const mime = ctx.message.document.mime_type || "";
          if (mime.startsWith("video/") || mime === "application/octet-stream") {
            state.data.file_id = ctx.message.document.file_id;
            state.step = 1;
            ctx.reply("Kino kodi kiriting (masalan: 1 yoki ABC123).");
          } else {
            ctx.reply("Iltimos video fayl yuboring (mp4).");
          }
        } else if (ctx.message.photo) {
          // agar admin video sifatida rasm yuborgan bo'lsa — shuni file_id sifatida qabul qilmang, lekin agar video kerak bo'lsa ogohlantiring
          ctx.reply("Kino uchun video yuboring. Rasm emas.");
        } else {
          ctx.reply("Video yuboring iltimos.");
        }
        return;
      }
    }

    if (state.mode === "add_ad") {
      if (!state.data.file_id) {
        // reklama uchun rasm yoki video qabul qilamiz
        if (ctx.message.photo) {
          const lastPhoto = ctx.message.photo.pop();
          state.data.file_id = lastPhoto.file_id;
          state.data.type = "photo";
          state.step = 1;
          return ctx.reply("Reklama matnini kiriting:");
        } else if (ctx.message.video || ctx.message.document) {
          if (ctx.message.video) {
            state.data.file_id = ctx.message.video.file_id;
          } else {
            state.data.file_id = ctx.message.document.file_id;
          }
          state.data.type = "video";
          state.step = 1;
          return ctx.reply("Reklama matnini kiriting:");
        } else {
          return ctx.reply("Rasm yoki video yuboring iltimos.");
        }
      }
    }
  } catch (e) {
    console.error("media handler xato:", e);
    ctx.reply("Xatolik yuz berdi (media).");
  }
});

// Text handler: bu yerda ikki narsa bo'ladi:
// 1) Admin jarayonlari uchun matn qabul qilinadi (kod, caption, tugma matn|link)
// 2) Oddiy foydalanuvchi kino kodini yuboradi
bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();
  const uid = String(ctx.from.id);

  // Avval admin jarayonlarini tekshiramiz
  const state = getAdminState(uid);
  if (state && ADMINS.includes(uid)) {
    // Admin jarayoni bor — unga mos qadamlar
    try {
      if (state.mode === "add_movie") {
        // steps:
        // step 0 - kutilyapti (video kutiladi) => handled in media handler
        // step 1 - kino kodi kiritish
        // step 2 - kino matni (caption) kiritish
        if (state.step === 1 && !state.data.code) {
          // user yuborgan text kod bo'lishi kerak
          state.data.code = text;
          state.step = 2;
          return ctx.reply("Kinoga matn yozing (caption).");
        } else if (state.step === 2 && !state.data.text) {
          state.data.text = text;
          // tasdiqlash
          state.step = 3;
          return ctx.reply(
            `Kino ma'lumotlari:\nkod: ${state.data.code}\nmatn: ${state.data.text}\n\nTasdiqlaysizmi? (Ha / Yo'q)`
          );
        } else if (state.step === 3) {
          if (text.toLowerCase() === "ha" || text.toLowerCase() === "yes") {
            // saqlaymiz
            const movieExists = MOVIES.find((m) => m.code === state.data.code);
            if (movieExists) {
              // agar kod allaqachon bo'lsa - yangilash yoki rad etish
              // bu yerda biz yangilash qilamiz
              MOVIES = MOVIES.map((m) =>
                m.code === state.data.code ? { code: state.data.code, file_id: state.data.file_id, text: state.data.text } : m
              );
            } else {
              MOVIES.push({ code: state.data.code, file_id: state.data.file_id, text: state.data.text });
            }
            writeJSON(MOVIES_FILE, MOVIES);
            clearAdminState(uid);
            ctx.reply("✅ Kino muvaffaqiyatli saqlandi va movies.json ga yozildi.", Markup.removeKeyboard());
            return;
          } else {
            clearAdminState(uid);
            return ctx.reply("❌ Kino qo'shish bekor qilindi.", Markup.removeKeyboard());
          }
        } else {
          return ctx.reply("Iltimos ko'rsatmalarga amal qiling yoki '⛔ Bekor qilish' ni bosing.");
        }
      }

      // reklama jarayoni
      if (state.mode === "add_ad") {
        // step 1 - reklama matni
        // step 2 - tugma uchun matn|link
        // step 3 - tasdiqlash
        if (state.step === 1 && !state.data.caption) {
          state.data.caption = text;
          state.step = 2;
          return ctx.reply("Reklama tugmasi uchun matn va linkni yuboring (format: Tugma matni | https://link)");
        } else if (state.step === 2 && !state.data.button) {
          const parts = text.split("|");
          if (parts.length < 2) {
            return ctx.reply("Iltimos formatga rioya qiling: Tugma matni | https://link");
          }
          state.data.button = { text: parts[0].trim(), url: parts[1].trim() };
          state.step = 3;
          return ctx.reply(
            `Reklama tayyor:\nMatn: ${state.data.caption}\nTugma: ${state.data.button.text} -> ${state.data.button.url}\n\nTasdiqlaysizmi? (Ha / Yo'q)`
          );
        } else if (state.step === 3) {
          if (text.toLowerCase() === "ha" || text.toLowerCase() === "yes") {
            // reklama yuborish
            const allUsers = USERS.slice(); // nusxa
            for (const uidNum of allUsers) {
              try {
                if (state.data.type === "photo") {
                  await bot.telegram.sendPhoto(uidNum, state.data.file_id, {
                    caption: state.data.caption,
                    reply_markup: { inline_keyboard: [[{ text: state.data.button.text, url: state.data.button.url }]] }
                  });
                } else {
                  await bot.telegram.sendVideo(uidNum, state.data.file_id, {
                    caption: state.data.caption,
                    reply_markup: { inline_keyboard: [[{ text: state.data.button.text, url: state.data.button.url }]] }
                  });
                }
              } catch (e) {
                // yuborishda xatolik bo'lsa - log qiladi va davom etadi
                console.warn("Reklama yuborishda xato user:", uidNum, e.message);
              }
            }
            clearAdminState(uid);
            return ctx.reply("✅ Reklama barcha foydalanuvchilarga yuborildi.", Markup.removeKeyboard());
          } else {
            clearAdminState(uid);
            return ctx.reply("❌ Reklama yuborish bekor qilindi.", Markup.removeKeyboard());
          }
        } else {
          return ctx.reply("Iltimos ko'rsatmalarga amal qiling yoki '⛔ Bekor qilish' ni bosing.");
        }
      }
    } catch (e) {
      console.error("admin text flow xato:", e);
      clearAdminState(uid);
      return ctx.reply("Admin jarayonida xatolik yuz berdi. Boshlash uchun /admin ni yuboring.");
    }
  }

  // Agar admin flow bo'lmasa: oddiy foydalanuvchi kino qidiruvi
  try {
    // avval subscription tekshir
    const notSubscribed = await checkSubscription(ctx);
    if (notSubscribed.length > 0) {
      return ctx.reply(
        "Botdan foydalanish uchun quyidagi kanallarga obuna bo‘ling:",
        Markup.inlineKeyboard([
          ...notSubscribed.map((ch) => [Markup.button.url(ch, `Obuna bo‘lish`)]),
          [Markup.button.callback("✅ Tekshirish", "check_subs")]
        ])
      );
    }

    // agar obuna bo'lsa userni saqlaymiz
    ensureUser(ctx.from.id);

    // bu text - kino kodi bo'lishi kerak
    const code = text;
    const movie = MOVIES.find((m) => m.code === code);
    if (movie) {
      // file_id bilan video yuborish
      try {
        // video bo'lishi kerak - agar movies.json dagi file_id video bo'lmasa foydalanuvchi xatolik ko'radi
        await ctx.replyWithVideo(movie.file_id, { caption: movie.text });
      } catch (e) {
        // agar video yuborishda xato bo'lsa (masalan file_id eskirgan) userga xabar beramiz
        console.error("video yuborishda xato:", e);
        return ctx.reply("Kechirasiz, kino topildi lekin uni yuborishda xatolik yuz berdi.");
      }
    } else {
      return ctx.reply("❌ Bu kodda kino mavjud emas!");
    }
  } catch (e) {
    console.error("user text handler xato:", e);
    return ctx.reply("Xatolik yuz berdi. Keyinroq qayta urinib ko'ring.");
  }
});

// ---------- Qo'shimcha: adminga faqat ko'rinadigan buyruqlarni cheklash ----------
bot.use((ctx, next) => {
  // bu middleware barcha xabarlarni log qiladi — kerak bo'lsa olib tashlashingiz mumkin
  // console.log(`[${new Date().toISOString()}] ${ctx.from.username || ctx.from.id}: ${ctx.updateType}`);
  return next();
});

// ---------- Error handling va process signal ----------
bot.catch((err) => {
  console.error("Bot global xato:", err);
});

process.once("SIGINT", () => {
  console.log("SIGINT - bot to'xtatilyapti");
  bot.stop("SIGINT");
  process.exit(0);
});
process.once("SIGTERM", () => {
  console.log("SIGTERM - bot to'xtatilyapti");
  bot.stop("SIGTERM");
  process.exit(0);
});

// ---------- Launch ----------
(async () => {
  try {
    await bot.launch();
    console.log("Bot ishga tushdi ✅");
    console.log("Admins:", ADMINS);
    console.log("Channels:", CHANNELS);
  } catch (e) {
    console.error("Botni ishga tushirishda xato:", e);
  }
})();
