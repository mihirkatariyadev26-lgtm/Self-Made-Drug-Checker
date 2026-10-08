import express from "express";
import cors from "cors";
const app = express();
import { configDotenv } from "dotenv";
import { medicineRouter } from "./routes/medicineData.js";
app.use(cors({ origin: "https://drug-checker-7m5j.onrender.com" }));
app.use(express.json());
app.use(medicineRouter);
configDotenv();
app.listen(process.env.PORT, () => {
  console.log(`Application is running on ${process.env.Port}`);
});
