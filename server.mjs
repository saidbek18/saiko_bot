// server.mjs
import express from "express";
import mongoose from "mongoose";
import bodyParser from "body-parser";
import dotenv from "dotenv";

// .env fayldan o‘qish
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(bodyParser.json());

// MongoDB ulanish
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB'ga muvaffaqiyatli ulandi"))
  .catch((err) => console.error("❌ MongoDB ulanish xatosi:", err));

// Test route
app.get("/", (req, res) => {
  res.send("Server ishlayapti 🚀 va MongoDB ulangan ✅");
});

// Serverni ishga tushirish
app.listen(PORT, () => {
  console.log(`🚀 Server ${PORT}-portda ishlayapti`);
});
