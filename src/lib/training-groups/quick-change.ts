export type GroupChoice = {
  id: string; name: string; program: string; gender: string; campus_id: string; campus: string;
  birth_year_min: number | null; birth_year_max: number | null;
  start_time: string | null; end_time: string | null; professor: string | null;
  schedule: { day: number; start: string; end: string }[];
};
export type GroupChangeOptions = {
  player: { id: string; name: string; birth_date: string | null };
  enrollments: { id: string; campus_id: string; campus: string; assignments: { id: string; group_id: string; name: string }[] }[];
  groups: GroupChoice[];
};
export type GroupSearchPlayer = { id: string; name: string; birth_date: string | null; campus: string };
export function isSuggestedGroup(group: GroupChoice, year: number | null) {
  if (!year || (group.birth_year_min == null && group.birth_year_max == null)) return false;
  return year >= (group.birth_year_min ?? group.birth_year_max!) && year <= (group.birth_year_max ?? group.birth_year_min!);
}
export function groupChoiceLabel(group: GroupChoice) {
  const years = [group.birth_year_min, group.birth_year_max].filter((y): y is number => y != null);
  const category = [...new Set(years)].join('/');
  return `${group.campus} | ${group.program === 'selectivo' ? 'Selectivo ' : group.program === 'little_dragons' ? 'Little Dragons ' : ''}${category || group.name}${group.gender === 'female' ? ' Femenil' : ''}`;
}
export function groupChoiceDetail(group: GroupChoice) {
  const days = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
  const schedule = group.schedule.map(s => `${days[s.day] ?? s.day} ${s.start.slice(0,5)}-${s.end.slice(0,5)}`).join(', ');
  return `Profesor: ${group.professor || 'Sin asignar'} | ${schedule || (group.start_time ? `${group.start_time.slice(0,5)}-${group.end_time?.slice(0,5) ?? ''}` : 'Sin horario')}`;
}
