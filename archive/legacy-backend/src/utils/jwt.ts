import jwt, { JwtPayload } from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const jwtSecret: string = process.env.JWT_SECRET || "";

if (!jwtSecret) {
  throw new Error("JWT_SECRET is not defined in environment variables");
}

class TokenService {
  generateToken(userId: string, role: string): string {
    return jwt.sign({ userId, role }, jwtSecret, { expiresIn: "14d" });
  }

  generateResetToken(userId: string, role: string): string {
    return jwt.sign({ userId, role }, jwtSecret, { expiresIn: "15m" });
  }

  generateRefreshToken(userId: string, role: string): string {
    return jwt.sign({ userId, role }, jwtSecret, { expiresIn: "14d" });
  }

  verifyToken(token: string): string | JwtPayload {
    return jwt.verify(token, jwtSecret);
  }
}

export const tokenService = new TokenService();
