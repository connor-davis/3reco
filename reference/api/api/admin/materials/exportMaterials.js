const { Router } = require('express');
const router = Router();
const passport = require('passport');
const fs = require("fs");

const Material = require('../../../models/material.model');
const generateMaterialsExcelSheet = require('../../utils/excel/generateMaterialsExcelSheet');

/**
 * @openapi
 * /api/v1/admin/export/materials:
 *   get:
 *     description: Retrieve materials excel data.
 *     tags: [Admin]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns materials excel data.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.get(
  '/',
  passport.authenticate('jwt', { session: false }),
  async (request, response) => {
    try {
      const materials = await Material.find();

      await generateMaterialsExcelSheet(materials, (path, filename) => {
        response.set('Content-disposition', 'attachment; filename=' + filename);
        response.set(
          'Content-type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64'
        );
        response.status(200).download(path);

        setTimeout(() => {
          fs.unlinkSync(path);
        }, 30000);
      });
    } catch (error) {
      return response
        .status(200)
        .json({ message: 'Failed to get materials excel data.', error });
    }
  }
);

module.exports = router;
