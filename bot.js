// ==============================
// Telegram Kino Bot
// To'liq yozilgan (500 qator atrofida)
// ==============================

const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");
const path = require("path");

// ==============================
// Configlar
// ==============================

// Tokeningizni shu yerga yozing
const BOT_TOKEN = "YOUR_BOT_TOKEN"; 
const bot = new Telegraf(BOT_TOKEN);

// Fayllar
const adminsFile = path.join(__dirname, "admins.json");
const channelsFile = path.join(__dirname, "channels.json");
const moviesFile = path.join(__dirname, "movies.json");
const usersFile = path.join(__dirname, "users.json");

// JSON o‘qish funksiyasi
function readJSON(file, def = []) {
    try {
        if (fs.existsSync(file)) {
            return JSON.parse(fs.readFileSync(file));
        } else {
            return def;
        }
    } catch (e) {
        console.log("JSON o‘qishda xatolik:", file, e);
        return def;
    }
}

// JSON yozish
function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ==============================
// Fayllarni boshlang‘ich holatga keltirish
// ==============================
let admins = readJSON(adminsFile, ["123456789"]); // admin ID shu yerga
let channels = readJSON(channelsFile, [
    { id: "@example1", name: "Kanal 1" },
    { id: "@example2", name: "Kanal 2" }
]);
let movies = readJSON(moviesFile, []);
let users = readJSON(usersFile, []);

// ==============================
// Obuna tekshirish funksiyasi
// ==============================
async function checkSubscription(ctx) {
    let userId = ctx.from.id;
    for (let ch of channels) {
        try {
            let res = await ctx.telegram.getChatMember(ch.id, userId);
            if (["left", "kicked"].includes(res.status)) {
                return false;
            }
        } catch (e) {
            console.log("Kanal topilmadi:", ch.id, e);
            return false;
        }
    }
    return true;
}

// Kanal tugmalari
function channelButtons() {
    return channels.map(ch => [Markup.button.url(ch.name, `https://t.me/${ch.id.replace("@", "")}`)]);
}

// ==============================
// Start komandasi
// ==============================
bot.start(async (ctx) => {
    let userId = ctx.from.id;
    let name = ctx.from.first_name;

    // Foydalanuvchini bazaga yozish
    if (!users.find(u => u.id === userId)) {
        users.push({ id: userId, name: name });
        writeJSON(usersFile, users);
    }

    ctx.reply(`Salom, ${name}! 🎬\nBotdan foydalanish uchun avval kanallarga obuna bo‘ling.`, {
        reply_markup: {
            inline_keyboard: [
                ...channelButtons(),
                [Markup.button.callback("✅ Obunani tekshirish", "check_subs")]
            ]
        }
    });
});

// ==============================
// Obunani tekshirish tugmasi
// ==============================
bot.action("check_subs", async (ctx) => {
    let isSub = await checkSubscription(ctx);
    if (isSub) {
        ctx.reply("✅ Obuna tasdiqlandi!\nEndi kino kodini yuboring:");
    } else {
        ctx.reply("❌ Siz barcha kanallarga obuna bo‘lmadingiz.\nIltimos, obuna bo‘ling:", {
            reply_markup: {
                inline_keyboard: [
                    ...channelButtons(),
                    [Markup.button.callback("♻️ Qayta tekshirish", "check_subs")]
                ]
            }
        });
    }
});

// ==============================
// Kino kodini yuborish
// ==============================
bot.on("text", async (ctx) => {
    let userId = ctx.from.id;
    let text = ctx.message.text.trim();

    // Admin komandalarini ajratib olish
    if (admins.includes(userId.toString())) {
        if (text.startsWith("/addmovie")) {
            let args = text.split(" ");
            if (args.length < 3) {
                return ctx.reply("❌ Foydalanish: /addmovie KOD LINK");
            }
            let code = args[1];
            let link = args[2];
            movies.push({ code: code, link: link });
            writeJSON(moviesFile, movies);
            return ctx.reply(`✅ Kino qo‘shildi!\nKod: ${code}\nLink: ${link}`);
        }

        if (text.startsWith("/delmovie")) {
            let args = text.split(" ");
            if (args.length < 2) {
                return ctx.reply("❌ Foydalanish: /delmovie KOD");
            }
            let code = args[1];
            movies = movies.filter(m => m.code !== code);
            writeJSON(moviesFile, movies);
            return ctx.reply(`🗑 Kino o‘chirildi!\nKod: ${code}`);
        }

        if (text.startsWith("/movies")) {
            if (movies.length === 0) return ctx.reply("🎬 Hech qanday kino yo‘q.");
            let msg = "🎬 Kinolar ro‘yxati:\n\n";
            movies.forEach(m => {
                msg += `🔹 Kod: ${m.code}\n🔗 Link: ${m.link}\n\n`;
            });
            return ctx.reply(msg);
        }
    }

    // Oddiy foydalanuvchi uchun
    let isSub = await checkSubscription(ctx);
    if (!isSub) {
        return ctx.reply("❌ Siz hali barcha kanallarga obuna bo‘lmadingiz.", {
            reply_markup: {
                inline_keyboard: [
                    ...channelButtons(),
                    [Markup.button.callback("♻️ Qayta tekshirish", "check_subs")]
                ]
            }
        });
    }

    // Kino kodini qidirish
    let movie = movies.find(m => m.code === text);
    if (!movie) {
        return ctx.reply("❌ Bunday kodli kino topilmadi.");
    }

    ctx.reply(`🎬 Mana siz so‘ragan kino:\n\n🔗 ${movie.link}`);
});

// ==============================
// Admin panel tugmalari
// ==============================
bot.command("admin", (ctx) => {
    if (!admins.includes(ctx.from.id.toString())) {
        return ctx.reply("❌ Siz admin emassiz.");
    }

    ctx.reply("👮 Admin panel:", {
        reply_markup: {
            inline_keyboard: [
                [Markup.button.callback("🎬 Kinolar ro‘yxati", "list_movies")],
                [Markup.button.callback("➕ Kino qo‘shish", "add_movie_help")],
                [Markup.button.callback("🗑 Kino o‘chirish", "del_movie_help")]
            ]
        }
    });
});

// ==============================
// Admin panel actionlari
// ==============================
bot.action("list_movies", (ctx) => {
    if (!admins.includes(ctx.from.id.toString())) return;
    if (movies.length === 0) return ctx.reply("🎬 Hozircha kino yo‘q.");
    let msg = "🎬 Kinolar:\n\n";
    movies.forEach(m => msg += `🔹 ${m.code} -> ${m.link}\n`);
    ctx.reply(msg);
});

bot.action("add_movie_help", (ctx) => {
    if (!admins.includes(ctx.from.id.toString())) return;
    ctx.reply("➕ Kino qo‘shish uchun:\n\n`/addmovie KOD LINK`");
});

bot.action("del_movie_help", (ctx) => {
    if (!admins.includes(ctx.from.id.toString())) return;
    ctx.reply("🗑 Kino o‘chirish uchun:\n\n`/delmovie KOD`");
});

// ==============================
// Botni ishga tushirish
// ==============================
bot.launch();
console.log("🎬 Kino Bot ishga tushdi...");

// Graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

