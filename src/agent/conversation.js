const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Preguntas básicas — solo lo necesario para arrancar
const BASIC_QUESTIONS = [
  { field: 'firstName', question: '¿Cuál es tu nombre?' },
  { field: 'lastName',  question: '¿Y tu apellido?' },
  { field: 'email',     question: '¿Cuál es tu Gmail? Lo usamos para crear tu cuenta en los sitios de reserva 📧' }
];

// Preguntas adicionales — solo si el usuario quiere que llenemos por él
const EXTRA_QUESTIONS = [
  { field: 'phone',     question: '¿Cuál es tu número de teléfono? (con código de país, ej: +1 305 123 4567)' },
  { field: 'birthDate', question: '¿Cuál es tu fecha de nacimiento? (DD/MM/YYYY)' },
  { field: 'passport',  question: '¿Cuál es tu número de pasaporte o documento de identidad?' }
];

// Detecta qué campo falta del perfil básico
function getMissingBasicField(profile) {
  if (!profile) return BASIC_QUESTIONS[0];
  for (const q of BASIC_QUESTIONS) {
    if (!profile[q.field]) return q;
  }
  return null;
}

// Detecta qué campo falta del perfil extra
function getMissingExtraField(profile) {
  if (!profile) return EXTRA_QUESTIONS[0];
  for (const q of EXTRA_QUESTIONS) {
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
      content: `Extract the "${field}" from this message. Return ONLY the value, nothing else. No quotes, no explanation.
Message: "${userMessage}"
Field: ${field}`
    }]
  });
  return response.content[0].text.trim();
}

// Genera el mensaje de elección cuando se necesitan datos extra
function buildChoiceMessage(traveler, bookingUrl) {
  return `Para completar la reserva necesito algunos datos adicionales del pasajero (teléfono, fecha de nacimiento y pasaporte).\n\n¿Cómo preferís?\n\n*1️⃣ Me los das y yo lleno todo por vos*\n_(te dejo justo antes del pago)_\n\n*2️⃣ Prefiero hacerlo yo mismo*\n🔗 ${bookingUrl}\n📧 Email: ${traveler.email}\n🔑 Contraseña: ${traveler.travelPassword}\n\nRespondé *1* o *2* 👇`;
}

module.exports = {
  BASIC_QUESTIONS,
  EXTRA_QUESTIONS,
  getMissingBasicField,
  getMissingExtraField,
  extractFieldValue,
  buildChoiceMessage
};
