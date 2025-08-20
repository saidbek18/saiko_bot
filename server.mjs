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

// MongoDB ulanish
mongoose
  .connect("mongodb+srv://kamolovsaidbek18:JfmNUBzdV53Q0UWg@cluster12.f4snzbj.mongodb.net/saikokino?retryWrites=true&w=majority&appName=Cluster12", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB muvaffaqiyatli ulandi"))
  .catch((err) => console.error("❌ MongoDB ulanish xatosi:", err));

// =======================
// MODELLAR
// =======================
const UserSchema = new mongoose.Schema({
  username: String,
  telegramId: String,
  createdAt: { type: Date, default: Date.now },
});

const MovieSchema = new mongoose.Schema({
  title: String,
  description: String,
  url: String, // video yoki rasm linki
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model("User", UserSchema);
const Movie = mongoose.model("Movie", MovieSchema);

// =======================
// ROUTELAR
// =======================

// ✅ Barcha userlarni olish
app.get("/users", async (req, res) => {
  const users = await User.find();
  res.json(users);
});

// ✅ Yangi user qo‘shish
app.post("/users", async (req, res) => {
  const user = new User(req.body);
  await user.save();
  res.json(user);
});

// ✅ Barcha kinolarni olish
app.get("/movies", async (req, res) => {
  const movies = await Movie.find();
  res.json(movies);
});

// ✅ Yangi kino qo‘shish
app.post("/movies", async (req, res) => {
  const movie = new Movie(req.body);
  await movie.save();
  res.json(movie);
});

// =======================
// SERVER ISHGA TUSHISH
// =======================
app.listen(PORT, () => console.log(`🚀 Server ${PORT} portda ishlayapti`));
