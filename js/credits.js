// OpenMapEditor - A web-based editor for creating and managing geographic data.
// Copyright (C) 2025 Aron Sommer. See LICENSE file for full license details.

const CREDITS_HTML = `
<style>
  .credits-container {
    font-size: 16px;
    line-height: 1.6;
    text-align: left;
    color: var(--text-color);
  }
  .credits-header {
    text-align: center;
    margin-bottom: 0px; /* This is correct. It removes the large space below the header. */
  }
  .credits-header h3 {
    font-size: 24px;
    font-weight: 600;
    margin-bottom: 8px;
  }
  .credits-header p {
    margin: 0;
    color: var(--text-color);
  }
  .credits-header a {
    color: var(--highlight-color);
    text-decoration: none;
    font-size: 15px;
  }
  .credits-header a:hover {
    text-decoration: underline;
  }
  .support-section {
    margin: 0; /* This is correct. It removes the large margin at the top of the section. */
    text-align: center;
    background-color: transparent;
  }
  .support-section p {
    margin-top: 0; /* This is a correct change */
    margin-bottom: 15px;
    font-size: 16px;
  }
  .support-button {
    display: inline-block;
    padding: 12px 24px;
    font-size: 16px;
    font-weight: bold;
    color: #fff;
    background-color: #6772E5;
    border-radius: 8px;
    text-decoration: none;
    transition: background-color 0.2s;
  }
</style>

<div class="credits-container">

  <div class="credits-header">
    <h3>OpenMapEditor</h3>
    <p>A simple, powerful web-based editor for creating, viewing, and managing geographic data like paths and markers, built with Leaflet.js.</p>
    <p style="margin-top: 10px;"> <a href="mailto:openmapeditor@gmail.com">openmapeditor@gmail.com</a><br>
      <a href="https://github.com/openmapeditor/openmapeditor" target="_blank">GitHub</a>
    </p>
  </div>

  <div class="support-section">
    <p style="margin-top: 10px;"> If you find this tool useful, consider supporting its development.</p>
    <a href="https://donate.stripe.com/7sY4gy8bmc8egk61fr7ss00" target="_blank" rel="noopener noreferrer" class="support-button">
      ♥ Support the Project ♥
    </a>
  </div>

</div>
`;
