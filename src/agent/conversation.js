const Anthropic = require('@anthropic-ai/sdk');
const { PROFILE_QUESTIONS } = require('../utils/profile');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Maneja el flujo completo de la conversación
async function handleConversation(session, userMessage) {
  const { travelInfo, travelerProfile } = session;

  // FASE 1 — No tiene info del viaje aún
  if (!travelInfo || !travelInfo.destination) {
    return {
      phase: 'travel_info',
      reply: `¡Hola! Soy tu agente de viajes personal ✈️\n\nDime a dónde querés viajar, las fechas y tu presupuesto.\n\nEjemplo: *"Quiero ir de Miami a Puerto Rico del 1 al 15 de junio, presupuesto $1000 USD"*`
    };
  }

  // FASE 2 — Tiene info del viaje pero falta perfil del viajero
  if (!travelerProfile || !travelerProfile.email) {
    const missingField = getMissingField(travelerProfile);
    if (missingField) {
      return {
        phase: 'collecting_profile',
        field: missingField.field,
        reply: missingField.question
      };
    }
  }

  // FASE 3 — Tiene todo, listo para buscar y reservar
  return { phase: 'ready' };
}

// Detecta qué campo del perfil falta
function getMissingField(profile) {
  if (!profile) return PROFILE_QUESTIONS[0];
  for (const q of PROFILE_QUESTIONS) {
    if (!profile[q.field]) return q;
  }
  return null;
}

// Extrae el valor de un campo del mensaje del usuario
async function extractFieldValue(field, userMessage) {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 100,
    messages: [{
      role: 'user',
      content: `Extract the "${field}" from this message. Return ONLY the value, nothing else.
Message: "${userMessage}"
Field: ${field}

Examples:
- firstName: "Juan Martin"
- lastName: "Rojas"  
- email: "juan@gmail.com"
- phone: "+1 305 123 4567"
- birthDate: "15/03/1995"
- passport: "AB123456"`
    }]
  });

  return response.content[0].text.trim();
}

module.exports = { handleConversation, extractFieldValue, getMissingField };
