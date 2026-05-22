'use strict';

const app = require('../server');

const port = Number(process.env.PORT || 8080);

if (require.main === module) {
  app.listen(port, () => {
    console.log(`AdPlatform Render backend listening on port ${port}`);
  });
}

module.exports = app;
