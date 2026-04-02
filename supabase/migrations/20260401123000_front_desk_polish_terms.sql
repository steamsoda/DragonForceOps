update public.charge_types
set name = 'Uniformes de Juego'
where code = 'uniform_game';

update public.products
set name = 'Uniformes de Juego'
where name in ('Uniforme Partido', 'Uniforme de Partido');
