# Third-Party Code Reference

This folder contains original source files from third-party projects that were used as a reference for code in this repository.

---

### `geoadmin-elevation-profile/src/utils.ts`

- **Source:** `https://github.com/geoadmin/web-mapviewer/blob/develop/packages/geoadmin-elevation-profile/src/utils.ts`
- **Used In:** `js/elevation-profile.js`
- **Purpose:** This file is the original source for the `calculateSwissHikingTime` and `formatHikingTime` functions. It is stored here with its original path for clear attribution.

---

### `organicmaps/libs/kml/serdes.cpp`

- **Source:** `https://github.com/organicmaps/organicmaps/blob/master/libs/kml/serdes.cpp`
- **Used In:** `js/config.js`
- **Purpose:** This file is the original C++ source for the `SaveColorToABGR` function. It was used as a reference to create the `cssToKmlColor` JavaScript function, ensuring KML color strings are in the same `AABBGGRR` format.

---

### `organicmaps/data/styles/default/dark/style.mapcss`

- **Source:** `https://github.com/organicmaps/organicmaps/blob/master/data/styles/default/dark/style.mapcss`
- **Used In:** `js/config.js`
- **Purpose:** This file is the source for the 16 "Bookmark" CSS hex color values (e.g., `BookmarkRed-color: #E51B23;`) used to define the `ORGANIC_MAPS_COLORS_DATA` array.
