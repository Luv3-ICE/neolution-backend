import { verifyToken } from "../utils/jwt.js";

export function requireAuth(req, res, next) {
  const auth = req.headers.authorization;

  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const token = auth.split(" ")[1];
    const decoded = verifyToken(token);

    // 🔴 ป้องกัน CMS token มาใช้กับ web route
    if (decoded.type !== "web") {
      return res.status(403).json({ error: "Invalid token type" });
    }

    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}
