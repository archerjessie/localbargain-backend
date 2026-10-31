# localbargain-backend

Backend API for LocalBargain. The contract is [`openapi.yaml`](openapi.yaml).

## Data sources

### Localities (`src/reference/localities.json`)

`GET /locations` searches a list of Australian suburbs with their state, postcode, and centroid coordinates.

- Source: the [Australian Postcodes](https://github.com/matthewproctor/australianpostcodes) dataset by Matthew Proctor, file `australian_postcodes.csv`, commit `eda59e4a987d46dbfb1d6bc644a383d322aa3d8d` (2025-09-07).
- Licence: the dataset does not state a licence. Its README says some of its data comes from Australia Post and is "technically not meant to be republished". The project owner chose this dataset knowing this, and accepted the risk of redistributing it in this repository.
- Only `Delivery Area` rows are kept (no PO boxes or large-volume receivers). Coordinates use `Lat_precise`/`Long_precise` where present, otherwise `lat`/`long`, rounded to 4 decimal places. Rows with no coordinates are dropped.

To rebuild the file from a downloaded CSV:

```sh
node scripts/build-localities.ts path/to/australian_postcodes.csv
```

The script needs Node.js 23.6 or later, which runs TypeScript files directly.
