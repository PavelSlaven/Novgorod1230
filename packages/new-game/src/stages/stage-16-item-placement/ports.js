export function assertStage16Ports(services={}){for(const key of ['place','audit'])if(typeof services?.[key]!=='function')throw new TypeError(`Stage 16 requires ${key} service.`);return services;}
