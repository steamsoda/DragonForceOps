-- Rename products from "Kit X" to "Uniforme X" to match Porto terminology

update public.products set name = 'Uniforme Entrenamiento' where name = 'Kit Entrenamiento';
update public.products set name = 'Uniforme Partido'       where name = 'Kit Partido';
