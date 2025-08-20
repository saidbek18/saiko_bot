const { Telegraf, Markup } = require("telegraf");
const { MongoClient } = require("mongodb");
const fs = require("fs");
const path = require("path");

// MongoDB ulanish sozlamalari
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const DB_NAME = "telegram_kino_bot";
const COLLECTIONS = {
  ADMINS: "admins",
  CHANNELS: "channels",
  MOVIES: "movies",
  USERS: "users",
  STATE: "state"
};

// MongoDB client
let client;
let db;

// MongoDB ga ulanish
async function connectDB() {
  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DB_NAME);
    console.log("✅ MongoDB ga muvaffaqiyatli ulandik");
    
    // Indexlarni yaratish
    await db.collection(COLLECTIONS.USERS).createIndex({ userId: 1 }, { unique: true });
    await db.collection(COLLECTIONS.MOVIES).createIndex({ code: 1 }, { unique: true });
    await db.collection(COLLECTIONS.STATE).createIndex({ adminId: 1 }, { unique: true });
    
    return true;
  } catch (error) {
    console.error("❌ MongoDB ga ulanishda xato:", error);
    return false;
  }
}

// JSON fayllardan MongoDB ga ma'lumotlarni ko'chirish
async function migrateDataFromJSON() {
  try {
    console.log("📦 JSON ma'lumotlarini MongoDB ga ko'chiramiz...");
    
    // JSON fayllarni o'qiymiz
    const DATA_DIR = __dirname;
    const ADMINS_FILE = path.join(DATA_DIR, "admins.json");
    const CHANNELS_FILE = path.join(DATA_DIR, "channels.json");
    const MOVIES_FILE = path.join(DATA_DIR, "movies.json");
    const USERS_FILE = path.join(DATA_DIR, "users.json");
    const STATE_FILE = path.join(DATA_DIR, "state.json");
    
    function readJSON(file, defVal) {
      try {
        if (!fs.existsSync(file)) return defVal;
        const raw = fs.readFileSync(file, "utf8");
        if (!raw.trim()) return defVal;
        return JSON.parse(raw);
      } catch (e) {
        return defVal;
      }
    }
    
    const adminsData = readJSON(ADMINS_FILE, ["8165064673"]);
    const channelsData = readJSON(CHANNELS_FILE, ["@saikostars"]);
    const moviesData = readJSON(MOVIES_FILE, {});
    const usersData = readJSON(USERS_FILE, {});
    const stateData = readJSON(STATE_FILE, {});
    
    // Admins ma'lumotlarini ko'chiramiz
    if (adminsData.length > 0) {
      const admins = adminsData.map(userId => ({ userId }));
      await db.collection(COLLECTIONS.ADMINS).deleteMany({});
      await db.collection(COLLECTIONS.ADMINS).insertMany(admins);
      console.log(`✅ ${admins.length} ta admin ko'chirildi`);
    }
    
    // Channels ma'lumotlarini ko'chiramiz
    if (channelsData.length > 0) {
      const channels = channelsData.map(username => ({ username }));
      await db.collection(COLLECTIONS.CHANNELS).deleteMany({});
      await db.collection(COLLECTIONS.CHANNELS).insertMany(channels);
      console.log(`✅ ${channels.length} ta kanal ko'chirildi`);
    }
    
    // Movies ma'lumotlarini ko'chiramiz
    if (Object.keys(moviesData).length > 0) {
      const movies = Object.entries(moviesData).map(([code, data]) => ({
        code,
        file_id: data.file_id,
        caption: data.caption,
        addedAt: new Date()
      }));
      await db.collection(COLLECTIONS.MOVIES).deleteMany({});
      await db.collection(COLLECTIONS.MOVIES).insertMany(movies);
      console.log(`✅ ${movies.length} ta kino ko'chirildi`);
    }
    
    // Users ma'lumotlarini ko'chiramiz
    if (Object.keys(usersData).length > 0) {
      const users = Object.entries(usersData).map(([userId, data]) => ({
        userId,
        ...data
      }));
      await db.collection(COLLECTIONS.USERS).deleteMany({});
      await db.collection(COLLECTIONS.USERS).insertMany(users);
      console.log(`✅ ${users.length} ta foydalanuvchi ko'chirildi`);
    }
    
    // State ma'lumotlarini ko'chiramiz
    if (Object.keys(stateData).length > 0) {
      const states = Object.entries(stateData).map(([adminId, data]) => ({
        adminId,
        ...data
      }));
      await db.collection(COLLECTIONS.STATE).deleteMany({});
      await db.collection(COLLECTIONS.STATE).insertMany(states);
      console.log(`✅ ${states.length} ta holat ko'chirildi`);
    }
    
    console.log("✅ Barcha ma'lumotlar MongoDB ga muvaffaqiyatli ko'chirildi!");
    
  } catch (error) {
    console.error("❌ Ma'lumotlarni ko'chirishda xato:", error);
  }
}

// MongoDB helper funksiyalari
async function findOne(collection, query) {
  try {
    return await db.collection(collection).findOne(query);
  } catch (error) {
    console.error(`MongoDB findOne xatosi (${collection}):`, error);
    return null;
  }
}

async function find(collection, query = {}) {
  try {
    return await db.collection(collection).find(query).toArray();
  } catch (error) {
    console.error(`MongoDB find xatosi (${collection}):`, error);
    return [];
  }
}

async function insertOne(collection, data) {
  try {
    const result = await db.collection(collection).insertOne(data);
    return result.insertedId;
  } catch (error) {
    console.error(`MongoDB insertOne xatosi (${collection}):`, error);
    return null;
  }
}

async function updateOne(collection, query, update, options = {}) {
  try {
    const result = await db.collection(collection).updateOne(query, update, options);
    return result.modifiedCount;
  } catch (error) {
    console.error(`MongoDB updateOne xatosi (${collection}):`, error);
    return 0;
  }
}

async function deleteOne(collection, query) {
  try {
    const result = await db.collection(collection).deleteOne(query);
    return result.deletedCount;
  } catch (error) {
    console.error(`MongoDB deleteOne xatosi (${collection}):`, error);
    return 0;
  }
}

// Global o'zgaruvchilar
let ADMINS = [];
let CHANNELS = [];
let MOVIES = {};
let USERS = {};
let STATE = {};

// Ma'lumotlarni yangilash funksiyasi
async function refreshData() {
  try {
    const admins = await find(COLLECTIONS.ADMINS);
    ADMINS = admins.map(admin => admin.userId);
    
    const channels = await find(COLLECTIONS.CHANNELS);
    CHANNELS = channels.map(channel => channel.username);
    
    const movies = await find(COLLECTIONS.MOVIES);
    MOVIES = {};
    movies.forEach(movie => {
      MOVIES[movie.code] = {
        file_id: movie.file_id,
        caption: movie.caption
      };
    });
    
    const users = await find(COLLECTIONS.USERS);
    USERS = {};
    users.forEach(user => {
      USERS[user.userId] = user;
    });
    
    const states = await find(COLLECTIONS.STATE);
    STATE = {};
    states.forEach(state => {
      STATE[state.adminId] = state;
    });
    
  } catch (error) {
    console.error("Ma'lumotlarni yangilashda xato:", error);
  }
}

// Bot tokeni
const BOT_TOKEN = process.env.BOT_TOKEN || "7782418983:AAFw1FYb-ESFb-1abiSudFlzhukTAkylxFA";
if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN topilmadi. Iltimos kodga token yozing.");
  process.exit(1);
}
const bot = new Telegraf(BOT_TOKEN);

// Util funksiyalar
const isAdmin = (ctx) => ADMINS.includes(String(ctx.from?.id || ""));

async function ensureUser(userId, defaults = {}) {
  const uid = String(userId);
  let user = await findOne(COLLECTIONS.USERS, { userId: uid });
  
  if (!user) {
    user = { 
      userId: uid, 
      subscribed: false, 
      createdAt: new Date(), 
      ...defaults 
    };
    await insertOne(COLLECTIONS.USERS, user);
    await refreshData();
  }
  
  return user;
}

async function setUser(userId, patch) {
  const uid = String(userId);
  await updateOne(
    COLLECTIONS.USERS, 
    { userId: uid }, 
    { $set: patch }, 
    { upsert: true }
  );
  await refreshData();
  return await findOne(COLLECTIONS.USERS, { userId: uid });
}

function channelKeyboard() {
  const rows = CHANNELS.map((ch) => {
    const url = `https://t.me/${String(ch).replace("@", "")}`;
    return [Markup.button.url(String(ch), url)];
  });
  rows.push([Markup.button.callback("✅ Tekshirish", "check_subs")]);
  return Markup.inlineKeyboard(rows);
}

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

// Admin holati boshqaruvi
async function startState(adminId, payload) {
  const uid = String(adminId);
  await updateOne(
    COLLECTIONS.STATE,
    { adminId: uid },
    { $set: { step: 0, mode: null, data: {}, ...payload } },
    { upsert: true }
  );
  await refreshData();
}

async function patchState(adminId, patch) {
  const uid = String(adminId);
  await updateOne(
    COLLECTIONS.STATE,
    { adminId: uid },
    { $set: patch },
    { upsert: true }
  );
  await refreshData();
  return await findOne(COLLECTIONS.STATE, { adminId: uid });
}

async function clearState(adminId) {
  const uid = String(adminId);
  await deleteOne(COLLECTIONS.STATE, { adminId: uid });
  await refreshData();
}

// Start komandasi
bot.start(async (ctx) => {
  try {
    const uid = String(ctx.from.id);
    await ensureUser(uid);

    await setUser(uid, { subscribed: false, first_name: ctx.from.first_name || "", username: ctx.from.username || "" });

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

// Tekshirish tugmasi
bot.action("check_subs", async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const uid = String(ctx.from.id);
    await ensureUser(uid);

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

    await setUser(uid, { subscribed: true });

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

// /check komandasi
bot.command("check", async (ctx) => {
  try {
    const uid = String(ctx.from.id);
    await ensureUser(uid);
    const missing = await notSubscribedChannels(ctx, uid);
    if (missing.length > 0) {
      return ctx.reply(
        "Hali ham obuna to'liq emas. Iltimos quyidagilarga a'zo bo'ling va yana /check yuboring:",
        channelKeyboard()
      );
    }

    await setUser(uid, { subscribed: true });
    await ctx.reply(
      `✅ Obuna tasdiqlandi!\n\nSalom, *${ctx.from.first_name || ctx.from.username || "do'st"}* 👋\nEndi kino kodini yuboring (masalan: 1001).`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    console.error("/check error:", e);
    await ctx.reply("Xatolik yuz berdi. Keyinroq urinib ko'ring.");
  }
});

// Admin komandasi
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

// Bekor qilish
bot.hears("⛔ Bekor qilish", async (ctx) => {
  const uid = String(ctx.from.id);
  if (isAdmin(ctx)) {
    await clearState(uid);
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

// Yordam komandasi
bot.command("help", async (ctx) => {
  await ctx.reply(
    "Yordam:\n" +
    "— /start — boshlash\n" +
    "— /check — obunani tekshirish\n" +
    "— Kino kodini yuboring: masalan, 1001\n" +
    (isAdmin(ctx) ? "— /admin — admin panel\n" : "")
  );
});

// Kino qo'shish
bot.hears("🎬 Kino qo'shish", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("⛔ Siz admin emassiz!");

  await startState(ctx.from.id, { mode: "add_movie", step: 1, data: {} });
  await ctx.reply("🎬 Kino uchun kod yuboring (masalan: 1001):");
});

// 1-bosqich: kod qabul qilish
bot.on("text", async (ctx, next) => {
  const uid = String(ctx.from.id);
  const st = STATE[uid];

  if (!st || st.mode !== "add_movie" || st.step !== 1) return next();

  await patchState(uid, { step: 2, data: { code: ctx.message.text.trim() } });
  return ctx.reply("📎 Kino videosini yuboring:");
});

// 2-bosqich: video qabul qilish
bot.on("video", async (ctx, next) => {
  const uid = String(ctx.from.id);
  const st = STATE[uid];

  if (!st || st.mode !== "add_movie" || st.step !== 2) return next();

  await patchState(uid, { step: 3, data: { ...st.data, file_id: ctx.message.video.file_id } });
  return ctx.reply("✍️ Kino matnini yuboring:");
});

// 3-bosqich: caption qabul qilish va saqlash
bot.on("text", async (ctx, next) => {
  const uid = String(ctx.from.id);
  const st = STATE[uid];

  if (!st || st.mode !== "add_movie" || st.step !== 3) return next();

  const caption = ctx.message.text;
  const { code, file_id } = st.data;

  // MongoDB ga kino qo'shamiz
  await insertOne(COLLECTIONS.MOVIES, {
    code,
    file_id,
    caption,
    addedBy: uid,
    addedAt: new Date()
  });
  
  await refreshData();
  await clearState(uid);

  return ctx.reply(
    `✅ Kino qo'shildi!\n\n📌 Kod: ${code}\n🎬 Matn: ${caption}`
  );
});

// Reklama yuborish
bot.hears("📢 Reklama yuborish", async (ctx) => {
  if (!isAdmin(ctx)) return;
  await startState(ctx.from.id, { mode: "send_ads", step: 1, data: {} });
  await ctx.reply("📢 Reklama uchun rasm yuboring yoki /skip bu bosqichni o'tkazing.");
});

// 1-bosqich: Rasm olish yoki skip
bot.on("photo", async (ctx, next) => {
  const uid = String(ctx.from.id);
  const st = STATE[uid];
  if (!st || st.mode !== "send_ads" || st.step !== 1) return next();

  const file_id = ctx.message.photo.pop().file_id;
  await patchState(uid, { step: 2, data: { photo: file_id } });
  return ctx.reply("✅ Rasm qabul qilindi.\n\nEndi reklama matnini yuboring:");
});

bot.command("skip", async (ctx) => {
  const uid = String(ctx.from.id);
  const st = STATE[uid];
  if (!st || st.mode !== "send_ads" || st.step !== 1) return;
  await patchState(uid, { step: 2, data: {} });
  return ctx.reply("⏩ Rasm bosqichi o'tkazildi.\n\nEndi reklama matnini yuboring:");
});

// 2-bosqich: Matn olish
bot.on("text", async (ctx, next) => {
  const uid = String(ctx.from.id);
  const st = STATE[uid];
  if (!st || st.mode !== "send_ads" || st.step !== 2) return next();

  await patchState(uid, { step: 3, data: { ...st.data, text: ctx.message.text } });
  return ctx.reply("✍️ Endi tugma uchun nom kiriting (masalan: Obuna bo'lish).");
});

// 3-bosqich: Tugma nomi
bot.on("text", async (ctx, next) => {
  const uid = String(ctx.from.id);
  const st = STATE[uid];
  if (!st || st.mode !== "send_ads" || st.step !== 3) return next();

  await patchState(uid, { step: 4, data: { ...st.data, btn_text: ctx.message.text } });
  return ctx.reply("🔗 Endi tugma uchun link yuboring (masalan: https://t.me/saikostars).");
});

// 4-bosqich: Tugma linki va reklama yuborish
bot.on("text", async (ctx, next) => {
  const uid = String(ctx.from.id);
  const st = STATE[uid];
  if (!st || st.mode !== "send_ads" || st.step !== 4) return next();

  const btn_url = ctx.message.text;
  const { text, photo, btn_text } = st.data;

  const keyboard = Markup.inlineKeyboard([[Markup.button.url(btn_text, btn_url)]]);

  const allUsers = await find(COLLECTIONS.USERS);
  let sent = 0;

  for (const user of allUsers) {
    try {
      if (photo) {
        await bot.telegram.sendPhoto(user.userId, photo, { caption: text, reply_markup: keyboard.reply_markup });
      } else {
        await bot.telegram.sendMessage(user.userId, text, keyboard);
      }
      sent++;
    } catch (e) {
      console.log(`❌ ${user.userId} ga yuborilmadi:`, e.message);
    }
  }

  await clearState(uid);
  return ctx.reply(`✅ Reklama yuborildi!\n📨 Yuborilganlar: ${sent} ta foydalanuvchi`);
});

// Kino kodini qayta ishlash
bot.on("text", async (ctx, next) => {
  try {
    const uid = String(ctx.from.id);
    const user = await ensureUser(uid);

    const st = STATE[uid];
    if (st && st.mode) return next();

    if (!user.subscribed) {
      return ctx.reply("❌ Siz hali kanallarga obuna bo'lmadingiz.\nIltimos, /start buyrug'ini qayta yuboring.");
    }

    const code = ctx.message.text.trim();
    const movie = await findOne(COLLECTIONS.MOVIES, { code });

    if (!movie) {
      return ctx.reply("❌ Bunday kodli kino topilmadi.\nIltimos boshqa kod kiriting.");
    }

    await ctx.replyWithVideo(movie.file_id, {
      caption: movie.caption || `🎬 Kod: ${code}`
    });
  } catch (e) {
    console.error("kino chiqarishda xato:", e);
    await ctx.reply("❌ Kino chiqarishda xatolik yuz berdi.");
  }
});

// /kinolar komandasi
bot.command("kinolar", async (ctx) => {
  try {
    const movies = await find(COLLECTIONS.MOVIES);
    if (movies.length === 0) {
      return ctx.reply("❌ Hozircha kino qo'shilmagan.");
    }

    let text = "🎬 *Kinolar ro'yxati:*\n\n";
    movies.forEach((movie, index) => {
      text += `${index + 1}. Kod: \`${movie.code}\`\nMatn: ${movie.caption || "Matnsiz"}\n\n`;
    });

    await ctx.replyWithMarkdown(text);
  } catch (err) {
    console.error("Kinolarni chiqarishda xato:", err);
    await ctx.reply("❌ Xatolik yuz berdi, keyinroq urinib ko'ring.");
  }
});

// /kino [kod] komandasi
bot.command("kino", async (ctx) => {
  try {
    const args = ctx.message.text.split(" ");
    if (args.length < 2) {
      return ctx.reply("ℹ️ Iltimos kino kodini kiriting. Masalan:\n`/kino 1001`", { parse_mode: "Markdown" });
    }

    const code = args[1];
    const movie = await findOne(COLLECTIONS.MOVIES, { code });

    if (!movie) {
      return ctx.reply("❌ Bunday kodli kino topilmadi.");
    }

    await ctx.replyWithVideo(movie.file_id, {
      caption: movie.caption || `🎬 Kod: ${code}`
    });
  } catch (err) {
    console.error("Kino topishda xato:", err);
    await ctx.reply("❌ Kino topishda xatolik yuz berdi.");
  }
});

// Xatolarni tutish
bot.catch((err, ctx) => {
  console.error(`Botda xato:`, err);
});

// Dasturni ishga tushirish
async function startBot() {
  // MongoDB ga ulanish
  const dbConnected = await connectDB();
  if (!dbConnected) {
    console.error("MongoDB ga ulanmadi. Bot ishlamaydi.");
    process.exit(1);
  }
  
  // JSON ma'lumotlarini MongoDB ga ko'chiramiz
  await migrateDataFromJSON();
  
  // Ma'lumotlarni yuklash
  await refreshData();
  
  // Agar adminlar bo'sh bo'lsa, default admin qo'shamiz
  if (ADMINS.length === 0) {
    ADMINS = ["8165064673"];
    const admins = ADMINS.map(userId => ({ userId }));
    await db.collection(COLLECTIONS.ADMINS).insertMany(admins);
  }
  
  // Agar kanallar bo'sh bo'lsa, default kanal qo'shamiz
  if (CHANNELS.length === 0) {
    CHANNELS = ["@saikostars"];
    const channels = CHANNELS.map(username => ({ username }));
    await db.collection(COLLECTIONS.CHANNELS).insertMany(channels);
  }
  
  // Botni ishga tushirish
  bot.launch()
    .then(() => {
      console.log("Bot muvaffaqiyatli ishga tushdi ✅");
    })
    .catch((err) => {
      console.error("Botni ishga tushirishda xato ❌", err);
    });

  // Graceful stop
  process.once("SIGINT", () => {
    console.log("Bot to'xtatilmoqda...");
    bot.stop("SIGINT");
    client.close();
    process.exit(0);
  });
  
  process.once("SIGTERM", () => {
    console.log("Bot to'xtatilmoqda...");
    bot.stop("SIGTERM");
    client.close();
    process.exit(0);
  });
}

// Dasturni ishga tushiramiz
startBot();
