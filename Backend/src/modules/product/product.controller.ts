import type { Request, Response } from "express";
import { HttpStatus } from "../../constants/httpStatus.js";
import { sendSuccess } from "../../utils/response.util.js";
import * as productService from "./product.service.js";
import type {
  ListProductsQuery,
  ProductIdParam,
  ProductIdRouteParam,
} from "./product.schema.js";

// Xử lý request tạo sản phẩm mới
export async function createProduct(req: Request, res: Response): Promise<void> {
  const product = await productService.createProduct(req.body);
  sendSuccess(res, HttpStatus.CREATED, product);
}

// Xử lý request lấy danh sách sản phẩm (phân trang)
export async function listProducts(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListProductsQuery;
  const { items, total } = await productService.listProducts(query);
  sendSuccess(res, HttpStatus.OK, items, {
    page: query.page,
    limit: query.limit,
    total,
  });
}

// Xử lý request xem chi tiết 1 sản phẩm
export async function getProductById(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as ProductIdParam;
  const product = await productService.getProductById(id);
  sendSuccess(res, HttpStatus.OK, product);
}

// Xử lý request sửa sản phẩm
export async function updateProduct(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as ProductIdParam;
  const product = await productService.updateProduct(id, req.body);
  sendSuccess(res, HttpStatus.OK, product);
}

// Xử lý request tạo SKU mới cho 1 sản phẩm
export async function createSku(req: Request, res: Response): Promise<void> {
  const { productId } = req.params as unknown as ProductIdRouteParam;
  const sku = await productService.createSku(productId, req.body);
  sendSuccess(res, HttpStatus.CREATED, sku);
}
