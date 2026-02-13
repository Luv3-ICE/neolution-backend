import bcrypt from "bcryptjs";

const hash = await bcrypt.hash("super123", 10);
console.log(hash);