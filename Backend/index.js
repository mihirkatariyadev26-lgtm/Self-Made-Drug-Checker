import express from "express";
const app = express();
import { configDotenv } from "dotenv";
import { medicineRouter } from "./routes/medicineData.js";
app.use(express.json());
app.use(medicineRouter);
configDotenv();
app.listen(process.env.PORT, () => {
  console.log(`Application is running on ${process.env.Port}`);
});
