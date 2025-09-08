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
    margin-bottom: 0px;
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
    margin: 0;
    text-align: center;
    background-color: transparent;
  }
  .support-section p {
    margin-top: 0;
    margin-bottom: 15px;
    font-size: 16px;
  }
  .support-button {
    display: inline-block;
    padding: 12px 24px;
    font-size: 16px;
    font-weight: bold;
    color: #fff;
    background-color: var(--highlight-color);
    border-radius: 8px;
    text-decoration: none;
    transition: background-color 0.2s;
  }
  .attributions-section {
    margin-top: 25px;
    padding-top: 15px;
    border-top: 1px solid var(--border-color);
    text-align: center;
  }
  .attributions-section h4 {
    margin-top: 0;
    margin-bottom: 15px;
    font-size: 18px;
    font-weight: 500;
  }
  .attributions-section p {
      margin: 5px 0;
      font-size: 14px;
  }
  /* Style for the sub-header to make it clear */
  .attribution-subheader {
    font-weight: 500;
    margin-top: 20px;
    margin-bottom: 10px;
    font-size: 16px;
  }
  .attributions-section a {
      color: var(--highlight-color);
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

  <div class="attributions-section">
    <h4>Data & Technology Attributions</h4>
    
    <p>Powered by <a href="https://leafletjs.com" target="_blank">Leaflet</a></p>
    
    <p class="attribution-subheader">Base Maps</p>
    
    <p>
      OpenStreetMap:
      &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a>
    </p>
    <p>
      CyclOSM:
      &copy; <a href="https://www.cyclosm.org/" target="_blank">CyclOSM</a>
    </p>
    <p>
      Tracetrack Topo:
      &copy; <a href="https://www.tracestrack.com/" target="_blank">Tracetrack</a>
    </p>
    <p>
      TopPlusOpen:
      &copy; <a href="https://www.govdata.de/dl-de/by-2-0" target="_blank">dl-de/by-2-0</a>
    </p>
    <p>
      Swisstopo:
      &copy; <a href="https://www.swisstopo.admin.ch/" target="_blank">swisstopo</a>
    </p>
    </div>

</div>
`;
