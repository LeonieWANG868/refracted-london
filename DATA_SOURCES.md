# Data sources and credits

| Material | Source and terms | Use |
| --- | --- | --- |
| Transport routes, station coordinates and journey estimates | **Data provided by Transport for London.** [Unified API portal](https://api-portal.tfl.gov.uk/), [Transport Data Service terms](https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service), [TfL Colour Standard](https://content.tfl.gov.uk/tfl-colour-standard.pdf) | Three Journey Planner captures and 15 unique station locations from StopPoint. The locations, travel times and line identities remain visible in the app. |
| Building footprints and geo-placement of landmarks | © OpenStreetMap contributors. [OpenStreetMap copyright and ODbL 1.0](https://www.openstreetmap.org/copyright) | Four scoped extracts form the building database in `data/london-district.json`. The exact map requests and retrieval times are included in the district metadata. Source footprint data is available under ODbL 1.0. |
| Elevation | © Environment Agency copyright and/or database right 2022. All rights reserved. [LiDAR DSM](https://www.data.gov.uk/dataset/cf3f1137-c12b-44a1-a835-e80fe4a60b92/lidar-composite-dsm-2022-1m), [LiDAR DTM](https://www.data.gov.uk/dataset/01b3ee39-da3f-47b6-83da-dc98e73a461f/lidar-composite-digital-terrain-model-dtm-1m), [Open Government Licence 3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/) | Source rasters were cropped and resampled at approximately 3.2 m spacing. |
| Landmark assets | London Eye, Westminster Abbey, and Palace of Westminster and Elizabeth Tower by Codriver / 9570-6198 Québec inc. [Model library and licences](https://3d-assets.codriver.io/licenses.html), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | The model surfaces and edges were sampled and rendered as point clouds. Geographic data are © OpenStreetMap contributors under ODbL 1.0. Each manifest identifies its original model. |
| Thames outline | Greater London Authority. [River Thames layer](https://gis.london.gov.uk/arcgis/rest/services/apps/webmap_context_layer/MapServer/1) | A clipped contextual outline on the transport projection. |
| Three.js and meshoptimizer | [Three.js MIT licence](vendor/LICENSE), [meshoptimizer MIT licence](data/raw/landmarks/meshopt-LICENSE.md) | Three.js runs the 3D view. The meshoptimizer decoder is used only to prepare landmark inputs. |

The transport captures record their original public URLs and retrieval dates in `data/raw/`. They are planning estimates for a specific date. The app's Data & methodology panel links to the recorded sources.

## Reproduce the bundles

The runtime build and tests run offline. Optional commands below regenerate the data rather than install the app.

```sh
npm run prepare:tfl
npm run prepare:landmarks
node scripts/fetch-district.mjs
npm run prepare:district
npm test
```

`fetch-district.mjs` retrieves the larger OSM and LiDAR inputs from their public services. Those downloads are kept out of Git. The measurements and footprints may have changed since the captured exhibit, so a fresh download can produce a different set of buildings. The two WCS source descriptors in `data/raw/` are request metadata. The exact district request addresses are also embedded in the compact data.

To refresh the TfL captures deliberately, use `node scripts/fetch-data.mjs YYYY-MM-DD` and then `npm run prepare:tfl`. That may change the journey returned by the planner. The distributed exhibit uses the pinned capture date in the README.
