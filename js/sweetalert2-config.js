// Copyright (C) 2025 Aron Sommer. See LICENSE file for full license details.

// Configure global SweetAlert2 defaults
const SwalOriginal = Swal.fire;
Swal.fire = function (options) {
  if (typeof options === "object") {
    // Auto-set iconColor based on icon type
    if (options.icon && !options.iconColor) {
      const iconColorMap = {
        error: "var(--swal-color-error)",
        warning: "var(--swal-color-warning)",
        success: "var(--swal-color-success)",
        info: "var(--swal-color-info)",
        question: "var(--swal-color-question)",
      };
      options.iconColor = iconColorMap[options.icon];
    }

    // Default position configuration
    if (!options.position) {
      // Default position for toasts
      if (options.toast) {
        options.position = "top";
      }
      // Default position for regular popups
      else {
        options.position = "top";
      }
    }
  }
  return SwalOriginal.call(this, options);
};
