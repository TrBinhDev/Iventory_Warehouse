import { z } from "zod";
import { decimalStringSchema } from "../../utils/decimal.util.js";

// Payload tạo sản phẩm mới, kèm gán category (optional)
export const createProductSchema = z.object({
  code: z.string().min(1, "Mã sản phẩm không được để trống").max(50, "Mã tối đa 50 ký tự"),
  name: z.string().min(1, "Tên sản phẩm không được để trống").max(255),
  description: z.string().optional(),
  unit: z.string().min(1, "Đơn vị tính không được để trống").max(20),
  images: z.array(z.string().url("URL ảnh không hợp lệ")).optional(),
  categoryIds: z.array(z.string().uuid("categoryId không hợp lệ")).optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

// Query params cho danh sách sản phẩm (phân trang + filter status/category + search tên/mã)
export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  categoryId: z.string().uuid("categoryId không hợp lệ").optional(),
  search: z.string().min(1).max(255).optional(),
});

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

// Param :id dùng chung cho GET/PATCH /products/:id
export const productIdParamSchema = z.object({
  id: z.string().uuid("id không hợp lệ"),
});

export type ProductIdParam = z.infer<typeof productIdParamSchema>;

// Payload sửa sản phẩm (partial update) — categoryIds nếu gửi thì set lại TOÀN BỘ danh sách category
export const updateProductSchema = z.object({
  code: z.string().min(1, "Mã sản phẩm không được để trống").max(50, "Mã tối đa 50 ký tự").optional(),
  name: z.string().min(1, "Tên sản phẩm không được để trống").max(255).optional(),
  description: z.string().optional(),
  unit: z.string().min(1, "Đơn vị tính không được để trống").max(20).optional(),
  images: z.array(z.string().url("URL ảnh không hợp lệ")).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  categoryIds: z.array(z.string().uuid("categoryId không hợp lệ")).optional(),
});

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// Param :productId dùng cho các route lồng /products/:productId/skus...
export const productIdRouteParamSchema = z.object({
  productId: z.string().uuid("productId không hợp lệ"),
});

export type ProductIdRouteParam = z.infer<typeof productIdRouteParamSchema>;

// Payload tạo SKU (biến thể) mới cho 1 sản phẩm
export const createSkuSchema = z.object({
  skuCode: z.string().min(1, "Mã SKU không được để trống").max(50, "Mã tối đa 50 ký tự"),
  barcode: z.string().max(50).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  price: decimalStringSchema(2, "Giá không hợp lệ (số, tối đa 2 chữ số thập phân)"),
  cost: decimalStringSchema(2, "Giá vốn không hợp lệ (số, tối đa 2 chữ số thập phân)").optional(),
  weight: decimalStringSchema(3, "Khối lượng không hợp lệ (số, tối đa 3 chữ số thập phân)").optional(),
});

export type CreateSkuInput = z.infer<typeof createSkuSchema>;

// Param :productId + :skuId dùng cho GET/PATCH chi tiết 1 SKU
export const productSkuParamSchema = z.object({
  productId: z.string().uuid("productId không hợp lệ"),
  skuId: z.string().uuid("skuId không hợp lệ"),
});

export type ProductSkuParam = z.infer<typeof productSkuParamSchema>;
