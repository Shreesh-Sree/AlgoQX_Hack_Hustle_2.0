import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import gstRouter from "./routes/gst";

const app: Express = express();

app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api", gstRouter);

export default app;
