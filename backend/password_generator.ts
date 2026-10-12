import "server-only";
import { randomInt } from "node:crypto";

const SPECIAL = "!@#$%^&*()_+-=[]{}|;:,.<>?";

export function generatePassword(
  length = 16,
  useUppercase = true,
  useDigits = true,
  useSpecial = true,
): string {
  if (!Number.isInteger(length) || length < 1 || length > 1024) {
    throw new Error("Password length must be between 1 and 1024.");
  }
  if (length < 1 + Number(useUppercase) + Number(useDigits) + Number(useSpecial)) {
    throw new Error("Password length is too short for the selected character sets.");
  }

  const groups = ["abcdefghijklmnopqrstuvwxyz"];
  if (useUppercase) groups.push("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  if (useDigits) groups.push("0123456789");
  if (useSpecial) groups.push(SPECIAL);
  const all = groups.join("");
  const characters = groups.map((group) => group[randomInt(group.length)]);
  while (characters.length < length) characters.push(all[randomInt(all.length)]);
  for (let i = characters.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [characters[i], characters[j]] = [characters[j], characters[i]];
  }
  return characters.join("");
}
