import { parseDateOnlyInput } from "@/lib/time";

export type ParsedPlayerInput = {
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: "male" | "female" | null;
  isReturning: boolean;
  medicalNotes: string | null;
  guardianFirstName: string;
  guardianLastName: string;
  guardianPhone: string;
  guardianPhoneSecondary: string | null;
  guardianEmail: string | null;
  guardianRelationship: string | null;
};

export type ParsedSecondaryGuardianInput = {
  firstName: string;
  lastName: string;
  phone: string;
  phoneSecondary: string | null;
  email: string | null;
  relationship: string | null;
};

export function parseSecondaryGuardianFormData(
  formData: FormData
): ParsedSecondaryGuardianInput | null | "invalid" {
  if (String(formData.get("addSecondaryGuardian") ?? "") !== "1") return null;

  const firstName = (formData.get("secondaryGuardianFirstName") as string | null)?.trim() ?? "";
  const lastName = (formData.get("secondaryGuardianLastName") as string | null)?.trim() ?? "";
  const phone = (formData.get("secondaryGuardianPhone") as string | null)?.trim() ?? "";
  const phoneSecondary =
    (formData.get("secondaryGuardianPhoneSecondary") as string | null)?.trim() || null;
  const email = (formData.get("secondaryGuardianEmail") as string | null)?.trim() || null;
  const relationship =
    (formData.get("secondaryGuardianRelationship") as string | null)?.trim() || null;

  if (!firstName || !lastName || !phone) return "invalid";

  return { firstName, lastName, phone, phoneSecondary, email, relationship };
}

export function parsePlayerFormData(formData: FormData): ParsedPlayerInput | null {
  const firstName = (formData.get("firstName") as string | null)?.trim() ?? "";
  const lastName = (formData.get("lastName") as string | null)?.trim() ?? "";
  const birthDate = parseDateOnlyInput((formData.get("birthDate") as string | null) ?? "");
  const genderRaw = (formData.get("gender") as string | null) ?? "";
  const isReturning = String(formData.get("isReturning") ?? "") === "1";
  const medicalNotes = (formData.get("medicalNotes") as string | null)?.trim() || null;
  const guardianFirstName = (formData.get("guardianFirstName") as string | null)?.trim() ?? "";
  const guardianLastName = (formData.get("guardianLastName") as string | null)?.trim() ?? "";
  const guardianPhone = (formData.get("guardianPhone") as string | null)?.trim() ?? "";
  const guardianPhoneSecondary = (formData.get("guardianPhoneSecondary") as string | null)?.trim() || null;
  const guardianEmail = (formData.get("guardianEmail") as string | null)?.trim() || null;
  const guardianRelationship = (formData.get("guardianRelationship") as string | null)?.trim() || null;

  if (!firstName || !lastName || !birthDate) return null;
  if (!guardianFirstName || !guardianLastName || !guardianPhone) return null;

  const gender = genderRaw === "male" || genderRaw === "female" ? genderRaw : null;

  return {
    firstName,
    lastName,
    birthDate,
    gender,
    isReturning,
    medicalNotes,
    guardianFirstName,
    guardianLastName,
    guardianPhone,
    guardianPhoneSecondary,
    guardianEmail,
    guardianRelationship
  };
}
