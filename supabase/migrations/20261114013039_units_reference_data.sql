-- Reference data: the 7 real units exist in every environment (prod has no seed).
insert into public.units (id, kind, name, sort_order) values
  ('estaca', 'stake', 'Estaca Criciúma', 1),
  ('criciuma1', 'ward', 'Ala Criciúma 1', 2),
  ('criciuma2', 'ward', 'Ala Criciúma 2', 3),
  ('criciuma3', 'ward', 'Ala Criciúma 3', 4),
  ('icara', 'ward', 'Ala Içara', 5),
  ('ararangua', 'ward', 'Ala Araranguá', 6),
  ('ramoGaivota', 'branch', 'Ramo Gaivota', 7)
on conflict (id) do nothing;
