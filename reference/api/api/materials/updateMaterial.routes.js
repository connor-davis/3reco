const { Router } = require('express');
const router = Router();
const Material = require('../../models/material.model');
const Stock = require('../../models/stock.model');
const logger = require('../../utils/logger');

/**
 * @openapi
 * /api/v1/materials:
 *   put:
 *     description: Update an existing material item.
 *     tags: [Materials]
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: _id
 *         description: The material item's id.
 *         type: string
 *     responses:
 *       200:
 *         description: Returns the material item's updated data.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.put('/', async (request, response) => {
  let { body, user } = request;

  const found = await Material.findOne({ _id: body._id });

  delete body.__v;

  if (!found)
    return response.status(200).json({
      message: 'Material item not found.',
      error: 'material-not-found',
    });
  else {
    try {
      await Material.updateOne({ _id: body._id }, body);

      const stockRelatedToMaterial = await Stock.find({ stockType: body.type });

      logger.info('Updating stock documents related to the updated material.');

      const startTime = Date.now();

      stockRelatedToMaterial.forEach(async (document) => {
        await Stock.updateOne(
          { _id: document._id },
          { stockValue: document.stockWeight * body.value }
        );
      });

      const endTime = Date.now();

      logger.success(
        'Finished updating stock documents related to the updated material.'
      );
      logger.info(
        `Operation took: ${new Date(endTime - startTime).getMilliseconds()}ms`
      );

      const materialData = await Material.findOne({ _id: body._id });

      return response.status(200).json({ data: { ...materialData.toJSON() } });
    } catch (error) {
      return response
        .status(200)
        .json({ message: 'Error while updating a material item.', error });
    }
  }
});

module.exports = router;
