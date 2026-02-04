module.exports = (sequelize, DataTypes) => {
  const Subscription = sequelize.define('Subscription', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    cliente_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Clients',
        key: 'id'
      }
    },
    valor: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    vencimento_dia: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
        max: 31
      }
    },
    metodo_pagamento: {
      type: DataTypes.ENUM('boleto', 'pix'),
      allowNull: false
    },
    tipo: {
      type: DataTypes.ENUM('mensal', 'semanal', 'quinzenal'),
      allowNull: false,
      defaultValue: 'mensal'
    },
    data_primeiro_pagamento: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    envio_dia: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 1,
        max: 31
      }
    },
    dia_semana: {
      type: DataTypes.ENUM('domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'),
      allowNull: true
    },
    desconto: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    desconto_tipo: {
      type: DataTypes.ENUM('percentual', 'valor'),
      allowNull: true
    },
    multa: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    multa_tipo: {
      type: DataTypes.ENUM('percentual', 'valor'),
      allowNull: true
    },
    juros: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    juros_tipo: {
      type: DataTypes.ENUM('percentual', 'valor'),
      allowNull: true
    },
    nome_cobranca: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('ativo', 'inativo', 'cancelado'),
      allowNull: false,
      defaultValue: 'ativo'
    },
    criado_em: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    atualizado_em: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'assinaturas',
    timestamps: false
  });

  Subscription.associate = function(models) {
    Subscription.belongsTo(models.Client, { foreignKey: 'cliente_id', as: 'client' });
    Subscription.hasMany(models.Invoice, { foreignKey: 'subscription_id', as: 'invoices' });
  };

  return Subscription;
};