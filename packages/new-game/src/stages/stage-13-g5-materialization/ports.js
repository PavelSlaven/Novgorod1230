export function assertStage13Ports(services={}){for(const key of ['materialize'])if(typeof services?.[key]!=='function')throw new TypeError(`Stage 13 requires ${key} service.`);return services;}
