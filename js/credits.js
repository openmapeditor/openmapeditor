const CREDITS_HTML = `
<style>
  .credits-container {
    font-size: 16px;
    line-height: 1.6;
    text-align: left;
    color: var(--text-color); /* Use theme variable */
  }
  .credits-header {
    text-align: center;
    margin-bottom: 30px;
  }
  .credits-header h3 {
    font-size: 24px;
    font-weight: 600;
    margin-bottom: 8px;
  }
  .credits-header p {
    margin: 0;
    color: var(--text-color); /* Use theme variable */
  }
  .credits-header a {
    color: var(--highlight-color); /* Use theme variable */
    text-decoration: none;
    font-size: 15px;
  }
  .credits-header a:hover {
    text-decoration: underline;
  }
  .support-section {
    margin: 30px 0;
    text-align: center;
    background-color: transparent; /* Removed colored background */
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
    color: #fff; /* White text on a solid color button works for both themes */
    background-color: #6772E5; /* Keep brand color */
    border-radius: 8px;
    text-decoration: none;
    transition: background-color 0.2s;
  }
</style>

<div class="credits-container">

  <div class="credits-header">
    <h3>OpenMapEditor</h3>
    <p>A custom web-based map editor built with Leaflet.js and various open-source libraries.</p>
    <p style="margin-top: 15px;">
      <a href="mailto:openmapeditor@gmail.com">openmapeditor@gmail.com</a>
    </p>
  </div>

  <div class="support-section">
    <p>If you find this tool useful, consider supporting its development.</p>
    <a href="https://donate.stripe.com/7sY4gy8bmc8egk61fr7ss00" target="_blank" rel="noopener noreferrer" class="support-button">
      ♥ Support the Project ♥
    </a>
  </div>

</div>
`;
