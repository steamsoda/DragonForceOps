import assert from "node:assert/strict";

const { resolveGuardianPhones } = await import("../src/lib/contacts/guardian-phones.ts");

const primary = {
  isPrimary: true,
  createdAt: "2026-01-01T00:00:00Z",
  phonePrimary: "8111111111",
  phoneSecondary: "8122222222",
};
const secondaryTutor = {
  isPrimary: false,
  createdAt: "2026-01-02T00:00:00Z",
  phonePrimary: "8133333333",
  phoneSecondary: null,
};

assert.deepEqual(resolveGuardianPhones([secondaryTutor, primary]), {
  phone1: "8111111111",
  phone2: "8122222222",
});
assert.deepEqual(resolveGuardianPhones([{ ...primary, phoneSecondary: null }, secondaryTutor]), {
  phone1: "8111111111",
  phone2: "8133333333",
});
assert.deepEqual(resolveGuardianPhones([{ ...primary, phoneSecondary: "8111111111" }, secondaryTutor]), {
  phone1: "8111111111",
  phone2: "8133333333",
});
assert.deepEqual(resolveGuardianPhones([]), { phone1: null, phone2: null });

console.log("Guardian phone resolution assertions passed.");
