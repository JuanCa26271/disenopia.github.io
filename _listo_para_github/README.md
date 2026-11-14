# MAGA · Velas, recuerdos y más

Base de arquitectura para tienda, personalizador y consola interna. El repositorio empieza vacío; esta entrega deja contratos, modelo de datos, utilidades de dominio y una interfaz inicial para continuar el desarrollo.

## Arquitectura

- `apps/storefront`: Next.js para `tienda.maga.com`, sin rutas ni enlaces de administración.
- `apps/admin`: aplicación Next.js independiente para `admin.maga.com` (idealmente tras VPN/Access y allowlist).
- `apps/api`: NestJS REST, único acceso a PostgreSQL. Validación Zod, Prisma, cookies HttpOnly, CORS allowlist por origen y límites de tasa.
- PostgreSQL centralizado; bucket privado S3 compatible para uploads y artes, con URLs firmadas de corta duración.
- TLS termina en proxy gestionado con TLS 1.3/HSTS. Separar despliegues, secretos y dominios; no confiar en ocultar una URL como control de acceso.

Para activar el seed, configura `DATABASE_URL` y `ADMIN_INITIAL_PASSWORD` (puedes copiar `.env.example` a `.env` en la raíz y en `apps/api/.env`), instala dependencias y ejecuta `prisma migrate deploy` seguido de `tsx prisma/seed.ts`. No se incluye una contraseña maestra activa en el repositorio: `M4G4ACCESS` debe usarse solo como secreto temporal fuera de producción y cambiarse en el primer acceso.

## Ejecución tras clonar desde GitHub

1. **Tienda estática / Vista previa interactiva**:
   - Puedes servir la raíz con cualquier servidor estático (o GitHub Pages); `index.html` y `preview.html` redirigen automáticamente a `inicio.html`.
   - Para usar el inicio de sesión de `admin-preview.html` en entorno local sin levantar toda la infraestructura PostgreSQL:
     ```bash
     ADMIN_INITIAL_PASSWORD="TuPasswordTemporal123" npm run auth:local
     ```
2. **Aplicación Next.js (raíz)**:
   ```bash
   cp .env.example .env
   npm install
   npm run dev
   ```
3. **API REST (`apps/api`)**:
   ```bash
   cd apps/api
   cp .env.example .env
   npm install
   npm run db:generate
   npm run db:push
   npm run db:seed
   npm run dev
   ```

## Decisiones de seguridad

Los datos personales se cifran con AES-256-GCM usando clave de 32 bytes obtenida de `CUSTOMER_DATA_KEY` (base64). Cada valor tiene IV aleatorio y tag autenticado. Minimiza retención, limita acceso y no registres PII. Los assets se validan por firma real en servidor y se sirven desde almacenamiento privado. JWT corto y refresh rotativo requieren persistir hashes de refresh y revocación; no guardar tokens en localStorage.

La disponibilidad real requiere HTTPS, gestión de claves, copias de seguridad cifradas, monitoreo, revisión de dependencias, pruebas de seguridad y despliegue segregado. Este scaffold no afirma certificación bancaria ni cumplimiento automático OWASP.

## Dominio

`src/domain/production.ts` incluye estimación de entrega por capacidad diaria y un empaquetador MaxRects con giro. `src/domain/` es independiente del framework para poder probarse y consumirse desde API.

Las medidas físicas se expresan en milímetros. Tabloide 279.4 × 431.8 mm, margen 5 mm. Al exportar PDF a 300 DPI, convertir mm a puntos con `mm * 72 / 25.4`; las marcas de corte se dibujan en el PDF final.
