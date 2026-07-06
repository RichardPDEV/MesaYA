# Producción rápida

## 1) Variables de entorno
Copia los ejemplos y reemplaza los valores reales:

```bash
cp .env.production.example .env
cp frontend/.env.production.example frontend/.env
```

## 2) Build del backend
```bash
./mvnw -DskipTests package
```

## 3) Build del frontend
```bash
cd frontend
npm install
npm run build
```

## 4) Servidor remoto por SSH
Ajusta los valores en deploy-production.sh y ejecútalo:

```bash
bash deploy-production.sh
```

## 5) Configuración recomendada para tu subdominio
- Frontend: https://reservas.tu-dominio.com
- API: https://api.reservas.tu-dominio.com
- Cookies: SameSite=None, Secure=true
- CORS: solo los orígenes del frontend

## Correo de confirmación de usuarios
Configura las siguientes variables de entorno para enviar correos de confirmación:

```bash
MAIL_HOST=smtp.tuservidor.com
MAIL_PORT=587
MAIL_USERNAME=usuario
MAIL_PASSWORD=secreto
MAIL_SMTP_AUTH=true
MAIL_SMTP_STARTTLS=true
MAIL_FROM=reservas@tu-dominio.com
```

