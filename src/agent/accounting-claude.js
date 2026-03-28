const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Extract transaction data from email
async function extractTransaction(email) {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Extract financial transaction data from this email. Be generous — if there's any dollar amount mentioned, extract it.
Return ONLY valid JSON or the word null if there's absolutely no money involved.

Email:
Subject: ${email.subject}
From: ${email.from}
Date: ${email.date}
Body: ${email.body?.substring(0, 500)}

Examples of what to extract:
- Interac transfer received/sent → income or expense
- Receipt from Apple/store → expense
- Payment receipt → could be income or expense
- Rent reminder → expense
- Bank statement → skip (no specific transaction)

Return JSON:
{
  "date": "YYYY-MM-DD",
  "amount": number (always positive),
  "currency": "CAD or USD or COP or EUR",
  "description": "brief description max 50 chars",
  "category": "Income/Transfer/Subscription/Shopping/Rent/Services/Software/Food/Other",
  "type": "income or expense",
  "source": "platform or sender name",
  "confidence": "high or medium or low"
}`
    }]
  });

  try {
    const text = response.content[0].text.trim();
    if (text.toLowerCase() === 'null' || text.toLowerCase().startsWith('null')) return null;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    return null;
  }
}

// Generate P&L summary
async function generateSummary(transactions) {
  const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + Math.abs(t.amount), 0);
  const netProfit = totalIncome - totalExpense;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `You are a financial analyst. Generate a brief P&L summary in Spanish based on these transactions:

Total Income: $${totalIncome.toFixed(2)}
Total Expenses: $${totalExpense.toFixed(2)}
Net Profit/Loss: $${netProfit.toFixed(2)}

Transactions by category:
${JSON.stringify(
  transactions.reduce((acc, t) => {
    acc[t.category] = (acc[t.category] || 0) + Math.abs(t.amount);
    return acc;
  }, {}),
  null, 2
)}

Provide a 3-4 sentence summary with key insights and recommendations.`
    }]
  });

  return response.content[0].text;
}

module.exports = { extractTransaction, generateSummary };
