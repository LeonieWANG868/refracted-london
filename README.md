# Refracted London

*An interactive study of how travel time changes the shape of a city.*

Refracted London places a point-cloud model of Westminster and the South Bank inside a rotating glass cube. Choose a journey to send a beam through the city. The light separates according to the journey's estimated minutes per kilometre, then reveals the TfL route, stations and transfers on a separate map. The glass and beam are artistic interpretations of accessibility.

This is an independent project prepared for the Imperial College London internship application.

## Explore the demo

- Drag the cube to rotate it and scroll to zoom. With the scene focused, use the arrow keys and plus or minus instead.
- Choose an origin and destination, then select **Generate journey**. Earlier routes stay on the projection as new routes appear. Select **Reset** to clear them.
- Open **Data & methodology** for sources and calculations. **Journey details** shows the station order, line names and measurement inputs.
- The city view travels between Westminster Abbey and the London Eye. The system reduced-motion preference pauses the city sweep, rotation and birds, and shows routes immediately.
- Append `?view=projection` to use the 2D route view on devices where WebGL is unavailable.

## Run locally

Requires **Node.js 20 or newer**. The browser libraries and data snapshots are included.

```sh
npm run build
npm start
```

Open [the local preview](http://127.0.0.1:8784/). On Windows, `start-refracted.cmd` can also build and open the preview. The build and app use the bundled files and need no API key, account or dependency installation.

```sh
npm test
```

The tests compare the displayed stations and route vertices to the included TfL captures. They also verify the distance calculation, reveal order, glass intersections, point-cloud bounds and animation controls.

## Data and interpretation

**Data provided by Transport for London.** The project uses three Journey Planner results for 20 November 2026 and the matching StopPoint coordinates. All five route legs use official TfL geometry. The projected movement illustrates planned journey direction. [TfL data terms and conditions](https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service)

| Journey | TfL estimate | Straight-line distance | Minutes per km |
| --- | ---: | ---: | ---: |
| King's Cross St Pancras → Waterloo | 14 min | 3.10 km | 4.52 |
| South Kensington → Oxford Circus | 12 min | 3.24 km | 3.70 |
| Westminster → London Bridge | 4 min | 2.54 km | 1.58 |

The beam's colour separation uses a capped mapping of minutes per kilometre. The visual mapping floors the straight-line distance at 0.75 km and maps 1–6 min/km to 0–100%. The route projection shows the original geographic paths.

The 3D scene covers about 1.4 × 1.4 km and includes 640 building volumes. It pairs OpenStreetMap footprints with Environment Agency LiDAR. Roof samples come from measured elevations. Modelled façade points and the birds are illustrative. The designated landmark models were converted into point clouds at the same scale as their surroundings. See [Data sources and credits](DATA_SOURCES.md) for providers, licences and reproducibility.

## Project layout

- `src/` contains the WebGL viewer, glass, beam, building point clouds, bird animation and 2D route projection.
- `data/` contains the compact runtime data. `data/raw/` contains the TfL captures used by the tests, landmark inputs and download metadata.
- `scripts/` contains the build, local preview, verification and optional data acquisition and preparation.
- `dist/` is generated when you run the build. A GitHub Pages workflow builds and deploys this directory from the source on `main`.

The prototype runs in a standard browser. Multi-screen integration with the Imperial Data Observatory is outside this release.
