// server.mjs
import express from "express";
import mongoose from "mongoose";
import bodyParser from "body-parser";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(bodyParser.json());

// ================== MongoDB ULANISH ==================
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB ulandi"))
  .catch((err) => console.error("❌ MongoDB ulanish xatosi:", err));

// ================== SCHEMALAR ==================
// User schema
const userSchema = new mongoose.Schema({
  userId: { type: String, required: true },  // Telegram user ID
  username: String,
  joinedAt: { type: Date, default: Date.now },
});

const User = mongoose.model("User", userSchema);

// Movie schema
const movieSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true }, // Kino kodi
  title: String,
  description: String,
  videoUrl: String,
  addedAt: { type: Date, default: Date.now },
});

const Movie = mongoose.model("Movie", movieSchema);

// ================== ROUTELAR ==================
// User qo‘shish
app.post("/users", async (req, res) => {
  try {
    const { userId, username } = req.body;
    const user = new User({ userId, username });
    await user.save();
    res.json({ message: "✅ User saqlandi", user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Userlarni olish
app.get("/users", async (req, res) => {
  const users = await User.find();
  res.json(users);
});

// Kino qo‘shish
app.post("/movies", async (req, res) => {
  try {
    const { code, title, description, videoUrl } = req.body;
    const movie = new Movie({ code, title, description, videoUrl });
    await movie.save();
    res.json({ message: "🎬 Kino qo‘shildi", movie });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Kinolarni olish
app.get("/movies", async (req, res) => {
  const movies = await Movie.find();
  res.json(movies);
});

// ================== SERVERNI ISHLATISH ==================
app.listen(PORT, () => {
  console.log(`🚀 Server http://localhost:${PORT} da ishlamoqda`);
});
