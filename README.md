# ✈️ Travel Agent

AI-powered travel agent that searches flights, hotels, and activities across multiple sites simultaneously.

## What it does

- Understands natural language requests (text or audio)
- Searches **Google Flights**, **Kayak**, **Google Hotels**, **Airbnb**, and **TripAdvisor** in parallel
- Returns 3 travel package options (Budget / Best Value / Premium)
- Built to integrate with AgentOffice marketplace

## Stack

- **Node.js** + Express
- **Playwright** (browser automation)
- **Claude API** (Anthropic) — natural language understanding
- **REST API** — connects to any frontend

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env
npm start
```

## API

```
POST /chat
{
  "userId": "user123",
  "message": "I want to go from Miami to Puerto Rico June 1-15, budget $1000"
}
```

## Environment Variables

```
ANTHROPIC_API_KEY=your_key_here
PORT=3001
```
