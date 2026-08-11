const SURNAME_PARTICLES = new Set(["da", "das", "de", "del", "dos", "la", "las", "los", "san", "santa"]);

export function compactPlayerName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return parts.join(" ");

  let surnameStart = parts.length === 3 ? 1 : Math.floor(parts.length / 2);
  while (surnameStart > 1 && SURNAME_PARTICLES.has(parts[surnameStart - 1].toLocaleLowerCase("es-MX"))) {
    surnameStart -= 1;
  }

  const surname: string[] = [];
  for (let index = surnameStart; index < parts.length; index += 1) {
    surname.push(parts[index]);
    if (!SURNAME_PARTICLES.has(parts[index].toLocaleLowerCase("es-MX"))) break;
  }

  return [parts[0], ...surname].join(" ");
}
