module.exports = (sequelize, DataTypes) => {
  const Client = sequelize.define('Client', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'nome'
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isEmail: true
      }
    },
    document: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'cpf_cnpj'
    },
    endereco: {
      type: DataTypes.STRING,
      allowNull: true
    },
    numero: {
      type: DataTypes.STRING,
      allowNull: true
    },
    bairro: {
      type: DataTypes.STRING,
      allowNull: true
    },
    cidade: {
      type: DataTypes.STRING,
      allowNull: true
    },
    estado: {
      type: DataTypes.STRING,
      allowNull: true
    },
    cep: {
      type: DataTypes.STRING,
      allowNull: true
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('ativo', 'inativo'),
      defaultValue: 'ativo'
    }
  }, {
    tableName: 'Clients',
    timestamps: false
  });

  Client.associate = function(models) {
    Client.hasMany(models.Subscription, {
      foreignKey: 'cliente_id',
      as: 'subscriptions'
    });
    
    Client.hasMany(models.Invoice, {
      foreignKey: 'cliente_id',
      as: 'invoices'
    });
  };

  return Client;
};