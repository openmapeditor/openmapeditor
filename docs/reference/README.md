# Third-Party Code Reference

This folder contains original source files from third-party projects that were used as a reference for code in this repository.

---

### `geoadmin-elevation-profile/utils.ts`

- **Source:** `https://github.com/geoadmin/web-mapviewer/blob/develop/packages/geoadmin-elevation-profile/src/utils.ts`
- **Used In:** `js/elevation-profile.js`
- **Purpose:** This file is the original source for the core statistical logic in `elevation-profile.js`.
  - It served as the reference for calculating `ascent` and `descent` directly from raw, unsmoothed data points.
  - The `calculateSwissHikingTime` and `formatHikingTime` functions were adapted from this file. (Note: A bug in the original `hikingTime` loop, `points.length - 2`, was corrected to `points.length - 1` in our implementation).

---

### `geoadmin-service-alti/profile_helpers.py`

- **Source:** `https://github.com/geoadmin/service-alti/blob/develop/app/helpers/profile_helpers.py`
- **Used In:** `js/elevation.js`
- **Purpose:** This file is the original Python backend source for the `map.geo.admin.ch` elevation profile service. It was used as the primary reference for the data-fetching and sampling logic in `elevation.js`, specifically replicating the 200-point default (`PROFILE_DEFAULT_AMOUNT_POINTS`) and 5000-point maximum (`PROFILE_MAX_AMOUNT_POINTS`) logic.

---

### `organicmaps/serdes.cpp`

- **Source:** `https://github.com/organicmaps/organicmaps/blob/master/libs/kml/serdes.cpp`
- **Used In:** `js/config.js`
- **Purpose:** This file is the original C++ source for the `SaveColorToABGR` function. It was used as a reference to create the `cssToKmlColor` JavaScript function, ensuring KML color strings are in the same `AABBGGRR` format.

---

### `organicmaps/style.mapcss`

- **Source:** `https://github.com/organicmaps/organicmaps/blob/master/data/styles/default/dark/style.mapcss`
- **Used In:** `js/config.js`
- **Purpose:** This file is the source for the 16 "Bookmark" CSS hex color values (e.g., `BookmarkRed-color: #E51B23;`) used to define the `ORGANIC_MAPS_COLORS_DATA` array.
