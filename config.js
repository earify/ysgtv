require('dotenv').config();

module.exports = {
  WEATHER_SERVICE_KEY: process.env.WEATHER_SERVICE_KEY,
  NEIS_API_KEY: process.env.NEIS_API_KEY,
  PORT: process.env.PORT || 5000
};
