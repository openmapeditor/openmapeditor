<div align="center">
<img src="img/icon-1024x1024.png" height="100"/>

# OpenMapEditor

</div>

OpenMapEditor is a simple, powerful web-based editor for creating, viewing, and managing geographic data like paths, areas, and markers. Built with Leaflet.js, it supports interactive drawing, file import/export (GPX, KML, KMZ, GeoJSON), routing, elevation profiles, custom styling, and Strava activity integration.

---

## Features

- **Privacy First:** Your files are processed entirely on your local machine and are never uploaded to a server. Optional features like routing and elevation profiles send only the necessary coordinates to external APIs to function.
- **Organic Maps Compatibility:** Smoothly import and export KMZ backups while preserving all 16 of the Organic Maps colors for your paths and markers.
- **Draw & Edit:** Easily draw new paths, areas, and markers directly on the map, or edit existing items.
- **File Support:** Full support for importing and exporting GPX, KML, KMZ, and GeoJSON files.
- **Performance Optimized:** Optional path and area simplification (on by default) for smoother performance. When enabled, simplified copies are made when duplicating tracks/activities/areas (originals preserved), and generated routes are simplified when saved. Configurable in settings.
- **Routing:** Generate routes for driving, biking, or walking. You can then save the generated route as an editable path.
- **Elevation Profiles:** Instantly visualize the elevation profile for any path.
- **Custom WMS Layers:** Import map layers from any WMS-compatible service. Browse available layers, add them to your map as overlays, and reorder them with drag-and-drop. Your WMS layers are saved locally and persist between sessions.
- **Strava Integration:** Connect your Strava account to view your activities on the map, download their original high-resolution GPX tracks, or duplicate them for editing.

---

## Privacy

OpenMapEditor is designed with privacy as a priority. All processing of your imported geographic data files (GPX, KML, KMZ) happens **entirely in your web browser**. Your files are never uploaded to or stored on any server.

The application only sends data to external services for specific, optional features that require an API. This communication is limited to the minimum data necessary for the feature to function:

- **Routing:** When you request a route, the coordinates of your start, end, and via points are sent to the selected routing provider.
- **Elevation Profiles:** When elevation data is already present in your file, it is used directly. Otherwise, path coordinates are sent to your chosen elevation provider (Google Maps Elevation API or GeoAdmin API for paths in Switzerland).
- **Search:** Text queries are sent to OpenStreetMap's Nominatim geocoding service to find and display locations on the map.
- **Strava Integration:** If you choose to connect your Strava account, the application communicates directly with the Strava API to fetch your activities after you grant authorization.

---

## Local Development Setup

This project is self-contained and does not require a package manager (`npm`).

1.  **Clone the Repository**

    ```bash
    git clone [https://github.com/openmapeditor/openmapeditor](https://github.com/openmapeditor/openmapeditor)
    ```

2.  **Provide API Keys**
    See the **"Configuring API Keys"** section below for detailed instructions.

3.  **Run the Application**
    Local development requires running the project from a local web server. Opening `index.html` directly from your filesystem will not work correctly.

---

## Production Deployment

Deployment to GitHub Pages is handled automatically by the GitHub Action located in `.github/workflows/deploy.yml`. The action runs automatically on every push to the `main` branch.

**In addition to deploying the site, the workflow also performs critical performance optimizations. It bundles all JavaScript files located between the `<!-- START-BUNDLE -->` and `<!-- END-BUNDLE -->` comments in `index.html` into a single script, minifies it to reduce its size, and updates `index.html` to load the final optimized file (`app.min.js`).**

For the deployment to succeed, you must provide your production API keys as repository secrets. See the **"Configuring API Keys"** section below for details.

---

## Configuring API Keys

To enable features that rely on external services, you must provide your own API keys.

### A. For Local Development

1.  Make a copy of the template file `js/secrets.js.example`.
2.  Rename the copy to **`js/secrets.js`**.
3.  Open the new `js/secrets.js` and fill in your actual API keys using the following `camelCase` variable names:
    - `googleApiKey`
    - `mapboxAccessToken`
    - `tracestrackApiKey`
    - `stravaClientId` (Optional)
    - `stravaClientSecret` (Optional)

> The `secrets.js` file is listed in `.gitignore` and will not be committed to the repository, keeping your keys safe.

### B. For Production Deployment

For the deployment to succeed, you must provide your production API keys as GitHub repository secrets.

1.  In your GitHub repository, go to **Settings > Secrets and variables > Actions**.
2.  Click **New repository secret** for each key listed below, ensuring the names match the `SNAKE_CASE` format exactly:
    - `GOOGLE_API_KEY`
    - `MAPBOX_ACCESS_TOKEN`
    - `TRACESTRACK_API_KEY`
    - `STRAVA_CLIENT_ID` (Optional)
    - `STRAVA_CLIENT_SECRET` (Optional)

### Important API Notes

> **Google API Note:** Your `GOOGLE_API_KEY` must have the following APIs enabled in your Google Cloud Platform project:
>
> - **Geolocation API** (for automatic map centering based on user location)
> - **Maps Elevation API** (for elevation profiles)
> - **Maps JavaScript API** (for elevation profiles)

> **GeoAdmin API Note:** The GeoAdmin API is free and does not require an API key. It only works for paths within Switzerland.

> **Strava API Note:** If you leave the `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` fields empty or do not provide them as secrets, the application will instead prompt end-users to provide their own personal API keys to use the integration.

---

## Customizing & Forking

This project is designed to be easily forked and customized. All primary branding can be configured in one place.

1.  **Edit the Configuration File**
    Open `js/config.js` and change the values of the `APP_NAME`, `APP_TITLE`, `APP_DESCRIPTION`, `APP_CREDITS_DESCRIPTION` and `APP_DOMAIN` variables to match your project.

    > The placeholders in `index.html` and `manifest.json` are replaced automatically by the GitHub deployment action. **You do not need to edit these files manually.**

2.  **Update Other Files**
    For a complete re-branding, you should also manually update the following:
    - **`README.md`**: Update the documentation with your project's information.
    - **`privacy.html`**: This is a legal document. You **must** review it and update it with your own contact information and policies.
    - **Contact & Repo URLs**: Change the email and GitHub links in `credits.html` and `privacy.html`.
    - **Copyright & Author**: Update your name and the year in the copyright headers of the source files and in `AUTHORS.md`.

---

## Plugins & Libraries Used

This project utilizes several open-source libraries, which are included in the repository.

- **d3-7.9.0**
  - Download URL: <https://d3js.org/d3.v7.min.js>
- **flag-icons-7.5.0**
  - Download URL: <https://github.com/lipis/flag-icons/archive/refs/tags/v7.5.0.zip>
- **jszip-3.10.1**
  - Download URL: <https://registry.npmjs.org/jszip/-/jszip-3.10.1.tgz>
- **leaflet-1.9.4**
  - Download URL: <https://github.com/Leaflet/Leaflet/releases/download/v1.9.4/leaflet.zip>
- **leaflet-draw-1.0.4**
  - Download URL: <https://registry.npmjs.org/leaflet-draw/-/leaflet-draw-1.0.4.tgz>
- **leaflet-geosearch-4.2.1**
  - Download URL: <https://registry.npmjs.org/leaflet-geosearch/-/leaflet-geosearch-4.2.1.tgz>
- **leaflet-locatecontrol-0.85.1**
  - Download URL: <https://registry.npmjs.org/leaflet.locatecontrol/-/leaflet.locatecontrol-0.85.1.tgz>
- **leaflet-routing-machine-3.2.12**
  - Download URL: <https://registry.npmjs.org/leaflet-routing-machine/-/leaflet-routing-machine-3.2.12.tgz>
- **polyline-encoded-0.0.9**
  - Download URL: <https://registry.npmjs.org/polyline-encoded/-/polyline-encoded-0.0.9.tgz>
- **proj4-2.19.10**
  - Download URL: <https://registry.npmjs.org/proj4/-/proj4-2.19.10.tgz>
- **simplify-js-1.2.4**
  - Download URL: <https://registry.npmjs.org/simplify-js/-/simplify-js-1.2.4.tgz>
- **sortablejs-1.15.6**
  - Download URL: <https://registry.npmjs.org/sortablejs/-/sortablejs-1.15.6.tgz>
- **sweetalert2-11.23.0**
  - Download URL: <https://registry.npmjs.org/sweetalert2/-/sweetalert2-11.23.0.tgz>
- **togeojson-0.16.2**
  - Download URL: <https://github.com/mapbox/togeojson/archive/refs/tags/0.16.2.zip>

---

## License

Copyright (C) 2025 Aron Sommer.

This project is licensed under the GNU Affero General Public License v3.0. See the [LICENSE](LICENSE) file for full details.
