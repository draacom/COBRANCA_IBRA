const express = require('express');
const { Op } = require('sequelize');
const { Invoice } = require('../models');

const router = express.Router();

// Helper: parse YYYY-MM-DD into Date at local midnight
function parseYMDToDate(ymd) {
  if (!ymd) return null;
  const raw = String(ymd).trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return new Date(y, mo - 1, d);
}

// GET /api/reports/revenue?period=month|week|day OR ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get('/revenue', async (req, res) => {
  try {
    const period = (req.query.period || 'month').toLowerCase();
    const startParam = req.query.startDate || req.query.from;
    const endParam = req.query.endDate || req.query.to;

    const now = new Date();
    let start, endExclusive;

    if (startParam && endParam) {
      const s = parseYMDToDate(startParam);
      const e = parseYMDToDate(endParam);
      if (s && e) {
        start = s;
        endExclusive = new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1);
      }
    }

    // Fallback para period quando não houver intervalo explícito
    if (!start || !endExclusive) {
      switch (period) {
        case 'day': {
          start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          endExclusive = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
          break;
        }
        case 'week': {
          // Considera semana iniciando no domingo
          const day = now.getDay(); // 0-6
          start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
          endExclusive = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
          break;
        }
        case 'month':
        default: {
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          endExclusive = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          break;
        }
      }
    }

    const total = await Invoice.sum('amount', {
      where: {
        status: 'paid',
        paid_date: { [Op.gte]: start, [Op.lt]: endExclusive }
      }
    });

    return res.status(200).json({
      status: 'success',
      data: {
        total: Number(total) || 0,
        period,
        start,
        end: endExclusive
      }
    });
  } catch (error) {
    console.error('Error computing revenue report:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao gerar relatório de receita'
    });
  }
});

module.exports = router;