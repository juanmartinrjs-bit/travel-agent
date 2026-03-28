// Currency conversion using free exchangerate-api
// Converts everything to CAD by default

const BASE_CURRENCY = 'CAD';

// Cache rates for 1 hour
let cachedRates = null;
let cacheTime = 0;

async function getExchangeRates() {
  const now = Date.now();
  if (cachedRates && (now - cacheTime) < 3600000) return cachedRates;

  try {
    const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${BASE_CURRENCY}`);
    const data = await res.json();
    cachedRates = data.rates;
    cacheTime = now;
    return cachedRates;
  } catch (e) {
    // Fallback rates if API fails
    return {
      USD: 0.74, COP: 3200, EUR: 0.68, GBP: 0.58,
      MXN: 12.8, BRL: 3.9, ARS: 650, CLP: 720,
      CAD: 1
    };
  }
}

// Convert amount from sourceCurrency to CAD
async function convertToCAD(amount, fromCurrency) {
  if (!amount || !fromCurrency || fromCurrency === BASE_CURRENCY) return amount;

  const rates = await getExchangeRates();
  const fromRate = rates[fromCurrency];

  if (!fromRate) return amount; // Unknown currency, return as-is

  // Convert: amount in fromCurrency → CAD
  // rates are "how many X per 1 CAD"
  // So: amount_in_CAD = amount_in_X / rate_of_X
  return parseFloat((amount / fromRate).toFixed(2));
}

// Convert all transactions to CAD
async function normalizeTransactions(transactions) {
  const normalized = [];
  for (const tx of transactions) {
    const amountCAD = await convertToCAD(tx.amount, tx.currency);
    normalized.push({
      ...tx,
      originalAmount: tx.amount,
      originalCurrency: tx.currency,
      amount: amountCAD,
      currency: BASE_CURRENCY
    });
  }
  return normalized;
}

module.exports = { convertToCAD, normalizeTransactions, BASE_CURRENCY };
