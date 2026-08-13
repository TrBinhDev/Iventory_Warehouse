import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { uploadFiles } from "./upload.middleware.js";
import * as uploadController from "./upload.controller.js";

const router = Router();

// Mọi user đã đăng nhập đều upload được — Customer/Staff cần để tự đổi avatar qua PATCH /auth/me.
// Không phân quyền theo role ở đây, chặn lạm dụng bằng giới hạn loại file + dung lượng + số lượng.
router.post("/", authenticate, uploadFiles, asyncHandler(uploadController.uploadImages));

export { router as uploadRouter };
