import type { UserRole } from "@prisma/client";
import { hashPassword } from "../../utils/hash.util.js";
import { ConflictError, ForbiddenError } from "../../errors/appError.js";
import * as userRepository from "./user.repository.js";
import type { CreateUserInput } from "./user.schema.js";

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
