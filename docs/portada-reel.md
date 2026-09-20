# Reel de portada (`app/frontend/public/videos/portada.mp4`)

Siete tomas del colegio unidas con fundidos de 0,8 s, sin audio, 720p, ~9 MB, 61 s.
Fuentes en `Downloads/videos ggx`: `Dron-entrada-aerea.mp4`, `Dron-bici-barrio.mp4`
y cortes de `PSU_GGM_v2_yt.mp4` (8 s, 28 s, 178 s, 204 s, 272 s).

Para rehacerlo: cortar cada toma con `ffmpeg -ss <inicio> -t <dur> -an -vf scale=1280:720,fps=30`
y encadenarlas con `xfade=transition=fade:duration=0.8`; exportar con `-crf 26 -movflags +faststart`.
