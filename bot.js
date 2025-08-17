const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');

const bot = new Telegraf('7782418983:AAFw1FYb-ESFb-1abiSudFlzhukTAkylxFA');

// JSON fayllarni yuklash
let admins = fs.existsSync('admins.json') ? JSON.parse(fs.readFileSync('admins.json')) : ["8165064673"];
let channels = fs.existsSync('channels.json') ? JSON.parse(fs.readFileSync('channels.json')) : ["@saikostars"];
let movies = fs.existsSync('movies.json') ? JSON.parse(fs.readFileSync('movies.json')) : {};
let state = fs.existsSync('state.json') ? JSON.parse(fs.readFileSync('state.json')) : {};

let users = {}; // foydalanuvchilar holati

function saveJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// =================== START ===================
bot.start(async (ctx) => {
    const userId = ctx.from.id.toString();
    users[userId] = users[userId] || { subscribed: false };

    const firstName = ctx.from.first_name || "Do‘st";

    let channelButtons = channels.map(c => [Markup.button.url(c, `https://t.me/${c.replace('@','')}`)]);
    await ctx.reply(
        `Salom, ${firstName}! 👋\n\nIltimos kanallarga obuna bo‘ling:`,
        Markup.inlineKeyboard(channelButtons)
    );
    await ctx.reply('Obuna bo‘lgach, /check yozing.');

    // Admin menyu
    if (admins.includes(userId)) {
        await ctx.reply('Siz adminsiz! Admin menyu:', Markup.keyboard([
            ['Kino qo‘shish', 'Reklama jo‘natish']
        ]).resize());
    }
});

// =================== CHECK ===================
bot.command('check', async (ctx) => {
    const userId = ctx.from.id.toString();
    users[userId].subscribed = true;
    await ctx.reply('✅ Obuna tasdiqlandi! Endi kino kodi kiriting:');
});

// =================== ADMIN PANEL ===================
bot.command('admin', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!admins.includes(userId)) return ctx.reply('Siz admin emassiz!');

    await ctx.reply('Admin menyu:', Markup.keyboard([
        ['Kino qo‘shish', 'Reklama jo‘natish']
    ]).resize());
});

// =================== KINO QO‘SHISH ===================
bot.hears('Kino qo‘shish', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!admins.includes(userId)) return;

    state[userId] = { step: 'waiting_for_video' };
    saveJSON('state.json', state);

    await ctx.reply('Iltimos kino video yuboring:', Markup.inlineKeyboard([
        Markup.button.callback('❌ Bekor qilish', 'cancel')
    ]));
});

// Bekor qilish
bot.action('cancel', async (ctx) => {
    const userId = ctx.from.id.toString();
    state[userId] = null;
    saveJSON('state.json', state);
    await ctx.editMessageText('Amal bekor qilindi. ✅');
});

// Video qabul qilish
bot.on('video', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!state[userId] || state[userId].step !== 'waiting_for_video') return;

    const videoId = ctx.message.video.file_id;
    state[userId] = { step: 'waiting_for_code', videoId };
    saveJSON('state.json', state);

    await ctx.reply('Kino kodi kiriting:');
});

// =================== TEXT HANDLER ===================
bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const text = ctx.message.text;

    // Kino qo‘shish jarayoni
    if (state[userId] && state[userId].step === 'waiting_for_code') {
        const videoId = state[userId].videoId;
        state[userId] = { step: 'confirm', videoId, code: text };
        saveJSON('state.json', state);

        await ctx.reply(
            `Kodi: ${text}\nKino tasdiqlansinmi?`,
            Markup.inlineKeyboard([
                Markup.button.callback('✅ Tasdiqlash', 'confirm_video'),
                Markup.button.callback('❌ Bekor qilish', 'cancel')
            ])
        );
        return;
    }

    // Foydalanuvchi kodi orqali kino olish
    if (users[userId] && users[userId].subscribed) {
        if (!state[userId] || !['waiting_for_video','waiting_for_code','confirm'].includes(state[userId].step)) {
            if (movies[text]) {
                await ctx.replyWithVideo(movies[text], { caption: `Sizning kinoingiz kodi: ${text}` });
            } else if (!text.startsWith('/')) {
                await ctx.reply('❌ Bunday kino kodi topilmadi!');
            }
        }
    }

    // Reklama jarayonida matn
    if (state[userId] && state[userId].step === 'waiting_for_ad') {
        for (const uid in users) {
            try {
                await ctx.telegram.sendMessage(uid, `📢 Reklama:\n\n${text}`);
            } catch (e) {
                console.log(`❌ ${uid} ga reklama yuborilmadi.`);
            }
        }
        state[userId] = null;
        saveJSON('state.json', state);
        await ctx.reply('✅ Reklama barcha foydalanuvchilarga jo‘natildi!');
        return;
    }
});

// =================== TASDIQLASH ===================
bot.action('confirm_video', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!state[userId] || state[userId].step !== 'confirm') return;

    const { videoId, code } = state[userId];
    movies[code] = videoId;
    saveJSON('movies.json', movies);

    state[userId] = null;
    saveJSON('state.json', state);

    await ctx.editMessageText(`🎬 Kino tasdiqlandi!\nKodi: ${code}`);
});

// =================== REKLAMA ===================
bot.hears('Reklama jo‘natish', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!admins.includes(userId)) return;

    state[userId] = { step: 'waiting_for_ad' };
    saveJSON('state.json', state);

    await ctx.reply(
        '📢 Reklama yuboring (matn, rasm yoki video bo‘lishi mumkin):',
        Markup.inlineKeyboard([
            Markup.button.callback('❌ Bekor qilish', 'cancel')
        ])
    );
});

// Reklama rasm/video
bot.on(['photo','video'], async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!state[userId] || state[userId].step !== 'waiting_for_ad') return;

    for (const uid in users) {
        try {
            if (ctx.message.photo) {
                await ctx.telegram.sendPhoto(uid, ctx.message.photo[0].file_id, { caption: ctx.message.caption || '' });
            } else if (ctx.message.video) {
                await ctx.telegram.sendVideo(uid, ctx.message.video.file_id, { caption: ctx.message.caption || '' });
            }
        } catch (e) {
            console.log(`❌ ${uid} ga reklama yuborilmadi.`);
        }
    }

    state[userId] = null;
    saveJSON('state.json', state);
    await ctx.reply('✅ Reklama barcha foydalanuvchilarga jo‘natildi!');
});

bot.launch();
console.log('🚀 Bot ishga tushdi!');
