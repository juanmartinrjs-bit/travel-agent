// Maneja el perfil del viajero — datos personales + credenciales de viaje

// Genera una contraseña de viajes memorable basada en el nombre
function generateTravelPassword(firstName) {
  const name = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
  const year = new Date().getFullYear();
  return `${name}Travels#${year}`;
}

// Perfil completo del viajero
function createTravelerProfile({ firstName, lastName, email, birthDate, passport, phone }) {
  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    email,                                    // Su Gmail real
    travelPassword: generateTravelPassword(firstName), // Contraseña de viajes
    birthDate,
    passport,
    phone,
    createdAt: new Date().toISOString()
  };
}

// Preguntas que el agente hace al usuario para armar el perfil
const PROFILE_QUESTIONS = [
  { field: 'firstName',  question: '¿Cuál es tu nombre?' },
  { field: 'lastName',   question: '¿Y tu apellido?' },
  { field: 'email',      question: '¿Cuál es tu Gmail? (lo usamos para crear tu cuenta en los sitios de viaje)' },
  { field: 'phone',      question: '¿Cuál es tu número de teléfono?' },
  { field: 'birthDate',  question: '¿Cuál es tu fecha de nacimiento? (DD/MM/YYYY)' },
  { field: 'passport',   question: '¿Cuál es tu número de pasaporte o documento de identidad?' }
];

module.exports = { createTravelerProfile, generateTravelPassword, PROFILE_QUESTIONS };
