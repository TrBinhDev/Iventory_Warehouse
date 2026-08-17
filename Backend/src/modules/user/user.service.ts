import type { Prisma, UserRole } from "@prisma/client";
import { hashPassword } from "../../utils/hash.util.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../errors/appError.js";
import { Message } from "../../constants/message.js";
import { phoneSearchTerm } from "../../utils/phone.util.js";
import { deleteFilesByUrls } from "../../utils/storage.util.js";
import { assertNoReferences } from "../../utils/reference.util.js";
import { destroySession } from "../../utils/session.util.js";
import * as userRepository from "./user.repository.js";
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from "./user.schema.js";

interface Actor {
  id: string;
  role: UserRole;
  warehouseId: string | null;
}

// Tạo tài khoản Admin/Manager/Staff — Manager bị giới hạn chỉ tạo Staff đúng kho mình quản lý
export async function createUser(actor: Actor, input: CreateUserInput) {
  if (actor.role === "WAREHOUSE_MANAGER") {
    if (input.role !== "WAREHOUSE_STAFF") {
      throw new ForbiddenError(Message.USER.FORBIDDEN_ROLE.message, Message.USER.FORBIDDEN_ROLE.code);
    }
    if (input.warehouseId !== actor.warehouseId) {
      throw new ForbiddenError(
        Message.USER.FORBIDDEN_WAREHOUSE.message,
        Message.USER.FORBIDDEN_WAREHOUSE.code
      );
    }
  }

  const existing = await userRepository.findByEmail(input.email);
  if (existing) {
    throw new ConflictError(Message.USER.EMAIL_ALREADY_EXISTS.message, Message.USER.EMAIL_ALREADY_EXISTS.code);
  }

  const passwordHash = await hashPassword(input.password);

  return userRepository.createUser({
    fullName: input.fullName,
    email: input.email,
    passwordHash,
    phone: input.phone,
    role: input.role,
    warehouseId: input.warehouseId ?? null,
  });
}

// Danh sách tài khoản có phân trang — Manager bị ép cứng chỉ xem Staff cùng kho mình
export async function listUsers(actor: Actor, query: ListUsersQuery) {
  const where: Prisma.UserWhereInput = {};

  if (actor.role === "WAREHOUSE_MANAGER") {
    where.role = "WAREHOUSE_STAFF";
    where.warehouseId = actor.warehouseId;
  } else if (query.role) {
    where.role = query.role;
  }

  if (query.status) {
    where.status = query.status;
  }

  if (query.search) {
    // Nhánh sđt so bằng chuỗi ĐÃ CHUẨN HOÁ (xem phone.util.ts); ít hơn 3 chữ số thì phoneSearchTerm
    // trả null -> bỏ hẳn nhánh đó đi.
    //
    // Đặt vào where.OR nên nó CỘNG DỒN với 2 điều kiện ép ở trên, không thay thế: Manager gõ
    // email của Admin vẫn ra rỗng vì where.role/where.warehouseId vẫn còn nguyên.
    const phoneQuery = phoneSearchTerm(query.search);

    where.OR = [
      { fullName: { contains: query.search, mode: "insensitive" } },
      { email: { contains: query.search, mode: "insensitive" } },
      ...(phoneQuery ? [{ phone: { contains: phoneQuery } }] : []),
    ];
  }

  const skip = (query.page - 1) * query.limit;

  const [items, total] = await Promise.all([
    userRepository.findMany(where, skip, query.limit),
    userRepository.count(where),
  ]);

  return { items, total };
}

// Check Manager chỉ được đụng vào Staff cùng warehouse — throw NotFound (không phải Forbidden) để không lộ
// sự tồn tại của tài khoản ngoài phạm vi cho Manager biết
function assertManagerCanAccess(actor: Actor, target: { role: UserRole; warehouseId: string | null }): void {
  if (actor.role !== "WAREHOUSE_MANAGER") {
    return;
  }
  if (target.role !== "WAREHOUSE_STAFF" || target.warehouseId !== actor.warehouseId) {
    throw new NotFoundError(Message.USER.NOT_FOUND.message, Message.USER.NOT_FOUND.code);
  }
}

// Xem chi tiết 1 tài khoản — Manager chỉ xem được Staff cùng kho
export async function getUserById(actor: Actor, id: string) {
  const user = await userRepository.findByIdSafe(id);
  if (!user) {
    throw new NotFoundError(Message.USER.NOT_FOUND.message, Message.USER.NOT_FOUND.code);
  }

  assertManagerCanAccess(actor, user);

  return user;
}

// Sửa tài khoản — Admin sửa mọi field/mọi user (trừ tự đổi role chính mình);
// Manager chỉ sửa Staff cùng kho, không được đụng role/warehouseId
export async function updateUser(actor: Actor, id: string, input: UpdateUserInput) {
  const target = await userRepository.findByIdSafe(id);
  if (!target) {
    throw new NotFoundError(Message.USER.NOT_FOUND.message, Message.USER.NOT_FOUND.code);
  }

  assertManagerCanAccess(actor, target);

  if (actor.role === "WAREHOUSE_MANAGER" && (input.role !== undefined || input.warehouseId !== undefined)) {
    throw new ForbiddenError(Message.USER.FORBIDDEN_FIELD.message, Message.USER.FORBIDDEN_FIELD.code);
  }

  if (input.role !== undefined && actor.id === target.id) {
    throw new ForbiddenError(
      Message.USER.CANNOT_CHANGE_OWN_ROLE.message,
      Message.USER.CANNOT_CHANGE_OWN_ROLE.code
    );
  }

  if (input.role !== undefined || input.warehouseId !== undefined) {
    const resultingRole = input.role ?? target.role;
    const resultingWarehouseId =
      input.warehouseId !== undefined ? input.warehouseId : target.warehouseId;

    const isConsistent =
      resultingRole === "ADMIN"
        ? resultingWarehouseId === null
        : resultingWarehouseId !== null;

    if (!isConsistent) {
      throw new BadRequestError(
        Message.USER.INVALID_ROLE_WAREHOUSE_COMBINATION.message,
        Message.USER.INVALID_ROLE_WAREHOUSE_COMBINATION.code
      );
    }
  }

  if (input.email !== undefined && input.email !== target.email) {
    const existing = await userRepository.findByEmail(input.email);
    if (existing && existing.id !== target.id) {
      throw new ConflictError(Message.USER.EMAIL_ALREADY_EXISTS.message, Message.USER.EMAIL_ALREADY_EXISTS.code);
    }
  }

  const updated = await userRepository.updateUser(id, {
    fullName: input.fullName,
    phone: input.phone,
    avatarUrl: input.avatarUrl,
    email: input.email,
    status: input.status,
    role: input.role,
    warehouseId: input.warehouseId,
  });

  // Huỷ phiên đăng nhập khi quyền hạn hoặc trạng thái thay đổi.
  // Access token là stateless nên authenticate không biết role/status vừa đổi — nếu không huỷ
  // session thì người bị khoá hoặc bị hạ quyền vẫn dùng token cũ tới khi hết hạn, và còn gia hạn
  // được qua /auth/refresh. Huỷ session bắt họ đăng nhập lại, lúc đó token mới mang đúng quyền.
  const isBlocked = input.status !== undefined && input.status !== "ACTIVE";
  const isRoleChanged = input.role !== undefined && input.role !== target.role;
  const isWarehouseChanged =
    input.warehouseId !== undefined && input.warehouseId !== target.warehouseId;

  if (isBlocked || isRoleChanged || isWarehouseChanged) {
    await destroySession(target.id);
  }

  // Đổi avatar thì xoá ảnh cũ trên R2 (gọi sau khi DB xong, best-effort)
  if (input.avatarUrl !== undefined && target.avatarUrl && target.avatarUrl !== input.avatarUrl) {
    await deleteFilesByUrls([target.avatarUrl]);
  }

  return updated;
}

// Xoá hẳn tài khoản — CHỈ Admin (khác với create/update mà Manager cũng làm được):
// sửa sai còn sửa lại được, xoá là mất luôn. Manager muốn dọn nhân viên nghỉ việc thì
// chuyển status INACTIVE qua PATCH, việc đó họ vốn đã làm được.
// Không cho tự xoá chính mình — xoá hết admin thì không ai vào quản trị được nữa.
export async function deleteUser(actor: Actor, id: string) {
  const target = await userRepository.findByIdSafe(id);
  if (!target) {
    throw new NotFoundError(Message.USER.NOT_FOUND.message, Message.USER.NOT_FOUND.code);
  }

  if (actor.id === target.id) {
    throw new BadRequestError(
      Message.USER.CANNOT_DELETE_SELF.message,
      Message.USER.CANNOT_DELETE_SELF.code
    );
  }

  const counts = await userRepository.countReferences(id);
  assertNoReferences(
    [
      { resource: "reservation", label: "phiếu giữ chỗ", count: counts.reservation },
      { resource: "salesOrder", label: "đơn hàng", count: counts.salesOrder },
      { resource: "inbound", label: "phiếu nhập", count: counts.inbound },
      { resource: "outbound", label: "phiếu xuất", count: counts.outbound },
      { resource: "transfer", label: "phiếu chuyển kho", count: counts.transfer },
      { resource: "inventoryAdjustment", label: "phiếu điều chỉnh", count: counts.adjustment },
      { resource: "inventoryMovement", label: "biến động tồn kho", count: counts.movement },
      {
        resource: "documentStatusHistory",
        label: "lịch sử chuyển trạng thái chứng từ",
        count: counts.statusHistory,
      },
    ],
    Message.USER.IN_USE
  );

  await userRepository.deleteUser(id);

  // Huỷ session để access token còn hiệu lực không dùng tiếp được, đồng thời dọn key
  // session:<userId> trong Redis (key có TTL 7 ngày, không huỷ thì nằm rác tới lúc hết hạn)
  await destroySession(id);

  // Dọn avatar trên R2 sau khi DB đã xong (best-effort, cùng nguyên tắc với A5)
  if (target.avatarUrl) {
    await deleteFilesByUrls([target.avatarUrl]);
  }
}
