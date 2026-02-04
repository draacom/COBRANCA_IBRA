require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const resolveDb = () => ({
  username: process.env.DEST_USER || process.env.DB_USER,
  password: process.env.DEST_PASS || process.env.DB_PASS,
  database: process.env.DEST_NAME || process.env.DB_NAME,
  host: process.env.DEST_HOST || process.env.DB_HOST,
  port: process.env.DEST_PORT || process.env.DB_PORT,
  dialect: process.env.DB_DIALECT || 'mysql'
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
    database: process.env.DB_NAME_TEST || 'cobranca_test',
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