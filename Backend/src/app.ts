import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { notFoundHandler } from "./middlewares/notFoundHandler.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { userRouter } from "./modules/user/user.routes.js";
import { warehouseRouter } from "./modules/warehouse/warehouse.routes.js";
import { supplierRouter } from "./modules/supplier/supplier.routes.js";
import { categoryRouter } from "./modules/category/category.routes.js";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRouter);
app.use("/users", userRouter);
app.use("/warehouses", warehouseRouter);
app.use("/suppliers", supplierRouter);
app.use("/categories", categoryRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
