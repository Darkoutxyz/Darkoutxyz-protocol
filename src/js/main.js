import { hydrate } from './hydrate.js';
import { initReveal, initParallax, initSpotlight, initProgress } from './motion.js';
import { startMarket } from './market.js';

hydrate();
initProgress();
initSpotlight();
initReveal();
initParallax();
startMarket();
