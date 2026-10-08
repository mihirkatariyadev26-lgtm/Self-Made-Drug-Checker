import { checkDrugInteraction } from "../controller/fetchDrug.js";
import { Router } from "express";

export const medicineRouter = Router();

medicineRouter.get("/getMedicineData", checkDrugInteraction);
medicineRouter.post("/getMedicineData", checkDrugInteraction);
