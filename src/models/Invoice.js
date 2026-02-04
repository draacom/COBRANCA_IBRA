module.exports = (sequelize, DataTypes) => {
  const Invoice = sequelize.define('Invoice', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    subscription_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'assinaturas',
        key: 'id'
      }
    },
    cliente_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Clients',
        key: 'id'
      }
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    due_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    paid_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('pending', 'paid', 'overdue', 'canceled'),
      defaultValue: 'pending'
    },
    payment_method: {
      type: DataTypes.ENUM('boleto', 'pix'),
      allowNull: false
    },
    payment_url: {
      type: DataTypes.STRING,
      allowNull: true
    },
    payment_code: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    payment_details: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null
    },
    provider_id: {
      type: DataTypes.STRING,
      allowNull: true
    },
    title: {
      type: DataTypes.STRING,
      allowNull: true
    },
    public_link: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Link público para visualização da cobrança'
    },
    notifications: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    sent: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  }, {
    tableName: 'invoices',
    timestamps: true
  });

  Invoice.associate = function(models) {
    Invoice.belongsTo(models.Client, { foreignKey: 'cliente_id', as: 'client' });
    Invoice.belongsTo(models.Subscription, { foreignKey: 'subscription_id', as: 'subscription' });
  };

  return Invoice;
};