import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root=dirname(dirname(fileURLToPath(import.meta.url))); const j=p=>JSON.parse(readFileSync(join(root,p),"utf8"));
const expected={"source-records.json":12,"spatial-nodes.json":49,"authoring-versions.json":68,"node-parents.json":48,"node-classes.json":49,"g3-classification-decision.json":32,"universal-categories.json":57,"regional-scene-template-bases.json":17,"scene-templates.json":17,"g6-template-slots.json":17,"scene-position-templates.json":51,"scene-endpoint-slots.json":34,"scene-movement-edge-templates.json":68,"stable-structure-templates.json":0,"portal-templates.json":0};
for(const [f,n] of Object.entries(expected)){const got=j("data/"+f).records.length;if(got!==n)throw new Error(f+": expected "+n+", got "+got)}
if(j("reports/dependency-coverage.json").hard_gap!==0)throw new Error("hard gaps remain"); console.log("P12 dependency closure data validation: PASS");
