# Arquitectura de referencia

## Separación

Desplegar tienda y consola como aplicaciones independientes en dominios distintos. La API es un tercer servicio privado que valida permisos; PostgreSQL solo acepta conexiones de la red de API. La tienda no incluye una referencia navegable al host administrativo. El aislamiento por dominio reduce superficie, pero la autorización vive siempre en la API.

## Superficie REST sugerida

| Método | Ruta | Acceso | Uso |
|---|---|---|---|
| GET | `/v1/catalog` | público, limitado | categorías y productos activos |
| POST | `/v1/assets/upload-intent` | sesión checkout | URL firmada de upload; después verificar magic bytes/tamaño |
| POST | `/v1/quotes` | público, limitado | precio y fecha calculados en servidor |
| POST | `/v1/orders` | público, límite estricto | crea cliente cifrado, orden e items en transacción |
| POST | `/v1/admin/session` | público, rate limited | login, bloqueo tras cinco fallos |
| POST | `/v1/admin/session/refresh` | refresh cookie | rotación de refresh token de un solo uso |
| GET/PATCH | `/v1/admin/orders` | admin | tablero y transición de estados auditada |
| CRUD | `/v1/admin/catalog/*` | admin | catálogo, extras, fuentes y plantillas |
| POST | `/v1/admin/print-sheets` | admin | planifica piezas y encola PDF de impresión |

El precio, las opciones, la carga de trabajo, el ticket único y la fecha se recalculan en backend: nunca aceptar totales ni fecha mínima calculados por el navegador. Reservar el número de ticket con secuencia/transacción y clave única. Usar idempotency key al crear pedido.

## Producción e impresión

El motor en `src/domain/production.ts` implementa Best Short Side Fit MaxRects en mm y permite giro. Debe reportar piezas que no caben; no escalar silenciosamente. Exportador PDF debe cargar assets verificados, dibujar placements y marcas de corte dentro del área segura, embebiendo fuentes. Confirmar con impresora que el área no imprimible admite margen de 5 mm. Para trabajos mayores, empaquetar en varias hojas repitiendo el algoritmo con las piezas de overflow.

La fecha de entrega requiere datos consistentes: sumar minutos de todos los pedidos activos y el nuevo, convertir horas diarias a minutos, saltar días bloqueados, considerar zona horaria de negocio y fecha solicitada. El helper es estimador de capacidad agregada; una producción real debería calendarizar por tipo de recurso y horario.

## Controles antes de producción

- Migraciones revisadas, backups y restauración ensayada; llaves fuera de base de datos y rotables.
- CSP con nonces, TLS 1.3/HSTS en proxy, CORS exacto por origen y limitación por ruta.
- Validación de esquemas en toda entrada, ORM parametrizado, escapes contextuales en UI.
- Uploads privados con límites, MIME detectado por bytes, dimensiones máximas, antivirus y URLs firmadas.
- Auditoría de acceso administrativo y cambios; no guardar PII, secretos o tokens en logs.
- Revisar retención/eliminación de PII y obligaciones locales con asesoría competente.
