/**
 * Search Modal
 *
 * Provides a consistent search interface for all search inputs in the application.
 * Opens a SweetAlert2 modal containing the search input and results.
 * Reuses the existing setupAutocomplete() function for all search logic.
 */

/**
 * Shows a search modal
 * @param {string} title - Modal title (e.g., "Search Location", "Set Start Point")
 * @param {string} placeholder - Input placeholder text
 * @param {string} currentValue - Current value of the input (if any)
 * @param {function(L.LatLng, string): void} callback - Callback when location is selected
 * @param {boolean} isOffline - Whether the app is currently offline
 * @returns {Promise<void>}
 */
async function showSearchModal(title, placeholder, currentValue, callback, isOffline = false) {
  await Swal.fire({
    title: title,
    html: `
      <div>
        ${
          isOffline
            ? '<p style="color: var(--color-red); margin-bottom: 12px;">You are offline. Search will not work.</p>'
            : '<p style="margin-bottom: 12px;">Search for a place or enter coordinates.<br>Example: 47.5, 8.5 or N 47° 30\' 0" E 8° 30\' 0"</p>'
        }
        <input
          type="text"
          id="search-modal-input"
          class="swal2-input"
          placeholder="${placeholder}"
          value="${currentValue || ""}"
          autocomplete="off"
          ${isOffline ? 'disabled data-offline="true"' : ""}
        />
        <div id="search-modal-suggestions" class="search-modal-suggestions"></div>
      </div>
    `,
    width: "500px",
    showCancelButton: true,
    showConfirmButton: false, // We'll handle selection via autocomplete
    cancelButtonText: "Cancel",
    customClass: {
      popup: "search-modal",
      htmlContainer: "search-modal-container",
    },
    didOpen: () => {
      const inputEl = document.getElementById("search-modal-input");
      const suggestionsEl = document.getElementById("search-modal-suggestions");

      // Auto-focus and select existing text
      inputEl.focus();
      if (currentValue) {
        inputEl.select();
      }

      // Set up autocomplete with a wrapper callback that closes the modal
      setupAutocomplete(inputEl, suggestionsEl, (latLng, label) => {
        // Close modal and trigger the original callback
        Swal.close();
        callback(latLng, label);
      });

      // Handle Enter key on empty results (close modal)
      inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const hasSuggestions =
            suggestionsEl.style.display === "block" &&
            suggestionsEl.querySelectorAll(".autocomplete-suggestion-item").length > 0;
          if (!hasSuggestions && inputEl.value.trim() === "") {
            Swal.close();
          }
        }
      });
    },
    willClose: () => {
      // Clean up any event listeners if needed
      // setupAutocomplete already handles its own cleanup via blur event
    },
  });

  // If user clicks Cancel or clicks outside, result.isDismissed will be true
  // We don't need to do anything in that case
}

/**
 * Attaches click handler to an input element to show the unified search modal
 * @param {HTMLInputElement} inputEl - The input element to enhance
 * @param {string} modalTitle - Title for the search modal
 * @param {function(L.LatLng, string): void} callback - Callback when location is selected
 */
function attachSearchModalToInput(inputEl, modalTitle, callback) {
  // Store original placeholder for offline state handling
  const originalPlaceholder = inputEl.placeholder;

  // Make input look clickable
  inputEl.style.cursor = "pointer";
  inputEl.setAttribute("title", "Click to search");

  // Make input readonly to prevent keyboard from appearing and cursor from blinking
  inputEl.setAttribute("readonly", "true");

  // Track if modal is currently open to avoid double-opening
  let modalOpen = false;

  // Helper function to open the modal
  const openModal = () => {
    if (modalOpen) return;
    modalOpen = true;

    // Immediately blur the input to prevent keyboard from staying open on mobile
    inputEl.blur();

    // Check if offline
    const isOffline = !navigator.onLine || inputEl.classList.contains("offline");

    showSearchModal(
      modalTitle,
      originalPlaceholder,
      inputEl.value,
      (latLng, label) => {
        // Update input display
        inputEl.value = label;
        // Trigger the original callback
        callback(latLng, label);
      },
      isOffline
    ).finally(() => {
      modalOpen = false;
    });
  };

  // Click handler to open modal
  inputEl.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openModal();
  });

  // Intercept keyboard input to open modal instead of typing
  inputEl.addEventListener("keydown", (e) => {
    // Allow Tab, Shift, Ctrl, Alt, Meta for navigation
    // Allow Escape to close anything
    const allowedKeys = ["Tab", "Shift", "Control", "Alt", "Meta", "Escape"];
    if (allowedKeys.includes(e.key)) {
      return;
    }

    // For any other key, open the modal instead
    e.preventDefault();
    openModal();
  });

  // Focus handler for accessibility
  inputEl.addEventListener("focus", () => {
    // Don't auto-open on focus - let user decide to click or type
    // This prevents unwanted modal opens when tabbing through fields
  });
}
