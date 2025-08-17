const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");

// 🔑 Token va Admin ID
const bot = new Telegraf("7782418983:AAFw1FYb-ESFb-1abiSudFlzhukTAkylxFA");
const adminId = 8165064673; // Admin ID ni yozing

// 📂 Fayllar
const moviesFile = "movies.json";
const channelsFile = "channels.json";

// 📌 JSON o‘qish funksiyasi
function loadJson(file, defaultData) {
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file));
  }
  return defaultData;
}

// 📌 JSON saqlash funksiyasi
function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// 📂 Fayllarni boshlang‘ich yuklash
let movies = loadJson(moviesFile, []);
let channels = loadJson(channelsFile, ["@saikostars", "@zxsaikomusic"]); // Kanal ro‘yxati

// 🚀 /start komandasi
bot.start(async (ctx) => {
  const user = ctx.from;
  let buttons = channels.map((ch) => [Markup.button.url(`📢 Kanal`, `https://t.me/${ch.replace("@", "")}`)]);
  
  buttons.push([Markup.button.callback("✅ Tekshirish", "check")]);

  await ctx.reply(
    `Salom, ${user.first_name}!\nBotdan foydalanish uchun quyidagi kanallarga obuna bo‘ling:`,
    Markup.inlineKeyboard(buttons)
  );
});

// 📌 Obuna tekshirish
bot.action("check", async (ctx) => {
  let allJoined = true;

  for (let ch of channels) {
    try {
      let member = await ctx.telegram.getChatMember(ch, ctx.from.id);
      if (["left", "kicked"].includes(member.status)) {
        allJoined = false;
      }
    } catch (e) {
      allJoined = false;
    }
  }

  if (!allJoined) {
    return ctx.reply("❌ Siz barcha kanallarga obuna bo‘lmadingiz!");
  }

  // ✅ Obuna tasdiqlandi
  return ctx.reply(
    "✅ Obuna tasdiqlandi!\nEndi kinolarni ko‘rishingiz mumkin.",
    Markup.inlineKeyboard([
      [Markup.button.callback("🎬 Kinolar", "movies")],
      [Markup.button.callback("➕ Kino qo‘shish (Admin)", "add_movie")]
    ])
  );
});

// 📌 Kinolar ro‘yxati
bot.action("movies", async (ctx) => {
  if (movies.length === 0) {
    return ctx.reply("📭 Hozircha kinolar mavjud emas.");
  }

  for (let movie of movies) {
    await ctx.replyWithPhoto(movie.photo, {
      caption: `🎬 ${movie.title}\n📖 ${movie.description}\n📥 [Ko‘rish](${movie.link})`,
      parse_mode: "Markdown"
    });
  }
});

// 📌 Admin - Kino qo‘shish
bot.action("add_movie", async (ctx) => {
  if (ctx.from.id !== adminId) {
    return ctx.reply("❌ Siz admin emassiz!");
  }

  ctx.reply("🎬 Kino nomini yuboring:");
  bot.on("text", async (msgCtx) => {
    if (!msgCtx.session) msgCtx.session = {};
    if (!msgCtx.session.step) msgCtx.session.step = "title";

    if (msgCtx.session.step === "title") {
      msgCtx.session.title = msgCtx.message.text;
      msgCtx.session.step = "description";
      return msgCtx.reply("📖 Kino haqida qisqacha yozing:");
    }

    if (msgCtx.session.step === "description") {
      msgCtx.session.description = msgCtx.message.text;
      msgCtx.session.step = "photo";
      return msgCtx.reply("🖼 Kino rasmini yuboring:");
    }
  });

  bot.on("photo", async (msgCtx) => {
    if (!msgCtx.session || msgCtx.session.step !== "photo") return;
    msgCtx.session.photo = msgCtx.message.photo[msgCtx.message.photo.length - 1].file_id;
    msgCtx.session.step = "link";
    return msgCtx.reply("📥 Kino linkini yuboring:");
  });

  bot.on("text", async (msgCtx) => {
    if (msgCtx.session && msgCtx.session.step === "link") {
      msgCtx.session.link = msgCtx.message.text;

      // 🎉 Kino saqlash
      movies.push({
        title: msgCtx.session.title,
        description: msgCtx.session.description,
        photo: msgCtx.session.photo,
        link: msgCtx.session.link,
      });

      saveJson(moviesFile, movies);

      msgCtx.reply("✅ Kino muvaffaqiyatli qo‘shildi!");
      msgCtx.session = null;
    }
  });
});

// 🚀 Botni ishga tushirish
bot.launch();
console.log("🤖 Bot ishga tushdi...");
