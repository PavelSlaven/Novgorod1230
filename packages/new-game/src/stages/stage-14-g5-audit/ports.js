export function assertStage14Ports(services={}){for(const key of ['audit'])if(typeof services?.[key]!=='function')throw new TypeError(`Stage 14 requires ${key} service.`);return services;}
