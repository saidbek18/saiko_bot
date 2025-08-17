// bot.js
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');

// ================== CONFIG ==================
const BOT_TOKEN = '7782418983:AAFw1FYb-ESFb-1abiSudFlzhukTAkylxFA'; // ⚠️ shu yerga token
const bot = new Telegraf(BOT_TOKEN);

const FILES = {
  admins: 'admins.json',
  channels: 'channels.json',
  users: 'users.json',
  movies: 'movies.json',
  state: 'state.json',
};

// ================== HELPERS: IO ==================
function loadJSON(path, defVal) {
  try {
    if (fs.existsSync(path)) return JSON.parse(fs.readFileSync(path));
  } catch (e) {
    console.error('JSON load error:', path, e.message);
  }
  return defVal;
}

function saveJSON(path, data) {
  try {
    fs.writeFileSync(path, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('JSON save error:', path, e.message);
  }
}

// ================== DATA ==================
let admins   = loadJSON(FILES.admins,   ['8165064673']);     // Admin ID lar (string yoki number bo‘lishi mumkin)
let channels = loadJSON(FILES.channels, ['@saikostars','@zxsaikomusic']);   // Obuna kanallar
let users    = loadJSON(FILES.users,    {});                // { userId: { subscribed: bool, ... } }
let movies   = loadJSON(FILES.movies,   {});                // { code: { videoId, caption } }
let state    = loadJSON(FILES.state,    {});                // { userId: { step: '...', ... } }

function isAdmin(id) {
  const s = id.toString();
  return admins.map(String).includes(s);
}
function ensureUser(userId) {
  if (!users[userId]) {
    users[userId] = { subscribed: false, createdAt: Date.now() };
    saveJSON(FILES.users, users);
  }
}
function setState(userId, newState) {
  state[userId] = newState;
  saveJSON(FILES.state, state);
}
function clearState(userId) {
  delete state[userId];
  saveJSON(FILES.state, state);
}

// ================== UI HELPERS ==================
function adminKeyboard() {
  return Markup.keyboard([
    ['🎬 Kino qo‘shish', '📊 Statistika'],
    ['📢 Reklama jo‘natish', '📤 Video jo‘natish'],
  ]).resize();
}
function userKeyboard() {
  return Markup.keyboard([['ℹ️ Qanday ishlaydi?']]).resize();
}
function subscribeKeyboard() {
  const rows = channels.map(ch => [Markup.button.url('📢 Kanal', `https://t.me/${ch.replace('@', '')}`)]);
  rows.push([Markup.button.callback('✅ Obunani tekshirish', 'check_sub')]);
  return Markup.inlineKeyboard(rows);
}
const cancelKeyboard = Markup.inlineKeyboard([[Markup.button.callback('❌ Bekor qilish', 'cancel')]]);

// ================== SUBSCRIPTION CHECK ==================
async function checkSubscription(ctx, userId) {
  let ok = true;
  for (const ch of channels) {
    try {
      const member = await ctx.telegram.getChatMember(ch, userId);
      if (['left', 'kicked', 'restricted'].includes(member.status)) ok = false;
    } catch (e) {
      ok = false; // kanal nomi xato bo‘lsa yoki bot admin bo‘lmasa ham false
    }
  }
  users[userId].subscribed = ok;
  saveJSON(FILES.users, users);
  return ok;
}

// ================== START ==================
bot.start(async (ctx) => {
  const userId = ctx.from.id.toString();
  ensureUser(userId);

  await ctx.reply(
    `Salom, ${ctx.from.first_name || ''}!\nBotdan foydalanish uchun quyidagi kanallarga obuna bo‘ling:`,
    subscribeKeyboard()
  );

  if (isAdmin(userId)) {
    await ctx.reply('Admin menyu:', adminKeyboard());
  } else {
    await ctx.reply('Kod yuborsangiz — kino chiqadi. Masalan: 1234', userKeyboard());
  }
});

bot.action('check_sub', async (ctx) => {
  const userId = ctx.from.id.toString();
  ensureUser(userId);
  const ok = await checkSubscription(ctx, userId);
  if (!ok) return ctx.reply('❌ Hali barcha kanallarga obuna bo‘lmadingiz.', subscribeKeyboard());
  await ctx.reply('✅ Obuna tasdiqlandi! Endi kino kodini yuborishingiz mumkin.');
});
bot.command('check', async (ctx) => {
  const userId = ctx.from.id.toString();
  ensureUser(userId);
  const ok = await checkSubscription(ctx, userId);
  if (!ok) return ctx.reply('❌ Hali barcha kanallarga obuna bo‘lmadingiz.', subscribeKeyboard());
  await ctx.reply('✅ Obuna tasdiqlandi! Endi kino kodini yuborishingiz mumkin.');
});

// ================== ADMIN PANEL (qo‘lda) ==================
bot.command('admin', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Siz admin emassiz!');
  await ctx.reply('Admin menyu:', adminKeyboard());
});

// ================== KINO QO‘SHISH ==================
bot.hears('🎬 Kino qo‘shish', async (ctx) => {
  const userId = ctx.from.id.toString();
  if (!isAdmin(userId)) return;

  setState(userId, { step: 'm_wait_video' });
  await ctx.reply('🎬 Iltimos kino videoni yuboring.', cancelKeyboard);
});

bot.on('video', async (ctx) => {
  const userId = ctx.from.id.toString();
  if (state[userId]?.step === 'm_wait_video') {
    const videoId = ctx.message.video.file_id;
    setState(userId, { step: 'm_wait_code', videoId });
    return ctx.reply('🔢 Kino kodi kiriting (masalan: 1234).', cancelKeyboard);
  }
  // Video jo‘natish (broadcast) flow-da media kelishi ham shu handlerda ushlanadi (quyida)
  if (state[userId]?.step === 'v_wait_media') {
    const file_id = ctx.message.video.file_id;
    setState(userId, { step: 'v_wait_caption', media: { type: 'video', file_id } });
    return ctx.reply('✍️ Caption (matn) yozing. Bo‘sh qoldirmoqchi bo‘lsangiz "-" yozing.', cancelKeyboard);
  }
});

bot.on('photo', async (ctx) => {
  const userId = ctx.from.id.toString();
  // faqat video qabul qilamiz kino uchun
  if (state[userId]?.step === 'm_wait_video') {
    return ctx.reply('❗️ Kino uchun faqat VIDEO yuboring.');
  }
  // video jo‘natish (broadcast) rasm ham qabul qiladi
  if (state[userId]?.step === 'v_wait_media') {
    const sizes = ctx.message.photo;
    const file_id = sizes[sizes.length - 1].file_id;
    setState(userId, { step: 'v_wait_caption', media: { type: 'photo', file_id } });
    return ctx.reply('✍️ Caption (matn) yozing. Bo‘sh qoldirmoqchi bo‘lsangiz "-" yozing.', cancelKeyboard);
  }
});

// ================== REKLAMA / VIDEO JO‘NATISH TUGMALARI ==================
bot.hears('📢 Reklama jo‘natish', async (ctx) => {
  const userId = ctx.from.id.toString();
  if (!isAdmin(userId)) return;

  setState(userId, { step: 'a_wait_text' });
  await ctx.reply('📢 Reklama matnini yuboring.', cancelKeyboard);
});

bot.hears('📤 Video jo‘natish', async (ctx) => {
  const userId = ctx.from.id.toString();
  if (!isAdmin(userId)) return;

  setState(userId, { step: 'v_wait_media' });
  await ctx.reply('📷 Reklama uchun rasm yoki video yuboring.', cancelKeyboard);
});

bot.hears('📊 Statistika', async (ctx) => {
  const userId = ctx.from.id.toString();
  if (!isAdmin(userId)) return;

  const usersCount = Object.keys(users).length;
  const moviesCount = Object.keys(movies).length;
  await ctx.reply(`📊 Statistika\n👤 Foydalanuvchilar: ${usersCount}\n🎬 Kinolar: ${moviesCount}`);
});

// ================== CANCEL ==================
bot.action('cancel', async (ctx) => {
  const userId = ctx.from.id.toString();
  clearState(userId);
  await ctx.editMessageText('❌ Amal bekor qilindi.');
});

// ================== TEXT HANDLER (BARCHA MATNLAR) ==================
bot.on('text', async (ctx) => {
  const userId = ctx.from.id.toString();
  ensureUser(userId);
  const text = ctx.message.text;

  // --- KINO QO‘SHISH: KOD ---
  if (state[userId]?.step === 'm_wait_code') {
    const videoId = state[userId].videoId;
    setState(userId, { step: 'm_wait_caption', videoId, code: text.trim() });
    return ctx.reply('📝 Kino uchun caption yozing. Bo‘sh bo‘lsa "-" yozing.', cancelKeyboard);
  }

  // --- KINO QO‘SHISH: CAPTION & CONFIRM ---
  if (state[userId]?.step === 'm_wait_caption') {
    const { videoId, code } = state[userId];
    const caption = text.trim() === '-' ? '' : text;

    setState(userId, { step: 'm_confirm', videoId, code, caption });
    return ctx.reply(
      `✅ Tasdiqlaysizmi?\n\nKOD: ${code}\nCAPTION: ${caption || '(bo‘sh)'}\nVIDEO: ${videoId}`,
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ Tasdiqlash', 'm_confirm'), Markup.button.callback('❌ Bekor', 'cancel')],
      ])
    );
  }

  // --- REKLAMA (MATN → TUGMA NOMI → LINK) ---
  if (state[userId]?.step === 'a_wait_text') {
    setState(userId, { step: 'a_wait_btn_text', text });
    return ctx.reply('🔘 Tugma nomini yuboring (masalan: "👉 Ko‘rish").', cancelKeyboard);
  }
  if (state[userId]?.step === 'a_wait_btn_text') {
    state[userId].btnText = text;
    state[userId].step = 'a_wait_btn_url';
    saveJSON(FILES.state, state);
    return ctx.reply('🔗 Tugma linkini yuboring (https:// bilan).', cancelKeyboard);
  }
  if (state[userId]?.step === 'a_wait_btn_url') {
    const ad = state[userId];
    ad.btnUrl = text;
    // YUBORISH
    const keyboard = Markup.inlineKeyboard([[Markup.button.url(ad.btnText, ad.btnUrl)]]);
    let sent = 0, failed = 0;
    for (const uid of Object.keys(users)) {
      try {
        await ctx.telegram.sendMessage(uid, ad.text, keyboard);
        sent++;
      } catch {
        failed++;
      }
    }
    clearState(userId);
    return ctx.reply(`📢 Reklama yuborildi!\n✅ Muvaffaqiyatli: ${sent}\n⚠️ O‘tmadi: ${failed}`);
  }

  // --- VIDEO JO‘NATISH (BROADCAST): CAPTION → (ixtiyoriy tugma) ---
  if (state[userId]?.step === 'v_wait_caption') {
    state[userId].caption = text.trim() === '-' ? '' : text;
    state[userId].step = 'v_ask_button';
    saveJSON(FILES.state, state);
    return ctx.reply(
      'Tugma qo‘shasizmi?',
      Markup.inlineKeyboard([
        [Markup.button.callback('➕ Tugma qo‘shish', 'v_btn_yes'), Markup.button.callback('➡️ Tugmasiz davom', 'v_btn_no')],
      ])
    );
  }
  if (state[userId]?.step === 'v_wait_btn_text') {
    state[userId].btnText = text;
    state[userId].step = 'v_wait_btn_url';
    saveJSON(FILES.state, state);
    return ctx.reply('🔗 Tugma linkini yuboring.', cancelKeyboard);
  }
  if (state[userId]?.step === 'v_wait_btn_url') {
    state[userId].btnUrl = text;
    state[userId].step = 'v_confirm';
    saveJSON(FILES.state, state);
    return ctx.reply(
      '✅ Tayyor. Jo‘nataymi?',
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ Jo‘nat', 'v_send'), Markup.button.callback('❌ Bekor', 'cancel')],
      ])
    );
  }

  // --- USER: KINO KODI BILAN OLISH ---
  const isCommand = text.startsWith('/');
  const isBusy =
    state[userId] &&
    ['m_wait_video','m_wait_code','m_wait_caption','m_confirm',
     'a_wait_text','a_wait_btn_text','a_wait_btn_url',
     'v_wait_media','v_wait_caption','v_ask_button','v_wait_btn_text','v_wait_btn_url','v_confirm'
    ].includes(state[userId].step);

  if (!isAdmin(userId) && !isCommand && !isBusy) {
    if (!users[userId].subscribed) {
      return ctx.reply('❗️ Avval obuna bo‘ling va tekshiring.', subscribeKeyboard());
    }
    const code = text.trim();
    if (movies[code]) {
      const { videoId, caption } = movies[code];
      try {
        await ctx.replyWithVideo(videoId, { caption: caption || `🎬 Kino kodi: ${code}` });
      } catch {
        await ctx.reply('❌ Video yuborishda xatolik.');
      }
    } else {
      await ctx.reply('❌ Bunday kino kodi topilmadi.');
    }
  }
});

// ================== KINO: CONFIRM ACTION ==================
bot.action('m_confirm', async (ctx) => {
  const userId = ctx.from.id.toString();
  const st = state[userId];
  if (!st || st.step !== 'm_confirm') return;

  movies[st.code] = { videoId: st.videoId, caption: st.caption || '' };
  saveJSON(FILES.movies, movies);

  await ctx.editMessageText(`✅ Kino saqlandi!\nKOD: ${st.code}`);
  setState(userId, { step: 'm_after_saved' });
  await ctx.reply(
    'Yana kino qo‘shasizmi?',
    Markup.inlineKeyboard([
      [Markup.button.callback('➕ Ha, davom', 'm_more'), Markup.button.callback('🏁 Yo‘q', 'cancel')],
    ])
  );
});
bot.action('m_more', async (ctx) => {
  const userId = ctx.from.id.toString();
  setState(userId, { step: 'm_wait_video' });
  await ctx.editMessageText('🎬 Yangi kino videoni yuboring.');
});

// ================== VIDEO BROADCAST: BUTTON FLOW ==================
bot.action('v_btn_yes', async (ctx) => {
  const userId = ctx.from.id.toString();
  if (!state[userId] || state[userId].step !== 'v_ask_button') return;
  state[userId].step = 'v_wait_btn_text';
  saveJSON(FILES.state, state);
  await ctx.editMessageText('🔘 Tugma matnini yuboring.');
});
bot.action('v_btn_no', async (ctx) => {
  const userId = ctx.from.id.toString();
  if (!state[userId] || state[userId].step !== 'v_ask_button') return;
  state[userId].step = 'v_confirm';
  saveJSON(FILES.state, state);
  await ctx.editMessageText('✅ Tayyor. Jo‘nataymi?');
  await ctx.reply(
    'Tasdiqlang:',
    Markup.inlineKeyboard([
      [Markup.button.callback('✅ Jo‘nat', 'v_send'), Markup.button.callback('❌ Bekor', 'cancel')],
    ])
  );
});
bot.action('v_send', async (ctx) => {
  const userId = ctx.from.id.toString();
  const st = state[userId];
  if (!st || st.step !== 'v_confirm') return;

  const extra = {};
  if (st.btnText && st.btnUrl) {
    extra.reply_markup = {
      inline_keyboard: [[{ text: st.btnText, url: st.btnUrl }]],
    };
  }
  let sent = 0, failed = 0;
  for (const uid of Object.keys(users)) {
    try {
      if (st.media.type === 'photo') {
        await ctx.telegram.sendPhoto(uid, st.media.file_id, { caption: st.caption || '', ...extra });
      } else {
        await ctx.telegram.sendVideo(uid, st.media.file_id, { caption: st.caption || '', ...extra });
      }
      sent++;
    } catch {
      failed++;
    }
  }
  clearState(userId);
  await ctx.editMessageText(`📤 Video jo‘natildi!\n✅ Muvaffaqiyatli: ${sent}\n⚠️ O‘tmadi: ${failed}`);
});

// ================== DELETE / ADDADMIN (ixtiyoriy) ==================
bot.command('delete', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Siz admin emassiz!');
  const arg = (ctx.message.text || '').split(' ')[1];
  if (!arg) return ctx.reply('ℹ️ Foydalanish: /delete <kod>');
  if (movies[arg]) {
    delete movies[arg];
    saveJSON(FILES.movies, movies);
    return ctx.reply(`🗑 Kino kodi ${arg} o‘chirildi.`);
  }
  return ctx.reply('❌ Bunday kod topilmadi.');
});

bot.command('addadmin', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Siz admin emassiz!');
  const arg = (ctx.message.text || '').split(' ')[1];
  if (!arg) return ctx.reply('ℹ️ Foydalanish: /addadmin <userId>');
  if (!admins.map(String).includes(arg.toString())) {
    admins.push(arg.toString());
    saveJSON(FILES.admins, admins);
    return ctx.reply(`✅ Admin qo‘shildi: ${arg}`);
  }
  return ctx.reply('ℹ️ Bu admin allaqachon mavjud.');
});

// ================== LAUNCH ==================
bot.launch();
console.log('🤖 Bot ishga tushdi!');
