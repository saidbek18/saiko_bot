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

// 🔗 MongoDB ulanish
mongoose
  .connect(
    "mongodb+srv://kamolovsaidbek:mZhv1MAWUhnZxwyM@cluster0.haqf33d.mongodb.net/kinobot?retryWrites=true&w=majority&appName=Cluster0", 
    {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  )
  .then(() => console.log("✅ MongoDB ulanish muvaffaqiyatli"))
  .catch((err) => console.error("❌ MongoDB ulanish xatosi:", err));
// User modeli
const User = mongoose.model("User", new mongoose.Schema({
  username: String,
  chatId: String
}));

// Movie modeli
const Movie = mongoose.model("Movie", new mongoose.Schema({
  title: String,
  fileId: String
}));

// Oddiy route test
app.get("/", (req, res) => {
  res.send("Server ishlayapti 🚀");
});

// Server ishga tushirish
app.listen(PORT, () => {
  console.log(`✅ Server ${PORT}-portda ishlayapti`);
});
