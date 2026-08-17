import type { Prisma } from "@prisma/client";
import { ConflictError, NotFoundError } from "../../errors/appError.js";
import { Message } from "../../constants/message.js";
import { normalizePhone } from "../../utils/phone.util.js";
import { assertNoReferences } from "../../utils/reference.util.js";
import * as supplierRepository from "./supplier.repository.js";
import type {
  CreateSupplierInput,
  ListSuppliersQuery,
  UpdateSupplierInput,
} from "./supplier.schema.js";

// Tạo nhà cung cấp mới — check trùng code
export async function createSupplier(input: CreateSupplierInput) {
  const existing = await supplierRepository.findByCode(input.code);
  if (existing) {
    throw new ConflictError(Message.SUPPLIER.CODE_ALREADY_EXISTS.message, Message.SUPPLIER.CODE_ALREADY_EXISTS.code);
  }

  return supplierRepository.createSupplier(input);
}

// Danh sách NCC có phân trang — Admin/Manager/Staff đều xem được
export async function listSuppliers(query: ListSuppliersQuery) {
  const where: Prisma.SupplierWhereInput = {};
  if (query.status) {
    where.status = query.status;
  }

  if (query.search) {
    // Nhánh sđt so bằng chuỗi ĐÃ CHUẨN HOÁ, không so nguyên văn: dưới DB số luôn ở dạng
    // 0xxxxxxxxx (xem phone.util.ts), nên gõ "090 123 4567" hay "+84901234567" phải quy về
    // cùng dạng mới khớp. Gõ chữ thì normalizePhone trả rỗng -> bỏ hẳn nhánh này đi.
    const phoneQuery = normalizePhone(query.search);

    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { code: { contains: query.search, mode: "insensitive" } },
      { contactName: { contains: query.search, mode: "insensitive" } },
      { email: { contains: query.search, mode: "insensitive" } },
      ...(phoneQuery ? [{ phone: { contains: phoneQuery } }] : []),
    ];
  }

  const skip = (query.page - 1) * query.limit;

  const [items, total] = await Promise.all([
    supplierRepository.findMany(where, skip, query.limit),
    supplierRepository.count(where),
  ]);

  return { items, total };
}

// Xem chi tiết 1 NCC
export async function getSupplierById(id: string) {
  const supplier = await supplierRepository.findById(id);
  if (!supplier) {
    throw new NotFoundError(Message.SUPPLIER.NOT_FOUND.message, Message.SUPPLIER.NOT_FOUND.code);
  }
  return supplier;
}

// Sửa NCC — Admin only, đổi code thì check trùng (FK thật dùng id nên đổi code không phá liên kết dữ liệu)
export async function updateSupplier(id: string, input: UpdateSupplierInput) {
  const existing = await supplierRepository.findById(id);
  if (!existing) {
    throw new NotFoundError(Message.SUPPLIER.NOT_FOUND.message, Message.SUPPLIER.NOT_FOUND.code);
  }

  if (input.code !== undefined && input.code !== existing.code) {
    const duplicated = await supplierRepository.findByCode(input.code);
    if (duplicated && duplicated.id !== id) {
      throw new ConflictError(
        Message.SUPPLIER.CODE_ALREADY_EXISTS.message,
        Message.SUPPLIER.CODE_ALREADY_EXISTS.code
      );
    }
  }

  return supplierRepository.updateSupplier(id, input);
}

// Xoá hẳn nhà cung cấp — Admin only, chỉ cho xoá khi chưa có phiếu nhập/xuất nào tham chiếu.
// Bắt buộc phải tự đếm: FK của Inbound/Outbound.supplierId trước đây là SET NULL (nay đã đổi
// sang Restrict), và kể cả có Restrict thì lỗi P2003 cũng không nói được vướng bao nhiêu ở đâu.
export async function deleteSupplier(id: string) {
  const existing = await supplierRepository.findById(id);
  if (!existing) {
    throw new NotFoundError(Message.SUPPLIER.NOT_FOUND.message, Message.SUPPLIER.NOT_FOUND.code);
  }

  const { inbound, outbound } = await supplierRepository.countReferences(id);
  assertNoReferences(
    [
      { resource: "inbound", label: "phiếu nhập", count: inbound },
      { resource: "outbound", label: "phiếu xuất", count: outbound },
    ],
    Message.SUPPLIER.IN_USE
  );

  await supplierRepository.deleteSupplier(id);
}
