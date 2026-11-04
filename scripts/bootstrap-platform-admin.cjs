// Run after build/migrations. Secrets come from environment, never command arguments.
require("dotenv/config");
const { prisma } = require("../dist/lib/prisma");
const { hashPassword } = require("../dist/lib/password");
async function main() {
  const email = (process.env.SCHOOLOS_ADMIN_EMAIL || "").trim().toLowerCase(),
    password = process.env.SCHOOLOS_ADMIN_PASSWORD || "",
    firstName = (process.env.SCHOOLOS_ADMIN_FIRST_NAME || "").trim(),
    lastName = (process.env.SCHOOLOS_ADMIN_LAST_NAME || "").trim();
  delete process.env.SCHOOLOS_ADMIN_PASSWORD;
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    !firstName ||
    !lastName ||
    firstName.length > 80 ||
    lastName.length > 80
  )
    throw new Error(
      "Set SCHOOLOS_ADMIN_EMAIL, SCHOOLOS_ADMIN_FIRST_NAME and SCHOOLOS_ADMIN_LAST_NAME."
    );
  if (
    password.length < 12 ||
    Buffer.byteLength(password, "utf8") > 72 ||
    !/[A-Za-z]/.test(password) ||
    !/[0-9]/.test(password)
  )
    throw new Error(
      "Set SCHOOLOS_ADMIN_PASSWORD to at least 12 characters including a letter and number, at most 72 UTF-8 bytes."
    );
  const passwordHash = await hashPassword(password);
  // Establish the remote connection before Prisma starts its transaction timer.
  // A cold hosted database can take longer than the default acquisition window.
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw new Error(
      "Could not connect to the database. Check DATABASE_URL and database availability, then rerun this command."
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('platform-team')::bigint)`;
    if (
      await tx.user.count({
        where: { globalRole: "SUPER_ADMIN", isActive: true },
      })
    )
      throw new Error(
        "An active super administrator already exists. Add administrators from Platform team instead."
      );
    if (await tx.user.findUnique({ where: { email } }))
      throw new Error(
        "This email already exists. Use a dedicated platform-administrator email."
      );
    const user = await tx.user.create({
      data: {
        email,
        firstName,
        lastName,
        passwordHash,
        globalRole: "SUPER_ADMIN",
        isActive: true,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "SETTINGS_CHANGED",
        entity: "PlatformUser",
        entityId: user.id,
        metadata: { operation: "INITIAL_SUPER_ADMIN_CREATED" },
      },
    });
  }, { maxWait: 15_000, timeout: 30_000 });
  console.log(
    "Initial platform administrator created. Sign in through the normal login page."
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
