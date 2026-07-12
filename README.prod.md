# Producción con servidor propio

Si ya tienes el servidor y los subdominios preparados, este proyecto ya está listo para usar esa infraestructura sin depender de Docker Compose.

## 1) Variables de entorno
Copia los ejemplos y reemplaza los valores reales:

```bash
cp .env.example .env
cp frontend/.env.production.example frontend/.env.production
```

## 2) Configuración recomendada para tu subdominio
- Frontend: https://reservas.tu-dominio.com
- API: https://api.reservas.tu-dominio.com
- Cookies: SameSite=None, Secure=true si frontend y API están en dominios distintos
- CORS: solo el origen del frontend

### Backend
En tu archivo .env define algo parecido a:

```bash
SPRING_PROFILES_ACTIVE=prod
DB_URL=jdbc:postgresql://tu-host:5432/reservas
DB_USERNAME=reservas
DB_PASSWORD=tu-password
APP_JWT_SECRET=una-clave-larga-y-aleatoria
APP_CORS_ALLOWED_ORIGINS=https://reservas.tu-dominio.com
APP_COOKIE_SECURE=true
APP_COOKIE_SAMESITE=None
```

### Frontend
En frontend/.env.production define:

```bash
VITE_API_BASE_URL=https://api.reservas.tu-dominio.com
```

## 3) Build del backend
```bash
./mvnw -DskipTests package
```

## 4) Build del frontend
```bash
cd frontend
npm install
npm run build
```

## 5) Publicación en tu servidor
Sube el JAR generado por el backend y los archivos de la carpeta frontend/dist a tus rutas correspondientes, o sirve el frontend con Nginx/Apache y apunta la API a tu subdominio.

## Correo de confirmación de usuarios
Configura estas variables para los correos:

```bash
MAIL_HOST=smtp.tuservidor.com
MAIL_PORT=587
MAIL_USERNAME=usuario
MAIL_PASSWORD=secreto
MAIL_SMTP_AUTH=true
MAIL_SMTP_STARTTLS=true
MAIL_FROM=reservas@tu-dominio.com
```

