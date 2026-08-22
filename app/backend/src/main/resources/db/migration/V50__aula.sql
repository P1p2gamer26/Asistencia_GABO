ALTER TABLE schedule_blocks ADD COLUMN room VARCHAR(60);

COMMENT ON COLUMN schedule_blocks.room IS
  'Aula donde se dicta el bloque. Opcional: no todos los colegios asignan aula fija.';
