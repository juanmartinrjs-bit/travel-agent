const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Datos básicos — para crear cuenta en Booking y buscar
const BASIC_QUESTIONS = [
  { field: 'firstName', question: '¿Cuál es tu nombre?' },
  { field: 'lastName',  question: '¿Y tu apellido?' },
  { field: 'email',     question: '¿Cuál es tu Gmail? Lo usamos para crear tu cuenta en los sitios de reserva 📧' }
];

// Datos del pasajero — solo para vuelos si el usuario quiere que llenemos
const FLIGHT_QUESTIONS = [
  { field: 'phone',     question: '¿Cuál es tu número de teléfono? (con código de país, ej: +1 305 123 4567)' },
  { field: 'birthDate', question: '¿Cuál es tu fecha de nacimiento? (DD/MM/YYYY)' },
  { field: 'passport',  question: '¿Cuál es tu número de pasaporte?' }
];

function getMissingBasicField(profile) {
  if (!profile) return BASIC_QUESTIONS[0];
  for (const q of BASIC_QUESTIONS) {
    if (!profile[q.field]) return q;
  }
  return null;
}

function getMissingFlightField(profile) {
  if (!profile) return FLIGHT_QUESTIONS[0];
  for (const q of FLIGHT_QUESTIONS) {
    if (!profile[q.field]) return q;
  }
  return null;
}

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

// Detecta si el usuario dijo que sí
function userSaidYes(msg) {
  const yes = ['si', 'sí', 'yes', '1', 'claro', 'dale', 'ok', 'okay', 'por favor', 'porfa', 'adelante', 'hazlo'];
  return yes.some(w => msg.toLowerCase().includes(w));
}

// Detecta si el usuario dijo que no
function userSaidNo(msg) {
  const no = ['no', '2', 'yo mismo', 'solo', 'prefiero', 'dejame'];
  return no.some(w => msg.toLowerCase().includes(w));
}

module.exports = {
  BASIC_QUESTIONS,
  FLIGHT_QUESTIONS,
  getMissingBasicField,
  getMissingFlightField,
  extractFieldValue,
  userSaidYes,
  userSaidNo
};
