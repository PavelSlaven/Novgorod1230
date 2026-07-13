export function assertStage15Ports(services={}){for(const key of ['place','audit'])if(typeof services?.[key]!=='function')throw new TypeError(`Stage 15 requires ${key} service.`);return services;}
