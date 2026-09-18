-- Revisi V5 §1 follow-up — countries whose name differs from NEGARA.csv
-- (older rows spelled "South Korea", "Taiwan", "Vietnam") get the CSV's
-- coordinates by ISO code instead. Only fills rows still without coordinates.
update negara n
   set latitude = v.lat, longitude = v.lng
  from (values
    ('KOR', 37.5665, 126.978),     -- NEGARA.csv: Korea, Republic Of
    ('TWN', 25.033, 121.5654),     -- NEGARA.csv: Taiwan, Province Of China
    ('VNM', 21.0278, 105.8342)     -- NEGARA.csv: Viet Nam
  ) as v(kode, lat, lng)
 where n.kode = v.kode and n.latitude is null;
