# OpenMapEditor

OpenMapEditor is a simple, powerful web-based editor for creating, viewing, and managing geographic data like paths and markers. Built with Leaflet.js, it supports interactive drawing, file import/export (GPX, KML, KMZ), routing, elevation profiles, custom styling, and Strava activity integration.

---

## Features

- **Privacy First:** Your files are processed entirely on your local machine and are never uploaded to a server. Optional features like routing and elevation profiles send only the necessary coordinates to external APIs to function.
- **Organic Maps Compatibility:** Smoothly import and export KMZ backups while preserving all 16 of the Organic Maps colors for your paths and markers.
- **Draw & Edit:** Easily draw new paths and place markers directly on the map, or edit existing items.
- **File Support:** Full support for importing and exporting GPX, KML, and KMZ files.
- **Performance Optimized:** To ensure a smooth experience, complex paths are automatically simplified. This is enabled by default but can be disabled in the settings if you need to preserve every single point.
- **Routing:** Generate routes for driving, biking, or walking. You can then save the generated route as an editable path.
- **Elevation Profiles:** Instantly visualize the elevation profile for any path.
- **Strava Integration:** Connect your Strava account to view your activities on the map, download their original high-resolution GPX tracks, or duplicate them for editing.

---

## Privacy

OpenMapEditor is designed with privacy as a priority. All processing of your imported geographic data files (GPX, KML, KMZ) happens **entirely in your web browser**. Your files are never uploaded to or stored on any server.

The application only sends data to external services for specific, optional features that require an API. This communication is limited to the minimum data necessary for the feature to function:

- **Routing:** When you request a route, the coordinates of your start, end, and via points are sent to the selected routing provider.
- **Elevation Profiles:** To generate a profile, the coordinates of the selected path are sent to the chosen elevation provider.
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
    To enable features that rely on external services, you need to provide your own API keys.

    - Make a copy of the template file `js/secrets.js.example`.
    - Rename the copy to **`js/secrets.js`**.
    - Open the new `js/secrets.js` and fill in your actual API keys.

    > **Important:** The `secrets.js` file is listed in `.gitignore` and will not be committed to the repository, keeping your keys safe and private.

3.  **Run the Application**
    Local development requires running the project from a local web server. Opening `index.html` directly from your filesystem will not work correctly.

---

## Production Deployment

Deployment to GitHub Pages is handled automatically by the GitHub Action located in `.github/workflows/deploy.yml`. The action creates the `js/secrets.js` file automatically during the deployment process, injecting keys that are stored securely in the repository's settings.

The deployment action runs automatically on every push to the `main` branch.

### Adding Secrets to GitHub

To make the deployment work, you must add your production API keys to your repository's secrets.

1.  In your GitHub repository, go to the **Settings** tab.
2.  In the left sidebar, go to **Secrets and variables > Actions**.
3.  Click the **New repository secret** button.
4.  Enter the name and value for each secret. The names must exactly match the ones used in the workflow file:
    - `GOOGLE_API_KEY`
    - `MAPBOX_ACCESS_TOKEN`
    - `TRACESTRACK_API_KEY`
    - `STRAVA_CLIENT_ID`
    - `STRAVA_CLIENT_SECRET`
5.  Repeat this process for all required keys.

---

## Plugins & Libraries Used

This project utilizes several open-source libraries, which are included in the repository.

- **d3-7.9.0**
  - Download URL: `https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js`
- **jszip-3.10.1**
  - Download URL: `https://github.com/Stuk/jszip/archive/refs/tags/v3.10.1.zip`
- **leaflet-1.9.4**
  - Download URL: `https://leafletjs-cdn.s3.amazonaws.com/content/leaflet/v1.9.4/leaflet.zip`
- **leaflet-draw-0.4.14**
  - Download URL: `https://registry.npmjs.org/leaflet-draw/-/leaflet-draw-1.0.4.tgz`
- **leaflet-elevation-2.5.1**
  - Download URL: `https://registry.npmjs.org/@raruto/leaflet-elevation/-/leaflet-elevation-2.5.1.tgz`
  - Important Info: Changed line 64 in `leaflet-elevation-2.5.1/src/components/marker.js`
  - Important Info: Changed line 161 in `leaflet-elevation-2.5.1/src/components/chart.js`
  - Important Info: In `leaflet-elevation-2.5.1/src/handlers/time.js` the time display was customized using a new function and the label was updated to "Walking Time". The distance calculation logic was refined and the chart tooltips were disabled.
- **leaflet-geosearch-4.2.1**
  - Download URL: `https://registry.npmjs.org/leaflet-geosearch/-/leaflet-geosearch-4.2.1.tgz`
- **leaflet-locatecontrol-0.85.1**
  - Download URL: `https://registry.npmjs.org/leaflet.locatecontrol/-/leaflet.locatecontrol-0.85.1.tgz`
- **leaflet-routing-machine-3.2.12**
  - Download URL: `https://github.com/perliedman/leaflet-routing-machine/archive/refs/tags/v3.2.12.zip`
- **polyline-encoded-0.0.9**
- Download URL: `https://registry.npmjs.org/polyline-encoded/-/polyline-encoded-0.0.9.tgz`
- **simplify-js-1.2.4**
  - Download URL: `https://github.com/mourner/simplify-js/archive/refs/tags/v1.2.4.zip`
- **sweetalert2-11.22.2**
  - Download URL: `https://registry.npmjs.org/sweetalert2/-/sweetalert2-11.22.2.tgz`
- **togeojson-0.16.2**
  - Download URL: `https://github.com/mapbox/togeojson/archive/refs/tags/0.16.2.zip`

---

## License

Copyright (C) 2025 Aron Sommer.

This project is licensed under the GNU Affero General Public License v3.0. See the [LICENSE](LICENSE) file for full details.
