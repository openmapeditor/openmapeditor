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

> **Google API Note:** To use the Google elevation service, your `GOOGLE_API_KEY` must have both the **Maps Elevation API** and the **Maps JavaScript API** enabled in your Google Cloud Platform project.

> **Strava API Note:** If you leave the `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` fields empty or do not provide them as secrets, the application will instead prompt end-users to provide their own personal API keys to use the integration.

---

## Customizing & Forking

This project is designed to be easily forked and customized. All primary branding can be configured in one place.

1.  **Edit the Configuration File**
    Open `js/config.js` and change the values of the `APP_NAME`, `APP_SHORT_NAME`, `APP_DESCRIPTION`, `APP_SHORT_DESCRIPTION` and `APP_DOMAIN` variables to match your project.

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
  - Download URL: <https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js>
- **jszip-3.10.1**
  - Download URL: <https://registry.npmjs.org/jszip/-/jszip-3.10.1.tgz>
- **leaflet-1.9.4**
  - Download URL: <https://github.com/Leaflet/Leaflet/releases/download/v1.9.4/leaflet.zip>
- **leaflet-draw-1.0.4**
  - Download URL: <https://registry.npmjs.org/leaflet-draw/-/leaflet-draw-1.0.4.tgz>
- **leaflet-elevation-2.5.1**
  - Download URL: <https://registry.npmjs.org/@raruto/leaflet-elevation/-/leaflet-elevation-2.5.1.tgz>
  - Important Info: Changed line 64 in `leaflet-elevation-2.5.1/src/components/marker.js`
  - Important Info: Changed line 161 in `leaflet-elevation-2.5.1/src/components/chart.js`
  - Important Info: In `leaflet-elevation-2.5.1/src/handlers/time.js` the time display was customized using a new function, the label was updated to "Walking Time," and the distance calculation logic was refined.
- **leaflet-geosearch-4.2.1**
  - Download URL: <https://registry.npmjs.org/leaflet-geosearch/-/leaflet-geosearch-4.2.1.tgz>
- **leaflet-locatecontrol-0.85.1**
  - Download URL: <https://registry.npmjs.org/leaflet.locatecontrol/-/leaflet.locatecontrol-0.85.1.tgz>
- **leaflet-routing-machine-3.2.12**
  - Download URL: <https://registry.npmjs.org/leaflet-routing-machine/-/leaflet-routing-machine-3.2.12.tgz>
- **polyline-encoded-0.0.9**
  - Download URL: <https://registry.npmjs.org/polyline-encoded/-/polyline-encoded-0.0.9.tgz>
- **simplify-js-1.2.4**
  - Download URL: <https://registry.npmjs.org/simplify-js/-/simplify-js-1.2.4.tgz>
- **sweetalert2-11.23.0**
  - Download URL: <https://registry.npmjs.org/sweetalert2/-/sweetalert2-11.23.0.tgz>
- **togeojson-0.16.2**
  - Download URL: <https://github.com/mapbox/togeojson/archive/refs/tags/0.16.2.zip>

---

## License

Copyright (C) 2025 Aron Sommer.

This project is licensed under the GNU Affero General Public License v3.0. See the [LICENSE](LICENSE) file for full details.
