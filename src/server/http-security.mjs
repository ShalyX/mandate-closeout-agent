import crypto from "node:crypto";

export function verifyBearerSecret(authorization, secret) {
  if (!secret || typeof authorization !== "string") return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authorization);
  return (
    actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected)
  );
}
