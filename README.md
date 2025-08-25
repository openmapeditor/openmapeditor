# OpenMapEditor

OpenMapEditor is a simple, powerful web-based editor for creating, viewing, and managing geographic data like paths and markers. Built with Leaflet.js, it supports interactive drawing, file import/export (GPX, KML, GeoJSON), routing, elevation profiles, and custom styling.

---

## Features

- **Interactive Drawing:** Draw paths and place markers directly on the map.
- **File Support:** Import and export data in GPX, KML, and GeoJSON formats.
- **Routing:** Generate routes for driving, biking, and walking.
- **Elevation Profiles:** Visualize the elevation of paths.
- **Custom Styling:** Change colors and styles of map features.

---

## Local Development Setup

This project is self-contained and does not require a local server or package manager (`npm`).

1.  **Clone the Repository**

    ```bash
    git clone [https://github.com/openmapeditor/openmapeditor](https://github.com/openmapeditor/openmapeditor)
    ```

2.  **Provide API Keys**
    To enable routing, search, and elevation services, you need to provide your own API keys.

    - Make a copy of the template file `js/secrets.js.example`.
    - Rename the copy to **`js/secrets.js`**.
    - Open the new `js/secrets.js` and fill in your actual API keys.

    > **Important:** The `secrets.js` file is listed in `.gitignore` and will not be committed to the repository, keeping your keys safe and private.

3.  **Run the Application**
    Simply open the `index.html` file in your web browser.

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
    - `VITE_GOOGLE_API_KEY`
    - `VITE_MAPBOX_ACCESS_TOKEN`
    - `VITE_TRACETRACK_API_KEY`
5.  Repeat this process for all three keys.

---

## Plugins & Libraries Used

This project utilizes several open-source libraries, which are included in the repository.

- **d3-7.8.4**
  - Download URL: `https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.4/d3.min.js`
- **jszip-3.10.1**
  - Download URL: `https://github.com/Stuk/jszip/archive/refs/tags/v3.10.1.zip`
- **leaflet-1.9.4**
  - Download URL: `https://leafletjs-cdn.s3.amazonaws.com/content/leaflet/v1.9.4/leaflet.zip`
- **leaflet-draw-0.4.14**
  - Download URL: `https://registry.npmjs.org/leaflet-draw/-/leaflet-draw-1.0.4.tgz`
- **leaflet-elevation-2.5.1**
  - Download URL: `https://registry.npmjs.org/@raruto/leaflet-elevation/-/leaflet-elevation-2.5.1.tgz`
  - Important Info: Changed line 64 in `leaflet-elevation-2.5.1/src/components/marker.js`
- **leaflet-geosearch-4.2.0**
  - Download URL: `https://registry.npmjs.org/leaflet-geosearch/-/leaflet-geosearch-4.2.0.tgz`
- **leaflet-locatecontrol-0.84.2**
  - Download URL: `https://registry.npmjs.org/leaflet.locatecontrol/-/leaflet.locatecontrol-0.84.2.tgz`
- **leaflet-routing-machine-3.2.12**
  - Download URL: `https://github.com/perliedman/leaflet-routing-machine/archive/refs/tags/v3.2.12.zip`
- **simplify-js-1.2.4**
  - Download URL: `https://github.com/mourner/simplify-js/archive/refs/tags/v1.2.4.zip`
- **sweetalert2-11.22.2**
  - Download URL: `https://registry.npmjs.org/sweetalert2/-/sweetalert2-11.22.2.tgz`
- **togeojson-0.16.2**
  - Download URL: `https://github.com/mapbox/togeojson/archive/refs/tags/0.16.2.zip`

---

## License

Copyright (C) 2025 Aron Sommer.

This project is licensed under the GNU General Public License v3.0. See the [LICENSE](LICENSE) file for full details.
