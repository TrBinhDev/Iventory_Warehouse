import type { Prisma, UserRole } from "@prisma/client";
import { hashPassword } from "../../utils/hash.util.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../errors/appError.js";
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
      throw new ForbiddenError(
        "Manager chỉ được tạo tài khoản Warehouse Staff",
        "FORBIDDEN_ROLE"
      );
    }
    if (input.warehouseId !== actor.warehouseId) {
      throw new ForbiddenError(
        "Manager chỉ được tạo tài khoản cho đúng kho mình quản lý",
        "FORBIDDEN_WAREHOUSE"
      );
    }
  }

  const existing = await userRepository.findByEmail(input.email);
  if (existing) {
    throw new ConflictError("Email đã được sử dụng", "EMAIL_ALREADY_EXISTS");
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
    throw new NotFoundError("Không tìm thấy tài khoản", "USER_NOT_FOUND");
  }
}

// Xem chi tiết 1 tài khoản — Manager chỉ xem được Staff cùng kho
export async function getUserById(actor: Actor, id: string) {
  const user = await userRepository.findByIdSafe(id);
  if (!user) {
    throw new NotFoundError("Không tìm thấy tài khoản", "USER_NOT_FOUND");
  }

  assertManagerCanAccess(actor, user);

  return user;
}

// Sửa tài khoản — Admin sửa mọi field/mọi user (trừ tự đổi role chính mình);
// Manager chỉ sửa Staff cùng kho, không được đụng role/warehouseId
export async function updateUser(actor: Actor, id: string, input: UpdateUserInput) {
  const target = await userRepository.findByIdSafe(id);
  if (!target) {
    throw new NotFoundError("Không tìm thấy tài khoản", "USER_NOT_FOUND");
  }

  assertManagerCanAccess(actor, target);

  if (actor.role === "WAREHOUSE_MANAGER" && (input.role !== undefined || input.warehouseId !== undefined)) {
    throw new ForbiddenError("Manager không được sửa role/warehouseId", "FORBIDDEN_FIELD");
  }

  if (input.role !== undefined && actor.id === target.id) {
    throw new ForbiddenError("Không thể tự đổi role của chính mình", "CANNOT_CHANGE_OWN_ROLE");
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
        "warehouseId bắt buộc với Manager/Staff, không được có với Admin — cần gửi kèm warehouseId phù hợp khi đổi role",
        "INVALID_ROLE_WAREHOUSE_COMBINATION"
      );
    }
  }

  if (input.email !== undefined && input.email !== target.email) {
    const existing = await userRepository.findByEmail(input.email);
    if (existing && existing.id !== target.id) {
      throw new ConflictError("Email đã được sử dụng", "EMAIL_ALREADY_EXISTS");
    }
  }

  return userRepository.updateUser(id, {
    fullName: input.fullName,
    phone: input.phone,
    avatarUrl: input.avatarUrl,
    email: input.email,
    status: input.status,
    role: input.role,
    warehouseId: input.warehouseId,
  });
}
