import { type User } from "@prisma/client";

export function displayName(user: User): string {
  return `${user.firstName} ${user.lastName}`.trim();
}

export function displayClassName(name: string, arm: string | null): string {
  return arm ? `${name}${arm}` : name;
}
