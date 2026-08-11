import type { Prisma, UserRole } from "@prisma/client";
import { hashPassword } from "../../utils/hash.util.js";
import { ConflictError, ForbiddenError } from "../../errors/appError.js";
import * as userRepository from "./user.repository.js";
import type { CreateUserInput, ListUsersQuery } from "./user.schema.js";

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
