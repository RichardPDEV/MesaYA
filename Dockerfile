# syntax=docker/dockerfile:1

# Build
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw -B -DskipTests dependency:go-offline
COPY src ./src
RUN ./mvnw -B -DskipTests package

# Run
FROM eclipse-temurin:21-jre-jammy
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75.0 -XX:+UseZGC"
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["sh","-c","java $JAVA_OPTS -jar app.jar"]
