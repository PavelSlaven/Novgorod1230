import { createHash } from 'node:crypto';

export const SCHEMAS = Object.freeze({
  world_base: Object.freeze({
    ledgerTable: 'world_base.schema_migrations',
    advisoryLockKey: '742019260001',
    securityRoles: Object.freeze([
      'runtime_catalog_activator',
      'runtime_catalog_importer',
      'world_reader'
    ])
  }),
  party_runtime: Object.freeze({
    ledgerTable: 'party_runtime.schema_migrations',
    advisoryLockKey: '742019260002',
    securityRoles: Object.freeze([])
  })
});

export async function readPostgresSchemaFingerprint(client, schemaName) {
  const schema = SCHEMAS[schemaName];
  if (!schema) throw new TypeError(`Unsupported schema fingerprint: ${schemaName}`);
  const result = await client.query(
    `WITH schema_objects AS (
       SELECT
         'column'::text AS object_kind,
         c.relname || '.' || a.attnum::text AS object_identity,
         jsonb_build_object(
           'table_name', c.relname,
           'column_name', a.attname,
           'ordinal', a.attnum,
           'data_type', pg_catalog.format_type(a.atttypid, a.atttypmod),
           'not_null', a.attnotnull,
           'identity', a.attidentity,
           'generated', a.attgenerated,
           'default', pg_catalog.pg_get_expr(d.adbin, d.adrelid)
         ) AS definition
       FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
       LEFT JOIN pg_catalog.pg_attrdef d
         ON d.adrelid = c.oid AND d.adnum = a.attnum
       WHERE n.nspname = $1
         AND c.relkind IN ('r', 'p')
         AND a.attnum > 0
         AND NOT a.attisdropped
       UNION ALL
       SELECT
         'constraint',
         c.relname || '.' || k.conname,
         to_jsonb(pg_catalog.pg_get_constraintdef(k.oid, true))
       FROM pg_catalog.pg_constraint k
       JOIN pg_catalog.pg_class c ON c.oid = k.conrelid
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1
       UNION ALL
       SELECT
         'index',
         c.relname || '.' || i.relname,
         to_jsonb(pg_catalog.pg_get_indexdef(i.oid))
       FROM pg_catalog.pg_index x
       JOIN pg_catalog.pg_class c ON c.oid = x.indrelid
       JOIN pg_catalog.pg_class i ON i.oid = x.indexrelid
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1
       UNION ALL
       SELECT
         'trigger',
         c.relname || '.' || t.tgname,
         to_jsonb(pg_catalog.pg_get_triggerdef(t.oid, true))
       FROM pg_catalog.pg_trigger t
       JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND NOT t.tgisinternal
       UNION ALL
       SELECT
         'function',
         p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')',
         to_jsonb(pg_catalog.pg_get_functiondef(p.oid))
       FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = $1
     )
     SELECT object_kind, object_identity, definition
     FROM schema_objects
     ORDER BY object_kind, object_identity`,
    [schemaName]
  );
  const securityResult = await client.query(
    `WITH security_objects AS (
       SELECT
         'role'::text AS object_kind,
         r.rolname AS object_identity,
         jsonb_build_object(
           'role_name', r.rolname,
           'superuser', r.rolsuper,
           'inherit', r.rolinherit,
           'create_role', r.rolcreaterole,
           'create_database', r.rolcreatedb,
           'can_login', r.rolcanlogin,
           'replication', r.rolreplication,
           'bypass_rls', r.rolbypassrls,
           'connection_limit', r.rolconnlimit
         ) AS definition
       FROM pg_catalog.pg_roles r
       WHERE r.rolname = ANY($2::text[])
         AND EXISTS (
           SELECT 1
           FROM pg_catalog.pg_namespace local_namespace
           CROSS JOIN LATERAL
             pg_catalog.aclexplode(local_namespace.nspacl) local_acl
           WHERE local_namespace.nspname = $1
             AND local_acl.grantee = r.oid
         )
       UNION ALL
       SELECT
         'schema_acl',
         n.nspname || '.' ||
           COALESCE(grantee.rolname, 'PUBLIC') || '.' ||
           acl.privilege_type,
         jsonb_build_object(
           'schema_name', n.nspname,
           'grantee', COALESCE(grantee.rolname, 'PUBLIC'),
           'privilege', acl.privilege_type,
           'grantable', acl.is_grantable
         )
       FROM pg_catalog.pg_namespace n
       CROSS JOIN LATERAL pg_catalog.aclexplode(n.nspacl) acl
       LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
       WHERE n.nspname = $1
         AND (acl.grantee = 0 OR grantee.rolname = ANY($2::text[]))
       UNION ALL
       SELECT
         'relation_acl',
         c.relname || '.' ||
           COALESCE(grantee.rolname, 'PUBLIC') || '.' ||
           acl.privilege_type,
         jsonb_build_object(
           'relation_name', c.relname,
           'relation_kind', c.relkind,
           'grantee', COALESCE(grantee.rolname, 'PUBLIC'),
           'privilege', acl.privilege_type,
           'grantable', acl.is_grantable
         )
       FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) acl
       LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
       WHERE n.nspname = $1
         AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
         AND (acl.grantee = 0 OR grantee.rolname = ANY($2::text[]))
       UNION ALL
       SELECT
         'function_acl',
         p.proname || '(' ||
           pg_catalog.pg_get_function_identity_arguments(p.oid) || ').' ||
           COALESCE(grantee.rolname, 'PUBLIC') || '.' ||
           acl.privilege_type,
         jsonb_build_object(
           'function_name', p.proname,
           'identity_arguments',
             pg_catalog.pg_get_function_identity_arguments(p.oid),
           'grantee', COALESCE(grantee.rolname, 'PUBLIC'),
           'privilege', acl.privilege_type,
           'grantable', acl.is_grantable
         )
       FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       CROSS JOIN LATERAL pg_catalog.aclexplode(p.proacl) acl
       LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
       WHERE n.nspname = $1
         AND (acl.grantee = 0 OR grantee.rolname = ANY($2::text[]))
       UNION ALL
       SELECT
         'default_acl',
         d.defaclobjtype::text || '.' ||
           COALESCE(grantee.rolname, 'PUBLIC') || '.' ||
           acl.privilege_type,
         jsonb_build_object(
           'object_type', d.defaclobjtype,
           'grantee', COALESCE(grantee.rolname, 'PUBLIC'),
           'privilege', acl.privilege_type,
           'grantable', acl.is_grantable
         )
       FROM pg_catalog.pg_default_acl d
       JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace
       CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) acl
       LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
       WHERE n.nspname = $1
         AND (acl.grantee = 0 OR grantee.rolname = ANY($2::text[]))
       UNION ALL
       SELECT
         'role_membership',
         granted.rolname || '.' || member.rolname,
         jsonb_build_object(
           'granted_role', granted.rolname,
           'member_role', member.rolname,
           'admin_option', membership.admin_option,
           'inherit_option', membership.inherit_option,
           'set_option', membership.set_option
         )
       FROM pg_catalog.pg_auth_members membership
       JOIN pg_catalog.pg_roles granted ON granted.oid = membership.roleid
       JOIN pg_catalog.pg_roles member ON member.oid = membership.member
       WHERE granted.rolname = ANY($2::text[])
         AND member.rolname = ANY($2::text[])
     )
     SELECT object_kind, object_identity, definition
     FROM security_objects
     ORDER BY object_kind, object_identity`,
    [schemaName, schema.securityRoles]
  );
  return digest({
    schema: 'rus.postgres_schema_fingerprint.v2',
    schema_name: schemaName,
    objects: result.rows,
    security_objects: securityResult.rows
  });
}


function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
