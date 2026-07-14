import { readServerConfig } from './config.js';

const config = readServerConfig();
if (config.runtimeRoute === 'legacy') await import('./legacy-entry.js');
else await import('./modular-entry.js');
