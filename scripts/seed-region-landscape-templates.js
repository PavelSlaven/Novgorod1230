/** Layered ontology: no seed rows — region_landscape_templates filled manually in NocoDB. */
const REGION_LINKS = [];

if (REGION_LINKS.length === 0) {
  console.log('seed-region-landscape-templates: skip (layered schema — manual fill only)');
  process.exit(0);
}
