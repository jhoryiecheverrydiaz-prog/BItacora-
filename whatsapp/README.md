# Bitácora por WhatsApp

Mandas un audio o un texto por WhatsApp. El servidor lo transcribe, Claude lo ordena, se guarda en tu Registro diario de Notion y te responde con lo que entendió y máximo 3 preguntas puntuales. Lo ves en el panel al sincronizar.

```
WhatsApp → Cloudflare Worker → Groq (audio a texto) → Claude (ordena) → Notion → respuesta por WhatsApp
```

Todo se puede hacer desde el celular, en el navegador. Son 5 cuentas; guarda cada clave en Notas mientras avanzas.

## 1. Groq (audio a texto, gratis)

1. Entra a **console.groq.com** e inicia sesión con Google.
2. Menú → **API Keys** → **Create API Key** → nombre `bitacora`.
3. Copia la clave (empieza por `gsk_`). → **GROQ_API_KEY**

## 2. Claude (Anthropic)

1. Entra a **console.anthropic.com** y crea la cuenta.
2. **Billing** → agrega USD 5 de crédito (alcanza para meses con este uso).
3. **API Keys** → **Create Key** → nombre `bitacora-whatsapp`.
4. Copia la clave (empieza por `sk-ant-`). → **ANTHROPIC_API_KEY**

## 3. Notion

1. Entra a **notion.so/profile/integrations** → **Nueva integración**.
2. Nombre `Bitácora WhatsApp`, tipo **Interna**, espacio de trabajo *Gestion Leaders Contenido Organico* → Guardar.
3. Copia el **Secreto interno** (empieza por `ntn_`). → **NOTION_TOKEN**
4. En la app de Notion abre **Bitácora · Personal** → `•••` → **Conexiones** → agrega **Bitácora WhatsApp**.
5. **NOTION_HABITOS_DS** y **NOTION_REGISTRO_DS**: los ids de las bases Hábitos y Registro diario. Claude te los dio por chat; no se guardan en este repositorio.

## 4. WhatsApp (Meta)

1. Entra a **developers.facebook.com** → **Mis apps** → **Crear app** → caso de uso **Otro** → tipo **Negocios**.
2. En la app: **Agregar producto** → **WhatsApp** → **Configurar**.
3. En **WhatsApp → Configuración de la API**:
   - Copia el **Identificador del número de teléfono**. → **WHATSAPP_PHONE_ID**
   - En **Para**, agrega tu número personal y confírmalo con el código que te llega. Es el único número que el servidor va a escuchar.
4. Token permanente (el que aparece ahí vence en 24 h):
   - **business.facebook.com** → Configuración → **Usuarios del sistema** → **Agregar** (rol Administrador).
   - **Asignar activos** → tu app → control total.
   - **Generar token** → tu app → permisos `whatsapp_business_messaging` y `whatsapp_business_management` → vencimiento **Nunca**.
   - Copia el token. → **WHATSAPP_TOKEN**
5. **Configuración de la app → Básica** → **Clave secreta de la app** → Mostrar → copia. → **WHATSAPP_APP_SECRET**
6. Inventa una palabra larga, por ejemplo `kurama-bitacora-2026`. → **VERIFY_TOKEN**
7. Tu número con código de país y sin `+`, por ejemplo `573001112233`. → **ALLOWED_NUMBER**

## 5. Cloudflare (el servidor, gratis)

1. Entra a **dash.cloudflare.com** y crea la cuenta.
2. **Workers y Pages** → **Crear** → **Importar un repositorio** → conecta GitHub → elige `bitacora-`.
3. **Directorio raíz**: `whatsapp`. Comando de despliegue: `npx wrangler deploy`. → **Desplegar**.
4. En el Worker → **Configuración** → **Variables y secretos** → agrega cada uno como **Secreto**:
   `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_APP_SECRET`, `VERIFY_TOKEN`, `ALLOWED_NUMBER`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `NOTION_TOKEN`, `NOTION_HABITOS_DS`, `NOTION_REGISTRO_DS`.
5. Abre la dirección del Worker (algo como `https://bitacora-whatsapp.TU-USUARIO.workers.dev`). Debe decir **"Bitácora WhatsApp: listo."**. Si dice "Faltan secretos", te dice cuáles.

## 6. Conectar WhatsApp con el servidor

1. En Meta: **WhatsApp → Configuración** → **Webhook** → **Editar**.
2. **URL de devolución de llamada**: la dirección del Worker + `/webhook`.
3. **Token de verificación**: tu `VERIFY_TOKEN`. → **Verificar y guardar**.
4. En **Campos del webhook**, activa **messages**.

## 7. Probar

1. Guarda en tus contactos el número de prueba que Meta muestra en **Configuración de la API**.
2. Escríbele `hola`: te responde cómo usarlo.
3. Mándale un audio: *"Dormí 6 horas, desayuné, la lista la hice a medias, lo principal es el guion de Pipe a las 10."*
4. Abre el panel → **Sincronizar**. El día aparece marcado.

Comandos: `hoy` muestra lo registrado. Di "ayer" en el mensaje si es del día anterior.

## Seguridad

- Solo responde a `ALLOWED_NUMBER`. Cualquier otro número se ignora.
- Verifica la firma de Meta en cada mensaje (`WHATSAPP_APP_SECRET`).
- Ninguna clave está en el código ni en el repositorio: viven como secretos en Cloudflare.

## Desarrollo

```bash
npm install
npm test
```

Las pruebas simulan WhatsApp, Groq, Notion y Claude; no gastan nada.
