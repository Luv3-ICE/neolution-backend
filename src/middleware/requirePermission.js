export function requirePermission(permissionName) {
  return (req, res, next) => {
    if (!req.admin?.permissions?.includes(permissionName)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}
