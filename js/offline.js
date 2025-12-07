// Copyright (C) 2025 Aron Sommer. See LICENSE file for full license details.

/**
 * Offline tile management for the map editor
 * Provides basic download and offline mode functionality using leaflet.offline
 */

const OfflineManager = {
  tileLayerOffline: null,
  map: null,

  /**
   * Initialize offline functionality for a tile layer
   * @param {L.Map} map - The Leaflet map instance
   * @param {L.TileLayer.Offline} tileLayer - The offline-capable tile layer
   */
  initialize(map, tileLayer) {
    // Store references
    this.map = map;
    this.tileLayerOffline = tileLayer;

    console.log("Offline manager initialized");
  },

  /**
   * Download tiles for the current map view
   * @param {number} minZoom - Minimum zoom level to download
   * @param {number} maxZoom - Maximum zoom level to download
   * @param {Function} progressCallback - Optional callback for progress updates (downloaded, total)
   */
  async downloadCurrentView(minZoom, maxZoom, progressCallback) {
    if (!this.map || !this.tileLayerOffline) {
      console.error("Map or tile layer not initialized");
      return 0;
    }

    const latlngBounds = this.map.getBounds();

    try {
      // Calculate tiles for each zoom level
      let allTiles = [];
      for (let zoom = minZoom; zoom <= maxZoom; zoom++) {
        // Convert lat/lng bounds to pixel bounds at this zoom level
        const area = L.bounds(
          this.map.project(latlngBounds.getNorthWest(), zoom),
          this.map.project(latlngBounds.getSouthEast(), zoom)
        );

        // Get tile URLs for this zoom level
        const tiles = this.tileLayerOffline.getTileUrls(area, zoom);
        allTiles = allTiles.concat(tiles);
      }

      const totalTiles = allTiles.length;
      console.log(`Preparing to download ${totalTiles} tiles...`);

      // Download each tile
      let downloaded = 0;
      for (const tile of allTiles) {
        try {
          const blob = await LeafletOffline.downloadTile(tile.url);
          await LeafletOffline.saveTile(tile, blob);
          downloaded++;

          // Call progress callback if provided
          if (progressCallback) {
            progressCallback(downloaded, totalTiles);
          }
        } catch (err) {
          console.warn(`Failed to download tile at ${tile.url}:`, err);
        }
      }

      console.log(`Successfully downloaded ${downloaded} tiles`);
      return downloaded;
    } catch (error) {
      console.error("Error downloading tiles:", error);
      throw error;
    }
  },

  /**
   * Get statistics about stored tiles
   * @returns {Promise<number>} Number of tiles stored offline
   */
  async getStoredTileCount() {
    try {
      const count = await LeafletOffline.getStorageLength();
      return count;
    } catch (error) {
      console.error("Error getting tile count:", error);
      return 0;
    }
  },

  /**
   * Clear all offline tiles from storage
   */
  async clearAllTiles() {
    try {
      await LeafletOffline.truncate();
      console.log("All offline tiles cleared");
    } catch (error) {
      console.error("Error clearing tiles:", error);
      throw error;
    }
  },

  /**
   * Show the offline management dialog
   */
  async showOfflineDialog() {
    const tileCount = await this.getStoredTileCount();

    Swal.fire({
      title: "Offline Map",
      html: `
        <p style="margin-bottom: 15px;">Tiles stored: ${tileCount}</p>
        <button id="offline-download-btn" class="swal2-confirm swal2-styled" style="margin: 5px;">
          Download Current View
        </button>
        <button id="offline-clear-btn" class="swal2-cancel swal2-styled" style="margin: 5px;">
          Clear All Tiles
        </button>
      `,
      showConfirmButton: false,
      showCancelButton: false,
      didOpen: () => {
        const downloadBtn = document.getElementById("offline-download-btn");
        const clearBtn = document.getElementById("offline-clear-btn");

        downloadBtn.addEventListener("click", async () => {
          Swal.close();
          await this.handleDownload();
        });

        clearBtn.addEventListener("click", async () => {
          Swal.close();
          await this.handleClear();
        });
      },
    });
  },

  /**
   * Handle the download action
   */
  async handleDownload() {
    const currentZoom = this.map.getZoom();
    const minZoom = Math.max(0, currentZoom - 2);
    const maxZoom = Math.min(19, currentZoom + 2);

    const result = await Swal.fire({
      title: "Download Tiles",
      html: `
        <p>Current zoom: ${currentZoom}</p>
        <p>Will download zoom levels ${minZoom} to ${maxZoom}</p>
        <p style="color: #666; font-size: 0.9em;">This may take a while...</p>
      `,
      icon: "question",
      iconColor: "var(--swal-color-info)",
      showCancelButton: true,
      confirmButtonText: "Download",
      cancelButtonText: "Cancel",
    });

    if (result.isConfirmed) {
      // Show progress dialog
      Swal.fire({
        title: "Downloading...",
        html: `
          <p id="download-progress-text">Preparing...</p>
          <div style="width: 100%; background-color: #e0e0e0; border-radius: 4px; margin-top: 10px;">
            <div id="download-progress-bar" style="width: 0%; height: 24px; background-color: var(--highlight-color); border-radius: 4px; transition: width 0.3s;"></div>
          </div>
        `,
        allowOutsideClick: false,
        showConfirmButton: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      try {
        const count = await this.downloadCurrentView(minZoom, maxZoom, (downloaded, total) => {
          // Update progress
          const percent = Math.round((downloaded / total) * 100);
          const progressBar = document.getElementById("download-progress-bar");
          const progressText = document.getElementById("download-progress-text");

          if (progressBar) {
            progressBar.style.width = `${percent}%`;
          }
          if (progressText) {
            progressText.textContent = `Downloaded ${downloaded} of ${total} tiles (${percent}%)`;
          }
        });

        Swal.fire({
          title: "Success!",
          text: `Downloaded ${count} tiles`,
          icon: "success",
          iconColor: "var(--swal-color-success)",
          timer: 2000,
        });
      } catch (error) {
        Swal.fire({
          title: "Error",
          text: "Failed to download tiles",
          icon: "error",
          iconColor: "var(--swal-color-error)",
        });
      }
    }
  },

  /**
   * Handle the clear action
   */
  async handleClear() {
    const tileCount = await this.getStoredTileCount();

    if (tileCount === 0) {
      Swal.fire({
        title: "No Tiles",
        text: "No offline tiles to clear",
        icon: "info",
        iconColor: "var(--swal-color-info)",
        timer: 2000,
      });
      return;
    }

    const result = await Swal.fire({
      title: "Clear All Tiles?",
      text: `This will delete ${tileCount} stored tiles`,
      icon: "warning",
      iconColor: "var(--swal-color-warning)",
      showCancelButton: true,
      confirmButtonText: "Clear",
      cancelButtonText: "Cancel",
    });

    if (result.isConfirmed) {
      try {
        await this.clearAllTiles();
        Swal.fire({
          title: "Cleared!",
          text: "All offline tiles removed",
          icon: "success",
          iconColor: "var(--swal-color-success)",
          timer: 2000,
        });
      } catch (error) {
        Swal.fire({
          title: "Error",
          text: "Failed to clear tiles",
          icon: "error",
          iconColor: "var(--swal-color-error)",
        });
      }
    }
  },
};

// Export for use in other modules
window.OfflineManager = OfflineManager;
