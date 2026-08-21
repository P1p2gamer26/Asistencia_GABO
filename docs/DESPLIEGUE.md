# Guía de despliegue

Cómo poner el sistema a funcionar para el colegio. Escrita para alguien que sabe
programar pero no conoce este proyecto.

## Lo que hay que entender antes de empezar

**Todo va en un solo contenedor.** El `Dockerfile` compila el frontend, lo mete dentro
del jar como recurso estático y arranca Spring Boot. Un contenedor, un dominio, cero
CORS en producción. Solo hace falta añadir una base de datos PostgreSQL 16.

**HTTPS no es opcional.** Sin él no funcionan dos cosas centrales: la cámara para
escanear carnets (`getUserMedia` solo corre sobre HTTPS o `localhost`) y la
instalación de la aplicación en el teléfono. Un despliegue sin certificado deja el
sistema a medias.

## Dimensionamiento

1.200 estudiantes × 6 bloques × ~190 días lectivos ≈ **1,37 M de registros al año**,
unos **400 MB anuales** contando índices, **~2 GB a cinco años**. No hace falta nada
grande: el cuello de botella del colegio es la conexión, no el servidor.

Con **1 vCPU y 1 GB de RAM** sobra para el contenedor. La base puede vivir en el mismo
servidor o en un servicio gestionado.

## Opción A — Fly.io o Railway (la más rápida)

Despliegan directamente desde el `Dockerfile` y dan HTTPS sin configurar nada.

```bash
# Fly.io
fly launch --dockerfile Dockerfile --no-deploy
fly postgres create --name asistencia-db
fly postgres attach asistencia-db      # inyecta DATABASE_URL
fly secrets set JWT_SECRET="$(openssl rand -base64 48)" \
                MAIL_HOST=smtp.gmail.com MAIL_PORT=587 MAIL_TLS=true \
                MAIL_USER=asistencia@ggm.edu.co MAIL_PASSWORD='...' \
                MAIL_FROM=asistencia@ggm.edu.co \
                MAIL_COORDINACION=coordinacion@ggm.edu.co
fly deploy
```

Fly inyecta `DATABASE_URL` en formato `postgres://...`, pero la aplicación espera
`DB_URL` en formato JDBC. Añadir al `fly.toml`:

```toml
[env]
  DB_URL = "jdbc:postgresql://asistencia-db.flycast:5432/asistencia"
  DB_USER = "postgres"
```
y el password como secreto `DB_PASSWORD`.

## Opción B — Un VPS de 10 USD (más barato, más control)

Hetzner CX22, DigitalOcean o similar, con Docker y Caddy de proxy.

```yaml
# docker-compose.prod.yml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: asistencia
      POSTGRES_USER: asistencia
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes: [pgdata:/var/lib/postgresql/data]
    restart: unless-stopped

  app:
    image: ghcr.io/p1p2gamer26/asistencia-ggm:latest
    environment:
      DB_URL: jdbc:postgresql://db:5432/asistencia
      DB_USER: asistencia
      DB_PASSWORD: ${DB_PASSWORD}
      JWT_SECRET: ${JWT_SECRET}
      MAIL_HOST: ${MAIL_HOST}
      MAIL_PORT: ${MAIL_PORT}
      MAIL_USER: ${MAIL_USER}
      MAIL_PASSWORD: ${MAIL_PASSWORD}
      MAIL_TLS: "true"
      MAIL_FROM: ${MAIL_FROM}
      MAIL_COORDINACION: ${MAIL_COORDINACION}
      NOTIFY_ENABLED: "true"
    depends_on: [db]
    restart: unless-stopped

  caddy:
    image: caddy:2-alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddydata:/data
    depends_on: [app]
    restart: unless-stopped

volumes: { pgdata: {}, caddydata: {} }
```

```
# Caddyfile — Caddy saca y renueva el certificado solo
asistencia.ggm.edu.co {
    reverse_proxy app:8080
}
```

```bash
docker compose -f docker-compose.prod.yml up -d
```

**La imagen es privada**, porque hereda la visibilidad del repositorio. El servidor
tiene que autenticarse antes de poder descargarla:

```bash
# Con un token de GitHub que tenga permiso read:packages
echo "$GITHUB_TOKEN" | docker login ghcr.io -u p1p2gamer26 --password-stdin
```

La alternativa es hacer el paquete público desde GitHub (pestaña Packages > Package
settings > Change visibility). Publicarlo no expone el código fuente, pero sí la
aplicación compilada: si el colegio prefiere no hacerlo, el `docker login` con un
token de solo lectura es la opción correcta.

## Variables de entorno

Obligatorias. Sin ellas el sistema no arranca, o arranca y no manda correos sin avisar.

| Variable | Qué es | Si falta |
|---|---|---|
| `DB_URL` | `jdbc:postgresql://host:5432/asistencia` | no arranca |
| `DB_USER`, `DB_PASSWORD` | credenciales de la base | no arranca |
| `JWT_SECRET` | **32 bytes o más, aleatorios** | arranca con el valor de desarrollo: cualquiera podría fabricar tokens |
| `MAIL_HOST`, `MAIL_PORT` | servidor SMTP institucional | no manda correos |
| `MAIL_USER`, `MAIL_PASSWORD` | credenciales SMTP | no manda correos |
| `MAIL_TLS` | `true` fuera de la red local | credenciales en claro |
| `MAIL_FROM` | remitente visible | |
| `MAIL_COORDINACION` | correo real de coordinación | los avisos de evasión no llegan a nadie |
| `NOTIFY_ENABLED` | `true` para enviar | |

Generar el secreto: `openssl rand -base64 48`. **Nunca dejar el valor por defecto del
`application.yml`**, que está ahí solo para desarrollo.

> Empezar con `NOTIFY_ENABLED=false` la primera semana. Permite ver en la tabla
> `notifications` qué se enviaría, antes de empezar a escribirles a los padres de
> verdad. Cuando el listado se vea sensato, se pone en `true`.

## Primera puesta en marcha

Las migraciones de Flyway corren solas al arrancar: crean el esquema, siembran el
calendario 2026 y crean tres usuarios de prueba con contraseña `cambiar123`.

**Lo primero, antes que nada:** entrar como `admin@ggm.edu.co`, ir a Administración >
Usuarios y cambiar la contraseña de los tres usuarios semilla, o desactivarlos y crear
los reales. Dejarlos como están es dejar la puerta abierta.

Después, en Administración > Carga de datos, en este orden:

1. **Estudiantes** — `document_id,first_name,middle_name,last_name,second_surname,grade`
2. **Horario** — `grade,weekday,block_no,start_time,end_time,subject,teacher_email`
3. **Acudientes** — `document_id,guardian_name,guardian_email,relationship`

El orden importa: los dos últimos necesitan que el estudiante ya exista.

> **Antes de importar, revisar la codificación.** El archivo de origen
> `legacy/Toma de asistencia.xlsx` tiene corrupción visible (`CASTA?EDA`). Hay que
> arreglarla en el CSV **antes** de cargar: después cuesta mucho más, porque los
> nombres mal escritos ya estarán asociados a registros de asistencia.

Por último, en Administración > Calendario, confirmar con la rectoría los recesos
del año. Los festivos nacionales son correctos; los recesos sembrados son los típicos
del calendario A y el colegio puede tener los suyos.

## Copias de seguridad

Con este volumen, un volcado comprimido son unos pocos MB. No hay excusa para no
tenerlo:

```bash
# Diario, a las 2 de la mañana
0 2 * * * docker exec asistencia-db-1 pg_dump -U asistencia asistencia \
  | gzip > /backups/asistencia-$(date +\%F).sql.gz
```

Y llevarlos **fuera del servidor**. Una copia que vive en la misma máquina que la base
no es una copia de seguridad, es una segunda oportunidad de perderlo todo a la vez.

Restaurar:

```bash
gunzip -c asistencia-2026-08-21.sql.gz | docker exec -i asistencia-db-1 psql -U asistencia asistencia
```

## Comprobaciones después de desplegar

1. `https://asistencia.ggm.edu.co/actuator/health` responde `{"status":"UP"}`.
2. Entrar como docente y ver que aparecen sus cursos.
3. **Desde un teléfono**: instalar la aplicación, poner el aparato en modo avión, tomar
   la asistencia de un curso completo, quitar el modo avión y comprobar que los
   registros llegan.
4. Escanear un carnet real y verificar que el número leído coincide con
   `students.document_id`. Si no coincide, el problema son los datos, no el código, y
   es mucho mejor descubrirlo ahora que el primer día de clases.
5. Marcar una evasión y comprobar que llega el correo a coordinación.

Los puntos 3 y 4 no se pueden hacer desde un escritorio: hacen falta un teléfono y un
carnet de verdad.

## Actualizaciones

La integración continua construye la imagen en cada push a `main`. Para actualizar:

```bash
docker compose -f docker-compose.prod.yml pull app
docker compose -f docker-compose.prod.yml up -d app
```

Las migraciones nuevas se aplican solas al arrancar. **Hacer la copia de seguridad
antes de actualizar**, no después.
