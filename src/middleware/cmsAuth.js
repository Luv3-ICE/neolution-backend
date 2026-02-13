import { verifyToken } from "../utils/jwt.js";

export function requireCmsAuth(req, res, next) {
  const auth = req.headers.authorization;

  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const token = auth.split(" ")[1];
    const decoded = verifyToken(token);

    if (decoded.type !== "cms") {
      return res.status(403).json({ error: "Invalid token type" });
    }

    req.admin = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}
