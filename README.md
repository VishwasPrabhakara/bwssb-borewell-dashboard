# BWSSB Borewell Dashboard

Static GitHub Pages frontend for visualizing Bengaluru borewell sensors on an OpenStreetMap basemap with BBMP ward boundaries, water-level trends, discharge trends, and data-availability filters.

## Live Site

```text
https://VishwasPrabhakara.github.io/bbmp-borewell-dashboard/
```

## Repository Role

This repo contains only public frontend assets. Downloading KH reports, parsing data, storing records, and serving API responses are handled by the backend job and Cloudflare Worker API.

## Files

```text
index.html
BBMP_Dashboard.css
bbmpwards.zip
favicon.png
README.md
```

## Data Sources

- `bbmpwards.zip`: bundled BBMP ward shapefile loaded by the browser.
- Cloudflare Worker API: returns sensor metadata, refresh status, and time-series water/discharge readings.
- `favicon.png`: IISc logo/seal from the official IISc logo page.

## API Configuration

The API base URL is set inside `index.html`:

```javascript
const API_BASE_URL = 'https://bbmp-borewell-api.vishwas-borewellworkersdev.workers.dev';
```

Expected routes:

```text
GET /api/status
GET /api/refresh
GET /api/sensors
GET /api/water-level?uid=<sensor_uid>
```

## Features

- OpenStreetMap basemap with BBMP ward boundaries.
- Borewell sensor markers colored by data availability.
- Legend-based filtering for sensors with both water and discharge data, one data type, or no data.
- Clickable wards with ward summary and sensor counts.
- Clickable borewells with UID, ward, coordinates, first/last data date, and reading counts.
- Water-level chart with every available point and on/off level traces.
- Discharge chart with the same time filters as the water-level chart.
- CSV export for the currently filtered sensor list.
- Collapsible map sidebars.

## Deployment

Enable GitHub Pages:

```text
Repository -> Settings -> Pages
Source: Deploy from a branch
Branch: main
Folder: / root
```

## Security Notes

Do not commit secrets or private KH data to this repo.

Keep these out of the frontend repository:

```text
.env
KH credentials
database URLs
API tokens
raw KH downloads
data_sent_from_kh/
private CSV/XLSX files
```

## LICENSE

[MIT](https://github.com/VishwasPrabhakara/bbmp-borewell-dashboard/blob/main/LICENSE)

