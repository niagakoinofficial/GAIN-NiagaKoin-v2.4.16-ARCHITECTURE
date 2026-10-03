import { Router } from 'express';
import { generateDcaLayers } from '../engines/strategy/DcaEngine';
import { generateGridLevels } from '../engines/strategy/GridEngine';
import { evaluateRisk } from '../engines/risk/RiskEngine';
import { detectMarketRegime } from '../ai/MarketRegime';
import { recommend } from '../ai/StrategyAdvisor';
import { z } from 'zod';

const router = Router();

router.post('/plan/dca', (req, res) => {
  const schema = z.object({ baseOrderUsd:z.number().positive(), stepDeviationPct:z.number().positive(), stepScale:z.number().min(1), volumeMultiplier:z.number().min(1), maxLayers:z.number().int().positive().max(100), maxCapitalUsd:z.number().positive(), takeProfitPct:z.number().positive(), trailingTpPct:z.number().positive(), callbackPct:z.number().positive(), minPrice:z.number().positive().optional(), maxPrice:z.number().positive().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success:false, error:'INVALID_DCA_CONFIG' });
  return res.json({ success:true, layers:generateDcaLayers(parsed.data) });
});

router.post('/plan/grid', (req, res) => {
  const schema = z.object({ lowerPrice:z.number().positive(), upperPrice:z.number().positive(), gridCount:z.number().int().positive().max(500), orderSizeUsd:z.number().positive(), takeProfitPct:z.number().positive(), maxCapitalUsd:z.number().positive() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success:false, error:'INVALID_GRID_CONFIG' });
  return res.json({ success:true, levels:generateGridLevels(parsed.data) });
});

router.post('/ai/regime', (req, res) => {
  const schema = z.object({ market:z.object({ exchange:z.string(), symbol:z.string(), bid:z.number(), ask:z.number(), last:z.number(), timestamp:z.number(), spreadPct:z.number(), volatilityPct:z.number().optional() }), recentReturnsPct:z.array(z.number()).default([]) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success:false, error:'INVALID_MARKET_DATA' });
  const regime = detectMarketRegime(parsed.data.market, parsed.data.recentReturnsPct);
  return res.json({ success:true, regime, recommendation:recommend(regime) });
});

router.post('/risk/check', (req, res) => {
  const parsed = z.object({ intent:z.any(), market:z.any(), context:z.any() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success:false, error:'INVALID_RISK_REQUEST' });
  return res.json({ success:true, decision:evaluateRisk(parsed.data.intent, parsed.data.market, parsed.data.context) });
});

export default router;
