const axios = require('axios');

// Booking.com Affiliate API — hoteles reales con precios
// Key gratis en: developers.booking.com
const BOOKING_KEY = process.env.BOOKING_API_KEY;

async function searchBookingHotels({ destination, checkin, checkout, travelers = 1 }) {
  const bookingLink = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(destination)}&checkin=${checkin}&checkout=${checkout}&group_adults=${travelers}&no_rooms=1&order=price`;

  if (!BOOKING_KEY) {
    // Sin key: buscar con Playwright como fallback
    return { source: 'Booking.com', hotels: [], bookingLink, error: 'No API key — using direct link' };
  }

  try {
    const response = await axios.get('https://distribution-xml.booking.com/2.0/json/hotelAvailability', {
      params: {
        city_name: destination,
        checkin,
        checkout,
        room1: `A,${travelers}`,
        currency: 'USD',
        language: 'en-us',
        rows: 5,
        order_by: 'price'
      },
      headers: {
        'Authorization': `Basic ${Buffer.from(BOOKING_KEY).toString('base64')}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    const results = response.data?.result || [];
    const hotels = results.slice(0, 5).map(h => ({
      name: h.hotel_name,
      price: `$${h.min_total_price} USD total`,
      rating: h.review_score,
      link: h.url,
      source: 'Booking.com'
    }));

    return { source: 'Booking.com', hotels, bookingLink };

  } catch (error) {
    return { source: 'Booking.com', hotels: [], bookingLink, error: error.message };
  }
}

module.exports = { searchBookingHotels };
