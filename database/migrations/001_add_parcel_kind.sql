USE niyati_canteen;
ALTER TABLE canteen_tables ADD COLUMN kind ENUM('TABLE','PARCEL') NOT NULL DEFAULT 'TABLE' AFTER table_name;
INSERT INTO canteen_tables(table_name,kind,sort_order)
SELECT * FROM (SELECT 'Parcel 1','PARCEL',1) t WHERE NOT EXISTS (SELECT 1 FROM canteen_tables WHERE table_name='Parcel 1')
UNION ALL SELECT * FROM (SELECT 'Parcel 2','PARCEL',2) t WHERE NOT EXISTS (SELECT 1 FROM canteen_tables WHERE table_name='Parcel 2')
UNION ALL SELECT * FROM (SELECT 'Parcel 3','PARCEL',3) t WHERE NOT EXISTS (SELECT 1 FROM canteen_tables WHERE table_name='Parcel 3')
UNION ALL SELECT * FROM (SELECT 'Parcel 4','PARCEL',4) t WHERE NOT EXISTS (SELECT 1 FROM canteen_tables WHERE table_name='Parcel 4')
UNION ALL SELECT * FROM (SELECT 'Parcel 5','PARCEL',5) t WHERE NOT EXISTS (SELECT 1 FROM canteen_tables WHERE table_name='Parcel 5')
UNION ALL SELECT * FROM (SELECT 'Parcel 6','PARCEL',6) t WHERE NOT EXISTS (SELECT 1 FROM canteen_tables WHERE table_name='Parcel 6')
UNION ALL SELECT * FROM (SELECT 'Parcel 7','PARCEL',7) t WHERE NOT EXISTS (SELECT 1 FROM canteen_tables WHERE table_name='Parcel 7')
UNION ALL SELECT * FROM (SELECT 'Parcel 8','PARCEL',8) t WHERE NOT EXISTS (SELECT 1 FROM canteen_tables WHERE table_name='Parcel 8')
UNION ALL SELECT * FROM (SELECT 'Parcel 9','PARCEL',9) t WHERE NOT EXISTS (SELECT 1 FROM canteen_tables WHERE table_name='Parcel 9')
UNION ALL SELECT * FROM (SELECT 'Parcel 10','PARCEL',10) t WHERE NOT EXISTS (SELECT 1 FROM canteen_tables WHERE table_name='Parcel 10');
