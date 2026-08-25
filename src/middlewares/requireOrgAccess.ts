// import { Request, Response, NextFunction } from "express";
// import prisma from "../lib/prisma";
// // import { AuthRequest } from './auth.middleware'; // Your existing auth middleware

// // Extend Express Request interface to include membership and organizationId
// declare global {
//   namespace Express {
//     interface Request {
//       membership?: any;
//       organizationId?: string;
//     }
//   }
// }

// export const requireOrgAccess = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   try {
//     const organizationId = req.params.organizationId as string;

//     if (!organizationId) {
//       return res.status(400).json({
//         success: false,
//         message: "Organization ID is required",
//       });
//     }

//     const user = req.user;

//     if (!user) {
//       return res.status(401).json({
//         success: false,
//         message: "Unauthorized",
//       });
//     }

//     // Super Admin has access to everything
//     if (user.globalRole === "SUPER_ADMIN" || user.globalRole === "ADMIN") {
//       return next();
//     }

//     // Check if user is a member of this organization
//     const membership = await prisma.membership.findFirst({
//       where: {
//         userId: user.id,
//         organizationId: organizationId as string,
//       },
//     });

//     if (!membership) {
//       return res.status(403).json({
//         success: false,
//         message: "You do not have access to this organization",
//       });
//     }

//     // Optional: Attach membership/role to request for later use
//     req.membership = membership;
//     req.organizationId = organizationId;

//     next();
//   } catch (error) {
//     console.error("requireOrgAccess middleware error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Internal server error",
//     });
//   }
// };
