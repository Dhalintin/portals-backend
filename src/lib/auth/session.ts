// import type { Session, SessionUser } from "./types";

// const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
// const COOKIE_NAME = "access_token";

// export async function getAccessToken(): Promise<string | undefined> {
//   //   const jar = await cookies();
//   return jar.get(COOKIE_NAME)?.value;
// }

// /** Server Components / layouts / Route Handlers */
// export async function getSession(): Promise<Session | null> {
//   const token = await getAccessToken();
//   if (!token) return null;

//   try {
//     const res = await fetch(`${API_URL}/auth/me`, {
//       headers: { Authorization: `Bearer ${token}` },
//       cache: "no-store",
//     });
//     if (!res.ok) return null;
//     const data = (await res.json()) as { user: SessionUser };
//     return { user: data.user, accessToken: token };
//   } catch {
//     return null;
//   }
// }

// export async function getSessionUser(): Promise<SessionUser | null> {
//   const session = await getSession();
//   return session?.user ?? null;
// }
