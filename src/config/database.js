const settings = require('./settings');

const resolveDb = () => ({
  username: settings.database.username,
  password: settings.database.password,
  database: settings.database.name,
  host: settings.database.host,
  port: settings.database.port,
  dialect: settings.database.dialect
});

module.exports = {
  development: {
    ...resolveDb(),
    logging: console.log,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    dialectOptions: {
      connectTimeout: 60000
    }
  },
  test: {
    ...resolveDb(),
    database: settings.database.testName,
    logging: false
  },
  production: {
    ...resolveDb(),
    logging: false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
};