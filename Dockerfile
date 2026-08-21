# 1. Frontend: se compila aparte y su salida entra al jar como recurso estatico
FROM node:22-alpine AS frontend
# Se respeta la ruta app/frontend porque src/api/mock.ts importa los fixtures del
# contrato con ../../../contracts/fixtures. Compilar desde una carpeta plana rompe
# esos imports y el build falla solo dentro de la imagen, no en local.
WORKDIR /build/app/frontend
COPY app/frontend/package*.json ./
RUN npm ci
COPY app/contracts/ /build/app/contracts/
COPY app/frontend/ ./
RUN npm run build

# 2. Backend: las dependencias se resuelven antes de copiar el codigo, para
#    aprovechar la cache de capas cuando solo cambia el codigo
FROM maven:3.9-eclipse-temurin-21 AS backend
WORKDIR /app
COPY app/backend/pom.xml ./
RUN mvn -B dependency:go-offline
COPY app/backend/src ./src
COPY --from=frontend /build/app/frontend/dist ./src/main/resources/static
RUN mvn -B clean package -DskipTests

# 3. Imagen final: solo el jre y el jar
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=backend /app/target/asistencia-0.1.0.jar app.jar
EXPOSE 8080
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75"
ENTRYPOINT ["java", "-jar", "app.jar"]
