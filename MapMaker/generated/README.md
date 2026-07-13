# Generated map data

`npm run compile:novgorod` writes canonical local subgraphs to `server/`. Keep that directory on the server: its data is not safe to publish. The browser must receive only a `MapViewDTO` produced after character-knowledge filtering.
