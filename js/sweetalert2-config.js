// Copyright (C) 2025 Aron Sommer. See LICENSE file for full license details.

// Configure global SweetAlert2 defaults
const SwalOriginal = Swal.fire;
Swal.fire = function (options) {
  if (typeof options === "object" && !options.position) {
    // Default position for toasts
    if (options.toast) {
      options.position = "top";
    }
    // Default position for regular popups
    else {
      options.position = "top";
    }
  }
  return SwalOriginal.call(this, options);
};
