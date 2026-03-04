export type ParsedPlayerInput = {
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: "male" | "female" | null;
  medicalNotes: string | null;
  guardianFirstName: string;
  guardianLastName: string;
  guardianPhone: string;
  guardianPhoneSecondary: string | null;
  guardianEmail: string | null;
  guardianRelationship: string | null;
};

export function parsePlayerFormData(formData: FormData): ParsedPlayerInput | null {
  const firstName = (formData.get("firstName") as string | null)?.trim() ?? "";
  const lastName = (formData.get("lastName") as string | null)?.trim() ?? "";
  const birthDate = (formData.get("birthDate") as string | null)?.trim() ?? "";
  const genderRaw = (formData.get("gender") as string | null) ?? "";
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
    medicalNotes,
    guardianFirstName,
    guardianLastName,
    guardianPhone,
    guardianPhoneSecondary,
    guardianEmail,
    guardianRelationship
  };
}
